/**
 * Nemons Run — Verification Loop Controller
 *
 * Implements F-053 (Run-Level Verification Loop) + F-055 (Loop Stop
 * Conditions). The controller orchestrates the retry loop:
 *
 *   1. Create Run → 2. Start → 3. Invoke adapter → 4. Collect Evidence
 *   → 5. Evaluate → 6. Check stop conditions → 7. Retry or Stop
 *
 * Architectural principles enforced here:
 *   - "Evidence before claims": retry decision is based on Evaluation
 *     (verified_succeeded/failed), not on the adapter's claim alone.
 *   - "No silent mutation": each retry creates a NEW Run (not a mutation
 *     of the existing one). The previous Run's state is immutable.
 *   - "Hard-deny": stop conditions are deterministic (retry count, budget,
 *     unrecoverable failure category) — not LLM-based.
 *   - "A failure is not automatically a Skill failure": the loop checks
 *     failure attribution before deciding to retry (ADR-0010).
 */
/**
 * Default stop conditions.
 */
export const DEFAULT_STOP_CONDITIONS = {
    maxRetries: 3,
    stopOnSuccess: true,
    stopOnUnrecoverableFailure: true,
};
/**
 * Checks whether the loop should stop, based on the Evaluation and
 * stop conditions.
 *
 * This is the core decision function — it's PURE (no side effects).
 * The caller (VerificationLoopController) uses this to decide
 * whether to retry or stop.
 */
export function checkStopConditions(evaluation, run, retryCount, conditions, accumulatedCostUsd, accumulatedLatencyMs) {
    // 1. Success → stop
    if (conditions.stopOnSuccess && evaluation.overallResult === "verified_succeeded") {
        return {
            kind: "stop",
            reason: "Run verified as succeeded.",
            finalOutcome: "succeeded",
            lastRunId: run.id,
            retryCount,
        };
    }
    // 2. Max retries reached → stop
    if (retryCount >= conditions.maxRetries) {
        return {
            kind: "stop",
            reason: `Maximum retries (${conditions.maxRetries}) reached.`,
            finalOutcome: "failed",
            lastRunId: run.id,
            retryCount,
        };
    }
    // 3. Budget exceeded → stop
    if (conditions.maxCostUsd !== undefined && accumulatedCostUsd !== undefined) {
        if (accumulatedCostUsd >= conditions.maxCostUsd) {
            return {
                kind: "stop",
                reason: `Cost budget ($${conditions.maxCostUsd}) exceeded (spent $${accumulatedCostUsd.toFixed(2)}).`,
                finalOutcome: "aborted",
                lastRunId: run.id,
                retryCount,
            };
        }
    }
    // 4. Latency exceeded → stop
    if (conditions.maxTotalLatencyMs !== undefined && accumulatedLatencyMs !== undefined) {
        if (accumulatedLatencyMs >= conditions.maxTotalLatencyMs) {
            return {
                kind: "stop",
                reason: `Latency budget (${conditions.maxTotalLatencyMs}ms) exceeded (${accumulatedLatencyMs}ms).`,
                finalOutcome: "aborted",
                lastRunId: run.id,
                retryCount,
            };
        }
    }
    // 5. Unrecoverable failure → stop
    if (conditions.stopOnUnrecoverableFailure) {
        const failureCategory = run.failureAttribution?.category;
        if (failureCategory === "environment" ||
            failureCategory === "unknown" ||
            failureCategory === "policy") {
            return {
                kind: "stop",
                reason: `Unrecoverable failure (category: ${failureCategory}).`,
                finalOutcome: "failed",
                lastRunId: run.id,
                retryCount,
            };
        }
    }
    // 6. Retry
    return {
        kind: "retry",
        reason: `Run ${evaluation.overallResult} (attempt ${retryCount + 1}); retrying with modified context.`,
        nextRunInputs: run.inputs, // same inputs; the caller modifies the Context Pack
        retryCount: retryCount + 1,
    };
}
/**
 * Default VerificationLoopController implementation.
 *
 * Uses callbacks to wire to the runtime. Each retry creates a NEW Run
 * (the previous Run is immutable and terminal).
 */
export class DefaultVerificationLoopController {
    callbacks;
    constructor(callbacks) {
        this.callbacks = callbacks;
    }
    async executeLoop(input) {
        const conditions = input.stopConditions ?? DEFAULT_STOP_CONDITIONS;
        const allRunIds = [];
        let retryCount = 0;
        let totalCostUsd;
        let totalLatencyMs = 0;
        let currentContextPackId = input.initialContextPackId;
        let finalOutcome = "failed";
        let finalRunId = input.runInputs.taskDescription; // placeholder
        for (let attempt = 0; attempt <= conditions.maxRetries; attempt++) {
            // 1. Create Run
            const run = this.callbacks.createRun(input.runInputs, currentContextPackId);
            allRunIds.push(run.id);
            finalRunId = run.id;
            // 2. Start
            this.callbacks.startRun(run.id);
            // 3. Invoke adapter
            const startTimeMs = Date.now();
            const contextPack = this.callbacks.getContextPack(currentContextPackId);
            const outputs = await this.callbacks.invokeAdapter(run.id, contextPack);
            const elapsedMs = Date.now() - startTimeMs;
            totalLatencyMs += elapsedMs;
            // Track cost
            if (outputs.metrics?.costUsd !== undefined) {
                totalCostUsd = (totalCostUsd ?? 0) + outputs.metrics.costUsd;
            }
            // 4. Collect Evidence
            this.callbacks.collectEvidence(run.id, outputs);
            // 5. Evaluate
            const evaluation = this.callbacks.evaluateRun(run);
            // 6. Check stop conditions
            const decision = checkStopConditions(evaluation, run, retryCount, conditions, totalCostUsd, totalLatencyMs);
            // 7. Act on decision
            if (input.onRunComplete) {
                input.onRunComplete(run, evaluation, decision);
            }
            if (decision.kind === "stop") {
                finalOutcome = decision.finalOutcome;
                if (decision.finalOutcome === "succeeded") {
                    try {
                        this.callbacks.markSucceeded(run.id);
                    }
                    catch {
                        // markSucceeded may fail if no evidence — that's OK, the Run stays in_progress
                    }
                }
                else if (decision.finalOutcome === "failed") {
                    this.callbacks.markFailed(run.id, decision.reason);
                }
                break;
            }
            // Retry: mark the current Run as failed and create a new one
            this.callbacks.markFailed(run.id, `Retry ${retryCount + 1}: ${decision.reason}`);
            retryCount = decision.retryCount;
            // The caller can modify the Context Pack for the next attempt
            // (e.g., add different Experience, adjust constraints)
            // For now, we reuse the same Context Pack — the caller can
            // override this by providing a modified contextPackId
        }
        return {
            totalRuns: allRunIds.length,
            finalOutcome,
            finalRunId,
            allRunIds,
            totalCostUsd,
            totalLatencyMs,
            retryCount,
            summary: `Loop completed: ${allRunIds.length} Run(s), outcome: ${finalOutcome}, retries: ${retryCount}.`,
        };
    }
}
//# sourceMappingURL=verification-loop-controller.js.map