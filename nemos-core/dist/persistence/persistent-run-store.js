/**
 * Nemons Persistence — Persistent Run Store
 *
 * The PersistentRunStore wraps a `PersistentStore<Run>` to persist Run
 * records to disk. Records survive restart: a new instance at the
 * same persistence location loads previously-written Runs, with
 * state, evidence references, and evaluation references preserved.
 *
 * Architectural principles enforced here:
 *   - "Records survive restart and can be retrieved and verified
 *     without silently changing their trust status."
 *   - "No silent mutation": the Run's state is preserved on read;
 *     state transitions are explicit (and policy-enforced in the
 *     RunManager).
 *   - "Failure handling": corrupt Run records are quarantined, not
 *     silently dropped. A `LoadResult` distinguishes ok / missing /
 *     corrupt.
 *   - "An incomplete record is not a verified success": a Run whose
 *     state is `succeeded` MUST have evidence references; the
 *     validator enforces this on read (just as the schema does on
 *     write).
 *
 * Stage G: this store covers the Run-side of the persistent Run +
 * Evidence pair. The Evidence side is in `persistent-evidence-store.ts`.
 * The two are linked via the CrossReferenceChecker.
 */
import { validateRun } from "../schemas/run.js";
import { ContractValidationError, LifecycleViolationError, } from "../core/errors.js";
/**
 * A validator function for Run records. Used by FileSystemStore
 * to validate Runs on add and on read.
 *
 * NOTE: TypeScript assertions require the function declaration to use
 * the explicit `asserts` keyword in a function declaration.
 */
export function runValidator(record) {
    validateRun(record);
}
/**
 * Allowed Run state transitions:
 *   pending      → in_progress, aborted
 *   in_progress  → succeeded, failed, aborted
 *   succeeded    → (terminal)
 *   failed       → (terminal)
 *   aborted      → (terminal)
 *
 * This mirrors the InMemoryRunManager's transition table. The
 * persistent store enforces it via `transition`.
 */
const ALLOWED_RUN_TRANSITIONS = {
    pending: ["in_progress", "aborted"],
    in_progress: ["succeeded", "failed", "aborted"],
    succeeded: [],
    failed: [],
    aborted: [],
};
function isRunTransitionAllowed(from, to) {
    return ALLOWED_RUN_TRANSITIONS[from]?.includes(to) ?? false;
}
/**
 * Thrown when an unauthorized Run state transition is attempted in
 * the persistent store.
 */
export class IllegalRunTransitionError extends Error {
    from;
    to;
    code = "NEMONS_RUN_ILLEGAL_TRANSITION";
    constructor(from, to) {
        super(`Illegal Run transition: ${from} → ${to}`);
        this.from = from;
        this.to = to;
        this.name = "IllegalRunTransitionError";
    }
}
/**
 * The PersistentRunStore. Persists Run records to disk via the
 * underlying PersistentStore. Provides async equivalents of the
 * in-memory RunManager's persistence operations.
 *
 * NOTE: This store handles PERSISTENCE only. The InMemoryRunManager
 * continues to handle in-memory state machine logic, policy
 * enforcement, and the active-Run lifecycle. The persistent store
 * is the durable archive; the in-memory manager is the live runtime.
 *
 * The canonical pattern is:
 *   - During a Run's lifecycle, the InMemoryRunManager holds the Run.
 *   - At a checkpoint (e.g., after evidence recording, on terminal
 *     transition), the manager calls `persistentRunStore.add(run)`
 *     to archive the current state.
 *   - On restart, the persistent store can be queried to reconstruct
 *     past Runs for audit / Experience derivation.
 */
