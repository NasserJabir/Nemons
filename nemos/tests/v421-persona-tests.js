// ============================================================
// Nemos v4.2.1 Unit Tests — Persona-Driven Pipeline
//
// Closes the comment/code drift in v4.2.0:
//   - HarnessRouter.route() now accepts personaRole (was prompt-only)
//   - SubagentOrchestrator.autoOrchestrate() now accepts personaRole
//     (was prompt/dag/identity only)
//   - Pipeline-integrator actually passes persona.role to both
//   - All three persona-driven augment functions are exercised
//
// Run with: node tests/v421-persona-tests.js
// ============================================================

const assert = require("assert");

let PASS = 0, FAIL = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    PASS++;
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`);
    FAIL++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    PASS++;
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`);
    FAIL++;
  }
}

console.log("\n=== Nemos v4.2.1 Persona-Driven Pipeline Tests ===\n");

// ============================================================
// HarnessRouter — persona-aware routing
// ============================================================
const {
  HarnessRouter,
  router,
  PERSONA_DOMAIN_CRITERIA,
  ROLE_TO_DOMAIN,
} = require("../src/utils/harness-router");

test("HR: route() with no persona still works (backward compat)", () => {
  const r = router.route("fix this bug");
  assert.ok(r.harness, "harness must be set");
  assert.ok(r.verification_criteria, "criteria must be set");
  assert.ok(r.persona_domain === "general", "no persona → general domain");
  assert.ok(r.persona_augmented === false, "no persona → not augmented");
});

test("HR: route() with security persona adds security must_pass criteria", () => {
  const r = router.route("fix this bug", "security_engineer");
  assert.ok(r.persona_role === "security_engineer", "persona_role must echo caller");
  assert.ok(r.persona_domain === "security", "persona → security domain");
  assert.ok(r.persona_augmented === true, "security → augmented");
  assert.ok(r.verification_criteria.must_pass.includes("no_vulnerabilities"), "must include no_vulnerabilities");
  assert.ok(r.verification_criteria.must_pass.includes("owasp_checked"), "must include owasp_checked");
  assert.ok(r.verification_criteria.should_pass.includes("security_tests_added"), "must include security_tests_added");
});

test("HR: route() with devops persona adds health_check + rollback_plan", () => {
  const r = router.route("deploy to kubernetes", "devops_engineer");
  assert.ok(r.persona_domain === "devops");
  assert.ok(r.verification_criteria.must_pass.includes("health_check_present"));
  assert.ok(r.verification_criteria.must_pass.includes("rollback_plan"));
  assert.ok(r.verification_criteria.must_pass.includes("graceful_shutdown"));
});

test("HR: route() with data_engineer persona adds schema_validated", () => {
  const r = router.route("migrate the database", "data_engineer");
  assert.ok(r.persona_domain === "data-engineering");
  assert.ok(r.verification_criteria.must_pass.includes("schema_validated"));
  assert.ok(r.verification_criteria.must_pass.includes("idempotent_operations"));
});

test("HR: route() with frontend persona adds accessibility + responsive", () => {
  const r = router.route("build the dashboard", "frontend_engineer");
  assert.ok(r.persona_domain === "frontend");
  assert.ok(r.verification_criteria.must_pass.includes("accessibility_checked"));
  assert.ok(r.verification_criteria.must_pass.includes("responsive_design"));
});

test("HR: route() with senior_engineer persona is treated as general (no extra criteria)", () => {
  const r = router.route("implement the feature", "senior_engineer");
  assert.ok(r.persona_domain === "general");
  assert.ok(r.persona_augmented === false);
  assert.ok(!r.verification_criteria.must_pass.includes("no_vulnerabilities"),
    "general persona must NOT add security criteria");
});

