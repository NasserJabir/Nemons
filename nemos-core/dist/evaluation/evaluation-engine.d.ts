/**
 * Nemons Evaluation — Engine
 *
 * The EvaluationEngine applies defined criteria to Evidence and Run
 * outputs to produce an Evaluation decision.
 *
 * Architectural principles enforced here:
 *   - "Verification over appearance": an Evaluation that finds the
 *     Run's claimed success unsupported by sufficient Evidence MUST
 *     produce `claimed_succeeded_unverified`, NOT `verified_succeeded`.
 *   - "Evidence before claims": only verified Evidence counts toward
 *     satisfying criteria.
 */
import type { Evaluation, EvaluationCriterion } from "../schemas/evaluation.js";
import type { Evidence } from "../schemas/evidence.js";
import type { Run } from "../schemas/run.js";
/**
 * The EvaluationEngine interface.
 */
export interface EvaluationEngine {
    /**
     * Evaluates a Run against a criteria set, given the verified Evidence
     * and Run outputs.
     *
     * Returns an Evaluation record with the per-criterion results and
     * the aggregate overall result.
     */
    evaluate(input: {
        readonly run: Run;
        readonly criteria: readonly EvaluationCriterion[];
        readonly evidence: readonly Evidence[];
        readonly evaluator: string;
    }): Evaluation;
}
/**
 * Detects disagreement among verified Evidence records.
 *
 * Implements the VeriHarness insight (ADR-0007):
 *   "Disagreement often exposes correct alternatives, while consensus
 *    can conceal errors."
 *
 * Two Evidence records are contradictory if:
 *   - One's claim contains a positive keyword (and no negative keyword)
 *   - The other's claim contains a negative keyword (and no positive keyword)
 *
 * This is a conservative heuristic — it only flags clear contradictions.
 */
export declare function detectEvidenceDisagreement(evidence: readonly Evidence[]): {
    readonly hasDisagreement: boolean;
    readonly description: string;
};
/**
 * Detects temporal inconsistency between Evidence records and the Run.
 *
 * Implements the LongHarness insight (ADR-0008):
 *   "Evidence-state drift: previously acquired evidence or subsequent
 *    corrections fail to inform the current conclusion."
 *
 * An Evidence record is "stale" (temporally inconsistent) if:
 *   - `run.startedAt` is set AND `evidence.recordedAt < run.startedAt`
 *     (recorded before the Run started — can't support claims about THIS Run)
 *   - `run.endedAt` is set AND `evidence.recordedAt > run.endedAt`
 *     (recorded after the Run ended — might be from a different context)
 *
 * Stale Evidence is EXCLUDED from the criterion satisfaction check.
 * The disagreement check (ADR-0007) runs ONLY on non-stale Evidence.
 *
 * @param evidence - the Evidence records to check (verified only recommended)
 * @param run - the Run to check against
 * @returns `{ hasInconsistency, description, staleEvidenceIds }`
 */
export declare function detectEvidenceTemporalInconsistency(evidence: readonly Evidence[], run: Run): {
    readonly hasInconsistency: boolean;
    readonly description: string;
    readonly staleEvidenceIds: readonly string[];
};
/**
 * Default EvaluationEngine implementation.
 *
 * Algorithm:
 *   1. For each criterion:
 *      a. Find Evidence records of the required kinds.
 *      b. Filter to VERIFIED Evidence only.
 *      c. Check for DISAGREEMENT among the verified Evidence (ADR-0007).
 *      d. The criterion is satisfied ONLY if:
 *         - At least one verified Evidence of the required kind exists
 *         - No disagreement is detected among the verified Evidence
 *   2. Aggregate:
 *      - If ALL required criteria are satisfied (including no disagreement)
 *        → `verified_succeeded`.
 *      - If the Run claimed success but criteria are not all satisfied
 *        → `claimed_succeeded_unverified`.
 *      - If the Run claimed failure → `failed`.
 *      - Else → `inconclusive`.
 */
export declare class DefaultEvaluationEngine implements EvaluationEngine {
    evaluate(input: {
        readonly run: Run;
        readonly criteria: readonly EvaluationCriterion[];
        readonly evidence: readonly Evidence[];
        readonly evaluator: string;
    }): Evaluation;
    private evaluateCriterion;
    private deriveLimitations;
}
//# sourceMappingURL=evaluation-engine.d.ts.map