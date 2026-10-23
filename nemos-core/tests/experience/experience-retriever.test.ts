/**
 * Stage D — ExperienceRetriever tests.
 *
 * Verifies:
 *   R1: retrieve() returns applicable Experiences as `included`.
 *   R2: retrieve() excludes deprecated Experiences.
 *   R3: retrieve() excludes `not_reusable` Experiences.
 *   R4: retrieve() excludes non-applicable Experiences (taskKind mismatch).
 *   R5: retrieve() excludes non-applicable Experiences (taskTag mismatch).
 *   R6: retrieve() excludes non-applicable Experiences (repoPattern mismatch).
 *   R7: retrieve() excludes Experiences with adapterKinds mismatch.
 *   R8: retrieve() preserves the provenance kind (retrieved is not approved).
 *   R9: retrieve() returns an empty result when the store is empty.
 *   R10: includedExperienceIds() returns only the included ids.
 *   R11: retrieve() does NOT mutate the stored records.
 *   R12: the retriever records the reason for each exclusion.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DefaultExperienceRetriever,
  includedExperienceIds,
} from "../../src/experience/experience-retriever.js";
import { InMemoryExperienceStore } from "../../src/experience/experience-store.js";
import type { Experience } from "../../src/schemas/experience.js";
import type { RunInputs } from "../../src/schemas/run.js";
import {
  asExperienceId,
  asRunId,
  asEvaluationId,
  asEvidenceId,
} from "../../src/core/identifiers.js";

function makeExperience(overrides: Partial<Experience> = {}): Experience {
  return {
    id: asExperienceId("x-1"),
    runId: asRunId("r-1"),
    evaluationId: asEvaluationId("ev-1"),
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

function makeRunInputs(overrides: Partial<RunInputs> = {}): RunInputs {
  return {
    taskDescription: "Fix the failing test",
    taskKind: "test-fix",
    taskTags: ["vitest", "unit-test"],
    repoInstance: {
      repoIdentity: { repo: "https://example.com/repo.git", sha: "abc" },
      instanceId: "inst-1",
    },
    ...overrides,
  };
}

describe("Stage D — ExperienceRetriever", () => {
  let store: InMemoryExperienceStore;
  let retriever: DefaultExperienceRetriever;

  beforeEach(() => {
    store = new InMemoryExperienceStore();
    retriever = new DefaultExperienceRetriever(store);
  });

  describe("R1: retrieve returns applicable Experiences as included", () => {
    it("returns an applicable Experience as included", () => {
      const exp = makeExperience();
      store.add({
        ...exp,
        provenance: {
          kind: "observed",
          source: {
            kind: "evidence",
            evidenceId: asEvidenceId("ev-source") as never,
            at: "2024-01-01T00:00:00Z",
          },
        },
      });
      // Promote to approved so it's eligible
      store.promote(exp.id, "reviewed", { at: "x", actor: "x", reason: "x" });
      store.promote(exp.id, "approved", { at: "x", actor: "x", reason: "x" });

      const result = retriever.retrieve({
        runInputs: makeRunInputs(),
        adapterKind: "mock",
      });
      expect(result.retrieved).toHaveLength(1);
      expect(result.retrieved[0]?.included).toBe(true);
      expect(result.retrieved[0]?.experience.id).toBe(exp.id);
    });
  });

  describe("R2: retrieve excludes deprecated Experiences", () => {
    it("a deprecated Experience is excluded with reason 'deprecated'", () => {
      const exp = makeExperience();
      store.add({
        ...exp,
        provenance: {
          kind: "observed",
          source: {
            kind: "evidence",
            evidenceId: asEvidenceId("ev-source") as never,
            at: "2024-01-01T00:00:00Z",
          },
        },
      });
      store.promote(exp.id, "reviewed", { at: "x", actor: "x", reason: "x" });
      store.promote(exp.id, "approved", { at: "x", actor: "x", reason: "x" });
      store.promote(exp.id, "deprecated", { at: "x", actor: "x", reason: "superseded" });

      const result = retriever.retrieve({
        runInputs: makeRunInputs(),
        adapterKind: "mock",
      });
      expect(result.retrieved).toHaveLength(1);
      expect(result.retrieved[0]?.included).toBe(false);
      expect(result.retrieved[0]?.exclusionReasonKind).toBe("deprecated");
    });
  });

  describe("R3: retrieve excludes `not_reusable` Experiences", () => {
    it("a not_reusable Experience is excluded with reason 'not_reusable'", () => {
      const exp = makeExperience({ reusability: "not_reusable" });
      store.add({
        ...exp,
        provenance: {
          kind: "observed",
          source: {
            kind: "evidence",
            evidenceId: asEvidenceId("ev-source") as never,
            at: "2024-01-01T00:00:00Z",
          },
        },
      });
      store.promote(exp.id, "reviewed", { at: "x", actor: "x", reason: "x" });
      store.promote(exp.id, "approved", { at: "x", actor: "x", reason: "x" });

      const result = retriever.retrieve({
        runInputs: makeRunInputs(),
        adapterKind: "mock",
      });
      expect(result.retrieved).toHaveLength(1);
      expect(result.retrieved[0]?.included).toBe(false);
      expect(result.retrieved[0]?.exclusionReasonKind).toBe("not_reusable");
    });
  });

  describe("R4: retrieve excludes non-applicable Experiences (taskKind mismatch)", () => {
    it("a taskKind mismatch excludes the Experience", () => {
      const exp = makeExperience({
        applicability: { taskKinds: ["feature"] }, // does not include test-fix
      });
      store.add({
        ...exp,
        provenance: {
          kind: "observed",
          source: {
            kind: "evidence",
            evidenceId: asEvidenceId("ev-source") as never,
            at: "2024-01-01T00:00:00Z",
          },
        },
      });
      store.promote(exp.id, "reviewed", { at: "x", actor: "x", reason: "x" });
      store.promote(exp.id, "approved", { at: "x", actor: "x", reason: "x" });

      const result = retriever.retrieve({
        runInputs: makeRunInputs({ taskKind: "test-fix" }),
        adapterKind: "mock",
      });
      expect(result.retrieved).toHaveLength(1);
      expect(result.retrieved[0]?.included).toBe(false);
      expect(result.retrieved[0]?.exclusionReasonKind).toBe("not_applicable");
    });
  });

  describe("R5: retrieve excludes non-applicable Experiences (taskTag mismatch)", () => {
    it("a taskTag AND-mismatch excludes the Experience", () => {
      const exp = makeExperience({
        applicability: { taskKinds: ["test-fix"], taskTags: ["integration"] },
      });
      store.add({
        ...exp,
        provenance: {
          kind: "observed",
          source: {
            kind: "evidence",
            evidenceId: asEvidenceId("ev-source") as never,
            at: "2024-01-01T00:00:00Z",
          },
        },
      });
      store.promote(exp.id, "reviewed", { at: "x", actor: "x", reason: "x" });
      store.promote(exp.id, "approved", { at: "x", actor: "x", reason: "x" });

      const result = retriever.retrieve({
        runInputs: makeRunInputs({ taskTags: ["vitest"] }), // missing "integration"
        adapterKind: "mock",
      });
      expect(result.retrieved[0]?.included).toBe(false);
      expect(result.retrieved[0]?.exclusionReasonKind).toBe("not_applicable");
    });

    it("a taskTag AND-match includes the Experience", () => {
      const exp = makeExperience({
        applicability: { taskKinds: ["test-fix"], taskTags: ["vitest", "unit-test"] },
      });
      store.add({
        ...exp,
        provenance: {
          kind: "observed",
          source: {
            kind: "evidence",
            evidenceId: asEvidenceId("ev-source") as never,
            at: "2024-01-01T00:00:00Z",
          },
        },
      });
      store.promote(exp.id, "reviewed", { at: "x", actor: "x", reason: "x" });
      store.promote(exp.id, "approved", { at: "x", actor: "x", reason: "x" });

      const result = retriever.retrieve({
        runInputs: makeRunInputs({ taskTags: ["vitest", "unit-test"] }),
        adapterKind: "mock",
      });
      expect(result.retrieved[0]?.included).toBe(true);
    });
  });

  describe("R6: retrieve excludes non-applicable Experiences (repoPattern mismatch)", () => {
    it("a repoPattern mismatch excludes the Experience", () => {
      const exp = makeExperience({
        applicability: { taskKinds: ["test-fix"], repoPatterns: ["https://other.com/*"] },
      });
      store.add({
        ...exp,
        provenance: {
          kind: "observed",
          source: {
            kind: "evidence",
            evidenceId: asEvidenceId("ev-source") as never,
            at: "2024-01-01T00:00:00Z",
          },
        },
      });
      store.promote(exp.id, "reviewed", { at: "x", actor: "x", reason: "x" });
      store.promote(exp.id, "approved", { at: "x", actor: "x", reason: "x" });

      const result = retriever.retrieve({
        runInputs: makeRunInputs(),
        adapterKind: "mock",
      });
      expect(result.retrieved[0]?.included).toBe(false);
      expect(result.retrieved[0]?.exclusionReasonKind).toBe("not_applicable");
    });
  });

  describe("R7: retrieve excludes Experiences with adapterKinds mismatch", () => {
    it("an adapterKinds mismatch excludes the Experience", () => {
      const exp = makeExperience({
        applicability: { taskKinds: ["test-fix"], adapterKinds: ["openhands"] },
      });
      store.add({
        ...exp,
        provenance: {
          kind: "observed",
          source: {
            kind: "evidence",
            evidenceId: asEvidenceId("ev-source") as never,
            at: "2024-01-01T00:00:00Z",
          },
        },
      });
      store.promote(exp.id, "reviewed", { at: "x", actor: "x", reason: "x" });
      store.promote(exp.id, "approved", { at: "x", actor: "x", reason: "x" });

      const result = retriever.retrieve({
        runInputs: makeRunInputs(),
        adapterKind: "mock", // not in ["openhands"]
      });
      expect(result.retrieved[0]?.included).toBe(false);
      expect(result.retrieved[0]?.exclusionReasonKind).toBe("not_applicable");
    });

    it("an adapterKinds match includes the Experience", () => {
      const exp = makeExperience({
        applicability: { taskKinds: ["test-fix"], adapterKinds: ["mock", "openhands"] },
      });
      store.add({
        ...exp,
        provenance: {
          kind: "observed",
          source: {
            kind: "evidence",
            evidenceId: asEvidenceId("ev-source") as never,
            at: "2024-01-01T00:00:00Z",
          },
        },
      });
      store.promote(exp.id, "reviewed", { at: "x", actor: "x", reason: "x" });
      store.promote(exp.id, "approved", { at: "x", actor: "x", reason: "x" });

      const result = retriever.retrieve({
        runInputs: makeRunInputs(),
        adapterKind: "mock",
      });
      expect(result.retrieved[0]?.included).toBe(true);
    });

    it("an adapterKinds declaration without adapterKind input excludes", () => {
      const exp = makeExperience({
        applicability: { taskKinds: ["test-fix"], adapterKinds: ["mock"] },
      });
      store.add({
        ...exp,
        provenance: {
          kind: "observed",
          source: {
            kind: "evidence",
            evidenceId: asEvidenceId("ev-source") as never,
            at: "2024-01-01T00:00:00Z",
          },
        },
      });
      store.promote(exp.id, "reviewed", { at: "x", actor: "x", reason: "x" });
      store.promote(exp.id, "approved", { at: "x", actor: "x", reason: "x" });

      const result = retriever.retrieve({
        runInputs: makeRunInputs(),
        // adapterKind omitted
      });
      expect(result.retrieved[0]?.included).toBe(false);
    });
  });

  describe("R8: retrieve preserves the provenance kind (retrieved is not approved)", () => {
    it("an observed Experience is returned with kind=observed (no upgrade)", () => {
      const exp = makeExperience();
      store.add({
        ...exp,
        provenance: {
          kind: "observed",
          source: {
            kind: "evidence",
            evidenceId: asEvidenceId("ev-source") as never,
            at: "2024-01-01T00:00:00Z",
          },
        },
      });
      // NOT promoted — still observed

      const result = retriever.retrieve({
        runInputs: makeRunInputs(),
        adapterKind: "mock",
      });
      expect(result.retrieved[0]?.experience.provenance.kind).toBe("observed");
      // CRITICAL: retrieval does NOT silently upgrade.
      // The retriever records that the Experience is observed.
      expect(result.retrieved[0]?.reason).toContain("observed");
      expect(result.retrieved[0]?.reason).toContain("NOT promoted");
    });

    it("an approved Experience is returned with kind=approved", () => {
      const exp = makeExperience();
      store.add({
        ...exp,
        provenance: {
          kind: "observed",
          source: {
            kind: "evidence",
            evidenceId: asEvidenceId("ev-source") as never,
            at: "2024-01-01T00:00:00Z",
          },
        },
      });
      store.promote(exp.id, "reviewed", { at: "x", actor: "x", reason: "x" });
      store.promote(exp.id, "approved", { at: "x", actor: "x", reason: "x" });

      const result = retriever.retrieve({
        runInputs: makeRunInputs(),
        adapterKind: "mock",
      });
      expect(result.retrieved[0]?.experience.provenance.kind).toBe("approved");
    });
  });

  describe("R9: retrieve returns empty result when store is empty", () => {
    it("no Experiences in store → empty result", () => {
      const result = retriever.retrieve({
        runInputs: makeRunInputs(),
        adapterKind: "mock",
      });
      expect(result.retrieved).toEqual([]);
      expect(result.retrievedAt).toBeDefined();
    });
  });

  describe("R10: includedExperienceIds returns only the included ids", () => {
    it("returns the ids of INCLUDED Experiences only", () => {
      const exp1 = makeExperience({
        id: asExperienceId("x-applicable"),
        applicability: { taskKinds: ["test-fix"] },
      });
      const exp2 = makeExperience({
        id: asExperienceId("x-not-applicable"),
        applicability: { taskKinds: ["feature"] },
      });
      for (const exp of [exp1, exp2]) {
        store.add({
          ...exp,
          provenance: {
            kind: "observed",
            source: {
              kind: "evidence",
              evidenceId: asEvidenceId("ev-source") as never,
              at: "2024-01-01T00:00:00Z",
            },
          },
        });
        store.promote(exp.id, "reviewed", { at: "x", actor: "x", reason: "x" });
        store.promote(exp.id, "approved", { at: "x", actor: "x", reason: "x" });
      }

      const result = retriever.retrieve({
        runInputs: makeRunInputs(),
        adapterKind: "mock",
      });
      const ids = includedExperienceIds(result);
      expect(ids).toEqual(["x-applicable"]);
    });
  });

  describe("R11: retrieve does NOT mutate stored records", () => {
    it("mutating a returned Experience does not affect the stored record", () => {
      const exp = makeExperience();
      store.add({
        ...exp,
        provenance: {
          kind: "observed",
          source: {
            kind: "evidence",
            evidenceId: asEvidenceId("ev-source") as never,
            at: "2024-01-01T00:00:00Z",
          },
        },
      });
      store.promote(exp.id, "reviewed", { at: "x", actor: "x", reason: "x" });
      store.promote(exp.id, "approved", { at: "x", actor: "x", reason: "x" });

      const result = retriever.retrieve({
        runInputs: makeRunInputs(),
        adapterKind: "mock",
      });
      const retrieved = result.retrieved[0]!.experience;
      (retrieved as { summary: string }).summary = "TAMPERED";

      const fresh = store.get(exp.id)!;
      expect(fresh.summary).toBe("Rebuild before tests to avoid stale artifacts.");
    });
  });

  describe("R12: retrieve records the reason for each exclusion", () => {
    it("every retrieved record has a non-empty reason string", () => {
      const exp1 = makeExperience({
        id: asExperienceId("x-1"),
        applicability: { taskKinds: ["test-fix"] },
      });
      const exp2 = makeExperience({
        id: asExperienceId("x-2"),
        applicability: { taskKinds: ["feature"] }, // mismatched
      });
      for (const exp of [exp1, exp2]) {
        store.add({
          ...exp,
          provenance: {
            kind: "observed",
            source: {
              kind: "evidence",
              evidenceId: asEvidenceId("ev-source") as never,
              at: "2024-01-01T00:00:00Z",
            },
          },
        });
        store.promote(exp.id, "reviewed", { at: "x", actor: "x", reason: "x" });
        store.promote(exp.id, "approved", { at: "x", actor: "x", reason: "x" });
      }

      const result = retriever.retrieve({
        runInputs: makeRunInputs(),
        adapterKind: "mock",
      });
      for (const r of result.retrieved) {
        expect(typeof r.reason).toBe("string");
        expect(r.reason.length).toBeGreaterThan(0);
      }
    });
  });
});