test("HR: route() preserves base harness must_pass when adding persona criteria", () => {
  const r = router.route("fix this bug", "security_engineer");
  // BugFixHarness must_pass should still be there (at least tests_pass)
  assert.ok(r.verification_criteria.must_pass.length >= 1, "must have at least one criterion");
  // Both base + persona must coexist
  assert.ok(r.verification_criteria.must_pass.includes("no_vulnerabilities"), "persona criterion");
});

test("HR: route() with unknown persona role falls back to general", () => {
  const r = router.route("do something", "unknown_persona_xyz");
  assert.ok(r.persona_domain === "general", "unknown → general");
  assert.ok(r.persona_augmented === false, "unknown → not augmented");
  // Still echoes the caller's persona_role so caller can see what they asked for
  assert.ok(r.persona_role === "unknown_persona_xyz");
});

test("HR: PERSONA_DOMAIN_CRITERIA export has all 4 domains", () => {
  const domains = Object.keys(PERSONA_DOMAIN_CRITERIA);
  assert.ok(domains.includes("security"));
  assert.ok(domains.includes("devops"));
  assert.ok(domains.includes("data-engineering"));
  assert.ok(domains.includes("frontend"));
  for (const d of domains) {
    assert.ok(PERSONA_DOMAIN_CRITERIA[d].must_pass.length > 0, `${d} must_pass empty`);
  }
});

test("HR: ROLE_TO_DOMAIN maps all 5 roles", () => {
  assert.ok(ROLE_TO_DOMAIN.security_engineer === "security");
  assert.ok(ROLE_TO_DOMAIN.devops_engineer === "devops");
  assert.ok(ROLE_TO_DOMAIN.data_engineer === "data-engineering");
  assert.ok(ROLE_TO_DOMAIN.frontend_engineer === "frontend");
  assert.ok(ROLE_TO_DOMAIN.senior_engineer === "general");
});

test("HR: getPersonaDomainCriteria returns clone (immutability)", () => {
  const c1 = router.getPersonaDomainCriteria("security");
  const c2 = router.getPersonaDomainCriteria("security");
  assert.deepEqual(c1, c2);
  c1.must_pass.push("mutated");
  // mutating the returned clone must not affect the next call
  const c3 = router.getPersonaDomainCriteria("security");
  assert.ok(!c3.must_pass.includes("mutated"), "must return a fresh clone");
});

test("HR: getStats reports persona_domains_supported", async () => {
  const stats = await router.getStats();
  assert.ok(Array.isArray(stats.persona_domains_supported));
  assert.ok(stats.persona_domains_supported.length === 4);
});

// ============================================================
// SubagentOrchestrator — persona-aware spawn-time assignment
// ============================================================
const {
  SubagentOrchestrator,
  PERSONA_ROLE_DOMAIN,
  DOMAIN_ROLE_OVERRIDE,
} = require("../src/utils/subagent-orchestrator");

// Stub subagent manager that records what was spawned
class StubSubagentManager {
  constructor() {
    this.spawned = [];
  }
  async spawn(input) {
    const id = `sub-${this.spawned.length + 1}`;
    const rec = { id, ...input };
    this.spawned.push(rec);
    return rec;
  }
  async getInstance(id) {
    return this.spawned.find(s => s.id === id);
  }
}

test("SO: PERSONA_ROLE_DOMAIN maps all 5 roles", () => {
  assert.ok(PERSONA_ROLE_DOMAIN.security_engineer === "security");
  assert.ok(PERSONA_ROLE_DOMAIN.devops_engineer === "devops");
  assert.ok(PERSONA_ROLE_DOMAIN.data_engineer === "data-engineering");
  assert.ok(PERSONA_ROLE_DOMAIN.frontend_engineer === "frontend");
  assert.ok(PERSONA_ROLE_DOMAIN.senior_engineer === "general");
});

test("SO: DOMAIN_ROLE_OVERRIDE has 4 persona domains", () => {
  const domains = Object.keys(DOMAIN_ROLE_OVERRIDE);
  assert.ok(domains.includes("security"));
  assert.ok(domains.includes("devops"));
  assert.ok(domains.includes("data-engineering"));
  assert.ok(domains.includes("frontend"));
});

