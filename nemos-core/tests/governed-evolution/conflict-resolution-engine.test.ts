/**
 * Stage H — ConflictResolutionEngine tests.
 *
 * Verifies:
 *   CE1: trySupersede succeeds when there's no conflict.
 *   CE2: trySupersede records the supersede in the DecisionLog.
 *   CE3: trySupersede rejects with conflict when old is already superseded.
 *   CE4: trySupersede rejects with conflict on stale baseline.
 *   CE5: trySupersede rejects with conflict on missing candidate.
 *   CE6: trySupersede rejects with conflict on wrong supersedes link.
 *   CE7: trySupersede records the rejection in the DecisionLog.
 *   CE8: concurrent candidates for the same asset — only ONE can win.
 *   CE9: detectBaselineDrift returns 'fresh' for a fresh candidate.
 *   CE10: detectBaselineDrift returns 'stale' for a stale candidate.
 *   CE11: the underlying engine remains usable directly.
 *   CE12: getConflictDetector + getDecisionLog expose the components.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DefaultConflictResolutionEngine,
} from "../../src/governed-evolution/conflict-resolution-engine.js";
import {
  DefaultGovernedEvolutionEngine,
  DEFAULT_GOVERNED_RULES,
} from "../../src/governed-evolution/governed-evolution-engine.js";
import { InMemoryCandidateStore } from "../../src/governed-evolution/candidate-store.js";
import { InMemoryDecisionLog } from "../../src/governed-evolution/decision-log.js";
import type { CandidateRecord } from "../../src/schemas/candidate.js";
import { asCandidateId } from "../../src/core/identifiers.js";

function makeCandidate(overrides: Partial<CandidateRecord> = {}): CandidateRecord {
  return {
    id: asCandidateId("c-1"),
    assetKind: "skill",
    assetId: "skill-1",
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
    rationale: "Initial",
    reviewTrail: [],
    ...overrides,
  };
}

describe("Stage H — ConflictResolutionEngine", () => {
  let store: InMemoryCandidateStore;
  let engine: DefaultGovernedEvolutionEngine;
  let conflictEngine: DefaultConflictResolutionEngine;

  beforeEach(() => {
    store = new InMemoryCandidateStore();
    engine = new DefaultGovernedEvolutionEngine(store, DEFAULT_GOVERNED_RULES);
    conflictEngine = new DefaultConflictResolutionEngine(engine, store);
  });

  // Helper: propose + review + approve a candidate
  function approveCandidate(
    e: DefaultGovernedEvolutionEngine,
    input: Parameters<DefaultGovernedEvolutionEngine["propose"]>[0],
  ): CandidateRecord {
    const c = e.propose(input);
    e.requestReview(c.id, "reviewer", "Review");
    const result = e.tryApprove(c.id, "reviewer", "LGTM");
    if (result.kind !== "approved") {
      throw new Error(`Approval failed: ${JSON.stringify(result)}`);
    }
    return e.getCandidate(c.id)!;
  }

  describe("CE1 + CE2: trySupersede succeeds", () => {
    it("CE1: succeeds when there's no conflict", () => {
      const v1 = approveCandidate(engine, {
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "v1" },
        proposedBy: "alice",
        rationale: "v1",
      });

      const v2 = approveCandidate(engine, {
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.1.0",
        changeKind: "update",
        content: { name: "v2" },
        proposedBy: "alice",
        rationale: "v2",
        supersedesCandidateId: v1.id,
        supersedesVersion: "1.0.0",
      });

      const result = conflictEngine.trySupersede(v1.id, v2.id, "owner", "v2 supersedes v1");
      expect(result.kind).toBe("succeeded");
      if (result.kind === "succeeded") {
        expect(result.oldCandidate.status).toBe("superseded");
        expect(result.newCandidate.status).toBe("approved");
      }
    });

    it("CE2: records the supersede in the DecisionLog", () => {
      const v1 = approveCandidate(engine, {
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "v1" },
        proposedBy: "alice",
        rationale: "v1",
      });
      const v2 = approveCandidate(engine, {
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.1.0",
        changeKind: "update",
        content: { name: "v2" },
        proposedBy: "alice",
        rationale: "v2",
        supersedesCandidateId: v1.id,
        supersedesVersion: "1.0.0",
      });

      conflictEngine.trySupersede(v1.id, v2.id, "owner-bob", "v2 supersedes v1");

      const log = conflictEngine.getDecisionLog();
      const entries = log.listByKind("supersede");
      expect(entries).toHaveLength(1);
      expect(entries[0]!.actor).toBe("owner-bob");
      expect(entries[0]!.oldCandidateId).toBe(v1.id);
      expect(entries[0]!.newCandidateId).toBe(v2.id);
      expect(entries[0]!.reason).toBe("v2 supersedes v1");
    });
  });

  describe("CE3: trySupersede rejects when old is already superseded", () => {
    it("CE3: trySupersede on an already-superseded old returns conflict", () => {
      // Use the engine to build the scenario properly
      const v1 = approveCandidate(engine, {
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "v1" },
        proposedBy: "alice",
        rationale: "v1",
      });
      const v2 = approveCandidate(engine, {
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.1.0",
        changeKind: "update",
        content: { name: "v2" },
        proposedBy: "alice",
        rationale: "v2",
        supersedesCandidateId: v1.id,
        supersedesVersion: "1.0.0",
      });

      // First supersede: succeeds
      conflictEngine.trySupersede(v1.id, v2.id, "owner", "v2 supersedes v1");

      // Now try to supersede v1 with v2 AGAIN — should fail because v1 is already superseded
      const result = conflictEngine.trySupersede(v1.id, v2.id, "owner", "try again");
      expect(result.kind).toBe("conflict");
      if (result.kind === "conflict") {
        // Either already_superseded (v1 is now superseded) or not_approved
        expect(["already_superseded", "not_approved"]).toContain(result.conflict.kind);
      }
    });
  });

  describe("CE4: trySupersede rejects on stale baseline", () => {
    it("returns conflict with kind=stale_baseline", () => {
      const v1 = approveCandidate(engine, {
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "v1" },
        proposedBy: "alice",
        rationale: "v1",
      });

      // v2 has a WRONG supersedesVersion (doesn't match v1.proposedVersion)
      const v2 = makeCandidate({
        id: asCandidateId("v2"),
        assetId: "skill-1",
        proposedVersion: "1.1.0",
        changeKind: "update",
        supersedesCandidateId: v1.id,
        supersedesVersion: "0.9.0", // WRONG
      });
      store.add(v2);
      store.transition(v2.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v2.id, "approved", { at: "x", actor: "x", reason: "x" });

      const result = conflictEngine.trySupersede(v1.id, v2.id, "owner", "stale baseline");
      expect(result.kind).toBe("conflict");
      if (result.kind === "conflict") {
        expect(result.conflict.kind).toBe("stale_baseline");
      }
    });
  });

  describe("CE5: trySupersede rejects on missing candidate", () => {
    it("returns conflict with kind=missing_candidate", () => {
      const result = conflictEngine.trySupersede(
        asCandidateId("nonexistent-old"),
        asCandidateId("nonexistent-new"),
        "owner",
        "x",
      );
      expect(result.kind).toBe("conflict");
      if (result.kind === "conflict") {
        expect(result.conflict.kind).toBe("missing_candidate");
      }
    });
  });

  describe("CE6: trySupersede rejects on wrong supersedes link", () => {
    it("returns conflict with kind=wrong_supersedes_link", () => {
      const v1 = approveCandidate(engine, {
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "v1" },
        proposedBy: "alice",
        rationale: "v1",
      });
      // v2 is approved but doesn't supersede v1 (it's a separate create)
      const v2 = approveCandidate(engine, {
        assetKind: "skill",
        assetId: "skill-2", // different asset
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "v2" },
        proposedBy: "alice",
        rationale: "v2",
      });

      const result = conflictEngine.trySupersede(v1.id, v2.id, "owner", "wrong link");
      expect(result.kind).toBe("conflict");
      if (result.kind === "conflict") {
        expect(result.conflict.kind).toBe("wrong_supersedes_link");
      }
    });
  });

  describe("CE7: rejection is recorded in the DecisionLog", () => {
    it("records a conflict_resolution entry when the supersede is rejected", () => {
      // Trigger a rejection (missing candidate)
      conflictEngine.trySupersede(
        asCandidateId("nonexistent"),
        asCandidateId("also-nonexistent"),
        "alice",
        "try",
      );
      const log = conflictEngine.getDecisionLog();
      const conflicts = log.listByKind("conflict_resolution");
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]!.actor).toBe("alice");
    });

    it("records a stale_baseline_rejection entry when the baseline is stale", () => {
      const v1 = approveCandidate(engine, {
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "v1" },
        proposedBy: "alice",
        rationale: "v1",
      });
      const v2 = makeCandidate({
        id: asCandidateId("v2"),
        assetId: "skill-1",
        proposedVersion: "1.1.0",
        changeKind: "update",
        supersedesCandidateId: v1.id,
        supersedesVersion: "0.9.0", // WRONG
      });
      store.add(v2);
      store.transition(v2.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v2.id, "approved", { at: "x", actor: "x", reason: "x" });

      conflictEngine.trySupersede(v1.id, v2.id, "owner", "stale");

      const log = conflictEngine.getDecisionLog();
      const staleEntries = log.listByKind("stale_baseline_rejection");
      expect(staleEntries).toHaveLength(1);
      expect(staleEntries[0]!.conflict?.kind).toBe("stale_baseline");
    });
  });

  describe("CE8: concurrent candidates for the same asset — only ONE can win", () => {
    it("two candidates supersede v1; only the first supersede succeeds", () => {
      const v1 = approveCandidate(engine, {
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "v1" },
        proposedBy: "alice",
        rationale: "v1",
      });
      const v2 = approveCandidate(engine, {
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.1.0",
        changeKind: "update",
        content: { name: "v2" },
        proposedBy: "alice",
        rationale: "v2",
        supersedesCandidateId: v1.id,
        supersedesVersion: "1.0.0",
      });
      const v3 = makeCandidate({
        id: asCandidateId("v3"),
        assetId: "skill-1",
        proposedVersion: "1.2.0",
        changeKind: "update",
        supersedesCandidateId: v1.id,
        supersedesVersion: "1.0.0",
      });
      store.add(v3);
      store.transition(v3.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v3.id, "approved", { at: "x", actor: "x", reason: "x" });

      // First supersede: succeeds (v2 wins)
      const result1 = conflictEngine.trySupersede(v1.id, v2.id, "owner", "v2 supersedes v1");
      expect(result1.kind).toBe("succeeded");

      // Second supersede: should FAIL because v1 is already superseded by v2
      const result2 = conflictEngine.trySupersede(v1.id, v3.id, "owner", "v3 tries to supersede v1");
      expect(result2.kind).toBe("conflict");
      if (result2.kind === "conflict") {
        // The conflict is either already_superseded or not_approved
        expect(["already_superseded", "not_approved"]).toContain(result2.conflict.kind);
      }

      // CRITICAL INVARIANT: only ONE active approved exists for the asset
      const active = store.getActiveApproved("skill-1");
      expect(active).toBeDefined();
      expect(active!.id).toBe(v2.id);
    });
  });

  describe("CE9 + CE10: detectBaselineDrift", () => {
    it("CE9: returns 'fresh' for a candidate whose baseline matches", () => {
      const v1 = approveCandidate(engine, {
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "v1" },
        proposedBy: "alice",
        rationale: "v1",
      });

      // v2 supersedes v1 (but not yet superseded)
      const v2 = makeCandidate({
        id: asCandidateId("v2"),
        assetId: "skill-1",
        proposedVersion: "1.1.0",
        changeKind: "update",
        supersedesCandidateId: v1.id,
        supersedesVersion: "1.0.0",
      });
      store.add(v2);

      // v1 is still the active approved; v2's baseline (v1) is still active
      const drift = conflictEngine.detectBaselineDrift(v2.id);
      expect(drift.kind).toBe("fresh");
    });

    it("CE10: returns 'stale' when the baseline has moved", () => {
      const v1 = approveCandidate(engine, {
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "v1" },
        proposedBy: "alice",
        rationale: "v1",
      });
      const v2 = approveCandidate(engine, {
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.1.0",
        changeKind: "update",
        content: { name: "v2" },
        proposedBy: "alice",
        rationale: "v2",
        supersedesCandidateId: v1.id,
        supersedesVersion: "1.0.0",
      });

      // v3 was proposed to supersede v1 (the original baseline)
      const v3 = makeCandidate({
        id: asCandidateId("v3"),
        assetId: "skill-1",
        proposedVersion: "1.2.0",
        changeKind: "update",
        supersedesCandidateId: v1.id,
        supersedesVersion: "1.0.0",
      });
      store.add(v3);

      // Now supersede v1 with v2 (v2 becomes the active)
      conflictEngine.trySupersede(v1.id, v2.id, "owner", "v2 supersedes v1");

      // v3's baseline was v1, but v1 is now superseded by v2
      // → v3's baseline has drifted
      const drift = conflictEngine.detectBaselineDrift(v3.id);
      expect(drift.kind).toBe("stale");
      if (drift.kind === "stale") {
        expect(drift.currentActiveVersion).toBe("1.1.0"); // v2's version
      }
    });

    it("returns 'fresh' for a candidate that doesn't supersede anything (create)", () => {
      const v1 = approveCandidate(engine, {
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "v1" },
        proposedBy: "alice",
        rationale: "v1",
      });

      const drift = conflictEngine.detectBaselineDrift(v1.id);
      expect(drift.kind).toBe("fresh");
    });
  });

  describe("CE11 + CE12: component access", () => {
    it("CE11: the underlying engine remains usable directly", () => {
      const v1 = engine.propose({
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "v1" },
        proposedBy: "alice",
        rationale: "v1",
      });
      expect(v1.status).toBe("proposed");
    });

    it("CE12: getConflictDetector + getDecisionLog expose the components", () => {
      expect(conflictEngine.getConflictDetector()).toBeDefined();
      expect(conflictEngine.getDecisionLog()).toBeDefined();
      expect(typeof conflictEngine.getDecisionLog().list).toBe("function");
    });
  });
});
