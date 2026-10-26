// ============================================================
// MCP conformance test suite — gates the /mcp endpoint against
// the behavior promised by the Model Context Protocol spec
// (Streamable HTTP, stateless mode; JSON-RPC 2.0).
//
// Run: node tests/mcp-tests.js
//
// Covers: initialize handshake + version negotiation, notifications
// → 202, tools/list shape, tools/call round-trips through the shared
// core loop, expected-failure results (isError) vs protocol errors,
// unknown method/tool codes, parse/batch rejection, GET/DELETE
// 405s, auth middleware coverage, and rate limiting on /mcp.
// ============================================================

const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const TEST_HOME = path.join(os.tmpdir(), `nemons-mcp-${Date.now()}`);
process.env.NEMONS_HOME = TEST_HOME;
delete process.env.NEMONS_AUTH_TOKEN;
// default rate budget (60/min) — the dedicated hammer test at the end
// trips it; every other test stays well under.
delete process.env.NEMONS_RATE_MAX;

const { app } = require("../src/daemon/server");

let PASS = 0, FAIL = 0;
const ok = (msg) => { console.log(`  ✓ ${msg}`); PASS++; };
const bad = (msg, err) => { console.log(`  ✗ ${msg}${err ? ` — ${err.message}` : ""}`); FAIL++; };
async function test(name, fn) {
  try { await fn(); } catch (err) { bad(name, err); return; }
  ok(name);
}

let nextId = 1;
function rpc(method, params) {
  return { jsonrpc: "2.0", id: nextId++, method, params };
}
function rpcNotify(method, params) {
  return { jsonrpc: "2.0", method, params };
}

function post(body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = typeof body === "string" ? Buffer.from(body) : Buffer.from(JSON.stringify(body));
    const r = http.request(
      {
        host: "127.0.0.1", port: server.address().port, method: "POST", path: "/mcp",
        headers: { "content-type": "application/json", "content-length": data.length, ...headers },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(raw); } catch {}
          resolve({ status: res.statusCode, json, raw });
        });
      }
    );
    r.on("error", reject);
    r.write(data);
    r.end();
  });
}
function rawRequest(method, p, headers = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: server.address().port, method, path: p, headers }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => resolve({ status: res.statusCode, raw }));
    });
    r.on("error", reject);
    r.end();
  });
}

const server = app.listen(0, "127.0.0.1");

