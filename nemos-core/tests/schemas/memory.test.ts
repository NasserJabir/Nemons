import { describe, it, expect } from "vitest";
import {
  validateMemoryRecord,
  isMemoryApproved,
  isMemoryObservedOnly,
  isMemoryExpired,
} from "../../src/schemas/memory.js";
import type { MemoryRecord } from "../../src/schemas/memory.js";
import { asMemoryRecordId, asRunId } from "../../src/core/identifiers.js";
import { ContractValidationError } from "../../src/core/errors.js";

function makeMemory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: asMemoryRecordId("m-1"),
    kind: "experience",
    provenance: {
      kind: "approved",
      source: { kind: "run", runId: asRunId("r-1"), at: "2024-01-01T00:00:00Z" },
    },
    applicability: { taskKinds: ["test-fix"] },
    derivedFromRunId: asRunId("r-1"),
    content: { learned: "rebuild before tests" },
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("memory schema", () => {
  describe("validateMemoryRecord", () => {
    it("accepts a valid Memory record", () => {
      expect(() => validateMemoryRecord(makeMemory())).not.toThrow();
    });

    it("rejects null", () => {
      expect(() => validateMemoryRecord(null)).toThrowError(ContractValidationError);
    });

    it("rejects an invalid kind", () => {
      const m = makeMemory() as unknown as Record<string, unknown>;
      m.kind = "invalid-kind";
      expect(() => validateMemoryRecord(m)).toThrowError(ContractValidationError);
    });

    it("rejects an experience memory without derivedFromRunId", () => {
      const m = makeMemory();
      const { derivedFromRunId, ...withoutRun } = m;
      void derivedFromRunId;
      expect(() => validateMemoryRecord(withoutRun)).toThrowError(ContractValidationError);
    });

    it("accepts a fact-kind memory without derivedFromRunId", () => {
      const m = makeMemory({ kind: "fact", derivedFromRunId: undefined });
      expect(() => validateMemoryRecord(m)).not.toThrow();
    });

    it("rejects non-object content", () => {
      const m = makeMemory() as unknown as Record<string, unknown>;
      m.content = "string content";
      expect(() => validateMemoryRecord(m)).toThrowError(ContractValidationError);
    });

    it("rejects empty createdAt", () => {
      expect(() => validateMemoryRecord(makeMemory({ createdAt: "" }))).toThrowError(ContractValidationError);
    });
  });

  describe("isMemoryApproved", () => {
    it("returns true for approved kind", () => {
      expect(isMemoryApproved(makeMemory())).toBe(true);
    });

    it("returns false for observed kind", () => {
      expect(
        isMemoryApproved(
          makeMemory({
            provenance: { kind: "observed", source: { kind: "run", runId: asRunId("r"), at: "x" } },
          }),
        ),
      ).toBe(false);
    });
  });

  describe("isMemoryObservedOnly", () => {
    it("returns true for observed kind", () => {
      expect(
        isMemoryObservedOnly(
          makeMemory({
            provenance: { kind: "observed", source: { kind: "run", runId: asRunId("r"), at: "x" } },
          }),
        ),
      ).toBe(true);
    });
  });

  describe("isMemoryExpired", () => {
    it("returns false when expiresAt is undefined", () => {
      expect(isMemoryExpired(makeMemory(), "2025-01-01T00:00:00Z")).toBe(false);
    });

    it("returns false when expiresAt is in the future", () => {
      const m = makeMemory({
        applicability: { taskKinds: ["test-fix"], expiresAt: "2025-01-01T00:00:00Z" },
      });
      expect(isMemoryExpired(m, "2024-06-01T00:00:00Z")).toBe(false);
    });

    it("returns true when expiresAt is in the past", () => {
      const m = makeMemory({
        applicability: { taskKinds: ["test-fix"], expiresAt: "2024-01-01T00:00:00Z" },
      });
      expect(isMemoryExpired(m, "2024-06-01T00:00:00Z")).toBe(true);
    });
  });
});
