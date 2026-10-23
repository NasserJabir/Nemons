/**
 * Stage B — Golden Task fixture (mini-GT-01).
 *
 * Inspired by the project brief's GT-01 (which validates identity and
 * baseline invariants on a controlled fixture). This Stage B fixture
 * validates the full Nemons lifecycle on a controlled scenario:
 *
 *   Persona (approved) + Skill (approved)
 *   → Run creation (test-fix task)
 *   → Context Pack build (assets included)
 *   → Mock Adapter invocation (claimed succeeded)
 *   → Evidence collection (multiple records)
 *   → Evidence validation (hash verification)
 *   → Evaluation (verified_succeeded)
 *   → Run.markSucceeded (terminal, with evidence)
 *
 * The fixture is DETERMINISTIC: given the same inputs, it produces the
 * same observable outcome on every run. This is the architectural
 * requirement for a Golden Task (Stage 0 of the GT-01 protocol).
 *
 * Stage C will replace the MockAdapter with a real adapter (after the
 * required harness authorization). The Golden Task contract below
 * remains the same; only the adapter implementation changes.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { buildRuntime } from "../../src/runtime.js";
import {
  InMemoryPolicyRuleRegistry,
} from "../../src/policy/policy-contracts.js";
import { DefaultPolicyEngine } from "../../src/policy/policy-engine.js";
import { BUILTIN_POLICY_RULES } from "../../src/policy/builtin-rules.js";
import type { PolicyRule } from "../../src/policy/policy-contracts.js";
import { DefaultContextResolver } from "../../src/context/context-resolver.js";
import { DefaultContextPackBuilder } from "../../src/context/context-pack-builder.js";
import { InMemoryRunManager } from "../../src/run/run-manager.js";
import {
  asPersonaId,
  asSkillId,
  asKnowledgeId,
} from "../../src/core/identifiers.js";
import type { Persona } from "../../src/schemas/persona.js";
import type { Skill } from "../../src/schemas/skill.js";
import type { Knowledge } from "../../src/schemas/knowledge.js";
import type { RunInputs } from "../../src/schemas/run.js";

/**
 * The Golden Task's identity. Stable across runs; used as the
 * reference for fixture reproducibility.
 *
 * (Stage C will add a FIXTURE_SHA that pins a repository identity;
 * the in-memory fixture here is Stage-B-scoped only.)
 */
export const GT_FIXTURE_ID = "nemons.golden-task.mini-gt-01.stage-b";

/**
 * The Persona used by the Golden Task. Approved, applicable to test-fix.
 */
export const GT_PERSONA: Persona = {
  id: asPersonaId("gt.persona.test-fix-engineer"),
  version: "1.0.0",
  provenance: {
    kind: "approved",
    source: {
      kind: "human",
      actor: "nemons.architect",
      at: "2024-01-01T00:00:00Z",
    },
  },
  role: "Test-Fix Engineer",
  responsibilities: [
    "isolate the failing test",
    "implement a minimal fix",
    "re-run the test suite to verify",
  ],
  workingApproach:
    "Run the failing test first, read the failure, isolate the cause, " +
    "implement the minimal fix, re-run the test, verify no regressions.",
  constraints: {
    mustNot: [
      "modify unrelated files",
      "introduce new dependencies without explicit approval",
    ],
    scope: ["src/"],
  },
  applicability: { taskKinds: ["test-fix"] },
};

/**
 * The Skill used by the Golden Task. Approved, requires shell exec.
 */
export const GT_SKILL: Skill = {
  id: asSkillId("gt.skill.run-tests"),
  version: "1.0.0",
  provenance: {
    kind: "approved",
    source: {
      kind: "human",
      actor: "nemons.architect",
      at: "2024-01-01T00:00:00Z",
    },
  },
  name: "run-tests",
  description: "Run the test suite and report failures.",
  applicability: { taskKinds: ["test-fix"] },
  inputs: [{ name: "filter", type: "string", required: false }],
  outputs: [{ name: "report", type: "object" }],
  requiredCapabilities: [
    { capability: "tool.shell.exec", required: true },
    { capability: "tool.file.read", required: true },
  ],
};

