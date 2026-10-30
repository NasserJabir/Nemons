// ============================================================
// Codex CLI host adapter — the registration surface Codex ACTUALLY
// exposes, measured against codex-cli 0.149.1 on Windows + Linux.
//
// Codex has no plugin directory. `~/.codex/plugins/` is never read;
// the extension points are:
//   1. mcp_servers in $CODEX_HOME/config.toml  (the tool channel)
//   2. $CODEX_HOME/skills/<name>/SKILL.md      (the prompt channel)
//   3. AGENTS.md                               (free-text instructions)
//
// CLI contract (from `codex mcp add --help`, 0.149.1):
//   codex mcp add <NAME> --url <URL> [--bearer-token-env-var <ENV>]
//   codex mcp add <NAME> -- <COMMAND>...            (stdio variant)
//   codex mcp list --json
//   codex mcp get <NAME>     — prints config; does NOT probe the server
//   codex mcp remove <NAME>
// Re-adding an existing name overwrites it and exits 0 (idempotent).
// Result written to config.toml:
//   [mcp_servers.nemons]
//   url = "http://127.0.0.1:3456/mcp"
//   bearer_token_env_var = "NEMONS_AUTH_TOKEN"
//
// Honesty rule for this module: no function reports success from the
// exit code alone. Every install path writes, then reads the host's own
// view back, and the caller reports what the read-back showed.
// ============================================================

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const SERVER_NAME = "nemons";
const TOKEN_ENV_VAR = "NEMONS_AUTH_TOKEN";
const SKILL_NAME = "nemons-orchestrator";
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const IS_WINDOWS = process.platform === "win32";

// ---------- Host location ----------
function codexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function codexConfigPath(home) {
  return path.join(home || codexHome(), "config.toml");
}

// Measured: `codex mcp add` aborts with "failed to load configuration — 
// CODEX_HOME points to ..., but that path does not exist" when the home is
// missing, so a fresh isolated home has to exist before the CLI runs.
function ensureCodexHome(home) {
  fs.mkdirSync(home, { recursive: true });
  return home;
}

function mcpUrl(host, port) {
  // Codex connects as any other HTTP client; localhost is fine but 127.0.0.1
  // avoids the ::1-first resolution surprise on Windows.
  const h = !host || host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  const clean = h.includes(":") && !h.startsWith("[") ? `[${h}]` : h;
  return `http://${clean}:${port}/mcp`;
}

// ---------- CLI invocation ----------
// `codex` is installed by npm as codex.cmd on Windows, so spawnSync cannot
// exec it directly (ENOENT). POSIX gets the argv array; Windows gets one
// pre-quoted command string through the shell, which avoids both the ENOENT
// and the DEP0190 "args + shell" footgun.
function quoteWinArg(arg) {
  return `"${String(arg).replace(/"/g, '\\"')}"`;
}

function runCodex(args, { home, timeout } = {}) {
  const env = { ...process.env };
  if (home) env.CODEX_HOME = home;
  const opts = { encoding: "utf8", env, maxBuffer: 8 * 1024 * 1024 };
  if (timeout) opts.timeout = timeout;
  if (IS_WINDOWS) {
    const cmd = ["codex", ...args.map(quoteWinArg)].join(" ");
    const r = spawnSync(cmd, { ...opts, shell: true });
    return { ok: r.status === 0, status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
  }
  const r = spawnSync("codex", args, opts);
  if (r.error && r.error.code === "ENOENT") {
    return { ok: false, status: null, stdout: "", stderr: "codex not found on PATH" };
  }
  return { ok: r.status === 0, status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function detectCodex() {
  const r = runCodex(["--version"]);
  if (!r.ok) return { available: false, version: null };
  const version = (r.stdout || "").trim() || null;
  return { available: !!version, version };
}

// ---------- Daemon auth probe ----------
// Measured: `codex doctor` runs its own mcp.config check and reports
// "MCP configuration has optional issues / Set the missing MCP env vars"
// whenever a bearer_token_env_var names a variable that is not set. So the
// token is only wired in when the daemon really demands one — ask /health.
function daemonAuthEnabled({ host = "127.0.0.1", port, timeoutMs = 1500 } = {}) {
  return new Promise((resolve) => {
    const req = http.request({ host, port, path: "/health", method: "GET", timeout: timeoutMs }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(raw).auth_enabled === true);
        } catch {
          resolve(null); // reachable but not the daemon we expect
        }
      });
    });
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
    req.end();
  });
}

