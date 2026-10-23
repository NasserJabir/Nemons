/**
 * Nemons Run — Manager
 *
 * The RunManager owns the Run lifecycle:
 *   pending → in_progress → (succeeded | failed | aborted)
 *
 * Architectural principles enforced here:
 *   - "Identity is not instance": a Run has a stable identity that is
 *     distinct from any specific execution instance.
 *   - "Evidence before claims": a Run CANNOT transition to `succeeded`
 *     without verified Evidence. A claimed success without Evidence
 *     remains `in_progress` (or, on adapter completion, transitions
 *     to `failed` with reason "insufficient evidence").
 *   - "Failure handling": denied operations raise `PolicyDeniedError`;
 *     invalid transitions raise `RunStateError`.
 */
import type { Run, RunInputs, RunOutputs } from "../schemas/run.js";
import type { ContextPackId } from "../core/identifiers.js";
import { RunId } from "../core/identifiers.js";
import type { Provenance } from "../core/provenance.js";
import type { PolicyEngine } from "../policy/policy-engine.js";
/**
 * The RunManager interface.
 *
 * Each state transition is a single method; transitions enforce:
 *   - the current state allows the transition
 *   - the required policy is enforced
 *   - the required evidence is present (for `succeeded`)
 */
export interface RunManager {
    createRun(input: {
        readonly runInputs: RunInputs;
        readonly contextPackId: ContextPackId;
        readonly provenance: Provenance;
    }): Run;
    startRun(runId: RunId): Run;
    recordOutputs(runId: RunId, outputs: RunOutputs): Run;
    recordEvidence(runId: RunId, evidenceId: string): Run;
    recordEvaluation(runId: RunId, evaluationId: string): Run;
    markSucceeded(runId: RunId): Run;
    markFailed(runId: RunId, reason: string): Run;
    markAborted(runId: RunId, reason: string): Run;
    getRun(runId: RunId): Run | undefined;
}
/**
 * Default RunManager implementation — in-memory.
 *
 * Persistence is a Stage-E capability; the in-memory manager is the
 * Stage-0 / Phase-1 implementation that satisfies the contract.
 *
 * Hard-deny behaviors:
 *   - State transitions not in ALLOWED_RUN_TRANSITIONS → RunStateError
 *   - `markSucceeded` requires verified evidence → InsufficientEvidenceError
 *   - All operations are policy-enforced via the PolicyEngine
 */
export declare class InMemoryRunManager implements RunManager {
    private readonly policy;
    private readonly runs;
    constructor(policy: PolicyEngine);
    createRun(input: {
        readonly runInputs: RunInputs;
        readonly contextPackId: ContextPackId;
        readonly provenance: Provenance;
    }): Run;
    startRun(runId: RunId): Run;
    recordOutputs(runId: RunId, outputs: RunOutputs): Run;
    recordEvidence(runId: RunId, evidenceId: string): Run;
    recordEvaluation(runId: RunId, evaluationId: string): Run;
    markSucceeded(runId: RunId): Run;
    markFailed(runId: RunId, reason: string, attribution?: import("../schemas/run.js").FailureAttribution): Run;
    markAborted(runId: RunId, reason: string): Run;
    getRun(runId: RunId): Run | undefined;
    private requireRun;
    private assertCanTransition;
}
//# sourceMappingURL=run-manager.d.ts.map