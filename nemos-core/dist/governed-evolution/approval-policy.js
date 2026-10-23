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
export const DEFAULT_APPROVAL_POLICY = {
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
 * Checks whether an actor can propose a candidate.
 *
 * Returns `allowed` if the actor is in proposerAuthorities (or if
 * proposerAuthorities is undefined). Otherwise returns `denied` with
 * `not_in_proposer_authorities`.
 */
export function checkProposerAuthority(policy, actor) {
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
export function checkReviewerAuthority(policy, actor) {
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
export function checkApproverAuthority(policy, actor, proposedBy) {
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
export function checkOrderedChainPosition(policy, reviewer, approversSoFar) {
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
        const predecessor = chain[i];
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
export function isAuthorityDenied(result) {
    return result.kind === "denied";
}
//# sourceMappingURL=approval-policy.js.map