/**
 * The Knowledge item used by the Golden Task.
 */
export const GT_KNOWLEDGE: Knowledge = {
  id: asKnowledgeId("gt.knowledge.test-runner-config"),
  version: "1.0.0",
  provenance: {
    kind: "approved",
    source: {
      kind: "human",
      actor: "nemons.architect",
      at: "2024-01-01T00:00:00Z",
    },
  },
  title: "Test Runner Configuration",
  summary:
    "How the project's test runner is configured: vitest with config at vitest.config.ts.",
  content:
    "Run tests with `npm test`. The vitest config is at vitest.config.ts; " +
    "it includes tests/**/*.test.ts. Coverage uses v8 provider.",
  applicability: {
    subjectKind: "repository",
    taskKinds: ["test-fix"],
  },
};

/**
 * The Run inputs for the Golden Task.
 */
export const GT_RUN_INPUTS: RunInputs = {
  taskDescription: "Fix the failing test in users.test.ts (test was expecting positive result but received negative).",
  taskKind: "test-fix",
  taskTags: ["vitest", "unit-test"],
  repoInstance: {
    repoIdentity: {
      repo: "https://example.com/nemons-fixtures/mini-gt-01.git",
      sha: "0000000000000000000000000000000000000000",
    },
    instanceId: "gt-inst-1",
  },
};

/**
 * A custom rule that allows the Golden Task's specific Run + transitions.
 * This rule is intentionally narrow: it only allows `run.start`,
 * `run.transition_state`, and `run.record_evidence` for the Golden Task.
 */
const allowGoldenTaskRule: PolicyRule = {
  ruleId: "nemons.golden-task.allow",
  description: "Allow Golden Task (mini-GT-01) operations",
  appliesTo: ["run.start", "run.transition_state", "run.record_evidence"],
  evaluate: (ctx) => ({
    ruleId: "nemons.golden-task.allow",
    ruleDescription: "Allow Golden Task operations",
    outcome: "allow" as const,
    reason: "Golden Task (mini-GT-01) explicit allow",
  }),
};

/**
 * The evaluation criteria for the Golden Task. The fixture expects
 * the MockAdapter to produce a successful outcome, AND that a
 * verification_report Evidence is recorded (representing an external
 * verifier's confirmation that the test now passes).
 */
const GT_CRITERIA = [
  {
    id: "tests-pass",
    description: "All targeted tests pass after the fix",
    requiredEvidenceKinds: ["verification_report" as const],
    required: true,
  },
] as const;

