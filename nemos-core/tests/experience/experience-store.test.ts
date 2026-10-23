/**
 * Stage D — ExperienceStore tests.
 *
 * Verifies:
 *   S1: add() stores a new Experience and returns it.
 *   S2: add() rejects a non-observed Experience (must start as observed).
 *   S3: add() rejects a duplicate id.
 *   S4: get() returns the stored Experience; preserves provenance kind.
 *   S5: get() returns undefined for unknown id.
 *   S6: list() returns all records in insertion order.
 *   S7: promote() advances the lifecycle (observed → reviewed).
 *   S8: promote() advances (reviewed → approved).
 *   S9: promote() advances (approved → deprecated).
 *   S10: promote() rejects forbidden transitions (e.g., observed → approved).
 *   S11: promote() rejects unknown ids.
 *   S12: promote() appends to the review trail (append-only).
 *   S13: external mutation of returned records does NOT corrupt the store.
 *   S14: size() returns the correct count.
 *   S15: isExperienceApprovedInStore correctly detects approved records.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryExperienceStore,
  isExperienceApprovedInStore,
} from "../../src/experience/experience-store.js";
import type { ExperienceStore } from "../../src/experience/experience-store.js";
import type { Experience } from "../../src/schemas/experience.js";
import { validateExperience } from "../../src/schemas/experience.js";
import {
  asExperienceId,
  asRunId,
  asEvaluationId,
  asEvidenceId,
} from "../../src/core/identifiers.js";
import {
  isContractValidationError,
  isLifecycleViolationError,
} from "../../src/core/errors.js";

function makeExperience(overrides: Partial<Experience> = {}): Experience {
  return {
    id: asExperienceId("x-1"),
    runId: asRunId("r-1"),
    evaluationId: asEvaluationId("ev-1"),
    provenance: {
      kind: "observed",
      source: {
        kind: "evidence",
        evidenceId: asEvidenceId("ev-source") as never,
        at: "2024-01-01T00:00:00Z",
      },
    },
    applicability: { taskKinds: ["test-fix"] },
    reusability: "conditionally_reusable",
    summary: "Rebuild before tests to avoid stale artifacts.",
    learnedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("Stage D — ExperienceStore", () => {
  let store: InMemoryExperienceStore;

  beforeEach(() => {
    store = new InMemoryExperienceStore();
  });

  describe("S1 + S2 + S3: add()", () => {
    it("S1: stores a new observed Experience and returns it", () => {
      const exp = makeExperience();
      const stored = store.add(exp);
      expect(stored.id).toBe(exp.id);
      expect(store.size()).toBe(1);
    });

    it("S2: rejects a non-observed Experience (must start as observed)", () => {
      const approvedExp = makeExperience({
        provenance: {
          kind: "approved",
          source: {
            kind: "evidence",
            evidenceId: asEvidenceId("ev-x") as never,
            at: "x",
          },
        },
      });
      expect(() => store.add(approvedExp)).toThrow();
      try {
        store.add(approvedExp);
      } catch (e) {
        expect(isContractValidationError(e)).toBe(true);
      }
    });

    it("S2: rejects a reviewed Experience (must start as observed)", () => {
      const reviewedExp = makeExperience({
        provenance: {
          kind: "reviewed",
          source: {
            kind: "evidence",
            evidenceId: asEvidenceId("ev-x") as never,
            at: "x",
          },
        },
      });
      expect(() => store.add(reviewedExp)).toThrow();
    });

    it("S3: rejects a duplicate id", () => {
      const exp = makeExperience();
      store.add(exp);
      expect(() => store.add(exp)).toThrow();
    });
  });

  describe("S4 + S5: get()", () => {
    it("S4: returns the stored Experience with its provenance kind", () => {
      const exp = makeExperience();
      store.add(exp);
      const retrieved = store.get(exp.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(exp.id);
      expect(retrieved!.provenance.kind).toBe("observed");
    });

    it("S5: returns undefined for an unknown id", () => {
      expect(store.get(asExperienceId("nonexistent"))).toBeUndefined();
    });
  });

  describe("S6: list()", () => {
    it("returns all records in insertion order", () => {
      const e1 = makeExperience({ id: asExperienceId("x-1") });
      const e2 = makeExperience({ id: asExperienceId("x-2") });
      const e3 = makeExperience({ id: asExperienceId("x-3") });
      store.add(e1);
      store.add(e2);
      store.add(e3);
      const list = store.list();
      expect(list).toHaveLength(3);
      expect(list[0]!.id).toBe("x-1");
      expect(list[1]!.id).toBe("x-2");
      expect(list[2]!.id).toBe("x-3");
    });

    it("returns an empty array when the store is empty", () => {
      expect(store.list()).toEqual([]);
    });
  });

  describe("S7 + S8 + S9: promote() — allowed transitions", () => {
    it("S7: promotes observed → reviewed", () => {
      const exp = makeExperience();
      store.add(exp);
      const promoted = store.promote(exp.id, "reviewed", {
        at: "2024-01-02T00:00:00Z",
        actor: "reviewer-1",
        reason: "Reviewed by domain expert",
      });
      expect(promoted.provenance.kind).toBe("reviewed");
      expect(promoted.provenance.reviewTrail).toHaveLength(1);
      expect(promoted.provenance.reviewTrail?.[0]?.from).toBe("observed");
      expect(promoted.provenance.reviewTrail?.[0]?.to).toBe("reviewed");
    });

    it("S8: promotes reviewed → approved", () => {
      const exp = makeExperience();
      store.add(exp);
      store.promote(exp.id, "reviewed", {
        at: "2024-01-02T00:00:00Z",
        actor: "reviewer",
        reason: "Initial review",
      });
      const approved = store.promote(exp.id, "approved", {
        at: "2024-01-03T00:00:00Z",
        actor: "approver",
        reason: "Approved by owner",
      });
      expect(approved.provenance.kind).toBe("approved");
      expect(approved.provenance.reviewTrail).toHaveLength(2);
    });

    it("S9: promotes approved → deprecated", () => {
      const exp = makeExperience();
      store.add(exp);
      store.promote(exp.id, "reviewed", {
        at: "x",
        actor: "r",
        reason: "x",
      });
      store.promote(exp.id, "approved", {
        at: "x",
        actor: "a",
        reason: "x",
      });
      const deprecated = store.promote(exp.id, "deprecated", {
        at: "2024-02-01T00:00:00Z",
        actor: "archiver",
        reason: "Superseded by a newer Experience",
      });
      expect(deprecated.provenance.kind).toBe("deprecated");
      expect(deprecated.provenance.reviewTrail).toHaveLength(3);
    });
  });

  describe("S10 + S11: promote() — failure cases", () => {
    it("S10: rejects forbidden transition (observed → approved, skipping reviewed)", () => {
      const exp = makeExperience();
      store.add(exp);
      expect(() =>
        store.promote(exp.id, "approved", {
          at: "x",
          actor: "x",
          reason: "skip review",
        }),
      ).toThrow();
      try {
        store.promote(exp.id, "approved", {
          at: "x",
          actor: "x",
          reason: "x",
        });
      } catch (e) {
        expect(isLifecycleViolationError(e)).toBe(true);
      }
    });

    it("S10: rejects demotion (approved → reviewed)", () => {
      const exp = makeExperience();
      store.add(exp);
      store.promote(exp.id, "reviewed", { at: "x", actor: "x", reason: "x" });
      store.promote(exp.id, "approved", { at: "x", actor: "x", reason: "x" });
      expect(() =>
        store.promote(exp.id, "reviewed", { at: "x", actor: "x", reason: "demote" }),
      ).toThrow();
    });

    it("S10: rejects transition out of deprecated (terminal)", () => {
      const exp = makeExperience();
      store.add(exp);
      store.promote(exp.id, "reviewed", { at: "x", actor: "x", reason: "x" });
      store.promote(exp.id, "approved", { at: "x", actor: "x", reason: "x" });
      store.promote(exp.id, "deprecated", { at: "x", actor: "x", reason: "x" });
      expect(() =>
        store.promote(exp.id, "approved", { at: "x", actor: "x", reason: "revive" }),
      ).toThrow();
    });

    it("S11: rejects promotion for an unknown id", () => {
      expect(() =>
        store.promote(asExperienceId("nonexistent"), "reviewed", {
          at: "x",
          actor: "x",
          reason: "x",
        }),
      ).toThrow();
    });
  });

  describe("S12: promote() appends to the review trail (append-only)", () => {
    it("the trail grows by exactly one entry per promotion", () => {
      const exp = makeExperience();
      store.add(exp);
      let current = store.get(exp.id)!;
      const initialTrailLength = current.provenance.reviewTrail?.length ?? 0;

      store.promote(exp.id, "reviewed", { at: "x", actor: "a", reason: "first" });
      current = store.get(exp.id)!;
      expect(current.provenance.reviewTrail).toHaveLength(initialTrailLength + 1);

      store.promote(exp.id, "approved", { at: "x", actor: "b", reason: "second" });
      current = store.get(exp.id)!;
      expect(current.provenance.reviewTrail).toHaveLength(initialTrailLength + 2);
    });

    it("the trail records each transition's actor and reason", () => {
      const exp = makeExperience();
      store.add(exp);
      store.promote(exp.id, "reviewed", {
        at: "2024-01-02T00:00:00Z",
        actor: "reviewer-1",
        reason: "Reviewed by Alice",
      });
      store.promote(exp.id, "approved", {
        at: "2024-01-03T00:00:00Z",
        actor: "approver-2",
        reason: "Approved by Bob",
      });
      const final = store.get(exp.id)!;
      const trail = final.provenance.reviewTrail!;
      expect(trail[0]?.actor).toBe("reviewer-1");
      expect(trail[0]?.reason).toBe("Reviewed by Alice");
      expect(trail[1]?.actor).toBe("approver-2");
      expect(trail[1]?.reason).toBe("Approved by Bob");
    });
  });

  describe("S13: external mutation does NOT corrupt the store", () => {
    it("mutating a returned record does not affect the stored record", () => {
      const exp = makeExperience();
      store.add(exp);
      const retrieved = store.get(exp.id)!;
      // Attempt to mutate (the type system would prevent this; cast for test)
      (retrieved as { summary: string }).summary = "TAMPERED";
      const fresh = store.get(exp.id)!;
      // The stored record is unaffected
      expect(fresh.summary).toBe("Rebuild before tests to avoid stale artifacts.");
    });

    it("mutating a record from list() does not affect the stored record", () => {
      const exp = makeExperience();
      store.add(exp);
      const [listItem] = store.list();
      (listItem as { summary: string }).summary = "TAMPERED";
      const fresh = store.get(exp.id)!;
      expect(fresh.summary).toBe("Rebuild before tests to avoid stale artifacts.");
    });
  });

  describe("S14: size()", () => {
    it("returns 0 for an empty store", () => {
      expect(store.size()).toBe(0);
    });

    it("returns the count after additions", () => {
      store.add(makeExperience({ id: asExperienceId("x-1") }));
      expect(store.size()).toBe(1);
      store.add(makeExperience({ id: asExperienceId("x-2") }));
      expect(store.size()).toBe(2);
    });
  });

  describe("S15: isExperienceApprovedInStore", () => {
    it("returns false for an observed Experience", () => {
      const exp = makeExperience();
      store.add(exp);
      expect(isExperienceApprovedInStore(store, exp.id)).toBe(false);
    });

    it("returns true for an approved Experience", () => {
      const exp = makeExperience();
      store.add(exp);
      store.promote(exp.id, "reviewed", { at: "x", actor: "r", reason: "x" });
      store.promote(exp.id, "approved", { at: "x", actor: "a", reason: "x" });
      expect(isExperienceApprovedInStore(store, exp.id)).toBe(true);
    });

    it("returns false for a deprecated Experience", () => {
      const exp = makeExperience();
      store.add(exp);
      store.promote(exp.id, "reviewed", { at: "x", actor: "r", reason: "x" });
      store.promote(exp.id, "approved", { at: "x", actor: "a", reason: "x" });
      store.promote(exp.id, "deprecated", { at: "x", actor: "d", reason: "x" });
      expect(isExperienceApprovedInStore(store, exp.id)).toBe(false);
    });

    it("returns false for an unknown id", () => {
      expect(isExperienceApprovedInStore(store, asExperienceId("nonexistent"))).toBe(false);
    });
  });

  describe("S16: store re-validates Experience on add (defense in depth)", () => {
    it("rejects an Experience that fails validateExperience", () => {
      // Tampered summary (empty) — would fail validateExperience
      const bad = makeExperience({ summary: "" });
      expect(() => store.add(bad)).toThrow();
    });
  });

  describe("S17: store satisfies the ExperienceStore interface", () => {
    it("implements add, get, list, promote, size", () => {
      const s: ExperienceStore = store;
      expect(typeof s.add).toBe("function");
      expect(typeof s.get).toBe("function");
      expect(typeof s.list).toBe("function");
      expect(typeof s.promote).toBe("function");
      expect(typeof s.size).toBe("function");
    });
  });
});
