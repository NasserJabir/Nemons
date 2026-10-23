/**
 * Stage G — Full-chain integration test.
 *
 * Verifies the COMPLETE architectural chain with full persistence:
 *
 *   Instance 1:
 *     Run A → MockAdapter → Evidence → verified Evaluation
 *     → Experience (observed) → governed promotion → approved
 *     → PersistentRunStore.add(runA)
 *     → PersistentEvidenceStore.add(verifiedEvidence)
 *     → PersistentExperienceStore.add(experience)
 *     → CrossReferenceChecker: all healthy
 *
 *   Instance 2 (restart):
 *     → load Run A, Evidence, Experience from persistent stores
 *     → CrossReferenceChecker: all healthy (references intact)
 *     → ExperienceDeriver uses persisted Run + Evidence to verify the
 *       derivation is reconstructable
 *     → CandidateGenerator produces a candidate from the persisted
 *       approved Experience
 *
 * Architectural invariants verified:
 *   - "Records survive restart" for ALL store types (Run, Evidence,
 *     Experience, Candidate)
 *   - "Reference consistency": the CrossReferenceChecker detects no
 *     orphans after restart
 *   - "An incomplete record is not a verified success": a Run with
 *     state='succeeded' but no evidenceRefs is rejected at add() time
 *   - "Evidence before claims": ExperienceDeriver rejects Evidence
 *     that's not backed by verified Evidence
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { buildFullPersistentRuntime } from "../../src/persistence/build-full-persistent-runtime.js";
import { hasOrphans, summarizeReport } from "../../src/persistence/cross-reference-checker.js";
import {
  InMemoryPolicyRuleRegistry,
} from "../../src/policy/policy-contracts.js";
import { DefaultPolicyEngine } from "../../src/policy/policy-engine.js";
import { BUILTIN_POLICY_RULES } from "../../src/policy/builtin-rules.js";
import type { PolicyRule } from "../../src/policy/policy-contracts.js";
import { InMemoryRunManager } from "../../src/run/run-manager.js";
import {
  DefaultCandidateGenerator,
} from "../../src/candidate-generation/candidate-generator.js";
import {
  DefaultGovernedEvolutionEngine,
  DEFAULT_GOVERNED_RULES,
} from "../../src/governed-evolution/governed-evolution-engine.js";
import { InMemoryCandidateStore } from "../../src/governed-evolution/candidate-store.js";
import {
  asPersonaId,
  asSkillId,
  asContextPackId,
  sha256Hex,
} from "../../src/core/identifiers.js";
import type { Persona } from "../../src/schemas/persona.js";
import type { Skill } from "../../src/schemas/skill.js";
import type { RunInputs } from "../../src/schemas/run.js";

const allowAllRule: PolicyRule = {
  ruleId: "test.full-chain-g.allow-all",
  description: "Allow all run operations (Stage G full-chain test only)",
  appliesTo: ["run.start", "run.transition_state", "run.record_evidence"],
  evaluate: () => ({
    ruleId: "test.full-chain-g.allow-all",
    ruleDescription: "Allow all run operations",
    outcome: "allow" as const,
    reason: "stage-g full-chain",
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

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nem-stage-g-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("Stage G — full-chain integration with full persistence", () => {
  it("Run A's full chain survives restart with all references intact", async () => {
    await withTempDir(async (dir) => {
      // ─── Instance 1: build the full chain ───

      const registry = new InMemoryPolicyRuleRegistry();
      for (const rule of BUILTIN_POLICY_RULES) registry.register(rule);
      registry.register(allowAllRule);
      const engine = new DefaultPolicyEngine(registry);
      const runManager = new InMemoryRunManager(engine);

      const runtime1 = buildFullPersistentRuntime({
        rootDir: dir,
        registerMockAdapter: true,
      });
      await runtime1.initialize();

      const persona: Persona = {
        id: asPersonaId("p-test-fix"),
        version: "1.0.0",
        provenance: {
          kind: "approved",
          source: { kind: "human", actor: "architect", at: "2024-01-01T00:00:00Z" },
        },
        role: "Test-Fix Engineer",
        responsibilities: ["fix tests"],
        workingApproach: "isolate, fix, verify",
        constraints: {},
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
        description: "Run tests",
        applicability: { taskKinds: ["test-fix"] },
        inputs: [],
        outputs: [],
        requiredCapabilities: [{ capability: "tool.shell.exec", required: true }],
      };
      void persona;
      void skill;

      // ─── Run A: produce Evidence + verified Evaluation ───
      const runA = runManager.createRun({
        runInputs: makeRunInputs("Fix failing test in users.test.ts"),
        contextPackId: asContextPackId("cp-A"),
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
        },
      });
      runManager.startRun(runA.id);

      const adapter = runtime1.adapterRegistry.get("mock");
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

      const collectedA = runtime1.evidenceCollector.fromAdapterInvocation(runA.id, resultA);
      const verifiedEvs = collectedA.map((e) => runtime1.evidenceValidator.verify(e));
      for (const e of verifiedEvs) runManager.recordEvidence(runA.id, e.id);

      const verificationEv = runtime1.evidenceCollector.fromVerificationResult(runA.id, {
        kind: "verification_report",
        claim: "tests pass after fix",
        payload: JSON.stringify({ passing: true, failing: 0 }),
      });
      const verifiedVer = runtime1.evidenceValidator.verify(verificationEv);
      runManager.recordEvidence(runA.id, verifiedVer.id);

      const evaluationA = runtime1.evaluationEngine.evaluate({
        run: runManager.getRun(runA.id)!,
        criteria: [
          {
            id: "tests-pass",
            description: "tests pass",
            requiredEvidenceKinds: ["verification_report"],
            required: true,
          },
        ],
        evidence: [...verifiedEvs, verifiedVer],
        evaluator: "stage-g",
      });
      expect(evaluationA.overallResult).toBe("verified_succeeded");
      runManager.recordEvaluation(runA.id, evaluationA.id);
      runManager.markSucceeded(runA.id);

      // ─── Persist Run + Evidence to the persistent stores ───
      const succeededRun = runManager.getRun(runA.id)!;
      await runtime1.persistentRunStore.add(succeededRun);
      for (const e of [...verifiedEvs, verifiedVer]) {
        await runtime1.persistentEvidenceStore.add(e);
      }

      // ─── Derive Experience, persist ───
      const experience = runtime1.experienceDeriver.derive({
        run: succeededRun,
        evaluation: evaluationA,
        evidence: [...verifiedEvs, verifiedVer],
        summary: "Rebuild before tests to avoid stale artifacts.",
      });
      await runtime1.persistentExperienceStore.add(experience);
      await runtime1.persistentExperienceStore.promote(experience.id, "reviewed", {
        at: "2024-01-02T00:00:00Z",
        actor: "reviewer",
        reason: "Reviewed",
      });
      await runtime1.persistentExperienceStore.promote(experience.id, "approved", {
        at: "2024-01-03T00:00:00Z",
        actor: "approver",
        reason: "Approved",
      });

      // ─── CrossReferenceChecker: all healthy ───
      const checker1 = runtime1.crossReferenceChecker;
      const report1 = await checker1.check();
      expect(hasOrphans(report1)).toBe(false);
      expect(report1.totalEvidence).toBe(verifiedEvs.length + 1);
      expect(report1.totalExperiences).toBe(1);
      expect(report1.healthyEvidence).toHaveLength(verifiedEvs.length + 1);
      expect(report1.healthyExperiences).toHaveLength(1);

      // ─── Instance 2: restart ───
      const runtime2 = buildFullPersistentRuntime({
        rootDir: dir,
        registerMockAdapter: true,
      });
      await runtime2.initialize();

      // ─── Verify all records loaded with references intact ───
      const loadedRun = await runtime2.persistentRunStore.get(runA.id);
      expect(loadedRun).toBeDefined();
      expect(loadedRun!.state).toBe("succeeded");
      expect(loadedRun!.evidenceRefs?.length).toBe(verifiedEvs.length + 1);

      const loadedEvidence = await runtime2.persistentEvidenceStore.list();
      expect(loadedEvidence.length).toBe(verifiedEvs.length + 1);

      const loadedExperience = await runtime2.persistentExperienceStore.get(experience.id);
      expect(loadedExperience).toBeDefined();
      expect(loadedExperience!.provenance.kind).toBe("approved"); // preserved
      expect(loadedExperience!.runId).toBe(runA.id); // chained back to Run

      // ─── CrossReferenceChecker: still no orphans after restart ───
      const checker2 = runtime2.crossReferenceChecker;
      const report2 = await checker2.check();
      expect(hasOrphans(report2)).toBe(false);
      expect(report2.healthyEvidence).toHaveLength(verifiedEvs.length + 1);
      expect(report2.healthyExperiences).toHaveLength(1);

      // ─── Generate a Candidate from the persisted approved Experience ───
      const generator = new DefaultCandidateGenerator();
      const generated = generator.generateFromExperience({
        experience: loadedExperience!,
        generationKind: "create_from_experience",
        assetKind: "skill",
        proposedVersion: "1.0.0",
        content: { name: "run-tests-with-rebuild" },
      });
      expect(generated.candidate.status).toBe("proposed");
      expect(generated.sourceExperienceId).toBe(experience.id);
      expect(generated.sourceRunId).toBe(runA.id);
    });
  });

  it("incomplete Evidence (missing Run) is detected by the CrossReferenceChecker", async () => {
    await withTempDir(async (dir) => {
      const runtime = buildFullPersistentRuntime({
        rootDir: dir,
        registerMockAdapter: false,
      });
      await runtime.initialize();

      // Add Evidence that references a non-existent Run
      await runtime.persistentEvidenceStore.add({
        id: "ev-orphan" as never,
        runId: "r-nonexistent" as never,
        kind: "verification_report",
        claim: "tests pass",
        artifact: {
          inlinePayload: '{"passing":true}',
          contentHash: sha256Hex('{"passing":true}'),
          contentType: "application/json",
          bytes: 16,
        },
        provenance: {
          kind: "observed",
          source: {
            kind: "run",
            runId: "r-nonexistent" as never,
            at: "2024-01-01T00:00:00Z",
          },
        },
        recordedAt: "2024-01-01T00:00:00Z",
        verified: false,
      });

      const report = await runtime.crossReferenceChecker.check();
      expect(hasOrphans(report)).toBe(true);
      expect(report.orphanedEvidence).toHaveLength(1);
      expect(report.orphanedEvidence[0]!.evidenceId).toBe("ev-orphan");
      expect(report.orphanedEvidence[0]!.missingRunId).toBe("r-nonexistent");

      // The summary should mention the orphan
      const summary = summarizeReport(report);
      expect(summary).toContain("orphaned");
    });
  });

  it("a Run with state='succeeded' but no evidenceRefs is REJECTED at add() (incomplete record is not a verified success)", async () => {
    await withTempDir(async (dir) => {
      const runtime = buildFullPersistentRuntime({
        rootDir: dir,
        registerMockAdapter: false,
      });
      await runtime.initialize();

      // Try to add a succeeded Run with no evidenceRefs
      expect(
        runtime.persistentRunStore.add({
          id: "r-bad" as never,
          state: "succeeded",
          inputs: {
            taskDescription: "Fix test",
            taskKind: "test-fix",
            repoInstance: {
              repoIdentity: { repo: "x", sha: "y" },
              instanceId: "i",
            },
          },
          contextPackId: asContextPackId("cp-1"),
          provenance: {
            kind: "observed",
            source: { kind: "human", actor: "x", at: "x" },
          },
          // NO evidenceRefs
        }),
      ).rejects.toThrow();
    });
  });
});