describe("Stage B — Golden Task (mini-GT-01)", () => {
  let registry: InMemoryPolicyRuleRegistry;
  let engine: DefaultPolicyEngine;
  let runManager: InMemoryRunManager;
  let runtime: ReturnType<typeof buildRuntime>;

  beforeEach(() => {
    registry = new InMemoryPolicyRuleRegistry();
    for (const rule of BUILTIN_POLICY_RULES) registry.register(rule);
    registry.register(allowGoldenTaskRule);
    engine = new DefaultPolicyEngine(registry);
    runManager = new InMemoryRunManager(engine);
    runtime = buildRuntime(); // MockAdapter registered by default
  });

  describe("fixture reproducibility", () => {
    it("the fixture id is stable across test runs", () => {
      expect(GT_FIXTURE_ID).toBe("nemons.golden-task.mini-gt-01.stage-b");
    });

    it("the fixture Persona is approved and applicable to test-fix", () => {
      expect(GT_PERSONA.provenance.kind).toBe("approved");
      expect(GT_PERSONA.applicability.taskKinds).toContain("test-fix");
    });

    it("the fixture Skill is approved and requires tool.shell.exec", () => {
      expect(GT_SKILL.provenance.kind).toBe("approved");
      const required = GT_SKILL.requiredCapabilities.find(
        (c) => c.capability === "tool.shell.exec",
      );
      expect(required).toBeDefined();
      expect(required?.required).toBe(true);
    });
  });

  describe("full lifecycle execution (deterministic)", () => {
    it("executes the full pipeline: create → start → invoke → evidence → evaluate → succeed", async () => {
      // 1. Build catalogs from fixture assets
      const resolver = new DefaultContextResolver({
        personas: [GT_PERSONA],
        skills: [GT_SKILL],
        knowledge: [GT_KNOWLEDGE],
        memory: [],
      });

      // 2. Resolve context (MockAdapter advertises the required capabilities)
      const mockCapabilities = runtime.adapterRegistry
        .get("mock")
        .getCapabilities().capabilities;
      const resolution = resolver.resolve({
        runInputs: GT_RUN_INPUTS,
        availableCapabilities: mockCapabilities,
      });

      // Invariant: all three fixture assets are included
      expect(resolution.personas[0]?.included).toBe(true);
      expect(resolution.skills[0]?.included).toBe(true);
      expect(resolution.knowledge[0]?.included).toBe(true);

      // 3. Build the Context Pack
      const builder = new DefaultContextPackBuilder(engine, {
        maxAssets: 10,
        maxContentBytes: 10_000,
      });
      const contextPack = builder.build({
        runId: "r-gt-1" as never, // placeholder; real runId comes below
        resolution,
        availableCapabilities: mockCapabilities,
      });
      // Invariant: all three approved assets are in the pack
      expect(contextPack.assets).toHaveLength(3);
      // No exclusions (all approved + applicable)
      expect(contextPack.exclusions).toHaveLength(0);

      // 4. Create the Run
      const run = runManager.createRun({
        runInputs: GT_RUN_INPUTS,
        contextPackId: contextPack.id,
        provenance: {
          kind: "observed",
          source: {
            kind: "human",
            actor: "nemons.golden-task.runner",
            at: "2024-01-01T00:00:00Z",
          },
        },
      });
      expect(run.state).toBe("pending");

      // 5. Start the Run
      const started = runManager.startRun(run.id);
      expect(started.state).toBe("in_progress");

      // 6. Invoke the MockAdapter
      const adapter = runtime.adapterRegistry.get("mock");
      const invocation = await adapter.invoke({
        runId: run.id,
        contextPack: { ...contextPack, runId: run.id },
        runInputs: GT_RUN_INPUTS,
      });
      // Invariant: MockAdapter claims succeeded for non-FAIL: tasks
      expect(invocation.outputs.claimedOutcome).toBe("succeeded");

      // 7. Record the adapter's outputs on the Run
      runManager.recordOutputs(run.id, invocation.outputs);

      // 8. Collect Evidence from the adapter invocation
      const collectedEvidence = runtime.evidenceCollector.fromAdapterInvocation(
        run.id,
        invocation,
      );
      // Invariant: at least 2 records (1 for outputs + 2 events)
      expect(collectedEvidence.length).toBeGreaterThanOrEqual(2);

      // 9. Verify each Evidence's content hash
      const verifiedEvidence = collectedEvidence.map((e) =>
        runtime.evidenceValidator.verify(e),
      );
      for (const e of verifiedEvidence) {
        expect(e.verified).toBe(true);
        runManager.recordEvidence(run.id, e.id);
      }

      // 10. Add an explicit verification_report Evidence (representing
      //     an external test run that confirms the fix)
      const verificationEvidence = runtime.evidenceCollector.fromVerificationResult(
        run.id,
        {
          kind: "verification_report",
          claim: "Targeted test now passes; no regressions in suite",
          payload: JSON.stringify({
            passed: true,
            failing: 0,
            total: 42,
            regressions: 0,
          }),
        },
      );
      const verifiedVerification = runtime.evidenceValidator.verify(verificationEvidence);
      expect(verifiedVerification.verified).toBe(true);
      runManager.recordEvidence(run.id, verifiedVerification.id);

      // 11. Evaluate the Run against the Golden Task criteria
      const evaluation = runtime.evaluationEngine.evaluate({
        run: runManager.getRun(run.id)!,
        criteria: GT_CRITERIA,
        evidence: [...verifiedEvidence, verifiedVerification],
        evaluator: "nemons.golden-task.evaluator",
      });
      // Invariant: the evaluation produces verified_succeeded
      expect(evaluation.overallResult).toBe("verified_succeeded");

      // 12. Record the evaluation on the Run
      runManager.recordEvaluation(run.id, evaluation.id);

      // 13. Mark the Run as succeeded (now Evidence is present)
      const succeeded = runManager.markSucceeded(run.id);
      // Invariant: the Run is in succeeded state with evidence + evaluation refs
      expect(succeeded.state).toBe("succeeded");
      expect(succeeded.evidenceRefs?.length).toBeGreaterThan(0);
      expect(succeeded.evaluationRef).toBe(evaluation.id);
      expect(succeeded.endedAt).toBeDefined();
    });
  });

  describe("Golden Task negative path — verifies hard-deny at each stage", () => {
    it("the Golden Task's candidate Persona is NOT silently approved", () => {
      // Take the Golden Persona but DOWNGRADE it to candidate
      const candidatePersona: Persona = {
        ...GT_PERSONA,
        id: asPersonaId("gt.persona.candidate"),
        provenance: {
          kind: "proposed", // candidate, NOT approved
          source: GT_PERSONA.provenance.source,
        },
      };
      const resolver = new DefaultContextResolver({
        personas: [candidatePersona],
        skills: [],
        knowledge: [],
        memory: [],
      });
      const resolution = resolver.resolve({
        runInputs: GT_RUN_INPUTS,
        availableCapabilities: new Set(),
      });
      const builder = new DefaultContextPackBuilder(engine, {
        maxAssets: 10,
        maxContentBytes: 10_000,
      });
      // NOT experimental — candidate inclusion is policy-excluded
      const pack = builder.build({
        runId: "r-gt-neg-1" as never,
        resolution,
      });
      expect(pack.assets).toHaveLength(0);
      expect(pack.exclusions).toHaveLength(1);
      expect(pack.exclusions[0]?.reasonKind).toBe("policy");
    });

    it("the Golden Task cannot be marked succeeded WITHOUT Evidence", () => {
      const run = runManager.createRun({
        runInputs: GT_RUN_INPUTS,
        contextPackId: "cp-gt-neg-2" as never,
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "x", at: "x" },
        },
      });
      runManager.startRun(run.id);
      // No Evidence recorded
      expect(() => runManager.markSucceeded(run.id)).toThrow();
    });

    it("the Golden Task cannot be promoted to a non-test-fix task kind", () => {
      // Verify the fixture's Run inputs specify taskKind = "test-fix"
      expect(GT_RUN_INPUTS.taskKind).toBe("test-fix");
      // A "feature" task would not be eligible for the test-fix Persona
      const nonMatchingRun: RunInputs = {
        ...GT_RUN_INPUTS,
        taskKind: "feature",
      };
      const resolver = new DefaultContextResolver({
        personas: [GT_PERSONA],
        skills: [],
        knowledge: [],
        memory: [],
      });
      const resolution = resolver.resolve({
        runInputs: nonMatchingRun,
        availableCapabilities: new Set(),
      });
      // The Persona is NOT applicable to a "feature" task
      expect(resolution.personas[0]?.included).toBe(false);
      expect(resolution.personas[0]?.exclusionReasonKind).toBe("applicability");
    });
  });
});
