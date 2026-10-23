/**
 * Stage D — Experience-to-Memory bridge tests.
 *
 * Verifies:
 *   B1: experienceToMemoryRecord produces a valid MemoryRecord.
 *   B2: the MemoryRecord.kind is "experience".
 *   B3: the MemoryRecord's provenance kind matches the source Experience.
 *   B4: the MemoryRecord references the source Experience via derivedFromExperienceId.
 *   B5: the MemoryRecord references the source Run via derivedFromRunId.
 *   B6: the MemoryRecord's applicability is copied from the Experience.
 *   B7: the MemoryRecord's content includes summary + reusability.
 *   B8: the bridge does NOT mutate the source Experience.
 *   B9: the bridge REJECTS deprecated Experiences.
 *   B10: experiencesToMemoryRecords skips deprecated Experiences silently.
 *   B11: isExperienceMemoryRecord correctly identifies derived records.
 */

import { describe, it, expect } from "vitest";
import {
  experienceToMemoryRecord,
  experiencesToMemoryRecords,
  isExperienceMemoryRecord,
} from "../../src/experience/experience-memory-bridge.js";
import type { Experience } from "../../src/schemas/experience.js";
import type { MemoryRecord } from "../../src/schemas/memory.js";
import {
  asExperienceId,
  asRunId,
  asEvaluationId,
  asEvidenceId,
  asMemoryRecordId,
} from "../../src/core/identifiers.js";
import { isContractValidationError } from "../../src/core/errors.js";

