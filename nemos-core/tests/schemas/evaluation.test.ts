import { describe, it, expect } from "vitest";
import {
  validateEvaluation,
  isEvaluationVerifiedSucceeded,
} from "../../src/schemas/evaluation.js";
import type { Evaluation } from "../../src/schemas/evaluation.js";
import { asEvaluationId, asRunId } from "../../src/core/identifiers.js";
import { ContractValidationError } from "../../src/core/errors.js";

function makeEvaluation(overrides: Partial<Evaluation> = {}): Evaluation {
  return {
    id: asEvaluationId("ev-1"),
    runId: asRunId("r-1"),
    criteria: [
      {
        id: "c-1",
        description: "Tests pass",
        requiredEvidenceKinds: ["test_result"],
        required: true,
      },
    ],
    results: [
      {
        criterionId: "c-1",
        satisfied: true,
        examinedEvidenceRefs: ["ev-1"],
        reason: "Found verified test_result evidence.",
      },
    ],
    overallResult: "verified_succeeded",
    provenance: {
      kind: "observed",
      source: { kind: "run", runId: asRunId("r-1"), at: "2024-01-01T00:00:00Z" },
    },
    evaluatedAt: "2024-01-01T00:00:00Z",
    evaluator: "default-evaluator",
    ...overrides,
  };
}

describe("evaluation schema", () => {
  describe("validateEvaluation", () => {
    it("accepts a valid Evaluation record", () => {
      expect(() => validateEvaluation(makeEvaluation())).not.toThrow();
    });

    it("rejects null", () => {
      expect(() => validateEvaluation(null)).toThrowError(ContractValidationError);
    });

    it("rejects an invalid overallResult", () => {
      const e = makeEvaluation() as unknown as Record<string, unknown>;
      e.overallResult = "weird";
      expect(() => validateEvaluation(e)).toThrowError(ContractValidationError);
    });

    it("rejects non-array criteria", () => {
      const e = makeEvaluation() as unknown as Record<string, unknown>;
      e.criteria = "wrong";
      expect(() => validateEvaluation(e)).toThrowError(ContractValidationError);
    });

    it("rejects an empty evaluator", () => {
      expect(() => validateEvaluation(makeEvaluation({ evaluator: "" }))).toThrowError(ContractValidationError);
    });
  });

  describe("isEvaluationVerifiedSucceeded", () => {
    it("returns true when overallResult is verified_succeeded", () => {
      expect(isEvaluationVerifiedSucceeded(makeEvaluation())).toBe(true);
    });

    it("returns false when overallResult is claimed_succeeded_unverified", () => {
      expect(
        isEvaluationVerifiedSucceeded(
          makeEvaluation({ overallResult: "claimed_succeeded_unverified" }),
        ),
      ).toBe(false);
    });

    it("returns false when overallResult is failed", () => {
      expect(
        isEvaluationVerifiedSucceeded(makeEvaluation({ overallResult: "failed" })),
      ).toBe(false);
    });

    it("returns false when overallResult is inconclusive", () => {
      expect(
        isEvaluationVerifiedSucceeded(makeEvaluation({ overallResult: "inconclusive" })),
      ).toBe(false);
    });
  });
});
