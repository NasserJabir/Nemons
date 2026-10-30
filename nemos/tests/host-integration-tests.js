// ============================================================
// Host integration test suite — Codex CLI + Qoder IDE.
//
// What this gates:
//   1. config.toml merging is correct and leaves unrelated config alone.
//   2. The URL we hand a host really serves MCP (full streamable-HTTP
//      session: initialize → initialized → tools/list → tools/call).
//   3. Bearer wiring follows the DAEMON's auth state, not a guess.
//   4. Against a real codex binary (skipped when absent), in an isolated
//      CODEX_HOME: registration is confirmed by `codex mcp list --json`
//      AND by the host's own `codex doctor` mcp.config check; removal is
//      confirmed too; a hand-written fallback block is loaded by the host.
//   5. Qoder IDE has NO CLI read-back, so its gates are different: the
//      mcp.json merge must preserve foreign servers, secrets, and the
//      author's formatting; a malformed file must be refused, never
//      rewritten; the isolated install must be re-parsed from disk; and the
//      tool names we publish must be read back out of the host's OWN tool
//      cache — never asserted from our own list.
//
// It does NOT claim either host ran a model turn with our tools — that needs
// a live IDE session and model credentials, neither of which exists in a
// test run. Real model-driven invocation is validated separately against a
// running Qoder IDE (see WORKLOG "Qoder real-host validation").
//
// TOPOLOGY NOTE (learned the hard way, 0.149.1): the daemon must run in a
// SEPARATE process. `codex mcp list` computes auth_status by probing the
// endpoint, and our CLI calls go through spawnSync, which blocks this event
// loop — an in-process daemon cannot answer, the host reports
// auth_status "unknown", and `codex doctor` flags a misleading
// "Set the missing MCP env vars" warning.
//
// Run: node tests/host-integration-tests.js
// ============================================================

const assert = require("assert");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const BIN_PATH = path.join(__dirname, "..", "bin", "nemons.js");
const STAMP = Date.now();
const NEMONS_HOME = path.join(os.tmpdir(), `nemons-host-${STAMP}`);
const CODEX_HOME = path.join(os.tmpdir(), `nemons-codex-${STAMP}`);
const QODER_HOME = path.join(os.tmpdir(), `nemons-qoder-${STAMP}`);

// Never inherit a developer's live config into a host test.
delete process.env.NEMONS_AUTH_TOKEN;
delete process.env.NEMONS_RATE_MAX;
delete process.env.CODEX_HOME;
delete process.env.QODER_HOME;

const codexHost = require("../src/utils/codex-host");
const qoderHost = require("../src/utils/qoder-host");

let PASS = 0, FAIL = 0, SKIP = 0;
const DAEMON_PORTS = [];
const ok = (msg) => { console.log(`  ✓ ${msg}`); PASS++; };
const bad = (msg, err) => { console.log(`  ✗ ${msg}${err ? ` — ${err.message}` : ""}`); FAIL++; };
const skip = (msg) => { console.log(`  ⚠ SKIPPED: ${msg}`); SKIP++; };
async function test(name, fn) {
  try {
    await fn();
  } catch (err) {
    // A gate that depends on software this machine does not have reports
    // itself as skipped, never as passed.
    if (err && err.skipReason) { skip(`${name} — ${err.skipReason}`); return; }
    bad(name, err);
    return;
  }
  ok(name);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pickFreePort() {
  const net = require("net");
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

function startDaemon({ port, token }) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, NEMONS_HOME, NEMONS_PORT: String(port) };
    if (token) env.NEMONS_AUTH_TOKEN = token;
    const child = spawn(process.execPath, [BIN_PATH, "daemon", "start"], { env, stdio: "pipe" });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("error", reject);
    (async () => {
      for (let i = 0; i < 60; i++) {
        await sleep(250);
        try {
          const res = await getJson(`http://127.0.0.1:${port}/health`);
          if (res.status === 200) return resolve(res.json);
        } catch {}
      }
      reject(new Error(`daemon never became healthy on ${port}\n${output}`));
    })();
  });
}

function stopDaemon(port) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN_PATH, "daemon", "stop"], {
      env: { ...process.env, NEMONS_HOME, NEMONS_PORT: String(port) }, stdio: "pipe",
    });
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
}

function request(port, { method = "POST", path: p = "/mcp", body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    const req = http.request({
      host: "127.0.0.1", port, method, path: p,
      headers: { "content-type": "application/json", ...(data ? { "content-length": data.length } : {}), ...headers },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => { let json = null; try { json = JSON.parse(raw); } catch {} resolve({ status: res.statusCode, json, raw }); });
    });
    req.on("error", reject);
    req.end(data);
  });
}

function getJson(url) {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: "GET" }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => { try { resolve({ status: res.statusCode, json: JSON.parse(raw) }); } catch (err) { reject(err); } });
    });
    req.on("error", reject);
    req.end();
  });
}

let nextId = 1;
const call = (method, params) => ({ jsonrpc: "2.0", id: nextId++, method, params });
const notify = (method, params) => ({ jsonrpc: "2.0", method, params });