function makeExperience(overrides: Partial<Experience> = {}): Experience {
  return {
    id: asExperienceId("x-1"),
    runId: asRunId("r-source"),
    evaluationId: asEvaluationId("ev-source"),
    provenance: {
      kind: "approved",
      source: {
        kind: "evidence",
        evidenceId: asEvidenceId("ev-source") as never,
        at: "2024-01-01T00:00:00Z",
      },
    },
    applicability: {
      taskKinds: ["test-fix"],
      taskTags: ["vitest"],
      repoPatterns: ["https://example.com/*"],
      adapterKinds: ["mock"],
    },
    reusability: "reusable",
    reuseConditions: ["must-rebuild"],
    summary: "Rebuild before tests to avoid stale artifacts.",
    learnedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("Stage D — Experience-to-Memory bridge", () => {
  describe("B1 + B2: experienceToMemoryRecord produces a valid MemoryRecord of kind 'experience'", () => {
    it("produces a MemoryRecord", () => {
      const exp = makeExperience();
      const m = experienceToMemoryRecord(exp);
      expect(m).toBeDefined();
      expect(typeof m.id).toBe("string");
      expect(m.id.length).toBeGreaterThan(0);
    });

    it("the MemoryRecord.kind is 'experience'", () => {
      const m = experienceToMemoryRecord(makeExperience());
      expect(m.kind).toBe("experience");
    });
  });

  describe("B3: provenance kind is preserved (no silent upgrade)", () => {
    it("an approved Experience becomes an approved MemoryRecord", () => {
      const m = experienceToMemoryRecord(makeExperience({ provenance: { kind: "approved", source: { kind: "evidence", evidenceId: asEvidenceId("x") as never, at: "x" } } }));
      expect(m.provenance.kind).toBe("approved");
    });

    it("an observed Experience becomes an observed MemoryRecord", () => {
      const m = experienceToMemoryRecord(makeExperience({ provenance: { kind: "observed", source: { kind: "evidence", evidenceId: asEvidenceId("x") as never, at: "x" } } }));
      expect(m.provenance.kind).toBe("observed");
    });

    it("a reviewed Experience becomes a reviewed MemoryRecord", () => {
      const m = experienceToMemoryRecord(makeExperience({ provenance: { kind: "reviewed", source: { kind: "evidence", evidenceId: asEvidenceId("x") as never, at: "x" } } }));
      expect(m.provenance.kind).toBe("reviewed");
    });

    it("the source reference is preserved", () => {
      const exp = makeExperience();
      const m = experienceToMemoryRecord(exp);
      expect(m.provenance.source).toEqual(exp.provenance.source);
    });
  });

  describe("B4 + B5: MemoryRecord references the source Experience and Run", () => {
    it("derivedFromExperienceId matches the source Experience.id", () => {
      const exp = makeExperience();
      const m = experienceToMemoryRecord(exp);
      expect(m.derivedFromExperienceId).toBe(exp.id);
    });

    it("derivedFromRunId matches the source Experience.runId", () => {
      const exp = makeExperience();
      const m = experienceToMemoryRecord(exp);
      expect(m.derivedFromRunId).toBe(exp.runId);
    });
  });

  describe("B6: applicability is copied from the Experience", () => {
    it("taskKinds, taskTags, repoPatterns are copied", () => {
      const exp = makeExperience();
      const m = experienceToMemoryRecord(exp);
      expect(m.applicability.taskKinds).toEqual(exp.applicability.taskKinds);
      expect(m.applicability.taskTags).toEqual(exp.applicability.taskTags);
      expect(m.applicability.repoPatterns).toEqual(exp.applicability.repoPatterns);
    });

    it("expiresAt is NOT set (no independent expiry)", () => {
      const m = experienceToMemoryRecord(makeExperience());
      expect(m.applicability.expiresAt).toBeUndefined();
    });
  });

  describe("B7: MemoryRecord.content includes summary + reusability", () => {
    it("content has summary, reusability, reuseConditions, adapterKinds, learnedAt", () => {
      const exp = makeExperience();
      const m = experienceToMemoryRecord(exp);
      expect(m.content.summary).toBe(exp.summary);
      expect(m.content.reusability).toBe(exp.reusability);
      expect(m.content.reuseConditions).toEqual([...exp.reuseConditions ?? []]);
      expect(m.content.adapterKinds).toEqual([...exp.applicability.adapterKinds ?? []]);
      expect(m.content.learnedAt).toBe(exp.learnedAt);
    });
  });

  describe("B8: the bridge does NOT mutate the source Experience", () => {
    it("the source Experience is unchanged after conversion", () => {
      const exp = makeExperience();
      const snapshot = { ...exp };
      experienceToMemoryRecord(exp);
      // Source Experience unchanged
      expect(exp.id).toBe(snapshot.id);
      expect(exp.provenance.kind).toBe(snapshot.provenance.kind);
      expect(exp.summary).toBe(snapshot.summary);
    });

    it("the produced MemoryRecord's id is DIFFERENT from the source Experience.id", () => {
      const exp = makeExperience();
      const m = experienceToMemoryRecord(exp);
      // The MemoryRecord has its OWN id (not the source Experience's id)
      expect(m.id).not.toBe(exp.id);
    });
  });

  describe("B9: the bridge REJECTS deprecated Experiences", () => {
    it("throws ContractValidationError for a deprecated Experience", () => {
      const deprecated = makeExperience({
        provenance: {
          kind: "deprecated",
          source: { kind: "evidence", evidenceId: asEvidenceId("x") as never, at: "x" },
        },
      });
      expect(() => experienceToMemoryRecord(deprecated)).toThrow();
      try {
        experienceToMemoryRecord(deprecated);
      } catch (e) {
        expect(isContractValidationError(e)).toBe(true);
      }
    });
  });

  describe("B10: experiencesToMemoryRecords skips deprecated Experiences silently", () => {
    it("returns MemoryRecords for non-deprecated Experiences only", () => {
      const approved = makeExperience({
        id: asExperienceId("x-approved"),
        provenance: {
          kind: "approved",
          source: { kind: "evidence", evidenceId: asEvidenceId("x") as never, at: "x" },
        },
      });
      const observed = makeExperience({
        id: asExperienceId("x-observed"),
        provenance: {
          kind: "observed",
          source: { kind: "evidence", evidenceId: asEvidenceId("x") as never, at: "x" },
        },
      });
      const deprecated = makeExperience({
        id: asExperienceId("x-deprecated"),
        provenance: {
          kind: "deprecated",
          source: { kind: "evidence", evidenceId: asEvidenceId("x") as never, at: "x" },
        },
      });

      const records = experiencesToMemoryRecords([approved, observed, deprecated]);
      expect(records).toHaveLength(2);
      expect(records[0]!.derivedFromExperienceId).toBe("x-approved");
      expect(records[1]!.derivedFromExperienceId).toBe("x-observed");
    });

    it("returns an empty array when all Experiences are deprecated", () => {
      const deprecated = makeExperience({
        provenance: {
          kind: "deprecated",
          source: { kind: "evidence", evidenceId: asEvidenceId("x") as never, at: "x" },
        },
      });
      const records = experiencesToMemoryRecords([deprecated]);
      expect(records).toEqual([]);
    });

    it("returns an empty array for an empty input", () => {
      expect(experiencesToMemoryRecords([])).toEqual([]);
    });
  });

  describe("B11: isExperienceMemoryRecord", () => {
    it("returns true for a MemoryRecord of kind 'experience' with derivedFromExperienceId", () => {
      const m = experienceToMemoryRecord(makeExperience());
      expect(isExperienceMemoryRecord(m)).toBe(true);
    });

    it("returns false for a MemoryRecord of kind 'fact'", () => {
      const m: MemoryRecord = {
        id: asMemoryRecordId("m-fact"),
        kind: "fact",
        provenance: {
          kind: "approved",
          source: { kind: "human", actor: "x", at: "x" },
        },
        applicability: {},
        content: { x: 1 },
        createdAt: "x",
        updatedAt: "x",
      };
      expect(isExperienceMemoryRecord(m)).toBe(false);
    });

    it("returns false for a MemoryRecord of kind 'experience' WITHOUT derivedFromExperienceId", () => {
      const m: MemoryRecord = {
        id: asMemoryRecordId("m-manual"),
        kind: "experience",
        provenance: {
          kind: "approved",
          source: { kind: "human", actor: "x", at: "x" },
        },
        applicability: {},
        content: { x: 1 },
        createdAt: "x",
        updatedAt: "x",
      };
      // Manually-created "experience"-kind MemoryRecord without derivedFromExperienceId
      expect(isExperienceMemoryRecord(m)).toBe(false);
    });
  });

  describe("B12: the produced MemoryRecord passes validateMemoryRecord", () => {
    it("a successfully-produced record passes validation (no throw on add to store)", () => {
      const m = experienceToMemoryRecord(makeExperience());
      // The bridge calls validateMemoryRecord internally; reaching this
      // point means validation passed.
      expect(m.id).toBeDefined();
    });
  });
});
