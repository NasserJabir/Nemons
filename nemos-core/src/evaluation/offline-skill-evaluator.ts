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
import type { FailureAttributionCategory } from "../schemas/run.js";

/**
 * A data split for offline evaluation (from TeleTune — separation of
 * candidate-generation data from evaluation data to reduce overfitting).
 */
export interface DataSplit {
  readonly generationSet: readonly Run[];
  readonly evaluationSet: readonly Run[];
  readonly splitRatio: number; // 0-1, fraction in generation set
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
  readonly successRate: number; // 0-1
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
    readonly splitRatio?: number; // default 0.5
    readonly actionPredictionAccuracy?: number; // supporting metric only
  }): SkillEvaluationReport;
}

/**
 * Default OfflineSkillEvaluator implementation.
 */
export class DefaultOfflineSkillEvaluator implements OfflineSkillEvaluator {
  evaluate(input: {
    readonly skillId: string;
    readonly skillVersion?: string;
    readonly runs: readonly Run[];
    readonly evidence: readonly Evidence[];
    readonly splitRatio?: number;
    readonly actionPredictionAccuracy?: number;
  }): SkillEvaluationReport {
    const { skillId, skillVersion, runs, evidence, actionPredictionAccuracy } = input;
    const splitRatio = input.splitRatio ?? 0.5;

    // 1. Find all Runs whose Evidence references this Skill
    const skillRunIds = new Set<string>(
      evidence
        .filter(
          (e) =>
            e.attributedComponent?.componentId === skillId &&
            e.attributedComponent?.componentKind === "skill",
        )
        .map((e) => e.runId as string),
    );
    const skillRuns = runs.filter((r) => skillRunIds.has(r.id));

    // 2. Split into generation and evaluation sets
    const split = this.splitData(skillRuns, splitRatio);
    const evaluationRuns = split.evaluationSet;

    // 3. Evaluate on the evaluation set
    const totalEvaluated = evaluationRuns.length;
    const succeededRuns = evaluationRuns.filter(
      (r) => r.state === "succeeded",
    );
    const failedRuns = evaluationRuns.filter(
      (r) => r.state === "failed",
    );
    const successRate = totalEvaluated > 0 ? succeededRuns.length / totalEvaluated : 0;
    const failureCount = failedRuns.length;

    // 4. Failure attribution breakdown (ADR-0010)
    const breakdown = this.computeFailureBreakdown(failedRuns);

    // 5. Average metrics (ADR-0011)
    const avgMetrics = this.computeAverageMetrics(evaluationRuns);

    // 6. Build summary
    const summary = this.buildSummary(
      skillId,
      skillVersion,
      totalEvaluated,
      successRate,
      failureCount,
      breakdown,
      split,
      actionPredictionAccuracy,
    );

    return {
      skillId,
      skillVersion,
      totalRunsEvaluated: totalEvaluated,
      successRate,
      failureCount,
      failureAttributionBreakdown: breakdown,
      averageMetrics: avgMetrics,
      actionPredictionAccuracy,
      dataSplit: {
        generationSetSize: split.generationSet.length,
        evaluationSetSize: split.evaluationSet.length,
        splitRatio,
      },
      summary,
      evaluatedAt: new Date().toISOString(),
      // CRITICAL: offline evaluation NEVER authorizes adoption.
      // Adoption requires governed review (Stage F).
      adoptionAuthorized: false as const,
    };
  }

  private splitData(runs: readonly Run[], ratio: number): DataSplit {
    if (runs.length === 0) {
      return { generationSet: [], evaluationSet: [], splitRatio: ratio };
    }
    // Deterministic split: first `ratio` fraction goes to generation,
    // the rest to evaluation. This ensures reproducibility.
    const genCount = Math.floor(runs.length * ratio);
    return {
      generationSet: runs.slice(0, genCount),
      evaluationSet: runs.slice(genCount),
      splitRatio: ratio,
    };
  }

  private computeFailureBreakdown(failedRuns: readonly Run[]): FailureAttributionBreakdown {
    const breakdown: Record<FailureAttributionCategory, number> = {
      model: 0,
      harness: 0,
      skill: 0,
      knowledge: 0,
      tool: 0,
      policy: 0,
      environment: 0,
      unknown: 0,
    };

    for (const run of failedRuns) {
      const category = run.failureAttribution?.category ?? "unknown";
      breakdown[category]++;
    }

    return {
      ...breakdown,
      total: failedRuns.length,
    };
  }

  private computeAverageMetrics(runs: readonly Run[]): AverageMetrics {
    const runsWithMetrics = runs.filter((r) => r.outputs?.metrics);
    if (runsWithMetrics.length === 0) {
      return {};
    }

    const sum = (selector: (r: Run) => number | undefined): number | undefined => {
      const values = runsWithMetrics
        .map((r) => selector(r))
        .filter((v): v is number => v !== undefined);
      if (values.length === 0) return undefined;
      return values.reduce((a, b) => a + b, 0) / values.length;
    };

    return {
      avgLatencyMs: sum((r) => r.outputs?.metrics?.latencyMs),
      avgCostUsd: sum((r) => r.outputs?.metrics?.costUsd),
      avgTokenCount: sum((r) => r.outputs?.metrics?.tokenCount),
      avgToolCallCount: sum((r) => r.outputs?.metrics?.toolCallCount),
      avgStepCount: sum((r) => r.outputs?.metrics?.stepCount),
    };
  }

  private buildSummary(
    skillId: string,
    skillVersion: string | undefined,
    totalEvaluated: number,
    successRate: number,
    failureCount: number,
    breakdown: FailureAttributionBreakdown,
    split: DataSplit,
    actionPredAcc?: number,
  ): string {
    const lines: string[] = [
      `Offline Skill Evaluation: ${skillId}${skillVersion ? ` v${skillVersion}` : ""}.`,
      `  Evaluated on ${totalEvaluated} Run(s) (held-out evaluation set).`,
      `  Success rate: ${(successRate * 100).toFixed(1)}% (${totalEvaluated - failureCount} succeeded, ${failureCount} failed).`,
      `  Data split: ${split.generationSet.length} generation / ${split.evaluationSet.length} evaluation (ratio ${split.splitRatio}).`,
    ];

    if (failureCount > 0) {
      lines.push(`  Failure attribution breakdown:`);
      lines.push(`    model: ${breakdown.model}, harness: ${breakdown.harness}, skill: ${breakdown.skill}`);
      lines.push(`    knowledge: ${breakdown.knowledge}, tool: ${breakdown.tool}, policy: ${breakdown.policy}`);
      lines.push(`    environment: ${breakdown.environment}, unknown: ${breakdown.unknown}`);
    }

    if (actionPredAcc !== undefined) {
      lines.push(
        `  Action-prediction accuracy: ${(actionPredAcc * 100).toFixed(1)}% (SUPPORTING metric only — NOT proof of task success).`,
      );
    }

    lines.push(
      `  CRITICAL: This report does NOT authorize Skill adoption. Adoption requires governed review.`,
    );

    return lines.join("\n");
  }
}
