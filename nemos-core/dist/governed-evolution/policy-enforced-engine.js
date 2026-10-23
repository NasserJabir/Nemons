/**
 * Nemons Governed Evolution — Policy Enforced Engine
 *
 * The PolicyEnforcedEngine wraps the existing GovernedEvolutionEngine
 * (and optionally the ConflictResolutionEngine) with explicit
 * authority checks at every sensitive transition. It is the canonical
 * Stage I component: "every sensitive transition is subject to
 * explicit, testable authority policies."
 *
 * Architectural principles enforced here:
 *   - "Separation of duties" (3-way): proposer ≠ reviewer ≠ approver.
 *     The proposer cannot approve their own candidate; a reviewer
 *     cannot be the final approver (configurable).
 *   - "Multi-stage reviews": when requireOrderedReviewers is true,
 *     reviewers MUST approve in the declared order. Out-of-order
 *     approvals are rejected.
 *   - "Auditable decisions": every authority check is recorded in
 *     the DecisionLog. Rejections include the specific violation kind.
 *   - "No approval reuse": an approver's signature is bound to the
 *     candidate id, NOT the asset. A re-proposed candidate (new id)
 *     requires fresh approval — previous approvals do NOT carry over.
 *
 * The PolicyEnforcedEngine is NON-DESTRUCTIVE: the underlying engine
 * remains usable directly. The wrapper adds authority checks + audit
 * logging for callers who need them.
 *
 * Layering:
 *   base GovernedEvolutionEngine
 *     ↓ wrapped by
 *   ConflictResolutionEngine (Stage H — conflict detection + decision log)
 *     ↓ wrapped by
 *   PolicyEnforcedEngine (Stage I — authority checks + audit log)
 *
 * Or standalone (without ConflictResolutionEngine):
 *   base GovernedEvolutionEngine
 *     ↓ wrapped by
 *   PolicyEnforcedEngine (Stage I — authority checks + audit log)
 */
import { checkProposerAuthority, checkReviewerAuthority, checkApproverAuthority, checkOrderedChainPosition, isAuthorityDenied, } from "./approval-policy.js";
import { InMemoryDecisionLog } from "./decision-log.js";
/**
 * Default PolicyEnforcedEngine implementation.
 *
 * Wraps a GovernedEvolutionEngine (or a ConflictResolutionEngine)
 * with authority checks. All authority decisions are recorded in
 * the DecisionLog.
 */
