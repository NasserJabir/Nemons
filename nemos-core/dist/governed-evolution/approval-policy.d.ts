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
export declare const DEFAULT_APPROVAL_POLICY: ApprovalPolicy;
/**
 * The result of an authority check. Either `allowed` or `denied`
 * with a specific reason.
 */
export type AuthorityCheckResult = {
    readonly kind: "allowed";
} | {
    readonly kind: "denied";
    readonly reason: string;
    readonly violation: AuthorityViolation;
};
/**
 * The kind of authority violation.
 */
export type AuthorityViolation = "not_in_proposer_authorities" | "not_in_reviewer_authorities" | "not_in_approver_authorities" | "proposer_cannot_approve_own" | "reviewer_is_proposer" | "out_of_order_approval" | "missing_predecessor_approval" | "approval_reuse_attempt" | "duplicate_approval";
/**
 * Checks whether an actor can propose a candidate.
 *
 * Returns `allowed` if the actor is in proposerAuthorities (or if
 * proposerAuthorities is undefined). Otherwise returns `denied` with
 * `not_in_proposer_authorities`.
 */
export declare function checkProposerAuthority(policy: ApprovalPolicy, actor: string): AuthorityCheckResult;
/**
 * Checks whether an actor can request review.
 */
export declare function checkReviewerAuthority(policy: ApprovalPolicy, actor: string): AuthorityCheckResult;
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
export declare function checkApproverAuthority(policy: ApprovalPolicy, actor: string, proposedBy: string): AuthorityCheckResult;
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
export declare function checkOrderedChainPosition(policy: ApprovalPolicy, reviewer: string, approversSoFar: readonly string[]): AuthorityCheckResult;
/**
 * Returns true iff the result is `denied`.
 */
export declare function isAuthorityDenied(result: AuthorityCheckResult): result is Extract<AuthorityCheckResult, {
    readonly kind: "denied";
}>;
//# sourceMappingURL=approval-policy.d.ts.map