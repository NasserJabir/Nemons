/**
 * Stage H — ConflictDetector tests.
 *
 * Verifies the conflict detection logic for the supersede operation:
 *   CD1: no_conflict when both candidates are approved + linked correctly.
 *   CD2: missing_candidate when the old candidate doesn't exist.
 *   CD3: missing_candidate when the new candidate doesn't exist.
 *   CD4: not_approved when the old candidate is not approved.
 *   CD5: not_approved when the new candidate is not approved.
 *   CD6: already_superseded when the old candidate is superseded.
 *   CD7: wrong_supersedes_link when the new candidate doesn't supersede the old.
 *   CD8: stale_baseline when the new candidate's supersedesVersion doesn't match.
 *   CD9: isConflict helper.
 *   CD10: describeConflict helper.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DefaultConflictDetector,
  isConflict,
  describeConflict,
} from "../../src/governed-evolution/conflict-detector.js";
import { InMemoryCandidateStore } from "../../src/governed-evolution/candidate-store.js";
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

describe("Stage H — ConflictDetector", () => {
  let store: InMemoryCandidateStore;
  let detector: DefaultConflictDetector;

  beforeEach(() => {
    store = new InMemoryCandidateStore();
    detector = new DefaultConflictDetector(store);
  });

  describe("CD1: no_conflict when both are approved + linked correctly", () => {
    it("returns no_conflict", () => {
      const v1 = makeCandidate({ id: asCandidateId("v1") });
      store.add(v1);
      store.transition(v1.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v1.id, "approved", { at: "x", actor: "x", reason: "x" });

      const v2 = makeCandidate({
        id: asCandidateId("v2"),
        proposedVersion: "1.1.0",
        changeKind: "update",
        supersedesCandidateId: asCandidateId("v1"),
        supersedesVersion: "1.0.0",
      });
      store.add(v2);
      store.transition(v2.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v2.id, "approved", { at: "x", actor: "x", reason: "x" });

      const result = detector.detectConflict(asCandidateId("v1"), asCandidateId("v2"));
      expect(result.kind).toBe("no_conflict");
    });
  });

  describe("CD2 + CD3: missing_candidate", () => {
    it("CD2: returns missing_candidate when the old candidate doesn't exist", () => {
      const result = detector.detectConflict(asCandidateId("nonexistent"), asCandidateId("also-nonexistent"));
      expect(result.kind).toBe("missing_candidate");
      if (result.kind === "missing_candidate") {
        expect(result.missingRole).toBe("old");
      }
    });

    it("CD3: returns missing_candidate when the new candidate doesn't exist (but old exists)", () => {
      const v1 = makeCandidate({ id: asCandidateId("v1") });
      store.add(v1);
      store.transition(v1.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v1.id, "approved", { at: "x", actor: "x", reason: "x" });

      const result = detector.detectConflict(asCandidateId("v1"), asCandidateId("nonexistent"));
      expect(result.kind).toBe("missing_candidate");
      if (result.kind === "missing_candidate") {
        expect(result.missingRole).toBe("new");
      }
    });
  });

  describe("CD4 + CD5: not_approved", () => {
    it("CD4: returns not_approved when the old candidate is 'proposed' (new candidate exists)", () => {
      const v1 = makeCandidate({ id: asCandidateId("v1") });
      store.add(v1);
      // v1 is still 'proposed'

      // v2 also exists (but v2 doesn't supersede v1 — that's a different conflict)
      const v2 = makeCandidate({ id: asCandidateId("v2") });
      store.add(v2);

      const result = detector.detectConflict(asCandidateId("v1"), asCandidateId("v2"));
      // v1 is "proposed" (not approved) → not_approved (role: old)
      expect(result.kind).toBe("not_approved");
      if (result.kind === "not_approved") {
        expect(result.role).toBe("old");
        expect(result.status).toBe("proposed");
      }
    });

    it("CD5: returns not_approved when the new candidate is not approved (old is approved)", () => {
      const v1 = makeCandidate({ id: asCandidateId("v1") });
      store.add(v1);
      store.transition(v1.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v1.id, "approved", { at: "x", actor: "x", reason: "x" });

      const v2 = makeCandidate({
        id: asCandidateId("v2"),
        changeKind: "update",
        supersedesCandidateId: asCandidateId("v1"),
        supersedesVersion: "1.0.0",
      });
      store.add(v2);
      // v2 is still 'proposed' (not approved)

      const result = detector.detectConflict(asCandidateId("v1"), asCandidateId("v2"));
      expect(result.kind).toBe("not_approved");
      if (result.kind === "not_approved") {
        expect(result.role).toBe("new");
        expect(result.status).toBe("proposed");
      }
    });
  });

  describe("CD6: already_superseded", () => {
    it("returns already_superseded when the old candidate is superseded", () => {
      const v1 = makeCandidate({ id: asCandidateId("v1") });
      store.add(v1);
      store.transition(v1.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v1.id, "approved", { at: "x", actor: "x", reason: "x" });

      const v2 = makeCandidate({
        id: asCandidateId("v2"),
        proposedVersion: "1.1.0",
        changeKind: "update",
        supersedesCandidateId: asCandidateId("v1"),
        supersedesVersion: "1.0.0",
      });
      store.add(v2);
      store.transition(v2.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v2.id, "approved", { at: "x", actor: "x", reason: "x" });
      store.transition(v1.id, "superseded", { at: "x", actor: "x", reason: "v2 supersedes v1" });

      // Try to detect conflict for a v3 that would supersede v1
      // (v3 doesn't exist yet — but the detector only checks the old candidate)
      // For the already_superseded case, we need both candidates to exist.
      // Let's add a v3:
      const v3 = makeCandidate({
        id: asCandidateId("v3"),
        proposedVersion: "1.2.0",
        changeKind: "update",
        supersedesCandidateId: asCandidateId("v1"),
        supersedesVersion: "1.0.0",
      });
      // v3 must supersede v1, but v1 is superseded, so the engine would
      // reject the propose. We add v3 directly to the store via the
      // candidate-store's add (which checks supersedesCandidateId existence
      // but NOT status). Actually, the candidate-store's add doesn't check
      // the superseded status either — it just checks existence.
      // But the test expects already_superseded from the conflict detector.
      // Let me use a simpler approach: directly construct the v3 record
      // and bypass the store's checks by... hmm, the InMemoryCandidateStore.add
      // doesn't allow direct insertion. Let me think.
      //
      // Actually, the InMemoryCandidateStore.add DOES require supersedesCandidateId
      // to exist, but doesn't require it to be approved. So we can add v3
      // with supersedesCandidateId=v1 (which exists, but is superseded).
      store.add(v3);
      store.transition(v3.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v3.id, "approved", { at: "x", actor: "x", reason: "x" });

      const result = detector.detectConflict(asCandidateId("v1"), asCandidateId("v3"));
      expect(result.kind).toBe("already_superseded");
    });
  });

  describe("CD7: wrong_supersedes_link", () => {
    it("returns wrong_supersedes_link when the new candidate doesn't supersede the old", () => {
      const v1 = makeCandidate({ id: asCandidateId("v1") });
      store.add(v1);
      store.transition(v1.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v1.id, "approved", { at: "x", actor: "x", reason: "x" });

      // v2a is also approved but doesn't supersede v1 (it's a separate create)
      const v2a = makeCandidate({
        id: asCandidateId("v2a"),
        assetId: "skill-2", // different asset
      });
      store.add(v2a);
      store.transition(v2a.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v2a.id, "approved", { at: "x", actor: "x", reason: "x" });

      // Try to supersede v1 with v2a — v2a.supersedesCandidateId is undefined (not v1)
      const result = detector.detectConflict(asCandidateId("v1"), asCandidateId("v2a"));
      expect(result.kind).toBe("wrong_supersedes_link");
      if (result.kind === "wrong_supersedes_link") {
        expect(result.expectedSupersedesId).toBe("v1");
      }
    });
  });

  describe("CD8: stale_baseline", () => {
    it("returns stale_baseline when supersedesVersion doesn't match", () => {
      const v1 = makeCandidate({
        id: asCandidateId("v1"),
        proposedVersion: "1.0.0",
      });
      store.add(v1);
      store.transition(v1.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v1.id, "approved", { at: "x", actor: "x", reason: "x" });

      // v2 supersedes v1, but its supersedesVersion says "0.9.0" (wrong baseline)
      const v2 = makeCandidate({
        id: asCandidateId("v2"),
        proposedVersion: "1.1.0",
        changeKind: "update",
        supersedesCandidateId: asCandidateId("v1"),
        supersedesVersion: "0.9.0", // WRONG — v1's proposedVersion is "1.0.0"
      });
      store.add(v2);
      store.transition(v2.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v2.id, "approved", { at: "x", actor: "x", reason: "x" });

      const result = detector.detectConflict(asCandidateId("v1"), asCandidateId("v2"));
      expect(result.kind).toBe("stale_baseline");
      if (result.kind === "stale_baseline") {
        // The expected baseline is v1's proposedVersion ("1.0.0")
        expect(result.expectedBaselineVersion).toBe("1.0.0");
        // The actual active approved is v2 (since v2 supersedes v1 and both are approved)
        expect(result.actualActiveVersion).toBe("1.1.0");
        expect(result.actualActiveId).toBe("v2");
      }
    });

    it("returns no_conflict when supersedesVersion matches", () => {
      const v1 = makeCandidate({
        id: asCandidateId("v1"),
        proposedVersion: "1.0.0",
      });
      store.add(v1);
      store.transition(v1.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v1.id, "approved", { at: "x", actor: "x", reason: "x" });

      const v2 = makeCandidate({
        id: asCandidateId("v2"),
        proposedVersion: "1.1.0",
        changeKind: "update",
        supersedesCandidateId: asCandidateId("v1"),
        supersedesVersion: "1.0.0", // CORRECT — matches v1's proposedVersion
      });
      store.add(v2);
      store.transition(v2.id, "under_review", { at: "x", actor: "x", reason: "x" });
      store.transition(v2.id, "approved", { at: "x", actor: "x", reason: "x" });

      const result = detector.detectConflict(asCandidateId("v1"), asCandidateId("v2"));
      expect(result.kind).toBe("no_conflict");
    });
  });

  describe("CD9: isConflict helper", () => {
    it("returns false for no_conflict", () => {
      expect(isConflict({ kind: "no_conflict" })).toBe(false);
    });

    it("returns true for any conflict kind", () => {
      expect(isConflict({ kind: "missing_candidate", missingId: asCandidateId("x"), missingRole: "old" })).toBe(true);
      expect(isConflict({ kind: "not_approved", candidateId: asCandidateId("x"), role: "old", status: "proposed" })).toBe(true);
      expect(isConflict({ kind: "already_superseded", oldCandidateId: asCandidateId("x"), currentStatus: "superseded" })).toBe(true);
    });
  });

  describe("CD10: describeConflict helper", () => {
    it("returns a human-readable description for each kind", () => {
      const noConflict = describeConflict({ kind: "no_conflict" });
      expect(noConflict).toContain("No conflict");

      const missing = describeConflict({
        kind: "missing_candidate",
        missingId: asCandidateId("c-1"),
        missingRole: "old",
      });
      expect(missing).toContain("Missing");
      expect(missing).toContain("c-1");

      const stale = describeConflict({
        kind: "stale_baseline",
        newCandidateId: asCandidateId("c-2"),
        expectedBaselineVersion: "1.0.0",
        actualActiveVersion: "1.1.0",
        actualActiveId: asCandidateId("c-3"),
      });
      expect(stale).toContain("Stale baseline");
      expect(stale).toContain("1.0.0");
      expect(stale).toContain("1.1.0");
    });
  });
});
