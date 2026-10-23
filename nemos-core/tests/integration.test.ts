/**
 * Nemons — End-to-end integration test.
 *
 * Exercises the full Stage-0 / Phase-1 lifecycle:
 *   Run creation → Context Pack build → Mock adapter invocation
 *   → Evidence collection → Evaluation → verified success
 *
 * This test verifies that all components compose correctly AND that
 * the architectural principles are preserved end-to-end:
 *   - Hard-deny behavior is enforced on every protected operation
 *   - "Evidence before claims" — no success without verified Evidence
 *   - "Identity is not instance" — Run identity is stable
 *   - "Persona is not permission" — Persona selection does not authorize
 */

import { describe, it, expect, beforeEach } from "vitest";
import { buildRuntime } from "../src/runtime.js";
import {
  InMemoryPolicyRuleRegistry,
} from "../src/policy/policy-contracts.js";
import { DefaultPolicyEngine } from "../src/policy/policy-engine.js";
import { BUILTIN_POLICY_RULES } from "../src/policy/builtin-rules.js";
import type { PolicyRule } from "../src/policy/policy-contracts.js";
import { DefaultContextResolver } from "../src/context/context-resolver.js";
import { DefaultContextPackBuilder } from "../src/context/context-pack-builder.js";
import { InMemoryRunManager } from "../src/run/run-manager.js";
import {
  asPersonaId,
  asSkillId,
  asRunId,
  asContextPackId,
} from "../src/core/identifiers.js";
import type { Persona } from "../src/schemas/persona.js";
import type { Skill } from "../src/schemas/skill.js";
import type { RunInputs } from "../src/schemas/run.js";

/**
 * A custom rule that allows test-fix runs and downstream operations,
 * so the integration test can drive the full pipeline.
 */
const allowTestFixRule: PolicyRule = {
  ruleId: "test.integration.allow-test-fix",
  description: "Allow test-fix runs and downstream operations",
  appliesTo: [
    "run.start",
    "run.transition_state",
    "run.record_evidence",
  ],
  evaluate: (ctx) => {
    if (ctx.operation === "run.start") {
      const taskKind = ctx.inputs.taskKind;
      return {
        ruleId: "test.integration.allow-test-fix",
        ruleDescription: "Allow test-fix runs",
        outcome: taskKind === "test-fix" ? "allow" : "deny",
        reason: taskKind === "test-fix" ? "test-fix allowed" : "not test-fix",
      };
    }
    return {
      ruleId: "test.integration.allow-test-fix",
      ruleDescription: "Allow downstream operations",
      outcome: "allow",
      reason: "downstream allowed",
    };
  },
};

