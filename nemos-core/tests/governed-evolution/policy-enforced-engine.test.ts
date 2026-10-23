/**
 * Stage I — ApprovalPolicy + PolicyEnforcedEngine tests.
 *
 * Verifies:
 *   AP1: checkProposerAuthority — allowed when actor is in set.
 *   AP2: checkProposerAuthority — denied when actor is NOT in set.
 *   AP3: checkReviewerAuthority — allowed/denied.
 *   AP4: checkApproverAuthority — allowed when actor ≠ proposer.
 *   AP5: checkApproverAuthority — denied with proposer_cannot_approve_own.
 *   AP6: checkOrderedChainPosition — allowed in order.
 *   AP7: checkOrderedChainPosition — denied out of order.
 *   AP8: checkOrderedChainPosition — denied missing predecessor.
 *
 *   PE1: proposePolicyEnforced — succeeds with authorized proposer.
 *   PE2: proposePolicyEnforced — denied with unauthorized proposer.
 *   PE3: requestReviewPolicyEnforced — succeeds with authorized reviewer.
 *   PE4: requestReviewPolicyEnforced — denied with unauthorized reviewer.
 *   PE5: tryApprovePolicyEnforced — succeeds with authorized approver (≠ proposer).
 *   PE6: tryApprovePolicyEnforced — denied with proposer_cannot_approve_own.
 *   PE7: tryApprovePolicyEnforced — denied with duplicate_approval.
 *   PE8: tryApprovePolicyEnforced — denied with out_of_order_approval.
 *   PE9: tryApprovePolicyEnforced — denied with missing_predecessor_approval.
 *   PE10: rollbackPolicyEnforced — succeeds with authorized actor.
 *   PE11: All authority rejections are recorded in the DecisionLog.
 *
 *   BY1: bypass attempt — proposer tries to approve own candidate → DENIED.
 *   BY2: bypass attempt — reviewer approves twice → DENIED (duplicate).
 *   BY3: bypass attempt — out-of-order approval → DENIED.
 *   BY4: bypass attempt — unauthorized actor → DENIED.
 *
 *   RE1: approval reuse prevention — re-proposed candidate needs fresh approval.
 *   RE2: an approver's signature is bound to the candidate id.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_APPROVAL_POLICY,
  checkProposerAuthority,
  checkReviewerAuthority,
  checkApproverAuthority,
  checkOrderedChainPosition,
  isAuthorityDenied,
} from "../../src/governed-evolution/approval-policy.js";
import type { ApprovalPolicy } from "../../src/governed-evolution/approval-policy.js";
import {
  DefaultPolicyEnforcedEngine,
} from "../../src/governed-evolution/policy-enforced-engine.js";
import {
  DefaultGovernedEvolutionEngine,
  DEFAULT_GOVERNED_RULES,
} from "../../src/governed-evolution/governed-evolution-engine.js";
import { InMemoryCandidateStore } from "../../src/governed-evolution/candidate-store.js";
import { InMemoryDecisionLog } from "../../src/governed-evolution/decision-log.js";
import { isAuthorityViolationError } from "../../src/core/errors.js";
import { asCandidateId } from "../../src/core/identifiers.js";

describe("Stage I — ApprovalPolicy authority checks", () => {
  describe("AP1 + AP2: checkProposerAuthority", () => {
    it("AP1: allowed when actor is in proposerAuthorities", () => {
      const policy: ApprovalPolicy = {
        ...DEFAULT_APPROVAL_POLICY,
        proposerAuthorities: new Set(["alice", "bob"]),
      };
      const result = checkProposerAuthority(policy, "alice");
      expect(result.kind).toBe("allowed");
    });

    it("AP2: denied when actor is NOT in proposerAuthorities", () => {
      const policy: ApprovalPolicy = {
        ...DEFAULT_APPROVAL_POLICY,
        proposerAuthorities: new Set(["alice", "bob"]),
      };
      const result = checkProposerAuthority(policy, "eve");
      expect(result.kind).toBe("denied");
      if (result.kind === "denied") {
        expect(result.violation).toBe("not_in_proposer_authorities");
        expect(result.reason).toContain("eve");
      }
    });

    it("allowed when proposerAuthorities is undefined (anyone can propose)", () => {
      const result = checkProposerAuthority(DEFAULT_APPROVAL_POLICY, "anyone");
      expect(result.kind).toBe("allowed");
    });
  });

  describe("AP3: checkReviewerAuthority", () => {
    it("allowed when actor is in reviewerAuthorities", () => {
      const policy: ApprovalPolicy = {
        ...DEFAULT_APPROVAL_POLICY,
        reviewerAuthorities: new Set(["reviewer-1"]),
      };
      const result = checkReviewerAuthority(policy, "reviewer-1");
      expect(result.kind).toBe("allowed");
    });

    it("denied when actor is NOT in reviewerAuthorities", () => {
      const policy: ApprovalPolicy = {
        ...DEFAULT_APPROVAL_POLICY,
        reviewerAuthorities: new Set(["reviewer-1"]),
      };
      const result = checkReviewerAuthority(policy, "outsider");
      expect(result.kind).toBe("denied");
      if (result.kind === "denied") {
        expect(result.violation).toBe("not_in_reviewer_authorities");
      }
    });
  });

  describe("AP4 + AP5: checkApproverAuthority", () => {
    it("AP4: allowed when actor ≠ proposer (and in approverAuthorities)", () => {
      const policy: ApprovalPolicy = {
        ...DEFAULT_APPROVAL_POLICY,
        approverAuthorities: new Set(["carol", "dave"]),
      };
      const result = checkApproverAuthority(policy, "carol", "alice");
      expect(result.kind).toBe("allowed");
    });

    it("AP5: denied with proposer_cannot_approve_own when actor === proposer", () => {
      const result = checkApproverAuthority(DEFAULT_APPROVAL_POLICY, "alice", "alice");
      expect(result.kind).toBe("denied");
      if (result.kind === "denied") {
        expect(result.violation).toBe("proposer_cannot_approve_own");
      }
    });

    it("denied with not_in_approver_authorities when actor not in set", () => {
      const policy: ApprovalPolicy = {
        ...DEFAULT_APPROVAL_POLICY,
        approverAuthorities: new Set(["carol"]),
      };
      const result = checkApproverAuthority(policy, "eve", "alice");
      expect(result.kind).toBe("denied");
      if (result.kind === "denied") {
        expect(result.violation).toBe("not_in_approver_authorities");
      }
    });
  });

  describe("AP6 + AP7 + AP8: checkOrderedChainPosition", () => {
    it("AP6: allowed when reviewer is approving in order", () => {
      const policy: ApprovalPolicy = {
        ...DEFAULT_APPROVAL_POLICY,
        requireOrderedReviewers: true,
        orderedReviewerChain: ["security", "domain", "owner"],
      };
      // security approved first; domain is now approving
      const result = checkOrderedChainPosition(policy, "domain", ["security"]);
      expect(result.kind).toBe("allowed");
    });

    it("AP7: denied with out_of_order_approval when reviewer is not in chain", () => {
      const policy: ApprovalPolicy = {
        ...DEFAULT_APPROVAL_POLICY,
        requireOrderedReviewers: true,
        orderedReviewerChain: ["security", "domain", "owner"],
      };
      const result = checkOrderedChainPosition(policy, "outsider", []);
      expect(result.kind).toBe("denied");
      if (result.kind === "denied") {
        expect(result.violation).toBe("out_of_order_approval");
      }
    });

    it("AP8: denied with missing_predecessor_approval when predecessor hasn't approved", () => {
      const policy: ApprovalPolicy = {
        ...DEFAULT_APPROVAL_POLICY,
        requireOrderedReviewers: true,
        orderedReviewerChain: ["security", "domain", "owner"],
      };
      // domain is trying to approve, but security hasn't approved yet
      const result = checkOrderedChainPosition(policy, "domain", []);
      expect(result.kind).toBe("denied");
      if (result.kind === "denied") {
        expect(result.violation).toBe("missing_predecessor_approval");
        expect(result.reason).toContain("security");
      }
    });

    it("allowed when requireOrderedReviewers is false (no order enforced)", () => {
      const result = checkOrderedChainPosition(DEFAULT_APPROVAL_POLICY, "anyone", []);
      expect(result.kind).toBe("allowed");
    });
  });

  describe("isAuthorityDenied helper", () => {
    it("returns false for allowed", () => {
      expect(isAuthorityDenied({ kind: "allowed" })).toBe(false);
    });

    it("returns true for denied", () => {
      expect(
        isAuthorityDenied({
          kind: "denied",
          reason: "x",
          violation: "proposer_cannot_approve_own",
        }),
      ).toBe(true);
    });
  });
});

describe("Stage I — PolicyEnforcedEngine", () => {
  let store: InMemoryCandidateStore;
  let baseEngine: DefaultGovernedEvolutionEngine;
  let decisionLog: InMemoryDecisionLog;
  let policyEngine: DefaultPolicyEnforcedEngine;

  function proposeInput(proposedBy: string, overrides?: Partial<Parameters<DefaultGovernedEvolutionEngine["propose"]>[0]>) {
    return {
      assetKind: "skill" as const,
      assetId: "skill-1",
      proposedVersion: "1.0.0",
      changeKind: "create" as const,
      content: { name: "run-tests" },
      proposedBy,
      rationale: "Initial",
      ...overrides,
    };
  }

  describe("PE1 + PE2 + BY4: proposePolicyEnforced authority", () => {
    it("PE1: succeeds with authorized proposer", () => {
      const policy: ApprovalPolicy = {
        ...DEFAULT_APPROVAL_POLICY,
        proposerAuthorities: new Set(["alice"]),
      };
      store = new InMemoryCandidateStore();
      baseEngine = new DefaultGovernedEvolutionEngine(store, DEFAULT_GOVERNED_RULES);
      decisionLog = new InMemoryDecisionLog();
      policyEngine = new DefaultPolicyEnforcedEngine(baseEngine, policy, { decisionLog });

      const result = policyEngine.proposePolicyEnforced(proposeInput("alice"));
      expect(result.kind).toBe("succeeded");
    });

    it("PE2 + BY4: denied with unauthorized proposer", () => {
      const policy: ApprovalPolicy = {
        ...DEFAULT_APPROVAL_POLICY,
        proposerAuthorities: new Set(["alice"]),
      };
      store = new InMemoryCandidateStore();
      baseEngine = new DefaultGovernedEvolutionEngine(store, DEFAULT_GOVERNED_RULES);
      decisionLog = new InMemoryDecisionLog();
      policyEngine = new DefaultPolicyEnforcedEngine(baseEngine, policy, { decisionLog });

      const result = policyEngine.proposePolicyEnforced(proposeInput("eve"));
      expect(result.kind).toBe("denied");
      if (result.kind === "denied") {
        expect(result.violation).toBe("not_in_proposer_authorities");
      }
    });
  });

  describe("PE3 + PE4: requestReviewPolicyEnforced authority", () => {
    beforeEach(() => {
      const policy: ApprovalPolicy = {
        ...DEFAULT_APPROVAL_POLICY,
        reviewerAuthorities: new Set(["reviewer-1"]),
      };
      store = new InMemoryCandidateStore();
      baseEngine = new DefaultGovernedEvolutionEngine(store, DEFAULT_GOVERNED_RULES);
      decisionLog = new InMemoryDecisionLog();
      policyEngine = new DefaultPolicyEnforcedEngine(baseEngine, policy, { decisionLog });
    });

    it("PE3: succeeds with authorized reviewer", () => {
      const proposed = policyEngine.proposePolicyEnforced(proposeInput("alice"));
      if (proposed.kind !== "succeeded") throw new Error("propose failed");
      const result = policyEngine.requestReviewPolicyEnforced(proposed.value.id, "reviewer-1", "review");
      expect(result.kind).toBe("succeeded");
    });

    it("PE4: denied with unauthorized reviewer", () => {
      const proposed = policyEngine.proposePolicyEnforced(proposeInput("alice"));
      if (proposed.kind !== "succeeded") throw new Error("propose failed");
      const result = policyEngine.requestReviewPolicyEnforced(proposed.value.id, "outsider", "review");
      expect(result.kind).toBe("denied");
      if (result.kind === "denied") {
        expect(result.violation).toBe("not_in_reviewer_authorities");
      }
    });
  });

  describe("PE5 + PE6 + BY1: tryApprovePolicyEnforced separation of duties", () => {
    beforeEach(() => {
      store = new InMemoryCandidateStore();
      baseEngine = new DefaultGovernedEvolutionEngine(store, DEFAULT_GOVERNED_RULES);
      decisionLog = new InMemoryDecisionLog();
      policyEngine = new DefaultPolicyEnforcedEngine(baseEngine, DEFAULT_APPROVAL_POLICY, { decisionLog });
    });

    it("PE5: succeeds with authorized approver (≠ proposer)", () => {
      const proposed = policyEngine.proposePolicyEnforced(proposeInput("alice"));
      if (proposed.kind !== "succeeded") throw new Error("propose failed");
      policyEngine.requestReviewPolicyEnforced(proposed.value.id, "bob", "review");
      const result = policyEngine.tryApprovePolicyEnforced(proposed.value.id, "bob", "LGTM");
      expect(result.kind).toBe("succeeded");
      if (result.kind === "succeeded") {
        expect(result.value.approved).toBe(true);
      }
    });

    it("PE6 + BY1: denied with proposer_cannot_approve_own (bypass attempt)", () => {
      const proposed = policyEngine.proposePolicyEnforced(proposeInput("alice"));
      if (proposed.kind !== "succeeded") throw new Error("propose failed");
      policyEngine.requestReviewPolicyEnforced(proposed.value.id, "alice", "self-review");
      // alice tries to approve her own candidate → DENIED
      const result = policyEngine.tryApprovePolicyEnforced(proposed.value.id, "alice", "I approve my own");
      expect(result.kind).toBe("denied");
      if (result.kind === "denied") {
        expect(result.violation).toBe("proposer_cannot_approve_own");
      }
    });
  });

  describe("PE7 + BY2: duplicate approval prevention", () => {
    beforeEach(() => {
      store = new InMemoryCandidateStore();
      baseEngine = new DefaultGovernedEvolutionEngine(store, DEFAULT_GOVERNED_RULES);
      decisionLog = new InMemoryDecisionLog();
      policyEngine = new DefaultPolicyEnforcedEngine(baseEngine, DEFAULT_APPROVAL_POLICY, { decisionLog });
    });

    it("PE7 + BY2: denies duplicate approval (same approver twice)", () => {
      const proposed = policyEngine.proposePolicyEnforced(proposeInput("alice"));
      if (proposed.kind !== "succeeded") throw new Error("propose failed");
      policyEngine.requestReviewPolicyEnforced(proposed.value.id, "bob", "review");
      // First approval: succeeds
      const first = policyEngine.tryApprovePolicyEnforced(proposed.value.id, "bob", "first");
      expect(first.kind).toBe("succeeded");
      // Second approval by same approver: DENIED (duplicate)
      const second = policyEngine.tryApprovePolicyEnforced(proposed.value.id, "bob", "second");
      expect(second.kind).toBe("denied");
      if (second.kind === "denied") {
        expect(second.violation).toBe("duplicate_approval");
      }
    });
  });

  describe("PE8 + PE9 + BY3: ordered chain enforcement", () => {
    beforeEach(() => {
      const policy: ApprovalPolicy = {
        ...DEFAULT_APPROVAL_POLICY,
        requireOrderedReviewers: true,
        orderedReviewerChain: ["security", "domain", "owner"],
        minimumReviewers: 3, // need all 3 to approve
      };
      store = new InMemoryCandidateStore();
      baseEngine = new DefaultGovernedEvolutionEngine(store, policy);
      decisionLog = new InMemoryDecisionLog();
      policyEngine = new DefaultPolicyEnforcedEngine(baseEngine, policy, { decisionLog });
    });

    it("PE8 + BY3: denies out-of-order approval (domain before security)", () => {
      const proposed = policyEngine.proposePolicyEnforced(proposeInput("alice"));
      if (proposed.kind !== "succeeded") throw new Error("propose failed");
      policyEngine.requestReviewPolicyEnforced(proposed.value.id, "anyone", "review");
      // domain tries to approve before security → DENIED
      const result = policyEngine.tryApprovePolicyEnforced(proposed.value.id, "domain", "domain approves");
      expect(result.kind).toBe("denied");
      if (result.kind === "denied") {
        expect(result.violation).toBe("missing_predecessor_approval");
      }
    });

    it("PE9: allows in-order approval (security → domain → owner)", () => {
      const proposed = policyEngine.proposePolicyEnforced(proposeInput("alice"));
      if (proposed.kind !== "succeeded") throw new Error("propose failed");
      policyEngine.requestReviewPolicyEnforced(proposed.value.id, "anyone", "review");

      // security first
      const r1 = policyEngine.tryApprovePolicyEnforced(proposed.value.id, "security", "sec");
      expect(r1.kind).toBe("succeeded");
      // then domain
      const r2 = policyEngine.tryApprovePolicyEnforced(proposed.value.id, "domain", "dom");
      expect(r2.kind).toBe("succeeded");
      // then owner
      const r3 = policyEngine.tryApprovePolicyEnforced(proposed.value.id, "owner", "own");
      expect(r3.kind).toBe("succeeded");
      if (r3.kind === "succeeded") {
        expect(r3.value.approved).toBe(true); // all 3 approved → candidate is approved
      }
    });
  });

  describe("PE10: rollbackPolicyEnforced authority", () => {
    beforeEach(() => {
      store = new InMemoryCandidateStore();
      baseEngine = new DefaultGovernedEvolutionEngine(store, DEFAULT_GOVERNED_RULES);
      decisionLog = new InMemoryDecisionLog();
      policyEngine = new DefaultPolicyEnforcedEngine(baseEngine, DEFAULT_APPROVAL_POLICY, { decisionLog });
    });

    it("succeeds with authorized actor (≠ proposer)", () => {
      const proposed = policyEngine.proposePolicyEnforced(proposeInput("alice"));
      if (proposed.kind !== "succeeded") throw new Error("propose failed");
      policyEngine.requestReviewPolicyEnforced(proposed.value.id, "bob", "review");
      policyEngine.tryApprovePolicyEnforced(proposed.value.id, "bob", "LGTM");

      const rollback = policyEngine.rollbackPolicyEnforced(proposed.value.id, "carol", "issues found");
      expect(rollback.kind).toBe("succeeded");
    });

    it("denies when the actor is the proposer", () => {
      const proposed = policyEngine.proposePolicyEnforced(proposeInput("alice"));
      if (proposed.kind !== "succeeded") throw new Error("propose failed");
      policyEngine.requestReviewPolicyEnforced(proposed.value.id, "bob", "review");
      policyEngine.tryApprovePolicyEnforced(proposed.value.id, "bob", "LGTM");

      const rollback = policyEngine.rollbackPolicyEnforced(proposed.value.id, "alice", "I rollback my own");
      expect(rollback.kind).toBe("denied");
      if (rollback.kind === "denied") {
        expect(rollback.violation).toBe("proposer_cannot_approve_own");
      }
    });
  });

  describe("PE11: all authority rejections are recorded in the DecisionLog", () => {
    beforeEach(() => {
      const policy: ApprovalPolicy = {
        ...DEFAULT_APPROVAL_POLICY,
        proposerAuthorities: new Set(["alice"]),
        approverAuthorities: new Set(["carol", "dave"]),
      };
      store = new InMemoryCandidateStore();
      baseEngine = new DefaultGovernedEvolutionEngine(store, policy);
      decisionLog = new InMemoryDecisionLog();
      policyEngine = new DefaultPolicyEnforcedEngine(baseEngine, policy, { decisionLog });
    });

    it("records authority rejections with the violation kind in the reason", () => {
      // Try to propose with unauthorized actor
      policyEngine.proposePolicyEnforced(proposeInput("eve"));

      const rejections = decisionLog.listByKind("rejection");
      expect(rejections).toHaveLength(1);
      expect(rejections[0]!.reason).toContain("not_in_proposer_authorities");
      expect(rejections[0]!.actor).toBe("eve");
    });
  });

  describe("RE1 + RE2: approval reuse prevention", () => {
    beforeEach(() => {
      store = new InMemoryCandidateStore();
      baseEngine = new DefaultGovernedEvolutionEngine(store, DEFAULT_GOVERNED_RULES);
      decisionLog = new InMemoryDecisionLog();
      policyEngine = new DefaultPolicyEnforcedEngine(baseEngine, DEFAULT_APPROVAL_POLICY, { decisionLog });
    });

    it("RE1: a re-proposed candidate (new id) requires fresh approval", () => {
      // First candidate: propose + review + approve (bob approves)
      const proposed1 = policyEngine.proposePolicyEnforced(proposeInput("alice"));
      if (proposed1.kind !== "succeeded") throw new Error("propose failed");
      const cand1Id = proposed1.value.id;
      policyEngine.requestReviewPolicyEnforced(cand1Id, "bob", "review");
      policyEngine.tryApprovePolicyEnforced(cand1Id, "bob", "LGTM");

      // Second candidate (different id): propose again
      const proposed2 = policyEngine.proposePolicyEnforced(
        proposeInput("alice", { rationale: "second proposal" }),
      );
      if (proposed2.kind !== "succeeded") throw new Error("propose failed");
      const cand2Id = proposed2.value.id;

      // CRITICAL: cand2 has a different id from cand1
      expect(cand2Id).not.toBe(cand1Id);

      // bob's previous approval of cand1 does NOT carry over to cand2
      // cand2 is still 'proposed' (not approved)
      const cand2 = baseEngine.getCandidate(cand2Id)!;
      expect(cand2.status).toBe("proposed");

      // bob must approve cand2 separately
      policyEngine.requestReviewPolicyEnforced(cand2Id, "bob", "review cand2");
      const result = policyEngine.tryApprovePolicyEnforced(cand2Id, "bob", "LGTM cand2");
      expect(result.kind).toBe("succeeded");
      if (result.kind === "succeeded") {
        expect(result.value.approved).toBe(true);
      }
    });

    it("RE2: an approver's signature is bound to the candidate id, not the asset", () => {
      // The PolicyEnforcedEngine tracks approvers per candidate (approversByCandidate map).
      // A new candidate starts with an empty approvers list.
      const proposed1 = policyEngine.proposePolicyEnforced(proposeInput("alice"));
      if (proposed1.kind !== "succeeded") throw new Error("propose failed");
      const cand1Id = proposed1.value.id;
      policyEngine.requestReviewPolicyEnforced(cand1Id, "bob", "review");
      policyEngine.tryApprovePolicyEnforced(cand1Id, "bob", "first approval");

      // bob's approval of cand1 is bound to cand1Id
      // If we try to approve cand1 again, it's a duplicate (DENIED)
      const dup = policyEngine.tryApprovePolicyEnforced(cand1Id, "bob", "duplicate");
      expect(dup.kind).toBe("denied");
      if (dup.kind === "denied") {
        expect(dup.violation).toBe("duplicate_approval");
      }

      // But a NEW candidate (different id) allows bob to approve fresh
      const proposed2 = policyEngine.proposePolicyEnforced(
        proposeInput("alice", { rationale: "second" }),
      );
      if (proposed2.kind !== "succeeded") throw new Error("propose failed");
      policyEngine.requestReviewPolicyEnforced(proposed2.value.id, "bob", "review 2");
      const fresh = policyEngine.tryApprovePolicyEnforced(proposed2.value.id, "bob", "fresh approval");
      expect(fresh.kind).toBe("succeeded");
    });
  });
});
