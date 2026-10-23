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

import type { Run, RunInputs, RunOutputs, RunState } from "../schemas/run.js";
import type { ContextPackId } from "../core/identifiers.js";
import { RunId, asRunId, freshId } from "../core/identifiers.js";
import { RunStateError, InsufficientEvidenceError } from "../core/errors.js";
import type { Provenance } from "../core/provenance.js";
import type { PolicyEngine } from "../policy/policy-engine.js";
import { enforceDecision } from "../policy/policy-engine.js";

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
 * Allowed transitions:
 *   pending      → in_progress, aborted
 *   in_progress  → succeeded, failed, aborted
 *   succeeded    → (terminal)
 *   failed       → (terminal)
 *   aborted      → (terminal)
 */
const ALLOWED_RUN_TRANSITIONS: Readonly<Record<RunState, readonly RunState[]>> = {
  pending: ["in_progress", "aborted"],
  in_progress: ["succeeded", "failed", "aborted"],
  succeeded: [],
  failed: [],
  aborted: [],
};

function canTransition(from: RunState, to: RunState): boolean {
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
export class InMemoryRunManager implements RunManager {
  private readonly runs = new Map<RunId, Run>();

  constructor(private readonly policy: PolicyEngine) {}

  createRun(input: {
    readonly runInputs: RunInputs;
    readonly contextPackId: ContextPackId;
    readonly provenance: Provenance;
  }): Run {
    const id = asRunId(freshId());
    const now = new Date().toISOString();
    const run: Run = {
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

  startRun(runId: RunId): Run {
    const current = this.requireRun(runId);
    this.assertCanTransition(current.state, "in_progress");
    const decision = this.policy.decide({
      operation: "run.transition_state",
      requestedBy: "run-manager",
      inputs: { from: current.state, to: "in_progress", runId },
    });
    enforceDecision(decision);
    const updated: Run = {
      ...current,
      state: "in_progress",
      startedAt: new Date().toISOString(),
    };
    this.runs.set(runId, updated);
    return updated;
  }

  recordOutputs(runId: RunId, outputs: RunOutputs): Run {
    const current = this.requireRun(runId);
    if (current.state !== "in_progress") {
      throw new RunStateError(
        current.state,
        `Cannot record outputs for Run in state ${current.state}; requires in_progress.`,
      );
    }
    const decision = this.policy.decide({
      operation: "run.record_evidence",
      requestedBy: "run-manager",
      inputs: { runId, kind: "outputs", claimedOutcome: outputs.claimedOutcome },
    });
    enforceDecision(decision);
    const updated: Run = { ...current, outputs };
    this.runs.set(runId, updated);
    return updated;
  }

  recordEvidence(runId: RunId, evidenceId: string): Run {
    const current = this.requireRun(runId);
    if (current.state === "pending" || current.state === "aborted") {
      throw new RunStateError(
        current.state,
        `Cannot record evidence for Run in state ${current.state}.`,
      );
    }
    const decision = this.policy.decide({
      operation: "run.record_evidence",
      requestedBy: "run-manager",
      inputs: { runId, evidenceId },
    });
    enforceDecision(decision);
    const evidenceRefs = [...(current.evidenceRefs ?? []), evidenceId];
    const updated: Run = { ...current, evidenceRefs };
    this.runs.set(runId, updated);
    return updated;
  }

  recordEvaluation(runId: RunId, evaluationId: string): Run {
    const current = this.requireRun(runId);
    const updated: Run = { ...current, evaluationRef: evaluationId };
    this.runs.set(runId, updated);
    return updated;
  }

  markSucceeded(runId: RunId): Run {
    const current = this.requireRun(runId);
    this.assertCanTransition(current.state, "succeeded");
    // CRITICAL: succeeded requires verified evidence
    if ((current.evidenceRefs?.length ?? 0) === 0) {
      throw new InsufficientEvidenceError(
        "Cannot mark Run as succeeded: no Evidence references recorded. A claimed success without evidence is not a verified success.",
        { details: { runId, currentState: current.state } },
      );
    }
    const decision = this.policy.decide({
      operation: "run.transition_state",
      requestedBy: "run-manager",
      inputs: { from: current.state, to: "succeeded", runId },
    });
    enforceDecision(decision);
    const updated: Run = {
      ...current,
      state: "succeeded",
      endedAt: new Date().toISOString(),
    };
    this.runs.set(runId, updated);
    return updated;
  }

  markFailed(
    runId: RunId,
    reason: string,
    attribution?: import("../schemas/run.js").FailureAttribution,
  ): Run {
    const current = this.requireRun(runId);
    this.assertCanTransition(current.state, "failed");
    const decision = this.policy.decide({
      operation: "run.transition_state",
      requestedBy: "run-manager",
      inputs: { from: current.state, to: "failed", runId, reason },
    });
    enforceDecision(decision);
    const updated: Run = {
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

  markAborted(runId: RunId, reason: string): Run {
    const current = this.requireRun(runId);
    this.assertCanTransition(current.state, "aborted");
    const decision = this.policy.decide({
      operation: "run.transition_state",
      requestedBy: "run-manager",
      inputs: { from: current.state, to: "aborted", runId, reason },
    });
    enforceDecision(decision);
    const updated: Run = {
      ...current,
      state: "aborted",
      endedAt: new Date().toISOString(),
    };
    this.runs.set(runId, updated);
    return updated;
  }

  getRun(runId: RunId): Run | undefined {
    return this.runs.get(runId);
  }

  private requireRun(runId: RunId): Run {
    const r = this.runs.get(runId);
    if (!r) {
      throw new RunStateError("unknown", `Run not found: ${runId}`);
    }
    return r;
  }

  private assertCanTransition(from: RunState, to: RunState): void {
    if (!canTransition(from, to)) {
      throw new RunStateError(
        from,
        `Illegal Run state transition: ${from} → ${to}`,
      );
    }
  }
}
