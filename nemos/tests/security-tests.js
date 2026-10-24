// ============================================================
// Security test suite — regression gate for the path-containment,
// auth and rate-limiting guarantees of the daemon.
//
// Run: node tests/security-tests.js
//
// Every test here exists because a real vulnerability existed:
//   - POST /evidence wrote attacker-controlled paths (run_id ".."-escape)
//   - GET /context-pack/:id read files outside NEMONS_HOME (..%2f)
//   - kanban/a2a endpoints interpolated body-supplied ids into filenames
//   - token compare was !== (timing-leaky)
//   - RateLimiter existed but was never wired, so no endpoint was limited
// If any of these tests fail, the vulnerability is back — block the release.
// ============================================================

const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const TEST_HOME = path.join(os.tmpdir(), `nemons-security-${Date.now()}`);
// Rate limit is configured at server-boot; keep the budget small so the
// hammering test can trip it. Every other endpoint in this suite stays
// under 6 requests, so only the dedicated hammer target gets limited.
process.env.NEMONS_HOME = TEST_HOME;
process.env.NEMONS_RATE_MAX = "6";
delete process.env.NEMONS_AUTH_TOKEN;

const { app } = require("../src/daemon/server");
const { isSafeId, resolveWithin } = require("../src/utils/path-guard");

let PASS = 0, FAIL = 0;
const ok = (msg) => { console.log(`  ✓ ${msg}`); PASS++; };
const bad = (msg, err) => { console.log(`  ✗ ${msg}${err ? ` — ${err.message}` : ""}`); FAIL++; };
async function test(name, fn) {
  try { await fn(); } catch (err) { bad(name, err); return; }
  ok(name);
}

// Raw HTTP request — fetch() normalizes some of the traversal
// encodings we explicitly want to send, so we speak HTTP by hand.
function req(method, urlPath, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const r = http.request(
      { host: "127.0.0.1", port: server.address().port, method, path: urlPath, headers: {
        ...(data ? { "content-type": "application/json", "content-length": data.length } : {}),
        ...headers,
      } },
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
    if (data) r.write(data);
    r.end();
  });
}

const server = app.listen(0, "127.0.0.1");

