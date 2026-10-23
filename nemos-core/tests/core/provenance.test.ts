import { describe, it, expect } from "vitest";
import {
  meetsMinimumTrust,
  isDeprecated,
  isApproved,
  isObservedOnly,
} from "../../src/core/provenance.js";
import type { Provenance } from "../../src/core/provenance.js";

function makeProvenance(kind: Provenance["kind"]): Provenance {
  return {
    kind,
    source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
  };
}

describe("provenance", () => {
  describe("meetsMinimumTrust", () => {
    it("approved meets observed minimum", () => {
      expect(meetsMinimumTrust(makeProvenance("approved"), "observed")).toBe(true);
    });

    it("approved meets approved minimum", () => {
      expect(meetsMinimumTrust(makeProvenance("approved"), "approved")).toBe(true);
    });

    it("observed does NOT meet approved minimum", () => {
      expect(meetsMinimumTrust(makeProvenance("observed"), "approved")).toBe(false);
    });

    it("reviewed does NOT meet approved minimum", () => {
      expect(meetsMinimumTrust(makeProvenance("reviewed"), "approved")).toBe(false);
    });

    it("reviewed meets reviewed minimum", () => {
      expect(meetsMinimumTrust(makeProvenance("reviewed"), "reviewed")).toBe(true);
    });

    it("deprecated NEVER meets any minimum (even observed)", () => {
      expect(meetsMinimumTrust(makeProvenance("deprecated"), "observed")).toBe(false);
    });
  });

  describe("isDeprecated", () => {
    it("returns true for deprecated kind", () => {
      expect(isDeprecated(makeProvenance("deprecated"))).toBe(true);
    });

    it("returns false for approved kind", () => {
      expect(isDeprecated(makeProvenance("approved"))).toBe(false);
    });
  });

  describe("isApproved", () => {
    it("returns true for approved kind", () => {
      expect(isApproved(makeProvenance("approved"))).toBe(true);
    });

    it("returns false for reviewed kind", () => {
      expect(isApproved(makeProvenance("reviewed"))).toBe(false);
    });
  });

  describe("isObservedOnly", () => {
    it("returns true for observed kind", () => {
      expect(isObservedOnly(makeProvenance("observed"))).toBe(true);
    });

    it("returns false for reviewed kind", () => {
      expect(isObservedOnly(makeProvenance("reviewed"))).toBe(false);
    });
  });
});
