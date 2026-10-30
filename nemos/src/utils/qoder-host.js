// ============================================================
// Qoder IDE host adapter — the registration surface Qoder ACTUALLY
// exposes, measured against Qoder IDE 1.37.0 (product.json:
// version 1.106.3, productVersion 1.37.0, build date 2026-10-26) on
// Windows, plus docs.qoder.com/user-guide/chat/model-context-protocol.
//
// What Qoder gives an external service (verified locally, not assumed):
//   1. User-level MCP config at ~/.qoder/mcp.json — one top-level
//      `mcpServers` object. This is the ONLY documented, supported place
//      a third party can register a server, and there is NO CLI for it
//      (the `qoder` binary in the IDE bin/ dir is the IDE launcher).
//   2. ~/.qoder/skills/<name>/SKILL.md and ~/.qoder/agents/<name>.md —
//      the prompt/instruction channels.
//
// Proof that ~/.qoder/mcp.json is the file the runtime reads (measured,
// not inferred from documentation): the runtime-derived registry at
// %APPDATA%/Qoder/SharedClientCache/extension/local/mcp.json stores
//   "userConfigMD5": "cac47f791ee55a02ac0d4ea8b5e62cef"
// and every entry carries "source": "user". md5(~/.qoder/mcp.json)
// equals that value byte-for-byte. The same file's `url: ""` +
// `command`/`args`/`env` shape also shows the remote fields we write must
// land in `url`, not `command`.
//
// Unlike Codex there is no `mcp list --json` and no `doctor`: the host
// offers NO command that echoes its own config back. So this module has
// two read-back levels and never conflates them —
//   configReadback  : re-parse the JSON we just wrote ("saved").
//   runtimeDiscovery: read the IDE's own published tool cache under
//                     %APPDATA%/Qoder/SharedClientCache/**/mcps/<name>/,
//                     which only the IDE writes ("connected + tool count").
// A successful write proves the FIRST state only. Per the IDE's own
// documentation, saved configuration, connection, authentication and tool
// availability in a live conversation are four different states.
// ============================================================

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const SERVER_NAME = "nemons";
const TOKEN_ENV_VAR = "NEMONS_AUTH_TOKEN";
const SKILL_NAME = "nemons-orchestrator";
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
// The transports Qoder documents for a remote entry: SSE and Streamable
// HTTP, with `http` as an alias of `streamable-http`.
const TRANSPORTS = new Set(["sse", "streamable-http", "http", "auto"]);

// ---------- Host location ----------
function qoderHome() {
  return process.env.QODER_HOME || path.join(os.homedir(), ".qoder");
}

function qoderConfigPath(home) {
  return path.join(home || qoderHome(), "mcp.json");
}

// The IDE's own tool cache. READ-ONLY from our side: it is the install's
// working area, and writing to it would fabricate the very evidence we
// are trying to collect.
function sharedClientCacheRoot() {
  const base = process.platform === "win32"
    ? process.env.APPDATA
    : path.join(os.homedir(), "Library", "Application Support");
  if (!base) return null;
  const root = path.join(base, "Qoder", "SharedClientCache");
  return fs.existsSync(root) ? root : null;
}

function mcpUrl(host, port) {
  const h = !host || host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  const clean = h.includes(":") && !h.startsWith("[") ? `[${h}]` : h;
  return `http://${clean}:${port}/mcp`;
}

// ---------- Installed version (read from the app itself) ----------
// Two products are commonly installed under the same name; the IDE is the
// one whose docs we are integrating against, so we report which we found.
function detectQoder() {
  const homes = process.platform === "win32"
    ? [
        { app: path.join(process.env.LOCALAPPDATA || "", "Programs", "Qoder IDE"), label: "Qoder IDE" },
        { app: path.join(process.env.LOCALAPPDATA || "", "Programs", "Qoder"), label: "Qoder (desktop)" },
      ]
    : [
        { app: "/Applications/Qoder.app", label: "Qoder IDE" },
        { app: path.join(os.homedir(), ".qoder"), label: "Qoder home" },
      ];
  for (const cand of homes) {
    if (!cand.app) continue;
    const pj = path.join(cand.app, "resources", "app", "product.json");
    try {
      const p = JSON.parse(fs.readFileSync(pj, "utf8"));
      return {
        available: true,
        label: cand.label,
        name: p.nameShort || p.nameLong || cand.label,
        version: p.productVersion || p.version || null,
        vscodeBaseVersion: p.version || null,
        buildDate: p.date || null,
        commit: p.commit ? String(p.commit).slice(0, 8) : null,
        productJson: pj,
      };
    } catch { /* not this one */ }
  }
  // No product.json, but a user config dir may still exist: we can write
  // config, we just cannot name the version.
  const home = qoderHome();
  return {
    available: fs.existsSync(home),
    label: fs.existsSync(home) ? "Qoder config home only" : null,
    version: null,
    productJson: null,
  };
}

