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
import { asCandidateId, freshId } from "../core/identifiers.js";
import { ContractValidationError, LifecycleViolationError } from "../core/errors.js";
import type { ReviewEntry } from "../core/provenance.js";
import type { Provenance, ProvenanceSource } from "../core/provenance.js";

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
export const DEFAULT_GOVERNED_RULES: GovernedRules = {
  minimumReviewers: 1,
  requireSeparationOfDuties: true,
  requireEvidence: false,
};

/**
 * The result of an approval attempt. Either:
 *   - `kind: "approved"` — the candidate met all the rules
 *   - `kind: "denied"` — the candidate failed one or more rules
 */
export type ApprovalResult =
  | { readonly kind: "approved"; readonly candidate: CandidateRecord }
  | { readonly kind: "denied"; readonly reasons: readonly string[] };

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
  requestReview(
    candidateId: CandidateId,
    requestedBy: string,
    comment: string,
  ): CandidateRecord;

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
  recordReview(
    candidateId: CandidateId,
    decision: ReviewDecision,
  ): { readonly candidate: CandidateRecord; readonly approvalResult?: ApprovalResult };

  /**
   * Convenience method: tries to approve a candidate. Returns the
   * approval result (does NOT throw on denial — denial is a
   * legitimate outcome, not an error).
   *
   * Throws if:
   *   - the candidate is not in `under_review` status
   *   - the candidate is not found
   */
  tryApprove(
    candidateId: CandidateId,
    reviewer: string,
    comment: string,
  ): ApprovalResult;

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
  supersede(
    oldCandidateId: CandidateId,
    newCandidateId: CandidateId,
    actor: string,
    reason: string,
  ): { readonly oldCandidate: CandidateRecord; readonly newCandidate: CandidateRecord };

  /**
   * Rolls back an approved candidate to `under_review` (re-evaluation).
   * The candidate is NOT deleted — the audit trail is preserved.
   *
   * Adds a review entry recording the rollback reason and actor.
   */
  rollback(
    candidateId: CandidateId,
    actor: string,
    reason: string,
  ): CandidateRecord;

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
 *
 * Review decisions are derived from the candidate's persisted review
 * trail (`provenance.reviewTrail` entries carrying a `decision`
 * field) — NOT from in-memory state. This is deliberate: an approval
 * recorded before a process restart must still count after the
 * restart, and the project's own invariant is that governance state
 * survives the process ("records survive restart").
 */
export class DefaultGovernedEvolutionEngine implements GovernedEvolutionEngine {
  constructor(
    private readonly store: CandidateStore,
    private readonly rules: GovernedRules = DEFAULT_GOVERNED_RULES,
  ) {}

  /**
   * Rebuilds the ReviewDecision list for a candidate from its persisted
   * review trail. Entries without a `decision` field (plain lifecycle
   * transitions) are ignored.
   */
  private decisionsFromTrail(candidate: CandidateRecord): ReviewDecision[] {
    return (candidate.provenance.reviewTrail ?? [])
      .filter((e) => e.decision !== undefined)
      .map((e) => ({
        reviewer: e.actor,
        decision: e.decision!,
        comment: e.comment ?? "",
        at: e.at,
      }));
  }

