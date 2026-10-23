/**
 * Stage B — Boundary tests for identifiers, lifecycle, and SHA-256.
 *
 * Verifies behavior at the EXTREMES of valid input:
 *   - identifiers at the length boundary (1, 1023, 1024, 1025)
 *   - SHA-256 with empty input, very large input, binary input
 *   - lifecycle transition table completeness (every from→to pair is classified)
 *   - Provenance helpers handle every kind
 *
 * These tests catch off-by-one errors and missing branches that the
 * happy-path tests in Stage 0 may not have exercised.
 */

import { describe, it, expect } from "vitest";
import {
  isValidIdString,
  freshId,
  sha256Hex,
  asRunId,
  asPersonaId,
  assertDefined,
} from "../../src/core/identifiers.js";
import {
  isTransitionAllowed,
  legalNextKinds,
  isTerminalKind,
} from "../../src/core/lifecycle.js";
import type { ProvenanceKind } from "../../src/core/provenance.js";
import {
  meetsMinimumTrust,
  isApproved,
  isDeprecated,
  isObservedOnly,
} from "../../src/core/provenance.js";

describe("Stage B — identifiers boundary tests", () => {
  describe("isValidIdString — length boundaries", () => {
    it("accepts a 1-character string", () => {
      expect(isValidIdString("a")).toBe(true);
    });

    it("accepts a 1024-character string (boundary)", () => {
      expect(isValidIdString("a".repeat(1024))).toBe(true);
    });

    it("rejects a 1025-character string (over boundary)", () => {
      expect(isValidIdString("a".repeat(1025))).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isValidIdString("")).toBe(false);
    });

    it("rejects string with embedded null byte", () => {
      expect(isValidIdString("a\u0000b")).toBe(false);
    });

    it("rejects non-string primitives", () => {
      expect(isValidIdString(0)).toBe(false);
      expect(isValidIdString(false)).toBe(false);
      expect(isValidIdString(Symbol("x"))).toBe(false);
    });

    it("rejects null and undefined", () => {
      expect(isValidIdString(null)).toBe(false);
      expect(isValidIdString(undefined)).toBe(false);
    });

    it("rejects objects and arrays", () => {
      expect(isValidIdString({})).toBe(false);
      expect(isValidIdString([])).toBe(false);
      expect(isValidIdString(["a"])).toBe(false);
    });
  });

  describe("freshId — uniqueness at scale", () => {
    it("produces 1000 unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(freshId());
      }
      expect(ids.size).toBe(1000);
    });

    it("produces non-empty strings of reasonable length", () => {
      for (let i = 0; i < 10; i++) {
        const id = freshId();
        expect(id.length).toBeGreaterThan(8);
        expect(id.length).toBeLessThanOrEqual(1024);
      }
    });
  });

  describe("sha256Hex — input extremes", () => {
    it("produces a stable hash for empty input", () => {
      const h = sha256Hex("");
      expect(h).toMatch(/^[0-9a-f]{64}$/);
      // Reference: SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
      expect(h).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    it("produces a stable hash for a large input (10KB)", () => {
      const big = "x".repeat(10_000);
      const h1 = sha256Hex(big);
      const h2 = sha256Hex(big);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
    });

    it("produces different hashes for inputs differing by one byte", () => {
      const a = sha256Hex("abc");
      const b = sha256Hex("abd");
      expect(a).not.toBe(b);
    });

    it("accepts Uint8Array input and matches string equivalent", () => {
      const text = "hello world";
      const bytes = new TextEncoder().encode(text);
      expect(sha256Hex(bytes)).toBe(sha256Hex(text));
    });

    it("accepts an empty Uint8Array", () => {
      const empty = new Uint8Array(0);
      const h = sha256Hex(empty);
      expect(h).toBe(sha256Hex(""));
    });
  });

  describe("branded id constructors — pass-through semantics", () => {
    it("branded ids are still strings at runtime", () => {
      expect(typeof asRunId("r-1")).toBe("string");
      expect(typeof asPersonaId("p-1")).toBe("string");
    });

    it("the brand does not affect value equality", () => {
      // Brands are erased at runtime; same string content → equal value.
      expect(asRunId("x") as string).toBe("x");
    });
  });

  describe("assertDefined — boundary behavior", () => {
    it("returns the value when truthy", () => {
      expect(assertDefined(0, "x")).toBe(0); // 0 is defined
      expect(assertDefined("", "x")).toBe(""); // "" is defined
      expect(assertDefined(false, "x")).toBe(false); // false is defined
    });

    it("throws with the provided message when undefined", () => {
      expect(() => assertDefined(undefined, "missing value")).toThrowError(/missing value/);
    });

    it("throws with the provided message when null", () => {
      expect(() => assertDefined(null, "null value")).toThrowError(/null value/);
    });
  });
});

