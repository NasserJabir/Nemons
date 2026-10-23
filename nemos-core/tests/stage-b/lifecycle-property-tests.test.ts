/**
 * Stage B — Property-based tests for the lifecycle state machine.
 *
 * Verifies that the lifecycle state machine holds for ALL valid inputs,
 * not just the few happy-path cases tested in Stage 0.
 *
 * Properties tested:
 *   P1: For every (from, to) pair, isTransitionAllowed is deterministic.
 *   P2: For every allowed transition, transitionProvenance produces a
 *       record whose kind is `to` and whose reviewTrail gained one entry.
 *   P3: For every forbidden transition, transitionProvenance throws.
 *   P4: The review trail is append-only across multiple transitions.
 *   P5: A terminal kind cannot be transitioned out of.
 *   P6: legalNextKinds(from) and isTransitionAllowed(from, to) are
 *       consistent — every kind in legalNextKinds is allowed, every
 *       kind NOT in legalNextKinds is forbidden.
 *   P7: transitionProvenance does not mutate the original record.
 *
 * These tests would catch:
 *   - Non-deterministic rule evaluation
 *   - Trail mutation instead of append
 *   - Off-by-one or copy errors in the transition function
 */

import { describe, it, expect } from "vitest";
import {
  isTransitionAllowed,
  assertTransition,
  IllegalTransitionError,
  transitionProvenance,
  legalNextKinds,
  isTerminalKind,
} from "../../src/core/lifecycle.js";
import type { ProvenanceKind } from "../../src/core/provenance.js";
import type { ReviewEntry } from "../../src/core/provenance.js";

const ALL_KINDS: readonly ProvenanceKind[] = [
  "observed",
  "imported",
  "proposed",
  "reviewed",
  "approved",
  "deprecated",
];

function makeEntry(
  from: ProvenanceKind,
  to: ProvenanceKind,
  overrides: Partial<ReviewEntry> = {},
): ReviewEntry {
  return {
    from,
    to,
    at: "2024-01-01T00:00:00Z",
    actor: "tester",
    reason: "test reason",
    ...overrides,
  };
}

