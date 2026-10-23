// Example: Using the Nemons SDK in your own Node.js app

const {
  createDaemon,
  healthCheck,
  analyzePrompt,
  getContextPack,
  submitEvidence,
  evaluateRun,
  retrieveSimilarExperiences,
} = require("@nemons/cli");

async function main() {
  // 1. Health check (daemon must be running)
  const health = await healthCheck();
  if (!health.ok) {
    console.error("Daemon not running. Start with: nemons daemon start");
    process.exit(1);
  }
  console.log("Daemon healthy:", health.version);

  // 2. Analyze a prompt
  const prompt = "implement a hello world function";
  const analysis = await analyzePrompt(prompt, "/path/to/project", "opencode");
  console.log("Should intercept:", analysis.should_intercept);

  if (!analysis.should_intercept) {
    console.log("Skipping — prompt is not code-related");
    return;
  }

  // 3. Load Context Pack
  if (analysis.suggested_pack_id) {
    const pack = await getContextPack(analysis.suggested_pack_id);
    console.log("Loaded pack:", pack.id);
    console.log("Persona:", pack.persona.role);
  }

  // 4. Simulate agent work (you'd call your actual agent here)
  console.log("...agent is working...");
  await new Promise((r) => setTimeout(r, 1000));

  // 5. Collect Evidence (you'd gather real diff, tests, etc.)
  const evidence = {
    diff: "+ function hello() { return 'world' }",
    test_results: { passed: true, count: 3 },
  };

  // 6. Submit Evidence (with automatic redaction)
  const runId = `run-${Date.now()}`;
  await submitEvidence(runId, evidence);
  console.log("Evidence stored (with redaction)");

  // 7. Evaluate
  const result = await evaluateRun(runId, evidence);
  if (result.passed) {
    console.log("✓ Verification passed");
    console.log("Experience stored:", result.experience_stored);
  } else {
    console.log("✗ Verification failed:");
    console.log("Failures:", result.failures);
  }

  // 8. Retrieve similar experiences for future runs
  const similar = await retrieveSimilarExperiences("implement a hello world function");
  console.log(`Found ${similar.experiences?.length || 0} similar experiences`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
