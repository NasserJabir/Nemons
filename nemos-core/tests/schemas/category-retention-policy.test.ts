/**
 * Category-Conditioned Memory Retention tests (ADR-0014).
 *
 * Verifies:
 *   CR1: fact with observed provenance → retain (lenient).
 *   CR2: value with observed provenance → flagForReview (strict).
 *   CR3: value with reviewed provenance → retain (strict, meets minimum).
 *   CR4: prediction with observed provenance → flagForReview (strict).
 *   CR5: procedure with observed provenance → retain (lenient).
 *   CR6: uncategorized (no category) with observed provenance → retain (backward-compat).
 *   CR7: all 6 categories are supported.
 *   CR8: custom policy works.
 *   CR9: shouldRetain + needsReview helpers.
 *   CR10: existing Memory records (no category) are backward-compatible.
 *   CR11: the retention check is read-only (doesn't modify the record).
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_CATEGORY_RETENTION_POLICY,
  checkRetention,
  shouldRetain,
  needsReview,
} from "../../src/schemas/category-retention-policy.js";
import type { CategoryRetentionPolicy } from "../../src/schemas/category-retention-policy.js";
import type { MemoryRecord, MemoryCategory } from "../../src/schemas/memory.js";
import {
  asMemoryRecordId,
  asRunId,
} from "../../src/core/identifiers.js";
import type { ProvenanceKind } from "../../src/core/provenance.js";

function makeMemory(
  overrides: Partial<MemoryRecord> & { category?: MemoryCategory; provenanceKind?: ProvenanceKind } = {},
): MemoryRecord {
  const provenanceKind = overrides.provenanceKind ?? "observed";
  return {
    id: asMemoryRecordId("m-cr-1"),
    kind: "fact",
    provenance: {
      kind: provenanceKind,
      source: { kind: "human", actor: "x", at: "2024-01-01T00:00:00Z" },
    },
    applicability: { taskKinds: ["test-fix"] },
    content: { x: 1 },
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    category: overrides.category,
    ...overrides,
  };
}

describe("Category-Conditioned Memory Retention (ADR-0014)", () => {
  describe("CR1 + CR5: lenient categories with observed provenance → retain", () => {
    it("CR1: fact with observed provenance → retain", () => {
      const record = makeMemory({ category: "fact", provenanceKind: "observed" });
      const result = checkRetention(record);
      expect(result.kind).toBe("retain");
    });

    it("CR5: procedure with observed provenance → retain", () => {
      const record = makeMemory({ category: "procedure", provenanceKind: "observed" });
      const result = checkRetention(record);
      expect(result.kind).toBe("retain");
    });

    it("decision with observed provenance → retain", () => {
      const record = makeMemory({ category: "decision", provenanceKind: "observed" });
      const result = checkRetention(record);
      expect(result.kind).toBe("retain");
    });
  });

  describe("CR2 + CR4: strict categories with observed provenance → flagForReview", () => {
    it("CR2: value with observed provenance → flagForReview", () => {
      const record = makeMemory({ category: "value", provenanceKind: "observed" });
      const result = checkRetention(record);
      expect(result.kind).toBe("flagForReview");
      if (result.kind === "flagForReview") {
        expect(result.requiredProvenance).toBe("reviewed");
        expect(result.currentProvenance).toBe("observed");
        expect(result.reason).toContain("value");
        expect(result.reason).toContain("strict");
      }
    });

    it("CR4: prediction with observed provenance → flagForReview", () => {
      const record = makeMemory({ category: "prediction", provenanceKind: "observed" });
      const result = checkRetention(record);
      expect(result.kind).toBe("flagForReview");
    });
  });

  describe("CR3: strict categories with sufficient provenance → retain", () => {
    it("value with reviewed provenance → retain", () => {
      const record = makeMemory({ category: "value", provenanceKind: "reviewed" });
      const result = checkRetention(record);
      expect(result.kind).toBe("retain");
    });

    it("value with approved provenance → retain", () => {
      const record = makeMemory({ category: "value", provenanceKind: "approved" });
      const result = checkRetention(record);
      expect(result.kind).toBe("retain");
    });

    it("prediction with reviewed provenance → retain", () => {
      const record = makeMemory({ category: "prediction", provenanceKind: "reviewed" });
      const result = checkRetention(record);
      expect(result.kind).toBe("retain");
    });
  });

  describe("CR6 + CR10: uncategorized / backward-compatible", () => {
    it("CR6: uncategorized with observed provenance → retain (backward-compat)", () => {
      const record = makeMemory({ category: "uncategorized", provenanceKind: "observed" });
      const result = checkRetention(record);
      expect(result.kind).toBe("retain");
    });

    it("CR10: record with no category field → retain (backward-compat)", () => {
      const record = makeMemory({ category: undefined, provenanceKind: "observed" });
      const result = checkRetention(record);
      expect(result.kind).toBe("retain");
    });
  });

  describe("CR7: all 6 categories supported", () => {
    const categories: MemoryCategory[] = ["fact", "procedure", "decision", "value", "prediction", "uncategorized"];
    for (const cat of categories) {
      it(`category '${cat}' with observed provenance produces a result`, () => {
        const record = makeMemory({ category: cat, provenanceKind: "observed" });
        const result = checkRetention(record);
        expect(["retain", "flagForReview", "reject"]).toContain(result.kind);
      });
    }
  });

  describe("CR8: custom policy", () => {
    it("custom policy with 'fact' as strict → fact with observed → flagForReview", () => {
      const customPolicy: CategoryRetentionPolicy = {
        strictCategories: ["fact"],
        lenientCategories: ["value"],
        strictProvenanceMinimum: "approved",
        lenientProvenanceMinimum: "observed",
      };
      const record = makeMemory({ category: "fact", provenanceKind: "observed" });
      const result = checkRetention(record, customPolicy);
      expect(result.kind).toBe("flagForReview");
      if (result.kind === "flagForReview") {
        expect(result.requiredProvenance).toBe("approved");
      }
    });

    it("custom policy with 'value' as lenient → value with observed → retain", () => {
      const customPolicy: CategoryRetentionPolicy = {
        strictCategories: ["fact"],
        lenientCategories: ["value"],
        strictProvenanceMinimum: "approved",
        lenientProvenanceMinimum: "observed",
      };
      const record = makeMemory({ category: "value", provenanceKind: "observed" });
      const result = checkRetention(record, customPolicy);
      expect(result.kind).toBe("retain");
    });
  });

  describe("CR9: helpers", () => {
    it("shouldRetain returns true for 'retain'", () => {
      const record = makeMemory({ category: "fact", provenanceKind: "observed" });
      const result = checkRetention(record);
      expect(shouldRetain(result)).toBe(true);
    });

    it("shouldRetain returns false for 'flagForReview'", () => {
      const record = makeMemory({ category: "value", provenanceKind: "observed" });
      const result = checkRetention(record);
      expect(shouldRetain(result)).toBe(false);
    });

    it("needsReview returns true for 'flagForReview'", () => {
      const record = makeMemory({ category: "value", provenanceKind: "observed" });
      const result = checkRetention(record);
      expect(needsReview(result)).toBe(true);
    });

    it("needsReview returns false for 'retain'", () => {
      const record = makeMemory({ category: "fact", provenanceKind: "observed" });
      const result = checkRetention(record);
      expect(needsReview(result)).toBe(false);
    });
  });

  describe("CR11: read-only (doesn't modify the record)", () => {
    it("the record's content is unchanged after the check", () => {
      const record = makeMemory({ category: "value", provenanceKind: "observed" });
      const contentBefore = { ...record.content };
      const categoryBefore = record.category;
      const provenanceBefore = record.provenance.kind;
      checkRetention(record);
      expect(record.content).toEqual(contentBefore);
      expect(record.category).toBe(categoryBefore);
      expect(record.provenance.kind).toBe(provenanceBefore);
    });
  });

  describe("DEFAULT_CATEGORY_RETENTION_POLICY", () => {
    it("has 'value' and 'prediction' as strict", () => {
      expect(DEFAULT_CATEGORY_RETENTION_POLICY.strictCategories).toContain("value");
      expect(DEFAULT_CATEGORY_RETENTION_POLICY.strictCategories).toContain("prediction");
    });

    it("has 'fact', 'procedure', 'decision' as lenient", () => {
      expect(DEFAULT_CATEGORY_RETENTION_POLICY.lenientCategories).toContain("fact");
      expect(DEFAULT_CATEGORY_RETENTION_POLICY.lenientCategories).toContain("procedure");
      expect(DEFAULT_CATEGORY_RETENTION_POLICY.lenientCategories).toContain("decision");
    });

    it("strict minimum is 'reviewed'", () => {
      expect(DEFAULT_CATEGORY_RETENTION_POLICY.strictProvenanceMinimum).toBe("reviewed");
    });

    it("lenient minimum is 'observed'", () => {
      expect(DEFAULT_CATEGORY_RETENTION_POLICY.lenientProvenanceMinimum).toBe("observed");
    });
  });
});
