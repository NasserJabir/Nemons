import { describe, it, expect } from "vitest";
import {
  validateExperience,
  isExperienceReusable,
  isExperienceApproved,
  isExperienceApprovedAndReusable,
} from "../../src/schemas/experience.js";
import type { Experience } from "../../src/schemas/experience.js";
import { asExperienceId, asRunId, asEvaluationId } from "../../src/core/identifiers.js";
import { ContractValidationError } from "../../src/core/errors.js";

function makeExperience(overrides: Partial<Experience> = {}): Experience {
  return {
    id: asExperienceId("x-1"),
    runId: asRunId("r-1"),
    evaluationId: asEvaluationId("ev-1"),
    provenance: {
      kind: "approved",
      source: { kind: "evidence", evidenceId: asExperienceId("x-source") as never, at: "2024-01-01T00:00:00Z" },
    },
    applicability: { taskKinds: ["test-fix"] },
    reusability: "reusable",
    summary: "Rebuild before running tests to avoid stale artifacts.",
    learnedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("experience schema", () => {
  describe("validateExperience", () => {
    it("accepts a valid Experience record", () => {
      expect(() => validateExperience(makeExperience())).not.toThrow();
    });

    it("rejects null", () => {
      expect(() => validateExperience(null)).toThrowError(ContractValidationError);
    });

    it("rejects an invalid reusability", () => {
      const e = makeExperience() as unknown as Record<string, unknown>;
      e.reusability = "weird";
      expect(() => validateExperience(e)).toThrowError(ContractValidationError);
    });

    it("rejects an empty summary", () => {
      expect(() => validateExperience(makeExperience({ summary: "" }))).toThrowError(ContractValidationError);
    });

    it("rejects an empty learnedAt", () => {
      expect(() => validateExperience(makeExperience({ learnedAt: "" }))).toThrowError(ContractValidationError);
    });
  });

  describe("isExperienceReusable", () => {
    it("returns true for reusable", () => {
      expect(isExperienceReusable(makeExperience())).toBe(true);
    });

    it("returns true for conditionally_reusable", () => {
      expect(isExperienceReusable(makeExperience({ reusability: "conditionally_reusable" }))).toBe(true);
    });

    it("returns false for not_reusable", () => {
      expect(isExperienceReusable(makeExperience({ reusability: "not_reusable" }))).toBe(false);
    });
  });

  describe("isExperienceApproved", () => {
    it("returns true for approved provenance", () => {
      expect(isExperienceApproved(makeExperience())).toBe(true);
    });

    it("returns false for observed provenance", () => {
      expect(
        isExperienceApproved(
          makeExperience({
            provenance: { kind: "observed", source: { kind: "evidence", evidenceId: asExperienceId("x") as never, at: "x" } },
          }),
        ),
      ).toBe(false);
    });
  });

  describe("isExperienceApprovedAndReusable", () => {
    it("returns true only when BOTH approved AND reusable", () => {
      expect(isExperienceApprovedAndReusable(makeExperience())).toBe(true);
      expect(
        isExperienceApprovedAndReusable(
          makeExperience({ reusability: "not_reusable" }),
        ),
      ).toBe(false);
      expect(
        isExperienceApprovedAndReusable(
          makeExperience({
            provenance: { kind: "observed", source: { kind: "evidence", evidenceId: asExperienceId("x") as never, at: "x" } },
          }),
        ),
      ).toBe(false);
    });
  });
});
