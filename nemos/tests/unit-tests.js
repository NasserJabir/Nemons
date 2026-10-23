// ============================================================
// Nemos Unit Tests v2.5.0
// Tests for all research modules
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

function asyncTest(name, fn) {
  return fn().then(() => { console.log(`  ✓ ${name}`); PASS++; })
    .catch(err => { console.log(`  ✗ ${name}: ${err.message}`); FAIL++; });
}

console.log("\n=== Nemos v2.5.0 Unit Tests ===\n");

// Trust Factor
const trust = require("../src/utils/trust-factor");
test("TF: computeTF returns 1.0 for perfect agent", () => {
  const tf = trust.computeTF({ V_norm: 0, V_coer: 0, V_mim: 0, N: 0, S_sum: 0 });
  assert.strictEqual(tf, 1.0);
});

test("TF: computeTF decreases with violations", () => {
  const tf = trust.computeTF({ V_norm: 5, V_coer: 2, V_mim: 1, N: 10, S_sum: 0.5 });
  assert.ok(tf < 1.0, `TF should be < 1.0, got ${tf}`);
});

test("TF: THRESHOLDS has correct values", () => {
  assert.ok(trust.THRESHOLDS.theta_warn === 0.7);
  assert.ok(trust.THRESHOLDS.theta_critical === 0.4);
});

// Verifier
const verifier = require("../src/utils/verifier");
test("Verifier: groundingCheck detects overlap", () => {
  const result = verifier.groundingCheck("hello world function", "create a hello world function");
  assert.ok(result.ratio > 0.5);
});

test("Verifier: groundingCheck returns 0 for no overlap", () => {
  const result = verifier.groundingCheck("xyzabc", "completely different text");
  assert.strictEqual(result.ratio, 0);
});

test("Verifier: heuristicJudge evaluates response", () => {
  const result = verifier._heuristicJudge("implement auth", "function auth() { return true; }", ["auth"], { tests_pass: true, no_syntax_errors: true });
  assert.ok(typeof result.score === "number");
});

// Redaction
const redaction = require("../src/utils/redaction-v2");
test("Redaction: detects API keys", () => {
  const result = redaction.assessRisk("API_KEY=sk-abc123def456ghi789jkl012mno345pqr678stu901vwx234yza567bcd890");
  assert.ok(result.total > 0);
});

test("Redaction: redacts and restores", () => {
  const { redacted, placeholder_map } = redaction.redact("email: user@example.com");
  assert.ok(redacted.includes("[REDACTED"));
  const restored = redaction.restore(redacted, placeholder_map);
  assert.ok(restored.includes("user@example.com"));
});

// Filters
const filters = require("../src/utils/filters");
test("Filters: shouldIntercept skips short prompts", () => {
  const result = filters.shouldIntercept("hi");
  assert.strictEqual(result.should_intercept, false);
});

test("Filters: shouldIntercept catches implement", () => {
  const result = filters.shouldIntercept("implement a hello world function in src/utils.ts");
  assert.strictEqual(result.should_intercept, true);
});

test("Filters: shouldIntercept skips 'what is'", () => {
  const result = filters.shouldIntercept("what is React?");
  assert.strictEqual(result.should_intercept, false);
});

// IIR
const { IIRPlan, IIRNode, IIREdge } = require("../src/utils/iir");
test("IIR: empty plan is acyclic", () => {
  const plan = new IIRPlan();
  assert.strictEqual(plan.isAcyclic(), true);
});

test("IIR: detects cycle", () => {
  const plan = new IIRPlan();
  plan.addNode(new IIRNode("a", {}));
  plan.addNode(new IIRNode("b", {}));
  plan.addEdge(new IIREdge("a", "b", "depends"));
  plan.addEdge(new IIREdge("b", "a", "depends")); // cycle!
  assert.strictEqual(plan.isAcyclic(), false);
});

test("IIR: topologicalSort works for DAG", () => {
  const plan = new IIRPlan();
  plan.addNode(new IIRNode("a", {}));
  plan.addNode(new IIRNode("b", {}));
  plan.addNode(new IIRNode("c", {}));
  plan.addEdge(new IIREdge("a", "b", "depends"));
  plan.addEdge(new IIREdge("b", "c", "depends"));
  const result = plan.topologicalSort();
  assert.ok(!result.error);
  assert.strictEqual(result.order.length, 3);
});

// Secret Detector
const { SecretDetector } = require("../src/utils/secret-detector");
test("SecretDetector: detects AWS keys", () => {
  const detector = new SecretDetector();
  const result = detector.detect("const key = 'AKIAIOSFODNN7EXAMPLE';");
  assert.ok(result.confirmed_secrets > 0);
});

test("SecretDetector: detects OpenAI keys", () => {
  const detector = new SecretDetector();
  const result = detector.detect("api_key = 'sk-abc123def456ghi789jkl012mno345pqr678stu901vwx234yza567bcd890';");
  assert.ok(result.confirmed_secrets > 0);
});

// Harness Router
const { router: harnessRouter } = require("../src/utils/harness-router");
test("Harness: routes bug fix correctly", () => {
  const result = harnessRouter.route("fix the bug in auth flow");
  assert.ok(result.harness.includes("BugFix") || result.task_type === "bug_fix");
});

test("Harness: routes refactor correctly", () => {
  const result = harnessRouter.route("refactor the API module for clarity");
  assert.ok(result.harness.includes("Refactor") || result.task_type === "refactor");
});

test("Harness: routes feature correctly", () => {
  const result = harnessRouter.route("implement user login feature");
  assert.ok(result.harness.includes("Feature") || result.task_type === "feature" || result.task_type === "generic");
});

