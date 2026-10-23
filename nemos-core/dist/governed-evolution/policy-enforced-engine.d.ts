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
import type { CandidateRecord } from "../schemas/candidate.js";
import type { CandidateId } from "../core/identifiers.js";
import type { GovernedEvolutionEngine, ProposeCandidateInput } from "./governed-evolution-engine.js";
import type { ApprovalPolicy, AuthorityViolation } from "./approval-policy.js";
import type { DecisionLog } from "./decision-log.js";
/**
 * The result of an authority-checked operation. Either `succeeded`
 * or `denied` with the specific violation.
 */
export type PolicyEnforcedResult<T> = {
    readonly kind: "succeeded";
    readonly value: T;
} | {
    readonly kind: "denied";
    readonly violation: AuthorityViolation;
    readonly reason: string;
};
/**
 * The PolicyEnforcedEngine interface.
 */
export interface PolicyEnforcedEngine {
    /**
     * Proposes a new candidate. Checks that the `proposedBy` actor is
     * in `proposerAuthorities` (if defined).
     *
     * Returns `denied` with `not_in_proposer_authorities` if the actor
     * is not authorized.
     */
    proposePolicyEnforced(input: ProposeCandidateInput): PolicyEnforcedResult<CandidateRecord>;
    /**
     * Requests review. Checks that the `requestedBy` actor is in
     * `reviewerAuthorities` (if defined).
     */
    requestReviewPolicyEnforced(candidateId: CandidateId, requestedBy: string, comment: string): PolicyEnforcedResult<CandidateRecord>;
    /**
     * Tries to approve a candidate. Checks:
     *   1. The reviewer is in `approverAuthorities` (if defined).
     *   2. The reviewer is NOT the proposer (separation of duties).
     *   3. If 3-way separation: the reviewer is NOT a previous reviewer
     *      of this candidate.
     *   4. If ordered chain: the reviewer is approving in the correct
     *      order (all preceding reviewers have approved).
     *   5. The reviewer has NOT already approved this candidate (no
     *      duplicate approvals).
     *
     * Returns `denied` with the specific violation if any check fails.
     */
    tryApprovePolicyEnforced(candidateId: CandidateId, reviewer: string, comment: string): PolicyEnforcedResult<{
        readonly candidate: CandidateRecord;
        readonly approved: boolean;
    }>;
    /**
     * Attempts a supersede operation (delegates to the
     * ConflictResolutionEngine if available, or the base engine).
     * Checks that the actor is in `approverAuthorities` (if defined).
     */
    trySupersedePolicyEnforced(oldCandidateId: CandidateId, newCandidateId: CandidateId, actor: string, reason: string): PolicyEnforcedResult<{
        readonly oldCandidate: CandidateRecord;
        readonly newCandidate: CandidateRecord;
    }>;
    /**
     * Rolls back an approved candidate. Checks that the actor is in
     * `approverAuthorities` (if defined).
     */
    rollbackPolicyEnforced(candidateId: CandidateId, actor: string, reason: string): PolicyEnforcedResult<CandidateRecord>;
    /**
     * Returns the underlying engine (for direct queries).
     */
    getEngine(): GovernedEvolutionEngine;
    /**
     * Returns the DecisionLog.
     */
    getDecisionLog(): DecisionLog;
    /**
     * Returns the ApprovalPolicy.
     */
    getPolicy(): ApprovalPolicy;
}
/**
 * Default PolicyEnforcedEngine implementation.
 *
 * Wraps a GovernedEvolutionEngine (or a ConflictResolutionEngine)
 * with authority checks. All authority decisions are recorded in
 * the DecisionLog.
 */
export declare class DefaultPolicyEnforcedEngine implements PolicyEnforcedEngine {
    private readonly engine;
    private readonly policy;
    private readonly decisionLog;
    private readonly approversByCandidate;
    constructor(engine: GovernedEvolutionEngine, policy: ApprovalPolicy, options?: {
        readonly decisionLog?: DecisionLog;
    });
    proposePolicyEnforced(input: ProposeCandidateInput): PolicyEnforcedResult<CandidateRecord>;
    requestReviewPolicyEnforced(candidateId: CandidateId, requestedBy: string, comment: string): PolicyEnforcedResult<CandidateRecord>;
    tryApprovePolicyEnforced(candidateId: CandidateId, reviewer: string, comment: string): PolicyEnforcedResult<{
        readonly candidate: CandidateRecord;
        readonly approved: boolean;
    }>;
    trySupersedePolicyEnforced(oldCandidateId: CandidateId, newCandidateId: CandidateId, actor: string, reason: string): PolicyEnforcedResult<{
        readonly oldCandidate: CandidateRecord;
        readonly newCandidate: CandidateRecord;
    }>;
    rollbackPolicyEnforced(candidateId: CandidateId, actor: string, reason: string): PolicyEnforcedResult<CandidateRecord>;
    getEngine(): GovernedEvolutionEngine;
    getDecisionLog(): DecisionLog;
    getPolicy(): ApprovalPolicy;
    private recordAuthorityRejection;
}
//# sourceMappingURL=policy-enforced-engine.d.ts.map