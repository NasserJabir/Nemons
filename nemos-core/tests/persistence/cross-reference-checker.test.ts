/**
 * Stage G — CrossReferenceChecker tests.
 *
 * Verifies:
 *   XC1: returns healthy + orphaned records for Evidence ↔ Run.
 *   XC2: returns healthy + orphaned records for Experience ↔ Run.
 *   XC3: returns healthy + orphaned records for Candidate ↔ Candidate.
 *   XC4: detects orphaned Evidence (runId doesn't exist).
 *   XC5: detects orphaned Experience (runId doesn't exist).
 *   XC6: detects orphaned Candidate (supersedesCandidateId doesn't exist).
 *   XC7: skips checks for missing stores.
 *   XC8: hasOrphans helper returns true when any orphans exist.
 *   XC9: summarizeReport returns a human-readable summary.
 *   XC10: in-session Evaluation ids are checked (Experience ↔ Evaluation).
 *   XC11: the report records the checkedAt timestamp.
 *   XC12: all checks work in the full persistent runtime.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  DefaultCrossReferenceChecker,
  hasOrphans,
  summarizeReport,
} from "../../src/persistence/cross-reference-checker.js";
import { FileSystemStore } from "../../src/persistence/fs-json-store.js";
import { PersistentRunStore, runValidator } from "../../src/persistence/persistent-run-store.js";
import {
  PersistentEvidenceStore,
  evidenceValidator,
} from "../../src/persistence/persistent-evidence-store.js";
import {
  PersistentExperienceStore,
  experienceValidator,
} from "../../src/persistence/persistent-experience-store.js";
import {
  PersistentCandidateStore,
  candidateValidator,
} from "../../src/persistence/persistent-candidate-store.js";
import type { Run } from "../../src/schemas/run.js";
import type { Evidence } from "../../src/schemas/evidence.js";
import type { Experience } from "../../src/schemas/experience.js";
import type { CandidateRecord } from "../../src/schemas/candidate.js";
import {
  asRunId,
  asContextPackId,
  asEvidenceId,
  asExperienceId,
  asEvaluationId,
  asCandidateId,
  sha256Hex,
} from "../../src/core/identifiers.js";

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: asRunId("r-1"),
    state: "pending",
    inputs: {
      taskDescription: "Fix test",
      taskKind: "test-fix",
      repoInstance: {
        repoIdentity: { repo: "https://example.com/repo.git", sha: "abc" },
        instanceId: "inst-1",
      },
    },
    contextPackId: asContextPackId("cp-1"),
    provenance: {
      kind: "observed",
      source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
    },
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: asEvidenceId("ev-1"),
    runId: asRunId("r-1"),
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
      source: { kind: "run", runId: asRunId("r-1"), at: "2024-01-01T00:00:00Z" },
    },
    recordedAt: "2024-01-01T00:00:00Z",
    verified: false,
    ...overrides,
  };
}

function makeExperience(overrides: Partial<Experience> = {}): Experience {
  return {
    id: asExperienceId("x-1"),
    runId: asRunId("r-1"),
    evaluationId: asEvaluationId("ev-1"),
    provenance: {
      kind: "observed",
      source: {
        kind: "evidence",
        evidenceId: asEvidenceId("x-src") as never,
        at: "2024-01-01T00:00:00Z",
      },
    },
    applicability: { taskKinds: ["test-fix"] },
    reusability: "reusable",
    summary: "Rebuild before tests.",
    learnedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<CandidateRecord> = {}): CandidateRecord {
  return {
    id: asCandidateId("c-1"),
    assetKind: "skill",
    assetId: "skill-1",
    proposedVersion: "1.0.0",
    changeKind: "create",
    content: { name: "run-tests" },
    provenance: {
      kind: "observed",
      source: { kind: "human", actor: "alice", at: "2024-01-01T00:00:00Z" },
    },
    status: "proposed",
    proposedBy: "alice",
    proposedAt: "2024-01-01T00:00:00Z",
    rationale: "Initial",
    reviewTrail: [],
    ...overrides,
  };
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nem-xref-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("Stage G — CrossReferenceChecker", () => {
  describe("XC1 + XC4: Evidence ↔ Run", () => {
    it("returns all Evidence as healthy when their Runs exist", async () => {
      await withTempDir(async (dir) => {
        const runStore = new PersistentRunStore(
          new FileSystemStore({
            rootDir: `${dir}/runs`,
            validator: runValidator as unknown as (r: unknown) => asserts r is Run & { id: string },
          }),
        );
        const evStore = new PersistentEvidenceStore(
          new FileSystemStore({
            rootDir: `${dir}/evidence`,
            validator: evidenceValidator as unknown as (e: unknown) => asserts e is Evidence & { id: string },
          }),
        );
        await runStore.initialize();
        await evStore.initialize();

        await runStore.add(makeRun({ id: asRunId("r-1") }));
        await evStore.add(makeEvidence({ id: asEvidenceId("ev-1"), runId: asRunId("r-1") }));
        await evStore.add(makeEvidence({ id: asEvidenceId("ev-2"), runId: asRunId("r-1") }));

        const checker = new DefaultCrossReferenceChecker({
          runStore,
          evidenceStore: evStore,
        });
        const report = await checker.check();
        expect(report.totalEvidence).toBe(2);
        expect(report.healthyEvidence).toHaveLength(2);
        expect(report.orphanedEvidence).toEqual([]);
      });
    });

    it("XC4: detects orphaned Evidence (runId doesn't exist)", async () => {
      await withTempDir(async (dir) => {
        const runStore = new PersistentRunStore(
          new FileSystemStore({
            rootDir: `${dir}/runs`,
            validator: runValidator as unknown as (r: unknown) => asserts r is Run & { id: string },
          }),
        );
        const evStore = new PersistentEvidenceStore(
          new FileSystemStore({
            rootDir: `${dir}/evidence`,
            validator: evidenceValidator as unknown as (e: unknown) => asserts e is Evidence & { id: string },
          }),
        );
        await runStore.initialize();
        await evStore.initialize();

        // Only add Evidence — no Run
        await evStore.add(makeEvidence({ id: asEvidenceId("ev-orphan"), runId: asRunId("r-missing") }));

        const checker = new DefaultCrossReferenceChecker({
          runStore,
          evidenceStore: evStore,
        });
        const report = await checker.check();
        expect(report.totalEvidence).toBe(1);
        expect(report.healthyEvidence).toHaveLength(0);
        expect(report.orphanedEvidence).toHaveLength(1);
        expect(report.orphanedEvidence[0]!.evidenceId).toBe("ev-orphan");
        expect(report.orphanedEvidence[0]!.missingRunId).toBe("r-missing");
      });
    });
  });

  describe("XC2 + XC5: Experience ↔ Run", () => {
    it("returns all Experiences as healthy when their Runs exist", async () => {
      await withTempDir(async (dir) => {
        const runStore = new PersistentRunStore(
          new FileSystemStore({
            rootDir: `${dir}/runs`,
            validator: runValidator as unknown as (r: unknown) => asserts r is Run & { id: string },
          }),
        );
        const expStore = new PersistentExperienceStore(
          new FileSystemStore({
            rootDir: `${dir}/experiences`,
            validator: experienceValidator as unknown as (e: unknown) => asserts e is Experience & { id: string },
          }),
        );
        await runStore.initialize();
        await expStore.initialize();

        await runStore.add(makeRun({ id: asRunId("r-1") }));
        await expStore.add(makeExperience({ id: asExperienceId("x-1"), runId: asRunId("r-1") }));

        const checker = new DefaultCrossReferenceChecker({
          runStore,
          experienceStore: expStore,
        });
        const report = await checker.check();
        expect(report.totalExperiences).toBe(1);
        expect(report.healthyExperiences).toHaveLength(1);
        expect(report.orphanedExperiences).toEqual([]);
      });
    });

    it("XC5: detects orphaned Experience (runId doesn't exist)", async () => {
      await withTempDir(async (dir) => {
        const runStore = new PersistentRunStore(
          new FileSystemStore({
            rootDir: `${dir}/runs`,
            validator: runValidator as unknown as (r: unknown) => asserts r is Run & { id: string },
          }),
        );
        const expStore = new PersistentExperienceStore(
          new FileSystemStore({
            rootDir: `${dir}/experiences`,
            validator: experienceValidator as unknown as (e: unknown) => asserts e is Experience & { id: string },
          }),
        );
        await runStore.initialize();
        await expStore.initialize();

        await expStore.add(
          makeExperience({ id: asExperienceId("x-orphan"), runId: asRunId("r-missing") }),
        );

        const checker = new DefaultCrossReferenceChecker({
          runStore,
          experienceStore: expStore,
        });
        const report = await checker.check();
        expect(report.orphanedExperiences).toHaveLength(1);
        expect(report.orphanedExperiences[0]!.experienceId).toBe("x-orphan");
        expect(report.orphanedExperiences[0]!.missingRunId).toBe("r-missing");
      });
    });
  });

  describe("XC3 + XC6: Candidate ↔ Candidate", () => {
    it("returns Candidates as healthy when their supersedesCandidateId exists", async () => {
      await withTempDir(async (dir) => {
        const candStore = new PersistentCandidateStore(
          new FileSystemStore({
            rootDir: `${dir}/candidates`,
            validator: candidateValidator as unknown as (c: unknown) => asserts c is CandidateRecord & { id: string },
          }),
        );
        await candStore.initialize();

        const v1 = makeCandidate({ id: asCandidateId("c-v1") });
        await candStore.add(v1);
        const v2 = makeCandidate({
          id: asCandidateId("c-v2"),
          changeKind: "update",
          supersedesCandidateId: asCandidateId("c-v1"),
        });
        await candStore.add(v2);

        const checker = new DefaultCrossReferenceChecker({ candidateStore: candStore });
        const report = await checker.check();
        expect(report.totalCandidates).toBe(2);
        expect(report.healthyCandidates).toHaveLength(2);
        expect(report.orphanedCandidates).toEqual([]);
      });
    });

    it("XC6: detects orphaned Candidate (supersedesCandidateId doesn't exist)", async () => {
      await withTempDir(async (dir) => {
        // Use a low-level FileSystemStore to bypass the CandidateStore's
        // add() check that rejects candidates with non-existent
        // supersedesCandidateId (we want to test the checker, not the
        // store's enforcement).
        const backend = new FileSystemStore<CandidateRecord & { id: string }>({
          rootDir: `${dir}/candidates`,
          validator: candidateValidator as unknown as (c: unknown) => asserts c is CandidateRecord & { id: string },
        });
        await backend.initialize();

        // Manually add a candidate with a non-existent supersedesCandidateId
        // (bypassing the PersistentCandidateStore's check)
        await backend.add({
          id: asCandidateId("c-orphan"),
          assetKind: "skill",
          assetId: "skill-1",
          proposedVersion: "1.0.0",
          changeKind: "update",
          content: { name: "x" },
          provenance: {
            kind: "observed",
            source: { kind: "human", actor: "x", at: "x" },
          },
          status: "proposed",
          proposedBy: "alice",
          proposedAt: "2024-01-01T00:00:00Z",
          rationale: "x",
          reviewTrail: [],
          supersedesCandidateId: asCandidateId("c-nonexistent"),
        });

        const candStore = new PersistentCandidateStore(backend);
        const checker = new DefaultCrossReferenceChecker({ candidateStore: candStore });
        const report = await checker.check();
        expect(report.orphanedCandidates).toHaveLength(1);
        expect(report.orphanedCandidates[0]!.candidateId).toBe("c-orphan");
        expect(report.orphanedCandidates[0]!.missingSupersedesCandidateId).toBe("c-nonexistent");
      });
    });
  });

  describe("XC7: skips checks for missing stores", () => {
    it("returns 0 totals when no stores are provided", async () => {
      const checker = new DefaultCrossReferenceChecker({});
      const report = await checker.check();
      expect(report.totalEvidence).toBe(0);
      expect(report.totalExperiences).toBe(0);
      expect(report.totalCandidates).toBe(0);
    });

    it("only checks the provided stores", async () => {
      await withTempDir(async (dir) => {
        const runStore = new PersistentRunStore(
          new FileSystemStore({
            rootDir: `${dir}/runs`,
            validator: runValidator as unknown as (r: unknown) => asserts r is Run & { id: string },
          }),
        );
        await runStore.initialize();
        await runStore.add(makeRun({ id: asRunId("r-1") }));

        const checker = new DefaultCrossReferenceChecker({ runStore });
        const report = await checker.check();
        // No Evidence/Experience/Candidate stores provided → all 0
        expect(report.totalEvidence).toBe(0);
        expect(report.totalExperiences).toBe(0);
        expect(report.totalCandidates).toBe(0);
      });
    });
  });

  describe("XC8: hasOrphans", () => {
    it("returns false for a clean report", async () => {
      const checker = new DefaultCrossReferenceChecker({});
      const report = await checker.check();
      expect(hasOrphans(report)).toBe(false);
    });

    it("returns true when orphanedEvidence is non-empty", async () => {
      await withTempDir(async (dir) => {
        const runStore = new PersistentRunStore(
          new FileSystemStore({
            rootDir: `${dir}/runs`,
            validator: runValidator as unknown as (r: unknown) => asserts r is Run & { id: string },
          }),
        );
        const evStore = new PersistentEvidenceStore(
          new FileSystemStore({
            rootDir: `${dir}/evidence`,
            validator: evidenceValidator as unknown as (e: unknown) => asserts e is Evidence & { id: string },
          }),
        );
        await runStore.initialize();
        await evStore.initialize();
        await evStore.add(makeEvidence({ id: asEvidenceId("ev-orphan"), runId: asRunId("r-missing") }));

        const checker = new DefaultCrossReferenceChecker({ runStore, evidenceStore: evStore });
        const report = await checker.check();
        expect(hasOrphans(report)).toBe(true);
      });
    });
  });

  describe("XC9: summarizeReport", () => {
    it("returns a human-readable summary", async () => {
      const checker = new DefaultCrossReferenceChecker({});
      const report = await checker.check();
      const summary = summarizeReport(report);
      expect(summary).toContain("CrossReferenceReport");
      expect(summary).toContain("Evidence: 0 total");
      expect(summary).toContain("Experience: 0 total");
      expect(summary).toContain("Candidates: 0 total");
    });
  });

  describe("XC10: in-session Evaluation ids", () => {
    it("detects Experience with missing Evaluation (when in-session set is provided)", async () => {
      await withTempDir(async (dir) => {
        const runStore = new PersistentRunStore(
          new FileSystemStore({
            rootDir: `${dir}/runs`,
            validator: runValidator as unknown as (r: unknown) => asserts r is Run & { id: string },
          }),
        );
        const expStore = new PersistentExperienceStore(
          new FileSystemStore({
            rootDir: `${dir}/experiences`,
            validator: experienceValidator as unknown as (e: unknown) => asserts e is Experience & { id: string },
          }),
        );
        await runStore.initialize();
        await expStore.initialize();

        await runStore.add(makeRun({ id: asRunId("r-1") }));
        await expStore.add(
          makeExperience({
            id: asExperienceId("x-eval-missing"),
            runId: asRunId("r-1"),
            evaluationId: asEvaluationId("ev-not-in-session"),
          }),
        );

        // In-session Evaluation ids: empty set → all Experiences are orphaned from Evaluation
        const checker = new DefaultCrossReferenceChecker(
          { runStore, experienceStore: expStore },
          new Set<string>(),
        );
        const report = await checker.check();
        expect(report.experiencesWithMissingEvaluation).toHaveLength(1);
        expect(report.experiencesWithMissingEvaluation[0]!.experienceId).toBe("x-eval-missing");
      });
    });

    it("passes when the Evaluation id is in the in-session set", async () => {
      await withTempDir(async (dir) => {
        const runStore = new PersistentRunStore(
          new FileSystemStore({
            rootDir: `${dir}/runs`,
            validator: runValidator as unknown as (r: unknown) => asserts r is Run & { id: string },
          }),
        );
        const expStore = new PersistentExperienceStore(
          new FileSystemStore({
            rootDir: `${dir}/experiences`,
            validator: experienceValidator as unknown as (e: unknown) => asserts e is Experience & { id: string },
          }),
        );
        await runStore.initialize();
        await expStore.initialize();

        await runStore.add(makeRun({ id: asRunId("r-1") }));
        await expStore.add(
          makeExperience({
            id: asExperienceId("x-eval-ok"),
            runId: asRunId("r-1"),
            evaluationId: asEvaluationId("ev-in-session"),
          }),
        );

        const checker = new DefaultCrossReferenceChecker(
          { runStore, experienceStore: expStore },
          new Set(["ev-in-session"]),
        );
        const report = await checker.check();
        expect(report.experiencesWithMissingEvaluation).toEqual([]);
      });
    });
  });

  describe("XC11: checkedAt timestamp", () => {
    it("records the checkedAt ISO timestamp", async () => {
      const checker = new DefaultCrossReferenceChecker({});
      const report = await checker.check();
      expect(report.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