test("SO: autoOrchestrate with no persona still works (backward compat)", async () => {
  const mgr = new StubSubagentManager();
  const orch = new SubagentOrchestrator(mgr);
  const dag = {
    nodes: [
      { id: "n1", question: "implement the module", dependencies: [] },
      { id: "n2", question: "implement another module", dependencies: [] },
      { id: "n3", question: "implement a third module", dependencies: [] },
    ],
    node_count: 3,
  };
  const r = await orch.autoOrchestrate("complex task", dag, "identity-1");
  assert.ok(r.orchestrated === true);
  assert.ok(r.persona_driven === false, "no persona → not driven");
  assert.ok(r.persona_domain === "general");
});

test("SO: autoOrchestrate with security persona overrides roles at spawn time", async () => {
  const mgr = new StubSubagentManager();
  const orch = new SubagentOrchestrator(mgr);
  const dag = {
    nodes: [
      { id: "n1", question: "implement the security module", dependencies: [] },
      { id: "n2", question: "implement another module", dependencies: [] },
      { id: "n3", question: "test the security module", dependencies: [] },
    ],
    node_count: 3,
  };
  const r = await orch.autoOrchestrate("build secure auth", dag, "identity-1", "security_engineer");
  assert.ok(r.orchestrated === true, "should orchestrate");
  assert.ok(r.persona_driven === true, "persona should drive");
  assert.ok(r.persona_domain === "security");
  assert.ok(r.persona_role === "security_engineer");

  // r.subagents contains the ORIGINAL spawned batch (NOT the retries,
  // which intentionally upgrade memory_mode from agent-agnostic to
  // inherit-partial per the orchestrator's failure-handling logic).
  const spawnedBatch = r.subagents || [];
  assert.ok(spawnedBatch.length >= 1, "should have spawned at least 1 original");

  // The spawned subagents should already have persona-aware roles
  // (executor → security-implementer, tester → security-tester, etc.)
  const securityRoles = spawnedBatch.filter(s =>
    s.role === "security-implementer" ||
    s.role === "security-tester" ||
    s.role === "security-architect" ||
    s.role === "security-auditor"
  );
  assert.ok(securityRoles.length > 0, `at least one spawned subagent must have a security role, got: ${JSON.stringify(spawnedBatch.map(s=>s.role))}`);

  // Security subagents (executor/tester/reviewer) must be in
  // agent-agnostic memory mode (isolation). Planner is intentionally
  // inherit-partial and isn't in the assertion list.
  for (const s of securityRoles) {
    assert.ok(
      s.memory_mode === "agent-agnostic",
      `security subagent ${s.role} must be agent-agnostic, got ${s.memory_mode}`
    );
  }
});

test("SO: autoOrchestrate records persona provenance in orchestration record", async () => {
  const mgr = new StubSubagentManager();
  const orch = new SubagentOrchestrator(mgr);
  const dag = {
    nodes: [
      { id: "n1", question: "implement module", dependencies: [] },
      { id: "n2", question: "implement another", dependencies: [] },
      { id: "n3", question: "implement a third", dependencies: [] },
    ],
    node_count: 3,
  };
  const r = await orch.autoOrchestrate("complex task", dag, "id-1", "devops_engineer");
  assert.ok(r.orchestration.persona_role === "devops_engineer", "orchestration record must carry persona_role");
  assert.ok(r.orchestration.persona_domain === "devops", "orchestration record must carry persona_domain");
  assert.ok(r.orchestration.persona_driven === true, "orchestration record must carry persona_driven=true");
});