describe("Stage B — lifecycle property-based tests", () => {
  describe("P1: isTransitionAllowed is deterministic", () => {
    for (const from of ALL_KINDS) {
      for (const to of ALL_KINDS) {
        it(`${from} → ${to} returns the same value on repeated calls`, () => {
          const a = isTransitionAllowed(from, to);
          const b = isTransitionAllowed(from, to);
          const c = isTransitionAllowed(from, to);
          expect(a).toBe(b);
          expect(b).toBe(c);
        });
      }
    }
  });

  describe("P2 + P3: every allowed transition succeeds, every forbidden throws", () => {
    for (const from of ALL_KINDS) {
      for (const to of ALL_KINDS) {
        const allowed = isTransitionAllowed(from, to);
        if (allowed) {
          it(`allowed: ${from} → ${to} produces a record with kind="${to}"`, () => {
            const current = { kind: from };
            const next = transitionProvenance(current, to, makeEntry(from, to));
            expect(next.kind).toBe(to);
          });

          it(`allowed: ${from} → ${to} appends to the review trail`, () => {
            const current = { kind: from, reviewTrail: [] as readonly ReviewEntry[] };
            const next = transitionProvenance(current, to, makeEntry(from, to));
            expect(next.reviewTrail).toHaveLength(1);
            expect(next.reviewTrail[0]?.from).toBe(from);
            expect(next.reviewTrail[0]?.to).toBe(to);
          });
        } else {
          it(`forbidden: ${from} → ${to} throws IllegalTransitionError`, () => {
            expect(() => assertTransition(from, to)).toThrowError(IllegalTransitionError);
            expect(() =>
              transitionProvenance({ kind: from }, to, makeEntry(from, to)),
            ).toThrowError(IllegalTransitionError);
          });
        }
      }
    }
  });

  describe("P4: the review trail is append-only across multiple transitions", () => {
    it("three sequential transitions produce a trail of length 3, in order", () => {
      // observed → reviewed → approved → deprecated (the canonical full lifecycle)
      let current: { readonly kind: ProvenanceKind; readonly reviewTrail: readonly ReviewEntry[] } = {
        kind: "observed",
        reviewTrail: [],
      };
      const t1 = transitionProvenance(current, "reviewed", makeEntry("observed", "reviewed", { reason: "1" }));
      current = t1;
      const t2 = transitionProvenance(current, "approved", makeEntry("reviewed", "approved", { reason: "2" }));
      current = t2;
      const t3 = transitionProvenance(current, "deprecated", makeEntry("approved", "deprecated", { reason: "3" }));
      current = t3;

      expect(current.reviewTrail).toHaveLength(3);
      expect(current.reviewTrail[0]?.reason).toBe("1");
      expect(current.reviewTrail[1]?.reason).toBe("2");
      expect(current.reviewTrail[2]?.reason).toBe("3");
      // Final kind is deprecated (terminal)
      expect(current.kind).toBe("deprecated");
    });

    it("two trails from the same starting point are independent (no shared mutation)", () => {
      const start = { kind: "observed" as const, reviewTrail: [] as readonly ReviewEntry[] };
      const branch1 = transitionProvenance(start, "reviewed", makeEntry("observed", "reviewed"));
      const branch2 = transitionProvenance(start, "proposed", makeEntry("observed", "proposed"));
      // Both branches built from the same start; both should have a trail of length 1
      expect(branch1.reviewTrail).toHaveLength(1);
      expect(branch2.reviewTrail).toHaveLength(1);
      expect(branch1.kind).toBe("reviewed");
      expect(branch2.kind).toBe("proposed");
      // The starting record was not mutated
      expect(start.reviewTrail).toHaveLength(0);
      expect(start.kind).toBe("observed");
    });
  });

  describe("P5: terminal kinds cannot be transitioned out of", () => {
    it("deprecated is terminal — no transitions out", () => {
      expect(isTerminalKind("deprecated")).toBe(true);
      for (const to of ALL_KINDS) {
        expect(isTransitionAllowed("deprecated", to)).toBe(false);
      }
    });
  });

  describe("P6: legalNextKinds and isTransitionAllowed are consistent", () => {
    for (const from of ALL_KINDS) {
      it(`legalNextKinds(${from}) matches the allow-set from isTransitionAllowed`, () => {
        const legal = legalNextKinds(from);
        const allowedByFn = ALL_KINDS.filter((to) => isTransitionAllowed(from, to));
        expect([...legal].sort()).toEqual([...allowedByFn].sort());
      });
    }
  });

  describe("P7: transitionProvenance does not mutate the original record", () => {
    it("the original kind and reviewTrail are unchanged after a transition", () => {
      const original = {
        kind: "observed" as const,
        reviewTrail: [] as readonly ReviewEntry[],
      };
      const originalSnapshot = { ...original, reviewTrail: [...original.reviewTrail] };
      transitionProvenance(original, "reviewed", makeEntry("observed", "reviewed"));
      // Original unchanged
      expect(original.kind).toBe(originalSnapshot.kind);
      expect(original.reviewTrail).toEqual(originalSnapshot.reviewTrail);
    });

    it("the original reviewTrail array reference is not mutated", () => {
      const trail: ReviewEntry[] = [];
      const original = { kind: "reviewed" as const, reviewTrail: trail };
      transitionProvenance(original, "approved", makeEntry("reviewed", "approved"));
      // The original `trail` array is still empty (no push happened)
      expect(trail).toHaveLength(0);
    });
  });

  describe("P8: every legal next kind is a valid ProvenanceKind", () => {
    for (const from of ALL_KINDS) {
      const legal = legalNextKinds(from);
      for (const to of legal) {
        it(`legalNextKinds(${from}) includes only valid kinds: ${to}`, () => {
          expect(ALL_KINDS).toContain(to);
        });
      }
    }
  });
});
