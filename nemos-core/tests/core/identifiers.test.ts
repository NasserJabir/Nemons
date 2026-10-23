import { describe, it, expect } from "vitest";
import {
  asRunId,
  asPersonaId,
  asSkillId,
  asKnowledgeId,
  asEvidenceId,
  asContextPackId,
  asEvaluationId,
  asExperienceId,
  asMemoryRecordId,
  asPolicyDecisionId,
  freshId,
  isValidIdString,
  sha256Hex,
  assertDefined,
} from "../../src/core/identifiers.js";

describe("identifiers", () => {
  describe("branded id constructors", () => {
    it("creates branded IDs from plain strings", () => {
      expect(asRunId("r-1")).toBe("r-1" as never);
      expect(asPersonaId("p-1")).toBe("p-1" as never);
      expect(asSkillId("s-1")).toBe("s-1" as never);
      expect(asKnowledgeId("k-1")).toBe("k-1" as never);
      expect(asEvidenceId("e-1")).toBe("e-1" as never);
      expect(asContextPackId("c-1")).toBe("c-1" as never);
      expect(asEvaluationId("v-1")).toBe("v-1" as never);
      expect(asExperienceId("x-1")).toBe("x-1" as never);
      expect(asMemoryRecordId("m-1")).toBe("m-1" as never);
      expect(asPolicyDecisionId("d-1")).toBe("d-1" as never);
    });
  });

  describe("freshId", () => {
    it("returns a string of length > 0", () => {
      const id = freshId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("returns distinct values on consecutive calls", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(freshId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("isValidIdString", () => {
    it("accepts non-empty strings within length bounds", () => {
      expect(isValidIdString("a")).toBe(true);
      expect(isValidIdString("abcdef-1234")).toBe(true);
    });

    it("rejects empty strings", () => {
      expect(isValidIdString("")).toBe(false);
    });

    it("rejects non-strings", () => {
      expect(isValidIdString(123)).toBe(false);
      expect(isValidIdString(null)).toBe(false);
      expect(isValidIdString(undefined)).toBe(false);
      expect(isValidIdString({})).toBe(false);
    });

    it("rejects strings containing null bytes", () => {
      expect(isValidIdString("a\u0000b")).toBe(false);
    });
  });

  describe("sha256Hex", () => {
    it("produces a 64-character hex string", () => {
      const hash = sha256Hex("hello");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is deterministic: same input produces same hash", () => {
      expect(sha256Hex("hello")).toBe(sha256Hex("hello"));
    });

    it("produces different hashes for different inputs", () => {
      expect(sha256Hex("hello")).not.toBe(sha256Hex("world"));
    });

    it("matches the known SHA-256 of 'hello'", () => {
      // Standard reference value for SHA-256("hello")
      expect(sha256Hex("hello")).toBe(
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      );
    });

    it("accepts Uint8Array input", () => {
      const bytes = new TextEncoder().encode("hello");
      expect(sha256Hex(bytes)).toBe(sha256Hex("hello"));
    });
  });

  describe("assertDefined", () => {
    it("returns the value when defined", () => {
      expect(assertDefined(42, "should not throw")).toBe(42);
      expect(assertDefined("x", "should not throw")).toBe("x");
    });

    it("throws when undefined", () => {
      expect(() => assertDefined(undefined, "missing")).toThrowError(/missing/);
      expect(() => assertDefined(null, "missing")).toThrowError(/missing/);
    });
  });
});