describe("Stage B — lifecycle completeness tests", () => {
  describe("isTransitionAllowed — every from→to pair is classified", () => {
    // Enumerate all 6×6 = 36 transitions and ensure each is either
    // explicitly allowed or explicitly forbidden.
    const allKinds: ProvenanceKind[] = [
      "observed",
      "imported",
      "proposed",
      "reviewed",
      "approved",
      "deprecated",
    ];

    for (const from of allKinds) {
      for (const to of allKinds) {
        const label = `${from} → ${to}`;
        it(`classifies ${label}`, () => {
          // The function MUST return a boolean, never throw.
          expect(() => isTransitionAllowed(from, to)).not.toThrow();
          const result = isTransitionAllowed(from, to);
          expect(typeof result).toBe("boolean");
          // Self-transitions are always forbidden (lifecycle moves forward only).
          if (from === to) {
            expect(result).toBe(false);
          }
        });
      }
    }

    it("deprecated → anything is forbidden (terminal)", () => {
      for (const to of allKinds) {
        expect(isTransitionAllowed("deprecated", to)).toBe(false);
      }
    });

    it("approved → only deprecated is allowed", () => {
      for (const to of allKinds) {
        if (to === "deprecated") {
          expect(isTransitionAllowed("approved", to)).toBe(true);
        } else {
          expect(isTransitionAllowed("approved", to)).toBe(false);
        }
      }
    });

    it("reviewed → approved or deprecated only", () => {
      const allowed = legalNextKinds("reviewed");
      expect(allowed).toEqual(["approved", "deprecated"]);
    });

    it("observed → proposed or reviewed", () => {
      const allowed = legalNextKinds("observed");
      expect(allowed).toEqual(["proposed", "reviewed"]);
    });

    it("imported → reviewed only", () => {
      const allowed = legalNextKinds("imported");
      expect(allowed).toEqual(["reviewed"]);
    });

    it("proposed → reviewed only", () => {
      const allowed = legalNextKinds("proposed");
      expect(allowed).toEqual(["reviewed"]);
    });
  });

  describe("isTerminalKind", () => {
    it("returns true only for deprecated", () => {
      const allKinds: ProvenanceKind[] = [
        "observed",
        "imported",
        "proposed",
        "reviewed",
        "approved",
        "deprecated",
      ];
      for (const k of allKinds) {
        expect(isTerminalKind(k)).toBe(k === "deprecated");
      }
    });
  });
});

describe("Stage B — provenance helpers for every kind", () => {
  const allKinds: ProvenanceKind[] = [
    "observed",
    "imported",
    "proposed",
    "reviewed",
    "approved",
    "deprecated",
  ];

  // Helper to construct a provenance of any kind
  const makeProvenance = (kind: ProvenanceKind) => ({
    kind,
    source: { kind: "human" as const, actor: "x", at: "x" },
  });

  describe("isApproved — only true for approved", () => {
    for (const k of allKinds) {
      it(`returns ${k === "approved"} for kind "${k}"`, () => {
        expect(isApproved(makeProvenance(k))).toBe(k === "approved");
      });
    }
  });

  describe("isDeprecated — only true for deprecated", () => {
    for (const k of allKinds) {
      it(`returns ${k === "deprecated"} for kind "${k}"`, () => {
        expect(isDeprecated(makeProvenance(k))).toBe(k === "deprecated");
      });
    }
  });

  describe("isObservedOnly — only true for observed", () => {
    for (const k of allKinds) {
      it(`returns ${k === "observed"} for kind "${k}"`, () => {
        expect(isObservedOnly(makeProvenance(k))).toBe(k === "observed");
      });
    }
  });

  describe("meetsMinimumTrust — full matrix", () => {
    // For every (kind, minimum) pair, the result must be deterministic
    // and consistent with the trust ordering.
    for (const assetKind of allKinds) {
      for (const minimum of allKinds) {
        const result = meetsMinimumTrust(makeProvenance(assetKind), minimum);
        // Document the expected behavior:
        // - deprecated NEVER meets ANY minimum (always false)
        // - assetKind meets minimum iff order(assetKind) >= order(minimum)
        if (assetKind === "deprecated") {
          it(`deprecated does NOT meet ${minimum}`, () => {
            expect(result).toBe(false);
          });
        } else if (minimum === "deprecated") {
          // Asking "do you meet deprecated?" is nonsensical; deprecated
          // is not a valid minimum (it's terminal). Returns false.
          it(`${assetKind} does NOT meet deprecated-as-minimum`, () => {
            expect(result).toBe(false);
          });
        } else {
          const order = ["observed", "imported", "proposed", "reviewed", "approved"];
          const expected = order.indexOf(assetKind) >= order.indexOf(minimum);
          it(`${assetKind} meets ${minimum} = ${expected}`, () => {
            expect(result).toBe(expected);
          });
        }
      }
    }
  });
});
