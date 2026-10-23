/**
 * Nemons Governed Evolution — Engine
 *
 * The GovernedEvolutionEngine orchestrates the candidate lifecycle:
 * propose → requestReview → approve/reject → supersede → rollback.
 *
 * Architectural principles enforced here:
 *   - "A candidate change cannot become approved without satisfying
 *     the required governance rules."
 *   - "Use is not adoption": a candidate is NOT adopted (i.e., does
 *     NOT become the active version) until it has been approved AND
 *     the governed rules have been satisfied.
 *   - "No silent mutation": status transitions are explicit and
 *     audited in the review trail.
 *   - "Separation of duties": the proposedBy actor CANNOT approve
 *     their own candidate (a configurable minimum number of OTHER
 *     reviewers must approve).
 *   - "Evidence before claims": approval requires the candidate to
 *     reference supporting Evidence (configurable).
 *
 * Governed rules (the `GovernedRules` interface):
 *   - `minimumReviewers`: minimum number of approving reviewers (default: 1)
 *   - `requireSeparationOfDuties`: proposedBy cannot be a reviewer (default: true)
 *   - `requireEvidence`: at least one evidenceRef is required (default: false)
 *   - `contentValidator`: optional validator for the candidate's content
 *
 * The engine is the canonical place where Stage F's exit condition
 * is enforced: "A candidate change cannot become approved without
 * satisfying the required governance rules."
 */
import type { CandidateRecord, CandidateAssetKind, CandidateChangeKind } from "../schemas/candidate.js";
import type { CandidateStore } from "./candidate-store.js";
import type { CandidateId } from "../core/identifiers.js";
/**
 * The governed rules — configurable per deployment. The defaults
 * encode the architectural baseline.
 */
export interface GovernedRules {
    /**
     * Minimum number of approving reviewers required for approval.
     * Default: 1.
     */
    readonly minimumReviewers: number;
    /**
     * If true, the proposedBy actor CANNOT be one of the approving
     * reviewers (separation of duties). Default: true.
     */
    readonly requireSeparationOfDuties: boolean;
    /**
     * If true, the candidate MUST have at least one evidenceRef.
     * Default: false (candidates may be proposed without evidence,
     * but approval may require it depending on the asset kind).
     */
    readonly requireEvidence: boolean;
    /**
     * Optional validator for the candidate's content. If provided,
     * the engine validates the candidate's content before approval.
     * Throws on validation failure.
     */
    readonly contentValidator?: (content: Readonly<Record<string, unknown>>, assetKind: CandidateAssetKind) => void;
}
/**
 * Default governed rules. Encodes the architectural baseline:
 *   - minimumReviewers: 1 (at least one reviewer must approve)
 *   - requireSeparationOfDuties: true (proposedBy cannot self-approve)
 *   - requireEvidence: false (configurable per deployment)
 */
export declare const DEFAULT_GOVERNED_RULES: GovernedRules;
/**
 * The result of an approval attempt. Either:
 *   - `kind: "approved"` — the candidate met all the rules
 *   - `kind: "denied"` — the candidate failed one or more rules
 */
export type ApprovalResult = {
    readonly kind: "approved";
    readonly candidate: CandidateRecord;
} | {
    readonly kind: "denied";
    readonly reasons: readonly string[];
};
/**
 * A review decision (used for the review trail).
 */
export interface ReviewDecision {
    readonly reviewer: string;
    readonly decision: "approve" | "reject" | "request_changes";
    readonly comment: string;
    readonly at: string;
}
/**
 * Inputs to create a new candidate.
 */
export interface ProposeCandidateInput {
    readonly assetKind: CandidateAssetKind;
    readonly assetId: string;
    readonly proposedVersion: string;
    readonly changeKind: CandidateChangeKind;
    readonly content: Readonly<Record<string, unknown>>;
    readonly proposedBy: string;
    readonly rationale: string;
    readonly evidenceRefs?: readonly string[];
    readonly supersedesCandidateId?: CandidateId;
    readonly supersedesVersion?: string;
}
/**
 * The GovernedEvolutionEngine interface.
 */
