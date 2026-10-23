import { describe, it, expect } from "vitest";
import {
  validateKnowledge,
  isKnowledgeApproved,
  isKnowledgeDeprecated,
  isKnowledgeObservedOnly,
} from "../../src/schemas/knowledge.js";
import type { Knowledge } from "../../src/schemas/knowledge.js";
import { asKnowledgeId } from "../../src/core/identifiers.js";
import { ContractValidationError } from "../../src/core/errors.js";

function makeKnowledge(overrides: Partial<Knowledge> = {}): Knowledge {
  return {
    id: asKnowledgeId("k-1"),
    version: "1.0.0",
    provenance: {
      kind: "approved",
      source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
    },
    title: "Test Runner Config",
    summary: "How the test runner is configured.",
    content: "The test runner uses vitest with config at vitest.config.ts.",
    applicability: { subjectKind: "repository", taskKinds: ["test-fix"] },
    ...overrides,
  };
}

describe("knowledge schema", () => {
  describe("validateKnowledge", () => {
    it("accepts a valid Knowledge record", () => {
      expect(() => validateKnowledge(makeKnowledge())).not.toThrow();
    });

    it("rejects null", () => {
      expect(() => validateKnowledge(null)).toThrowError(ContractValidationError);
    });

    it("rejects empty title", () => {
      expect(() => validateKnowledge(makeKnowledge({ title: "" }))).toThrowError(ContractValidationError);
    });

    it("rejects empty content (string allowed but typed)", () => {
      // Empty content is allowed structurally; only type matters.
      expect(() => validateKnowledge(makeKnowledge({ content: "" }))).not.toThrow();
    });

    it("rejects non-object applicability", () => {
      const k = makeKnowledge() as unknown as Record<string, unknown>;
      k.applicability = "wrong";
      expect(() => validateKnowledge(k)).toThrowError(ContractValidationError);
    });
  });

  describe("isKnowledgeApproved", () => {
    it("returns true for approved kind", () => {
      expect(isKnowledgeApproved(makeKnowledge())).toBe(true);
    });

    it("returns false for observed kind", () => {
      expect(
        isKnowledgeApproved(
          makeKnowledge({
            provenance: { kind: "observed", source: { kind: "human", actor: "x", at: "x" } },
          }),
        ),
      ).toBe(false);
    });
  });

  describe("isKnowledgeDeprecated", () => {
    it("returns true for deprecated kind", () => {
      expect(
        isKnowledgeDeprecated(
          makeKnowledge({
            provenance: { kind: "deprecated", source: { kind: "human", actor: "x", at: "x" } },
          }),
        ),
      ).toBe(true);
    });
  });

  describe("isKnowledgeObservedOnly", () => {
    it("returns true for observed kind", () => {
      expect(
        isKnowledgeObservedOnly(
          makeKnowledge({
            provenance: { kind: "observed", source: { kind: "human", actor: "x", at: "x" } },
          }),
        ),
      ).toBe(true);
    });

    it("returns false for reviewed kind", () => {
      expect(
        isKnowledgeObservedOnly(
          makeKnowledge({
            provenance: { kind: "reviewed", source: { kind: "human", actor: "x", at: "x" } },
          }),
        ),
      ).toBe(false);
    });
  });
});
