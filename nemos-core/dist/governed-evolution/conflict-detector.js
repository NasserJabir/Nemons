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
export class DefaultConflictDetector {
    store;
    constructor(store) {
        this.store = store;
    }
    detectConflict(oldCandidateId, newCandidateId) {
        // 1. Both candidates exist
        const oldCandidate = this.store.get(oldCandidateId);
        if (!oldCandidate) {
            return {
                kind: "missing_candidate",
                missingId: oldCandidateId,
                missingRole: "old",
            };
        }
        const newCandidate = this.store.get(newCandidateId);
        if (!newCandidate) {
            return {
                kind: "missing_candidate",
                missingId: newCandidateId,
                missingRole: "new",
            };
        }
        // 2. Already-superseded check (BEFORE the not-approved check, so
        //    we provide the clearer "already_superseded" conflict reason
        //    instead of the generic "not_approved" one)
        if (oldCandidate.status === "superseded") {
            return {
                kind: "already_superseded",
                oldCandidateId,
                currentStatus: oldCandidate.status,
            };
        }
        // 3. Both are approved
        if (oldCandidate.status !== "approved") {
            return {
                kind: "not_approved",
                candidateId: oldCandidateId,
                role: "old",
                status: oldCandidate.status,
            };
        }
        if (newCandidate.status !== "approved") {
            return {
                kind: "not_approved",
                candidateId: newCandidateId,
                role: "new",
                status: newCandidate.status,
            };
        }
        // 4. Link check
        if (newCandidate.supersedesCandidateId !== oldCandidateId) {
            return {
                kind: "wrong_supersedes_link",
                newCandidateId,
                expectedSupersedesId: oldCandidateId,
                actualSupersedesId: newCandidate.supersedesCandidateId,
            };
        }
        // 5. Stale baseline check
        // The new candidate's `supersedesVersion` should match the old
        // candidate's `proposedVersion`. If the new candidate was proposed
        // against a different baseline (e.g., the new candidate was
        // proposed when v1 was active, but v1 has since been superseded
        // by v2, and now the new candidate is being applied against v2),
        // the supersedesVersion will not match.
        if (newCandidate.supersedesVersion !== undefined &&
            newCandidate.supersedesVersion !== oldCandidate.proposedVersion) {
            // Find the current active approved for the asset (for the report)
            const activeApproved = this.store.getActiveApproved(oldCandidate.assetId);
            return {
                kind: "stale_baseline",
                newCandidateId,
                expectedBaselineVersion: oldCandidate.proposedVersion,
                actualActiveVersion: activeApproved?.proposedVersion ?? "unknown",
                actualActiveId: activeApproved?.id ?? "unknown",
            };
        }
        // All checks passed — no conflict
        return { kind: "no_conflict" };
    }
}
/**
 * Returns true iff the conflict result indicates the supersede should
 * NOT proceed (i.e., it's any kind other than `no_conflict`).
 */
export function isConflict(result) {
    return result.kind !== "no_conflict";
}
/**
 * Returns a human-readable description of the conflict.
 * Useful for the DecisionLog and for error messages.
 */
export function describeConflict(result) {
    switch (result.kind) {
        case "no_conflict":
            return "No conflict detected.";
        case "missing_candidate":
            return `Missing ${result.missingRole} candidate: ${result.missingId}`;
        case "not_approved":
            return `${result.role} candidate ${result.candidateId} is not approved (status=${result.status})`;
        case "wrong_supersedes_link":
            return `New candidate ${result.newCandidateId} does not supersede ${result.expectedSupersedesId} (actual: ${result.actualSupersedesId ?? "none"})`;
        case "already_superseded":
            return `Old candidate ${result.oldCandidateId} has already been superseded (current status=${result.currentStatus})`;
        case "stale_baseline":
            return `Stale baseline: new candidate ${result.newCandidateId} expected version ${result.expectedBaselineVersion}, but the active approved is ${result.actualActiveVersion} (id=${result.actualActiveId})`;
    }
}
//# sourceMappingURL=conflict-detector.js.map