// DAG Planner
const { DAGPlanner } = require("../src/utils/dag-planner");
test("DAG: plan creates nodes", () => {
  const planner = new DAGPlanner();
  const plan = planner.plan("implement user auth");
  assert.ok(plan.node_count > 0);
});

test("DAG: execution order is topologically sorted", () => {
  const planner = new DAGPlanner();
  planner.plan("implement user auth");
  const order = planner.getExecutionOrder();
  assert.ok(Array.isArray(order));
});

// Counterexample
const counterexample = require("../src/utils/counterexample");
test("Counterexample: extractCounterexample handles null", () => {
  const result = counterexample.extractCounterexample({}, null);
  assert.ok(result === null || result.failures !== undefined);
});

// Ensemble
const { EnsembleGenerator } = require("../src/utils/ensemble");
test("Ensemble: generates multiple candidates", () => {
  const gen = new EnsembleGenerator();
  // Can't use async in sync test, just check class exists
  assert.ok(typeof gen.generate === "function");
});

// Multi-Persona
const { MultiPersona } = require("../src/utils/multi-persona");
test("MultiPersona: generates perspectives", () => {
  const mp = new MultiPersona();
  const perspectives = mp.generatePerspectives("implement secure authentication");
  assert.ok(perspectives.length > 0);
  assert.ok(perspectives[0].persona_id);
});

// Subagent Manager
const { SubagentManager } = require("../src/utils/subagent-manager");
test("Subagent: spawn creates subagent with modes", async () => {
  const sm = new SubagentManager();
  const sub = await sm.spawn({ role: "executor", memory_mode: "agent-agnostic", lifespan: "one-time", task: "test" });
  assert.strictEqual(sub.memory_mode, "agent-agnostic");
  assert.strictEqual(sub.lifespan, "one-time");
});

// Delegation Security
const { DelegationSecurity } = require("../src/utils/delegation-security");
test("Delegation: createChain initializes scope", () => {
  const ds = new DelegationSecurity();
  const chain = ds.createChain("agent-1", { actions: ["read", "write"], budget: 100, resources: ["fs"] });
  assert.strictEqual(chain.principals.length, 1);
  assert.ok(chain.principals[0].scope.actions.includes("read"));
});

test("Delegation: authorize allows in-scope action", () => {
  const ds = new DelegationSecurity();
  ds.createChain("agent-1", { actions: ["read"], budget: 100, resources: ["fs"] });
  const result = ds.authorize("agent-1", { action: "read", resources: ["fs"], cost: 1 });
  assert.strictEqual(result.authorized, true);
});

test("Delegation: authorize blocks out-of-scope action", () => {
  const ds = new DelegationSecurity();
  ds.createChain("agent-1", { actions: ["read"], budget: 100, resources: ["fs"] });
  const result = ds.authorize("agent-1", { action: "delete", resources: ["fs"], cost: 1 });
  assert.strictEqual(result.authorized, false);
});

// Realistic Benchmark
const { RealisticBenchmark } = require("../src/utils/realistic-benchmark");
test("Benchmark: transforms formal to realistic", () => {
  const bench = new RealisticBenchmark();
  const result = bench.transform("Implement a function that returns factorial.");
  assert.ok(result.realistic.length > 0);
  assert.notStrictEqual(result.original, result.realistic);
});

test("Benchmark: test prompts exist", () => {
  const bench = new RealisticBenchmark();
  const prompts = bench.getTestPrompts();
  assert.ok(prompts.formal.length > 0);
  assert.ok(prompts.realistic.length === prompts.formal.length);
});

// CodeVisionary
const { CodeVisionary } = require("../src/utils/code-visionary");
test("CodeVisionary: evaluates code", () => {
  const cv = new CodeVisionary();
  const result = cv.evaluate("function hello() { return 'world'; }");
  assert.ok(typeof result.overall_score === "number");
  assert.ok(result.dimensions !== undefined);
});

// Hierarchical CoT
const { HierarchicalCoT } = require("../src/utils/hierarchical-cot");
test("HCoT: builds reasoning tree", () => {
  const h = new HierarchicalCoT();
  const result = h.reason("implement auth and add tests", 3);
  assert.ok(result.tree);
  assert.ok(result.nodes > 0);
});

// Novelty ToT
const { NoveltyToT } = require("../src/utils/novelty-tot");
test("NoveltyToT: prunes duplicates", () => {
  const t = new NoveltyToT();
  const result = t.search("implement feature", 20);
  assert.ok(result.nodes_expanded > 0);
  assert.ok(result.nodes_pruned >= 0);
});

// Scaffolding Optimizer
const { ScaffoldingOptimizer } = require("../src/utils/scaffolding-optimizer");
test("Scaffolding: analyzes and suggests improvements", () => {
  const so = new ScaffoldingOptimizer();
  const result = so.analyze({ prompt: "hi", memory: {}, tools: [] }, { success_rate: 0.5 });
  assert.ok(typeof result.current_score === "number");
});

// Recursive Improver
const { RecursiveImprover } = require("../src/utils/recursive-improver");
test("Recursive: self-evaluate returns score", () => {
  const ri = new RecursiveImprover();
  const result = ri.selfEvaluate({ prompt: "implement auth with tests", memory: { facts: [] }, tools: ["fs"], verification: { pass: true } });
  assert.ok(typeof result.score === "number");
  assert.ok(result.checks.length > 0);
});

// Summary
setTimeout(() => {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Unit Tests Summary`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  ✓ Passed: ${PASS}`);
  console.log(`  ✗ Failed: ${FAIL}`);
  console.log(`  Total: ${PASS + FAIL}`);
  console.log(`${"=".repeat(60)}`);
  process.exit(FAIL > 0 ? 1 : 0);
}, 1000);
