import { describe, it, expect } from "vitest";
import {
  isTransitionAllowed,
  assertTransition,
  IllegalTransitionError,
  transitionProvenance,
  legalNextKinds,
  isCandidateKind,
  isTerminalKind,
} from "../../src/core/lifecycle.js";

describe("lifecycle", () => {
  describe("isTransitionAllowed", () => {
    it("allows observed → reviewed", () => {
      expect(isTransitionAllowed("observed", "reviewed")).toBe(true);
    });

    it("allows reviewed → approved", () => {
      expect(isTransitionAllowed("reviewed", "approved")).toBe(true);
    });

    it("allows approved → deprecated", () => {
      expect(isTransitionAllowed("approved", "deprecated")).toBe(true);
    });

    it("FORBIDS observed → approved (skipping reviewed)", () => {
      expect(isTransitionAllowed("observed", "approved")).toBe(false);
    });

    it("FORBIDS approved → reviewed (cannot demote)", () => {
      expect(isTransitionAllowed("approved", "reviewed")).toBe(false);
    });

    it("FORBIDS deprecated → approved (terminal)", () => {
      expect(isTransitionAllowed("deprecated", "approved")).toBe(false);
    });
  });

  describe("assertTransition", () => {
    it("passes silently for allowed transitions", () => {
      expect(() => assertTransition("observed", "reviewed")).not.toThrow();
      expect(() => assertTransition("reviewed", "approved")).not.toThrow();
    });

    it("throws IllegalTransitionError for forbidden transitions", () => {
      expect(() => assertTransition("observed", "approved")).toThrowError(IllegalTransitionError);
      expect(() => assertTransition("approved", "reviewed")).toThrowError(IllegalTransitionError);
      expect(() => assertTransition("deprecated", "approved")).toThrowError(IllegalTransitionError);
    });

    it("throws with from and to in the error", () => {
      try {
        assertTransition("observed", "approved");
      } catch (e) {
        expect(e).toBeInstanceOf(IllegalTransitionError);
        const err = e as IllegalTransitionError;
        expect(err.from).toBe("observed");
        expect(err.to).toBe("approved");
        expect(err.code).toBe("NEMONS_LIFECYCLE_ILLEGAL_TRANSITION");
      }
    });
  });

  describe("transitionProvenance", () => {
    it("produces a new record with the new kind", () => {
      const current = { kind: "observed" as const };
      const next = transitionProvenance(current, "reviewed", {
        at: "2024-01-01T00:00:00Z",
        actor: "reviewer-1",
        reason: "Initial review",
      });
      expect(next.kind).toBe("reviewed");
    });

    it("appends to the review trail (append-only)", () => {
      const current = {
        kind: "reviewed" as const,
        reviewTrail: [
          {
            from: "observed" as const,
            to: "reviewed" as const,
            at: "2024-01-01T00:00:00Z",
            actor: "a",
            reason: "x",
          },
        ],
      };
      const next = transitionProvenance(current, "approved", {
        at: "2024-01-02T00:00:00Z",
        actor: "approver-1",
        reason: "Approved",
      });
      expect(next.reviewTrail).toHaveLength(2);
      expect(next.reviewTrail[1]?.to).toBe("approved");
    });

    it("does NOT mutate the original record", () => {
      const current = { kind: "observed" as const, reviewTrail: [] as readonly import("../../src/core/provenance.js").ReviewEntry[] };
      transitionProvenance(current, "reviewed", {
        at: "2024-01-01T00:00:00Z",
        actor: "reviewer-1",
        reason: "Initial review",
      });
      // Original unchanged
      expect(current.kind).toBe("observed");
      expect(current.reviewTrail).toHaveLength(0);
    });

    it("throws for forbidden transitions", () => {
      expect(() =>
        transitionProvenance({ kind: "observed" }, "approved", {
          at: "2024-01-01T00:00:00Z",
          actor: "x",
          reason: "skip review",
        }),
      ).toThrowError(IllegalTransitionError);
    });
  });

  describe("legalNextKinds", () => {
    it("returns reviewed/deprecated as next from approved", () => {
      expect(legalNextKinds("approved")).toEqual(["deprecated"]);
    });

    it("returns [] from deprecated (terminal)", () => {
      expect(legalNextKinds("deprecated")).toEqual([]);
    });
  });

  describe("isCandidateKind", () => {
    it("returns true for proposed", () => {
      expect(isCandidateKind("proposed")).toBe(true);
    });

    it("returns false for reviewed and approved", () => {
      expect(isCandidateKind("reviewed")).toBe(false);
      expect(isCandidateKind("approved")).toBe(false);
    });
  });

  describe("isTerminalKind", () => {
    it("returns true for deprecated", () => {
      expect(isTerminalKind("deprecated")).toBe(true);
    });

    it("returns false for approved", () => {
      expect(isTerminalKind("approved")).toBe(false);
    });
  });
});
