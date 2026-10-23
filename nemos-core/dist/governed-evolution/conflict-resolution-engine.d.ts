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
import type { CandidateRecord } from "../schemas/candidate.js";
import type { CandidateId } from "../core/identifiers.js";
import type { GovernedEvolutionEngine } from "./governed-evolution-engine.js";
import type { CandidateStore } from "./candidate-store.js";
import type { ConflictDetector, ConflictResult } from "./conflict-detector.js";
import type { DecisionLog } from "./decision-log.js";
/**
 * The result of a `trySupersede` call.
 *
 * Either:
 *   - `succeeded`: the supersede was completed atomically. Both the
 *     old candidate (now superseded) and new candidate (now active
 *     approved) are returned.
 *   - `conflict`: the supersede was rejected due to a conflict.
 *     The conflict result is included; the caller can inspect it
 *     and the DecisionLog entry that recorded the rejection.
 */
export type TrySupersedeResult = {
    readonly kind: "succeeded";
    readonly oldCandidate: CandidateRecord;
    readonly newCandidate: CandidateRecord;
} | {
    readonly kind: "conflict";
    readonly conflict: ConflictResult;
    readonly description: string;
};
/**
 * The ConflictResolutionEngine interface.
 */
export interface ConflictResolutionEngine {
    /**
     * Attempts to supersede the old candidate with the new candidate.
     *
     * The check-and-swap is atomic: the conflict detector runs first;
     * if no conflict is detected, the supersede is performed; if the
     * supersede fails (e.g., due to a concurrent modification), the
     * conflict is re-detected and the rejection is recorded.
     *
     * Returns `succeeded` if the supersede completed, or `conflict`
     * with the specific conflict reason if it was rejected.
     *
     * Either way, the decision is recorded in the DecisionLog.
     */
    trySupersede(oldCandidateId: CandidateId, newCandidateId: CandidateId, actor: string, reason: string): TrySupersedeResult;
    /**
     * Detects whether a candidate's baseline has drifted since it was
     * proposed. Useful BEFORE requesting review — if the baseline has
     * moved, the candidate may need to be re-proposed against the new
     * baseline.
     *
     * Returns `fresh` if the candidate's baseline matches the current
     * active approved for its asset. Returns `stale` with the current
     * active version if the baseline has moved.
     */
    detectBaselineDrift(candidateId: CandidateId): {
        kind: "fresh";
    } | {
        kind: "stale";
        currentActiveVersion: string;
        currentActiveId: CandidateId | undefined;
    };
    /**
     * Returns the underlying ConflictDetector (for direct queries).
     */
    getConflictDetector(): ConflictDetector;
    /**
     * Returns the underlying DecisionLog (for audit queries).
     */
    getDecisionLog(): DecisionLog;
}
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
export declare class DefaultConflictResolutionEngine implements ConflictResolutionEngine {
    private readonly engine;
    private readonly store;
    private readonly conflictDetector;
    private readonly decisionLog;
    constructor(engine: GovernedEvolutionEngine, store: CandidateStore, options?: {
        readonly conflictDetector?: ConflictDetector;
        readonly decisionLog?: DecisionLog;
    });
    trySupersede(oldCandidateId: CandidateId, newCandidateId: CandidateId, actor: string, reason: string): TrySupersedeResult;
    detectBaselineDrift(candidateId: CandidateId): {
        kind: "fresh";
    } | {
        kind: "stale";
        currentActiveVersion: string;
        currentActiveId: CandidateId | undefined;
    };
    getConflictDetector(): ConflictDetector;
    getDecisionLog(): DecisionLog;
}
//# sourceMappingURL=conflict-resolution-engine.d.ts.map