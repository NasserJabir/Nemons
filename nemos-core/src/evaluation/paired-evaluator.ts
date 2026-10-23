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
import type { RunMetrics } from "../schemas/run.js";

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
  compare(
    baseline: Run,
    candidate: Run,
    noiseThresholdPct?: number,
  ): BaselineComparison;
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
export const DEFAULT_NOISE_THRESHOLD_PCT = 13;

/**
 * Default PairedEvaluator implementation.
 *
 * Algorithm:
 *   1. Compare the claimed outcomes (same / improved / regressed / inconclusive).
 *   2. For each metric in RunMetrics, compute the delta and delta percentage.
 *   3. Determine whether ALL deltas are within the noise threshold.
 *   4. Build a human-readable summary.
 */
export class DefaultPairedEvaluator implements PairedEvaluator {
  compare(
    baseline: Run,
    candidate: Run,
    noiseThresholdPct: number = DEFAULT_NOISE_THRESHOLD_PCT,
  ): BaselineComparison {
    const baselineMetrics = baseline.outputs?.metrics;
    const candidateMetrics = candidate.outputs?.metrics;

    const outcomeComparison = this.compareOutcomes(baseline, candidate);
    const metricDeltas = this.computeDeltas(baselineMetrics, candidateMetrics);
    const withinNoiseBand = this.isWithinNoiseBand(metricDeltas, noiseThresholdPct);
    const summary = this.buildSummary(
      baseline,
      candidate,
      outcomeComparison,
      metricDeltas,
      withinNoiseBand,
      noiseThresholdPct,
    );

    return {
      baselineRunId: baseline.id,
      candidateRunId: candidate.id,
      outcomeComparison,
      metricDeltas,
      withinNoiseBand,
      noiseThresholdPct,
      summary,
      comparedAt: new Date().toISOString(),
    };
  }

  private compareOutcomes(baseline: Run, candidate: Run): OutcomeComparison {
    const baselineOutcome = baseline.outputs?.claimedOutcome ?? "unknown";
    const candidateOutcome = candidate.outputs?.claimedOutcome ?? "unknown";

    if (baselineOutcome === "unknown" || candidateOutcome === "unknown" ||
        baselineOutcome === "partial" || candidateOutcome === "partial") {
      return "inconclusive";
    }

    if (baselineOutcome === candidateOutcome) {
      return "same";
    }

    if (baselineOutcome === "failed" && candidateOutcome === "succeeded") {
      return "improved";
    }

    if (baselineOutcome === "succeeded" && candidateOutcome === "failed") {
      return "regressed";
    }

    return "inconclusive";
  }

  private computeDeltas(
    baseline: RunMetrics | undefined,
    candidate: RunMetrics | undefined,
  ): MetricDeltas {
    return {
      latencyMs: this.computeEntry(baseline?.latencyMs, candidate?.latencyMs),
      costUsd: this.computeEntry(baseline?.costUsd, candidate?.costUsd),
      tokenCount: this.computeEntry(baseline?.tokenCount, candidate?.tokenCount),
      toolCallCount: this.computeEntry(baseline?.toolCallCount, candidate?.toolCallCount),
      stepCount: this.computeEntry(baseline?.stepCount, candidate?.stepCount),
    };
  }

  private computeEntry(
    baseline: number | undefined,
    candidate: number | undefined,
  ): MetricDeltaEntry {
    if (baseline === undefined || candidate === undefined) {
      return { baseline, candidate, delta: undefined, deltaPct: undefined };
    }
    const delta = candidate - baseline;
    const deltaPct = baseline !== 0 ? (delta / baseline) * 100 : undefined;
    return { baseline, candidate, delta, deltaPct };
  }

  private isWithinNoiseBand(deltas: MetricDeltas, thresholdPct: number): boolean {
    // Check all metrics that have a delta
    const entries: (MetricDeltaEntry | undefined)[] = [
      deltas.latencyMs,
      deltas.costUsd,
      deltas.tokenCount,
      deltas.toolCallCount,
      deltas.stepCount,
    ];

    // If no metrics have deltas, we can't determine — treat as within noise band
    const definedEntries = entries.filter(
      (e): e is MetricDeltaEntry => e !== undefined && e.deltaPct !== undefined,
    );
    if (definedEntries.length === 0) {
      return true; // no metrics to compare — vacuously within noise band
    }

    // ALL deltas must be within the threshold for the comparison to be
    // "within the noise band." If ANY metric exceeds the threshold,
    // the change is potentially significant.
    return definedEntries.every(
      (e) => Math.abs(e.deltaPct!) <= thresholdPct,
    );
  }

  private buildSummary(
    baseline: Run,
    candidate: Run,
    outcome: OutcomeComparison,
    deltas: MetricDeltas,
    withinNoise: boolean,
    thresholdPct: number,
  ): string {
    const lines: string[] = [
      `Paired comparison: ${baseline.id} (baseline) vs ${candidate.id} (candidate).`,
      `  Outcome: ${outcome}.`,
    ];

    // Add metric deltas
    const metricNames: readonly (keyof MetricDeltas)[] = [
      "latencyMs",
      "costUsd",
      "tokenCount",
      "toolCallCount",
      "stepCount",
    ];
    for (const name of metricNames) {
      const entry = deltas[name];
      if (entry?.deltaPct !== undefined) {
        const sign = entry.deltaPct >= 0 ? "+" : "";
        lines.push(
          `  ${name}: ${entry.baseline} → ${entry.candidate} (${sign}${entry.deltaPct.toFixed(1)}%)`,
        );
      }
    }

    if (withinNoise) {
      lines.push(
        `  Within noise band (±${thresholdPct}%): YES — the change is NOT statistically distinguishable from run-to-run noise.`,
      );
    } else {
      lines.push(
        `  Within noise band (±${thresholdPct}%): NO — the change exceeds the noise threshold and may be a real improvement or regression.`,
      );
    }

    return lines.join("\n");
  }
}
