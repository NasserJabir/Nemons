/**
 * Nemons Evaluation — Offline Skill Evaluator
 *
 * The OfflineSkillEvaluator evaluates a Skill's effectiveness against
 * historical execution data (Runs + Evidence), without live execution.
 *
 * Architectural principles enforced here (ADR-0015, from TeleTune):
 *   - "Evaluate Skills using suitable historical execution data."
 *   - "Keep candidate Skill modifications distinct from evaluation data
 *     to reduce overfitting." → data split into generation/evaluation sets.
 *   - "Treat Action-Prediction Accuracy as a supporting metric, not
 *     proof of task success." → actionPredictionAccuracy is SUPPORTING only.
 *   - "Associate each Skill change candidate with its source, rationale,
 *     affected version, and evidence." → the report links to the Skill.
 *
 * Uses:
 *   - ADR-0010 (Failure Attribution): to categorize failures by cause.
 *   - ADR-0012 (Evidence-to-Component): to find Evidence about a specific Skill.
 *   - ADR-0011 (Run Metrics): for cost/latency analysis.
 *
 * Read-only: does NOT modify any state. Does NOT automatically promote
 * any Skill. Results are for governed review only.
 */
import type { Run } from "../schemas/run.js";
import type { Evidence } from "../schemas/evidence.js";
/**
 * A data split for offline evaluation (from TeleTune — separation of
 * candidate-generation data from evaluation data to reduce overfitting).
 */
export interface DataSplit {
    readonly generationSet: readonly Run[];
    readonly evaluationSet: readonly Run[];
    readonly splitRatio: number;
}
/**
 * The breakdown of failures by attribution category (ADR-0010).
 */
export interface FailureAttributionBreakdown {
    readonly model: number;
    readonly harness: number;
    readonly skill: number;
    readonly knowledge: number;
    readonly tool: number;
    readonly policy: number;
    readonly environment: number;
    readonly unknown: number;
    readonly total: number;
}
/**
 * The average metrics across the evaluation set (ADR-0011).
 */
export interface AverageMetrics {
    readonly avgLatencyMs?: number;
    readonly avgCostUsd?: number;
    readonly avgTokenCount?: number;
    readonly avgToolCallCount?: number;
    readonly avgStepCount?: number;
}
/**
 * The result of evaluating a Skill offline.
 *
 * IMPORTANT: actionPredictionAccuracy is a SUPPORTING metric only.
 * It does NOT prove that the Skill is correct or that tasks will
 * succeed. The successRate (fraction of Runs where the Skill was
 * used and the Run succeeded) is the primary metric.
 */
export interface SkillEvaluationReport {
    readonly skillId: string;
    readonly skillVersion?: string;
    readonly totalRunsEvaluated: number;
    readonly successRate: number;
    readonly failureCount: number;
    readonly failureAttributionBreakdown: FailureAttributionBreakdown;
    readonly averageMetrics: AverageMetrics;
    /**
     * Action-prediction accuracy (SUPPORTING metric only).
     * From TeleTune: "Treat Action-Prediction Accuracy as a supporting
     * metric, not proof of task success."
     * This field is optional and may be undefined if no prediction data
     * is available.
     */
    readonly actionPredictionAccuracy?: number;
    readonly dataSplit: {
        readonly generationSetSize: number;
        readonly evaluationSetSize: number;
        readonly splitRatio: number;
    };
    readonly summary: string;
    readonly evaluatedAt: string;
    /**
     * CRITICAL: this report does NOT authorize Skill adoption.
     * Adoption requires governed review (Stage F).
     */
    readonly adoptionAuthorized: false;
}
/**
 * The OfflineSkillEvaluator interface.
 */
export interface OfflineSkillEvaluator {
    /**
     * Evaluates a Skill against historical execution data.
     *
     * Algorithm:
     *   1. Find all Runs whose Evidence references the Skill (via
     *      attributedComponent.componentId === skillId, ADR-0012).
     *   2. Split the Runs into generation and evaluation sets
     *      (configurable ratio, default 0.5).
     *   3. Evaluate the Skill on the evaluation set:
     *      a. Success rate = succeeded Runs / total Runs.
     *      b. Failure attribution breakdown (ADR-0010).
     *      c. Average metrics (ADR-0011).
     *   4. Report action-prediction accuracy as SUPPORTING only.
     *
     * @returns a SkillEvaluationReport (read-only, does NOT authorize adoption)
     */
    evaluate(input: {
        readonly skillId: string;
        readonly skillVersion?: string;
        readonly runs: readonly Run[];
        readonly evidence: readonly Evidence[];
        readonly splitRatio?: number;
        readonly actionPredictionAccuracy?: number;
    }): SkillEvaluationReport;
}
/**
 * Default OfflineSkillEvaluator implementation.
 */
export declare class DefaultOfflineSkillEvaluator implements OfflineSkillEvaluator {
    evaluate(input: {
        readonly skillId: string;
        readonly skillVersion?: string;
        readonly runs: readonly Run[];
        readonly evidence: readonly Evidence[];
        readonly splitRatio?: number;
        readonly actionPredictionAccuracy?: number;
    }): SkillEvaluationReport;
    private splitData;
    private computeFailureBreakdown;
    private computeAverageMetrics;
    private buildSummary;
}
//# sourceMappingURL=offline-skill-evaluator.d.ts.map