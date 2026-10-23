/**
 * Stage F — CandidateStore tests.
 *
 * Verifies:
 *   S1: add stores a proposed candidate and returns it.
 *   S2: add rejects non-proposed candidates.
 *   S3: add rejects candidates with non-existent supersedesCandidateId.
 *   S4: add rejects duplicate ids.
 *   S5: get returns the candidate with status preserved.
 *   S6: get returns undefined for unknown ids.
 *   S7: list returns all candidates in insertion order.
 *   S8: transition proposed → under_review succeeds.
 *   S9: transition under_review → approved succeeds.
 *   S10: transition approved → superseded succeeds.
 *   S11: transition approved → under_review succeeds (rollback).
 *   S12: transition rejects forbidden transitions.
 *   S13: transition rejects unknown ids.
 *   S14: transition appends to the review trail.
 *   S15: getVersionChain returns the chain (newest first).
 *   S16: getActiveApproved returns the latest approved (non-superseded).
 *   S17: external mutation does NOT corrupt the store.
 *   S18: size returns the count.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryCandidateStore } from "../../src/governed-evolution/candidate-store.js";
import type { CandidateRecord } from "../../src/schemas/candidate.js";
import { asCandidateId } from "../../src/core/identifiers.js";
import {
  isContractValidationError,
  isLifecycleViolationError,
} from "../../src/core/errors.js";
import {
  IllegalCandidateTransitionError,
} from "../../src/schemas/candidate.js";

function makeCandidate(overrides: Partial<CandidateRecord> = {}): CandidateRecord {
  return {
    id: asCandidateId("cand-1"),
    assetKind: "skill",
    assetId: "skill-run-tests",
    proposedVersion: "1.0.0",
    changeKind: "create",
    content: { name: "run-tests" },
    provenance: {
      kind: "observed",
      source: { kind: "human", actor: "alice", at: "2024-01-01T00:00:00Z" },
    },
    status: "proposed",
    proposedBy: "alice",
    proposedAt: "2024-01-01T00:00:00Z",
    rationale: "Initial creation.",
    reviewTrail: [],
    ...overrides,
  };
}

describe("Stage F — CandidateStore", () => {
  let store: InMemoryCandidateStore;

  beforeEach(() => {
    store = new InMemoryCandidateStore();
  });

  describe("S1 + S2 + S3 + S4: add", () => {
    it("S1: stores a proposed candidate", () => {
      const c = makeCandidate();
      const stored = store.add(c);
      expect(stored.id).toBe(c.id);
      expect(store.size()).toBe(1);
    });

    it("S2: rejects a non-proposed candidate", () => {
      expect(() => store.add(makeCandidate({ status: "approved" }))).toThrow();
      try {
        store.add(makeCandidate({ status: "approved" }));
      } catch (e) {
        expect(isContractValidationError(e)).toBe(true);
      }
    });

    it("S3: rejects a candidate with non-existent supersedesCandidateId", () => {
      const bad = makeCandidate({
        changeKind: "update",
        supersedesCandidateId: asCandidateId("nonexistent"),
      });
      expect(() => store.add(bad)).toThrow();
    });

    it("S4: rejects a duplicate id", () => {
      store.add(makeCandidate());
      expect(() => store.add(makeCandidate())).toThrow();
    });
  });

  describe("S5 + S6: get", () => {
    it("S5: returns the candidate with status preserved", () => {
      const c = makeCandidate();
      store.add(c);
      const retrieved = store.get(c.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.status).toBe("proposed");
    });

    it("S6: returns undefined for unknown ids", () => {
      expect(store.get(asCandidateId("nonexistent"))).toBeUndefined();
    });
  });

  describe("S7: list", () => {
    it("returns all candidates in insertion order", () => {
      store.add(makeCandidate({ id: asCandidateId("c-1") }));
      store.add(makeCandidate({ id: asCandidateId("c-2") }));
      store.add(makeCandidate({ id: asCandidateId("c-3") }));
      const list = store.list();
      expect(list).toHaveLength(3);
      expect(list[0]!.id).toBe("c-1");
      expect(list[1]!.id).toBe("c-2");
      expect(list[2]!.id).toBe("c-3");
    });
  });

  describe("S8 + S9 + S10 + S11: transition", () => {
    it("S8: transitions proposed → under_review", () => {
      const c = makeCandidate();
      store.add(c);
      const updated = store.transition(c.id, "under_review", {
        at: "2024-01-02T00:00:00Z",
        actor: "bob",
        reason: "Starting review",
      });
      expect(updated.status).toBe("under_review");
    });

    it("S9: transitions under_review → approved", () => {
      const c = makeCandidate();
      store.add(c);
      store.transition(c.id, "under_review", {
        at: "x",
        actor: "x",
        reason: "x",
      });
      const approved = store.transition(c.id, "approved", {
        at: "x",
        actor: "carol",
        reason: "Approved",
      });
      expect(approved.status).toBe("approved");
    });

    it("S10: transitions approved → superseded", () => {
      const c = makeCandidate();
      store.add(c);
      store.transition(c.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(c.id, "approved", { at: "x", actor: "x", reason: "x" });
      const superseded = store.transition(c.id, "superseded", {
        at: "x",
        actor: "dave",
        reason: "Superseded by v1.1",
      });
      expect(superseded.status).toBe("superseded");
    });

    it("S11: transitions approved → under_review (rollback)", () => {
      const c = makeCandidate();
      store.add(c);
      store.transition(c.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(c.id, "approved", { at: "x", actor: "x", reason: "x" });
      const rolledBack = store.transition(c.id, "under_review", {
        at: "x",
        actor: "eve",
        reason: "Issues found post-approval; rolling back",
      });
      expect(rolledBack.status).toBe("under_review");
    });
  });

  describe("S12 + S13: transition failures", () => {
    it("S12: rejects forbidden transitions", () => {
      const c = makeCandidate();
      store.add(c);
      // proposed → approved is forbidden
      expect(() =>
        store.transition(c.id, "approved", { at: "x", actor: "x", reason: "x" }),
      ).toThrow();
      try {
        store.transition(c.id, "approved", { at: "x", actor: "x", reason: "x" });
      } catch (e) {
        expect(e).toBeInstanceOf(IllegalCandidateTransitionError);
      }
    });

    it("S13: rejects transition for unknown id", () => {
      expect(() =>
        store.transition(asCandidateId("nonexistent"), "under_review", {
          at: "x",
          actor: "x",
          reason: "x",
        }),
      ).toThrow();
    });
  });

  describe("S14: transition appends to the review trail", () => {
    it("each transition adds exactly one review entry", () => {
      const c = makeCandidate();
      store.add(c);
      store.transition(c.id, "under_review", { at: "x", actor: "a", reason: "1" });
      store.transition(c.id, "approved", { at: "x", actor: "b", reason: "2" });
      const final = store.get(c.id)!;
      // 2 transitions → 2 trail entries
      expect(final.provenance.reviewTrail).toHaveLength(2);
    });

    it("the review trail records actor + reason for each transition", () => {
      const c = makeCandidate();
      store.add(c);
      store.transition(c.id, "under_review", {
        at: "2024-01-02T00:00:00Z",
        actor: "reviewer-alice",
        reason: "Initial review",
      });
      const trail = store.get(c.id)!.provenance.reviewTrail!;
      expect(trail[0]?.actor).toBe("reviewer-alice");
      expect(trail[0]?.reason).toBe("Initial review");
    });
  });

  describe("S15: getVersionChain", () => {
    it("returns an empty array when no candidates exist for the asset", () => {
      expect(store.getVersionChain("nonexistent-asset")).toEqual([]);
    });

    it("returns a single-element chain for a lone candidate", () => {
      const c = makeCandidate({ assetId: "skill-1" });
      store.add(c);
      const chain = store.getVersionChain("skill-1");
      expect(chain).toHaveLength(1);
      expect(chain[0]!.id).toBe(c.id);
    });

    it("returns the chain in newest-first order", () => {
      // Create the original candidate
      const v1 = makeCandidate({
        id: asCandidateId("cand-v1"),
        assetId: "skill-1",
        proposedAt: "2024-01-01T00:00:00Z",
      });
      store.add(v1);
      // Approve v1
      store.transition(v1.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v1.id, "approved", { at: "x", actor: "x", reason: "x" });

      // Create v2 that supersedes v1
      const v2 = makeCandidate({
        id: asCandidateId("cand-v2"),
        assetId: "skill-1",
        proposedAt: "2024-01-02T00:00:00Z",
        changeKind: "update",
        supersedesCandidateId: asCandidateId("cand-v1"),
      });
      store.add(v2);
      // Approve v2
      store.transition(v2.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v2.id, "approved", { at: "x", actor: "x", reason: "x" });

      const chain = store.getVersionChain("skill-1");
      expect(chain).toHaveLength(2);
      // Newest first
      expect(chain[0]!.id).toBe("cand-v2");
      expect(chain[1]!.id).toBe("cand-v1");
      // Verify chain links
      expect(chain[0]!.supersedesCandidateId).toBe("cand-v1");
    });
  });

  describe("S16: getActiveApproved", () => {
    it("returns undefined when no approved candidates exist", () => {
      store.add(makeCandidate({ assetId: "skill-1" }));
      expect(store.getActiveApproved("skill-1")).toBeUndefined();
    });

    it("returns the approved candidate when one is approved", () => {
      const c = makeCandidate({ assetId: "skill-1" });
      store.add(c);
      store.transition(c.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(c.id, "approved", { at: "x", actor: "x", reason: "x" });
      const active = store.getActiveApproved("skill-1");
      expect(active).toBeDefined();
      expect(active!.id).toBe(c.id);
    });

    it("returns the newest non-superseded approved candidate", () => {
      const v1 = makeCandidate({
        id: asCandidateId("cand-v1"),
        assetId: "skill-1",
        proposedAt: "2024-01-01T00:00:00Z",
      });
      store.add(v1);
      store.transition(v1.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v1.id, "approved", { at: "x", actor: "x", reason: "x" });

      const v2 = makeCandidate({
        id: asCandidateId("cand-v2"),
        assetId: "skill-1",
        proposedAt: "2024-01-02T00:00:00Z",
        changeKind: "update",
        supersedesCandidateId: asCandidateId("cand-v1"),
      });
      store.add(v2);
      store.transition(v2.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v2.id, "approved", { at: "x", actor: "x", reason: "x" });
      // Mark v1 as superseded
      store.transition(v1.id, "superseded", { at: "x", actor: "x", reason: "superseded by v2" });

      const active = store.getActiveApproved("skill-1");
      expect(active).toBeDefined();
      expect(active!.id).toBe("cand-v2");
    });
  });

  describe("S17: external mutation does NOT corrupt the store", () => {
    it("mutating a returned record does not affect the stored record", () => {
      const c = makeCandidate();
      store.add(c);
      const retrieved = store.get(c.id)!;
      (retrieved as { rationale: string }).rationale = "TAMPERED";
      const fresh = store.get(c.id)!;
      expect(fresh.rationale).toBe("Initial creation.");
    });

    it("mutating a record from list() does not affect the stored record", () => {
      const c = makeCandidate();
      store.add(c);
      const [listItem] = store.list();
      (listItem as { rationale: string }).rationale = "TAMPERED";
      const fresh = store.get(c.id)!;
      expect(fresh.rationale).toBe("Initial creation.");
    });
  });

  describe("S18: size", () => {
    it("returns the count", () => {
      expect(store.size()).toBe(0);
      store.add(makeCandidate({ id: asCandidateId("c-1") }));
      expect(store.size()).toBe(1);
      store.add(makeCandidate({ id: asCandidateId("c-2") }));
      expect(store.size()).toBe(2);
    });
  });
});