// ---------- Daemon auth probe (same question Codex asks) ----------
function daemonAuthEnabled({ host = "127.0.0.1", port, timeoutMs = 1500 } = {}) {
  return new Promise((resolve) => {
    const req = http.request({ host, port, path: "/health", method: "GET", timeout: timeoutMs }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try { resolve(JSON.parse(raw).auth_enabled === true); } catch { resolve(null); }
      });
    });
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
    req.end();
  });
}

// ---------- mcp.json handling ----------
// The file is hand-edited by the IDE ("Open the JSON, close it, click
// Save") and by us. It holds other people's servers and credentials, so:
//   - a malformed or unexpected structure is a STOP, never a rewrite;
//   - unrelated entries and unknown fields are preserved verbatim;
//   - we only ever touch mcpServers[<name>].
function parseConfig(text) {
  if (!text || !text.trim()) return { ok: true, data: null, empty: true };
  let data;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (err) {
    return { ok: false, reason: `not valid JSON: ${err.message}` };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, reason: "top level is not a JSON object" };
  }
  if (data.mcpServers !== undefined) {
    if (typeof data.mcpServers !== "object" || data.mcpServers === null || Array.isArray(data.mcpServers)) {
      return { ok: false, reason: "`mcpServers` is not an object" };
    }
    for (const [k, v] of Object.entries(data.mcpServers)) {
      if (!k) return { ok: false, reason: "empty server name in mcpServers" };
      if (typeof v !== "object" || v === null || Array.isArray(v)) {
        return { ok: false, reason: `mcpServers.${k} is not an object` };
      }
    }
  }
  return { ok: true, data, empty: false };
}

// Respect the author's indentation rather than reformatting their file.
function detectIndent(text) {
  const m = /\n([ \t]+)"/.exec(text || "");
  if (m) return m[1];
  return 2;
}

function buildEntry({ url, type, headers } = {}) {
  if (!/^https?:\/\/\S+\/mcp$/.test(url)) throw new Error(`invalid MCP url: ${url}`);
  const entry = { url };
  // Docs: "for Streamable HTTP, configure the endpoint the same way as SSE and
  // Qoder IDE will automatically detect and use it". We still state the
  // transport we were built for, because a wrong guess is a silent failure:
  // our /mcp answers JSON to POST and 405 to GET, i.e. streamable HTTP only.
  if (type) {
    if (!TRANSPORTS.has(type)) throw new Error(`unsupported Qoder transport: ${type}`);
    entry.type = type;
  }
  if (headers && Object.keys(headers).length) {
    const clean = {};
    for (const [k, v] of Object.entries(headers)) {
      if (typeof v !== "string") throw new Error(`header ${k} must be a string value`);
      clean[k] = v;
    }
    entry.headers = clean;
  }
  return entry;
}

function upsertEntry(text, name, entry) {
  if (!NAME_RE.test(name)) throw new Error(`invalid MCP server name: ${name}`);
  const parsed = parseConfig(text);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const data = parsed.data || {};
  const before = JSON.stringify(data.mcpServers?.[name] || null);
  data.mcpServers = data.mcpServers || {};
  // Merge, never replace: an existing entry may carry fields the IDE added
  // (identifier, disabled, timeout). Only our own keys are overwritten.
  data.mcpServers[name] = { ...(data.mcpServers[name] || {}), ...entry };
  if (before === JSON.stringify(data.mcpServers[name])) {
    return { ok: true, changed: false, text, config: data };
  }
  const out = JSON.stringify(data, null, detectIndent(text)) + "\n";
  return { ok: true, changed: true, text: out, config: data };
}

function removeEntry(text, name) {
  const parsed = parseConfig(text || "");
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const data = parsed.data || {};
  if (!data.mcpServers || !(name in data.mcpServers)) return { ok: true, changed: false, text };
  delete data.mcpServers[name];
  return { ok: true, changed: true, text: JSON.stringify(data, null, detectIndent(text)) + "\n", config: data };
}

function readConfigServer(home, name = SERVER_NAME) {
  const file = qoderConfigPath(home);
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return { present: false, file, reason: "no user MCP config file" };
    return { present: false, file, reason: `unreadable: ${err.code}` };
  }
  const parsed = parseConfig(raw);
  if (!parsed.ok) return { present: false, file, reason: parsed.reason, raw };
  const server = parsed.data?.mcpServers?.[name];
  return { present: !!server, file, server: server || null, config: parsed.data, raw };
}

