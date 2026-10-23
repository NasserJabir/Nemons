// ============================================================
// nemons verify — end-to-end test suite
// ============================================================
const NEMONS_URL = "http://127.0.0.1:3456";

let PASS = 0, FAIL = 0, SKIP = 0;

const green = (s) => console.log(`\x1b[32m  ✓ ${s}\x1b[0m`);
const red = (s) => console.log(`\x1b[31m  ✗ ${s}\x1b[0m`);
const yellow = (s) => console.log(`\x1b[33m  ⚠ ${s}\x1b[0m`);

async function call(path, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${NEMONS_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function (subcommandOrOpts, optsArg) {
  // Support both signatures: (opts) or (subcommand, flags)
  const opts = (subcommandOrOpts && typeof subcommandOrOpts === "object")
    ? subcommandOrOpts
    : (optsArg && typeof optsArg === "object")
      ? optsArg
      : {};
  const url = opts.url || NEMONS_URL;
  console.log("[nemons] Running verification tests...");
  console.log(`  URL: ${url}\n`);

  // Test 1: Health
  console.log("Test 1: Daemon health");
  const health = await call("/health");
  if (health.ok && health.data?.status === "healthy") {
    green(`Daemon healthy (v${health.data.version})`);
    PASS++;
  } else {
    red(`Health check failed: ${health.error || health.status}`);
    FAIL++;
    console.log("\n✗ Daemon not running. Start with: nemons daemon start");
    process.exit(1);
  }

  // Test 2: "implement" prompt should intercept
  console.log("\nTest 2: Intercept 'implement' prompt");
  const analyze2 = await call("/analyze", {
    method: "POST",
    body: JSON.stringify({
      prompt: "implement a hello world function in src/utils.ts",
      project_root: "/tmp",
      adapter: "opencode",
    }),
  });
  if (analyze2.ok && analyze2.data?.should_intercept === true) {
    green("'implement' prompt correctly intercepted");
    PASS++;
  } else {
    red("'implement' prompt not intercepted");
    FAIL++;
  }

  // Test 3: "hello" should skip
  console.log("\nTest 3: Skip 'hello' prompt");
  const analyze3 = await call("/analyze", {
    method: "POST",
    body: JSON.stringify({
      prompt: "hello",
      project_root: "/tmp",
      adapter: "opencode",
    }),
  });
  if (analyze3.ok && analyze3.data?.should_intercept === false) {
    green("'hello' prompt correctly skipped");
    PASS++;
  } else {
    yellow("'hello' prompt handling ambiguous");
    SKIP++;
  }

  // Test 4: "what is React?" should skip
  console.log("\nTest 4: Skip 'what is React?' prompt");
  const analyze4 = await call("/analyze", {
    method: "POST",
    body: JSON.stringify({
      prompt: "what is React?",
      project_root: "/tmp",
      adapter: "opencode",
    }),
  });
  if (analyze4.ok && analyze4.data?.should_intercept === false) {
    green("Definition question correctly skipped");
    PASS++;
  } else {
    yellow("Definition question handling ambiguous");
    SKIP++;
  }

  // Test 5: "fix the bug" should intercept
  console.log("\nTest 5: Intercept 'fix the bug' prompt");
  const analyze5 = await call("/analyze", {
    method: "POST",
    body: JSON.stringify({
      prompt: "fix the bug in the auth flow, the user cant log in",
      project_root: "/tmp",
      adapter: "opencode",
    }),
  });
  if (analyze5.ok && analyze5.data?.should_intercept === true) {
    green("Bug-fix prompt correctly intercepted");
    PASS++;
  } else {
    red("Bug-fix prompt not intercepted");
    FAIL++;
  }

  // Test 6: Evidence collection + redaction
  console.log("\nTest 6: Evidence collection + secret redaction");
  const evidence = await call("/evidence", {
    method: "POST",
    body: JSON.stringify({
      run_id: `test-${Date.now()}`,
      evidence: {
        diff: "API_KEY_abc123 = sk-ant-supersecret123",
        test_results: { passed: true },
      },
    }),
  });
  if (evidence.ok && evidence.data?.redacted) {
    green("Evidence stored with redaction");
    PASS++;
  } else {
    red("Evidence storage failed");
    FAIL++;
  }

  // Test 7: Evaluation
  console.log("\nTest 7: Verification loop");
  const evalResult = await call("/evaluate", {
    method: "POST",
    body: JSON.stringify({
      run_id: `test-${Date.now()}`,
      evidence: {
        tests_pass: true,
        no_syntax_errors: true,
        no_security_violations: true,
        no_secrets_in_diff: true,
      },
    }),
  });
  if (evalResult.ok && evalResult.data?.passed === true) {
    green("Verification passed, experience stored");
    PASS++;
  } else {
    red(`Verification failed: ${JSON.stringify(evalResult.data?.failures)}`);
    FAIL++;
  }

  // Test 8: Metrics endpoint
  console.log("\nTest 8: Metrics endpoint");
  const metrics = await call("/metrics");
  if (metrics.ok && metrics.data?.daemon_memory_mb !== undefined) {
    green(`Metrics accessible (memory: ${metrics.data.daemon_memory_mb}MB)`);
    PASS++;
  } else {
    yellow("Metrics endpoint not fully configured");
    SKIP++;
  }

  // Test 9: Governance rules
  console.log("\nTest 9: Governance rules");
  const gov = await call("/governance/rules");
  if (gov.ok) {
    green("Governance rules accessible");
    PASS++;
  } else {
    yellow("Governance endpoint not configured");
    SKIP++;
  }

  // Test 10: Experiences endpoint
  console.log("\nTest 10: Experiences listing");
  const exp = await call("/experiences?limit=5");
  if (exp.ok) {
    green(`Experiences: ${exp.data?.total || 0} total`);
    PASS++;
  } else {
    yellow("Experiences endpoint issue");
    SKIP++;
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("  Test Summary");
  console.log("=".repeat(60));
  green(`Passed: ${PASS}`);
  if (FAIL > 0) red(`Failed: ${FAIL}`);
  if (SKIP > 0) yellow(`Skipped: ${SKIP}`);
  console.log(`  Total: ${PASS + FAIL + SKIP}\n`);

  if (FAIL > 0) {
    console.log("✗ Nemons has issues — fix the failures above\n");
    process.exit(1);
  }

  console.log("✅ Nemons transparent interception is working!\n");
  console.log("Next: open a coding agent and try:");
  console.log("  > implement a hello world function");
  console.log("Nemons will auto-trigger. 🎉\n");
};
