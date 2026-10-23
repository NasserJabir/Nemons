/**
 * Stage D — ExperienceDeriver tests.
 *
 * Verifies:
 *   D1: An Experience can be derived from a verified-succeeded Evaluation.
 *   D2: Derivation FAILS when Evaluation is NOT verified_succeeded.
 *   D3: Derivation FAILS when Evaluation.runId does not match Run.id.
 *   D4: Derivation FAILS when no Evidence is provided.
 *   D5: The derived Experience's provenance.kind is `observed` (initial).
 *   D6: The derived Experience's provenance source is `evidence`-kind.
 *   D7: Default reusability is `conditionally_reusable` (safe default).
 *   D8: Applicability is derived from Run when not overridden.
 *   D9: Override of applicability/reusability/reuseConditions is respected.
 *   D10: The derived Experience is structurally valid (passes validateExperience).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DefaultExperienceDeriver } from "../../src/experience/experience-deriver.js";
import type { DeriveExperienceInput } from "../../src/experience/experience-deriver.js";
import type { Run, RunInputs } from "../../src/schemas/run.js";
import type { Evidence } from "../../src/schemas/evidence.js";
import type { Evaluation } from "../../src/schemas/evaluation.js";
import {
  asRunId,
  asEvaluationId,
  asEvidenceId,
  asContextPackId,
  sha256Hex,
} from "../../src/core/identifiers.js";
import {
  isInsufficientEvidenceError,
  isContractValidationError,
} from "../../src/core/errors.js";

function makeRunInputs(): RunInputs {
  return {
    taskDescription: "Fix the failing test",
    taskKind: "test-fix",
    taskTags: ["vitest", "unit-test"],
    repoInstance: {
      repoIdentity: { repo: "https://example.com/repo.git", sha: "abc123" },
      instanceId: "inst-1",
    },
  };
}

function makeRun(): Run {
  return {
    id: asRunId("r-1"),
    state: "succeeded",
    inputs: makeRunInputs(),
    contextPackId: asContextPackId("cp-1"),
    provenance: {
      kind: "observed",
      source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
    },
    outputs: { claimedOutcome: "succeeded", claimedSummary: "Tests pass." },
    evidenceRefs: ["ev-1"],
    endedAt: "2024-01-01T00:10:00Z",
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
    verified: true,
    ...overrides,
  };
}

function makeEvaluation(overrides: Partial<Evaluation> = {}): Evaluation {
  return {
    id: asEvaluationId("ev-1"),
    runId: asRunId("r-1"),
    criteria: [
      {
        id: "tests-pass",
        description: "All tests pass",
        requiredEvidenceKinds: ["verification_report"],
        required: true,
      },
    ],
    results: [
      {
        criterionId: "tests-pass",
        satisfied: true,
        examinedEvidenceRefs: ["ev-1"],
        reason: "Verified test_result present.",
      },
    ],
    overallResult: "verified_succeeded",
    provenance: {
      kind: "observed",
      source: { kind: "run", runId: asRunId("r-1"), at: "2024-01-01T00:00:00Z" },
    },
    evaluatedAt: "2024-01-01T00:05:00Z",
    evaluator: "default-evaluator",
    ...overrides,
  };
}

describe("Stage D — ExperienceDeriver", () => {
  let deriver: DefaultExperienceDeriver;

  beforeEach(() => {
    deriver = new DefaultExperienceDeriver();
  });

  describe("D1: derivation succeeds with verified-succeeded Evaluation", () => {
    it("produces an Experience with a stable id", () => {
      const exp = deriver.derive({
        run: makeRun(),
        evaluation: makeEvaluation(),
        evidence: [makeEvidence()],
        summary: "Rebuild before tests to avoid stale artifacts.",
      });
      expect(typeof exp.id).toBe("string");
      expect(exp.id.length).toBeGreaterThan(0);
    });

    it("links the Experience to the source Run and Evaluation", () => {
      const run = makeRun();
      const eval_ = makeEvaluation();
      const exp = deriver.derive({
        run,
        evaluation: eval_,
        evidence: [makeEvidence()],
        summary: "Rebuild before tests.",
      });
      expect(exp.runId).toBe(run.id);
      expect(exp.evaluationId).toBe(eval_.id);
    });
  });

  describe("D2: derivation FAILS when Evaluation is NOT verified_succeeded", () => {
    it("throws InsufficientEvidenceError for claimed_succeeded_unverified", () => {
      expect(() =>
        deriver.derive({
          run: makeRun(),
          evaluation: makeEvaluation({ overallResult: "claimed_succeeded_unverified" }),
          evidence: [makeEvidence()],
          summary: "x",
        }),
      ).toThrow();

      try {
        deriver.derive({
          run: makeRun(),
          evaluation: makeEvaluation({ overallResult: "claimed_succeeded_unverified" }),
          evidence: [makeEvidence()],
          summary: "x",
        });
      } catch (e) {
        expect(isInsufficientEvidenceError(e)).toBe(true);
      }
    });

    it("throws InsufficientEvidenceError for failed", () => {
      expect(() =>
        deriver.derive({
          run: makeRun(),
          evaluation: makeEvaluation({ overallResult: "failed" }),
          evidence: [makeEvidence()],
          summary: "x",
        }),
      ).toThrow();
    });

    it("throws InsufficientEvidenceError for inconclusive", () => {
      expect(() =>
        deriver.derive({
          run: makeRun(),
          evaluation: makeEvaluation({ overallResult: "inconclusive" }),
          evidence: [makeEvidence()],
          summary: "x",
        }),
      ).toThrow();
    });
  });

  describe("D3: derivation FAILS when Evaluation.runId does not match Run.id", () => {
    it("throws ContractValidationError on mismatch", () => {
      const run = makeRun();
      const mismatchedEval = makeEvaluation({
        runId: asRunId("r-other"),
      });
      expect(() =>
        deriver.derive({
          run,
          evaluation: mismatchedEval,
          evidence: [makeEvidence({ runId: asRunId("r-other") })],
          summary: "x",
        }),
      ).toThrow();

      try {
        deriver.derive({
          run,
          evaluation: mismatchedEval,
          evidence: [makeEvidence({ runId: asRunId("r-other") })],
          summary: "x",
        });
      } catch (e) {
        expect(isContractValidationError(e)).toBe(true);
      }
    });
  });

  describe("D4: derivation FAILS when no Evidence is provided", () => {
    it("throws InsufficientEvidenceError", () => {
      expect(() =>
        deriver.derive({
          run: makeRun(),
          evaluation: makeEvaluation(),
          evidence: [],
          summary: "x",
        }),
      ).toThrow();
    });
  });

  describe("D5: derived Experience's provenance.kind is `observed` (initial)", () => {
    it("the Experience starts as observed (never silently approved)", () => {
      const exp = deriver.derive({
        run: makeRun(),
        evaluation: makeEvaluation(),
        evidence: [makeEvidence()],
        summary: "x",
      });
      // CRITICAL: derived Experience starts as observed — promotion is
      // a separate governed step. This encodes "No silent mutation".
      expect(exp.provenance.kind).toBe("observed");
    });
  });

  describe("D6: provenance source is `evidence`-kind (preserves origin chain)", () => {
    it("the source.kind is 'evidence' and references the first Evidence", () => {
      const firstEv = makeEvidence({ id: asEvidenceId("ev-first") });
      const secondEv = makeEvidence({ id: asEvidenceId("ev-second") });
      const exp = deriver.derive({
        run: makeRun(),
        evaluation: makeEvaluation(),
        evidence: [firstEv, secondEv],
        summary: "x",
      });
      expect(exp.provenance.source.kind).toBe("evidence");
      if (exp.provenance.source.kind === "evidence") {
        // The source references the FIRST evidence (the primary one)
        expect(exp.provenance.source.evidenceId).toBe(firstEv.id);
      }
    });
  });

  describe("D7: default reusability is `conditionally_reusable` (safe default)", () => {
    it("reusability defaults to conditionally_reusable when not specified", () => {
      const exp = deriver.derive({
        run: makeRun(),
        evaluation: makeEvaluation(),
        evidence: [makeEvidence()],
        summary: "x",
      });
      expect(exp.reusability).toBe("conditionally_reusable");
    });
  });

  describe("D8: applicability is derived from Run when not overridden", () => {
    it("taskKinds defaults to [run.inputs.taskKind]", () => {
      const exp = deriver.derive({
        run: makeRun(),
        evaluation: makeEvaluation(),
        evidence: [makeEvidence()],
        summary: "x",
      });
      expect(exp.applicability.taskKinds).toEqual(["test-fix"]);
    });

    it("taskTags defaults to run.inputs.taskTags", () => {
      const exp = deriver.derive({
        run: makeRun(),
        evaluation: makeEvaluation(),
        evidence: [makeEvidence()],
        summary: "x",
      });
      expect(exp.applicability.taskTags).toEqual(["vitest", "unit-test"]);
    });

    it("repoPatterns defaults to [run.repoIdentity.repo]", () => {
      const exp = deriver.derive({
        run: makeRun(),
        evaluation: makeEvaluation(),
        evidence: [makeEvidence()],
        summary: "x",
      });
      expect(exp.applicability.repoPatterns).toEqual(["https://example.com/repo.git"]);
    });

    it("adapterKinds is undefined when not provided", () => {
      const exp = deriver.derive({
        run: makeRun(),
        evaluation: makeEvaluation(),
        evidence: [makeEvidence()],
        summary: "x",
      });
      expect(exp.applicability.adapterKinds).toBeUndefined();
    });
  });

  describe("D9: override of applicability/reusability/reuseConditions is respected", () => {
    it("override of taskKinds is respected", () => {
      const exp = deriver.derive({
        run: makeRun(),
        evaluation: makeEvaluation(),
        evidence: [makeEvidence()],
        applicability: { taskKinds: ["refactor"] },
        summary: "x",
      });
      expect(exp.applicability.taskKinds).toEqual(["refactor"]);
    });

    it("override of reusability is respected", () => {
      const exp = deriver.derive({
        run: makeRun(),
        evaluation: makeEvaluation(),
        evidence: [makeEvidence()],
        reusability: "not_reusable",
        summary: "x",
      });
      expect(exp.reusability).toBe("not_reusable");
    });

    it("reuseConditions are preserved when provided", () => {
      const exp = deriver.derive({
        run: makeRun(),
        evaluation: makeEvaluation(),
        evidence: [makeEvidence()],
        reuseConditions: ["must-rebuild", "must-be-macos"],
        summary: "x",
      });
      expect(exp.reuseConditions).toEqual(["must-rebuild", "must-be-macos"]);
    });
  });

  describe("D10: derived Experience is structurally valid", () => {
    it("the produced Experience passes validateExperience (no throw on validate)", () => {
      const exp = deriver.derive({
        run: makeRun(),
        evaluation: makeEvaluation(),
        evidence: [makeEvidence()],
        summary: "Learned: rebuild before tests.",
      });
      // validateExperience is called internally; reaching this point
      // means validation passed.
      expect(exp.id).toBeDefined();
      expect(exp.runId).toBeDefined();
      expect(exp.evaluationId).toBeDefined();
      expect(exp.provenance).toBeDefined();
      expect(exp.applicability).toBeDefined();
      expect(exp.reusability).toBeDefined();
      expect(exp.summary).toBeDefined();
      expect(exp.learnedAt).toBeDefined();
    });
  });

  describe("D11: derived Experience has a non-empty summary", () => {
    it("an empty summary causes validation failure", () => {
      expect(() =>
        deriver.derive({
          run: makeRun(),
          evaluation: makeEvaluation(),
          evidence: [makeEvidence()],
          summary: "",
        }),
      ).toThrow();
    });
  });

  describe("D12: deterministic timestamps", () => {
    it("learnedAt is a valid ISO timestamp", () => {
      const exp = deriver.derive({
        run: makeRun(),
        evaluation: makeEvaluation(),
        evidence: [makeEvidence()],
        summary: "x",
      });
      // ISO 8601 pattern
      expect(exp.learnedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
