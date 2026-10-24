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
import { asCandidateId, freshId } from "../core/identifiers.js";
import { ContractValidationError, LifecycleViolationError } from "../core/errors.js";
/**
 * Default governed rules. Encodes the architectural baseline:
 *   - minimumReviewers: 1 (at least one reviewer must approve)
 *   - requireSeparationOfDuties: true (proposedBy cannot self-approve)
 *   - requireEvidence: false (configurable per deployment)
 */
export const DEFAULT_GOVERNED_RULES = {
    minimumReviewers: 1,
    requireSeparationOfDuties: true,
    requireEvidence: false,
};
/**
 * Default GovernedEvolutionEngine implementation.
 *
 * The engine enforces the governed rules during `recordReview` (for
 * `approve` decisions) and `tryApprove`. The candidate is only
 * transitioned to `approved` when ALL applicable rules are satisfied.
 *
 * Review decisions are derived from the candidate's persisted review
 * trail (`provenance.reviewTrail` entries carrying a `decision`
 * field) — NOT from in-memory state. This is deliberate: an approval
 * recorded before a process restart must still count after the
 * restart, and the project's own invariant is that governance state
 * survives the process ("records survive restart").
 */
export class DefaultGovernedEvolutionEngine {
    store;
    rules;
    constructor(store, rules = DEFAULT_GOVERNED_RULES) {
        this.store = store;
        this.rules = rules;
    }
    /**
     * Rebuilds the ReviewDecision list for a candidate from its persisted
     * review trail. Entries without a `decision` field (plain lifecycle
     * transitions) are ignored.
     */
    decisionsFromTrail(candidate) {
        return (candidate.provenance.reviewTrail ?? [])
            .filter((e) => e.decision !== undefined)
            .map((e) => ({
            reviewer: e.actor,
            decision: e.decision,
            comment: e.comment ?? "",
            at: e.at,
        }));
    }
    propose(input) {
        const nowIso = new Date().toISOString();
        const id = asCandidateId(freshId());
        // If supersedesCandidateId is set, verify the superseded candidate exists
        if (input.supersedesCandidateId !== undefined) {
            const superseded = this.store.get(input.supersedesCandidateId);
            if (!superseded) {
                throw new ContractValidationError(`Cannot propose candidate: supersedesCandidateId ${input.supersedesCandidateId} does not exist.`, { details: { supersedesCandidateId: input.supersedesCandidateId } });
            }
            // For update/rollback/deprecate, the superseded candidate should be approved
            if (input.changeKind !== "create" && superseded.status !== "approved") {
                throw new ContractValidationError(`Cannot propose ${input.changeKind} candidate: the superseded candidate is not approved (status=${superseded.status}).`, {
                    details: {
                        supersedesCandidateId: input.supersedesCandidateId,
                        supersedesStatus: superseded.status,
                        changeKind: input.changeKind,
                    },
                });
            }
        }
        else {
            // No supersedes — changeKind MUST be `create`
            if (input.changeKind !== "create") {
                throw new ContractValidationError(`Cannot propose ${input.changeKind} candidate without supersedesCandidateId. ` +
                    `Only 'create' candidates can be proposed without superseding another candidate.`, { details: { changeKind: input.changeKind } });
            }
        }
        // Validate content if a validator is configured
        if (this.rules.contentValidator) {
            this.rules.contentValidator(input.content, input.assetKind);
        }
        // Require evidence if the rule is set
        if (this.rules.requireEvidence) {
            if (!input.evidenceRefs || input.evidenceRefs.length === 0) {
                throw new ContractValidationError("Cannot propose candidate: requireEvidence is true but no evidenceRefs provided.", { details: { candidateId: id } });
            }
        }
        // Build the provenance: starts as `observed` with a `human`-kind source
        const source = {
            kind: "human",
            actor: input.proposedBy,
            at: nowIso,
        };
        const provenance = {
            kind: "observed",
            source,
        };
        const candidate = {
            id,
            assetKind: input.assetKind,
            assetId: input.assetId,
            proposedVersion: input.proposedVersion,
            changeKind: input.changeKind,
            content: input.content,
            provenance,
            status: "proposed",
            proposedBy: input.proposedBy,
            proposedAt: nowIso,
            rationale: input.rationale,
            evidenceRefs: input.evidenceRefs,
            reviewTrail: [],
            supersedesCandidateId: input.supersedesCandidateId,
            supersedesVersion: input.supersedesVersion,
        };
        return this.store.add(candidate);
    }
    requestReview(candidateId, requestedBy, comment) {
        const current = this.store.get(candidateId);
        if (!current) {
            throw new ContractValidationError(`Cannot request review: candidate not found: ${candidateId}`, { details: { candidateId } });
        }
        if (current.status !== "proposed") {
            throw new LifecycleViolationError(`Cannot request review: candidate is in status ${current.status} (expected 'proposed').`, { details: { candidateId, status: current.status } });
        }
        const nowIso = new Date().toISOString();
        const reviewEntry = {
            at: nowIso,
            actor: requestedBy,
            reason: comment,
        };
        return this.store.transition(candidateId, "under_review", reviewEntry);
    }
    recordReview(candidateId, decision) {
        const current = this.store.get(candidateId);
        if (!current) {
            throw new ContractValidationError(`Cannot record review: candidate not found: ${candidateId}`, { details: { candidateId } });
        }
        if (current.status !== "under_review") {
            throw new LifecycleViolationError(`Cannot record review: candidate is in status ${current.status} (expected 'under_review').`, { details: { candidateId, status: current.status } });
        }
        // Decisions for the rules check: everything already persisted in
        // the review trail, plus the decision being recorded now.
        const decisions = [
            ...this.decisionsFromTrail(current),
            decision,
        ];
        const nowIso = new Date().toISOString();
        if (decision.decision === "approve") {
            // Check the governed rules
            const approval = this.checkGovernedRules(current, decisions);
            if (approval.kind === "approved") {
                const reviewEntry = {
                    at: nowIso,
                    actor: decision.reviewer,
                    reason: decision.comment,
                    decision: "approve",
                    comment: decision.comment,
                };
                const updated = this.store.transition(candidateId, "approved", reviewEntry);
                return { candidate: updated, approvalResult: approval };
            }
            // Rules not satisfied — persist the decision on the trail and
            // stay in under_review. (Previously the engine built the updated
            // record but never stored it, so this approval silently vanished
            // from the persisted view — and from any restart.)
            const reviewEntry = {
                at: nowIso,
                actor: decision.reviewer,
                reason: `Approval recorded but rules not yet satisfied: ${approval.reasons.join("; ")}`,
                decision: "approve",
                comment: decision.comment,
            };
            const updated = this.store.appendReviewTrail(candidateId, reviewEntry);
            return { candidate: updated, approvalResult: approval };
        }
        if (decision.decision === "reject") {
            const reviewEntry = {
                at: nowIso,
                actor: decision.reviewer,
                reason: `Rejected: ${decision.comment}`,
                decision: "reject",
                comment: decision.comment,
            };
            const updated = this.store.transition(candidateId, "rejected", reviewEntry);
            return { candidate: updated };
        }
        // request_changes: transition back to proposed
        const reviewEntry = {
            at: nowIso,
            actor: decision.reviewer,
            reason: `Changes requested: ${decision.comment}`,
            decision: "request_changes",
            comment: decision.comment,
        };
        const updated = this.store.transition(candidateId, "proposed", reviewEntry);
        return { candidate: updated };
    }
    tryApprove(candidateId, reviewer, comment) {
        const current = this.store.get(candidateId);
        if (!current) {
            throw new ContractValidationError(`Cannot try approve: candidate not found: ${candidateId}`, { details: { candidateId } });
        }
        if (current.status !== "under_review") {
            throw new LifecycleViolationError(`Cannot try approve: candidate is in status ${current.status} (expected 'under_review').`, { details: { candidateId, status: current.status } });
        }
        const decision = {
            reviewer,
            decision: "approve",
            comment,
            at: new Date().toISOString(),
        };
        const result = this.recordReview(candidateId, decision);
        return result.approvalResult ?? { kind: "approved", candidate: result.candidate };
    }
    supersede(oldCandidateId, newCandidateId, actor, reason) {
        const oldCandidate = this.store.get(oldCandidateId);
        if (!oldCandidate) {
            throw new ContractValidationError(`Cannot supersede: old candidate not found: ${oldCandidateId}`, { details: { oldCandidateId } });
        }
        if (oldCandidate.status !== "approved") {
            throw new LifecycleViolationError(`Cannot supersede: old candidate is in status ${oldCandidate.status} (expected 'approved').`, { details: { oldCandidateId, status: oldCandidate.status } });
        }
        const newCandidate = this.store.get(newCandidateId);
        if (!newCandidate) {
            throw new ContractValidationError(`Cannot supersede: new candidate not found: ${newCandidateId}`, { details: { newCandidateId } });
        }
        if (newCandidate.supersedesCandidateId !== oldCandidateId) {
            throw new ContractValidationError(`Cannot supersede: new candidate ${newCandidateId} does not supersede ${oldCandidateId}.`, {
                details: {
                    newCandidateId,
                    expectedSupersedes: oldCandidateId,
                    actualSupersedes: newCandidate.supersedesCandidateId,
                },
            });
        }
        // The new candidate must be approved before it can be the active version
        if (newCandidate.status !== "approved") {
            throw new LifecycleViolationError(`Cannot supersede: new candidate is in status ${newCandidate.status} (expected 'approved'). ` +
                `The new candidate must be approved BEFORE it can supersede the old one.`, { details: { newCandidateId, status: newCandidate.status } });
        }
        const nowIso = new Date().toISOString();
        const reviewEntry = {
            at: nowIso,
            actor,
            reason: `Superseded by ${newCandidateId}: ${reason}`,
        };
        const updatedOld = this.store.transition(oldCandidateId, "superseded", reviewEntry);
        return { oldCandidate: updatedOld, newCandidate };
    }
    rollback(candidateId, actor, reason) {
        const current = this.store.get(candidateId);
        if (!current) {
            throw new ContractValidationError(`Cannot rollback: candidate not found: ${candidateId}`, { details: { candidateId } });
        }
        if (current.status !== "approved") {
            throw new LifecycleViolationError(`Cannot rollback: candidate is in status ${current.status} (only 'approved' can be rolled back).`, { details: { candidateId, status: current.status } });
        }
        const nowIso = new Date().toISOString();
        const reviewEntry = {
            at: nowIso,
            actor,
            reason: `Rollback: ${reason}`,
        };
        // Transition approved → under_review (rollback to re-evaluation)
        return this.store.transition(candidateId, "under_review", reviewEntry);
    }
    getVersionChain(assetId) {
        return this.store.getVersionChain(assetId);
    }
    getActiveApproved(assetId) {
        return this.store.getActiveApproved(assetId);
    }
    getCandidate(id) {
        return this.store.get(id);
    }
    // ─── Internal: governed rules check ───
    checkGovernedRules(candidate, decisions) {
        const reasons = [];
        // 1. Count approving reviewers (excluding the proposedBy if separation of duties is required)
        const approvingReviewers = decisions
            .filter((d) => d.decision === "approve")
            .map((d) => d.reviewer);
        const uniqueApprovers = new Set(approvingReviewers);
        if (this.rules.requireSeparationOfDuties) {
            // Remove the proposedBy actor from the set
            uniqueApprovers.delete(candidate.proposedBy);
        }
        if (uniqueApprovers.size < this.rules.minimumReviewers) {
            reasons.push(`Minimum ${this.rules.minimumReviewers} reviewer(s) required; only ${uniqueApprovers.size} qualifying approver(s).`);
        }
        // 2. Content validation (if a validator is configured)
        if (this.rules.contentValidator) {
            try {
                this.rules.contentValidator(candidate.content, candidate.assetKind);
            }
            catch (e) {
                reasons.push(`Content validation failed: ${e.message}`);
            }
        }
        // 3. Evidence requirement
        if (this.rules.requireEvidence) {
            if (!candidate.evidenceRefs || candidate.evidenceRefs.length === 0) {
                reasons.push("requireEvidence is true but no evidenceRefs provided.");
            }
        }
        if (reasons.length > 0) {
            return { kind: "denied", reasons };
        }
        return { kind: "approved", candidate };
    }
}
//# sourceMappingURL=governed-evolution-engine.js.map