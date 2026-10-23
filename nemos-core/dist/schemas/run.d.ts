/**
 * Nemons Schema — Run
 *
 * A Run represents one execution of a coding task under a defined set
 * of inputs, assets, policies, and environment conditions.
 *
 * Architectural principles enforced here:
 *   - Each Run has a stable identity and a traceable relationship to
 *     its inputs, execution outputs, evidence, and evaluation.
 *   - "Identity is not instance": a Run's identity is distinct from
 *     any specific execution instance of that Run (a Run may be retried
 *     or resumed, producing multiple execution instances).
 *
 * Run state is a strict state machine. Transitions are enforced by
 * the Run Manager (run/run-manager.ts).
 */
import type { Provenance } from "../core/provenance.js";
import type { RunId, ContextPackId, RepositoryInstanceId } from "../core/identifiers.js";
/**
 * The lifecycle state of a Run.
 *
 * State transitions (strict, enforced by run-manager):
 *   pending → in_progress → (succeeded | failed | aborted)
 *
 * - `pending`: Run has been created but not started.
 * - `in_progress`: Run is executing (adapter has been invoked).
 * - `succeeded`: Run completed AND required verification evidence is
 *     present. (See Definition of Done — claimed success without
 *     evidence is NOT a `succeeded` state; it remains `in_progress`
 *     until evidence is validated.)
 * - `failed`: Run completed with a failure or with insufficient
 *     evidence to claim success.
 * - `aborted`: Run was terminated externally before completion.
 *
 * `succeeded` and `failed` and `aborted` are terminal.
 */
export type RunState = "pending" | "in_progress" | "succeeded" | "failed" | "aborted";
/**
 * The high-level kind of task a Run is performing. Used for retrieval,
 * applicability filtering, and Experience classification.
 */
export type RunTaskKind = "test-fix" | "refactor" | "feature" | "review" | "investigation" | "other";
/**
 * The inputs to a Run — what was given to the runtime at start.
 *
 * `taskDescription` is the user-facing description of the task.
 * `taskKind` is the classification (used for retrieval/applicability).
 * `taskTags` is free-form tags for retrieval filtering.
 */
export interface RunInputs {
    readonly taskDescription: string;
    readonly taskKind: RunTaskKind;
    readonly taskTags?: readonly string[];
    readonly repoInstance: RepositoryInstanceId;
    /**
     * Explicit task acceptance criteria (F-002).
     * Each criterion is a human-readable statement of what must be true
     * for the task to be considered complete (e.g., "all tests pass",
     * "the build succeeds", "the diff is non-empty").
     * The Evaluation engine can check against these criteria in addition
     * to evidence-kind-based criteria.
     * Optional — when absent, the Evaluation uses its own criteria.
     */
    readonly acceptanceCriteria?: readonly string[];
}
/**
 * The outputs of a Run — execution results collected by the adapter.
 *
 * `claimedOutcome` is the agent's claim about what happened. A claim
 * is NOT a verified result; verification requires Evidence.
 *
 * `metrics` captures cost, latency, token, and step counts (ADR-0011,
 * from "What Does a Harness Buy?" research). All fields optional —
 * not all adapters can report all metrics.
 */
export interface RunOutputs {
    readonly claimedOutcome: "succeeded" | "failed" | "partial" | "unknown";
    readonly claimedSummary?: string;
    readonly artifactRefs?: readonly string[];
    readonly traceRef?: string;
    /**
     * Execution metrics (ADR-0011). Optional — adapters that cannot
     * report metrics leave this undefined. When provided, metrics
     * enable paired baseline comparisons and run-to-run variance
     * measurement.
     */
    readonly metrics?: RunMetrics;
}
/**
 * Execution metrics for a Run (ADR-0011, from "What Does a Harness
 * Buy? Tokens, Mostly" — https://arxiv.org/abs/2610.04433).
 *
 * The paper found:
 *   - Cost varies up to 3x across harnesses with the same model.
 *   - Run-to-run variation is 13%.
 *   - Cost is driven by the preamble (system prompts + tool schemas)
 *     scaled by the number of steps.
 *
 * All fields are OPTIONAL because not all adapters can report all
 * metrics. The LocalExecutionAdapter reports real latencyMs,
 * toolCallCount, stepCount, and harnessVersion. Future adapters
 * (OpenHands, etc.) can report tokenCount and costUsd.
 *
 * Field invariants:
 *   - `tokenCount`: total tokens consumed (input + output). N/A for
 *     non-LLM adapters.
 *   - `costUsd`: estimated monetary cost in USD. N/A for local adapters.
 *   - `latencyMs`: wall-clock execution time in milliseconds.
 *   - `toolCallCount`: number of tool invocations.
 *   - `stepCount`: number of harness steps (model calls + tool calls).
 *   - `modelId`: model identifier (e.g., "gpt-4o").
 *   - `harnessVersion`: harness/adapter version (e.g., "local-exec-v1").
 */
