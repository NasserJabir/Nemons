/**
 * Evidence Temporal Consistency Check tests (ADR-0008 — from LongHarness research).
 *
 * Verifies:
 *   TC1: Evidence within Run lifecycle → no staleness → criterion satisfied.
 *   TC2: Evidence BEFORE Run started → stale → excluded.
 *   TC3: Evidence AFTER Run ended → stale → excluded.
 *   TC4: Mix of stale + non-stale → stale excluded, non-stale counts.
 *   TC5: Stale Evidence causing disagreement → removed → disagreement resolved.
 *   TC6: Limitation records temporal inconsistency.
 *   TC7: No startedAt/endedAt → no temporal check.
 *   TC8: Unverified Evidence NOT checked.
 *   TC9: detectEvidenceTemporalInconsistency is standalone-testable.
 *   TC10: Existing behavior unchanged when all Evidence is temporally consistent.
 *   TC11: All stale → criterion NOT satisfied + reason mentions temporal staleness.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DefaultEvaluationEngine,
  detectEvidenceTemporalInconsistency,
} from "../../src/evaluation/evaluation-engine.js";
import type { Evidence } from "../../src/schemas/evidence.js";
import type { Run, RunInputs } from "../../src/schemas/run.js";
import type { EvaluationCriterion } from "../../src/schemas/evaluation.js";
import {
  asRunId,
  asContextPackId,
  asEvidenceId,
  sha256Hex,
} from "../../src/core/identifiers.js";

function makeRunInputs(): RunInputs {
  return {
    taskDescription: "Fix the failing test",
    taskKind: "test-fix",
    repoInstance: {
      repoIdentity: { repo: "https://example.com/repo.git", sha: "abc" },
      instanceId: "inst-1",
    },
  };
}

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: asRunId("r-tc-1"),
    state: "succeeded",
    inputs: makeRunInputs(),
    contextPackId: asContextPackId("cp-1"),
    provenance: {
      kind: "observed",
      source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
    },
    startedAt: "2024-01-01T10:00:00Z",
    endedAt: "2024-01-01T11:00:00Z",
    outputs: { claimedOutcome: "succeeded" },
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: asEvidenceId("ev-tc-1"),
    runId: asRunId("r-tc-1"),
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
      source: { kind: "run", runId: asRunId("r-tc-1"), at: "2024-01-01T10:30:00Z" },
    },
    recordedAt: "2024-01-01T10:30:00Z", // within the Run's lifecycle
    verified: true,
    ...overrides,
  };
}

function makeCriteria(): EvaluationCriterion[] {
  return [
    {
      id: "tests-pass",
      description: "All tests pass",
      requiredEvidenceKinds: ["test_result"],
      required: true,
    },
  ];
}

describe("Evidence Temporal Consistency Check (ADR-0008 — LongHarness)", () => {
  let engine: DefaultEvaluationEngine;

  beforeEach(() => {
    engine = new DefaultEvaluationEngine();
  });

  describe("TC1: Evidence within Run lifecycle → no staleness", () => {
    it("Evidence recorded between startedAt and endedAt → criterion satisfied", () => {
      const ev = makeEvidence({ recordedAt: "2024-01-01T10:30:00Z" });
      const evaluation = engine.evaluate({
        run: makeRun(),
        criteria: makeCriteria(),
        evidence: [ev],
        evaluator: "test",
      });
      expect(evaluation.results[0]?.satisfied).toBe(true);
      expect(evaluation.overallResult).toBe("verified_succeeded");
    });
  });

  describe("TC2: Evidence BEFORE Run started → stale → excluded", () => {
    it("Evidence recorded at 09:00 (Run started at 10:00) → stale", () => {
      const ev = makeEvidence({ recordedAt: "2024-01-01T09:00:00Z" });
      const evaluation = engine.evaluate({
        run: makeRun(),
        criteria: makeCriteria(),
        evidence: [ev],
        evaluator: "test",
      });
      // The only Evidence is stale → criterion NOT satisfied
      expect(evaluation.results[0]?.satisfied).toBe(false);
      expect(evaluation.results[0]?.reason).toContain("temporally stale");
    });
  });

  describe("TC3: Evidence AFTER Run ended → stale → excluded", () => {
    it("Evidence recorded at 12:00 (Run ended at 11:00) → stale", () => {
      const ev = makeEvidence({ recordedAt: "2024-01-01T12:00:00Z" });
      const evaluation = engine.evaluate({
        run: makeRun(),
        criteria: makeCriteria(),
        evidence: [ev],
        evaluator: "test",
      });
      expect(evaluation.results[0]?.satisfied).toBe(false);
      expect(evaluation.results[0]?.reason).toContain("temporally stale");
    });
  });

  describe("TC4: Mix of stale + non-stale → stale excluded, non-stale counts", () => {
    it("one stale + one non-stale → criterion satisfied (non-stale counts)", () => {
      const evStale = makeEvidence({
        id: asEvidenceId("ev-stale"),
        recordedAt: "2024-01-01T09:00:00Z", // before Run started
        claim: "tests pass",
      });
      const evFresh = makeEvidence({
        id: asEvidenceId("ev-fresh"),
        recordedAt: "2024-01-01T10:30:00Z", // within Run lifecycle
        claim: "tests pass",
      });
      const evaluation = engine.evaluate({
        run: makeRun(),
        criteria: makeCriteria(),
        evidence: [evStale, evFresh],
        evaluator: "test",
      });
      // The non-stale Evidence exists and is consistent → criterion satisfied
      expect(evaluation.results[0]?.satisfied).toBe(true);
      expect(evaluation.overallResult).toBe("verified_succeeded");
      // The reason should mention the stale record was excluded
      expect(evaluation.results[0]?.reason).toContain("stale");
    });
  });

  describe("TC5: Stale Evidence causing disagreement → removed → resolved", () => {
    it("stale negative + fresh positive → stale excluded → no disagreement → satisfied", () => {
      const evStaleFail = makeEvidence({
        id: asEvidenceId("ev-stale-fail"),
        recordedAt: "2024-01-01T09:00:00Z", // BEFORE Run started → stale
        claim: "tests failed", // negative
      });
      const evFreshPass = makeEvidence({
        id: asEvidenceId("ev-fresh-pass"),
        recordedAt: "2024-01-01T10:30:00Z", // WITHIN Run lifecycle → fresh
        claim: "tests pass", // positive
      });
      const evaluation = engine.evaluate({
        run: makeRun(),
        criteria: makeCriteria(),
        evidence: [evStaleFail, evFreshPass],
        evaluator: "test",
      });

      // Without temporal check: disagreement would be detected (pass vs fail)
      // With temporal check: stale Evidence (ev-stale-fail) is excluded
      // Only the fresh Evidence (ev-fresh-pass) remains → no disagreement
      // → criterion satisfied
      expect(evaluation.results[0]?.satisfied).toBe(true);
      expect(evaluation.overallResult).toBe("verified_succeeded");
      // The disagreement limitation should NOT be present (stale Evidence excluded)
      const disagreementLim = evaluation.limitations?.find((l) => l.includes("Disagreement detected"));
      expect(disagreementLim).toBeUndefined();
      // The temporal inconsistency limitation SHOULD be present
      const temporalLim = evaluation.limitations?.find((l) => l.includes("Temporal inconsistency"));
      expect(temporalLim).toBeDefined();
    });
  });

  describe("TC6: Limitation records temporal inconsistency", () => {
    it("limitations include 'Temporal inconsistency' when stale Evidence exists", () => {
      const evStale = makeEvidence({
        id: asEvidenceId("ev-stale-lim"),
        recordedAt: "2024-01-01T09:00:00Z", // before Run started
      });
      const evaluation = engine.evaluate({
        run: makeRun(),
        criteria: makeCriteria(),
        evidence: [evStale],
        evaluator: "test",
      });
      const temporalLim = evaluation.limitations?.find((l) => l.includes("Temporal inconsistency"));
      expect(temporalLim).toBeDefined();
      expect(temporalLim).toContain("ev-stale-lim");
    });
  });

  describe("TC7: No startedAt/endedAt → no temporal check", () => {
    it("Run without startedAt/endedAt → no staleness detected", () => {
      const ev = makeEvidence({ recordedAt: "2024-01-01T09:00:00Z" });
      const evaluation = engine.evaluate({
        run: makeRun({ startedAt: undefined, endedAt: undefined }),
        criteria: makeCriteria(),
        evidence: [ev],
        evaluator: "test",
      });
      // No startedAt/endedAt → temporal check skipped → Evidence counts
      expect(evaluation.results[0]?.satisfied).toBe(true);
      expect(evaluation.overallResult).toBe("verified_succeeded");
    });
  });

  describe("TC8: Unverified Evidence NOT checked for temporal consistency", () => {
    it("unverified Evidence with wrong timestamp → not flagged as stale", () => {
      const evUnverified = makeEvidence({
        id: asEvidenceId("ev-unverified-stale"),
        recordedAt: "2024-01-01T09:00:00Z", // before Run started
        verified: false,
      });
      const result = detectEvidenceTemporalInconsistency([evUnverified], makeRun());
      // Unverified → not checked → no inconsistency
      expect(result.hasInconsistency).toBe(false);
    });
  });

  describe("TC9: detectEvidenceTemporalInconsistency is standalone-testable", () => {
    it("returns hasInconsistency=false for temporally consistent Evidence", () => {
      const ev = makeEvidence({ recordedAt: "2024-01-01T10:30:00Z" });
      const result = detectEvidenceTemporalInconsistency([ev], makeRun());
      expect(result.hasInconsistency).toBe(false);
      expect(result.staleEvidenceIds).toEqual([]);
    });

    it("returns hasInconsistency=true for Evidence before Run started", () => {
      const ev = makeEvidence({
        id: asEvidenceId("ev-before-start"),
        recordedAt: "2024-01-01T09:00:00Z",
      });
      const result = detectEvidenceTemporalInconsistency([ev], makeRun());
      expect(result.hasInconsistency).toBe(true);
      expect(result.staleEvidenceIds).toContain("ev-before-start");
    });

    it("returns hasInconsistency=true for Evidence after Run ended", () => {
      const ev = makeEvidence({
        id: asEvidenceId("ev-after-end"),
        recordedAt: "2024-01-01T12:00:00Z",
      });
      const result = detectEvidenceTemporalInconsistency([ev], makeRun());
      expect(result.hasInconsistency).toBe(true);
      expect(result.staleEvidenceIds).toContain("ev-after-end");
    });
  });

  describe("TC10: existing behavior unchanged when all Evidence is temporally consistent", () => {
    it("single consistent Evidence → verified_succeeded (unchanged)", () => {
      const ev = makeEvidence({ recordedAt: "2024-01-01T10:30:00Z" });
      const evaluation = engine.evaluate({
        run: makeRun(),
        criteria: makeCriteria(),
        evidence: [ev],
        evaluator: "test",
      });
      expect(evaluation.overallResult).toBe("verified_succeeded");
    });

    it("no Evidence → claimed_succeeded_unverified (unchanged)", () => {
      const evaluation = engine.evaluate({
        run: makeRun(),
        criteria: makeCriteria(),
        evidence: [],
        evaluator: "test",
      });
      expect(evaluation.overallResult).toBe("claimed_succeeded_unverified");
    });
  });

  describe("TC11: all stale → criterion NOT satisfied", () => {
    it("all Evidence is stale → criterion NOT satisfied + reason mentions temporal staleness", () => {
      const ev1 = makeEvidence({
        id: asEvidenceId("ev-all-stale-1"),
        recordedAt: "2024-01-01T09:00:00Z",
        claim: "tests pass",
      });
      const ev2 = makeEvidence({
        id: asEvidenceId("ev-all-stale-2"),
        recordedAt: "2024-01-01T09:30:00Z",
        claim: "tests pass",
      });
      const evaluation = engine.evaluate({
        run: makeRun(),
        criteria: makeCriteria(),
        evidence: [ev1, ev2],
        evaluator: "test",
      });
      expect(evaluation.results[0]?.satisfied).toBe(false);
      expect(evaluation.results[0]?.reason).toContain("temporally stale");
    });
  });

  describe("TC12: interaction with disagreement check (layered)", () => {
    it("stale disagreeing + fresh agreeing → stale excluded → fresh agrees → satisfied", () => {
      const evStaleFail = makeEvidence({
        id: asEvidenceId("ev-stale-disagree-fail"),
        recordedAt: "2024-01-01T09:00:00Z", // stale
        claim: "tests failed", // negative
      });
      const evFreshPass1 = makeEvidence({
        id: asEvidenceId("ev-fresh-pass-1"),
        recordedAt: "2024-01-01T10:30:00Z", // fresh
        claim: "tests pass", // positive
      });
      const evFreshPass2 = makeEvidence({
        id: asEvidenceId("ev-fresh-pass-2"),
        recordedAt: "2024-01-01T10:45:00Z", // fresh
        claim: "all tests passed", // positive
      });
      const evaluation = engine.evaluate({
        run: makeRun(),
        criteria: makeCriteria(),
        evidence: [evStaleFail, evFreshPass1, evFreshPass2],
        evaluator: "test",
      });

      // Layered processing:
      // 1. evStaleFail is stale → excluded
      // 2. evFreshPass1 + evFreshPass2 are both positive → no disagreement
      // 3. Criterion satisfied
      expect(evaluation.results[0]?.satisfied).toBe(true);
      expect(evaluation.overallResult).toBe("verified_succeeded");

      // Disagreement limitation should NOT be present (stale Evidence excluded first)
      const disagreementLim = evaluation.limitations?.find((l) => l.includes("Disagreement detected"));
      expect(disagreementLim).toBeUndefined();

      // Temporal limitation SHOULD be present
      const temporalLim = evaluation.limitations?.find((l) => l.includes("Temporal inconsistency"));
      expect(temporalLim).toBeDefined();
    });

    it("fresh disagreeing (no stale) → disagreement detected → NOT satisfied", () => {
      const evFreshPass = makeEvidence({
        id: asEvidenceId("ev-fresh-pass"),
        recordedAt: "2024-01-01T10:30:00Z", // fresh
        claim: "tests pass",
      });
      const evFreshFail = makeEvidence({
        id: asEvidenceId("ev-fresh-fail"),
        recordedAt: "2024-01-01T10:45:00Z", // fresh
        claim: "tests failed",
      });
      const evaluation = engine.evaluate({
        run: makeRun(),
        criteria: makeCriteria(),
        evidence: [evFreshPass, evFreshFail],
        evaluator: "test",
      });

      // Both are fresh → temporal check passes → disagreement check runs → disagreement detected
      expect(evaluation.results[0]?.satisfied).toBe(false);
      expect(evaluation.results[0]?.reason).toContain("Disagreement detected");
    });
  });
});
