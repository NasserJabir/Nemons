/**
 * Stage F — End-to-end Governed Evolution integration test.
 *
 * Verifies the full lifecycle of governed evolution:
 *
 *   v1 proposed → requestReview → approve (with separation of duties)
 *   → v2 proposed (supersedes v1) → requestReview → approve
 *   → supersede v1 with v2
 *   → rollback v2 (re-evaluation)
 *   → propose v3 (supersedes v2) → requestReview → approve
 *   → supersede v2 with v3
 *
 * Architectural principles enforced:
 *   - "A candidate change cannot become approved without satisfying
 *     the required governance rules."
 *   - "No silent mutation": all transitions are audited.
 *   - Version chains: tracked and queryable.
 *   - Rollback: reverts approved candidates to under_review with audit.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DefaultGovernedEvolutionEngine,
  DEFAULT_GOVERNED_RULES,
} from "../../src/governed-evolution/governed-evolution-engine.js";
import type { GovernedRules } from "../../src/governed-evolution/governed-evolution-engine.js";
import { InMemoryCandidateStore } from "../../src/governed-evolution/candidate-store.js";

describe("Stage F — end-to-end governed evolution", () => {
  let store: InMemoryCandidateStore;
  let engine: DefaultGovernedEvolutionEngine;

  beforeEach(() => {
    store = new InMemoryCandidateStore();
    engine = new DefaultGovernedEvolutionEngine(store, DEFAULT_GOVERNED_RULES);
  });

  describe("full version chain lifecycle", () => {
    it("exercises propose → review → approve → supersede → rollback → re-approve", () => {
      // ─── v1: propose → requestReview → approve ───

      const v1 = engine.propose({
        assetKind: "skill",
        assetId: "skill-run-tests",
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "run-tests", description: "Initial version" },
        proposedBy: "alice",
        rationale: "Initial creation of the run-tests skill.",
      });
      expect(v1.status).toBe("proposed");
      expect(v1.provenance.kind).toBe("observed"); // starts as observed

      engine.requestReview(v1.id, "bob", "Starting review for v1");
      // bob approves v1 (bob ≠ alice, separation of duties satisfied)
      const v1Approval = engine.tryApprove(v1.id, "bob", "LGTM");
      expect(v1Approval.kind).toBe("approved");

      // ─── v2: propose (supersedes v1) → requestReview → approve ───

      const v2 = engine.propose({
        assetKind: "skill",
        assetId: "skill-run-tests",
        proposedVersion: "1.1.0",
        changeKind: "update",
        content: { name: "run-tests", description: "Added coverage support" },
        proposedBy: "alice",
        rationale: "Add coverage support to run-tests.",
        supersedesCandidateId: v1.id,
        supersedesVersion: "1.0.0",
      });
      expect(v2.status).toBe("proposed");
      expect(v2.supersedesCandidateId).toBe(v1.id);

      engine.requestReview(v2.id, "carol", "Starting review for v2");
      const v2Approval = engine.tryApprove(v2.id, "carol", "LGTM, coverage addition is sound");
      expect(v2Approval.kind).toBe("approved");

      // ─── Supersede v1 with v2 ───

      const supersedeResult = engine.supersede(v1.id, v2.id, "dave", "v2 supersedes v1");
      expect(supersedeResult.oldCandidate.status).toBe("superseded");
      expect(supersedeResult.newCandidate.status).toBe("approved");

      // ─── Verify version chain ───

      const chain = engine.getVersionChain("skill-run-tests");
      expect(chain).toHaveLength(2);
      expect(chain[0]!.id).toBe(v2.id); // newest first
      expect(chain[1]!.id).toBe(v1.id);
      expect(chain[0]!.supersedesCandidateId).toBe(v1.id);

      // ─── Verify active approved is v2 ───

      const active = engine.getActiveApproved("skill-run-tests");
      expect(active).toBeDefined();
      expect(active!.id).toBe(v2.id);
      expect(active!.proposedVersion).toBe("1.1.0");

      // ─── Rollback v2 (re-evaluation) ───

      const rolledBack = engine.rollback(v2.id, "eve", "Issues found in coverage tests post-approval");
      expect(rolledBack.status).toBe("under_review");
      // The active approved is now undefined (v2 is back to under_review)
      const activeAfterRollback = engine.getActiveApproved("skill-run-tests");
      expect(activeAfterRollback).toBeUndefined();

      // ─── v3: propose (supersedes v2) → requestReview → approve ───

      // But wait — v2 is now under_review, NOT approved. The engine
      // rejects proposing a candidate that supersedes a non-approved
      // candidate. So we need to re-approve v2 first OR propose v3
      // with supersedesCandidateId set to v1 (still approved before
      // v2 was approved? No — v1 was superseded when v2 was approved).
      //
      // Actually, this is a design tension: after rolling back v2,
      // there's no "active approved" anymore. The engine requires
      // a candidate be approved before it can be superseded.
      //
      // So we need to RE-APPROVE v2 first (it's back in under_review).
      const v2ReApproval = engine.tryApprove(v2.id, "frank", "Re-approval after rollback fix");
      expect(v2ReApproval.kind).toBe("approved");

      // Now propose v3 that supersedes v2
      const v3 = engine.propose({
        assetKind: "skill",
        assetId: "skill-run-tests",
        proposedVersion: "1.2.0",
        changeKind: "update",
        content: { name: "run-tests", description: "Fixed coverage issues + added watch mode" },
        proposedBy: "alice",
        rationale: "Fix coverage issues found in v2 + add watch mode.",
        supersedesCandidateId: v2.id,
        supersedesVersion: "1.1.0",
      });
      engine.requestReview(v3.id, "grace", "Review for v3");
      const v3Approval = engine.tryApprove(v3.id, "grace", "LGTM, fixes look good");
      expect(v3Approval.kind).toBe("approved");

      // Supersede v2 with v3
      engine.supersede(v2.id, v3.id, "henry", "v3 supersedes v2");

      // ─── Final verification ───

      const finalChain = engine.getVersionChain("skill-run-tests");
      expect(finalChain).toHaveLength(3);
      expect(finalChain[0]!.id).toBe(v3.id);
      expect(finalChain[1]!.id).toBe(v2.id);
      expect(finalChain[2]!.id).toBe(v1.id);

      const finalActive = engine.getActiveApproved("skill-run-tests");
      expect(finalActive).toBeDefined();
      expect(finalActive!.id).toBe(v3.id);
      expect(finalActive!.proposedVersion).toBe("1.2.0");

      // v1 and v2 are superseded; v3 is the active approved
      expect(engine.getCandidate(v1.id)!.status).toBe("superseded");
      expect(engine.getCandidate(v2.id)!.status).toBe("superseded");
      expect(engine.getCandidate(v3.id)!.status).toBe("approved");

      // The store has 3 candidates total
      expect(store.size()).toBe(3);
    });
  });

  describe("architectural invariant: 'A candidate change cannot become approved without satisfying the required governance rules'", () => {
    it("a candidate without any reviewer approvals is NOT approved", () => {
      const c = engine.propose({
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "run-tests" },
        proposedBy: "alice",
        rationale: "Initial",
      });
      engine.requestReview(c.id, "bob", "Review please");

      // Alice (the proposer) tries to approve her own — DENIED
      const selfApproval = engine.tryApprove(c.id, "alice", "I approve my own");
      expect(selfApproval.kind).toBe("denied");

      // The candidate is still in under_review
      expect(engine.getCandidate(c.id)!.status).toBe("under_review");
    });

    it("a candidate with separation-of-duties violation stays under_review", () => {
      const c = engine.propose({
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "run-tests" },
        proposedBy: "alice",
        rationale: "Initial",
      });
      engine.requestReview(c.id, "bob", "Review");

      // alice tries to approve — DENIED
      engine.tryApprove(c.id, "alice", "self-approve");
      expect(engine.getCandidate(c.id)!.status).toBe("under_review");
    });

    it("with minimumReviewers=2, single approver is DENIED", () => {
      const strictRules: GovernedRules = {
        minimumReviewers: 2,
        requireSeparationOfDuties: true,
        requireEvidence: false,
      };
      const engine2 = new DefaultGovernedEvolutionEngine(store, strictRules);
      const c = engine2.propose({
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "run-tests" },
        proposedBy: "alice",
        rationale: "Initial",
      });
      engine2.requestReview(c.id, "bob", "Review");

      // Only bob approves → DENIED (need 2)
      engine2.tryApprove(c.id, "bob", "approved by bob");
      expect(engine2.getCandidate(c.id)!.status).toBe("under_review");
    });

    it("candidate with requireEvidence=true and no evidence is REJECTED at propose time", () => {
      const rules: GovernedRules = {
        minimumReviewers: 1,
        requireSeparationOfDuties: true,
        requireEvidence: true,
      };
      const engine2 = new DefaultGovernedEvolutionEngine(store, rules);
      expect(() =>
        engine2.propose({
          assetKind: "skill",
          assetId: "skill-1",
          proposedVersion: "1.0.0",
          changeKind: "create",
          content: { name: "run-tests" },
          proposedBy: "alice",
          rationale: "Initial",
          // no evidenceRefs
        }),
      ).toThrow();
    });

    it("candidate with contentValidator and invalid content is REJECTED at propose time", () => {
      const rules: GovernedRules = {
        minimumReviewers: 1,
        requireSeparationOfDuties: true,
        requireEvidence: false,
        contentValidator: (content) => {
          if (!("name" in content) || typeof content.name !== "string") {
            throw new Error("content.name is required");
          }
        },
      };
      const engine2 = new DefaultGovernedEvolutionEngine(store, rules);
      expect(() =>
        engine2.propose({
          assetKind: "skill",
          assetId: "skill-1",
          proposedVersion: "1.0.0",
          changeKind: "create",
          content: {}, // missing name
          proposedBy: "alice",
          rationale: "Initial",
        }),
      ).toThrow();
    });
  });

  describe("audit trail preservation", () => {
    it("the review trail records every transition with actor + reason", () => {
      const c = engine.propose({
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "run-tests" },
        proposedBy: "alice",
        rationale: "Initial",
      });
      engine.requestReview(c.id, "bob", "Review please");
      engine.tryApprove(c.id, "bob", "LGTM");

      const final = engine.getCandidate(c.id)!;
      const trail = final.provenance.reviewTrail;
      expect(trail.length).toBeGreaterThanOrEqual(2);

      // First entry: requestReview (proposed → under_review)
      expect(trail[0]!.actor).toBe("bob");
      expect(trail[0]!.reason).toContain("Review please");

      // Second entry: approve (under_review → approved)
      expect(trail[1]!.actor).toBe("bob");
      expect(trail[1]!.reason).toContain("LGTM");
    });

    it("rollback adds an audit entry to the review trail", () => {
      const c = engine.propose({
        assetKind: "skill",
        assetId: "skill-1",
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "run-tests" },
        proposedBy: "alice",
        rationale: "Initial",
      });
      engine.requestReview(c.id, "bob", "Review");
      engine.tryApprove(c.id, "bob", "LGTM");
      const trailBefore = engine.getCandidate(c.id)!.provenance.reviewTrail.length;

      engine.rollback(c.id, "carol", "Post-approval issues");
      const final = engine.getCandidate(c.id)!;
      expect(final.provenance.reviewTrail.length).toBe(trailBefore + 1);
      const lastEntry = final.provenance.reviewTrail[final.provenance.reviewTrail.length - 1]!;
      expect(lastEntry.actor).toBe("carol");
      expect(lastEntry.reason).toContain("Rollback");
      expect(lastEntry.reason).toContain("Post-approval issues");
    });
  });
});