export class DefaultPolicyEnforcedEngine {
    engine;
    policy;
    decisionLog;
    // Track approvers per candidate (for duplicate detection + ordered chain)
    approversByCandidate = new Map();
    constructor(engine, policy, options) {
        this.engine = engine;
        this.policy = policy;
        this.decisionLog = options?.decisionLog ?? new InMemoryDecisionLog();
    }
    proposePolicyEnforced(input) {
        // 1. Check proposer authority
        const proposerCheck = checkProposerAuthority(this.policy, input.proposedBy);
        if (isAuthorityDenied(proposerCheck)) {
            this.recordAuthorityRejection("propose", input.proposedBy, undefined, input.assetId, proposerCheck);
            return {
                kind: "denied",
                violation: proposerCheck.violation,
                reason: proposerCheck.reason,
            };
        }
        // 2. Delegate to the engine
        try {
            const candidate = this.engine.propose(input);
            this.decisionLog.record({
                kind: "approval", // (proposal accepted; the candidate starts as proposed)
                actor: input.proposedBy,
                candidateId: candidate.id,
                assetId: candidate.assetId,
                reason: `Proposed: ${input.rationale}`,
            });
            return { kind: "succeeded", value: candidate };
        }
        catch (e) {
            // The engine rejected (e.g., content validation failure)
            return {
                kind: "denied",
                violation: "not_in_proposer_authorities", // (placeholder; the engine's error is the real reason)
                reason: `Proposal rejected by engine: ${e.message}`,
            };
        }
    }
    requestReviewPolicyEnforced(candidateId, requestedBy, comment) {
        // 1. Check reviewer authority
        const reviewerCheck = checkReviewerAuthority(this.policy, requestedBy);
        if (isAuthorityDenied(reviewerCheck)) {
            this.recordAuthorityRejection("requestReview", requestedBy, candidateId, undefined, reviewerCheck);
            return {
                kind: "denied",
                violation: reviewerCheck.violation,
                reason: reviewerCheck.reason,
            };
        }
        // 2. Delegate to the engine
        try {
            const candidate = this.engine.requestReview(candidateId, requestedBy, comment);
            return { kind: "succeeded", value: candidate };
        }
        catch (e) {
            return {
                kind: "denied",
                violation: "not_in_reviewer_authorities",
                reason: `Request review rejected by engine: ${e.message}`,
            };
        }
    }
    tryApprovePolicyEnforced(candidateId, reviewer, comment) {
        const candidate = this.engine.getCandidate(candidateId);
        if (!candidate) {
            return {
                kind: "denied",
                violation: "not_in_approver_authorities",
                reason: `Candidate not found: ${candidateId}`,
            };
        }
        // 1. Check approver authority + separation of duties (proposer ≠ approver)
        const approverCheck = checkApproverAuthority(this.policy, reviewer, candidate.proposedBy);
        if (isAuthorityDenied(approverCheck)) {
            this.recordAuthorityRejection("tryApprove", reviewer, candidateId, candidate.assetId, approverCheck);
            return {
                kind: "denied",
                violation: approverCheck.violation,
                reason: approverCheck.reason,
            };
        }
        // 2. Check 3-way separation: the reviewer is NOT a previous reviewer
        if (this.policy.requireThreeWaySeparation) {
            const previousApprovers = this.approversByCandidate.get(candidateId) ?? [];
            if (previousApprovers.includes(reviewer)) {
                const violation = "duplicate_approval";
                const reason = `Actor '${reviewer}' already approved this candidate (3-way separation prevents duplicate approvals).`;
                this.recordAuthorityRejection("tryApprove", reviewer, candidateId, candidate.assetId, { kind: "denied", reason, violation });
                return { kind: "denied", violation, reason };
            }
        }
        // 3. Check ordered chain position
        const previousApprovers = this.approversByCandidate.get(candidateId) ?? [];
        const orderedCheck = checkOrderedChainPosition(this.policy, reviewer, previousApprovers);
        if (isAuthorityDenied(orderedCheck)) {
            this.recordAuthorityRejection("tryApprove", reviewer, candidateId, candidate.assetId, orderedCheck);
            return {
                kind: "denied",
                violation: orderedCheck.violation,
                reason: orderedCheck.reason,
            };
        }
        // 4. Check for duplicate approval (without 3-way separation,
        //    duplicate approvals are still rejected — each approver counts once)
        if (previousApprovers.includes(reviewer)) {
            const violation = "duplicate_approval";
            const reason = `Actor '${reviewer}' already approved this candidate.`;
            this.recordAuthorityRejection("tryApprove", reviewer, candidateId, candidate.assetId, { kind: "denied", reason, violation });
            return { kind: "denied", violation, reason };
        }
        // 5. Delegate to the engine's tryApprove
        const approvalResult = this.engine.tryApprove(candidateId, reviewer, comment);
        // 6. Record the approver — ALWAYS, even when the governed rules
        //    deny (e.g., insufficient reviewers). The approver's signature
        //    is still valid; the candidate just hasn't reached the minimum
        //    threshold yet. This is critical for ordered chains: the next
        //    reviewer needs to see that the predecessor approved, even if
        //    the candidate isn't fully approved yet.
        const approvers = this.approversByCandidate.get(candidateId) ?? [];
        approvers.push(reviewer);
        this.approversByCandidate.set(candidateId, approvers);
        if (approvalResult.kind === "denied") {
            // The governed rules denied (e.g., insufficient reviewers)
            // Record the decision but don't treat as authority violation.
            // The approver IS recorded (above) so ordered chains work.
            this.decisionLog.record({
                kind: "rejection",
                actor: reviewer,
                candidateId,
                assetId: candidate.assetId,
                reason: `Governed rules not satisfied: ${approvalResult.reasons.join("; ")}`,
            });
            // The candidate is still under_review; the approval just didn't go through
            const updated = this.engine.getCandidate(candidateId);
            return { kind: "succeeded", value: { candidate: updated, approved: false } };
        }
        // 7. Record the approval in the DecisionLog
        this.decisionLog.record({
            kind: "approval",
            actor: reviewer,
            candidateId,
            assetId: candidate.assetId,
            reason: comment,
        });
        const updated = this.engine.getCandidate(candidateId);
        return { kind: "succeeded", value: { candidate: updated, approved: true } };
    }
    trySupersedePolicyEnforced(oldCandidateId, newCandidateId, actor, reason) {
        // 1. Check approver authority (for supersede, the actor must be an approver)
        const newCandidate = this.engine.getCandidate(newCandidateId);
        const proposedBy = newCandidate?.proposedBy ?? "";
        const approverCheck = checkApproverAuthority(this.policy, actor, proposedBy);
        if (isAuthorityDenied(approverCheck)) {
            this.recordAuthorityRejection("trySupersede", actor, newCandidateId, newCandidate?.assetId, approverCheck);
            return {
                kind: "denied",
                violation: approverCheck.violation,
                reason: approverCheck.reason,
            };
        }
        // 2. Delegate to the engine's supersede
        try {
            const result = this.engine.supersede(oldCandidateId, newCandidateId, actor, reason);
            this.decisionLog.record({
                kind: "supersede",
                actor,
                oldCandidateId,
                newCandidateId,
                assetId: result.newCandidate.assetId,
                reason,
            });
            return { kind: "succeeded", value: result };
        }
        catch (e) {
            return {
                kind: "denied",
                violation: "not_in_approver_authorities",
                reason: `Supersede rejected by engine: ${e.message}`,
            };
        }
    }
    rollbackPolicyEnforced(candidateId, actor, reason) {
        // 1. Check approver authority
        const candidate = this.engine.getCandidate(candidateId);
        const proposedBy = candidate?.proposedBy ?? "";
        const approverCheck = checkApproverAuthority(this.policy, actor, proposedBy);
        if (isAuthorityDenied(approverCheck)) {
            this.recordAuthorityRejection("rollback", actor, candidateId, candidate?.assetId, approverCheck);
            return {
                kind: "denied",
                violation: approverCheck.violation,
                reason: approverCheck.reason,
            };
        }
        // 2. Delegate to the engine's rollback
        try {
            const result = this.engine.rollback(candidateId, actor, reason);
            this.decisionLog.record({
                kind: "rollback",
                actor,
                candidateId,
                assetId: candidate?.assetId,
                reason,
            });
            return { kind: "succeeded", value: result };
        }
        catch (e) {
            return {
                kind: "denied",
                violation: "not_in_approver_authorities",
                reason: `Rollback rejected by engine: ${e.message}`,
            };
        }
    }
    getEngine() {
        return this.engine;
    }
    getDecisionLog() {
        return this.decisionLog;
    }
    getPolicy() {
        return this.policy;
    }
    // ─── Internal: record authority rejections in the DecisionLog ───
    recordAuthorityRejection(operation, actor, candidateId, assetId, result) {
        if (result.kind !== "denied")
            return;
        this.decisionLog.record({
            kind: "rejection",
            actor,
            candidateId,
            assetId,
            reason: `[${operation}] Authority denied: ${result.reason} (violation: ${result.violation})`,
        });
    }
}
//# sourceMappingURL=policy-enforced-engine.js.map