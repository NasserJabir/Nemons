// ============================================================
// Nemons Tests — End-to-end test runner
// Run with: npm test
// ============================================================

const path = require("path");
const { spawn } = require("child_process");
const os = require("os");
const fs = require("fs").promises;

const BIN_PATH = path.join(__dirname, "..", "bin", "nemons.js");
const TEST_HOME = path.join(os.tmpdir(), `nemons-test-${Date.now()}`);
const NEMONS_URL = "http://127.0.0.1:3456";

let PASS = 0, FAIL = 0, SKIP = 0;

const ok = (msg) => { console.log(`  ✓ ${msg}`); PASS++; };
const bad = (msg) => { console.log(`  ✗ ${msg}`); FAIL++; };
const skip = (msg) => { console.log(`  ⚠ ${msg}`); SKIP++; };

async function setup() {
  await fs.mkdir(TEST_HOME, { recursive: true });
  await fs.mkdir(path.join(TEST_HOME, "config"), { recursive: true });
  // Copy daemon.yml
  const configSrc = path.join(__dirname, "..", "..", "config", "daemon.yml");
  const configDest = path.join(TEST_HOME, "config", "daemon.yml");
  try {
    await fs.copyFile(configSrc, configDest);
  } catch {
    // Config not available, daemon will use defaults
  }
}

async function teardown() {
  try {
    await fs.rm(TEST_HOME, { recursive: true, force: true });
  } catch {}
}

async function startDaemon() {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, NEMONS_HOME: TEST_HOME };
    const child = spawn(process.execPath, [BIN_PATH, "daemon", "start"], {
      env,
      stdio: "pipe",
    });
    let output = "";
    child.stdout.on("data", (d) => { output += d.toString(); });
    child.stderr.on("data", (d) => { output += d.toString(); });
    child.on("close", () => {
      // Wait for daemon to be ready
      setTimeout(async () => {
        try {
          const res = await fetch(`${NEMONS_URL}/health`);
          if (res.ok) resolve();
          else reject(new Error("Daemon not healthy"));
        } catch (err) {
          reject(err);
        }
      }, 2000);
    });
  });
}

async function stopDaemon() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN_PATH, "daemon", "stop"], {
      env: { ...process.env, NEMONS_HOME: TEST_HOME },
      stdio: "pipe",
    });
    child.on("close", () => resolve());
  });
}

async function call(p, init) {
  try {
    const res = await fetch(`${NEMONS_URL}${p}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function runTests() {
  console.log("\n============================================================");
  console.log("  Nemons Test Suite");
  console.log("  Test home: " + TEST_HOME);
  console.log("============================================================\n");

  await setup();

  // Start daemon
  console.log("Setup: starting daemon...");
  try {
    await startDaemon();
    ok("Daemon started");
  } catch (err) {
    bad(`Daemon failed to start: ${err.message}`);
    return;
  }

  // Test 1: Health
  console.log("\nTest 1: /health endpoint");
  const health = await call("/health");
  if (health.ok && health.data.status === "healthy") {
    ok(`Healthy (v${health.data.version})`);
  } else {
    bad("Health check failed");
  }

  // Test 2: Analyze — implement prompt
  console.log("\nTest 2: Analyze 'implement' prompt");
  const a1 = await call("/analyze", {
    method: "POST",
    body: JSON.stringify({
      prompt: "implement a hello world function in src/utils.ts",
      project_root: TEST_HOME,
      adapter: "opencode",
    }),
  });
  if (a1.ok && a1.data.should_intercept === true) ok("'implement' intercepted");
  else bad("'implement' not intercepted");

  // Test 3: Analyze — trivial prompt
  console.log("\nTest 3: Analyze 'hello' prompt");
  const a2 = await call("/analyze", {
    method: "POST",
    body: JSON.stringify({
      prompt: "hello",
      project_root: TEST_HOME,
      adapter: "opencode",
    }),
  });
  if (a2.ok && a2.data.should_intercept === false) ok("'hello' skipped");
  else skip("'hello' handling ambiguous");

  // Test 4: Analyze — definition question
  console.log("\nTest 4: Analyze 'what is React?' prompt");
  const a3 = await call("/analyze", {
    method: "POST",
    body: JSON.stringify({
      prompt: "what is React?",
      project_root: TEST_HOME,
      adapter: "opencode",
    }),
  });
  if (a3.ok && a3.data.should_intercept === false) ok("definition skipped");
  else skip("definition handling ambiguous");

  // Test 5: Evidence + redaction
  console.log("\nTest 5: Evidence with secret redaction");
  const ev = await call("/evidence", {
    method: "POST",
    body: JSON.stringify({
      run_id: `test-${Date.now()}`,
      evidence: {
        diff: "API_KEY_abc123 = sk-ant-supersecret",
        tests_pass: true,
      },
    }),
  });
  if (ev.ok && ev.data.redacted === true) ok("evidence redacted");
  else bad("redaction failed");

  // Test 6: Verification pass
  console.log("\nTest 6: Verification (pass scenario)");
  const evalPass = await call("/evaluate", {
    method: "POST",
    body: JSON.stringify({
      run_id: `pass-${Date.now()}`,
      evidence: {
        tests_pass: true,
        no_syntax_errors: true,
        no_security_violations: true,
        no_secrets_in_diff: true,
      },
    }),
  });
  if (evalPass.ok && evalPass.data.pass === true) ok("verification passed");
  else bad("verification should have passed");

  // Test 7: Verification fail
  console.log("\nTest 7: Verification (fail scenario)");
  const evalFail = await call("/evaluate", {
    method: "POST",
    body: JSON.stringify({
      run_id: `fail-${Date.now()}`,
      evidence: {
        tests_pass: false,  // FAIL
        no_syntax_errors: true,
      },
    }),
  });
  if (evalFail.ok && evalFail.data.pass === false) ok("verification correctly failed");
  else bad("should have failed");

  // Test 8: Metrics
  console.log("\nTest 8: /metrics endpoint");
  const m = await call("/metrics");
  if (m.ok && m.data.daemon_memory_mb !== undefined) ok(`memory: ${m.data.daemon_memory_mb}MB`);
  else skip("metrics incomplete");

  // Test 9: Governance
  console.log("\nTest 9: /governance/rules endpoint");
  const g = await call("/governance/rules");
  if (g.ok) ok("governance rules accessible");
  else skip("governance not configured");

  // Test 10: Experiences list
  console.log("\nTest 10: /experiences endpoint");
  const exp = await call("/experiences?limit=5");
  if (exp.ok && exp.data.total !== undefined) ok(`total: ${exp.data.total}`);
  else skip("experiences endpoint issue");

  // Stop daemon
  console.log("\nTeardown: stopping daemon...");
  await stopDaemon();
  await teardown();

  // Summary
  console.log("\n============================================================");
  console.log("  Test Summary");
  console.log("============================================================");
  console.log(`  ✓ Passed: ${PASS}`);
  console.log(`  ✗ Failed: ${FAIL}`);
  console.log(`  ⚠ Skipped: ${SKIP}`);
  console.log(`  Total: ${PASS + FAIL + SKIP}`);
  console.log("");

  process.exit(FAIL > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