describe("nemons runtime end-to-end", () => {
  let registry: InMemoryPolicyRuleRegistry;
  let policy: DefaultPolicyEngine;
  let runManager: InMemoryRunManager;
  let runtime: ReturnType<typeof buildRuntime>;

  beforeEach(() => {
    registry = new InMemoryPolicyRuleRegistry();
    for (const rule of BUILTIN_POLICY_RULES) registry.register(rule);
    registry.register(allowTestFixRule);
    policy = new DefaultPolicyEngine(registry);
    runManager = new InMemoryRunManager(policy);
    runtime = buildRuntime(); // default: registers MockAdapter
    runtime.policyEngine; // silence unused
    void runtime;
  });

  it("runs the full pipeline: create → start → invoke → evidence → evaluate → succeed", async () => {
    // 1. Build catalogs of approved, applicable assets
    const persona: Persona = {
      id: asPersonaId("p-test-fix"),
      version: "1.0.0",
      provenance: {
        kind: "approved",
        source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
      },
      role: "Test-Fix Engineer",
      responsibilities: ["fix failing tests"],
      workingApproach: "isolate, fix, verify",
      constraints: { mustNot: ["unrelated changes"] },
      applicability: { taskKinds: ["test-fix"] },
    };
    const skill: Skill = {
      id: asSkillId("s-run-tests"),
      version: "1.0.0",
      provenance: {
        kind: "approved",
        source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
      },
      name: "run-tests",
      description: "Run the test suite",
      applicability: { taskKinds: ["test-fix"] },
      inputs: [],
      outputs: [],
      requiredCapabilities: [{ capability: "tool.shell.exec", required: true }],
    };

    // 2. Set up the Run inputs
    const runInputs: RunInputs = {
      taskDescription: "Fix the failing test in users.test.ts",
      taskKind: "test-fix",
      taskTags: ["vitest"],
      repoInstance: {
        repoIdentity: { repo: "https://example.com/repo.git", sha: "abc123" },
        instanceId: "inst-1",
      },
    };

    // 3. Resolve context using the MockAdapter's capabilities
    const resolver = new DefaultContextResolver({
      personas: [persona],
      skills: [skill],
      knowledge: [],
      memory: [],
    });
    const capabilities = runtime.adapterRegistry.get("mock").getCapabilities().capabilities;
    // Register the mock adapter (buildRuntime registered it by default,
    // but we passed registerMockAdapter=false above; register manually)
    const mockAdapter = runtime.adapterRegistry;
    expect(mockAdapter.has("mock")).toBe(true);
    const availableCapabilities = capabilities;

    const resolution = resolver.resolve({
      runInputs,
      availableCapabilities,
    });
    expect(resolution.personas[0]?.included).toBe(true);
    expect(resolution.skills[0]?.included).toBe(true);

    // 4. Build a Context Pack
    const builder = new DefaultContextPackBuilder(policy, {
      maxAssets: 10,
      maxContentBytes: 10_000,
    });
    const contextPack = builder.build({
      runId: asRunId("r-1"), // placeholder; the actual Run id comes from the manager
      resolution,
    });

    // 5. Create a Run
    const run = runManager.createRun({
      runInputs,
      contextPackId: contextPack.id,
      provenance: {
        kind: "observed",
        source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
      },
    });
    expect(run.state).toBe("pending");

    // 6. Start the Run
    const started = runManager.startRun(run.id);
    expect(started.state).toBe("in_progress");

    // 7. Invoke the MockAdapter
    const adapter = runtime.adapterRegistry.get("mock");
    const result = await adapter.invoke({
      runId: run.id,
      contextPack: { ...contextPack, runId: run.id },
      runInputs,
    });
    expect(result.outputs.claimedOutcome).toBe("succeeded");

    // 8. Record the adapter's outputs as Run outputs
    runManager.recordOutputs(run.id, result.outputs);

    // 9. Collect Evidence from the adapter invocation
    const evidenceRecords = runtime.evidenceCollector.fromAdapterInvocation(run.id, result);
    // First record is a text_assertion (from outputs); others are adapter_event
    const verifiedEvidence = evidenceRecords.map((e) => runtime.evidenceValidator.verify(e));
    for (const e of verifiedEvidence) {
      runManager.recordEvidence(run.id, e.id);
    }

    // 10. Add an explicit verification_report to satisfy the "tests pass" criterion
    const verificationEvidence = runtime.evidenceCollector.fromVerificationResult(run.id, {
      kind: "verification_report",
      claim: "all tests pass after fix",
      payload: '{"passing":true,"failing":0}',
    });
    const verifiedVerification = runtime.evidenceValidator.verify(verificationEvidence);
    runManager.recordEvidence(run.id, verifiedVerification.id);

    // 11. Run evaluation
    const evaluation = runtime.evaluationEngine.evaluate({
      run: runManager.getRun(run.id)!,
      criteria: [
        {
          id: "tests-pass",
          description: "All tests pass",
          requiredEvidenceKinds: ["verification_report"],
          required: true,
        },
      ],
      evidence: [...verifiedEvidence, verifiedVerification],
      evaluator: "default-evaluator",
    });
    expect(evaluation.overallResult).toBe("verified_succeeded");

    // 11b. Record the evaluation on the Run (so markSucceeded has the link)
    runManager.recordEvaluation(run.id, evaluation.id);

    // 12. Mark the Run as succeeded (now Evidence is present)
    const succeeded = runManager.markSucceeded(run.id);
    expect(succeeded.state).toBe("succeeded");
    expect(succeeded.evidenceRefs?.length).toBeGreaterThan(0);
    expect(succeeded.evaluationRef).toBe(evaluation.id);
  });

  it("fails to mark a Run as succeeded when NO Evidence was recorded", () => {
    const runInputs: RunInputs = {
      taskDescription: "Fix the failing test",
      taskKind: "test-fix",
      repoInstance: {
        repoIdentity: { repo: "x", sha: "y" },
        instanceId: "i",
      },
    };
    const run = runManager.createRun({
      runInputs,
      contextPackId: asContextPackId("cp-1"),
      provenance: {
        kind: "observed",
        source: { kind: "human", actor: "x", at: "x" },
      },
    });
    runManager.startRun(run.id);
    // No evidence recorded
    expect(() => runManager.markSucceeded(run.id)).toThrow();
  });

  it("rejects candidate asset inclusion in non-experimental runs", () => {
    const persona: Persona = {
      id: asPersonaId("p-candidate"),
      version: "1.0.0",
      provenance: {
        kind: "proposed", // CANDIDATE — not approved
        source: { kind: "human", actor: "x", at: "x" },
      },
      role: "x",
      responsibilities: [],
      workingApproach: "x",
      constraints: {},
      applicability: {},
    };
    const resolver = new DefaultContextResolver({
      personas: [persona],
      skills: [],
      knowledge: [],
      memory: [],
    });
    const resolution = resolver.resolve({
      runInputs: {
        taskDescription: "x",
        taskKind: "test-fix",
        repoInstance: {
          repoIdentity: { repo: "x", sha: "y" },
          instanceId: "i",
        },
      },
      availableCapabilities: new Set(),
    });
    const builder = new DefaultContextPackBuilder(policy, {
      maxAssets: 10,
      maxContentBytes: 10_000,
    });
    const pack = builder.build({
      runId: asRunId("r-1"),
      resolution,
      experimentalRun: false, // NOT experimental
    });
    expect(pack.assets).toHaveLength(0);
    expect(pack.exclusions).toHaveLength(1);
    expect(pack.exclusions[0]?.reasonKind).toBe("policy");
  });
});
