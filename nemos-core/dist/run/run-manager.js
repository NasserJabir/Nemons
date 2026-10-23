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
import { asRunId, freshId } from "../core/identifiers.js";
import { RunStateError, InsufficientEvidenceError } from "../core/errors.js";
import { enforceDecision } from "../policy/policy-engine.js";
/**
 * Allowed transitions:
 *   pending      → in_progress, aborted
 *   in_progress  → succeeded, failed, aborted
 *   succeeded    → (terminal)
 *   failed       → (terminal)
 *   aborted      → (terminal)
 */
const ALLOWED_RUN_TRANSITIONS = {
    pending: ["in_progress", "aborted"],
    in_progress: ["succeeded", "failed", "aborted"],
    succeeded: [],
    failed: [],
    aborted: [],
};
function canTransition(from, to) {
    return ALLOWED_RUN_TRANSITIONS[from]?.includes(to) ?? false;
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
export class InMemoryRunManager {
    policy;
    runs = new Map();
    constructor(policy) {
        this.policy = policy;
    }
    createRun(input) {
        const id = asRunId(freshId());
        const now = new Date().toISOString();
        const run = {
            id,
            state: "pending",
            inputs: input.runInputs,
            contextPackId: input.contextPackId,
            provenance: input.provenance,
            startedAt: undefined,
            endedAt: undefined,
        };
        // Validate creation policy
        const decision = this.policy.decide({
            operation: "run.start",
            requestedBy: "run-manager",
            inputs: { taskKind: input.runInputs.taskKind },
        });
        enforceDecision(decision);
        this.runs.set(id, run);
        // Mark creation time via a non-mutating re-set
        void now; // suppress unused
        return run;
    }
    startRun(runId) {
        const current = this.requireRun(runId);
        this.assertCanTransition(current.state, "in_progress");
        const decision = this.policy.decide({
            operation: "run.transition_state",
            requestedBy: "run-manager",
            inputs: { from: current.state, to: "in_progress", runId },
        });
        enforceDecision(decision);
        const updated = {
            ...current,
            state: "in_progress",
            startedAt: new Date().toISOString(),
        };
        this.runs.set(runId, updated);
        return updated;
    }
    recordOutputs(runId, outputs) {
        const current = this.requireRun(runId);
        if (current.state !== "in_progress") {
            throw new RunStateError(current.state, `Cannot record outputs for Run in state ${current.state}; requires in_progress.`);
        }
        const decision = this.policy.decide({
            operation: "run.record_evidence",
            requestedBy: "run-manager",
            inputs: { runId, kind: "outputs", claimedOutcome: outputs.claimedOutcome },
        });
        enforceDecision(decision);
        const updated = { ...current, outputs };
        this.runs.set(runId, updated);
        return updated;
    }
    recordEvidence(runId, evidenceId) {
        const current = this.requireRun(runId);
        if (current.state === "pending" || current.state === "aborted") {
            throw new RunStateError(current.state, `Cannot record evidence for Run in state ${current.state}.`);
        }
        const decision = this.policy.decide({
            operation: "run.record_evidence",
            requestedBy: "run-manager",
            inputs: { runId, evidenceId },
        });
        enforceDecision(decision);
        const evidenceRefs = [...(current.evidenceRefs ?? []), evidenceId];
        const updated = { ...current, evidenceRefs };
        this.runs.set(runId, updated);
        return updated;
    }
    recordEvaluation(runId, evaluationId) {
        const current = this.requireRun(runId);
        const updated = { ...current, evaluationRef: evaluationId };
        this.runs.set(runId, updated);
        return updated;
    }
    markSucceeded(runId) {
        const current = this.requireRun(runId);
        this.assertCanTransition(current.state, "succeeded");
        // CRITICAL: succeeded requires verified evidence
        if ((current.evidenceRefs?.length ?? 0) === 0) {
            throw new InsufficientEvidenceError("Cannot mark Run as succeeded: no Evidence references recorded. A claimed success without evidence is not a verified success.", { details: { runId, currentState: current.state } });
        }
        const decision = this.policy.decide({
            operation: "run.transition_state",
            requestedBy: "run-manager",
            inputs: { from: current.state, to: "succeeded", runId },
        });
        enforceDecision(decision);
        const updated = {
            ...current,
            state: "succeeded",
            endedAt: new Date().toISOString(),
        };
        this.runs.set(runId, updated);
        return updated;
    }
    markFailed(runId, reason, attribution) {
        const current = this.requireRun(runId);
        this.assertCanTransition(current.state, "failed");
        const decision = this.policy.decide({
            operation: "run.transition_state",
            requestedBy: "run-manager",
            inputs: { from: current.state, to: "failed", runId, reason },
        });
        enforceDecision(decision);
        const updated = {
            ...current,
            state: "failed",
            endedAt: new Date().toISOString(),
            // ADR-0010: structured failure attribution (from MAST research).
            // Optional — a failed Run may not have an attribution if the cause
            // is not yet determined. When provided, the attribution is persisted
            // and queryable for offline skill refinement and failure analysis.
            failureAttribution: attribution,
        };
        this.runs.set(runId, updated);
        return updated;
    }
    markAborted(runId, reason) {
        const current = this.requireRun(runId);
        this.assertCanTransition(current.state, "aborted");
        const decision = this.policy.decide({
            operation: "run.transition_state",
            requestedBy: "run-manager",
            inputs: { from: current.state, to: "aborted", runId, reason },
        });
        enforceDecision(decision);
        const updated = {
            ...current,
            state: "aborted",
            endedAt: new Date().toISOString(),
        };
        this.runs.set(runId, updated);
        return updated;
    }
    getRun(runId) {
        return this.runs.get(runId);
    }
    requireRun(runId) {
        const r = this.runs.get(runId);
        if (!r) {
            throw new RunStateError("unknown", `Run not found: ${runId}`);
        }
        return r;
    }
    assertCanTransition(from, to) {
        if (!canTransition(from, to)) {
            throw new RunStateError(from, `Illegal Run state transition: ${from} → ${to}`);
        }
    }
}
//# sourceMappingURL=run-manager.js.map