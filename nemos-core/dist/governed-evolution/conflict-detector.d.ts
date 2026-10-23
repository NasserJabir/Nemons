/**
 * Nemons Governed Evolution — Conflict Detector
 *
 * The ConflictDetector identifies conflicts before a supersede operation
 * is attempted. It is the canonical pre-flight check for Stage H's
 * "optimistic concurrency" requirement.
 *
 * Architectural principles enforced here:
 *   - "Prevent approval of conflicting candidates for the same asset":
 *     when two candidates supersede the same baseline, only one can
 *     become the active approved. The detector identifies this BEFORE
 *     the supersede is attempted, so the caller gets a clear conflict
 *     reason instead of a generic "not approved" error.
 *   - "Detect baseline version change since candidate creation": the
 *     detector verifies that the new candidate's `supersedesVersion`
 *     matches the old candidate's `proposedVersion`. A mismatch means
 *     the baseline has moved since the new candidate was proposed.
 *   - "Optimistic concurrency": the detector's check is the
 *     "compare" half of compare-and-swap; the supersede operation
 *     is the "swap" half. Together they implement optimistic
 *     concurrency on the candidate version chain.
 *
 * Conflict kinds detected:
 *   - `no_conflict` — proceed with the supersede.
 *   - `missing_candidate` — one of the candidates does not exist.
 *   - `not_approved` — one of the candidates is not in `approved` status.
 *   - `wrong_supersedes_link` — the new candidate does not supersede the
 *     old candidate (link mismatch).
 *   - `already_superseded` — the old candidate has already been
 *     superseded by another candidate (the baseline has moved).
 *   - `stale_baseline` — the new candidate's `supersedesVersion` does
 *     not match the old candidate's `proposedVersion` (the candidate
 *     was proposed against a different baseline).
 */
import type { CandidateRecord } from "../schemas/candidate.js";
import type { CandidateStore } from "./candidate-store.js";
import type { CandidateId } from "../core/identifiers.js";
/**
 * The result of a conflict detection check.
 *
 * Either `no_conflict` (proceed with supersede) or one of the conflict
 * kinds (do NOT proceed; the conflict reason is recorded in the
 * DecisionLog).
 */
export type ConflictResult = {
    readonly kind: "no_conflict";
} | {
    readonly kind: "missing_candidate";
    readonly missingId: CandidateId;
    readonly missingRole: "old" | "new";
} | {
    readonly kind: "not_approved";
    readonly candidateId: CandidateId;
    readonly role: "old" | "new";
    readonly status: CandidateRecord["status"];
} | {
    readonly kind: "wrong_supersedes_link";
    readonly newCandidateId: CandidateId;
    readonly expectedSupersedesId: CandidateId;
    readonly actualSupersedesId: CandidateId | undefined;
} | {
    readonly kind: "already_superseded";
    readonly oldCandidateId: CandidateId;
    readonly currentStatus: CandidateRecord["status"];
} | {
    readonly kind: "stale_baseline";
    readonly newCandidateId: CandidateId;
    readonly expectedBaselineVersion: string;
    readonly actualActiveVersion: string;
    readonly actualActiveId: CandidateId;
};
/**
 * The ConflictDetector interface.
 */
export interface ConflictDetector {
    /**
     * Detects conflicts for a proposed supersede(oldId, newId) operation.
     *
     * Returns `no_conflict` if the supersede can proceed safely. Otherwise
     * returns a conflict result with the specific reason.
     *
     * The check is READ-ONLY: it does NOT modify any state. The caller
     * is responsible for atomically performing the supersede after a
     * `no_conflict` result.
     *
     * NOTE: The check is non-locking. In a concurrent environment, the
     * state may change between the check and the supersede. The
     * `ConflictResolutionEngine.trySupersede` method handles this by
     * re-checking atomically during the supersede.
     */
    detectConflict(oldCandidateId: CandidateId, newCandidateId: CandidateId): ConflictResult;
}
/**
 * Default ConflictDetector implementation.
 *
 * The detector performs the following checks in order:
 *   1. Both candidates exist in the store.
 *   2. Both candidates are in `approved` status.
 *   3. The new candidate's `supersedesCandidateId` equals the old
 *      candidate's id (the link is correct).
 *   4. The old candidate is NOT already superseded (no other
 *      candidate has superseded it).
 *   5. The new candidate's `supersedesVersion` matches the old
 *      candidate's `proposedVersion` (no baseline drift).
 *
 * If any check fails, the corresponding conflict result is returned.
 * If all checks pass, `no_conflict` is returned.
 */
export declare class DefaultConflictDetector implements ConflictDetector {
    private readonly store;
    constructor(store: CandidateStore);
    detectConflict(oldCandidateId: CandidateId, newCandidateId: CandidateId): ConflictResult;
}
/**
 * Returns true iff the conflict result indicates the supersede should
 * NOT proceed (i.e., it's any kind other than `no_conflict`).
 */
export declare function isConflict(result: ConflictResult): boolean;
/**
 * Returns a human-readable description of the conflict.
 * Useful for the DecisionLog and for error messages.
 */
export declare function describeConflict(result: ConflictResult): string;
//# sourceMappingURL=conflict-detector.d.ts.map