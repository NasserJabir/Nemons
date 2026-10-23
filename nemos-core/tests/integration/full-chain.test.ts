/**
 * End-to-end integration test: full architectural chain.
 *
 *   Run A → MockAdapter → Evidence → verified Evaluation → Experience (observed)
 *   → governed promotion: observed → reviewed → approved
 *   → CandidateGenerator produces a Candidate (proposed) from the Experience
 *   → GovernedEvolutionEngine.propose() → requestReview → approve (with separation of duties)
 *   → Supersede (v1 → v2) — second candidate generated from the same Experience
 *   → Verify the version chain and active approved are correct
 *   → Restart simulation: PersistentCandidateStore loads the chain
 *
 * This is the architectural proof that the full chain works end-to-end:
 *
 *   "A Run produces evidence. Evidence supports evaluation.
 *    Evaluation justifies Experience. Experience may be reused
 *    under explicit conditions. Changes to operational assets
 *    remain governed."
 *
 * The CandidateGenerator is the link from "Experience" to
 * "Changes remain governed": it converts an approved Experience
 * into a candidate, which goes through governed review before
 * becoming an approved asset version.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { buildPersistentRuntime } from "../../src/persistence/build-persistent-runtime.js";
import { FileSystemStore } from "../../src/persistence/fs-json-store.js";
import { PersistentCandidateStore, candidateValidator } from "../../src/persistence/persistent-candidate-store.js";
import {
  DefaultCandidateGenerator,
} from "../../src/candidate-generation/candidate-generator.js";
import {
  InMemoryCandidateStore,
} from "../../src/governed-evolution/candidate-store.js";
import {
  DefaultGovernedEvolutionEngine,
  DEFAULT_GOVERNED_RULES,
} from "../../src/governed-evolution/governed-evolution-engine.js";
import {
  InMemoryPolicyRuleRegistry,
} from "../../src/policy/policy-contracts.js";
import { DefaultPolicyEngine } from "../../src/policy/policy-engine.js";
import { BUILTIN_POLICY_RULES } from "../../src/policy/builtin-rules.js";
import type { PolicyRule } from "../../src/policy/policy-contracts.js";
import { InMemoryRunManager } from "../../src/run/run-manager.js";
import {
  asPersonaId,
  asSkillId,
  asContextPackId,
} from "../../src/core/identifiers.js";
import type { Persona } from "../../src/schemas/persona.js";
import type { Skill } from "../../src/schemas/skill.js";
import type { RunInputs } from "../../src/schemas/run.js";
import type { CandidateRecord } from "../../src/schemas/candidate.js";

const allowAllRule: PolicyRule = {
  ruleId: "test.full-chain.allow-all",
  description: "Allow all run operations (full-chain test only)",
  appliesTo: ["run.start", "run.transition_state", "run.record_evidence"],
  evaluate: () => ({
    ruleId: "test.full-chain.allow-all",
    ruleDescription: "Allow all run operations",
    outcome: "allow" as const,
    reason: "full-chain test",
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nem-full-chain-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function buildTestSetup(rootDir: string) {
  const registry = new InMemoryPolicyRuleRegistry();
  for (const rule of BUILTIN_POLICY_RULES) registry.register(rule);
  registry.register(allowAllRule);
  const engine = new DefaultPolicyEngine(registry);
  const runManager = new InMemoryRunManager(engine);
  const runtime = buildPersistentRuntime({ rootDir, registerMockAdapter: true });

  // Candidate store: in-memory for the engine
  const candidateStore = new InMemoryCandidateStore();
  const govEngine = new DefaultGovernedEvolutionEngine(candidateStore, DEFAULT_GOVERNED_RULES);
  const candidateGenerator = new DefaultCandidateGenerator();

  return { engine, runManager, runtime, candidateStore, govEngine, candidateGenerator };
}

describe("Full architectural chain (Run → Experience → Candidate → Governed Review)", () => {
  it("exercises the full chain end-to-end with separation of duties", async () => {
    await withTempDir(async (dir) => {
      const setup = buildTestSetup(dir);
      await setup.runtime.initialize();

      // ─── Persona + Skill: shared assets ───
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
      const mockCaps = setup.runtime.adapterRegistry.get("mock").getCapabilities().capabilities;
      void mockCaps;
      void persona;
      void skill;

      // ─── Run A: produce Evidence + verified Evaluation ───
      const runA = setup.runManager.createRun({
        runInputs: makeRunInputs("Fix failing test in users.test.ts"),
        contextPackId: asContextPackId("cp-A"),
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
        },
      });
      setup.runManager.startRun(runA.id);

      const adapter = setup.runtime.adapterRegistry.get("mock");
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
      setup.runManager.recordOutputs(runA.id, resultA.outputs);

      const collectedA = setup.runtime.evidenceCollector.fromAdapterInvocation(runA.id, resultA);
      const verifiedEvs = collectedA.map((e) => setup.runtime.evidenceValidator.verify(e));
      for (const e of verifiedEvs) setup.runManager.recordEvidence(runA.id, e.id);

      const verificationEv = setup.runtime.evidenceCollector.fromVerificationResult(runA.id, {
        kind: "verification_report",
        claim: "tests pass after fix",
        payload: JSON.stringify({ passing: true, failing: 0 }),
      });
      const verifiedVer = setup.runtime.evidenceValidator.verify(verificationEv);
      setup.runManager.recordEvidence(runA.id, verifiedVer.id);

      const evaluationA = setup.runtime.evaluationEngine.evaluate({
        run: setup.runManager.getRun(runA.id)!,
        criteria: [
          {
            id: "tests-pass",
            description: "tests pass",
            requiredEvidenceKinds: ["verification_report"],
            required: true,
          },
        ],
        evidence: [...verifiedEvs, verifiedVer],
        evaluator: "full-chain",
      });
      expect(evaluationA.overallResult).toBe("verified_succeeded");
      setup.runManager.recordEvaluation(runA.id, evaluationA.id);
      setup.runManager.markSucceeded(runA.id);

      // ─── Derive Experience from Run A ───
      const experience = setup.runtime.experienceDeriver.derive({
        run: setup.runManager.getRun(runA.id)!,
        evaluation: evaluationA,
        evidence: [...verifiedEvs, verifiedVer],
        summary: "Rebuild before tests to avoid stale artifacts. Also: run with --no-cache.",
      });
      expect(experience.provenance.kind).toBe("observed");
      await setup.runtime.experienceStore.add(experience);

      // Governed promotion: observed → reviewed → approved
      await setup.runtime.experienceStore.promote(experience.id, "reviewed", {
        at: "2024-01-02T00:00:00Z",
        actor: "reviewer-alice",
        reason: "Generalizes well.",
      });
      await setup.runtime.experienceStore.promote(experience.id, "approved", {
        at: "2024-01-03T00:00:00Z",
        actor: "owner-bob",
        reason: "Approved for reuse.",
      });
      const approvedExp = await setup.runtime.experienceStore.get(experience.id);
      expect(approvedExp!.provenance.kind).toBe("approved");

      // ─── Generate v1 Candidate from the approved Experience ───
      const genV1 = setup.candidateGenerator.generateFromExperience({
        experience: approvedExp!,
        generationKind: "create_from_experience",
        assetKind: "skill",
        proposedVersion: "1.0.0",
        content: {
          name: "run-tests-with-rebuild",
          description: "Run the test suite, rebuilding first to avoid stale artifacts.",
          applicability: { taskKinds: ["test-fix"] },
          inputs: [],
          outputs: [],
          requiredCapabilities: [{ capability: "tool.shell.exec", required: true }],
        },
        proposedBy: "nemons.candidate-generator",
      });
      expect(genV1.candidate.status).toBe("proposed");
      expect(genV1.candidate.provenance.kind).toBe("observed");
      expect(genV1.sourceExperienceId).toBe(experience.id);

      // The candidate must go through governed review (NOT silently approved)
      const v1Stored = setup.govEngine.propose({
        assetKind: genV1.candidate.assetKind,
        assetId: genV1.candidate.assetId,
        proposedVersion: genV1.candidate.proposedVersion,
        changeKind: genV1.candidate.changeKind,
        content: genV1.candidate.content,
        proposedBy: genV1.candidate.proposedBy,
        rationale: genV1.candidate.rationale,
        evidenceRefs: genV1.candidate.evidenceRefs,
      });

      // Request review
      setup.govEngine.requestReview(v1Stored.id, "reviewer-carol", "Please review v1");

      // Carol approves (carol ≠ proposedBy='nemons.candidate-generator' → separation of duties OK)
      const v1Approval = setup.govEngine.tryApprove(v1Stored.id, "reviewer-carol", "LGTM");
      expect(v1Approval.kind).toBe("approved");

      // Verify v1 is approved in the store
      const v1Final = setup.govEngine.getCandidate(v1Stored.id)!;
      expect(v1Final.status).toBe("approved");
      expect(v1Final.provenance.reviewTrail.length).toBeGreaterThanOrEqual(2);

      // ─── Generate v2 Candidate (supersedes v1) from the same Experience ───
      const genV2 = setup.candidateGenerator.generateFromExperience({
        experience: approvedExp!,
        generationKind: "update_from_experience",
        assetKind: "skill",
        assetId: genV1.candidate.assetId, // same asset
        proposedVersion: "1.1.0",
        content: {
          name: "run-tests-with-rebuild",
          description: "Updated: run with --no-cache flag and rebuild.",
          applicability: { taskKinds: ["test-fix"] },
          inputs: [],
          outputs: [],
          requiredCapabilities: [{ capability: "tool.shell.exec", required: true }],
        },
        proposedBy: "nemons.candidate-generator",
        supersedesCandidateId: v1Stored.id,
        supersedesVersion: "1.0.0",
      });
      expect(genV2.candidate.supersedesCandidateId).toBe(v1Stored.id);

      // Store v2, request review, approve
      const v2Stored = setup.govEngine.propose({
        assetKind: genV2.candidate.assetKind,
        assetId: genV2.candidate.assetId,
        proposedVersion: genV2.candidate.proposedVersion,
        changeKind: genV2.candidate.changeKind,
        content: genV2.candidate.content,
        proposedBy: genV2.candidate.proposedBy,
        rationale: genV2.candidate.rationale,
        evidenceRefs: genV2.candidate.evidenceRefs,
        supersedesCandidateId: v1Stored.id,
        supersedesVersion: "1.0.0",
      });
      setup.govEngine.requestReview(v2Stored.id, "reviewer-dave", "Review v2");
      const v2Approval = setup.govEngine.tryApprove(v2Stored.id, "reviewer-dave", "LGTM");
      expect(v2Approval.kind).toBe("approved");

      // Supersede v1 with v2
      const supersedeResult = setup.govEngine.supersede(
        v1Stored.id,
        v2Stored.id,
        "owner-eve",
        "v2 supersedes v1 (added --no-cache flag)",
      );
      expect(supersedeResult.oldCandidate.status).toBe("superseded");
      expect(supersedeResult.newCandidate.status).toBe("approved");

      // ─── Verify the version chain ───
      const chain = setup.govEngine.getVersionChain(genV1.candidate.assetId);
      expect(chain).toHaveLength(2);
      expect(chain[0]!.id).toBe(v2Stored.id); // newest first
      expect(chain[1]!.id).toBe(v1Stored.id);

      // The active approved is v2
      const active = setup.govEngine.getActiveApproved(genV1.candidate.assetId);
      expect(active).toBeDefined();
      expect(active!.id).toBe(v2Stored.id);
      expect(active!.proposedVersion).toBe("1.1.0");
    });
  });

  it("demonstrates restart survival for the candidate store (Instance 2 sees v1, v2)", async () => {
    await withTempDir(async (dir) => {
      // ─── Instance 1: build the chain in a PersistentCandidateStore ───
      const persistentCandBackend = new FileSystemStore<CandidateRecord & { id: string }>({
        rootDir: dir,
        validator: candidateValidator as unknown as (r: unknown) => asserts r is CandidateRecord & { id: string },
      });
      const persistentCandStore = new PersistentCandidateStore(persistentCandBackend);
      await persistentCandStore.initialize();

      // Generate v1 from a (synthetic) approved Experience
      const generator = new DefaultCandidateGenerator();
      const syntheticExperience = {
        id: "x-synth" as never,
        runId: "r-synth" as never,
        evaluationId: "ev-synth" as never,
        provenance: {
          kind: "approved" as const,
          source: {
            kind: "evidence" as const,
            evidenceId: "x-synth" as never,
            at: "2024-01-01T00:00:00Z",
          },
        },
        applicability: { taskKinds: ["test-fix"] },
        reusability: "reusable" as const,
        summary: "Rebuild before tests.",
        learnedAt: "2024-01-01T00:00:00Z",
      };

      const genV1 = generator.generateFromExperience({
        experience: syntheticExperience,
        generationKind: "create_from_experience",
        assetKind: "skill",
        proposedVersion: "1.0.0",
        content: { name: "v1-skill" },
      });
      await persistentCandStore.add(genV1.candidate);
      await persistentCandStore.transition(genV1.candidate.id, "under_review", {
        at: "x",
        actor: "reviewer",
        reason: "review v1",
      });
      await persistentCandStore.transition(genV1.candidate.id, "approved", {
        at: "x",
        actor: "approver",
        reason: "approve v1",
      });

      const genV2 = generator.generateFromExperience({
        experience: syntheticExperience,
        generationKind: "update_from_experience",
        assetKind: "skill",
        assetId: genV1.candidate.assetId,
        proposedVersion: "1.1.0",
        content: { name: "v2-skill" },
        supersedesCandidateId: genV1.candidate.id,
        supersedesVersion: "1.0.0",
      });
      await persistentCandStore.add(genV2.candidate);
      await persistentCandStore.transition(genV2.candidate.id, "under_review", {
        at: "x",
        actor: "reviewer",
        reason: "review v2",
      });
      await persistentCandStore.transition(genV2.candidate.id, "approved", {
        at: "x",
        actor: "approver",
        reason: "approve v2",
      });
      await persistentCandStore.transition(genV1.candidate.id, "superseded", {
        at: "x",
        actor: "owner",
        reason: "v2 supersedes v1",
      });

      // ─── Instance 2: reload the chain from the same directory ───
      const persistentCandBackend2 = new FileSystemStore<CandidateRecord & { id: string }>({
        rootDir: dir,
        validator: candidateValidator as unknown as (r: unknown) => asserts r is CandidateRecord & { id: string },
      });
      const persistentCandStore2 = new PersistentCandidateStore(persistentCandBackend2);
      await persistentCandStore2.initialize();

      // The version chain survives restart
      const chain = await persistentCandStore2.getVersionChain(genV1.candidate.assetId);
      expect(chain).toHaveLength(2);
      expect(chain[0]!.id).toBe(genV2.candidate.id);
      expect(chain[1]!.id).toBe(genV1.candidate.id);

      // The active approved is v2 (survives restart)
      const active = await persistentCandStore2.getActiveApproved(genV1.candidate.assetId);
      expect(active).toBeDefined();
      expect(active!.id).toBe(genV2.candidate.id);
      expect(active!.proposedVersion).toBe("1.1.0");

      // The candidates' statuses survived (no silent downgrade)
      const v1Loaded = await persistentCandStore2.get(genV1.candidate.id);
      expect(v1Loaded!.status).toBe("superseded");
      const v2Loaded = await persistentCandStore2.get(genV2.candidate.id);
      expect(v2Loaded!.status).toBe("approved");

      // The review trails survived
      expect(v2Loaded!.provenance.reviewTrail.length).toBeGreaterThanOrEqual(2);
    });
  });
});
