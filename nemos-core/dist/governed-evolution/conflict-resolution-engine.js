/**
 * Nemons Governed Evolution — Conflict Resolution Engine
 *
 * The ConflictResolutionEngine wraps the GovernedEvolutionEngine to
 * add conflict detection and decision logging. It is the canonical
 * entry point for Stage H's "optimistic concurrency" requirement.
 *
 * Architectural principles enforced here:
 *   - "Prevent conflicting candidates for the same asset": the
 *     `trySupersede` method atomically checks for conflicts and
 *     performs the supersede ONLY if no conflict is detected.
 *   - "Detect baseline version change": the engine re-checks the
 *     baseline DURING the supersede (not just before) to catch
 *     concurrent modifications.
 *   - "Optimistic concurrency": the check-and-swap is atomic. If
 *     the state has changed between the check and the swap, the
 *     supersede is rejected with a `stale_baseline` conflict.
 *   - "Preserve decision log and rejection reasons": every
 *     supersede (successful or rejected) is recorded in the
 *     DecisionLog with the actor, reason, and (for rejections) the
 *     conflict result.
 *
 * The ConflictResolutionEngine does NOT replace the
 * GovernedEvolutionEngine — it WRAPS it. The underlying engine
 * remains available for direct use (without conflict detection /
 * logging) when those features are not needed.
 */
import { ContractValidationError } from "../core/errors.js";
import { DefaultConflictDetector, isConflict, describeConflict, } from "./conflict-detector.js";
import { InMemoryDecisionLog } from "./decision-log.js";
/**
 * Default ConflictResolutionEngine implementation.
 *
 * Wraps a GovernedEvolutionEngine with:
 *   - A ConflictDetector (DefaultConflictDetector by default)
 *   - A DecisionLog (InMemoryDecisionLog by default)
 *
 * The wrapper is non-destructive: the underlying engine remains
 * usable directly. The wrapper adds conflict detection + decision
 * logging for callers who need those features.
 */
export class DefaultConflictResolutionEngine {
    engine;
    store;
    conflictDetector;
    decisionLog;
    constructor(engine, store, options) {
        this.engine = engine;
        this.store = store;
        this.conflictDetector = options?.conflictDetector ?? new DefaultConflictDetector(store);
        this.decisionLog = options?.decisionLog ?? new InMemoryDecisionLog();
    }
    trySupersede(oldCandidateId, newCandidateId, actor, reason) {
        // 1. Pre-flight conflict detection
        const conflict = this.conflictDetector.detectConflict(oldCandidateId, newCandidateId);
        if (isConflict(conflict)) {
            // Record the rejection
            const description = describeConflict(conflict);
            const oldCandidate = this.store.get(oldCandidateId);
            const newCandidate = this.store.get(newCandidateId);
            const conflictKind = conflict.kind === "stale_baseline" ? "stale_baseline_rejection" : "conflict_resolution";
            this.decisionLog.record({
                kind: conflictKind,
                actor,
                candidateId: newCandidateId,
                oldCandidateId,
                newCandidateId,
                assetId: newCandidate?.assetId ?? oldCandidate?.assetId,
                reason: `${description}. Caller reason: ${reason}`,
                conflict,
            });
            return { kind: "conflict", conflict, description };
        }
        // 2. Attempt the supersede
        try {
            const result = this.engine.supersede(oldCandidateId, newCandidateId, actor, reason);
            // Record the successful supersede
            this.decisionLog.record({
                kind: "supersede",
                actor,
                oldCandidateId,
                newCandidateId,
                assetId: result.newCandidate.assetId,
                reason,
            });
            return {
                kind: "succeeded",
                oldCandidate: result.oldCandidate,
                newCandidate: result.newCandidate,
            };
        }
        catch (e) {
            // 3. The supersede failed — re-detect the conflict to get the
            //    current state (the failure may be due to a concurrent
            //    modification that happened between the pre-flight check
            //    and the supersede attempt)
            const newConflict = this.conflictDetector.detectConflict(oldCandidateId, newCandidateId);
            const description = isConflict(newConflict)
                ? describeConflict(newConflict)
                : `Supersede failed unexpectedly: ${e.message}`;
            this.decisionLog.record({
                kind: "conflict_resolution",
                actor,
                candidateId: newCandidateId,
                oldCandidateId,
                newCandidateId,
                assetId: this.store.get(newCandidateId)?.assetId,
                reason: `${description}. Caller reason: ${reason}`,
                conflict: isConflict(newConflict) ? newConflict : undefined,
            });
            return {
                kind: "conflict",
                conflict: isConflict(newConflict) ? newConflict : { kind: "no_conflict" },
                description,
            };
        }
    }
    detectBaselineDrift(candidateId) {
        const candidate = this.store.get(candidateId);
        if (!candidate) {
            throw new ContractValidationError(`Cannot detect baseline drift: candidate not found: ${candidateId}`, { details: { candidateId } });
        }
        // If the candidate doesn't supersede anything, there's no
        // baseline to drift from.
        if (candidate.supersedesCandidateId === undefined) {
            return { kind: "fresh" };
        }
        // Find the current active approved for this asset
        const activeApproved = this.store.getActiveApproved(candidate.assetId);
        if (!activeApproved) {
            // No active approved — the candidate's baseline is gone (or never existed)
            return {
                kind: "stale",
                currentActiveVersion: "none",
                currentActiveId: undefined,
            };
        }
        // If the active approved IS the candidate's supersedesCandidateId,
        // the baseline is fresh.
        if (activeApproved.id === candidate.supersedesCandidateId) {
            return { kind: "fresh" };
        }
        // Otherwise, the baseline has moved
        return {
            kind: "stale",
            currentActiveVersion: activeApproved.proposedVersion,
            currentActiveId: activeApproved.id,
        };
    }
    getConflictDetector() {
        return this.conflictDetector;
    }
    getDecisionLog() {
        return this.decisionLog;
    }
}
//# sourceMappingURL=conflict-resolution-engine.js.map