function writeConfigText(home, text) {
  const file = qoderConfigPath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // temp-file + rename: the IDE watches this file, and a half-written JSON
  // is a config the host cannot load.
  const tmp = `${file}.${process.pid}.nemons-tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, file);
  return file;
}

// ---------- Config read-back (state 1: "saved") ----------
function verifyRegistration({ home = qoderHome(), name = SERVER_NAME, expectedUrl } = {}) {
  const read = readConfigServer(home, name);
  if (!read.present) {
    return { registered: false, via: "mcp.json", source: read.file, listError: read.reason || "no entry", server: null };
  }
  const s = read.server;
  const url = typeof s.url === "string" && s.url ? s.url : null;
  const isStdio = !!s.command;
  return {
    registered: true,
    // Qoder has no `disabled` in the documented schema, but the runtime
    // registry uses one, so honour it if the IDE wrote it.
    enabled: s.disabled !== true,
    url,
    transport: s.type || (isStdio ? "stdio" : "auto (IDE detection)"),
    // Headers are stored verbatim; nothing here proves the host resolved them.
    auth_status: s.headers?.authorization ? "authorization header configured" : "none",
    url_matches: expectedUrl ? url === expectedUrl : null,
    via: "mcp.json",
    source: read.file,
    otherServers: Object.keys(read.config?.mcpServers || {}).filter((k) => k !== name),
    server: s,
  };
}

// ---------- Runtime discovery read-back (state 2/3: "connected") ----------
// %APPDATA%/Qoder/SharedClientCache/mcps/<name>/SERVER_METADATA.json is
// written by the IDE with { name, source, toolCount } plus one JSON file per
// tool schema. That is the closest thing Qoder offers to "the host loaded it"
// and it is NOT something we may write ourselves.
function readRuntimeDiscovery({ name = SERVER_NAME } = {}) {
  const root = sharedClientCacheRoot();
  if (!root) return { available: false, detail: "no SharedClientCache under the Qoder app-data dir" };
  const spots = [path.join(root, "mcps"), path.join(root, "projects")];
  const found = [];
  const collect = (dir) => {
    const metaPath = path.join(dir, "SERVER_METADATA.json");
    if (!fs.existsSync(metaPath)) return;
    let meta = null;
    try { meta = JSON.parse(fs.readFileSync(metaPath, "utf8")); } catch { meta = { parseError: true }; }
    let tools = [];
    try { tools = fs.readdirSync(path.join(dir, "tools")).filter((f) => f.endsWith(".json")); } catch {}
    found.push({ meta, toolFiles: tools, mtime: fs.statSync(dir).mtime });
  };
  collect(spots[0]);
  try {
    for (const proj of fs.readdirSync(spots[1])) collect(path.join(spots[1], proj, "mcps", name));
  } catch {}
  if (!found.length) {
    return { available: true, discovered: false, name, searched: [spots[0], `${spots[1]}/*/mcps`] };
  }
  const newest = found.reduce((a, b) => (b.mtime > a.mtime ? b : a));
  return {
    available: true,
    discovered: true,
    name,
    source: newest.meta.source || null,
    toolCount: newest.meta.toolCount ?? null,
    tools: newest.toolFiles.map((f) => f.replace(/\.json$/, "")),
    publishedAt: newest.mtime,
    instances: found.length,
  };
}

// ---------- Register / remove ----------
async function registerMcpServer({
  home = qoderHome(), url, name = SERVER_NAME, type = "streamable-http", headers = null,
} = {}) {
  if (!NAME_RE.test(name)) throw new Error(`invalid MCP server name: ${name}`);
  const entry = buildEntry({ url, type, headers });
  const attempts = [];

  const file = qoderConfigPath(home);
  let current = "";
  try {
    current = fs.readFileSync(file, "utf8");
    attempts.push({ method: "read-existing", ok: true, detail: file });
  } catch (err) {
    if (err.code !== "ENOENT") {
      attempts.push({ method: "read-existing", ok: false, detail: `${err.code} — refusing to overwrite an unreadable config` });
      return { ok: false, method: null, readback: null, attempts, aborted: true };
    }
    attempts.push({ method: "read-existing", ok: true, detail: "no config file yet — will create" });
  }

  const merged = upsertEntry(current, name, entry);
  if (!merged.ok) {
    // Malformed JSON or a structure we did not expect: stop, say so, write
    // nothing. "Fixing" someone's config by guessing is a silent mutation.
    attempts.push({ method: "merge", ok: false, detail: `${merged.reason} — NOTHING WRITTEN` });
    return { ok: false, method: null, readback: null, attempts, configPath: file };
  }
  attempts.push({ method: "merge", ok: true, detail: merged.changed ? `mcpServers.${name} written` : `mcpServers.${name} already matches (file untouched)` });

  if (merged.changed) writeConfigText(home, merged.text);

  // Read back from DISK, not from the object we built.
  const back = verifyRegistration({ home, name, expectedUrl: url });
  attempts.push({
    method: "config-readback",
    ok: back.registered && back.url_matches === true,
    detail: back.registered ? `${back.source} → ${back.url}` : `not present in ${back.source}`,
  });
  return {
    ok: back.registered && back.url_matches === true,
    method: "mcp.json",
    configPath: file,
    changed: merged.changed,
    readback: back,
    attempts,
    runtime: readRuntimeDiscovery({ name }),
  };
}

async function removeMcpServer({ home = qoderHome(), name = SERVER_NAME } = {}) {
  const file = qoderConfigPath(home);
  const notes = [];
  let current;
  try {
    current = fs.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return { ok: true, stillRegistered: false, notes: ["no user MCP config file"] };
    return { ok: false, stillRegistered: null, notes: [`config unreadable: ${err.code}`] };
  }
  const gone = removeEntry(current, name);
  if (!gone.ok) return { ok: false, stillRegistered: null, notes: [`refused to parse ${file}: ${gone.reason}`] };
  if (!gone.changed) notes.push("no nemons entry present (file untouched)");
  else {
    writeConfigText(home, gone.text);
    notes.push(`removed mcpServers.${name} from ${file}`);
  }
  const back = verifyRegistration({ home, name });
  if (back.otherServers && back.otherServers.length) {
    notes.push(`other servers still present: ${back.otherServers.join(", ")}`);
  }
  return { ok: !back.registered, stillRegistered: back.registered, notes };
}

// ---------- Prompt-level channel ----------
// Qoder discovers user skills at ~/.qoder/skills/<name>/SKILL.md with YAML
// front matter (name + description) — the same shape Codex uses. Existence
// is not discovery: the IDE documents that a file's presence does not prove
// the current conversation loaded it.
function installSkill({ home = qoderHome(), sourceFile, skillName = SKILL_NAME, daemonHost, daemonPort } = {}) {
  let body;
  try {
    body = fs.readFileSync(sourceFile, "utf8");
  } catch (err) {
    return { ok: false, detail: `source skill not readable: ${err.message}` };
  }
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body);
  if (!front) return { ok: false, detail: "skill file has no YAML front matter block" };
  if (!/^name:\s*\S+/m.test(front[1]) || !/^description:/m.test(front[1])) {
    return { ok: false, detail: "front matter missing required `name` / `description` keys for Qoder" };
  }

  let rewrites = 0;
  let installed = body;
  if (daemonPort) {
    const base = `http://${daemonHost || "127.0.0.1"}:${daemonPort}`;
    installed = body.replace(/http:\/\/(?:localhost|127\.0\.0\.1):3456/g, () => { rewrites++; return base; });
  }

  const dest = path.join(home, "skills", skillName, "SKILL.md");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, installed, "utf8");
  const back = fs.readFileSync(dest, "utf8");
  return {
    ok: back === installed,
    path: dest,
    rewrites,
    source: sourceFile,
    detail: back === installed ? `wrote and re-read ${path.basename(dest)}` : "read-back did not match input",
  };
}

function removeSkill({ home = qoderHome(), skillName = SKILL_NAME } = {}) {
  const dest = path.join(home, "skills", skillName);
  fs.rmSync(dest, { recursive: true, force: true });
  return { ok: !fs.existsSync(dest), path: dest };
}

function skillInstalled({ home = qoderHome(), skillName = SKILL_NAME } = {}) {
  const dest = path.join(home, "skills", skillName, "SKILL.md");
  try {
    return { installed: fs.readFileSync(dest, "utf8").includes(`name: ${skillName}`), path: dest };
  } catch {
    return { installed: false, path: dest };
  }
}

module.exports = {
  SERVER_NAME,
  TOKEN_ENV_VAR,
  SKILL_NAME,
  qoderHome,
  qoderConfigPath,
  sharedClientCacheRoot,
  mcpUrl,
  detectQoder,
  daemonAuthEnabled,
  parseConfig,
  buildEntry,
  upsertEntry,
  removeEntry,
  readConfigServer,
  verifyRegistration,
  readRuntimeDiscovery,
  registerMcpServer,
  removeMcpServer,
  installSkill,
  removeSkill,
  skillInstalled,
};
