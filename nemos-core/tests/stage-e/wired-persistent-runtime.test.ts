/**
 * Stage E — Wired persistent runtime integration test.
 *
 * Verifies that `buildPersistentRuntime()` produces a runtime whose
 * Experience store persists across restarts. Specifically:
 *
 *   - Instance 1 (Run A's runtime): derive Experience, promote to approved.
 *   - Instance 2 (Run B's runtime): retrieve the approved Experience
 *     via the wired ExperienceRetriever — without re-deriving.
 *
 * This is the architectural proof that Stage E works end-to-end:
 * records survive restart, integrity is verified on load, and the
 * trust status is preserved (an `observed` record on disk stays
 * `observed` when loaded; an `approved` record stays `approved`).
 *
 * Architectural principles enforced by this test:
 *   - "Records survive restart and can be retrieved and verified
 *     without silently changing their trust status."
 *   - "No silent mutation": the persistent store does NOT modify the
 *     provenance kind on read.
 *   - "Failure handling": a tampered record is quarantined, not
 *     silently dropped.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { buildPersistentRuntime } from "../../src/persistence/build-persistent-runtime.js";
import {
  InMemoryPolicyRuleRegistry,
} from "../../src/policy/policy-contracts.js";
import { DefaultPolicyEngine } from "../../src/policy/policy-engine.js";
import { BUILTIN_POLICY_RULES } from "../../src/policy/builtin-rules.js";
import type { PolicyRule } from "../../src/policy/policy-contracts.js";
import { InMemoryRunManager } from "../../src/run/run-manager.js";
import { experienceToMemoryRecord } from "../../src/experience/experience-memory-bridge.js";
import { DefaultContextResolver } from "../../src/context/context-resolver.js";
import { DefaultContextPackBuilder } from "../../src/context/context-pack-builder.js";
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
  ruleId: "test.stage-e.allow-all",
  description: "Allow all run operations (Stage E test only)",
  appliesTo: ["run.start", "run.transition_state", "run.record_evidence"],
  evaluate: () => ({
    ruleId: "test.stage-e.allow-all",
    ruleDescription: "Allow all run operations",
    outcome: "allow" as const,
    reason: "stage-e test",
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

async function withTempDir<T>(
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nem-stage-e-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function buildTestRuntime(rootDir: string) {
  const registry = new InMemoryPolicyRuleRegistry();
  for (const rule of BUILTIN_POLICY_RULES) registry.register(rule);
  registry.register(allowAllRule);
  const engine = new DefaultPolicyEngine(registry);
  const runManager = new InMemoryRunManager(engine);
  const runtime = buildPersistentRuntime({
    rootDir,
    registerMockAdapter: true,
  });
  return { engine, runManager, runtime };
}

describe("Stage E — wired persistent runtime integration", () => {
  describe("buildPersistentRuntime structure", () => {
    it("exposes a PersistentExperienceStore and an ExperienceRetriever", async () => {
      await withTempDir(async (dir) => {
        const { runtime } = buildTestRuntime(dir);
        await runtime.initialize();
        expect(runtime.experienceStore).toBeDefined();
        expect(runtime.experienceRetriever).toBeDefined();
        expect(typeof runtime.experienceStore.add).toBe("function");
        expect(typeof runtime.experienceStore.get).toBe("function");
        expect(typeof runtime.experienceStore.promote).toBe("function");
        expect(typeof runtime.experienceStore.healthCheck).toBe("function");
      });
    });

    it("starts with an empty store", async () => {
      await withTempDir(async (dir) => {
        const { runtime } = buildTestRuntime(dir);
        await runtime.initialize();
        expect(await runtime.experienceStore.size()).toBe(0);
        expect(await runtime.experienceStore.list()).toEqual([]);
      });
    });
  });

  describe("full restart simulation: Run A → restart → Run B retrieves", () => {
    it("Run A's Experience is retrievable after restart by Run B", async () => {
      await withTempDir(async (dir) => {
        // ─── Instance 1: Run A's runtime ───

        const instance1 = buildTestRuntime(dir);
        await instance1.runtime.initialize();
        const mockCaps = instance1.runtime.adapterRegistry
          .get("mock")
          .getCapabilities().capabilities;

        // Run A: produce Evidence + verified Evaluation
        const runA = instance1.runManager.createRun({
          runInputs: makeRunInputs("Fix test 1"),
          contextPackId: asContextPackId("cp-A"),
          provenance: {
            kind: "observed",
            source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
          },
        });
        instance1.runManager.startRun(runA.id);
        const adapter = instance1.runtime.adapterRegistry.get("mock");
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
          runInputs: makeRunInputs("Fix test 1"),
        });
        instance1.runManager.recordOutputs(runA.id, resultA.outputs);
        const evs = instance1.runtime.evidenceCollector.fromAdapterInvocation(
          runA.id,
          resultA,
        );
        const verifiedEvs = evs.map((e) => instance1.runtime.evidenceValidator.verify(e));
        for (const e of verifiedEvs) {
          instance1.runManager.recordEvidence(runA.id, e.id);
        }
        const verificationEv = instance1.runtime.evidenceCollector.fromVerificationResult(
          runA.id,
          {
            kind: "verification_report",
            claim: "tests pass",
            payload: JSON.stringify({ passing: true }),
          },
        );
        const verifiedVer = instance1.runtime.evidenceValidator.verify(verificationEv);
        instance1.runManager.recordEvidence(runA.id, verifiedVer.id);
        const evaluationA = instance1.runtime.evaluationEngine.evaluate({
          run: instance1.runManager.getRun(runA.id)!,
          criteria: [
            {
              id: "tests-pass",
              description: "tests pass",
              requiredEvidenceKinds: ["verification_report"],
              required: true,
            },
          ],
          evidence: [...verifiedEvs, verifiedVer],
          evaluator: "stage-e-test",
        });
        expect(evaluationA.overallResult).toBe("verified_succeeded");
        instance1.runManager.recordEvaluation(runA.id, evaluationA.id);
        instance1.runManager.markSucceeded(runA.id);

        // Derive Experience from Run A
        const experience = instance1.runtime.experienceDeriver.derive({
          run: instance1.runManager.getRun(runA.id)!,
          evaluation: evaluationA,
          evidence: [...verifiedEvs, verifiedVer],
          summary: "Rebuild before tests to avoid stale artifacts.",
        });
        await instance1.runtime.experienceStore.add(experience);
        await instance1.runtime.experienceStore.promote(experience.id, "reviewed", {
          at: "2024-01-02T00:00:00Z",
          actor: "reviewer",
          reason: "Reviewed",
        });
        await instance1.runtime.experienceStore.promote(experience.id, "approved", {
          at: "2024-01-03T00:00:00Z",
          actor: "approver",
          reason: "Approved",
        });

        // Verify Instance 1 sees the approved Experience
        const expInInstance1 = await instance1.runtime.experienceStore.get(experience.id);
        expect(expInInstance1).toBeDefined();
        expect(expInInstance1!.provenance.kind).toBe("approved");

        // ─── Instance 1 shuts down ───
        // (Drop references; the data is on disk.)

        // ─── Instance 2: Run B's runtime ───

        const instance2 = buildTestRuntime(dir);
        await instance2.runtime.initialize();

        // Run B's persistent store should see the Experience persisted by Instance 1.
        const expInInstance2 = await instance2.runtime.experienceStore.get(experience.id);
        // CRITICAL INVARIANT: the Experience survived restart with its
        // provenance kind intact.
        expect(expInInstance2).toBeDefined();
        expect(expInInstance2!.provenance.kind).toBe("approved");
        expect(expInInstance2!.summary).toBe("Rebuild before tests to avoid stale artifacts.");
        expect(expInInstance2!.provenance.reviewTrail).toHaveLength(2);
        expect(expInInstance2!.runId).toBe(runA.id); // chained back to Run A

        // ─── Run B: include the Experience in its Context Pack ───

        // Bridge the Experience to a MemoryRecord
        const memoryRecord = experienceToMemoryRecord(expInInstance2!);
        expect(memoryRecord.provenance.kind).toBe("approved"); // preserved

        // Run B's catalogs include the Experience-Memory
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

        const resolver = new DefaultContextResolver({
          personas: [persona],
          skills: [skill],
          knowledge: [],
          memory: [memoryRecord],
        });
        const resolution = resolver.resolve({
          runInputs: makeRunInputs("Fix test 2"),
          availableCapabilities: mockCaps,
        });
        // The Experience-Memory is included
        expect(resolution.memory).toHaveLength(1);
        expect(resolution.memory[0]?.included).toBe(true);

        // Build the Context Pack
        const builder = new DefaultContextPackBuilder(instance2.engine, {
          maxAssets: 10,
          maxContentBytes: 10_000,
        });
        const pack = builder.build({
          runId: asRunId("r-B"),
          resolution,
          availableCapabilities: mockCaps,
        });
        expect(pack.assets).toHaveLength(3);
        const memoryAsset = pack.assets.find((a) => a.assetKind === "memory");
        expect(memoryAsset).toBeDefined();
        expect(memoryAsset!.provenanceKind).toBe("approved"); // preserved across the chain

        // Create + start Run B
        const runB = instance2.runManager.createRun({
          runInputs: makeRunInputs("Fix test 2"),
          contextPackId: pack.id,
          provenance: {
            kind: "observed",
            source: { kind: "human", actor: "tester", at: "2024-01-04T00:00:00Z" },
          },
        });
        const startedB = instance2.runManager.startRun(runB.id);
        expect(startedB.state).toBe("in_progress");

        // Run B invokes the adapter using the Experience-backed Context Pack
        const resultB = await adapter.invoke({
          runId: runB.id,
          contextPack: pack,
          runInputs: makeRunInputs("Fix test 2"),
        });
        expect(resultB.outputs.claimedOutcome).toBe("succeeded");
      });
    });
  });

  describe("architectural invariants in the persistent runtime", () => {
    it("the persistent store starts empty on a fresh directory", async () => {
      await withTempDir(async (dir) => {
        const { runtime } = buildTestRuntime(dir);
        await runtime.initialize();
        expect(await runtime.experienceStore.size()).toBe(0);
      });
    });

    it("the health check reports 0 healthy and 0 corrupt on a fresh store", async () => {
      await withTempDir(async (dir) => {
        const { runtime } = buildTestRuntime(dir);
        await runtime.initialize();
        const report = await runtime.experienceStore.healthCheck();
        expect(report.totalRecords).toBe(0);
        expect(report.healthy).toEqual([]);
        expect(report.corrupt).toEqual([]);
      });
    });

    it("an observed Experience stays observed across restart (no silent upgrade)", async () => {
      await withTempDir(async (dir) => {
        // Instance 1: add an observed Experience (no promotion)
        const instance1 = buildTestRuntime(dir);
        await instance1.runtime.initialize();
        const { asExperienceId } = await import("../../src/core/identifiers.js");
        const { asRunId, asEvaluationId, asEvidenceId } = await import("../../src/core/identifiers.js");
        const exp = {
          id: asExperienceId("x-obs-restart"),
          runId: asRunId("r-src"),
          evaluationId: asEvaluationId("ev-src"),
          provenance: {
            kind: "observed" as const,
            source: {
              kind: "evidence" as const,
              evidenceId: asEvidenceId("ev-src") as never,
              at: "2024-01-01T00:00:00Z",
            },
          },
          applicability: { taskKinds: ["test-fix"] },
          reusability: "reusable" as const,
          summary: "Observed — not yet promoted.",
          learnedAt: "2024-01-01T00:00:00Z",
        };
        await instance1.runtime.experienceStore.add(exp);

        // Instance 2: load — the Experience is STILL observed
        const instance2 = buildTestRuntime(dir);
        await instance2.runtime.initialize();
        const result = await instance2.runtime.experienceStore.get(exp.id);
        expect(result).toBeDefined();
        // CRITICAL: retrieval does NOT silently upgrade the trust status.
        expect(result!.provenance.kind).toBe("observed");
      });
    });

    it("a tampered record is quarantined on Instance 2 startup healthCheck", async () => {
      await withTempDir(async (dir) => {
        // Instance 1: write a record
        const instance1 = buildTestRuntime(dir);
        await instance1.runtime.initialize();
        const { asExperienceId, asRunId, asEvaluationId, asEvidenceId } = await import("../../src/core/identifiers.js");
        const exp = {
          id: asExperienceId("x-tamper-startup"),
          runId: asRunId("r-src"),
          evaluationId: asEvaluationId("ev-src"),
          provenance: {
            kind: "observed" as const,
            source: {
              kind: "evidence" as const,
              evidenceId: asEvidenceId("ev-src") as never,
              at: "2024-01-01T00:00:00Z",
            },
          },
          applicability: { taskKinds: ["test-fix"] },
          reusability: "reusable" as const,
          summary: "Will be tampered.",
          learnedAt: "2024-01-01T00:00:00Z",
        };
        await instance1.runtime.experienceStore.add(exp);

        // Tamper the file directly on disk
        const recordPath = path.join(dir, "records", "x-tamper-startup.json");
        const raw = await fs.readFile(recordPath, "utf8");
        const envelope = JSON.parse(raw);
        envelope.record.summary = "TAMPERED";
        await fs.writeFile(recordPath, JSON.stringify(envelope, null, 2), "utf8");

        // Instance 2: build with healthCheckOnStartup=true
        const registry = new InMemoryPolicyRuleRegistry();
        for (const rule of BUILTIN_POLICY_RULES) registry.register(rule);
        registry.register(allowAllRule);
        const engine = new DefaultPolicyEngine(registry);
        const runManager = new InMemoryRunManager(engine);
        const runtime = buildPersistentRuntime({
          rootDir: dir,
          registerMockAdapter: true,
          healthCheckOnStartup: true,
        });
        void runManager;
        void engine;
        await runtime.initialize();

        // The health check (run during initialize) should have quarantined the tampered record
        const report = await runtime.experienceStore.healthCheck();
        // After the startup healthCheck, the tampered record was quarantined
        // (so the second healthCheck sees 0 records and 0 corrupt)
        expect(report.totalRecords).toBe(0);
        expect(report.healthy).toEqual([]);

        // The quarantined record should be listed
        const quarantined = await runtime.experienceStore.listQuarantine();
        expect(quarantined).toHaveLength(1);
        expect(quarantined[0]!.id).toBe("x-tamper-startup");
        expect(quarantined[0]!.reason).toContain("hash mismatch");
      });
    });
  });
});