  propose(input: ProposeCandidateInput): CandidateRecord {
    const nowIso = new Date().toISOString();
    const id: CandidateId = asCandidateId(freshId());

    // If supersedesCandidateId is set, verify the superseded candidate exists
    if (input.supersedesCandidateId !== undefined) {
      const superseded = this.store.get(input.supersedesCandidateId);
      if (!superseded) {
        throw new ContractValidationError(
          `Cannot propose candidate: supersedesCandidateId ${input.supersedesCandidateId} does not exist.`,
          { details: { supersedesCandidateId: input.supersedesCandidateId } },
        );
      }
      // For update/rollback/deprecate, the superseded candidate should be approved
      if (input.changeKind !== "create" && superseded.status !== "approved") {
        throw new ContractValidationError(
          `Cannot propose ${input.changeKind} candidate: the superseded candidate is not approved (status=${superseded.status}).`,
          {
            details: {
              supersedesCandidateId: input.supersedesCandidateId,
              supersedesStatus: superseded.status,
              changeKind: input.changeKind,
            },
          },
        );
      }
    } else {
      // No supersedes — changeKind MUST be `create`
      if (input.changeKind !== "create") {
        throw new ContractValidationError(
          `Cannot propose ${input.changeKind} candidate without supersedesCandidateId. ` +
            `Only 'create' candidates can be proposed without superseding another candidate.`,
          { details: { changeKind: input.changeKind } },
        );
      }
    }

    // Validate content if a validator is configured
    if (this.rules.contentValidator) {
      this.rules.contentValidator(input.content, input.assetKind);
    }

    // Require evidence if the rule is set
    if (this.rules.requireEvidence) {
      if (!input.evidenceRefs || input.evidenceRefs.length === 0) {
        throw new ContractValidationError(
          "Cannot propose candidate: requireEvidence is true but no evidenceRefs provided.",
          { details: { candidateId: id } },
        );
      }
    }

    // Build the provenance: starts as `observed` with a `human`-kind source
    const source: ProvenanceSource = {
      kind: "human",
      actor: input.proposedBy,
      at: nowIso,
    };
    const provenance: Provenance = {
      kind: "observed",
      source,
    };

    const candidate: CandidateRecord = {
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

  requestReview(
    candidateId: CandidateId,
    requestedBy: string,
    comment: string,
  ): CandidateRecord {
    const current = this.store.get(candidateId);
    if (!current) {
      throw new ContractValidationError(
        `Cannot request review: candidate not found: ${candidateId}`,
        { details: { candidateId } },
      );
    }
    if (current.status !== "proposed") {
      throw new LifecycleViolationError(
        `Cannot request review: candidate is in status ${current.status} (expected 'proposed').`,
        { details: { candidateId, status: current.status } },
      );
    }

    const nowIso = new Date().toISOString();
    const reviewEntry: Omit<ReviewEntry, "from" | "to"> = {
      at: nowIso,
      actor: requestedBy,
      reason: comment,
    };

    return this.store.transition(candidateId, "under_review", reviewEntry);
  }

  recordReview(
    candidateId: CandidateId,
    decision: ReviewDecision,
  ): { readonly candidate: CandidateRecord; readonly approvalResult?: ApprovalResult } {
    const current = this.store.get(candidateId);
    if (!current) {
      throw new ContractValidationError(
        `Cannot record review: candidate not found: ${candidateId}`,
        { details: { candidateId } },
      );
    }
    if (current.status !== "under_review") {
      throw new LifecycleViolationError(
        `Cannot record review: candidate is in status ${current.status} (expected 'under_review').`,
        { details: { candidateId, status: current.status } },
      );
    }

    // Decisions for the rules check: everything already persisted in
    // the review trail, plus the decision being recorded now.
    const decisions: ReviewDecision[] = [
      ...this.decisionsFromTrail(current),
      decision,
    ];

    const nowIso = new Date().toISOString();

    if (decision.decision === "approve") {
      // Check the governed rules
      const approval = this.checkGovernedRules(current, decisions);
      if (approval.kind === "approved") {
        const reviewEntry: Omit<ReviewEntry, "from" | "to"> = {
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
      const reviewEntry: Omit<ReviewEntry, "from" | "to"> = {
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
      const reviewEntry: Omit<ReviewEntry, "from" | "to"> = {
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
    const reviewEntry: Omit<ReviewEntry, "from" | "to"> = {
      at: nowIso,
      actor: decision.reviewer,
      reason: `Changes requested: ${decision.comment}`,
      decision: "request_changes",
      comment: decision.comment,
    };
    const updated = this.store.transition(candidateId, "proposed", reviewEntry);
    return { candidate: updated };
  }

  tryApprove(
    candidateId: CandidateId,
    reviewer: string,
    comment: string,
  ): ApprovalResult {
    const current = this.store.get(candidateId);
    if (!current) {
      throw new ContractValidationError(
        `Cannot try approve: candidate not found: ${candidateId}`,
        { details: { candidateId } },
      );
    }
    if (current.status !== "under_review") {
      throw new LifecycleViolationError(
        `Cannot try approve: candidate is in status ${current.status} (expected 'under_review').`,
        { details: { candidateId, status: current.status } },
      );
    }

    const decision: ReviewDecision = {
      reviewer,
      decision: "approve",
      comment,
      at: new Date().toISOString(),
    };

    const result = this.recordReview(candidateId, decision);
    return result.approvalResult ?? { kind: "approved", candidate: result.candidate };
  }

  supersede(
    oldCandidateId: CandidateId,
    newCandidateId: CandidateId,
    actor: string,
    reason: string,
  ): { readonly oldCandidate: CandidateRecord; readonly newCandidate: CandidateRecord } {
    const oldCandidate = this.store.get(oldCandidateId);
    if (!oldCandidate) {
      throw new ContractValidationError(
        `Cannot supersede: old candidate not found: ${oldCandidateId}`,
        { details: { oldCandidateId } },
      );
    }
    if (oldCandidate.status !== "approved") {
      throw new LifecycleViolationError(
        `Cannot supersede: old candidate is in status ${oldCandidate.status} (expected 'approved').`,
        { details: { oldCandidateId, status: oldCandidate.status } },
      );
    }

    const newCandidate = this.store.get(newCandidateId);
    if (!newCandidate) {
      throw new ContractValidationError(
        `Cannot supersede: new candidate not found: ${newCandidateId}`,
        { details: { newCandidateId } },
      );
    }
    if (newCandidate.supersedesCandidateId !== oldCandidateId) {
      throw new ContractValidationError(
        `Cannot supersede: new candidate ${newCandidateId} does not supersede ${oldCandidateId}.`,
        {
          details: {
            newCandidateId,
            expectedSupersedes: oldCandidateId,
            actualSupersedes: newCandidate.supersedesCandidateId,
          },
        },
      );
    }

    // The new candidate must be approved before it can be the active version
    if (newCandidate.status !== "approved") {
      throw new LifecycleViolationError(
        `Cannot supersede: new candidate is in status ${newCandidate.status} (expected 'approved'). ` +
          `The new candidate must be approved BEFORE it can supersede the old one.`,
        { details: { newCandidateId, status: newCandidate.status } },
      );
    }

    const nowIso = new Date().toISOString();
    const reviewEntry: Omit<ReviewEntry, "from" | "to"> = {
      at: nowIso,
      actor,
      reason: `Superseded by ${newCandidateId}: ${reason}`,
    };

    const updatedOld = this.store.transition(oldCandidateId, "superseded", reviewEntry);
    return { oldCandidate: updatedOld, newCandidate };
  }

  rollback(
    candidateId: CandidateId,
    actor: string,
    reason: string,
  ): CandidateRecord {
    const current = this.store.get(candidateId);
    if (!current) {
      throw new ContractValidationError(
        `Cannot rollback: candidate not found: ${candidateId}`,
        { details: { candidateId } },
      );
    }
    if (current.status !== "approved") {
      throw new LifecycleViolationError(
        `Cannot rollback: candidate is in status ${current.status} (only 'approved' can be rolled back).`,
        { details: { candidateId, status: current.status } },
      );
    }

    const nowIso = new Date().toISOString();
    const reviewEntry: Omit<ReviewEntry, "from" | "to"> = {
      at: nowIso,
      actor,
      reason: `Rollback: ${reason}`,
    };

    // Transition approved → under_review (rollback to re-evaluation)
    return this.store.transition(candidateId, "under_review", reviewEntry);
  }

  getVersionChain(assetId: string): readonly CandidateRecord[] {
    return this.store.getVersionChain(assetId);
  }

  getActiveApproved(assetId: string): CandidateRecord | undefined {
    return this.store.getActiveApproved(assetId);
  }

  getCandidate(id: CandidateId): CandidateRecord | undefined {
    return this.store.get(id);
  }

  // ─── Internal: governed rules check ───

  private checkGovernedRules(
    candidate: CandidateRecord,
    decisions: readonly ReviewDecision[],
  ): ApprovalResult {
    const reasons: string[] = [];

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
      reasons.push(
        `Minimum ${this.rules.minimumReviewers} reviewer(s) required; only ${uniqueApprovers.size} qualifying approver(s).`,
      );
    }

    // 2. Content validation (if a validator is configured)
    if (this.rules.contentValidator) {
      try {
        this.rules.contentValidator(candidate.content, candidate.assetKind);
      } catch (e) {
        reasons.push(`Content validation failed: ${(e as Error).message}`);
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
