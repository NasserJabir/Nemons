/**
 * CandidateGenerator tests.
 *
 * Verifies the architectural link from Stage D (Experience) to
 * Stage F (Governed Evolution):
 *
 *   Run → Evidence → Evaluation → Experience → Candidate
 *
 * Architectural invariants verified:
 *   CG1: generateFromExperience produces a candidate with status='proposed'.
 *   CG2: rejects when the Experience is NOT 'approved' (Evidence before claims).
 *   CG3: rejects update generation without an assetId.
 *   CG4: the candidate's proposedBy defaults to 'nemons.candidate-generator'.
 *   CG5: the candidate's rationale references the source Experience.
 *   CG6: the candidate's evidenceRefs reference the source Experience.
 *   CG7: the candidate's provenance starts as 'observed'.
 *   CG8: the generated candidate's changeKind is 'create' or 'update' correctly.
 *   CG9: the candidate's id is freshly minted (not reused).
 *   CG10: the candidate's supersedesCandidateId is preserved.
 *   CG11: the result preserves sourceExperienceId + sourceRunId (traceability).
 *   CG12: 100 generated candidates have distinct ids.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DefaultCandidateGenerator,
} from "../../src/candidate-generation/candidate-generator.js";
import type { GenerateFromExperienceInput } from "../../src/candidate-generation/candidate-generator.js";
import type { Experience } from "../../src/schemas/experience.js";
import type { CandidateRecord } from "../../src/schemas/candidate.js";
import {
  asExperienceId,
  asRunId,
  asEvaluationId,
  asEvidenceId,
  asCandidateId,
} from "../../src/core/identifiers.js";
import { isLifecycleViolationError, isContractValidationError } from "../../src/core/errors.js";

function makeExperience(overrides: Partial<Experience> = {}): Experience {
  return {
    id: asExperienceId("x-src"),
    runId: asRunId("r-src"),
    evaluationId: asEvaluationId("ev-src"),
    provenance: {
      kind: "approved",
      source: {
        kind: "evidence",
        evidenceId: asEvidenceId("ev-src") as never,
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

function makeInput(overrides: Partial<GenerateFromExperienceInput> = {}): GenerateFromExperienceInput {
  return {
    experience: makeExperience(),
    generationKind: "create_from_experience",
    assetKind: "skill",
    proposedVersion: "1.0.0",
    content: { name: "run-tests", description: "Run the test suite" },
    ...overrides,
  };
}

describe("CandidateGenerator", () => {
  let generator: DefaultCandidateGenerator;

  beforeEach(() => {
    generator = new DefaultCandidateGenerator();
  });

  describe("CG1: generates a candidate with status='proposed'", () => {
    it("produces a candidate in 'proposed' status", () => {
      const result = generator.generateFromExperience(makeInput());
      expect(result.candidate.status).toBe("proposed");
      expect(result.candidate.id).toBeDefined();
    });
  });

  describe("CG2: rejects when the Experience is NOT 'approved'", () => {
    it("throws for an 'observed' Experience", () => {
      expect(() =>
        generator.generateFromExperience(
          makeInput({
            experience: makeExperience({
              provenance: {
                kind: "observed",
                source: {
                  kind: "evidence",
                  evidenceId: asEvidenceId("x") as never,
                  at: "x",
                },
              },
            }),
          }),
        ),
      ).toThrow();
      try {
        generator.generateFromExperience(
          makeInput({
            experience: makeExperience({
              provenance: {
                kind: "observed",
                source: {
                  kind: "evidence",
                  evidenceId: asEvidenceId("x") as never,
                  at: "x",
                },
              },
            }),
          }),
        );
      } catch (e) {
        expect(isLifecycleViolationError(e)).toBe(true);
      }
    });

    it("throws for a 'reviewed' Experience", () => {
      expect(() =>
        generator.generateFromExperience(
          makeInput({
            experience: makeExperience({
              provenance: {
                kind: "reviewed",
                source: {
                  kind: "evidence",
                  evidenceId: asEvidenceId("x") as never,
                  at: "x",
                },
              },
            }),
          }),
        ),
      ).toThrow();
    });

    it("throws for a 'deprecated' Experience", () => {
      expect(() =>
        generator.generateFromExperience(
          makeInput({
            experience: makeExperience({
              provenance: {
                kind: "deprecated",
                source: {
                  kind: "evidence",
                  evidenceId: asEvidenceId("x") as never,
                  at: "x",
                },
              },
            }),
          }),
        ),
      ).toThrow();
    });
  });

  describe("CG3: rejects update generation without an assetId", () => {
    it("throws for update_from_experience without assetId", () => {
      expect(() =>
        generator.generateFromExperience(
          makeInput({
            generationKind: "update_from_experience",
            // no assetId
          }),
        ),
      ).toThrow();
      try {
        generator.generateFromExperience(
          makeInput({
            generationKind: "update_from_experience",
          }),
        );
      } catch (e) {
        expect(isContractValidationError(e)).toBe(true);
      }
    });

    it("accepts update_from_experience with assetId", () => {
      const result = generator.generateFromExperience(
        makeInput({
          generationKind: "update_from_experience",
          assetId: "skill-existing",
          proposedVersion: "1.1.0",
        }),
      );
      expect(result.candidate.changeKind).toBe("update");
      expect(result.candidate.assetId).toBe("skill-existing");
    });
  });

  describe("CG4: proposedBy defaults to 'nemons.candidate-generator'", () => {
    it("uses the system identifier when proposedBy is not provided", () => {
      const result = generator.generateFromExperience(makeInput());
      expect(result.candidate.proposedBy).toBe("nemons.candidate-generator");
    });

    it("uses the provided proposedBy when set", () => {
      const result = generator.generateFromExperience(
        makeInput({ proposedBy: "alice" }),
      );
      expect(result.candidate.proposedBy).toBe("alice");
    });
  });

  describe("CG5: rationale references the source Experience", () => {
    it("the default rationale mentions the source Experience id and summary", () => {
      const result = generator.generateFromExperience(makeInput());
      expect(result.candidate.rationale).toContain("x-src"); // Experience id
      expect(result.candidate.rationale).toContain("Rebuild before tests"); // summary
    });

    it("uses the provided rationale when set", () => {
      const result = generator.generateFromExperience(
        makeInput({ rationale: "Custom rationale" }),
      );
      expect(result.candidate.rationale).toBe("Custom rationale");
    });
  });

  describe("CG6: evidenceRefs reference the source Experience", () => {
    it("the candidate's evidenceRefs contains the source Experience's id", () => {
      const result = generator.generateFromExperience(makeInput());
      expect(result.candidate.evidenceRefs).toContain("x-src");
    });
  });

  describe("CG7: provenance starts as 'observed'", () => {
    it("the generated candidate's provenance.kind is 'observed'", () => {
      const result = generator.generateFromExperience(makeInput());
      // CRITICAL: the candidate starts as observed — bypasses nothing
      expect(result.candidate.provenance.kind).toBe("observed");
    });
  });

  describe("CG8: changeKind is correctly determined", () => {
    it("create_from_experience produces changeKind='create'", () => {
      const result = generator.generateFromExperience(
        makeInput({ generationKind: "create_from_experience" }),
      );
      expect(result.candidate.changeKind).toBe("create");
    });

    it("update_from_experience produces changeKind='update'", () => {
      const result = generator.generateFromExperience(
        makeInput({
          generationKind: "update_from_experience",
          assetId: "skill-existing",
        }),
      );
      expect(result.candidate.changeKind).toBe("update");
    });
  });

  describe("CG9 + CG12: id is freshly minted and unique", () => {
    it("the generated candidate has a fresh id (distinct from the source Experience's id)", () => {
      const result = generator.generateFromExperience(makeInput());
      expect(result.candidate.id).not.toBe("x-src"); // not the Experience id
    });

    it("100 generated candidates have distinct ids", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const result = generator.generateFromExperience(makeInput());
        ids.add(result.candidate.id);
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("CG10: supersedesCandidateId is preserved", () => {
    it("the candidate's supersedesCandidateId matches the input", () => {
      const oldCandId = asCandidateId("c-old");
      const result = generator.generateFromExperience(
        makeInput({
          generationKind: "update_from_experience",
          assetId: "skill-existing",
          supersedesCandidateId: oldCandId,
          supersedesVersion: "1.0.0",
        }),
      );
      expect(result.candidate.supersedesCandidateId).toBe(oldCandId);
      expect(result.candidate.supersedesVersion).toBe("1.0.0");
    });

    it("the candidate's supersedesCandidateId is undefined when not provided", () => {
      const result = generator.generateFromExperience(
        makeInput({ generationKind: "create_from_experience" }),
      );
      expect(result.candidate.supersedesCandidateId).toBeUndefined();
    });
  });

  describe("CG11: result preserves sourceExperienceId + sourceRunId", () => {
    it("the result carries the source Experience's id", () => {
      const result = generator.generateFromExperience(makeInput());
      expect(result.sourceExperienceId).toBe("x-src");
    });

    it("the result carries the source Run's id", () => {
      const result = generator.generateFromExperience(makeInput());
      expect(result.sourceRunId).toBe("r-src");
    });
  });

  describe("architectural invariants", () => {
    it("the generated candidate is NEVER approved (bypasses nothing)", () => {
      const result = generator.generateFromExperience(makeInput());
      expect(result.candidate.status).not.toBe("approved");
      expect(result.candidate.status).toBe("proposed");
    });

    it("the generated candidate references the source Experience via evidenceRefs", () => {
      const result = generator.generateFromExperience(makeInput());
      expect(result.candidate.evidenceRefs).toBeDefined();
      expect(result.candidate.evidenceRefs!.length).toBeGreaterThan(0);
    });

    it("the generated candidate has an empty reviewTrail (no reviews yet)", () => {
      const result = generator.generateFromExperience(makeInput());
      expect(result.candidate.reviewTrail).toEqual([]);
    });

    it("the generated candidate's content matches the input", () => {
      const input = makeInput({
        content: { name: "run-tests", description: "Updated description" },
      });
      const result = generator.generateFromExperience(input);
      expect(result.candidate.content).toEqual({
        name: "run-tests",
        description: "Updated description",
      });
    });

    it("the generated candidate's proposedVersion matches the input", () => {
      const result = generator.generateFromExperience(
        makeInput({ proposedVersion: "2.0.0" }),
      );
      expect(result.candidate.proposedVersion).toBe("2.0.0");
    });

    it("the generated candidate's assetKind matches the input", () => {
      const result = generator.generateFromExperience(
        makeInput({ assetKind: "persona" }),
      );
      expect(result.candidate.assetKind).toBe("persona");
    });
  });

  describe("default assetId for creates", () => {
    it("mints a new assetId for create_from_experience when none is provided", () => {
      const result = generator.generateFromExperience(
        makeInput({ generationKind: "create_from_experience" }),
      );
      expect(result.candidate.assetId).toMatch(/^asset-/);
    });

    it("uses the provided assetId for create_from_experience", () => {
      const result = generator.generateFromExperience(
        makeInput({
          generationKind: "create_from_experience",
          assetId: "skill-custom",
        }),
      );
      expect(result.candidate.assetId).toBe("skill-custom");
    });
  });
});
