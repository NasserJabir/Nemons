/**
 * Nemons Persistence — Cross-Reference Checker
 *
 * The CrossReferenceChecker verifies that references between
 * persistent records are consistent. Specifically:
 *
 *   - Every Evidence record's `runId` MUST reference an existing
 *     (healthy) Run in the PersistentRunStore. Otherwise the
 *     Evidence is "orphaned" — its source Run is missing.
 *   - Every Experience record's `runId` SHOULD reference an existing
 *     (healthy) Run. Otherwise the Experience is "orphaned".
 *   - Every Experience record's `evaluationId` references an
 *     Evaluation (which is in-memory, not persistent — so this check
 *     only applies within the current session).
 *   - Every Candidate record's `supersedesCandidateId` SHOULD
 *     reference an existing Candidate (already enforced by the
 *     CandidateStore at add() time).
 *
 * Architectural principles enforced here:
 *   - "Maintain reference consistency between Run, Evaluation,
 *     and Experience" — the checker detects orphaned records.
 *   - "An incomplete record is not a verified success" — orphaned
 *     Evidence cannot be used to support a verified-succeeded claim
 *     (the source Run is missing, so the claim cannot be traced
 *     back to a real execution).
 *   - "Rebuild relationships after restart" — the checker can be
 *     run on startup to detect orphaned records before they're used.
 *
 * The checker is non-destructive: it reports orphans but does NOT
 * quarantine or delete them. The caller decides what to do.
 */
import type { PersistentRunStore } from "./persistent-run-store.js";
import type { PersistentEvidenceStore } from "./persistent-evidence-store.js";
import type { PersistentExperienceStore } from "./persistent-experience-store.js";
import type { PersistentCandidateStore } from "./persistent-candidate-store.js";
/**
 * The result of a cross-reference check.
 *
 * `healthy` records have all their references satisfied.
 * `orphaned` records have at least one missing reference.
 */
export interface CrossReferenceReport {
    readonly checkedAt: string;
    readonly totalEvidence: number;
    readonly healthyEvidence: readonly string[];
    readonly orphanedEvidence: readonly {
        readonly evidenceId: string;
        readonly missingRunId: string;
    }[];
    readonly totalExperiences: number;
    readonly healthyExperiences: readonly string[];
    readonly orphanedExperiences: readonly {
        readonly experienceId: string;
        readonly missingRunId: string;
    }[];
    readonly experiencesWithMissingEvaluation: readonly {
        readonly experienceId: string;
        readonly missingEvaluationId: string;
    }[];
    readonly totalCandidates: number;
    readonly healthyCandidates: readonly string[];
    readonly orphanedCandidates: readonly {
        readonly candidateId: string;
        readonly missingSupersedesCandidateId: string;
    }[];
}
/**
 * The CrossReferenceChecker interface.
 */
export interface CrossReferenceChecker {
    /**
     * Runs a full cross-reference check across all provided stores.
     * Returns a report listing healthy + orphaned records.
     *
     * The check is non-destructive: orphaned records are NOT
     * quarantined or deleted. The caller decides what to do.
     */
    check(): Promise<CrossReferenceReport>;
}
/**
 * The set of persistent stores the checker operates on.
 *
 * Each store is OPTIONAL — the checker skips checks for missing
 * stores. This allows partial checks (e.g., only Run + Evidence,
 * without Experience or Candidate).
 */
export interface CrossReferenceCheckerStores {
    readonly runStore?: PersistentRunStore;
    readonly evidenceStore?: PersistentEvidenceStore;
    readonly experienceStore?: PersistentExperienceStore;
    readonly candidateStore?: PersistentCandidateStore;
}
/**
 * Default CrossReferenceChecker implementation.
 *
 * Algorithm:
 *   1. Load all records from each provided store.
 *   2. Build lookup sets: { runId, evidenceId, experienceId, candidateId }.
 *   3. For each Evidence, check that runId exists in the Run set.
 *   4. For each Experience, check that runId exists in the Run set.
 *   5. For each Experience, check that evaluationId exists in the
 *      Evaluation set — but Evaluations are in-memory, so this check
 *      only applies if a session-provided Evaluation set is passed.
 *   6. For each Candidate with supersedesCandidateId, check that the
 *      referenced candidate exists.
 */
export declare class DefaultCrossReferenceChecker implements CrossReferenceChecker {
    private readonly stores;
    /**
     * Optional in-session Evaluation ids. Used to verify that
     * Experience.evaluationId references an existing Evaluation.
     * If omitted, the Experience ↔ Evaluation check is skipped.
     */
    private readonly inSessionEvaluationIds?;
    constructor(stores: CrossReferenceCheckerStores, 
    /**
     * Optional in-session Evaluation ids. Used to verify that
     * Experience.evaluationId references an existing Evaluation.
     * If omitted, the Experience ↔ Evaluation check is skipped.
     */
    inSessionEvaluationIds?: ReadonlySet<string> | undefined);
    check(): Promise<CrossReferenceReport>;
}
/**
 * Convenience helper: returns true iff the report has any orphaned
 * records. Useful for quick "is the chain consistent?" checks.
 */
export declare function hasOrphans(report: CrossReferenceReport): boolean;
/**
 * Convenience helper: returns a human-readable summary of the report.
 * Useful for logging / startup output.
 */
export declare function summarizeReport(report: CrossReferenceReport): string;
//# sourceMappingURL=cross-reference-checker.d.ts.map