export class PersistentRunStore {
    backend;
    constructor(backend) {
        this.backend = backend;
    }
    /**
     * Initializes the underlying PersistentStore. Must be called
     * before any other operation.
     */
    async initialize() {
        const maybeInit = this.backend;
        if (typeof maybeInit.initialize === "function") {
            await maybeInit.initialize();
        }
    }
    /**
     * Adds (or replaces) a Run record. The Run is validated at the
     * boundary. Returns the persisted Run.
     *
     * Throws if the Run fails validation (e.g., a `succeeded` Run
     * without evidence references — encodes "an incomplete record is
     * not a verified success" at the persistence boundary).
     */
    async add(run) {
        // Re-validate at the boundary (defense in depth)
        validateRun(run);
        // Extra invariant: a succeeded Run MUST have evidence refs
        if (run.state === "succeeded" && (run.evidenceRefs?.length ?? 0) === 0) {
            throw new ContractValidationError("Cannot persist Run with state='succeeded' but no evidenceRefs. " +
                "A claimed success without evidence is not a verified success.", {
                details: {
                    runId: run.id,
                    state: run.state,
                },
            });
        }
        await this.backend.add(run);
        return run;
    }
    /**
     * Loads a Run by id. Returns `undefined` when missing OR corrupt.
     * Use `getWithStatus` for the full load result.
     */
    async get(id) {
        const result = await this.backend.get(id);
        if (result.kind === "ok") {
            return result.record;
        }
        return undefined;
    }
    /**
     * Loads a Run by id, returning the full status (ok / missing / corrupt).
     */
    async getWithStatus(id) {
        const result = await this.backend.get(id);
        if (result.kind === "ok") {
            return { kind: "ok", record: result.record };
        }
        if (result.kind === "missing") {
            return { kind: "missing" };
        }
        return { kind: "corrupt", reason: result.reason };
    }
    /**
     * Lists all healthy Runs (corrupt ones are excluded).
     */
    async list() {
        const envelopes = await this.backend.list();
        return envelopes.map((e) => e.record);
    }
    /**
     * Transitions a Run's state. The transition is persisted.
     *
     * Throws `IllegalRunTransitionError` for forbidden transitions.
     * Throws `ContractValidationError` if the Run is not found or is
     * corrupt (quarantined).
     *
     * NOTE: This is the persistence-level transition; the InMemoryRunManager
     * enforces policy on its own transitions. The two are independent.
     * For most use cases, prefer the InMemoryRunManager for live Runs;
     * use this method only for archival/audit transitions.
     */
    async transition(id, toState, actor, reason) {
        const result = await this.backend.get(id);
        if (result.kind === "missing") {
            throw new ContractValidationError(`Cannot transition: Run not found: ${id}`, { details: { runId: id } });
        }
        if (result.kind === "corrupt") {
            throw new ContractValidationError(`Cannot transition: Run is corrupt (quarantined): ${id}. Reason: ${result.reason}`, { details: { runId: id, reason: result.reason } });
        }
        const current = result.record;
        const fromState = current.state;
        if (!isRunTransitionAllowed(fromState, toState)) {
            throw new IllegalRunTransitionError(fromState, toState);
        }
        // Extra invariant: succeeded requires evidence refs (defense in depth
        // at the persistence layer — the InMemoryRunManager also enforces this)
        if (toState === "succeeded" && (current.evidenceRefs?.length ?? 0) === 0) {
            throw new LifecycleViolationError("Cannot transition to 'succeeded': Run has no evidenceRefs. " +
                "A claimed success without evidence is not a verified success.", {
                details: {
                    runId: id,
                    fromState,
                    toState,
                },
            });
        }
        const nowIso = new Date().toISOString();
        const reviewEntry = {
            from: fromState,
            to: toState,
            at: nowIso,
            actor,
            reason,
        };
        const updated = {
            ...current,
            state: toState,
            endedAt: ["succeeded", "failed", "aborted"].includes(toState)
                ? nowIso
                : current.endedAt,
            provenance: {
                ...current.provenance,
                reviewTrail: [...(current.provenance.reviewTrail ?? []), reviewEntry],
            },
        };
        validateRun(updated);
        await this.backend.add(updated);
        return updated;
    }
    /**
     * Records an Evidence reference on a Run (appends to evidenceRefs).
     *
     * Throws `ContractValidationError` if the Run is not found or is corrupt.
     */
    async recordEvidenceRef(id, evidenceId) {
        const result = await this.backend.get(id);
        if (result.kind === "missing") {
            throw new ContractValidationError(`Cannot record evidence: Run not found: ${id}`, { details: { runId: id } });
        }
        if (result.kind === "corrupt") {
            throw new ContractValidationError(`Cannot record evidence: Run is corrupt: ${id}`, { details: { runId: id, reason: result.reason } });
        }
        const current = result.record;
        const evidenceRefs = [...(current.evidenceRefs ?? []), evidenceId];
        const updated = {
            ...current,
            evidenceRefs,
        };
        validateRun(updated);
        await this.backend.add(updated);
        return updated;
    }
    /**
     * Records an Evaluation reference on a Run.
     */
    async recordEvaluationRef(id, evaluationId) {
        const result = await this.backend.get(id);
        if (result.kind === "missing") {
            throw new ContractValidationError(`Cannot record evaluation: Run not found: ${id}`, { details: { runId: id } });
        }
        if (result.kind === "corrupt") {
            throw new ContractValidationError(`Cannot record evaluation: Run is corrupt: ${id}`, { details: { runId: id, reason: result.reason } });
        }
        const current = result.record;
        const updated = {
            ...current,
            evaluationRef: evaluationId,
        };
        validateRun(updated);
        await this.backend.add(updated);
        return updated;
    }
    /**
     * Returns the count of healthy Runs.
     */
    async size() {
        return this.backend.size();
    }
    /**
     * Runs a health check on the underlying store.
     */
    async healthCheck() {
        return this.backend.healthCheck();
    }
    /**
     * Lists quarantined records.
     */
    async listQuarantine() {
        return this.backend.listQuarantine();
    }
    /**
     * Permanently removes all quarantined records. Returns the count.
     */
    async purgeQuarantine() {
        return this.backend.purgeQuarantine();
    }
    /**
     * Deletes a Run by id. Returns true if deleted.
     */
    async delete(id) {
        return this.backend.delete(id);
    }
}
//# sourceMappingURL=persistent-run-store.js.map