// ---------- config.toml handling (fallback + read-back) ----------
// Kept line-oriented on purpose: the user's config.toml holds profiles,
// model_providers and trust entries we must not reformat, and the daemon
// ships no TOML dependency. Only the [mcp_servers.<name>] block and its
// subsections are touched.

function splitSections(text) {
  const lines = text.split(/\r?\n/);
  const preamble = [];
  const sections = []; // { header, order, lines }
  let current = null;
  for (const line of lines) {
    const m = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (m) {
      current = { header: m[1], lines: [line] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  return { preamble, sections };
}

function isOwnOrChild(header, name) {
  return header === `mcp_servers.${name}` || header.startsWith(`mcp_servers.${name}.`);
}

function readMcpBlock(text, name) {
  const { sections } = splitSections(text || "");
  const found = sections.find((s) => s.header === `mcp_servers.${name}`);
  if (!found) return null;
  const out = {};
  for (const line of found.lines.slice(1)) {
    const m = /^\s*([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}

function upsertMcpBlock(text, { name, url, bearerTokenEnvVar }) {
  if (!NAME_RE.test(name)) throw new Error(`invalid MCP server name: ${name}`);
  const block = [
    `[mcp_servers.${name}]`,
    `url = "${url}"`,
    bearerTokenEnvVar ? `bearer_token_env_var = "${bearerTokenEnvVar}"` : null,
  ].filter(Boolean).join("\n");

  const existing = text || "";
  if (!existing.trim()) return { text: `${block}\n`, changed: true };

  const { preamble, sections } = splitSections(existing);
  const body = [];
  let placed = false;
  for (const section of sections) {
    if (isOwnOrChild(section.header, name)) {
      // Rewrite the block once, where the author put it, and drop any stale
      // [mcp_servers.<name>.*] subsections left behind by the old entry.
      if (!placed) { body.push(block); placed = true; }
      continue;
    }
    body.push(section.lines.join("\n"));
  }
  if (!placed) body.push(block);

  // Blank lines between blocks are normalised to one; no key is reordered,
  // renamed or dropped. Callers skip writing entirely when the block already
  // matches (see writeTomlServer), so a correct config.toml is never touched.
  const chunks = [preamble.join("\n"), ...body].map((c) => c.replace(/\s+$/, "")).filter((c) => c !== "");
  return { text: chunks.join("\n\n") + "\n", changed: chunks.join("\n\n") + "\n" !== existing };
}

function removeMcpBlock(text, name) {
  const { preamble, sections } = splitSections(text || "");
  const kept = sections.filter((s) => !isOwnOrChild(s.header, name));
  if (kept.length === sections.length) return { text, changed: false };
  const chunks = [preamble.join("\n"), ...kept.map((s) => s.lines.join("\n"))]
    .map((c) => c.replace(/\s+$/, "")).filter((c) => c !== "");
  return { text: chunks.join("\n\n") + "\n", changed: chunks.join("\n\n") + "\n" !== text };
}

function readTomlServer(home, name = SERVER_NAME) {
  try {
    return readMcpBlock(fs.readFileSync(codexConfigPath(home), "utf8"), name);
  } catch {
    return null;
  }
}

function writeTomlServer(home, entry) {
  const configPath = codexConfigPath(home);
  let current = "";
  try {
    current = fs.readFileSync(configPath, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  // Already registered with this exact url/token? Leave the file byte-for-byte
  // alone rather than normalising whitespace in someone's config on a no-op run.
  const wanted = { url: entry.url };
  if (entry.bearerTokenEnvVar) wanted.bearer_token_env_var = entry.bearerTokenEnvVar;
  const present = readMcpBlock(current, entry.name);
  if (present && Object.keys(wanted).every((k) => present[k] === wanted[k])) {
    return { configPath, changed: false, skipped: "block already matches" };
  }
  const { text, changed } = upsertMcpBlock(current, entry);
  if (changed) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, text, "utf8");
  }
  return { configPath, changed };
}

// ---------- Host-level read-back ----------
// Prefer the CLI, because that is the view Codex resolves at run time
// (profiles and -c overrides included). Fall back to the file only when
// the CLI is absent, and say which one answered.
function listMcpServers(home) {
  const r = runCodex(["mcp", "list", "--json"], { home });
  if (!r.ok) return { source: null, servers: [], error: (r.stderr || r.stdout || "").trim() };
  try {
    return { source: "cli", servers: JSON.parse(r.stdout) };
  } catch (err) {
    return { source: null, servers: [], error: `unparseable codex mcp list --json: ${err.message}` };
  }
}

function verifyRegistration({ home = codexHome(), name = SERVER_NAME, expectedUrl } = {}) {
  const { source, servers, error } = listMcpServers(home);
  let server = null;
  let via = source;
  if (source === "cli") {
    server = servers.find((s) => s && s.name === name) || null;
  } else {
    const block = readTomlServer(home, name);
    if (block) {
      server = {
        name,
        enabled: true,
        transport: { type: block.type === "command" ? "stdio" : "streamable_http", url: block.url },
        auth_status: block.bearer_token_env_var ? "bearer_token" : "none",
      };
      via = "toml";
    }
  }
  if (!server) {
    return { registered: false, via, source: codexConfigPath(home), listError: error || null, server: null };
  }
  const url = server.transport?.url || null;
  return {
    registered: true,
    enabled: server.enabled !== false,
    transport: server.transport?.type || null,
    url,
    auth_status: server.auth_status || null,
    url_matches: expectedUrl ? url === expectedUrl : null,
    via,
    source: codexConfigPath(home),
    server,
  };
}

// ---------- Host diagnosis ----------
// `codex doctor` runs the host's OWN mcp.config check. Measured on 0.149.1:
//   status "ok"      "MCP configuration is locally consistent"
//   status "warning" "… optional issues" + "Set the missing MCP env vars"
// when a bearer_token_env_var names an unset variable. That is the closest
// thing to the host saying "I would load this server", so install reports it.
// Takes a few seconds (doctor also checks updates and reachability), hence
// opt-in rather than part of every `plugin list`.
function hostDiagnosis({ home = codexHome(), timeout = 30000 } = {}) {
  const r = runCodex(["doctor", "--json"], { home, timeout });
  if (!r.stdout.trim()) {
    return { available: false, detail: (r.stderr || "no output").trim().split("\n")[0] };
  }
  let report;
  try {
    report = JSON.parse(r.stdout.replace(/^\uFEFF/, ""));
  } catch (err) {
    return { available: false, detail: `unparseable doctor report: ${err.message}` };
  }
  const mcp = report.checks && report.checks["mcp.config"];
  if (!mcp) return { available: false, detail: "doctor report has no mcp.config check" };
  return {
    available: true,
    overall: report.overallStatus || null,
    status: mcp.status,
    summary: mcp.summary,
    configured: mcp.details?.["configured servers"] ?? null,
    transports: Object.entries(mcp.details || {})
      .filter(([k]) => /servers$/i.test(k) && k !== "configured servers" && k !== "disabled servers")
      .map(([k, v]) => `${v} ${k.replace(/ servers$/, "")}`),
    remediation: mcp.remediation || null,
  };
}

// ---------- Install / remove ----------
async function registerMcpServer({ home = codexHome(), url, name = SERVER_NAME, bearerTokenEnvVar = null } = {}) {
  if (!NAME_RE.test(name)) throw new Error(`invalid MCP server name: ${name}`);
  if (!/^https?:\/\/\S+\/mcp$/.test(url)) throw new Error(`invalid MCP url: ${url}`);

  const entry = { name, url, bearerTokenEnvVar };
  const cli = detectCodex();
  const attempts = [];

  if (cli.available) {
    ensureCodexHome(home);
    const addArgs = ["mcp", "add", name, "--url", url];
    if (bearerTokenEnvVar) addArgs.push("--bearer-token-env-var", bearerTokenEnvVar);
    const add = runCodex(addArgs, { home });
    attempts.push({ method: "cli-add", ok: add.ok, detail: (add.stderr || add.stdout).trim() });
    const back = verifyRegistration({ home, name, expectedUrl: url });
    if (back.registered && back.url_matches === true) {
      return { ok: true, method: "cli", version: cli.version, readback: back, attempts };
    }
    attempts.push({
      method: "cli-readback",
      ok: false,
      detail: back.registered ? `registered url ${back.url} != ${url}` : `not visible in \`codex mcp list --json\` (${back.listError || "no entry"})`,
    });
  } else {
    attempts.push({ method: "cli-add", ok: false, detail: "codex CLI not on PATH" });
  }

  // Fallback path: edit config.toml the way the CLI would, then read the file back.
  let written;
  try {
    written = writeTomlServer(home, entry);
  } catch (err) {
    attempts.push({ method: "toml-write", ok: false, detail: err.message });
    return { ok: false, method: null, version: cli.version || null, readback: null, attempts };
  }
  const back = verifyRegistration({ home, name, expectedUrl: url });
  attempts.push({ method: "toml-write", ok: true, detail: `${written.configPath}${written.changed ? "" : " (unchanged)"}` });
  return {
    ok: back.registered && back.url_matches === true,
    method: "toml",
    version: cli.version || null,
    configPath: written.configPath,
    readback: back,
    attempts,
  };
}

async function removeMcpServer({ home = codexHome(), name = SERVER_NAME } = {}) {
  const cli = detectCodex();
  const removed = [];
  if (cli.available) {
    const r = runCodex(["mcp", "remove", name], { home });
    removed.push(`codex mcp remove ${name}: ${r.ok ? "ok" : (r.stderr || r.stdout).trim()}`);
  }
  try {
    const configPath = codexConfigPath(home);
    const current = fs.readFileSync(configPath, "utf8");
    const { text, changed } = removeMcpBlock(current, name);
    if (changed) fs.writeFileSync(configPath, text, "utf8");
    removed.push(`config.toml: ${changed ? "block removed" : "no block present"}`);
  } catch (err) {
    if (err.code !== "ENOENT") removed.push(`config.toml: ${err.message}`);
  }
  const back = verifyRegistration({ home, name });
  return { ok: !back.registered, stillRegistered: back.registered, notes: removed };
}

// ---------- Prompt-level channel ----------
// Codex discovers skills as $CODEX_HOME/skills/<name>/SKILL.md with YAML
// front matter (name + description) — same shape as the repo's
// config/skills/nemons-orchestrator.md.
//
// The installed copy is rewritten to point at the daemon we actually found,
// because a skill telling the model to call port 3456 while the daemon listens
// elsewhere is a silent failure waiting to happen. The rewrite is counted and
// reported by the caller — the repo's own file is never touched.
function installSkill({ home = codexHome(), sourceFile, skillName = SKILL_NAME, daemonHost, daemonPort } = {}) {
  let body;
  try {
    body = fs.readFileSync(sourceFile, "utf8");
  } catch (err) {
    return { ok: false, detail: `source skill not readable: ${err.message}` };
  }
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body);
  if (!front) return { ok: false, detail: "skill file has no YAML front matter block" };
  if (!/^name:\s*\S+/m.test(front[1]) || !/^description:/m.test(front[1])) {
    return { ok: false, detail: "front matter missing required `name` / `description` keys for Codex" };
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
    detail: back === installed
      ? `wrote and re-read ${path.basename(dest)}`
      : "read-back did not match input",
  };
}

function removeSkill({ home = codexHome(), skillName = SKILL_NAME } = {}) {
  const dest = path.join(home, "skills", skillName);
  fs.rmSync(dest, { recursive: true, force: true });
  return { ok: !fs.existsSync(dest), path: dest };
}

function skillInstalled({ home = codexHome(), skillName = SKILL_NAME } = {}) {
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
  codexHome,
  codexConfigPath,
  ensureCodexHome,
  mcpUrl,
  detectCodex,
  daemonAuthEnabled,
  hostDiagnosis,
  runCodex,
  listMcpServers,
  verifyRegistration,
  registerMcpServer,
  removeMcpServer,
  installSkill,
  removeSkill,
  skillInstalled,
  // exported for tests — pure text transforms
  upsertMcpBlock,
  removeMcpBlock,
  readMcpBlock,
};