async function run() {
  fs.mkdirSync(NEMONS_HOME, { recursive: true });
  fs.mkdirSync(path.join(NEMONS_HOME, "config"), { recursive: true });

  const port = await pickFreePort();
  DAEMON_PORTS.push(port);
  const health = await startDaemon({ port });
  console.log(`\nSetup: daemon pid healthy on ${port} (core_loaded=${health.core_loaded}, auth_enabled=${health.auth_enabled})\n`);
  const url = codexHost.mcpUrl("127.0.0.1", port);
  const post = (body, headers) => request(port, { body, headers });
  const cli = codexHost.detectCodex();
  const QODER = qoderHost.detectQoder();

  // ============================================================
  console.log("=== config.toml merge (pure, no host needed) ===\n");
  const SAMPLE = [
    'model = "gpt-5"',
    "",
    "[profiles.work]",
    'model = "o3"',
    "",
    "[mcp_servers.other]",
    'command = "npx"',
    "",
  ].join("\n");
  const ENTRY = { name: "nemons", url: "http://127.0.0.1:3456/mcp", bearerTokenEnvVar: "NEMONS_AUTH_TOKEN" };

  await test("inserts the block without disturbing other sections", async () => {
    const { text } = codexHost.upsertMcpBlock(SAMPLE, ENTRY);
    assert.strictEqual(codexHost.readMcpBlock(text, "nemons").url, ENTRY.url);
    for (const keep of ['model = "gpt-5"', "[profiles.work]", 'command = "npx"']) {
      assert.ok(text.includes(keep), `lost ${keep}`);
    }
  });

  await test("re-adding the same entry does not change the file", async () => {
    const once = codexHost.upsertMcpBlock(SAMPLE, ENTRY).text;
    assert.strictEqual(codexHost.upsertMcpBlock(once, ENTRY).changed, false);
  });

  await test("moving the port leaves exactly one [mcp_servers.nemons] block", async () => {
    const once = codexHost.upsertMcpBlock(SAMPLE, ENTRY).text;
    const moved = codexHost.upsertMcpBlock(once, { ...ENTRY, url: "http://127.0.0.1:4000/mcp" }).text;
    assert.strictEqual(moved.match(/\[mcp_servers\.nemons\]/g).length, 1);
    assert.strictEqual(codexHost.readMcpBlock(moved, "nemons").url, "http://127.0.0.1:4000/mcp");
    assert.ok(!moved.includes("3456"), "old url still present");
  });

  await test("removing nemons keeps every unrelated server", async () => {
    const withOurs = codexHost.upsertMcpBlock(SAMPLE, ENTRY).text;
    const { text } = codexHost.removeMcpBlock(withOurs, "nemons");
    assert.strictEqual(codexHost.readMcpBlock(text, "nemons"), null);
    assert.ok(codexHost.readMcpBlock(text, "other"), "[mcp_servers.other] was dropped");
  });

  await test("rejects a name that could inject TOML or shell", async () => {
    assert.throws(() => codexHost.upsertMcpBlock("", { name: 'a"]; url = "x', url: "http://x/mcp" }), /invalid MCP server name/);
    await assert.rejects(() => codexHost.registerMcpServer({ url: "http://x/notmcp" }), /invalid MCP url/);
  });

  // ============================================================
  console.log("\n=== the URL we register really serves MCP ===\n");

  await test("initialize negotiates a protocol version at the registered url", async () => {
    const res = await post(call("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "codex-host-integration", version: "test" },
    }));
    assert.strictEqual(res.status, 200, `http ${res.status}`);
    assert.strictEqual(res.json.result.protocolVersion, "2025-06-18");
    assert.ok(res.json.result.serverInfo.name, "no serverInfo.name");
    assert.ok(res.json.result.capabilities.tools, "server did not advertise the tools capability");
  });

  await test("notifications/initialized is accepted with 202 and no body", async () => {
    const res = await post(notify("notifications/initialized", {}));
    assert.strictEqual(res.status, 202);
    assert.strictEqual(res.raw, "");
  });

  await test("tools/list returns schema-bearing tools", async () => {
    const res = await post(call("tools/list", {}));
    const tools = res.json.result.tools;
    assert.ok(Array.isArray(tools) && tools.length >= 7, `only ${tools && tools.length} tools`);
    for (const t of tools) {
      assert.ok(t.name && t.description, `${t.name}: missing name/description`);
      assert.strictEqual(t.inputSchema.type, "object", `${t.name}: inputSchema must be an object schema`);
    }
    assert.ok(tools.some((t) => t.name === "nemons.health_check"), "health_check tool missing");
  });

  await test("tools/call agrees with the HTTP API the same daemon serves", async () => {
    const res = await post(call("tools/call", { name: "nemons.health_check", arguments: {} }));
    assert.strictEqual(res.status, 200);
    assert.notStrictEqual(res.json.result.isError, true, res.json.result.content?.[0]?.text);
    const viaMcp = JSON.parse(res.json.result.content[0].text);
    const direct = (await getJson(`http://127.0.0.1:${port}/health`)).json;
    assert.strictEqual(viaMcp.version, direct.version, "MCP and /health disagree on version");
    assert.strictEqual(viaMcp.core_loaded, direct.core_loaded, "MCP and /health disagree on core_loaded");
  });

  // ============================================================
  console.log("\n=== bearer wiring follows the daemon, not a guess ===\n");

  await test("an open daemon reports auth_enabled false and demands no token", async () => {
    assert.strictEqual(await codexHost.daemonAuthEnabled({ host: "127.0.0.1", port }), false);
  });

  await test("a daemon that is not there reports null instead of claiming open", async () => {
    assert.strictEqual(await codexHost.daemonAuthEnabled({ host: "127.0.0.1", port: await pickFreePort() }), null);
  });

  // ============================================================
  console.log(`\n=== real host: ${cli.available ? cli.version : "codex not installed"} ===\n`);
  if (!cli.available) {
    skip("codex CLI not on PATH — read-back and codex doctor assertions did not run");
  } else {
    fs.mkdirSync(CODEX_HOME, { recursive: true });

    await test("codex mcp add is confirmed by codex mcp list --json", async () => {
      const reg = await codexHost.registerMcpServer({ home: CODEX_HOME, url });
      assert.ok(reg.ok, `registration failed: ${JSON.stringify(reg.attempts)}`);
      assert.strictEqual(reg.method, "cli", `fell back to ${reg.method}: ${JSON.stringify(reg.attempts)}`);
      assert.strictEqual(reg.readback.via, "cli");
      assert.strictEqual(reg.readback.url, url);
      assert.strictEqual(reg.readback.transport, "streamable_http");
      assert.strictEqual(reg.readback.enabled, true);
      // "unknown" would mean the host could not reach the endpoint we registered.
      assert.notStrictEqual(reg.readback.auth_status, "unknown", "host could not reach the registered endpoint");
    });

    await test("the host writes the block Codex itself will load", async () => {
      const toml = fs.readFileSync(codexHost.codexConfigPath(CODEX_HOME), "utf8");
      assert.strictEqual(codexHost.readMcpBlock(toml, "nemons").url, url, "config.toml does not carry our url");
      assert.ok(!toml.includes("bearer_token_env_var"), "an open daemon must not get a bearer var");
    });

    await test("codex doctor's own mcp.config check passes for the registered server", async () => {
      const dx = codexHost.hostDiagnosis({ home: CODEX_HOME });
      assert.ok(dx.available, `doctor unusable: ${dx.detail}`);
      assert.strictEqual(dx.status, "ok", `${dx.status}: ${dx.summary} / ${dx.remediation}`);
      assert.strictEqual(dx.configured, "1", `host sees ${dx.configured} servers`);
    });

    await test("a bearer var the host cannot resolve is reported by the host as a warning", async () => {
      // Why install wires the token only when the daemon demands one.
      const reg = await codexHost.registerMcpServer({ home: CODEX_HOME, url, bearerTokenEnvVar: "NEMONS_TOKEN_NOT_IN_ENV" });
      assert.ok(reg.ok, JSON.stringify(reg.attempts));
      const dx = codexHost.hostDiagnosis({ home: CODEX_HOME });
      assert.strictEqual(dx.status, "warning", `expected a warning, got ${dx.status}`);
      await codexHost.registerMcpServer({ home: CODEX_HOME, url });
    });

    await test("a hand-written fallback block is loaded by the real host", async () => {
      const home = path.join(os.tmpdir(), `nemons-codex-fb-${Date.now()}`);
      fs.mkdirSync(home, { recursive: true });
      const { text } = codexHost.upsertMcpBlock("", { name: "nemons", url, bearerTokenEnvVar: undefined });
      fs.writeFileSync(path.join(home, "config.toml"), text, "utf8");
      const view = codexHost.verifyRegistration({ home, expectedUrl: url });
      assert.ok(view.registered, "the host did not load our hand-written block");
      assert.strictEqual(view.via, "cli", "read-back did not go through the host");
      assert.strictEqual(view.url, url);
      assert.strictEqual(view.transport, "streamable_http");
      fs.rmSync(home, { recursive: true, force: true });
    });

    await test("re-registering on a new port repoints the host, no duplicate entry", async () => {
      const other = codexHost.mcpUrl("127.0.0.1", await pickFreePort());
      const reg = await codexHost.registerMcpServer({ home: CODEX_HOME, url: other });
      assert.ok(reg.ok, JSON.stringify(reg.attempts));
      const listed = codexHost.listMcpServers(CODEX_HOME).servers.filter((s) => s.name === "nemons");
      assert.strictEqual(listed.length, 1, `host lists ${listed.length} nemons entries`);
      assert.strictEqual(listed[0].transport.url, other);
      await codexHost.registerMcpServer({ home: CODEX_HOME, url });
    });

    await test("remove is confirmed by read-back, not assumed", async () => {
      const gone = await codexHost.removeMcpServer({ home: CODEX_HOME });
      assert.ok(gone.ok, `still registered after remove: ${JSON.stringify(gone.notes)}`);
      assert.strictEqual(codexHost.verifyRegistration({ home: CODEX_HOME }).registered, false);
    });

    await test("the skill lands where Codex looks for skills, with readable front matter", async () => {
      const src = path.join(__dirname, "..", "..", "config", "skills", "nemons-orchestrator.md");
      const sk = codexHost.installSkill({ home: CODEX_HOME, sourceFile: src });
      assert.ok(sk.ok, sk.detail);
      assert.ok(sk.path.endsWith(path.join("skills", "nemons-orchestrator", "SKILL.md")));
      assert.strictEqual(codexHost.skillInstalled({ home: CODEX_HOME }).installed, true);
      assert.ok(codexHost.removeSkill({ home: CODEX_HOME }).ok);
    });
  }

  // ============================================================
  // Qoder IDE: no CLI, so every assertion is either a pure text transform,
  // a disk read-back, or the host's own published cache. Nothing here
  // touches the developer's real ~/.qoder.
  console.log("\n=== Qoder mcp.json merge (pure, no host needed) ===\n");

  // Shaped like the file on a real machine: a foreign stdio server holding a
  // secret, an unrelated top-level key, and 4-space indentation.
  const QSAMPLE = [
    "{",
    "    \"mcpServers\": {",
    "        \"other\": {",
    "            \"command\": \"npx\",",
    "            \"args\": [\"@some/server\"],",
    "            \"env\": { \"API_KEY\": \"sk-keepme-12345\" }",
    "        }",
    "    },",
    "    \"unrelated\": true",
    "}",
    "",
  ].join("\n");
  const QENTRY = { url: "http://127.0.0.1:3456/mcp", type: "streamable-http" };

  await test("adds mcpServers.nemons without disturbing the foreign server or the secret", async () => {
    const { text } = qoderHost.upsertEntry(QSAMPLE, "nemons", QENTRY);
    const back = JSON.parse(text);
    assert.strictEqual(back.mcpServers.nemons.url, QENTRY.url);
    assert.strictEqual(back.mcpServers.nemons.type, "streamable-http");
    assert.strictEqual(back.mcpServers.other.env.API_KEY, "sk-keepme-12345", "credential was dropped");
    assert.strictEqual(back.unrelated, true, "unrelated top-level key was lost");
    assert.ok(text.includes('    "mcpServers"'), "indentation was reformatted");
  });

  await test("re-adding the same entry leaves the file untouched", async () => {
    const once = qoderHost.upsertEntry(QSAMPLE, "nemons", QENTRY).text;
    const twice = qoderHost.upsertEntry(once, "nemons", QENTRY);
    assert.strictEqual(twice.changed, false);
    assert.strictEqual(twice.text, once);
  });

  await test("moving the daemon port repoints the url, no duplicate key", async () => {
    const once = qoderHost.upsertEntry(QSAMPLE, "nemons", QENTRY).text;
    const moved = qoderHost.upsertEntry(once, "nemons", { ...QENTRY, url: "http://127.0.0.1:4000/mcp" }).text;
    const back = JSON.parse(moved);
    assert.strictEqual(Object.keys(back.mcpServers).length, 2);
    assert.strictEqual(back.mcpServers.nemons.url, "http://127.0.0.1:4000/mcp");
    assert.ok(!moved.includes("3456"), "stale url still present");
  });

  await test("merging into an existing entry keeps fields we never set", async () => {
    // The IDE itself writes identifier / timeout into its runtime registry;
    // if they ever land in the user file we must not erase them.
    const withHostFields = JSON.stringify({
      mcpServers: { nemons: { url: "http://127.0.0.1:3456/mcp", identifier: "abc", timeout: 30 } },
    }, null, 2);
    const merged = qoderHost.upsertEntry(withHostFields, "nemons", { url: "http://127.0.0.1:4000/mcp" });
    const back = JSON.parse(merged.text).mcpServers.nemons;
    assert.strictEqual(back.identifier, "abc");
    assert.strictEqual(back.timeout, 30);
    assert.strictEqual(back.url, "http://127.0.0.1:4000/mcp");
  });

  await test("removing nemons keeps every unrelated server", async () => {
    const withOurs = qoderHost.upsertEntry(QSAMPLE, "nemons", QENTRY).text;
    const { text } = qoderHost.removeEntry(withOurs, "nemons");
    const back = JSON.parse(text);
    assert.strictEqual(back.mcpServers.nemons, undefined);
    assert.ok(back.mcpServers.other, "foreign server was dropped");
    assert.strictEqual(back.unrelated, true);
  });

  await test("a transport Qoder does not accept is refused before anything is written", async () => {
    assert.throws(() => qoderHost.buildEntry({ url: "http://x/mcp", type: "grpc" }), /unsupported Qoder transport/);
    assert.throws(() => qoderHost.buildEntry({ url: "http://x/notmcp" }), /invalid MCP url/);
    assert.throws(() => qoderHost.buildEntry({ url: "http://x/mcp", headers: { authorization: 42 } }), /must be a string/);
  });

  await test("malformed config is refused and left byte-for-byte alone", async () => {
    const home = path.join(os.tmpdir(), `nemons-qoder-bad-${Date.now()}`);
    fs.mkdirSync(home, { recursive: true });
    const file = qoderHost.qoderConfigPath(home);
    const broken = '{ "mcpServers": { , }';
    fs.writeFileSync(file, broken, "utf8");
    const reg = await qoderHost.registerMcpServer({ home, url: "http://127.0.0.1:3456/mcp" });
    assert.strictEqual(reg.ok, false, "registration claimed success over a broken config");
    assert.strictEqual(fs.readFileSync(file, "utf8"), broken, "the broken file was overwritten");
    assert.ok(reg.attempts.some((a) => a.method === "merge" && !a.ok && /NOTHING WRITTEN/.test(a.detail)),
      `refusal was not reported: ${JSON.stringify(reg.attempts)}`);
    // and the read-back says the same thing instead of inventing an entry
    assert.strictEqual(qoderHost.verifyRegistration({ home }).registered, false);
    fs.rmSync(home, { recursive: true, force: true });
  });

  await test("an unreadable-but-present config aborts instead of replacing it", async () => {
    // Fresh isolated home: registerMcpServer must create it, and must never
    // treat "I wrote the file" as "the host loaded it".
    const home = path.join(os.tmpdir(), `nemons-qoder-fresh-${Date.now()}`);
    const reg = await qoderHost.registerMcpServer({ home, url: qoderHost.mcpUrl("127.0.0.1", port) });
    assert.ok(reg.ok, JSON.stringify(reg.attempts));
    assert.strictEqual(reg.changed, true, "first write into a fresh home should change the file");
    assert.strictEqual(reg.readback.otherServers.length, 0);
    // A url that nothing serves is still "saved": the adapter must not
    // imply it checked reachability.
    assert.strictEqual(reg.runtime.discovered, false, "our own write must not look like host discovery");
    await qoderHost.removeMcpServer({ home });
    fs.rmSync(home, { recursive: true, force: true });
  });

  await test("the shared cache we read for discovery is never written by us", async () => {
    const rt = qoderHost.readRuntimeDiscovery({ name: "nemons" });
    if (!rt.available) { ok("no SharedClientCache on this machine — discovery reported unavailable"); return; }
    assert.strictEqual(rt.discovered, false, `"nemons" appeared in the host tool cache without a live IDE: ${JSON.stringify(rt)}`);
    assert.ok(Array.isArray(rt.searched) && rt.searched.length === 2, `search scope not reported: ${JSON.stringify(rt.searched)}`);
  });

  // If the developer's real IDE happens to have loaded nemons, the cache is
  // the host's own words — compare against those, not against our list.
  const liveRt = qoderHost.readRuntimeDiscovery({ name: "nemons" });
  const realHome = qoderHost.qoderHome();
  console.log(`\n=== real host: ${QODER.productJson ? `${QODER.label} ${QODER.version} (build ${QODER.buildDate || "?"})` : "no Qoder product.json found"} ===\n`);

  await test("the installed IDE version and the config path are read from disk, not assumed", async () => {
    // Host-independent half: the path the driver writes must be the path the
    // documentation names, whatever is installed.
    assert.strictEqual(qoderHost.qoderConfigPath(realHome), path.join(realHome, "mcp.json"));
    if (!QODER.productJson) {
      // CI runners have no Qoder install, and a machine can have the config
      // home without the app. Either way the version is unreadable, so this
      // half reports unverified instead of passing on an assumption — and
      // without failing a host it cannot see.
      throw Object.assign(new Error("SKIP"), { skipReason: `no Qoder product.json on this machine (home ${realHome}) — installed version could not be read` });
    }
    assert.ok(/^\d+\.\d+\.\d+$/.test(QODER.version || ""), `unparseable productVersion: ${QODER.version}`);
    assert.ok(fs.existsSync(QODER.productJson), `product.json missing: ${QODER.productJson}`);
    const read = qoderHost.readConfigServer(realHome);
    // Read-only probe of the developer's live file: it must parse, or the
    // adapter would refuse to touch it (asserted above for the broken case).
    if (read.present || read.reason) {
      assert.ok(!/not valid JSON|not an object/.test(read.reason || ""),
        `live user config is not loadable: ${read.reason}`);
    }
  });

  await test("tool names are cross-checked against the host's own published schemas", async () => {
    // Proof by construction: the cache is written by the IDE, one JSON file
    // per tool, and it enumerates what the model actually gets to see.
    const cacheRoot = qoderHost.sharedClientCacheRoot();
    if (!cacheRoot) return skip("no SharedClientCache — host-published tool names could not be read");
    const spot = path.join(cacheRoot, "mcps", "TestSprite");
    if (!fs.existsSync(spot)) return skip("the cache holds no reference server — nothing to cross-check");
    const meta = JSON.parse(fs.readFileSync(path.join(spot, "SERVER_METADATA.json"), "utf8"));
    const files = fs.readdirSync(path.join(spot, "tools")).filter((f) => f.endsWith(".json"));
    assert.strictEqual(meta.toolCount, files.length, `cache says ${meta.toolCount}, ${files.length} schema files`);
    for (const f of files) {
      const t = JSON.parse(fs.readFileSync(path.join(spot, "tools", f), "utf8"));
      assert.strictEqual(`${t.name}.json`, f, `published tool name does not match its file: ${t.name} vs ${f}`);
      assert.ok(t.inputSchema, `${t.name}: no inputSchema published to the model`);
    }
    // nemons, once the IDE really has it loaded: same shape or it is a bug.
    if (liveRt.discovered) {
      const listed = (await request(port, { body: call("tools/list", {}) })).json.result.tools.map((t) => t.name);
      assert.deepStrictEqual([...liveRt.tools].sort(), listed.map((n) => n).sort(),
        `host published ${liveRt.tools.join(",")} but /mcp lists ${listed.join(",")}`);
    } else {
      console.log("     (nemons not in the host cache yet — identity check deferred to the live IDE run)");
    }
  });

  // ============================================================
  console.log("\n=== isolated Qoder home: nemons plugin install via the real CLI ===\n");

  const runCli = (args, env) => new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN_PATH, ...args], {
      env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });

  await test("install into --home writes a config the host can load, and reports only the saved state", async () => {
    fs.rmSync(QODER_HOME, { recursive: true, force: true });
    fs.mkdirSync(QODER_HOME, { recursive: true });
    fs.writeFileSync(qoderHost.qoderConfigPath(QODER_HOME), QSAMPLE, "utf8");
    const r = await runCli(["plugin", "install", "--agent", "qoder",
      "--home", QODER_HOME, "--port", String(port), "--no-doctor"], { NEMONS_HOME, QODER_HOME });
    assert.strictEqual(r.code, 0, `exit ${r.code}\n${r.stdout}\n${r.stderr}`);
    const cfg = JSON.parse(fs.readFileSync(qoderHost.qoderConfigPath(QODER_HOME), "utf8"));
    assert.strictEqual(cfg.mcpServers.nemons.url, `http://127.0.0.1:${port}/mcp`);
    assert.strictEqual(cfg.mcpServers.nemons.type, "streamable-http");
    assert.strictEqual(cfg.mcpServers.other.env.API_KEY, "sk-keepme-12345", "install destroyed a foreign credential");
    assert.ok(/read back from mcp\.json/.test(r.stdout), `install did not label its own evidence level:\n${r.stdout}`);
    assert.ok(/does NOT list "nemons"/.test(r.stdout), `install claimed host discovery from a file write:\n${r.stdout}`);
    assert.ok(!/✓ connected|connection established|server is reachable/i.test(r.stdout),
      `install asserted a connection it never made:\n${r.stdout}`);
    assert.ok(/Which state this run proved: "saved"/.test(r.stdout),
      `install did not name the state it actually reached:\n${r.stdout}`);
  });

  await test("the skill lands where Qoder looks for skills, with readable front matter", async () => {
    const skPath = path.join(QODER_HOME, "skills", "nemons-orchestrator", "SKILL.md");
    assert.ok(fs.existsSync(skPath), `${skPath} was not written`);
    assert.strictEqual(qoderHost.skillInstalled({ home: QODER_HOME }).installed, true);
    const body = fs.readFileSync(skPath, "utf8");
    assert.ok(body.includes(`http://127.0.0.1:${port}`), "skill still points at the default port");
    assert.ok(/MCP tools/.test(body), "skill does not name the MCP tool channel");
  });

  await test("plugin list reads the file back and does not claim a live connection", async () => {
    const r = await runCli(["plugin", "list", "--home", QODER_HOME, "--port", String(port)], { NEMONS_HOME, QODER_HOME });
    assert.strictEqual(r.code, 0, r.stderr);
    assert.ok(/Qoder\s+✓ registered/.test(r.stdout), `row missing:\n${r.stdout}`);
    const row = /Qoder .*/.exec(r.stdout)[0];
    assert.ok(/not a live connection/.test(row), `state was overstated:\n${row}`);
    assert.ok(/skill: present/.test(row), `skill state missing:\n${row}`);
  });

  await test("a second install is a no-op and a port move leaves one entry", async () => {
    const before = fs.readFileSync(qoderHost.qoderConfigPath(QODER_HOME), "utf8");
    const again = await runCli(["plugin", "install", "--agent", "qoder", "--home", QODER_HOME,
      "--port", String(port), "--no-doctor"], { NEMONS_HOME, QODER_HOME });
    assert.strictEqual(again.code, 0, again.stderr);
    assert.strictEqual(fs.readFileSync(qoderHost.qoderConfigPath(QODER_HOME), "utf8"), before, "no-op run rewrote the file");
    const other = await pickFreePort();
    await runCli(["plugin", "install", "--agent", "qoder", "--home", QODER_HOME, "--port", String(other), "--no-doctor"], { NEMONS_HOME, QODER_HOME });
    const cfg = JSON.parse(fs.readFileSync(qoderHost.qoderConfigPath(QODER_HOME), "utf8"));
    assert.strictEqual(Object.keys(cfg.mcpServers).length, 2, `duplicate entries: ${Object.keys(cfg.mcpServers)}`);
    assert.strictEqual(cfg.mcpServers.nemons.url, `http://127.0.0.1:${other}/mcp`);
  });

  await test("remove deletes only our entry and is confirmed by re-reading", async () => {
    const r = await runCli(["plugin", "remove", "--agent", "qoder", "--home", QODER_HOME], { NEMONS_HOME, QODER_HOME });
    assert.strictEqual(r.code, 0, `${r.stdout}\n${r.stderr}`);
    const cfg = JSON.parse(fs.readFileSync(qoderHost.qoderConfigPath(QODER_HOME), "utf8"));
    assert.strictEqual(cfg.mcpServers.nemons, undefined);
    assert.ok(cfg.mcpServers.other, "removal took the foreign server with it");
    assert.ok(/confirmed by re-reading/.test(r.stdout), r.stdout);
    assert.strictEqual(qoderHost.skillInstalled({ home: QODER_HOME }).installed, false, "skill survived remove");
  });

  // ============================================================
  // What a host actually hits when it is misconfigured or retries. These run
  // against the OPEN daemon, which is what a local Qoder IDE connects to.
  console.log("\n=== connection and retry behaviour of the registered url ===\n");

  const deadPort = await pickFreePort();
  await test("a registered url whose daemon is gone fails at connect time, not at save time", async () => {
    const home = path.join(os.tmpdir(), `nemons-qoder-dead-${Date.now()}`);
    const reg = await qoderHost.registerMcpServer({ home, url: qoderHost.mcpUrl("127.0.0.1", deadPort) });
    assert.ok(reg.ok, "saving a config should not depend on reachability");
    assert.strictEqual(reg.readback.url_matches, true);
    assert.strictEqual(await qoderHost.daemonAuthEnabled({ host: "127.0.0.1", port: deadPort }), null,
      "an unreachable daemon must not be reported as open");
    await assert.rejects(() => request(deadPort, { body: call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } }) }),
      /ECONNREFUSED/);
    await qoderHost.removeMcpServer({ home });
    fs.rmSync(home, { recursive: true, force: true });
  });

  await test("GET /mcp is refused with 405, so an SSE-first client fails loudly", async () => {
    const res = await new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, method: "GET", path: "/mcp", headers: { accept: "text/event-stream" } }, (r) => {
        let raw = "";
        r.on("data", (c) => (raw += c));
        r.on("end", () => resolve({ status: r.statusCode, raw }));
      });
      req.on("error", reject);
      req.end();
    });
    assert.strictEqual(res.status, 405, `GET /mcp returned ${res.status}`);
    assert.ok(/method_not_allowed/.test(res.raw), res.raw);
  });

  await test("a retried tool call is idempotent: last write wins, no duplicate record", async () => {
    const runId = `retry-${STAMP}`;
    const body = { run_id: runId, evidence: { attempt: 1, tests_pass: true } };
    const first = await request(port, { body: call("tools/call", { name: "nemons.collect_evidence", arguments: body }) });
    const retry = await request(port, { body: call("tools/call", { name: "nemons.collect_evidence", arguments: { run_id: runId, evidence: { attempt: 2, tests_pass: true } } }) });
    assert.strictEqual(first.status, 200, first.raw);
    assert.notStrictEqual(first.json.result.isError, true, `first write was a tool error: ${first.raw}`);
    assert.strictEqual(retry.status, 200, retry.raw);
    const file = path.join(NEMONS_HOME, "evidence", `${runId}.json`);
    const stored = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.strictEqual(stored.attempt, 2, "evidence is not keyed by run_id — retries accumulate records");
    const siblings = fs.readdirSync(path.join(NEMONS_HOME, "evidence")).filter((f) => f.startsWith(`retry-${STAMP}`));
    assert.strictEqual(siblings.length, 1, `retries wrote ${siblings.length} files: ${siblings.join(", ")}`);
  });

  await test("a duplicate request id is answered twice — the client, not the daemon, owns dedup", async () => {
    // Recorded as a limitation, not a bug fix: MCP has no idempotency key, so
    // if the host retries a timed-out POST the tool runs again. Evidence writes
    // are keyed by run_id (test above), which is what bounds the damage.
    const dup = { jsonrpc: "2.0", id: 999, method: "ping", params: {} };
    const a = await request(port, { body: dup });
    const b = await request(port, { body: dup });
    assert.deepStrictEqual(a.json.result, {});
    assert.strictEqual(b.json.id, 999);
    assert.deepStrictEqual(b.json, a.json, "same id + same method must give the same answer");
  });

  // Without a per-message record, "the host invoked the tool" and "our test
  // script invoked the tool" are indistinguishable after the fact.
  await test("each MCP message is recorded with host metadata and never with its body", async () => {
    const probeRun = `probe-${STAMP}`;
    const res = await request(port, {
      body: call("tools/call", { name: "nemons.collect_evidence", arguments: { run_id: probeRun, evidence: { note: "BODY_MUST_NOT_LEAK_INTO_ACCESS_LOG" } } }),
      headers: { "user-agent": "qoder-ide-probe/1.37.0" },
    });
    assert.strictEqual(res.status, 200, res.raw);
    const file = path.join(NEMONS_HOME, "logs", "mcp-access.log");
    assert.ok(fs.existsSync(file), "no mcp-access.log — a host call could not be told apart from a test call");
    const lines = fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const mine = lines.filter((l) => l.tool === "nemons.collect_evidence" && l.user_agent === "qoder-ide-probe/1.37.0");
    assert.strictEqual(mine.length, 1, `expected one probe line, got ${mine.length}`);
    assert.strictEqual(mine[0].outcome, "ok", JSON.stringify(mine[0]));
    assert.ok(mine[0].source_ip, `no source captured: ${JSON.stringify(mine[0])}`);
    assert.ok(typeof mine[0].duration_ms === "number");
    assert.ok(!/BODY_MUST_NOT_LEAK_INTO_ACCESS_LOG/.test(fs.readFileSync(file, "utf8")),
      "the request body was written into the access log");
    fs.rmSync(path.join(NEMONS_HOME, "evidence", `${probeRun}.json`), { force: true });
  });

  await test("an unknown tool is refused with -32602 and recorded as rpc_error", async () => {
    const res = await request(port, { body: call("tools/call", { name: "nemons.not_a_tool", arguments: {} }) });
    assert.strictEqual(res.status, 200, "a protocol error is still a valid JSON-RPC answer");
    assert.strictEqual(res.json.error.code, -32602, JSON.stringify(res.json));
    const lines = fs.readFileSync(path.join(NEMONS_HOME, "logs", "mcp-access.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const recorded = lines.filter((l) => l.tool === "nemons.not_a_tool");
    assert.strictEqual(recorded.length, 1);
    assert.strictEqual(recorded[0].outcome, "rpc_error");
    assert.strictEqual(recorded[0].rpc_error_code, -32602);
  });

  // ============================================================
  // A daemon that demands a token: the adapter must notice, not guess.
  console.log("\n=== auth-enabled daemon ===\n");
  await stopDaemon(port);
  const securePort = await pickFreePort();
  DAEMON_PORTS.push(securePort);
  const TOKEN = "host-integration-token";
  await startDaemon({ port: securePort, token: TOKEN });
  const secureUrl = codexHost.mcpUrl("127.0.0.1", securePort);

  await test("the daemon reports it now requires a token", async () => {
    assert.strictEqual(await codexHost.daemonAuthEnabled({ host: "127.0.0.1", port: securePort }), true);
    assert.strictEqual((await getJson(secureUrl.replace("/mcp", "/health"))).json.auth_enabled, true);
  });

  await test("/mcp rejects an anonymous JSON-RPC call and accepts the bearer header", async () => {
    const init = call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } });
    const anon = await request(securePort, { body: init });
    assert.strictEqual(anon.status, 401, "unauthenticated /mcp was not rejected");
    const authed = await request(securePort, { body: call("ping", {}), headers: { authorization: `Bearer ${TOKEN}` } });
    assert.strictEqual(authed.status, 200, "bearer token was not accepted");
  });

  if (cli.available) {
    await test("a token-protected daemon gets the bearer var wired into the host", async () => {
      const home = path.join(os.tmpdir(), `nemons-codex-auth-${Date.now()}`);
      // NEMONS_AUTH_TOKEN is intentionally NOT in this process's environment,
      // so the host's read-back must show it configured but unresolvable.
      const reg = await codexHost.registerMcpServer({ home, url: secureUrl, bearerTokenEnvVar: codexHost.TOKEN_ENV_VAR });
      assert.ok(reg.ok, JSON.stringify(reg.attempts));
      assert.strictEqual(reg.readback.auth_status, "bearer_token", `host reported ${reg.readback.auth_status}`);
      const toml = fs.readFileSync(codexHost.codexConfigPath(home), "utf8");
      assert.strictEqual(codexHost.readMcpBlock(toml, "nemons").bearer_token_env_var, codexHost.TOKEN_ENV_VAR);
      await codexHost.removeMcpServer({ home });
      fs.rmSync(home, { recursive: true, force: true });
    });
  } else {
    skip("codex CLI absent — bearer registration against the host was not exercised");
  }

  // Qoder has no env-var reference in mcp.json, so a token-protected daemon
  // cannot be wired without writing a secret into a file the IDE reads. The
  // adapter must refuse rather than "make integration succeed".
  await test("install against a token-protected daemon refuses instead of writing a plaintext secret", async () => {
    const home = path.join(os.tmpdir(), `nemons-qoder-auth-${Date.now()}`);
    fs.mkdirSync(home, { recursive: true });
    const r = await runCli(["plugin", "install", "--agent", "qoder", "--home", home,
      "--port", String(securePort), "--no-doctor"], { NEMONS_HOME, QODER_HOME: home });
    assert.notStrictEqual(r.code, 0, "install reported success against a daemon it cannot authenticate to");
    assert.ok(/no documented way to/.test(r.stderr + r.stdout), `refusal not explained:\n${r.stdout}${r.stderr}`);
    assert.ok(!new RegExp(TOKEN).test(r.stdout + r.stderr), "the token value was printed");
    const file = qoderHost.qoderConfigPath(home);
    assert.ok(!fs.existsSync(file) || !new RegExp(TOKEN).test(fs.readFileSync(file, "utf8")),
      "a plaintext secret was written into the host config");
    fs.rmSync(home, { recursive: true, force: true });
  });

  await stopDaemon(securePort);
}

(async () => {
  let code = 1;
  try {
    await run();
    code = FAIL > 0 ? 1 : 0;
  } catch (err) {
    console.error("host integration crashed:", err);
    code = 1;
  } finally {
    // Teardown must run even on a throw, or an orphan daemon holds the port.
    for (const p of DAEMON_PORTS) { await stopDaemon(p).catch(() => {}); }
    for (const p of [NEMONS_HOME, CODEX_HOME, QODER_HOME]) {
      try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
    }
  }
  console.log("\n" + "=".repeat(60));
  console.log(`  ✓ Passed:  ${PASS}`);
  console.log(`  ✗ Failed:  ${FAIL}`);
  console.log(`  ⚠ Skipped: ${SKIP}`);
  console.log("=".repeat(60));
  process.exit(code);
})();