(async () => {
  await new Promise((r) => server.once("listening", r));
  fs.mkdirSync(TEST_HOME, { recursive: true });
  console.log("\n=== MCP: initialize handshake ===\n");

  let initResult = null;

  await test("initialize with 2025-11-25 negotiates that exact version", async () => {
    const res = await post(rpc("initialize", { protocolVersion: "2025-11-25", clientInfo: { name: "conformance-test", version: "1.0.0" } }));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.result.protocolVersion, "2025-11-25");
    assert.strictEqual(res.json.result.serverInfo.name, "nemons");
    assert.ok(res.json.result.capabilities.tools, "tools capability advertised");
    initResult = res.json.result;
  });

  await test("initialize with the older supported version is honored", async () => {
    const res = await post(rpc("initialize", { protocolVersion: "2025-06-18" }));
    assert.strictEqual(res.json.result.protocolVersion, "2025-06-18");
  });

  await test("initialize with an unknown version falls back to our latest", async () => {
    const res = await post(rpc("initialize", { protocolVersion: "1999-01-01" }));
    assert.strictEqual(res.json.result.protocolVersion, "2025-11-25");
  });

  await test("notifications/initialized is accepted with 202 and no body", async () => {
    const res = await post(rpcNotify("notifications/initialized"));
    assert.strictEqual(res.status, 202);
    assert.strictEqual(res.raw, "");
  });

  await test("ping answers an empty result", async () => {
    const res = await post(rpc("ping"));
    assert.deepStrictEqual(res.json.result, {});
  });

  console.log("\n=== MCP: tools/list ===\n");

  await test("tools/list exposes exactly the 7 declared Nemons tools", async () => {
    const res = await post(rpc("tools/list"));
    const names = res.json.result.tools.map((t) => t.name);
    assert.deepStrictEqual([...names].sort(), [
      "nemons.analyze_prompt",
      "nemons.collect_evidence",
      "nemons.evaluate_run",
      "nemons.get_context_pack",
      "nemons.health_check",
      "nemons.retrieve_similar_experiences",
      "nemons.store_experience",
    ]);
    for (const t of res.json.result.tools) {
      assert.strictEqual(t.inputSchema.type, "object", `${t.name} inputSchema must be an object schema`);
      assert.ok(t.description, `${t.name} must have a description`);
    }
  });

  console.log("\n=== MCP: tools/call through the shared core loop ===\n");

  await test("health_check returns healthy status and bridge state", async () => {
    const res = await post(rpc("tools/call", { name: "nemons.health_check", arguments: {} }));
    assert.strictEqual(res.json.result.isError, undefined);
    assert.strictEqual(res.json.result.structuredContent.status, "healthy");
    assert.strictEqual(typeof res.json.result.structuredContent.core_loaded, "boolean");
    assert.ok(Array.isArray(res.json.result.content) && res.json.result.content[0].type === "text");
  });

  await test("analyze_prompt intercepts an implementation prompt", async () => {
    const res = await post(rpc("tools/call", { name: "nemons.analyze_prompt", arguments: { prompt: "implement a hello world function" } }));
    assert.strictEqual(res.json.result.structuredContent.should_intercept, true);
    assert.ok(res.json.result.structuredContent.context_pack, "context pack must be present on intercept");
  });

  await test("analyze_prompt skips a definition question", async () => {
    const res = await post(rpc("tools/call", { name: "nemons.analyze_prompt", arguments: { prompt: "what is React?" } }));
    assert.strictEqual(res.json.result.structuredContent.should_intercept, false);
  });

  await test("collect_evidence → evaluate_run happy path returns pass:true", async () => {
    const ev = await post(rpc("tools/call", {
      name: "nemons.collect_evidence",
      arguments: { run_id: "mcp-run-1", evidence: { tests_pass: true, no_syntax_errors: true, no_security_violations: true, no_secrets_in_diff: true } },
    }));
    assert.strictEqual(ev.json.result.structuredContent.stored, true);
    const ev2 = await post(rpc("tools/call", {
      name: "nemons.evaluate_run",
      arguments: { run_id: "mcp-run-1", evidence: { tests_pass: true, no_syntax_errors: true, no_security_violations: true, no_secrets_in_diff: true } },
    }));
    assert.strictEqual(ev2.json.result.structuredContent.pass, true);
    assert.strictEqual(ev2.json.result.structuredContent.failures.length, 0);
  });

  await test("evaluate_run with failing evidence returns pass:false + failures", async () => {
    const res = await post(rpc("tools/call", {
      name: "nemons.evaluate_run",
      arguments: { run_id: "mcp-run-2", evidence: { tests_pass: false, no_syntax_errors: true } },
    }));
    assert.strictEqual(res.json.result.structuredContent.pass, false);
    assert.ok(res.json.result.structuredContent.failures.includes("constraint:tests_pass"));
  });

  await test("store_experience returns a generated id", async () => {
    const res = await post(rpc("tools/call", { name: "nemons.store_experience", arguments: { prompt: "mcp lesson" } }));
    assert.strictEqual(res.json.result.structuredContent.stored, true);
    assert.ok(res.json.result.structuredContent.id.startsWith("exp-"));
  });

  await test("retrieve_similar_experiences returns a results array", async () => {
    const res = await post(rpc("tools/call", { name: "nemons.retrieve_similar_experiences", arguments: { query: "test" } }));
    assert.ok(Array.isArray(res.json.result.structuredContent.results));
  });

  console.log("\n=== MCP: expected failures are isError RESULTS, not protocol errors ===\n");

  await test("collect_evidence with traversal run_id is rejected (schema -32602 or tool isError)", async () => {
    const res = await post(rpc("tools/call", { name: "nemons.collect_evidence", arguments: { run_id: "../../evil" } }));
    const rejectedAtSchema = res.json.error && res.json.error.code === -32602;
    const rejectedAtTool = res.json.result && res.json.result.isError === true;
    assert.ok(rejectedAtSchema || rejectedAtTool, "traversal run_id must be rejected");
  });

  await test("get_context_pack with traversal id is rejected (schema or tool level)", async () => {
    const res = await post(rpc("tools/call", { name: "nemons.get_context_pack", arguments: { id: "../../evil" } }));
    const rejectedAtSchema = res.json.error && res.json.error.code === -32602;
    const rejectedAtTool = res.json.result && res.json.result.isError === true;
    assert.ok(rejectedAtSchema || rejectedAtTool, "traversal id must be rejected");
  });

  console.log("\n=== MCP: protocol errors ===\n");

  await test("unknown tool → JSON-RPC error -32602", async () => {
    const res = await post(rpc("tools/call", { name: "nemons.does_not_exist", arguments: {} }));
    assert.strictEqual(res.json.error.code, -32602);
  });

  await test("missing required argument → -32602", async () => {
    const res = await post(rpc("tools/call", { name: "nemons.analyze_prompt", arguments: {} }));
    assert.strictEqual(res.json.error.code, -32602);
    assert.ok(/prompt/.test(res.json.error.message));
  });

  await test("wrong argument type → -32602", async () => {
    const res = await post(rpc("tools/call", { name: "nemons.analyze_prompt", arguments: { prompt: 42 } }));
    assert.strictEqual(res.json.error.code, -32602);
  });

  await test("unknown method with id → -32601", async () => {
    const res = await post(rpc("resources/list"));
    assert.strictEqual(res.json.error.code, -32601);
  });

  await test("malformed JSON body → 400 with -32700", async () => {
    const res = await post("{not json");
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.json.error.code, -32700);
  });

  await test("batched requests (removed from spec) → 400 with -32600", async () => {
    const res = await post([rpc("ping"), rpc("ping")]);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.json.error.code, -32600);
  });

  await test("non-JSON-RPC body → 400 with -32600", async () => {
    const res = await post({ hello: "world" });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.json.error.code, -32600);
  });

  console.log("\n=== MCP: transport surface ===\n");

  await test("GET /mcp → 405 (no server-initiated streams in stateless mode)", async () => {
    const res = await rawRequest("GET", "/mcp");
    assert.strictEqual(res.status, 405);
  });

  await test("DELETE /mcp → 405 (stateless — no sessions to terminate)", async () => {
    const res = await rawRequest("DELETE", "/mcp");
    assert.strictEqual(res.status, 405);
  });

  console.log("\n=== MCP: middleware coverage (auth + rate limit) ===\n");

  process.env.NEMONS_AUTH_TOKEN = "mcp-test-token-1234567890";
  await test("/mcp requires the bearer token like every other endpoint", async () => {
    const denied = await post(rpc("tools/list"));
    assert.strictEqual(denied.status, 401);
    const allowed = await post(rpc("tools/list"), { authorization: "Bearer mcp-test-token-1234567890" });
    assert.strictEqual(allowed.status, 200);
    assert.ok(allowed.json.result.tools.length > 0);
  });
  delete process.env.NEMONS_AUTH_TOKEN;

  await test("hammering /mcp trips the shared rate limiter (429)", async () => {
    let saw429 = false, saw200 = false;
    for (let i = 0; i < 70; i++) {
      const res = await post(rpc("ping"));
      if (res.status === 429) saw429 = true;
      if (res.status === 200) saw200 = true;
    }
    assert.ok(saw200, "early requests should pass");
    assert.ok(saw429, "limiter must eventually reject (default 60/min)");
  });

  server.close();
  try { fs.rmSync(TEST_HOME, { recursive: true, force: true }); } catch {}

  console.log("\n" + "=".repeat(60));
  console.log(`  ✓ Passed: ${PASS}`);
  console.log(`  ✗ Failed: ${FAIL}`);
  console.log("=".repeat(60));
  process.exit(FAIL > 0 ? 1 : 0);
})().catch((e) => {
  console.error("mcp-tests crashed:", e);
  process.exit(1);
});