export interface RunMetrics {
    readonly tokenCount?: number;
    readonly costUsd?: number;
    readonly latencyMs?: number;
    readonly toolCallCount?: number;
    readonly stepCount?: number;
    readonly modelId?: string;
    readonly harnessVersion?: string;
}
/**
 * The category of a failure attribution (ADR-0010, from MAST research).
 *
 * When a Run fails, the failure should be attributed to a specific cause.
 * "A failure is not automatically a Skill failure." The attribution
 * helps distinguish whether the failure was due to:
 *   - the model producing a wrong output
 *   - the harness/adapter misconfiguring or failing
 *   - the selected Skill being wrong or poorly designed
 *   - the retrieved knowledge being wrong or incomplete
 *   - a tool call failing or returning wrong results
 *   - the policy denying or allowing incorrectly
 *   - the execution environment failing
 *   - or an unknown cause
 *
 * This taxonomy is ADAPTED from MAST (Multi-Agent System Failure Taxonomy,
 * https://arxiv.org/abs/2503.13657) for single-agent scenarios. MAST's
 * original 14 modes in 3 categories (system design, inter-agent misalignment,
 * task verification) are collapsed for Nemons' single-agent scope.
 */
export type FailureAttributionCategory = "model" | "harness" | "skill" | "knowledge" | "tool" | "policy" | "environment" | "unknown";
/**
 * A structured failure attribution for a failed Run (ADR-0010).
 *
 * Field invariants:
 *   - `category`: the attribution category (model/harness/skill/knowledge/tool/policy/environment/unknown)
 *   - `description`: human-readable description of the failure
 *   - `evidenceRefs?`: optional Evidence references supporting the attribution
 *   - `attributedBy`: who/what made the attribution (actor or system identifier)
 *   - `attributedAt`: ISO timestamp of the attribution
 */
export interface FailureAttribution {
    readonly category: FailureAttributionCategory;
    readonly description: string;
    readonly evidenceRefs?: readonly string[];
    readonly attributedBy: string;
    readonly attributedAt: string;
}
/**
 * A Run record.
 *
 * Field invariants:
 *   - `id`: stable RunId.
 *   - `state`: current lifecycle state.
 *   - `inputs`: the task inputs (immutable once set).
 *   - `contextPackId`: the Context Pack selected for this Run.
 *   - `outputs`: the execution outputs (set when the adapter returns).
 *   - `provenance`: lifecycle + origin.
 *   - `startedAt`/`endedAt`: ISO timestamps. `endedAt` is set when the
 *      Run transitions to a terminal state.
 *   - `evidenceRefs`: references to Evidence records supporting the
 *      Run's claimed outcome.
 *   - `evaluationRef`: reference to the Evaluation decision, when an
 *      evaluation has been performed.
 *   - `failureAttribution?`: structured failure attribution (ADR-0010).
 *      Set when `state = "failed"` and the caller provides an attribution.
 *      Optional — a failed Run may not have an attribution if the cause
 *      is not yet determined.
 */
export interface Run {
    readonly id: RunId;
    readonly state: RunState;
    readonly inputs: RunInputs;
    readonly contextPackId: ContextPackId;
    readonly provenance: Provenance;
    readonly outputs?: RunOutputs;
    readonly startedAt?: string;
    readonly endedAt?: string;
    readonly evidenceRefs?: readonly string[];
    readonly evaluationRef?: string;
    readonly failureAttribution?: FailureAttribution;
}
/**
 * Validates the structural contract of a Run record.
 */
export declare function validateRun(r: unknown): asserts r is Run;
/**
 * Returns true iff the Run is in a terminal state.
 */
export declare function isRunTerminal(r: Run): boolean;
/**
 * Returns true iff the Run is verified-successful — i.e., its state is
 * `succeeded` AND it has at least one Evidence reference.
 *
 * "Verified" requires evidence; a `succeeded` state without Evidence
 * is a contract violation per the Definition of Done.
 */
export declare function isRunVerifiedSucceeded(r: Run): boolean;
//# sourceMappingURL=run.d.ts.map