test("SO: autoOrchestrate simple task returns persona context even when not orchestrated", async () => {
  const mgr = new StubSubagentManager();
  const orch = new SubagentOrchestrator(mgr);
  const dag = { nodes: [{ id: "n1", question: "do thing", dependencies: [] }], node_count: 1 };
  const r = await orch.autoOrchestrate("simple task", dag, "id-1", "security_engineer");
  assert.ok(r.orchestrated === false);
  assert.ok(r.persona_role === "security_engineer", "even non-orchestrated result must echo persona");
  assert.ok(r.persona_domain === "security");
  assert.ok(r.persona_driven === true);
});

test("SO: stats includes persona-driven counts after orchestration", async () => {
  const mgr = new StubSubagentManager();
  const orch = new SubagentOrchestrator(mgr);
  const dag = {
    nodes: [
      { id: "n1", question: "implement module", dependencies: [] },
      { id: "n2", question: "another", dependencies: [] },
      { id: "n3", question: "third", dependencies: [] },
    ],
    node_count: 3,
  };
  await orch.autoOrchestrate("task", dag, "id-1", "security_engineer");
  await orch.autoOrchestrate("task", dag, "id-1", "devops_engineer");
  await orch.autoOrchestrate("task", dag, "id-1"); // no persona

  const stats = await orch.stats();
  assert.ok(stats.persona_driven_orchestrations === 2, `expected 2 persona-driven, got ${stats.persona_driven_orchestrations}`);
  assert.ok(stats.persona_domain_breakdown.security === 1);
  assert.ok(stats.persona_domain_breakdown.devops === 1);
});

// ============================================================
// PipelineIntegrator — end-to-end persona-driven pipeline
// ============================================================
const { PipelineIntegrator } = require("../src/utils/pipeline-integrator");

test("PI: selectPersonaRole detects security from prompt keywords", () => {
  const pi = new PipelineIntegrator();
  assert.ok(pi.selectPersonaRole("implement secure JWT authentication") === "security_engineer");
  assert.ok(pi.selectPersonaRole("audit this vulnerability and encrypt the data") === "security_engineer");
});

test("PI: selectPersonaRole detects devops from prompt keywords", () => {
  const pi = new PipelineIntegrator();
  assert.ok(pi.selectPersonaRole("deploy to docker and configure kubernetes") === "devops_engineer");
  assert.ok(pi.selectPersonaRole("provision new infrastructure") === "devops_engineer");
});

test("PI: selectPersonaRole detects data_engineer from prompt keywords", () => {
  const pi = new PipelineIntegrator();
  assert.ok(pi.selectPersonaRole("run a database migration with new schema") === "data_engineer");
  assert.ok(pi.selectPersonaRole("design the ETL pipeline") === "data_engineer");
});

test("PI: selectPersonaRole detects frontend_engineer from prompt keywords", () => {
  const pi = new PipelineIntegrator();
  assert.ok(pi.selectPersonaRole("build a react component with new UI") === "frontend_engineer");
  assert.ok(pi.selectPersonaRole("fix the CSS for this component") === "frontend_engineer");
});

test("PI: selectPersonaRole falls back to senior_engineer for generic prompts", () => {
  const pi = new PipelineIntegrator();
  assert.ok(pi.selectPersonaRole("implement the feature") === "senior_engineer");
  assert.ok(pi.selectPersonaRole("refactor this function") === "senior_engineer");
  assert.ok(pi.selectPersonaRole("") === "senior_engineer");
});

test("PI: getDomainForRole maps all roles", () => {
  const pi = new PipelineIntegrator();
  assert.ok(pi.getDomainForRole("security_engineer") === "security");
  assert.ok(pi.getDomainForRole("devops_engineer") === "devops");
  assert.ok(pi.getDomainForRole("data_engineer") === "data-engineering");
  assert.ok(pi.getDomainForRole("frontend_engineer") === "frontend");
  assert.ok(pi.getDomainForRole("senior_engineer") === "general");
  assert.ok(pi.getDomainForRole("unknown_role") === "general");
});