export interface GovernedEvolutionEngine {
    /**
     * Proposes a new candidate. The candidate starts as `proposed`.
     *
     * If `supersedesCandidateId` is set, the engine verifies the
     * superseded candidate exists in the store.
     */
    propose(input: ProposeCandidateInput): CandidateRecord;
    /**
     * Requests review of a candidate. Transitions the candidate
     * from `proposed` to `under_review`.
     */
    requestReview(candidateId: CandidateId, requestedBy: string, comment: string): CandidateRecord;
    /**
     * Records a review decision (approve / reject / request_changes).
     *
     * For `approve`: checks the governed rules. If all rules are
     * satisfied, transitions the candidate to `approved`. Otherwise,
     * the candidate stays `under_review` and the decision is recorded
     * in the review trail (the caller can request more reviews).
     *
     * For `reject`: transitions to `rejected`.
     *
     * For `request_changes`: transitions back to `proposed`.
     */
    recordReview(candidateId: CandidateId, decision: ReviewDecision): {
        readonly candidate: CandidateRecord;
        readonly approvalResult?: ApprovalResult;
    };
    /**
     * Convenience method: tries to approve a candidate. Returns the
     * approval result (does NOT throw on denial — denial is a
     * legitimate outcome, not an error).
     *
     * Throws if:
     *   - the candidate is not in `under_review` status
     *   - the candidate is not found
     */
    tryApprove(candidateId: CandidateId, reviewer: string, comment: string): ApprovalResult;
    /**
     * Supersedes a candidate: marks the old candidate as `superseded`
     * and registers the new candidate as the active version.
     *
     * The new candidate must already be in the store (added via `propose`
     * with `supersedesCandidateId` set to the old candidate's id).
     *
     * The old candidate must be in `approved` status (you can only
     * supersede approved candidates, not rejected or pending ones).
     */
    supersede(oldCandidateId: CandidateId, newCandidateId: CandidateId, actor: string, reason: string): {
        readonly oldCandidate: CandidateRecord;
        readonly newCandidate: CandidateRecord;
    };
    /**
     * Rolls back an approved candidate to `under_review` (re-evaluation).
     * The candidate is NOT deleted — the audit trail is preserved.
     *
     * Adds a review entry recording the rollback reason and actor.
     */
    rollback(candidateId: CandidateId, actor: string, reason: string): CandidateRecord;
    /**
     * Returns the version chain for an asset (delegates to the store).
     */
    getVersionChain(assetId: string): readonly CandidateRecord[];
    /**
     * Returns the active approved candidate for an asset (delegates to
     * the store).
     */
    getActiveApproved(assetId: string): CandidateRecord | undefined;
    /**
     * Returns a candidate by id.
     */
    getCandidate(id: CandidateId): CandidateRecord | undefined;
}
/**
 * Default GovernedEvolutionEngine implementation.
 *
 * The engine enforces the governed rules during `recordReview` (for
 * `approve` decisions) and `tryApprove`. The candidate is only
 * transitioned to `approved` when ALL applicable rules are satisfied.
 */
export declare class DefaultGovernedEvolutionEngine implements GovernedEvolutionEngine {
    private readonly store;
    private readonly rules;
    private readonly reviewDecisions;
    constructor(store: CandidateStore, rules?: GovernedRules);
    propose(input: ProposeCandidateInput): CandidateRecord;
    requestReview(candidateId: CandidateId, requestedBy: string, comment: string): CandidateRecord;
    recordReview(candidateId: CandidateId, decision: ReviewDecision): {
        readonly candidate: CandidateRecord;
        readonly approvalResult?: ApprovalResult;
    };
    tryApprove(candidateId: CandidateId, reviewer: string, comment: string): ApprovalResult;
    supersede(oldCandidateId: CandidateId, newCandidateId: CandidateId, actor: string, reason: string): {
        readonly oldCandidate: CandidateRecord;
        readonly newCandidate: CandidateRecord;
    };
    rollback(candidateId: CandidateId, actor: string, reason: string): CandidateRecord;
    getVersionChain(assetId: string): readonly CandidateRecord[];
    getActiveApproved(assetId: string): CandidateRecord | undefined;
    getCandidate(id: CandidateId): CandidateRecord | undefined;
    private checkGovernedRules;
    private appendReviewEntry;
}
//# sourceMappingURL=governed-evolution-engine.d.ts.map