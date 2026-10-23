/**
 * Stage D — Wired-runtime integration test.
 *
 * Verifies the full pipeline using `buildRuntime()` (the wired runtime):
 *
 *   Run A → MockAdapter → Evidence → verified Evaluation
 *   → ExperienceDeriver → Experience (observed)
 *   → Governed promotion (observed → reviewed → approved)
 *   → ExperienceRetriever → applicable Experience
 *   → experienceToMemoryRecord bridge → MemoryRecord
 *   → ContextResolver → included in ContextResolutionResult
 *   → ContextPackBuilder → Context Pack with the Experience as a Memory asset
 *
 * This is the architectural proof that Stage D's wiring is correct:
 * a verified-succeeded Run produces an Experience that, after governed
 * promotion, can be retrieved and included in a later Run's Context Pack
 * — with provenance preserved at every step.
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
import { experienceToMemoryRecord } from "../../src/experience/experience-memory-bridge.js";
import { includedExperienceIds } from "../../src/experience/experience-retriever.js";
import {
  asPersonaId,
  asSkillId,
  asRunId,
  asContextPackId,
} from "../../src/core/identifiers.js";
import type { Persona } from "../../src/schemas/persona.js";
import type { Skill } from "../../src/schemas/skill.js";
import type { RunInputs } from "../../src/schemas/run.js";

const allowAllRule: PolicyRule = {
  ruleId: "test.stage-d-wired.allow-all",
  description: "Allow all run operations (Stage D wired test only)",
  appliesTo: ["run.start", "run.transition_state", "run.record_evidence"],
  evaluate: () => ({
    ruleId: "test.stage-d-wired.allow-all",
    ruleDescription: "Allow all run operations",
    outcome: "allow" as const,
    reason: "stage-d-wired test",
  }),
};

function makeRunInputs(taskDescription: string): RunInputs {
  return {
    taskDescription,
    taskKind: "test-fix",
    taskTags: ["vitest"],
    repoInstance: {
      repoIdentity: { repo: "https://example.com/repo.git", sha: "abc123" },
      instanceId: "inst-1",
    },
  };
}

describe("Stage D — wired-runtime integration", () => {
  let registry: InMemoryPolicyRuleRegistry;
  let engine: DefaultPolicyEngine;
  let runManager: InMemoryRunManager;
  let runtime: ReturnType<typeof buildRuntime>;

  beforeEach(() => {
    registry = new InMemoryPolicyRuleRegistry();
    for (const rule of BUILTIN_POLICY_RULES) registry.register(rule);
    registry.register(allowAllRule);
    engine = new DefaultPolicyEngine(registry);
    runManager = new InMemoryRunManager(engine);
    runtime = buildRuntime();
  });

  describe("Run A → Experience → Run B (Context Pack includes Experience)", () => {
    it("exercises the full wired pipeline end-to-end", async () => {
      // ─── Setup: shared Persona + Skill ───

      const persona: Persona = {
        id: asPersonaId("p-test-fix"),
        version: "1.0.0",
        provenance: {
          kind: "approved",
          source: { kind: "human", actor: "architect", at: "2024-01-01T00:00:00Z" },
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
          source: { kind: "human", actor: "architect", at: "2024-01-01T00:00:00Z" },
        },
        name: "run-tests",
        description: "Run the test suite",
        applicability: { taskKinds: ["test-fix"] },
        inputs: [],
        outputs: [],
        requiredCapabilities: [{ capability: "tool.shell.exec", required: true }],
      };
      const mockCaps = runtime.adapterRegistry.get("mock").getCapabilities().capabilities;

      // ─── Run A: produce Evidence + verified Evaluation ───

      const runA = runManager.createRun({
        runInputs: makeRunInputs("Fix failing test in users.test.ts"),
        contextPackId: asContextPackId("cp-A-placeholder"),
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
        },
      });
      runManager.startRun(runA.id);

      const adapter = runtime.adapterRegistry.get("mock");
      const resultA = await adapter.invoke({
        runId: runA.id,
        contextPack: {
          id: asContextPackId("cp-A"),
          runId: runA.id,
          assets: [],
          exclusions: [],
          constraints: { maxAssets: 10, maxContentBytes: 10_000 },
          actualBytes: 0,
          createdAt: "2024-01-01T00:00:00Z",
        },
        runInputs: makeRunInputs("Fix failing test in users.test.ts"),
      });
      runManager.recordOutputs(runA.id, resultA.outputs);

      const collectedA = runtime.evidenceCollector.fromAdapterInvocation(runA.id, resultA);
      const verifiedA = collectedA.map((e) => runtime.evidenceValidator.verify(e));
      for (const e of verifiedA) runManager.recordEvidence(runA.id, e.id);

      const verificationEv = runtime.evidenceCollector.fromVerificationResult(runA.id, {
        kind: "verification_report",
        claim: "all tests now pass",
        payload: JSON.stringify({ passing: true, failing: 0 }),
      });
      const verifiedVer = runtime.evidenceValidator.verify(verificationEv);
      runManager.recordEvidence(runA.id, verifiedVer.id);

      const evaluationA = runtime.evaluationEngine.evaluate({
        run: runManager.getRun(runA.id)!,
        criteria: [
          {
            id: "tests-pass",
            description: "tests pass",
            requiredEvidenceKinds: ["verification_report"],
            required: true,
          },
        ],
        evidence: [...verifiedA, verifiedVer],
        evaluator: "stage-d-wired",
      });
      expect(evaluationA.overallResult).toBe("verified_succeeded");
      runManager.recordEvaluation(runA.id, evaluationA.id);
      runManager.markSucceeded(runA.id);

      // ─── Derive Experience from Run A ───

      const experience = runtime.experienceDeriver.derive({
        run: runManager.getRun(runA.id)!,
        evaluation: evaluationA,
        evidence: [...verifiedA, verifiedVer],
        summary: "Rebuild before tests to avoid stale artifacts.",
      });
      expect(experience.provenance.kind).toBe("observed");
      runtime.experienceStore.add(experience);

      // ─── Governed promotion: observed → reviewed → approved ───

      runtime.experienceStore.promote(experience.id, "reviewed", {
        at: "2024-01-02T00:00:00Z",
        actor: "reviewer-alice",
        reason: "Generalizes to other test-fix tasks.",
      });
      runtime.experienceStore.promote(experience.id, "approved", {
        at: "2024-01-03T00:00:00Z",
        actor: "owner-bob",
        reason: "Approved for reuse.",
      });

      // ─── Run B: retrieves approved Experience → bridges to Memory ───

      const retrievalB = runtime.experienceRetriever.retrieve({
        runInputs: makeRunInputs("Fix failing test in orders.test.ts"),
        adapterKind: "mock",
      });
      const retrieved = retrievalB.retrieved[0];
      expect(retrieved).toBeDefined();
      expect(retrieved!.included).toBe(true);
      expect(retrieved!.experience.provenance.kind).toBe("approved");

      // Bridge the retrieved Experience to a MemoryRecord
      const memoryRecord = experienceToMemoryRecord(retrieved!.experience);
      expect(memoryRecord.kind).toBe("experience");
      expect(memoryRecord.provenance.kind).toBe("approved"); // preserved
      expect(memoryRecord.derivedFromExperienceId).toBe(experience.id);
      expect(memoryRecord.derivedFromRunId).toBe(runA.id);

      // ─── Run B: ContextResolver includes the Experience-Memory ───

      const resolverB = new DefaultContextResolver({
        personas: [persona],
        skills: [skill],
        knowledge: [],
        memory: [memoryRecord],
      });
      const resolutionB = resolverB.resolve({
        runInputs: makeRunInputs("Fix failing test in orders.test.ts"),
        availableCapabilities: mockCaps,
      });
      // Invariant: the Experience-Memory is included (approved, applicable)
      expect(resolutionB.memory).toHaveLength(1);
      expect(resolutionB.memory[0]?.included).toBe(true);
      // And the Persona + Skill are included too
      expect(resolutionB.personas[0]?.included).toBe(true);
      expect(resolutionB.skills[0]?.included).toBe(true);

      // ─── Run B: ContextPackBuilder builds the pack ───

      const builder = new DefaultContextPackBuilder(engine, {
        maxAssets: 10,
        maxContentBytes: 10_000,
      });
      const packB = builder.build({
        runId: asRunId("r-B"),
        resolution: resolutionB,
        availableCapabilities: mockCaps,
      });

      // Invariant: the pack includes 3 assets (persona, skill, memory-experience)
      expect(packB.assets).toHaveLength(3);
      const assetKinds = packB.assets.map((a) => a.assetKind);
      expect(assetKinds).toContain("persona");
      expect(assetKinds).toContain("skill");
      expect(assetKinds).toContain("memory");

      // The memory asset's provenance is approved (preserved from the source Experience)
      const memoryAsset = packB.assets.find((a) => a.assetKind === "memory");
      expect(memoryAsset).toBeDefined();
      expect(memoryAsset!.provenanceKind).toBe("approved");

      // No exclusions (all assets approved + applicable)
      expect(packB.exclusions).toHaveLength(0);

      // ─── Run B: actual Run creation + execution ───

      const runB = runManager.createRun({
        runInputs: makeRunInputs("Fix failing test in orders.test.ts"),
        contextPackId: packB.id,
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "tester", at: "2024-01-04T00:00:00Z" },
        },
      });
      runManager.startRun(runB.id);

      const resultB = await adapter.invoke({
        runId: runB.id,
        contextPack: packB,
        runInputs: makeRunInputs("Fix failing test in orders.test.ts"),
      });
      runManager.recordOutputs(runB.id, resultB.outputs);
      expect(resultB.outputs.claimedOutcome).toBe("succeeded");

      // ─── Invariants summary ───
      // The Experience is still in the store, approved, with full trail
      const finalExp = runtime.experienceStore.get(experience.id)!;
      expect(finalExp.provenance.kind).toBe("approved");
      expect(finalExp.provenance.reviewTrail).toHaveLength(2);
      expect(finalExp.runId).toBe(runA.id);
      // The Run B's Context Pack's memory asset references the same Experience
      // (via the MemoryRecord's derivedFromExperienceId)
      const includedIds = includedExperienceIds(retrievalB);
      expect(includedIds).toContain(experience.id);
    });
  });

  describe("architectural invariants in the wired runtime", () => {
    it("the runtime exposes all Stage D components", () => {
      expect(runtime.experienceStore).toBeDefined();
      expect(runtime.experienceDeriver).toBeDefined();
      expect(runtime.experienceRetriever).toBeDefined();
    });

    it("the ExperienceStore starts empty", () => {
      expect(runtime.experienceStore.size()).toBe(0);
      expect(runtime.experienceStore.list()).toEqual([]);
    });

    it("the Retriever returns an empty result for an empty store", () => {
      const result = runtime.experienceRetriever.retrieve({
        runInputs: makeRunInputs("any task"),
        adapterKind: "mock",
      });
      expect(result.retrieved).toEqual([]);
      expect(result.retrievedAt).toBeDefined();
    });
  });
});
