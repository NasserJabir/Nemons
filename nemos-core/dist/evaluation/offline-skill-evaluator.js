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
/**
 * Default OfflineSkillEvaluator implementation.
 */
export class DefaultOfflineSkillEvaluator {
    evaluate(input) {
        const { skillId, skillVersion, runs, evidence, actionPredictionAccuracy } = input;
        const splitRatio = input.splitRatio ?? 0.5;
        // 1. Find all Runs whose Evidence references this Skill
        const skillRunIds = new Set(evidence
            .filter((e) => e.attributedComponent?.componentId === skillId &&
            e.attributedComponent?.componentKind === "skill")
            .map((e) => e.runId));
        const skillRuns = runs.filter((r) => skillRunIds.has(r.id));
        // 2. Split into generation and evaluation sets
        const split = this.splitData(skillRuns, splitRatio);
        const evaluationRuns = split.evaluationSet;
        // 3. Evaluate on the evaluation set
        const totalEvaluated = evaluationRuns.length;
        const succeededRuns = evaluationRuns.filter((r) => r.state === "succeeded");
        const failedRuns = evaluationRuns.filter((r) => r.state === "failed");
        const successRate = totalEvaluated > 0 ? succeededRuns.length / totalEvaluated : 0;
        const failureCount = failedRuns.length;
        // 4. Failure attribution breakdown (ADR-0010)
        const breakdown = this.computeFailureBreakdown(failedRuns);
        // 5. Average metrics (ADR-0011)
        const avgMetrics = this.computeAverageMetrics(evaluationRuns);
        // 6. Build summary
        const summary = this.buildSummary(skillId, skillVersion, totalEvaluated, successRate, failureCount, breakdown, split, actionPredictionAccuracy);
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
            adoptionAuthorized: false,
        };
    }
    splitData(runs, ratio) {
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
    computeFailureBreakdown(failedRuns) {
        const breakdown = {
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
    computeAverageMetrics(runs) {
        const runsWithMetrics = runs.filter((r) => r.outputs?.metrics);
        if (runsWithMetrics.length === 0) {
            return {};
        }
        const sum = (selector) => {
            const values = runsWithMetrics
                .map((r) => selector(r))
                .filter((v) => v !== undefined);
            if (values.length === 0)
                return undefined;
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
    buildSummary(skillId, skillVersion, totalEvaluated, successRate, failureCount, breakdown, split, actionPredAcc) {
        const lines = [
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
            lines.push(`  Action-prediction accuracy: ${(actionPredAcc * 100).toFixed(1)}% (SUPPORTING metric only — NOT proof of task success).`);
        }
        lines.push(`  CRITICAL: This report does NOT authorize Skill adoption. Adoption requires governed review.`);
        return lines.join("\n");
    }
}
//# sourceMappingURL=offline-skill-evaluator.js.map