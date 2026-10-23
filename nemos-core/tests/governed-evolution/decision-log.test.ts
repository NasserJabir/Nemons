/**
 * Stage H — DecisionLog tests.
 *
 * Verifies:
 *   DL1: record adds an entry with auto-minted id + timestamp.
 *   DL2: list returns all entries in insertion order.
 *   DL3: listForCandidate returns entries involving the candidate.
 *   DL4: listForAsset returns entries for the asset.
 *   DL5: listByKind filters by decision kind.
 *   DL6: size returns the count.
 *   DL7: entries are append-only (no mutation API).
 *   DL8: external mutation of returned entries does NOT corrupt the log.
 *   DL9: every decision kind is supported.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryDecisionLog } from "../../src/governed-evolution/decision-log.js";
import type { DecisionKind } from "../../src/governed-evolution/decision-log.js";
import { asCandidateId } from "../../src/core/identifiers.js";

describe("Stage H — DecisionLog", () => {
  let log: InMemoryDecisionLog;

  beforeEach(() => {
    log = new InMemoryDecisionLog();
  });

  describe("DL1 + DL2: record + list", () => {
    it("DL1: record adds an entry with auto-minted id + timestamp", () => {
      const entry = log.record({
        kind: "approval",
        actor: "alice",
        candidateId: asCandidateId("c-1"),
        assetId: "skill-1",
        reason: "LGTM",
      });
      expect(entry.id).toBeDefined();
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(entry.kind).toBe("approval");
      expect(entry.actor).toBe("alice");
      expect(entry.reason).toBe("LGTM");
    });

    it("DL2: list returns all entries in insertion order", () => {
      log.record({ kind: "approval", actor: "a", reason: "1" });
      log.record({ kind: "rejection", actor: "b", reason: "2" });
      log.record({ kind: "supersede", actor: "c", reason: "3" });
      const list = log.list();
      expect(list).toHaveLength(3);
      expect(list[0]!.reason).toBe("1");
      expect(list[1]!.reason).toBe("2");
      expect(list[2]!.reason).toBe("3");
    });

    it("100 records have distinct ids", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const entry = log.record({ kind: "approval", actor: "a", reason: `entry-${i}` });
        ids.add(entry.id);
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("DL3: listForCandidate", () => {
    it("returns entries involving the candidate (as candidateId, oldCandidateId, or newCandidateId)", () => {
      log.record({
        kind: "approval",
        actor: "a",
        candidateId: asCandidateId("c-1"),
        reason: "approve c-1",
      });
      log.record({
        kind: "supersede",
        actor: "b",
        oldCandidateId: asCandidateId("c-1"),
        newCandidateId: asCandidateId("c-2"),
        reason: "c-2 supersedes c-1",
      });
      log.record({
        kind: "approval",
        actor: "c",
        candidateId: asCandidateId("c-3"),
        reason: "approve c-3 (unrelated)",
      });

      const c1Entries = log.listForCandidate(asCandidateId("c-1"));
      expect(c1Entries).toHaveLength(2); // approval + supersede
      const c2Entries = log.listForCandidate(asCandidateId("c-2"));
      expect(c2Entries).toHaveLength(1); // supersede (newCandidateId)
    });
  });

  describe("DL4: listForAsset", () => {
    it("returns entries for the asset", () => {
      log.record({
        kind: "approval",
        actor: "a",
        candidateId: asCandidateId("c-1"),
        assetId: "skill-A",
        reason: "x",
      });
      log.record({
        kind: "rejection",
        actor: "b",
        candidateId: asCandidateId("c-2"),
        assetId: "skill-B",
        reason: "y",
      });
      log.record({
        kind: "supersede",
        actor: "c",
        oldCandidateId: asCandidateId("c-1"),
        newCandidateId: asCandidateId("c-3"),
        assetId: "skill-A",
        reason: "z",
      });

      const skillA = log.listForAsset("skill-A");
      expect(skillA).toHaveLength(2);
      const skillB = log.listForAsset("skill-B");
      expect(skillB).toHaveLength(1);
    });
  });

  describe("DL5: listByKind", () => {
    it("filters by decision kind", () => {
      log.record({ kind: "approval", actor: "a", reason: "1" });
      log.record({ kind: "rejection", actor: "b", reason: "2" });
      log.record({ kind: "approval", actor: "c", reason: "3" });
      log.record({ kind: "supersede", actor: "d", reason: "4" });

      expect(log.listByKind("approval")).toHaveLength(2);
      expect(log.listByKind("rejection")).toHaveLength(1);
      expect(log.listByKind("supersede")).toHaveLength(1);
      expect(log.listByKind("rollback")).toHaveLength(0);
    });
  });

  describe("DL6: size", () => {
    it("returns the count", () => {
      expect(log.size()).toBe(0);
      log.record({ kind: "approval", actor: "a", reason: "1" });
      expect(log.size()).toBe(1);
      log.record({ kind: "approval", actor: "b", reason: "2" });
      expect(log.size()).toBe(2);
    });
  });

  describe("DL7: append-only (no mutation API)", () => {
    it("the DecisionLog interface only exposes record + list* + size (no delete/update)", () => {
      // This is a structural check — the interface must not have
      // delete/update methods.
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(log))
        .filter((m) => m !== "constructor");
      for (const m of methods) {
        expect(m).not.toBe("delete");
        expect(m).not.toBe("update");
        expect(m).not.toBe("remove");
        expect(m).not.toBe("clear");
      }
    });
  });

  describe("DL8: external mutation does NOT corrupt the log", () => {
    it("mutating a returned entry does not affect the stored entry", () => {
      const entry = log.record({ kind: "approval", actor: "alice", reason: "original" });
      (entry as { reason: string }).reason = "TAMPERED";
      const fresh = log.list()[0]!;
      expect(fresh.reason).toBe("original");
    });
  });

  describe("DL9: every decision kind is supported", () => {
    const allKinds: DecisionKind[] = [
      "approval",
      "rejection",
      "request_changes",
      "supersede",
      "conflict_resolution",
      "rollback",
      "stale_baseline_rejection",
    ];

    for (const kind of allKinds) {
      it(`supports kind: ${kind}`, () => {
        const entry = log.record({ kind, actor: "x", reason: `entry for ${kind}` });
        expect(entry.kind).toBe(kind);
        expect(log.listByKind(kind)).toHaveLength(1);
      });
    }
  });

  describe("conflict field", () => {
    it("the conflict field is preserved when provided", () => {
      const entry = log.record({
        kind: "stale_baseline_rejection",
        actor: "x",
        candidateId: asCandidateId("c-1"),
        reason: "stale baseline",
        conflict: {
          kind: "stale_baseline",
          newCandidateId: asCandidateId("c-1"),
          expectedBaselineVersion: "1.0.0",
          actualActiveVersion: "1.1.0",
          actualActiveId: asCandidateId("c-2"),
        },
      });
      expect(entry.conflict).toBeDefined();
      expect(entry.conflict?.kind).toBe("stale_baseline");
    });

    it("the conflict field is undefined when not provided", () => {
      const entry = log.record({
        kind: "approval",
        actor: "x",
        candidateId: asCandidateId("c-1"),
        reason: "approve",
      });
      expect(entry.conflict).toBeUndefined();
    });
  });
});
