/**
 * Nemons Evaluation — Paired Baseline Evaluator
 *
 * The PairedEvaluator compares a candidate Run against a baseline Run,
 * computing metric deltas and detecting whether the change is within
 * the noise band (13% per "What Does a Harness Buy?").
 *
 * Architectural principles enforced here:
 *   - "Paired baseline comparisons" (Priority 1, Evaluation Reliability):
 *     without comparing against a baseline, you can't distinguish real
 *     improvement from the 13% run-to-run noise.
 *   - "VERA gates changes using acceptance criteria" (ADR-0013):
 *     the comparison provides the evidence for whether a change should
 *     be adopted.
 *   - Read-only: the evaluator does NOT modify any state. It produces
 *     a BaselineComparison report.
 *
 * Authorized by ADR-0006 (Stage C) + ADR-0013 (Paired Baseline Evaluation).
 */
import type { Run } from "../schemas/run.js";
/**
 * The per-metric delta between baseline and candidate.
 */
export interface MetricDeltaEntry {
    readonly baseline: number | undefined;
    readonly candidate: number | undefined;
    readonly delta: number | undefined;
    readonly deltaPct: number | undefined;
}
/**
 * All metric deltas between baseline and candidate.
 */
export interface MetricDeltas {
    readonly latencyMs?: MetricDeltaEntry;
    readonly costUsd?: MetricDeltaEntry;
    readonly tokenCount?: MetricDeltaEntry;
    readonly toolCallCount?: MetricDeltaEntry;
    readonly stepCount?: MetricDeltaEntry;
}
/**
 * How the outcomes of the two Runs compare.
 *
 * - `same`: both succeeded or both failed.
 * - `improved`: baseline failed, candidate succeeded.
 * - `regressed`: baseline succeeded, candidate failed.
 * - `inconclusive`: one or both have unknown/partial outcomes.
 */
export type OutcomeComparison = "same" | "improved" | "regressed" | "inconclusive";
/**
 * A complete paired baseline comparison report.
 */
export interface BaselineComparison {
    readonly baselineRunId: string;
    readonly candidateRunId: string;
    readonly outcomeComparison: OutcomeComparison;
    readonly metricDeltas: MetricDeltas;
    readonly withinNoiseBand: boolean;
    readonly noiseThresholdPct: number;
    readonly summary: string;
    readonly comparedAt: string;
}
/**
 * The PairedEvaluator interface.
 */
export interface PairedEvaluator {
    /**
     * Compares a candidate Run against a baseline Run.
     *
     * Both Runs should target the same task (or very similar tasks) for
     * the comparison to be meaningful. The evaluator does NOT verify
     * task similarity — that's the caller's responsibility.
     *
     * @param baseline - the baseline Run (the reference point)
     * @param candidate - the candidate Run (the one being evaluated)
     * @param noiseThresholdPct - the noise threshold percentage (default: 13,
   *    *   from "What Does a Harness Buy?")
     * @returns a BaselineComparison report
     */
    compare(baseline: Run, candidate: Run, noiseThresholdPct?: number): BaselineComparison;
}
/**
 * Default noise threshold percentage (13%), from "What Does a Harness Buy?"
 * (https://arxiv.org/abs/2610.04433).
 *
 * The paper found: "swapping harnesses flips as many tasks as rerunning
 * the same harness (13% in both cases)." This means a delta smaller
 * than 13% is within the noise band and should NOT be treated as a
 * real improvement.
 */
export declare const DEFAULT_NOISE_THRESHOLD_PCT = 13;
/**
 * Default PairedEvaluator implementation.
 *
 * Algorithm:
 *   1. Compare the claimed outcomes (same / improved / regressed / inconclusive).
 *   2. For each metric in RunMetrics, compute the delta and delta percentage.
 *   3. Determine whether ALL deltas are within the noise threshold.
 *   4. Build a human-readable summary.
 */
export declare class DefaultPairedEvaluator implements PairedEvaluator {
    compare(baseline: Run, candidate: Run, noiseThresholdPct?: number): BaselineComparison;
    private compareOutcomes;
    private computeDeltas;
    private computeEntry;
    private isWithinNoiseBand;
    private buildSummary;
}
//# sourceMappingURL=paired-evaluator.d.ts.map