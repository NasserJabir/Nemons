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
import type { Run, RunInputs, RunOutputs } from "../schemas/run.js";
import type { Evidence } from "../schemas/evidence.js";
import type { Evaluation } from "../schemas/evaluation.js";
import type { ContextPack } from "../schemas/context-pack.js";
import type { RunId } from "../core/identifiers.js";
import type { ContextPackId } from "../core/identifiers.js";
/**
 * Stop conditions for the verification loop (F-055).
 *
 * The loop stops when ANY of these conditions is met:
 *   - `maxRetries` reached (default: 3)
 *   - `maxCostUsd` exceeded (optional)
 *   - `maxTotalLatencyMs` exceeded (optional)
 *   - Run succeeded and `stopOnSuccess` is true (default: true)
 *   - Failure is unrecoverable (environment/unknown) and
 *     `stopOnUnrecoverableFailure` is true (default: true)
 */
export interface LoopStopConditions {
    readonly maxRetries: number;
    readonly maxCostUsd?: number;
    readonly maxTotalLatencyMs?: number;
    readonly stopOnSuccess: boolean;
    readonly stopOnUnrecoverableFailure: boolean;
}
/**
 * Default stop conditions.
 */
export declare const DEFAULT_STOP_CONDITIONS: LoopStopConditions;
/**
 * The decision returned by the verification loop after evaluating a Run.
 *
 * - `stop`: the loop should terminate. The final outcome is recorded.
 * - `retry`: the loop should create a new Run with modified inputs.
 */
export type LoopDecision = {
    readonly kind: "stop";
    readonly reason: string;
    readonly finalOutcome: "succeeded" | "failed" | "aborted";
    readonly lastRunId: RunId;
    readonly retryCount: number;
} | {
    readonly kind: "retry";
    readonly reason: string;
    readonly nextRunInputs: RunInputs;
    readonly retryCount: number;
};
/**
 * The result of a complete verification loop.
 */
export interface LoopResult {
    readonly totalRuns: number;
    readonly finalOutcome: "succeeded" | "failed" | "aborted";
    readonly finalRunId: RunId;
    readonly allRunIds: readonly RunId[];
    readonly totalCostUsd?: number;
    readonly totalLatencyMs: number;
    readonly retryCount: number;
    readonly summary: string;
}
/**
 * Checks whether the loop should stop, based on the Evaluation and
 * stop conditions.
 *
 * This is the core decision function — it's PURE (no side effects).
 * The caller (VerificationLoopController) uses this to decide
 * whether to retry or stop.
 */
export declare function checkStopConditions(evaluation: Evaluation, run: Run, retryCount: number, conditions: LoopStopConditions, accumulatedCostUsd?: number, accumulatedLatencyMs?: number): LoopDecision;
/**
 * The VerificationLoopController interface.
 *
 * Orchestrates the full retry loop. Each iteration:
 *   1. Creates a Run
 *   2. Starts it
 *   3. Invokes the adapter
 *   4. Collects Evidence
 *   5. Evaluates
 *   6. Checks stop conditions
 *   7. Retries or stops
 */
export interface VerificationLoopController {
    /**
     * Executes the verification loop.
     *
     * @returns the final LoopResult with the total runs, outcome, and metrics.
     */
    executeLoop(input: {
        readonly runInputs: RunInputs;
        readonly initialContextPackId: ContextPackId;
        readonly stopConditions?: LoopStopConditions;
        readonly onRunComplete?: (run: Run, evaluation: Evaluation, decision: LoopDecision) => void;
    }): Promise<LoopResult>;
}
/**
 * Callbacks the controller needs to execute the loop.
 * The caller provides these — they wire the controller to the
 * runtime's RunManager, adapter, evidence collector, etc.
 */
export interface LoopControllerCallbacks {
    readonly createRun: (inputs: RunInputs, contextPackId: ContextPackId) => Run;
    readonly startRun: (runId: RunId) => Run;
    readonly invokeAdapter: (runId: RunId, contextPack: ContextPack) => Promise<RunOutputs>;
    readonly collectEvidence: (runId: RunId, outputs: RunOutputs) => Evidence[];
    readonly evaluateRun: (run: Run) => Evaluation;
    readonly markSucceeded: (runId: RunId) => Run;
    readonly markFailed: (runId: RunId, reason: string, attribution?: import("../schemas/run.js").FailureAttribution) => Run;
    readonly getContextPack: (contextPackId: ContextPackId) => ContextPack;
}
/**
 * Default VerificationLoopController implementation.
 *
 * Uses callbacks to wire to the runtime. Each retry creates a NEW Run
 * (the previous Run is immutable and terminal).
 */
export declare class DefaultVerificationLoopController implements VerificationLoopController {
    private readonly callbacks;
    constructor(callbacks: LoopControllerCallbacks);
    executeLoop(input: {
        readonly runInputs: RunInputs;
        readonly initialContextPackId: ContextPackId;
        readonly stopConditions?: LoopStopConditions;
        readonly onRunComplete?: (run: Run, evaluation: Evaluation, decision: LoopDecision) => void;
    }): Promise<LoopResult>;
}
//# sourceMappingURL=verification-loop-controller.d.ts.map