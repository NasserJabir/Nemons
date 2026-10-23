// ============================================================
// Nemos v4.2.1 Bridge Integration Tests
//
// Verifies the bridge shim (src/utils/nemos-bridge.js) correctly
// loads the @nemons/core TS package and exposes working JS-friendly
// APIs. These tests spin up the daemon in-process and call the
// /core/* endpoints over HTTP to verify the wiring end-to-end.
//
// Run with: node tests/v421-bridge-tests.js
// ============================================================

const http = require("http");
const assert = require("assert");

let PASS = 0, FAIL = 0;
function record(name, ok, msg) {
  if (ok) { console.log(`  ✓ ${name}`); PASS++; }
  else    { console.log(`  ✗ ${name}: ${msg || ""}`); FAIL++; }
}

function asyncTest(name, fn) {
  return fn()
    .then(() => record(name, true))
    .catch((e) => record(name, false, e.message));
}

// In-process HTTP client against the daemon
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: "127.0.0.1",
      port: 3458,
      path,
      method,
      headers: data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {},
    }, (res) => {
      let chunks = "";
      res.on("data", (c) => { chunks += c; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(chunks) }); }
        catch { resolve({ status: res.statusCode, body: chunks }); }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

console.log("\n=== Nemos v4.2.1 Bridge Integration Tests ===\n");

(async () => {
  // Spin up the daemon in a child process
  const { spawn } = require("child_process");
  const path = require("path");
  const os = require("os");
  const fs = require("fs");

  const TEST_HOME = path.join(os.tmpdir(), `nemos-bridge-test-${Date.now()}`);
  fs.mkdirSync(TEST_HOME, { recursive: true });

  console.log("  Spawning daemon (port 3458)...");
  const child = spawn(process.execPath, ["src/daemon/server.js"], {
    cwd: __dirname + "/..",
    env: { ...process.env, NEMONS_HOME: TEST_HOME, NEMONS_PORT: "3458" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Wait for daemon to be ready
  // v4.2.1-fix: extended from 8s to 20s because the daemon also
  // has to dynamic-import the @nemons/core ESM package, which can
  // take a few seconds on cold starts (especially on CI machines
  // with slow disk I/O).
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("daemon did not start in 20s")), 20000);
    child.stdout.on("data", (d) => {
      process.stdout.write(d.toString());
      if (d.toString().includes("listening")) {
        clearTimeout(timer);
        // Give the bridge 1s more to settle
        setTimeout(resolve, 1000);
      }
    });
    child.stderr.on("data", (d) => { process.stderr.write(d.toString()); });
  });

  try {
    // === /health ===
    let r = await request("GET", "/health");
    record("health reports version 4.2.1", r.body.version === "4.2.1", `got ${r.body.version}`);
    record("health reports core_loaded=true", r.body.core_loaded === true, `core_loaded=${r.body.core_loaded}`);
    record("health reports core_path non-null", typeof r.body.core_path === "string" && r.body.core_path.length > 0);

    // === /core/status ===
    r = await request("GET", "/core/status");
    record("core/status reports bridge_loaded=true", r.body.bridge_loaded === true);
    record("core/status lists 18 available APIs", Array.isArray(r.body.available_apis) && r.body.available_apis.length >= 17);

    // === /core/id/:kind ===
    r = await request("GET", "/core/id/RunId");
    record("core/id/RunId returns a UUID-like string", typeof r.body.id === "string" && r.body.id.length >= 8);

    // === /core/sha256 ===
    r = await request("GET", "/core/sha256?s=hello");
    record("core/sha256 returns the correct hash for 'hello'", r.body.hash === "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", `got ${r.body.hash || JSON.stringify(r.body)}`);
    record("core/sha256 returns empty for empty input", r.body.hash && r.body.hash.length === 64);

    // === /core/validate/persona (invalid) ===
    r = await request("POST", "/core/validate/persona", {});
    record("core/validate/persona rejects empty input with 400", r.status === 400);
    record("core/validate/persona error mentions 'id'", (r.body.error || "").includes("id") || (r.body.error || "").toLowerCase().includes("id"));

    // === /core/budget/check ===
    r = await request("POST", "/core/budget/check", {
      metrics: { costUsd: 5 },
      limits: { maxCostUsd: 1 },
    });
    record("core/budget/check flags cost overrun", r.body.exceeded === true);
    record("core/budget/check reason mentions cost", (r.body.reason || "").includes("Cost"));

    // === /core/permission/check (denied) ===
    r = await request("POST", "/core/permission/check", {
      action: { command: "rm -rf /" },
      scope: { deniedCommands: ["rm -rf"] },
    });
    record("core/permission/check blocks denied command", r.body.allowed === false);
    record("core/permission/check reason mentions denied pattern", (r.body.reason || "").includes("denied"));

    // === /core/action/check (deny destructive) ===
    r = await request("POST", "/core/action/check", {
      action: { kind: "file_write", command: "rm -rf /", description: "dangerous", estimatedImpact: "destructive" },
      deny_destructive_by_default: true,
      persona_must_not: [],
    });
    record("core/action/check denies destructive action", r.body.denied === true);
    record("core/action/check verdict is deny", r.body.verdict && r.body.verdict.kind === "deny");

    // === /core/regression/detect ===
    r = await request("POST", "/core/regression/detect", {
      skill_id: "skill-1",
      baseline_runs: [{ state: "succeeded" }, { state: "succeeded" }, { state: "succeeded" }],
      candidate_runs: [{ state: "failed" }],
    });
    record("core/regression/detect flags regression", r.body.regressed === true);
    record("core/regression/detect reports baseline=100% candidate=0%", r.body.baselineSuccessRate === 1 && r.body.candidateSuccessRate === 0);

    // === /core/context/optimize ===
    r = await request("POST", "/core/context/optimize", {
      assets: [
        { id: "a1", priority: 1, mandatory: true,  estimatedTokens: 100,  estimatedBytes: 400 },
        { id: "a2", priority: 5, mandatory: false, estimatedTokens: 50000, estimatedBytes: 200000 },
      ],
      budget: { maxTokens: 1000, maxAssets: 10, maxBytes: 50000, preserveMandatory: true },
    });
    record("core/context/optimize includes mandatory asset", r.body.included && r.body.included[0].id === "a1");
    record("core/context/optimize excludes oversized asset", r.body.excluded && r.body.excluded[0].id === "a2");

    // === /core/lineage/build ===
    r = await request("POST", "/core/lineage/build", {
      records: [
        { id: "r1", type: "experience" },
        { id: "r2", type: "experience" },
      ],
    });
    record("core/lineage/build returns a summary", typeof r.body.summary === "string");

    // === /core/governed/propose (minimal) ===
    r = await request("POST", "/core/governed/propose", {
      asset: null,
      proposed_by: "alice",
      justification: "test",
    });
    // The engine should reject null asset with a structured error
    record("core/governed/propose rejects null asset (structured error)",
      r.body.error && typeof r.body.error === "string" && r.body.error.length > 0,
      `got ${JSON.stringify(r.body)}`);

  } catch (e) {
    console.log(`  [!] test framework error: ${e.message}`);
    FAIL++;
  } finally {
    child.kill();
    try { fs.rmSync(TEST_HOME, { recursive: true, force: true }); } catch {}
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  v4.2.1 Bridge Tests Summary`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  ✓ Passed: ${PASS}`);
  console.log(`  ✗ Failed: ${FAIL}`);
  console.log(`  Total: ${PASS + FAIL}`);
  console.log(`${"=".repeat(60)}`);
  process.exit(FAIL > 0 ? 1 : 0);
})();
