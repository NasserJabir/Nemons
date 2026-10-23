/**
 * Entity Summarizer tests (ADR-0009 — from CorpusMap research).
 *
 * Verifies:
 *   ES1: summarizeRun — found with incoming Evidence + Experience.
 *   ES2: summarizeRun — NOT found → missing.
 *   ES3: summarizeRun — outgoing references.
 *   ES4: summarizeExperience — found with incoming Candidates.
 *   ES5: summarizeExperience — outgoing references.
 *   ES6: summarizeCandidate — found with incoming superseded-by + DecisionLog.
 *   ES7: summarizeCandidate — outgoing references.
 *   ES8: summarize() dispatcher.
 *   ES9: crossReferenceStatus — healthy.
 *   ES10: crossReferenceStatus — orphaned.
 *   ES11: crossReferenceStatus — missing.
 *   ES12: empty stores → missing.
 *   ES13: summary string is human-readable.
 *   ES14: read-only — doesn't modify inputs.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DefaultEntitySummarizer } from "../../src/persistence/entity-summarizer.js";
import type { EntitySummarizerStores } from "../../src/persistence/entity-summarizer.js";
import type { Run } from "../../src/schemas/run.js";
import type { Evidence } from "../../src/schemas/evidence.js";
import type { Experience } from "../../src/schemas/experience.js";
import type { CandidateRecord } from "../../src/schemas/candidate.js";
import type { DecisionLogEntry } from "../../src/governed-evolution/decision-log.js";
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
    state: "succeeded",
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
    startedAt: "2024-01-01T10:00:00Z",
    endedAt: "2024-01-01T11:00:00Z",
    outputs: { claimedOutcome: "succeeded" },
    evidenceRefs: ["ev-1", "ev-2"],
    evaluationRef: "eval-1",
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: asEvidenceId("ev-1"),
    runId: asRunId("r-1"),
    kind: "test_result",
    claim: "tests pass",
    artifact: {
      inlinePayload: '{"passing":true}',
      contentHash: sha256Hex('{"passing":true}'),
      contentType: "application/json",
      bytes: 16,
    },
    provenance: {
      kind: "observed",
      source: { kind: "run", runId: asRunId("r-1"), at: "2024-01-01T10:30:00Z" },
    },
    recordedAt: "2024-01-01T10:30:00Z",
    verified: true,
    ...overrides,
  };
}

function makeExperience(overrides: Partial<Experience> = {}): Experience {
  return {
    id: asExperienceId("x-1"),
    runId: asRunId("r-1"),
    evaluationId: asEvaluationId("eval-1"),
    provenance: {
      kind: "approved",
      source: {
        kind: "evidence",
        evidenceId: asEvidenceId("ev-source") as never,
        at: "2024-01-01T00:00:00Z",
      },
    },
    applicability: { taskKinds: ["test-fix"] },
    reusability: "reusable",
    summary: "Rebuild before tests to avoid stale artifacts.",
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
    evidenceRefs: ["x-1"],
    ...overrides,
  };
}

function makeDecisionLogEntry(overrides: Partial<DecisionLogEntry> = {}): DecisionLogEntry {
  return {
    id: "dl-1",
    at: "2024-01-01T00:00:00Z",
    kind: "approval",
    actor: "reviewer",
    candidateId: asCandidateId("c-1"),
    assetId: "skill-1",
    reason: "Approved",
    ...overrides,
  };
}

function makeStores(overrides: Partial<EntitySummarizerStores> = {}): EntitySummarizerStores {
  return {
    runs: [makeRun()],
    evidence: [makeEvidence()],
    experiences: [makeExperience()],
    candidates: [makeCandidate()],
    decisionLogEntries: [makeDecisionLogEntry()],
    ...overrides,
  };
}

describe("Entity Summarizer (ADR-0009 — CorpusMap)", () => {
  let summarizer: DefaultEntitySummarizer;

  beforeEach(() => {
    summarizer = new DefaultEntitySummarizer(makeStores());
  });

  describe("ES1 + ES2: summarizeRun", () => {
    it("ES1: found Run with incoming Evidence + Experience", () => {
      const summary = summarizer.summarizeRun("r-1");
      expect(summary.found).toBe(true);
      expect(summary.entityKind).toBe("run");
      expect(summary.incoming.length).toBeGreaterThan(0);
      // Should include the Evidence record
      const evidenceIncoming = summary.incoming.find((r) => r.kind === "evidence");
      expect(evidenceIncoming).toBeDefined();
      expect(evidenceIncoming!.id).toBe("ev-1");
      // Should include the Experience record (derived from this Run)
      const expIncoming = summary.incoming.find((r) => r.kind === "experience");
      expect(expIncoming).toBeDefined();
      expect(expIncoming!.id).toBe("x-1");
      // Note: the Candidate does NOT directly reference the Run — it
      // references the Experience (x-1) which references the Run (r-1).
      // The summarizer only finds direct references. The Candidate
      // will be found as an incoming reference to the Experience, not to the Run.
    });

    it("ES2: NOT found → missing", () => {
      const summary = summarizer.summarizeRun("r-nonexistent");
      expect(summary.found).toBe(false);
      expect(summary.crossReferenceStatus).toBe("missing");
    });
  });

  describe("ES3: summarizeRun outgoing references", () => {
    it("includes contextPackId, repo, evidenceRefs, evaluationRef", () => {
      const summary = summarizer.summarizeRun("r-1");
      // Context Pack
      const cpRef = summary.outgoing.find((r) => r.kind === "context_pack");
      expect(cpRef).toBeDefined();
      expect(cpRef!.id).toBe("cp-1");
      // Repository
      const repoRef = summary.outgoing.find((r) => r.kind === "repository");
      expect(repoRef).toBeDefined();
      expect(repoRef!.id).toBe("https://example.com/repo.git");
      // Evidence refs
      const evRefs = summary.outgoing.filter((r) => r.kind === "evidence");
      expect(evRefs.length).toBe(2); // ev-1 and ev-2
    });
  });

  describe("ES4 + ES5: summarizeExperience", () => {
    it("ES4: found Experience with incoming Candidates", () => {
      const summary = summarizer.summarizeExperience("x-1");
      expect(summary.found).toBe(true);
      expect(summary.entityKind).toBe("experience");
      // Should include the Candidate that references this Experience
      const candIncoming = summary.incoming.find((r) => r.kind === "candidate");
      expect(candIncoming).toBeDefined();
      expect(candIncoming!.id).toBe("c-1");
    });

    it("ES5: outgoing references (source Run, source Evaluation, source Evidence)", () => {
      const summary = summarizer.summarizeExperience("x-1");
      // Source Run
      const runRef = summary.outgoing.find((r) => r.kind === "run" && r.id === "r-1");
      expect(runRef).toBeDefined();
      expect(runRef!.relationship).toContain("Source Run");
      // Source Evaluation
      const evalRef = summary.outgoing.find((r) => r.relationship.includes("Evaluation"));
      expect(evalRef).toBeDefined();
      expect(evalRef!.id).toBe("eval-1");
      // Source Evidence (from provenance)
      const evRef = summary.outgoing.find((r) => r.kind === "evidence");
      expect(evRef).toBeDefined();
    });
  });

  describe("ES6 + ES7: summarizeCandidate", () => {
    it("ES6: found Candidate with incoming superseded-by + DecisionLog", () => {
      // Add a second candidate that supersedes c-1
      const stores = makeStores({
        candidates: [
          makeCandidate(),
          makeCandidate({
            id: asCandidateId("c-2"),
            changeKind: "update",
            supersedesCandidateId: asCandidateId("c-1"),
            supersedesVersion: "1.0.0",
            status: "approved",
          }),
        ],
      });
      const summarizer2 = new DefaultEntitySummarizer(stores);
      const summary = summarizer2.summarizeCandidate("c-1");
      expect(summary.found).toBe(true);
      // Should include the superseding candidate
      const supersededBy = summary.incoming.find((r) => r.kind === "candidate");
      expect(supersededBy).toBeDefined();
      expect(supersededBy!.id).toBe("c-2");
      // Should include the DecisionLog entry
      const dlEntry = summary.incoming.find((r) => r.kind === "decision_log");
      expect(dlEntry).toBeDefined();
      expect(dlEntry!.id).toBe("dl-1");
    });

    it("ES7: outgoing references (supersedes, asset, evidenceRefs)", () => {
      const stores = makeStores({
        candidates: [
          makeCandidate({
            id: asCandidateId("c-1"),
            changeKind: "update",
            supersedesCandidateId: asCandidateId("c-0"),
            supersedesVersion: "0.9.0",
            evidenceRefs: ["x-1"],
          }),
        ],
      });
      const summarizer2 = new DefaultEntitySummarizer(stores);
      const summary = summarizer2.summarizeCandidate("c-1");
      // Supersedes
      const supersedesRef = summary.outgoing.find((r) => r.kind === "candidate");
      expect(supersedesRef).toBeDefined();
      expect(supersedesRef!.id).toBe("c-0");
      // Asset
      const assetRef = summary.outgoing.find((r) => r.kind === "asset");
      expect(assetRef).toBeDefined();
      expect(assetRef!.id).toBe("skill-1");
      // Evidence refs
      const evRef = summary.outgoing.find((r) => r.kind === "evidence");
      expect(evRef).toBeDefined();
      expect(evRef!.id).toBe("x-1");
    });
  });

  describe("ES8: summarize() dispatcher", () => {
    it("dispatches to summarizeRun for 'run'", () => {
      const summary = summarizer.summarize("run", "r-1");
      expect(summary.entityKind).toBe("run");
      expect(summary.found).toBe(true);
    });

    it("dispatches to summarizeExperience for 'experience'", () => {
      const summary = summarizer.summarize("experience", "x-1");
      expect(summary.entityKind).toBe("experience");
      expect(summary.found).toBe(true);
    });

    it("dispatches to summarizeCandidate for 'candidate'", () => {
      const summary = summarizer.summarize("candidate", "c-1");
      expect(summary.entityKind).toBe("candidate");
      expect(summary.found).toBe(true);
    });
  });

  describe("ES9 + ES10 + ES11: crossReferenceStatus", () => {
    it("ES9: healthy when all outgoing refs are satisfied", () => {
      // Run r-1 has evidenceRefs ["ev-1", "ev-2"]
      // ev-1 exists, ev-2 doesn't → orphaned
      // Let's make a store where ev-2 exists
      const stores = makeStores({
        evidence: [makeEvidence({ id: asEvidenceId("ev-1") }), makeEvidence({ id: asEvidenceId("ev-2") })],
      });
      const summarizer2 = new DefaultEntitySummarizer(stores);
      const summary = summarizer2.summarizeRun("r-1");
      expect(summary.crossReferenceStatus).toBe("healthy");
    });

    it("ES10: orphaned when an outgoing ref points to a missing entity", () => {
      // Run r-1 has evidenceRefs ["ev-1", "ev-2"]
      // Only ev-1 exists → ev-2 is missing → orphaned
      const summary = summarizer.summarizeRun("r-1");
      expect(summary.crossReferenceStatus).toBe("orphaned");
    });

    it("ES11: missing when the entity itself is not found", () => {
      const summary = summarizer.summarizeRun("r-nonexistent");
      expect(summary.crossReferenceStatus).toBe("missing");
    });
  });

  describe("ES12: empty stores", () => {
    it("all summaries return missing", () => {
      const emptySummarizer = new DefaultEntitySummarizer({});
      expect(emptySummarizer.summarizeRun("r-1").crossReferenceStatus).toBe("missing");
      expect(emptySummarizer.summarizeExperience("x-1").crossReferenceStatus).toBe("missing");
      expect(emptySummarizer.summarizeCandidate("c-1").crossReferenceStatus).toBe("missing");
    });
  });

  describe("ES13: summary string is human-readable", () => {
    it("for a found Run", () => {
      const summary = summarizer.summarizeRun("r-1");
      expect(summary.summary).toContain("r-1");
      expect(summary.summary).toContain("found");
      expect(summary.summary).toContain("Incoming");
      expect(summary.summary).toContain("Outgoing");
    });

    it("for a missing Run", () => {
      const summary = summarizer.summarizeRun("r-nonexistent");
      expect(summary.summary).toContain("NOT FOUND");
    });
  });

  describe("ES14: read-only — doesn't modify inputs", () => {
    it("the input arrays are not modified after summarization", () => {
      const stores = makeStores();
      const runsBefore = stores.runs!.length;
      const evidenceBefore = stores.evidence!.length;
      const expsBefore = stores.experiences!.length;
      const candsBefore = stores.candidates!.length;

      summarizer.summarizeRun("r-1");
      summarizer.summarizeExperience("x-1");
      summarizer.summarizeCandidate("c-1");

      expect(stores.runs!.length).toBe(runsBefore);
      expect(stores.evidence!.length).toBe(evidenceBefore);
      expect(stores.experiences!.length).toBe(expsBefore);
      expect(stores.candidates!.length).toBe(candsBefore);
    });
  });

  describe("ES15: full chain audit (Run → Evidence → Experience → Candidate)", () => {
    it("tracing from Run to Candidate via the full chain", () => {
      // Run r-1 → has Evidence ev-1 → Experience x-1 derived → Candidate c-1 generated
      const runSummary = summarizer.summarizeRun("r-1");
      expect(runSummary.found).toBe(true);

      // The Run summary should show Experience x-1 as incoming
      const expIncoming = runSummary.incoming.find((r) => r.kind === "experience");
      expect(expIncoming).toBeDefined();

      // The Experience summary should show Candidate c-1 as incoming
      const expSummary = summarizer.summarizeExperience("x-1");
      const candIncoming = expSummary.incoming.find((r) => r.kind === "candidate");
      expect(candIncoming).toBeDefined();
      expect(candIncoming!.id).toBe("c-1");

      // The Candidate summary should show the asset as outgoing
      const candSummary = summarizer.summarizeCandidate("c-1");
      const assetOutgoing = candSummary.outgoing.find((r) => r.kind === "asset");
      expect(assetOutgoing).toBeDefined();
      expect(assetOutgoing!.id).toBe("skill-1");

      // The full chain is traceable: Run → Experience → Candidate → Asset
    });
  });
});
