/**
 * Nemons Governed Evolution — Approval Policy
 *
 * The ApprovalPolicy extends the existing GovernedRules with explicit
 * authority sets and ordered approval chains. It is the canonical
 * Stage I configuration: every sensitive transition is subject to
 * explicit, testable authority policies.
 *
 * Architectural principles enforced here:
 *   - "Separation of duties": the proposer, reviewer, and approver
 *     are distinct authorities. A proposer cannot approve their own
 *     candidate; a reviewer cannot be the final approver (configurable).
 *   - "Multi-stage reviews": when requireOrderedReviewers is true,
 *     reviewers MUST approve in the declared order. Skipping a stage
 *     or approving out-of-order is rejected.
 *   - "Auditable decisions": every authority check is recorded in
 *     the DecisionLog with the actor, the policy that fired, and
 *     the rejection reason (if any).
 *   - "No approval reuse": an approver's signature is bound to the
 *     candidate id, not the asset. A re-proposed candidate (new id)
 *     requires fresh approval — previous approvals do NOT carry over.
 *
 * The ApprovalPolicy is an EXTENSION of GovernedRules:
 *   - `minimumReviewers` (inherited) — minimum number of approving reviewers
 *   - `requireSeparationOfDuties` (inherited) — proposer ≠ approver
 *   - `requireEvidence` (inherited) — require evidence refs
 *   - `contentValidator` (inherited) — validate content
 *
 * Stage I additions:
 *   - `proposerAuthorities` — explicit set of actors who can propose
 *   - `reviewerAuthorities` — explicit set of actors who can review
 *   - `approverAuthorities` — explicit set of actors who can approve
 *   - `requireOrderedReviewers` — if true, reviewers must approve in order
 *   - `orderedReviewerChain` — the ordered list of reviewer authorities
 *   - `requireThreeWaySeparation` — if true, proposer ≠ reviewer ≠ approver
 *     (stricter than requireSeparationOfDuties, which only requires
 *     proposer ≠ approver)
 */

import type { GovernedRules } from "./governed-evolution-engine.js";

/**
 * The ApprovalPolicy interface. Extends GovernedRules with explicit
 * authority sets and ordered approval chains.
 */
export interface ApprovalPolicy extends GovernedRules {
  /**
   * The set of actors who can propose candidates. If undefined, any
   * actor can propose (subject to other rules).
   *
   * When defined, `propose()` checks that the `proposedBy` actor is
   * in this set. Otherwise, the proposal is rejected with
   * `AuthorityViolationError`.
   */
  readonly proposerAuthorities?: ReadonlySet<string>;

  /**
   * The set of actors who can request review. If undefined, any
   * actor can request review.
   *
   * When defined, `requestReview()` checks that the `requestedBy`
   * actor is in this set.
   */
  readonly reviewerAuthorities?: ReadonlySet<string>;

  /**
   * The set of actors who can approve candidates. If undefined, any
   * actor (except the proposer, under separation of duties) can
   * approve.
   *
   * When defined, `tryApprove()` checks that the `reviewer` actor
   * is in this set.
   */
  readonly approverAuthorities?: ReadonlySet<string>;

  /**
   * If true, reviewers MUST approve in the order declared by
   * `orderedReviewerChain`. A reviewer cannot approve until all
   * preceding reviewers in the chain have approved.
   *
   * Default: false.
   */
  readonly requireOrderedReviewers?: boolean;

  /**
   * The ordered list of reviewer authorities. When
   * `requireOrderedReviewers` is true, the engine enforces that
   * reviewers approve in this order.
   *
   * Example: ["security-reviewer", "domain-reviewer", "owner"]
   * means security-reviewer must approve first, then domain-reviewer,
   * then owner.
   */
  readonly orderedReviewerChain?: readonly string[];

  /**
   * If true, the proposer, reviewer, and approver MUST all be
   * distinct actors (3-way separation of duties).
   *
   * This is STRICTER than `requireSeparationOfDuties` (which only
   * requires proposer ≠ approver). With 3-way separation:
   *   - The proposer cannot be a reviewer
   *   - The proposer cannot be an approver
   *   - A reviewer cannot be the final approver (if they're different
   *     stages in the chain)
   *
   * Default: false.
   */
  readonly requireThreeWaySeparation?: boolean;
}

/**
 * Default approval policy. Encodes the architectural baseline:
 *   - minimumReviewers: 1 (inherited from DEFAULT_GOVERNED_RULES)
 *   - requireSeparationOfDuties: true (inherited)
 *   - requireEvidence: false (inherited)
 *   - No explicit authority sets (anyone can propose/review/approve,
 *     subject to separation of duties)
 *   - No ordered chain
 *   - No 3-way separation
 *
 * This is permissive enough for development/testing, but production
 * deployments SHOULD define explicit authority sets.
 */
export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  minimumReviewers: 1,
  requireSeparationOfDuties: true,
  requireEvidence: false,
  // proposerAuthorities: undefined — anyone can propose
  // reviewerAuthorities: undefined — anyone can review
  // approverAuthorities: undefined — anyone (≠ proposer) can approve
  requireOrderedReviewers: false,
  requireThreeWaySeparation: false,
};

/**
 * The result of an authority check. Either `allowed` or `denied`
 * with a specific reason.
 */
