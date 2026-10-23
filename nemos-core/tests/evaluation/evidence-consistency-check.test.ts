/**
 * Evidence Consistency Check tests (ADR-0007 — from VeriHarness research).
 *
 * Verifies:
 *   EC1: when all Evidence agrees (positive), the criterion is satisfied.
 *   EC2: when Evidence disagrees (one positive, one negative), the criterion is NOT satisfied.
 *   EC3: when Evidence disagrees, the overallResult is inconclusive (not verified_succeeded).
 *   EC4: when Evidence disagrees, a `disagreement_detected` limitation is recorded.
 *   EC5: when Evidence has no keyword match, no disagreement is detected.
 *   EC6: when only one Evidence record exists, no disagreement is detected.
 *   EC7: unverified Evidence is NOT considered in the disagreement check.
 *   EC8: disagreement is detected per-kind (different kinds don't cross-contaminate).
 *   EC9: the detectEvidenceDisagreement function is exported and standalone-testable.
 *   EC10: existing tests still pass (when Evidence agrees, behavior is unchanged).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DefaultEvaluationEngine, detectEvidenceDisagreement } from "../../src/evaluation/evaluation-engine.js";
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
    id: asRunId("r-ev-cons-1"),
    state: "in_progress",
    inputs: makeRunInputs(),
    contextPackId: asContextPackId("cp-1"),
    provenance: {
      kind: "observed",
      source: { kind: "human", actor: "tester", at: "x" },
    },
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: asEvidenceId("ev-1"),
    runId: asRunId("r-ev-cons-1"),
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
      source: { kind: "run", runId: asRunId("r-ev-cons-1"), at: "x" },
    },
    recordedAt: "2024-01-01T00:00:00Z",
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

describe("Evidence Consistency Check (ADR-0007 — VeriHarness)", () => {
  let engine: DefaultEvaluationEngine;

  beforeEach(() => {
    engine = new DefaultEvaluationEngine();
  });

  describe("EC1: when all Evidence agrees (positive), the criterion is satisfied", () => {
    it("two positive Evidence records → criterion satisfied → verified_succeeded", () => {
      const ev1 = makeEvidence({ id: asEvidenceId("ev-pos-1"), claim: "tests pass" });
      const ev2 = makeEvidence({ id: asEvidenceId("ev-pos-2"), claim: "all tests passed" });
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "succeeded" } }),
        criteria: makeCriteria(),
        evidence: [ev1, ev2],
        evaluator: "test",
      });
      expect(evaluation.overallResult).toBe("verified_succeeded");
      expect(evaluation.results[0]?.satisfied).toBe(true);
    });
  });

  describe("EC2: when Evidence disagrees, the criterion is NOT satisfied", () => {
    it("one positive + one negative → criterion NOT satisfied", () => {
      const evPass = makeEvidence({ id: asEvidenceId("ev-pass"), claim: "tests pass" });
      const evFail = makeEvidence({ id: asEvidenceId("ev-fail"), claim: "tests failed" });
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "succeeded" } }),
        criteria: makeCriteria(),
        evidence: [evPass, evFail],
        evaluator: "test",
      });
      expect(evaluation.results[0]?.satisfied).toBe(false);
      expect(evaluation.results[0]?.reason).toContain("Disagreement detected");
    });
  });

  describe("EC3: when Evidence disagrees, overallResult is inconclusive", () => {
    it("disagreement → inconclusive (not verified_succeeded)", () => {
      const evPass = makeEvidence({ id: asEvidenceId("ev-pass"), claim: "tests pass" });
      const evFail = makeEvidence({ id: asEvidenceId("ev-fail"), claim: "tests failed" });
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "succeeded" } }),
        criteria: makeCriteria(),
        evidence: [evPass, evFail],
        evaluator: "test",
      });
      // With disagreement, the required criterion is not satisfied.
      // The Run claimed "succeeded" but criteria aren't met → claimed_succeeded_unverified
      expect(evaluation.overallResult).toBe("claimed_succeeded_unverified");
    });

    it("disagreement + no claim → inconclusive", () => {
      const evPass = makeEvidence({ id: asEvidenceId("ev-pass"), claim: "tests pass" });
      const evFail = makeEvidence({ id: asEvidenceId("ev-fail"), claim: "tests failed" });
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: undefined }),
        criteria: makeCriteria(),
        evidence: [evPass, evFail],
        evaluator: "test",
      });
      expect(evaluation.overallResult).toBe("inconclusive");
    });
  });

  describe("EC4: disagreement is recorded as a limitation", () => {
    it("limitations include 'Disagreement detected'", () => {
      const evPass = makeEvidence({ id: asEvidenceId("ev-pass"), claim: "tests pass" });
      const evFail = makeEvidence({ id: asEvidenceId("ev-fail"), claim: "tests failed" });
      const evaluation = engine.evaluate({
        run: makeRun(),
        criteria: makeCriteria(),
        evidence: [evPass, evFail],
        evaluator: "test",
      });
      expect(evaluation.limitations).toBeDefined();
      const disagreementLim = evaluation.limitations?.find((l) => l.includes("Disagreement detected"));
      expect(disagreementLim).toBeDefined();
      expect(disagreementLim).toContain("test_result");
    });
  });

  describe("EC5: Evidence with no keyword match → no disagreement", () => {
    it("two neutral claims → no disagreement detected", () => {
      const ev1 = makeEvidence({ id: asEvidenceId("ev-neutral-1"), claim: "build completed" });
      const ev2 = makeEvidence({ id: asEvidenceId("ev-neutral-2"), claim: "compilation done" });
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "succeeded" } }),
        criteria: makeCriteria(),
        evidence: [ev1, ev2],
        evaluator: "test",
      });
      // Neither contains pass/fail keywords → no disagreement → criterion satisfied
      expect(evaluation.results[0]?.satisfied).toBe(true);
      expect(evaluation.overallResult).toBe("verified_succeeded");
    });
  });

  describe("EC6: single Evidence → no disagreement", () => {
    it("one Evidence → no disagreement possible", () => {
      const ev = makeEvidence({ claim: "tests pass" });
      const result = detectEvidenceDisagreement([ev]);
      expect(result.hasDisagreement).toBe(false);
    });

    it("zero Evidence → no disagreement", () => {
      const result = detectEvidenceDisagreement([]);
      expect(result.hasDisagreement).toBe(false);
    });
  });

  describe("EC7: unverified Evidence is NOT considered", () => {
    it("one verified positive + one unverified negative → no disagreement", () => {
      const evPass = makeEvidence({ id: asEvidenceId("ev-pass"), claim: "tests pass", verified: true });
      const evFail = makeEvidence({ id: asEvidenceId("ev-fail"), claim: "tests failed", verified: false });
      const result = detectEvidenceDisagreement([evPass, evFail]);
      expect(result.hasDisagreement).toBe(false);
    });
  });

  describe("EC8: disagreement is detected per-kind", () => {
    it("positive test_result + negative build_output → no disagreement (different kinds)", () => {
      const evTestPass = makeEvidence({
        id: asEvidenceId("ev-test-pass"),
        kind: "test_result",
        claim: "tests pass",
      });
      const evBuildFail = makeEvidence({
        id: asEvidenceId("ev-build-fail"),
        kind: "build_output",
        claim: "build failed",
      });
      const result = detectEvidenceDisagreement([evTestPass, evBuildFail]);
      // Different kinds → no cross-kind disagreement
      expect(result.hasDisagreement).toBe(false);
    });

    it("two test_result records (one pass, one fail) → disagreement", () => {
      const evPass = makeEvidence({
        id: asEvidenceId("ev-test-pass"),
        kind: "test_result",
        claim: "tests pass",
      });
      const evFail = makeEvidence({
        id: asEvidenceId("ev-test-fail"),
        kind: "test_result",
        claim: "tests failed",
      });
      const result = detectEvidenceDisagreement([evPass, evFail]);
      expect(result.hasDisagreement).toBe(true);
      expect(result.description).toContain("test_result");
    });
  });

  describe("EC9: detectEvidenceDisagreement is standalone-testable", () => {
    it("returns hasDisagreement=false for consistent evidence", () => {
      const ev1 = makeEvidence({ claim: "all tests pass" });
      const ev2 = makeEvidence({ claim: "tests passed successfully" });
      const result = detectEvidenceDisagreement([ev1, ev2]);
      expect(result.hasDisagreement).toBe(false);
      expect(result.description).toBe("");
    });

    it("returns hasDisagreement=true for contradictory evidence", () => {
      const ev1 = makeEvidence({ claim: "tests pass" });
      const ev2 = makeEvidence({ claim: "tests fail" });
      const result = detectEvidenceDisagreement([ev1, ev2]);
      expect(result.hasDisagreement).toBe(true);
      expect(result.description).toContain("disagree");
    });
  });

  describe("EC10: existing behavior unchanged when Evidence agrees", () => {
    it("single verified Evidence → verified_succeeded (unchanged from before)", () => {
      const ev = makeEvidence({ claim: "tests pass" });
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "succeeded" } }),
        criteria: makeCriteria(),
        evidence: [ev],
        evaluator: "test",
      });
      expect(evaluation.overallResult).toBe("verified_succeeded");
    });

    it("no Evidence → claimed_succeeded_unverified (unchanged)", () => {
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "succeeded" } }),
        criteria: makeCriteria(),
        evidence: [],
        evaluator: "test",
      });
      expect(evaluation.overallResult).toBe("claimed_succeeded_unverified");
    });
  });

  describe("EC11: keyword detection edge cases", () => {
    it("'succeeded' is a positive keyword", () => {
      const ev1 = makeEvidence({ claim: "build succeeded" });
      const ev2 = makeEvidence({ claim: "build failed" });
      const result = detectEvidenceDisagreement([ev1, ev2]);
      expect(result.hasDisagreement).toBe(true);
    });

    it("'error' is a negative keyword", () => {
      const ev1 = makeEvidence({ claim: "compilation ok" });
      const ev2 = makeEvidence({ claim: "compilation error" });
      const result = detectEvidenceDisagreement([ev1, ev2]);
      expect(result.hasDisagreement).toBe(true);
    });

    it("claims containing BOTH positive and negative keywords are not counted as either", () => {
      // If a claim says "tests pass but build failed", it has both keywords.
      // It's NOT counted as positive-only or negative-only, so it doesn't
      // trigger disagreement on its own.
      const ev1 = makeEvidence({ claim: "tests pass but build failed" });
      const ev2 = makeEvidence({ claim: "tests pass" });
      // ev1 has both → excluded from positive-only AND negative-only
      // ev2 is positive-only
      // Only ev2 is positive-only → no negative-only → no disagreement
      const result = detectEvidenceDisagreement([ev1, ev2]);
      expect(result.hasDisagreement).toBe(false);
    });
  });
});