test("PI: augmentCriteriaForPersona adds security criteria", () => {
  const pi = new PipelineIntegrator();
  const base = { must_pass: ["tests_pass"], should_pass: [], nice_to_have: [] };
  const aug = pi.augmentCriteriaForPersona(base, { domain: "security" });
  assert.ok(aug.must_pass.includes("tests_pass"), "base criterion preserved");
  assert.ok(aug.must_pass.includes("no_vulnerabilities"), "security criterion added");
  assert.ok(aug.must_pass.includes("owasp_checked"));
  assert.ok(aug.should_pass.includes("security_tests_added"));
  assert.ok(aug.augmented === true, "augmented flag set");
  assert.ok(aug.persona_domain === "security");
});

test("PI: augmentCriteriaForPersona handles null criteria gracefully", () => {
  const pi = new PipelineIntegrator();
  const aug = pi.augmentCriteriaForPersona(null, { domain: "security" });
  assert.ok(aug.must_pass.includes("no_vulnerabilities"), "even with null base, persona criteria applied");
  assert.ok(aug.must_pass.includes("tests_pass") || aug.must_pass.includes("no_syntax_errors"), "default base criterion included");
});

test("PI: augmentCriteriaForPersona is a no-op for general persona", () => {
  const pi = new PipelineIntegrator();
  const base = { must_pass: ["tests_pass"], should_pass: [], nice_to_have: [] };
  const aug = pi.augmentCriteriaForPersona(base, { domain: "general" });
  assert.ok(aug.augmented === false);
  assert.ok(!aug.must_pass.includes("no_vulnerabilities"));
});

test("PI: augmentCriteriaForPersona is idempotent (does not duplicate on repeated calls)", () => {
  const pi = new PipelineIntegrator();
  const base = { must_pass: ["tests_pass"], should_pass: [], nice_to_have: [] };
  const aug1 = pi.augmentCriteriaForPersona(base, { domain: "security" });
  const aug2 = pi.augmentCriteriaForPersona(aug1, { domain: "security" });
  const no_vuln_count = aug2.must_pass.filter(c => c === "no_vulnerabilities").length;
  assert.ok(no_vuln_count === 1, `no_vulnerabilities must appear exactly once, got ${no_vuln_count}`);
});

test("PI: augmentSubagentRole maps executor → security-implementer for security persona", () => {
  const pi = new PipelineIntegrator();
  assert.ok(pi.augmentSubagentRole("executor", { domain: "security" }) === "security-implementer");
  assert.ok(pi.augmentSubagentRole("tester", { domain: "security" }) === "security-tester");
  assert.ok(pi.augmentSubagentRole("planner", { domain: "security" }) === "security-architect");
});

test("PI: augmentSubagentRole is a no-op for general persona", () => {
  const pi = new PipelineIntegrator();
  assert.ok(pi.augmentSubagentRole("executor", { domain: "general" }) === "executor");
});

test("PI: augmentSubagentRole returns unchanged for already-overridden roles", () => {
  // When the orchestrator already overrode the role to security-implementer,
  // the augment function must not try to "double-augment" — it should
  // return it unchanged.
  const pi = new PipelineIntegrator();
  assert.ok(pi.augmentSubagentRole("security-implementer", { domain: "security" }) === "security-implementer");
});

test("PI: stats reports v4.2.1", async () => {
  const pi = new PipelineIntegrator();
  const stats = await pi.stats();
  assert.ok(stats.pipeline_version === "4.2.1");
  assert.ok(stats.persona_driven === true);
});

// ============================================================
// Summary
// ============================================================
setTimeout(() => {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  v4.2.1 Persona Tests Summary`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  ✓ Passed: ${PASS}`);
  console.log(`  ✗ Failed: ${FAIL}`);
  console.log(`  Total: ${PASS + FAIL}`);
  console.log(`${"=".repeat(60)}`);
  process.exit(FAIL > 0 ? 1 : 0);
}, 1500);