export type AuthorityCheckResult =
  | { readonly kind: "allowed" }
  | { readonly kind: "denied"; readonly reason: string; readonly violation: AuthorityViolation };

/**
 * The kind of authority violation.
 */
export type AuthorityViolation =
  | "not_in_proposer_authorities" // the actor is not in proposerAuthorities
  | "not_in_reviewer_authorities" // the actor is not in reviewerAuthorities
  | "not_in_approver_authorities" // the actor is not in approverAuthorities
  | "proposer_cannot_approve_own" // the proposer tried to approve their own candidate
  | "reviewer_is_proposer" // 3-way separation: the reviewer is the proposer
  | "out_of_order_approval" // ordered chain: the reviewer approved before their turn
  | "missing_predecessor_approval" // ordered chain: a preceding reviewer hasn't approved yet
  | "approval_reuse_attempt" // the approver's signature is being reused for a different candidate
  | "duplicate_approval" // the approver already approved this candidate (counted once);

/**
 * Checks whether an actor can propose a candidate.
 *
 * Returns `allowed` if the actor is in proposerAuthorities (or if
 * proposerAuthorities is undefined). Otherwise returns `denied` with
 * `not_in_proposer_authorities`.
 */
export function checkProposerAuthority(
  policy: ApprovalPolicy,
  actor: string,
): AuthorityCheckResult {
  if (policy.proposerAuthorities === undefined) {
    return { kind: "allowed" };
  }
  if (policy.proposerAuthorities.has(actor)) {
    return { kind: "allowed" };
  }
  return {
    kind: "denied",
    reason: `Actor '${actor}' is not in proposerAuthorities.`,
    violation: "not_in_proposer_authorities",
  };
}

/**
 * Checks whether an actor can request review.
 */
export function checkReviewerAuthority(
  policy: ApprovalPolicy,
  actor: string,
): AuthorityCheckResult {
  if (policy.reviewerAuthorities === undefined) {
    return { kind: "allowed" };
  }
  if (policy.reviewerAuthorities.has(actor)) {
    return { kind: "allowed" };
  }
  return {
    kind: "denied",
    reason: `Actor '${actor}' is not in reviewerAuthorities.`,
    violation: "not_in_reviewer_authorities",
  };
}

/**
 * Checks whether an actor can approve a candidate.
 *
 * Checks:
 *   1. The actor is in approverAuthorities (if defined).
 *   2. The actor is NOT the proposer (separation of duties).
 *   3. If 3-way separation: the actor is NOT a previous reviewer
 *      (this is checked at the engine level, not here, because it
 *      requires the candidate's review history).
 */
export function checkApproverAuthority(
  policy: ApprovalPolicy,
  actor: string,
  proposedBy: string,
): AuthorityCheckResult {
  // 1. Approver authorities
  if (policy.approverAuthorities !== undefined && !policy.approverAuthorities.has(actor)) {
    return {
      kind: "denied",
      reason: `Actor '${actor}' is not in approverAuthorities.`,
      violation: "not_in_approver_authorities",
    };
  }

  // 2. Separation of duties: proposer ≠ approver
  if (policy.requireSeparationOfDuties && actor === proposedBy) {
    return {
      kind: "denied",
      reason: `Actor '${actor}' is the proposer; cannot approve their own candidate (separation of duties).`,
      violation: "proposer_cannot_approve_own",
    };
  }

  return { kind: "allowed" };
}

/**
 * Checks whether a reviewer can approve at this point in the ordered
 * chain.
 *
 * Returns `denied` with `out_of_order_approval` if the reviewer is
 * trying to approve before their turn (a preceding reviewer hasn't
 * approved yet).
 *
 * Returns `denied` with `missing_predecessor_approval` if a preceding
 * reviewer in the chain hasn't approved yet.
 */
export function checkOrderedChainPosition(
  policy: ApprovalPolicy,
  reviewer: string,
  approversSoFar: readonly string[],
): AuthorityCheckResult {
  if (!policy.requireOrderedReviewers) {
    return { kind: "allowed" };
  }

  const chain = policy.orderedReviewerChain;
  if (!chain || chain.length === 0) {
    // No chain defined — order is not enforced
    return { kind: "allowed" };
  }

  // Find the reviewer's position in the chain
  const reviewerIndex = chain.indexOf(reviewer);
  if (reviewerIndex === -1) {
    // Reviewer is not in the chain at all — denied
    return {
      kind: "denied",
      reason: `Reviewer '${reviewer}' is not in the ordered chain.`,
      violation: "out_of_order_approval",
    };
  }

  // Check that all preceding reviewers have approved
  for (let i = 0; i < reviewerIndex; i++) {
    const predecessor = chain[i]!;
    if (!approversSoFar.includes(predecessor)) {
      return {
        kind: "denied",
        reason: `Predecessor '${predecessor}' has not approved yet; reviewer '${reviewer}' cannot approve out of order.`,
        violation: "missing_predecessor_approval",
      };
    }
  }

  return { kind: "allowed" };
}

/**
 * Returns true iff the result is `denied`.
 */
export function isAuthorityDenied(
  result: AuthorityCheckResult,
): result is Extract<AuthorityCheckResult, { readonly kind: "denied" }> {
  return result.kind === "denied";
}
