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
export class DefaultCrossReferenceChecker {
    stores;
    inSessionEvaluationIds;
    constructor(stores, 
    /**
     * Optional in-session Evaluation ids. Used to verify that
     * Experience.evaluationId references an existing Evaluation.
     * If omitted, the Experience ↔ Evaluation check is skipped.
     */
    inSessionEvaluationIds) {
        this.stores = stores;
        this.inSessionEvaluationIds = inSessionEvaluationIds;
    }
    async check() {
        const checkedAt = new Date().toISOString();
        // Load all records
        const [runs, evidence, experiences, candidates] = await Promise.all([
            this.stores.runStore?.list() ?? [],
            this.stores.evidenceStore?.list() ?? [],
            this.stores.experienceStore?.list() ?? [],
            this.stores.candidateStore?.list() ?? [],
        ]);
        // Build lookup sets
        const runIds = new Set(runs.map((r) => r.id));
        const candidateIds = new Set(candidates.map((c) => c.id));
        // Evidence ↔ Run
        const healthyEvidence = [];
        const orphanedEvidence = [];
        for (const e of evidence) {
            if (runIds.has(e.runId)) {
                healthyEvidence.push(e.id);
            }
            else {
                orphanedEvidence.push({ evidenceId: e.id, missingRunId: e.runId });
            }
        }
        // Experience ↔ Run
        const healthyExperiences = [];
        const orphanedExperiences = [];
        const experiencesWithMissingEvaluation = [];
        for (const exp of experiences) {
            if (!runIds.has(exp.runId)) {
                orphanedExperiences.push({ experienceId: exp.id, missingRunId: exp.runId });
            }
            else {
                healthyExperiences.push(exp.id);
            }
            // Experience ↔ Evaluation (in-session only)
            if (this.inSessionEvaluationIds !== undefined) {
                if (!this.inSessionEvaluationIds.has(exp.evaluationId)) {
                    experiencesWithMissingEvaluation.push({
                        experienceId: exp.id,
                        missingEvaluationId: exp.evaluationId,
                    });
                }
            }
        }
        // Candidate ↔ Candidate (version chain integrity)
        const healthyCandidates = [];
        const orphanedCandidates = [];
        for (const c of candidates) {
            if (c.supersedesCandidateId === undefined) {
                // No supersedes — healthy by default
                healthyCandidates.push(c.id);
            }
            else if (candidateIds.has(c.supersedesCandidateId)) {
                healthyCandidates.push(c.id);
            }
            else {
                orphanedCandidates.push({
                    candidateId: c.id,
                    missingSupersedesCandidateId: c.supersedesCandidateId,
                });
            }
        }
        return {
            checkedAt,
            totalEvidence: evidence.length,
            healthyEvidence,
            orphanedEvidence,
            totalExperiences: experiences.length,
            healthyExperiences,
            orphanedExperiences,
            experiencesWithMissingEvaluation,
            totalCandidates: candidates.length,
            healthyCandidates,
            orphanedCandidates,
        };
    }
}
/**
 * Convenience helper: returns true iff the report has any orphaned
 * records. Useful for quick "is the chain consistent?" checks.
 */
export function hasOrphans(report) {
    return (report.orphanedEvidence.length > 0 ||
        report.orphanedExperiences.length > 0 ||
        report.experiencesWithMissingEvaluation.length > 0 ||
        report.orphanedCandidates.length > 0);
}
/**
 * Convenience helper: returns a human-readable summary of the report.
 * Useful for logging / startup output.
 */
export function summarizeReport(report) {
    const lines = [
        `CrossReferenceReport @ ${report.checkedAt}:`,
        `  Evidence: ${report.totalEvidence} total, ${report.healthyEvidence.length} healthy, ${report.orphanedEvidence.length} orphaned`,
        `  Experience: ${report.totalExperiences} total, ${report.healthyExperiences.length} healthy, ${report.orphanedExperiences.length} orphaned, ${report.experiencesWithMissingEvaluation.length} with missing evaluation`,
        `  Candidates: ${report.totalCandidates} total, ${report.healthyCandidates.length} healthy, ${report.orphanedCandidates.length} orphaned`,
    ];
    return lines.join("\n");
}
//# sourceMappingURL=cross-reference-checker.js.map