(async () => {
  await new Promise((r) => server.once("listening", r));
  fs.mkdirSync(TEST_HOME, { recursive: true });
  console.log("\n=== Path guard (unit) ===\n");

  await test("resolveWithin keeps a normal path inside base", () => {
    const p = resolveWithin(TEST_HOME, "evidence", "run-1.json");
    assert.strictEqual(p, path.resolve(TEST_HOME, "evidence", "run-1.json"));
  });

  await test("resolveWithin rejects ../ escape", () => {
    assert.strictEqual(resolveWithin(TEST_HOME, "evidence", "../../pwned.json"), null);
  });

  await test("resolveWithin rejects absolute path segments", () => {
    assert.strictEqual(resolveWithin(TEST_HOME, "evidence", os.platform() === "win32" ? "C:\\pwned.json" : "/pwned.json"), null);
  });

  await test("isSafeId accepts plain ids and rejects traversal/separators", () => {
    assert.strictEqual(isSafeId("run-1"), true);
    assert.strictEqual(isSafeId("abc_123.DEF-456"), true);
    assert.strictEqual(isSafeId("../../evil"), false);
    assert.strictEqual(isSafeId(".."), false);
    assert.strictEqual(isSafeId(".hidden"), false);
    assert.strictEqual(isSafeId("a/b"), false);
    assert.strictEqual(isSafeId("a\\b"), false);
    assert.strictEqual(isSafeId("a\0b"), false);
    assert.strictEqual(isSafeId(""), false);
    assert.strictEqual(isSafeId(42), false);
  });

  console.log("\n=== Endpoint path containment ===\n");

  await test("POST /evidence rejects traversal run_id and writes nothing outside home", async () => {
    const res = await req("POST", "/evidence", { body: { run_id: "../../pwned", evidence: { x: 1 } } });
    assert.strictEqual(res.status, 400, `expected 400, got ${res.status}`);
    const escaped = path.resolve(TEST_HOME, "..", "..", "pwned.json");
    assert.strictEqual(fs.existsSync(escaped), false, `escape file was created at ${escaped}`);
  });

  await test("POST /evidence rejects absolute run_id", async () => {
    const res = await req("POST", "/evidence", { body: { run_id: os.platform() === "win32" ? "C:\\pwned-abs" : "/pwned-abs", evidence: {} } });
    assert.strictEqual(res.status, 400, `expected 400, got ${res.status}`);
  });

  await test("POST /evidence still stores a valid run (no overblocking)", async () => {
    const res = await req("POST", "/evidence", { body: { run_id: "sec-valid-run", evidence: { tests_pass: true } } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.stored, true);
    assert.strictEqual(fs.existsSync(path.join(TEST_HOME, "evidence", "sec-valid-run.json")), true);
  });

  await test("GET /context-pack/..%2f..%2f… returns 400, not an outside file", async () => {
    // Encoded traversal that previously read arbitrary .yml files
    const res = await req("GET", "/context-pack/..%2f..%2fconfig%2Fdaemon");
    assert.strictEqual(res.status, 400, `expected 400, got ${res.status}`);
  });

  await test("GET /context-pack/<valid-id> still serves the default pack", async () => {
    const res = await req("GET", "/context-pack/default-pack");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.id, "default-pack");
  });

  await test("POST /kanban/create with traversal id is rejected by the module", async () => {
    const res = await req("POST", "/kanban/create", { body: { id: "../../evil", task: "pwn" } });
    assert.strictEqual(res.json.error, "invalid id");
    const escaped = path.resolve(TEST_HOME, "..", "..", "evil.json");
    assert.strictEqual(fs.existsSync(escaped), false);
  });

  await test("POST /kanban/create without id still works (generated id)", async () => {
    const res = await req("POST", "/kanban/create", { body: { task: "legit" } });
    assert.strictEqual(res.json.id.startsWith("worker-"), true, `unexpected id ${res.json.id}`);
  });

  await test("POST /kanban/:id/move with traversal id returns 400", async () => {
    const res = await req("POST", "/kanban/..%2f..%2fevil/move", { body: { state: "blocked" } });
    assert.strictEqual(res.status, 400);
  });

  await test("POST /a2a/register with traversal id is rejected by the module", async () => {
    const res = await req("POST", "/a2a/register", { body: { id: "../../evil", name: "pwn" } });
    assert.strictEqual(res.json.error, "invalid id");
  });

  await test("POST /a2a/:id/send with traversal id returns 400", async () => {
    const res = await req("POST", "/a2a/..%2f..%2fevil/send", { body: {} });
    assert.strictEqual(res.status, 400);
  });

  console.log("\n=== Auth (timing-safe token check) ===\n");

  process.env.NEMONS_AUTH_TOKEN = "sec-test-token-1234567890";

  await test("request without token is rejected 401", async () => {
    const res = await req("POST", "/analyze", { body: { prompt: "hello" } });
    assert.strictEqual(res.status, 401);
  });

  await test("request with wrong token is rejected 401", async () => {
    const res = await req("POST", "/analyze", { body: { prompt: "hello" }, headers: { authorization: "Bearer wrong-token" } });
    assert.strictEqual(res.status, 401);
  });

  await test("request with correct Bearer token passes", async () => {
    const res = await req("POST", "/analyze", { body: { prompt: "hello" }, headers: { authorization: "Bearer sec-test-token-1234567890" } });
    assert.notStrictEqual(res.status, 401, `got 401 with correct token: ${res.raw}`);
  });

  await test("X-Nemons-Token header is accepted as an alternative", async () => {
    const res = await req("POST", "/analyze", { body: { prompt: "hello" }, headers: { "x-nemons-token": "sec-test-token-1234567890" } });
    assert.notStrictEqual(res.status, 401, `got 401 via X-Nemons-Token: ${res.raw}`);
  });

  await test("/health stays token-exempt for install verification", async () => {
    const res = await req("GET", "/health");
    assert.strictEqual(res.status, 200);
  });

  delete process.env.NEMONS_AUTH_TOKEN;

  console.log("\n=== Rate limiting (wired middleware) ===\n");

  await test("hammering one endpoint trips the limiter with 429", async () => {
    // /a2a/stats is unused elsewhere in this suite; NEMONS_RATE_MAX=6
    const statuses = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await req("GET", "/a2a/stats")).status);
    }
    assert.strictEqual(statuses.filter((s) => s === 429).length > 0, true, `no 429 in ${statuses.join(",")}`);
    assert.strictEqual(statuses.filter((s) => s === 200).length >= 6, true, "legit early requests should still pass");
  });

  await test("rate limiter stats report tracked activity", async () => {
    const res = await req("GET", "/rate-limit/stats");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.tracked > 0, true, "shared instance should have tracked requests");
  });

  server.close();
  try { fs.rmSync(TEST_HOME, { recursive: true, force: true }); } catch {}

  console.log("\n" + "=".repeat(60));
  console.log(`  ✓ Passed: ${PASS}`);
  console.log(`  ✗ Failed: ${FAIL}`);
  console.log("=".repeat(60));
  process.exit(FAIL > 0 ? 1 : 0);
})().catch((e) => {
  console.error("security-tests crashed:", e);
  process.exit(1);
});
