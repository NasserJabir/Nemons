import { buildRuntime } from "../src/runtime.js";
import { InMemoryPolicyRuleRegistry } from "../src/policy/policy-contracts.js";
import { DefaultPolicyEngine } from "../src/policy/policy-engine.js";
import { BUILTIN_POLICY_RULES } from "../src/policy/builtin-rules.js";
import { DefaultContextResolver } from "../src/context/context-resolver.js";
import { DefaultContextPackBuilder } from "../src/context/context-pack-builder.js";

const registry = new InMemoryPolicyRuleRegistry();
for (const rule of BUILTIN_POLICY_RULES) registry.register(rule);
const engine = new DefaultPolicyEngine(registry);
const runtime = buildRuntime();

const GT_KNOWLEDGE = {
  id: "k-gt" as never,
  version: "1.0.0",
  provenance: { kind: "approved", source: { kind: "human", actor: "x", at: "x" } },
  title: "Test Runner Configuration",
  summary: "How the project's test runner is configured",
  content: "vitest config",
  applicability: { subjectKind: "repository" as const, taskKinds: ["test-fix"] },
};

const GT_PERSONA = {
  id: "p-gt" as never,
  version: "1.0.0",
  provenance: { kind: "approved", source: { kind: "human", actor: "x", at: "x" } },
  role: "x",
  responsibilities: [],
  workingApproach: "x",
  constraints: {},
  applicability: { taskKinds: ["test-fix"] },
};

const GT_SKILL = {
  id: "s-gt" as never,
  version: "1.0.0",
  provenance: { kind: "approved", source: { kind: "human", actor: "x", at: "x" } },
  name: "run-tests",
  description: "Run tests",
  applicability: { taskKinds: ["test-fix"] },
  inputs: [],
  outputs: [],
  requiredCapabilities: [{ capability: "tool.shell.exec", required: true }],
};

const runInputs = {
  taskDescription: "Fix the failing test",
  taskKind: "test-fix" as const,
  repoInstance: {
    repoIdentity: { repo: "https://example.com/repo.git", sha: "abc" },
    instanceId: "inst-1",
  },
};

const resolver = new DefaultContextResolver({
  personas: [GT_PERSONA],
  skills: [GT_SKILL],
  knowledge: [GT_KNOWLEDGE],
  memory: [],
});

const mockCaps = runtime.adapterRegistry.get("mock").getCapabilities().capabilities;
console.log("Mock caps:", [...mockCaps]);

const resolution = resolver.resolve({
  runInputs,
  availableCapabilities: mockCaps,
});

console.log("Persona included:", resolution.personas[0]?.included, resolution.personas[0]?.reason);
console.log("Skill included:", resolution.skills[0]?.included, resolution.skills[0]?.reason);
console.log("Knowledge included:", resolution.knowledge[0]?.included, resolution.knowledge[0]?.reason);

const builder = new DefaultContextPackBuilder(engine, {
  maxAssets: 10,
  maxContentBytes: 10_000,
});

const pack = builder.build({
  runId: "r-1" as never,
  resolution,
});

console.log("Pack assets count:", pack.assets.length);
console.log("Pack assets:", pack.assets.map(a => ({ kind: a.assetKind, id: a.assetId, kind2: a.provenanceKind })));
console.log("Pack exclusions:", pack.exclusions.map(e => ({ kind: e.assetKind, id: e.assetId, reason: e.reason, reasonKind: e.reasonKind })));
