/**
 * Stage B — Evaluation outcome invariants.
 *
 * Verifies that the EvaluationEngine's outcome classification is correct
 * for ALL combinations of (claimed outcome, criteria, evidence):
 *
 *   V1: verified_succeeded requires ALL required criteria to be satisfied
 *       by VERIFIED evidence.
 *   V2: claimed_succeeded_unverified occurs when the Run claimed success
 *       but criteria are not all satisfied.
 *   V3: failed occurs when the Run claimed failure (regardless of evidence).
 *   V4: inconclusive occurs when no claim is made and criteria are not met.
 *   V5: unverified evidence NEVER counts toward criterion satisfaction.
 *   V6: a criterion with `required: false` does NOT contribute to the
 *       "all required satisfied" check.
 *   V7: limitations are recorded for any input gap.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DefaultEvaluationEngine } from "../../src/evaluation/evaluation-engine.js";
import { DefaultEvidenceCollector } from "../../src/evidence/evidence-collector.js";
import { DefaultEvidenceValidator } from "../../src/evidence/evidence-validator.js";
import type { Run, RunInputs } from "../../src/schemas/run.js";
import type { Evidence } from "../../src/schemas/evidence.js";
import type { EvaluationCriterion } from "../../src/schemas/evaluation.js";
import { asRunId, asContextPackId } from "../../src/core/identifiers.js";

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
    id: asRunId("r-eval-1"),
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

describe("Stage B — evaluation outcome invariants", () => {
  let engine: DefaultEvaluationEngine;
  let collector: DefaultEvidenceCollector;
  let validator: DefaultEvidenceValidator;

  beforeEach(() => {
    engine = new DefaultEvaluationEngine();
    collector = new DefaultEvidenceCollector();
    validator = new DefaultEvidenceValidator();
  });

  function makeCriteria(overrides: Partial<EvaluationCriterion> = {}): EvaluationCriterion {
    return {
      id: "c-1",
      description: "tests pass",
      requiredEvidenceKinds: ["test_result"],
      required: true,
      ...overrides,
    };
  }

  function makeVerifiedEvidence(kind: Evidence["kind"], claim: string, runId = asRunId("r-eval-1")): Evidence {
    const e = collector.fromVerificationResult(runId, {
      kind: kind as "verification_report" | "acceptance_result" | "validation_output",
      claim,
      payload: JSON.stringify({ ok: true }),
    });
    return validator.verify(e);
  }

  function makeUnverifiedEvidence(kind: Evidence["kind"]): Evidence {
    // An inline-payload evidence with a deliberately-mismatched hash
    return {
      id: "ev-bad" as never,
      runId: asRunId("r-eval-1"),
      kind,
      claim: "unverified",
      artifact: { inlinePayload: "x", contentHash: "tampered" },
      provenance: {
        kind: "observed",
        source: { kind: "run", runId: asRunId("r-eval-1"), at: "x" },
      },
      recordedAt: "x",
      verified: false,
    };
  }

  describe("V1: verified_succeeded requires ALL required criteria satisfied by verified evidence", () => {
    it("single criterion, single matching verified evidence → verified_succeeded", () => {
      const ev = makeVerifiedEvidence("test_result", "tests pass");
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "succeeded" } }),
        criteria: [makeCriteria()],
        evidence: [ev],
        evaluator: "default",
      });
      expect(evaluation.overallResult).toBe("verified_succeeded");
    });

    it("two required criteria, both satisfied → verified_succeeded", () => {
      const testEv = makeVerifiedEvidence("test_result", "tests pass");
      const buildEv = makeVerifiedEvidence("build_output", "build ok");
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "succeeded" } }),
        criteria: [
          makeCriteria({ id: "c-tests", requiredEvidenceKinds: ["test_result"] }),
          makeCriteria({ id: "c-build", requiredEvidenceKinds: ["build_output"] }),
        ],
        evidence: [testEv, buildEv],
        evaluator: "default",
      });
      expect(evaluation.overallResult).toBe("verified_succeeded");
    });

    it("two required criteria, only one satisfied → NOT verified_succeeded", () => {
      const testEv = makeVerifiedEvidence("test_result", "tests pass");
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "succeeded" } }),
        criteria: [
          makeCriteria({ id: "c-tests", requiredEvidenceKinds: ["test_result"] }),
          makeCriteria({ id: "c-build", requiredEvidenceKinds: ["build_output"] }),
        ],
        evidence: [testEv], // missing build evidence
        evaluator: "default",
      });
      expect(evaluation.overallResult).not.toBe("verified_succeeded");
    });
  });

  describe("V2: claimed_succeeded_unverified when claim is success but criteria not all met", () => {
    it("claim=succeeded, no evidence → claimed_succeeded_unverified", () => {
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "succeeded" } }),
        criteria: [makeCriteria()],
        evidence: [],
        evaluator: "default",
      });
      expect(evaluation.overallResult).toBe("claimed_succeeded_unverified");
    });

    it("claim=succeeded, only unverified evidence → claimed_succeeded_unverified", () => {
      const unverified = makeUnverifiedEvidence("test_result");
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "succeeded" } }),
        criteria: [makeCriteria()],
        evidence: [unverified],
        evaluator: "default",
      });
      expect(evaluation.overallResult).toBe("claimed_succeeded_unverified");
    });
  });

  describe("V3: failed when Run claimed failure AND criteria NOT satisfied", () => {
    it("claim=failed, no evidence → failed", () => {
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "failed" } }),
        criteria: [makeCriteria()],
        evidence: [],
        evaluator: "default",
      });
      expect(evaluation.overallResult).toBe("failed");
    });

    it("claim=failed, criteria NOT satisfied → failed (claim is preserved)", () => {
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "failed" } }),
        criteria: [makeCriteria({ requiredEvidenceKinds: ["verification_report"] })],
        evidence: [], // no matching evidence → criteria NOT satisfied
        evaluator: "default",
      });
      expect(evaluation.overallResult).toBe("failed");
    });

    it("claim=failed BUT criteria satisfied → verified_succeeded overrides claim", () => {
      // When the criteria are met by verified evidence, the evaluation
      // is verified_succeeded REGARDLESS of the Run's claimed outcome.
      // This is intentional: verified evidence overrides a pessimistic claim.
      const ev = makeVerifiedEvidence("test_result", "tests pass");
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "failed" } }),
        criteria: [makeCriteria()],
        evidence: [ev],
        evaluator: "default",
      });
      expect(evaluation.overallResult).toBe("verified_succeeded");
    });
  });

  describe("V4: inconclusive when no claim and criteria not met", () => {
    it("no claim (outputs undefined), no evidence → inconclusive", () => {
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: undefined }),
        criteria: [makeCriteria()],
        evidence: [],
        evaluator: "default",
      });
      expect(evaluation.overallResult).toBe("inconclusive");
    });

    it("claim=partial (not success/failure) → inconclusive", () => {
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "partial" } }),
        criteria: [makeCriteria()],
        evidence: [],
        evaluator: "default",
      });
      expect(evaluation.overallResult).toBe("inconclusive");
    });

    it("claim=unknown → inconclusive", () => {
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "unknown" } }),
        criteria: [makeCriteria()],
        evidence: [],
        evaluator: "default",
      });
      expect(evaluation.overallResult).toBe("inconclusive");
    });
  });

  describe("V5: unverified evidence never counts toward criterion satisfaction", () => {
    it("unverified evidence of matching kind → criterion NOT satisfied", () => {
      const unverified = makeUnverifiedEvidence("test_result");
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "succeeded" } }),
        criteria: [makeCriteria()],
        evidence: [unverified],
        evaluator: "default",
      });
      expect(evaluation.results[0]?.satisfied).toBe(false);
    });

    it("mixed verified and unverified evidence — only verified counts", () => {
      const verified = makeVerifiedEvidence("test_result", "tests pass");
      const unverified = makeUnverifiedEvidence("test_result");
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "succeeded" } }),
        criteria: [makeCriteria()],
        evidence: [verified, unverified],
        evaluator: "default",
      });
      // Criterion satisfied because verified evidence present
      expect(evaluation.results[0]?.satisfied).toBe(true);
      // But the unverified one was examined (just didn't count)
      expect(evaluation.results[0]?.examinedEvidenceRefs).toHaveLength(2);
    });
  });

  describe("V6: optional criteria (required=false) do not block verified_succeeded", () => {
    it("required criterion satisfied + optional criterion unsatisfied → verified_succeeded", () => {
      const ev = makeVerifiedEvidence("test_result", "tests pass");
      const evaluation = engine.evaluate({
        run: makeRun({ outputs: { claimedOutcome: "succeeded" } }),
        criteria: [
          makeCriteria({ id: "c-required", required: true }),
          makeCriteria({
            id: "c-optional",
            required: false,
            requiredEvidenceKinds: ["build_output"],
          }),
        ],
        evidence: [ev], // no build_output evidence
        evaluator: "default",
      });
      // Required criterion satisfied → verified_succeeded (optional ignored)
      expect(evaluation.overallResult).toBe("verified_succeeded");
      // The optional criterion's result is recorded, but it doesn't block
      expect(evaluation.results[1]?.satisfied).toBe(false);
    });
  });

  describe("V7: limitations are recorded for any input gap", () => {
    it("no evidence → limitation mentions 'No Evidence'", () => {
      const evaluation = engine.evaluate({
        run: makeRun(),
        criteria: [makeCriteria()],
        evidence: [],
        evaluator: "default",
      });
      expect(evaluation.limitations?.some((l) => l.includes("No Evidence"))).toBe(true);
    });

    it("no criteria → limitation mentions 'No criteria'", () => {
      const evaluation = engine.evaluate({
        run: makeRun(),
        criteria: [],
        evidence: [],
        evaluator: "default",
      });
      expect(evaluation.limitations?.some((l) => l.includes("No criteria"))).toBe(true);
    });

    it("unverified evidence present → limitation mentions 'not verified'", () => {
      const unverified = makeUnverifiedEvidence("test_result");
      const evaluation = engine.evaluate({
        run: makeRun(),
        criteria: [makeCriteria()],
        evidence: [unverified],
        evaluator: "default",
      });
      expect(
        evaluation.limitations?.some((l) => l.includes("not verified")),
      ).toBe(true);
    });
  });

  describe("outcome classification matrix — exhaustive enumeration", () => {
    // For every (claimedOutcome, hasMatchingVerifiedEvidence) pair,
    // verify the outcome classification.
    const claimedOutcomes = ["succeeded", "failed", "partial", "unknown"] as const;

    for (const claimed of claimedOutcomes) {
      it(`claim=${claimed}, no verified evidence → classified correctly`, () => {
        const evaluation = engine.evaluate({
          run: makeRun({ outputs: { claimedOutcome: claimed } }),
          criteria: [makeCriteria()],
          evidence: [],
          evaluator: "default",
        });
        // Expected outcome by claim:
        if (claimed === "succeeded") {
          expect(evaluation.overallResult).toBe("claimed_succeeded_unverified");
        } else if (claimed === "failed") {
          expect(evaluation.overallResult).toBe("failed");
        } else {
          expect(evaluation.overallResult).toBe("inconclusive");
        }
      });

      it(`claim=${claimed}, matching verified evidence → classified correctly`, () => {
        const ev = makeVerifiedEvidence("test_result", "tests pass");
        const evaluation = engine.evaluate({
          run: makeRun({ outputs: { claimedOutcome: claimed } }),
          criteria: [makeCriteria()],
          evidence: [ev],
          evaluator: "default",
        });
        // When criteria are met by verified evidence, the outcome is
        // verified_succeeded regardless of the claim (verified evidence
        // overrides the claim).
        expect(evaluation.overallResult).toBe("verified_succeeded");
      });
    }
  });
});
