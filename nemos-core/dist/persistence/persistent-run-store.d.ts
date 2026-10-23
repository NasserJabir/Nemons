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
import type { Run, RunState } from "../schemas/run.js";
import type { RunId } from "../core/identifiers.js";
import type { PersistentStore, HealthCheckReport } from "./persistence-contract.js";
/**
 * A validator function for Run records. Used by FileSystemStore
 * to validate Runs on add and on read.
 *
 * NOTE: TypeScript assertions require the function declaration to use
 * the explicit `asserts` keyword in a function declaration.
 */
export declare function runValidator(record: unknown): asserts record is Run;
/**
 * Thrown when an unauthorized Run state transition is attempted in
 * the persistent store.
 */
export declare class IllegalRunTransitionError extends Error {
    readonly from: RunState;
    readonly to: RunState;
    readonly code: "NEMONS_RUN_ILLEGAL_TRANSITION";
    constructor(from: RunState, to: RunState);
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
export declare class PersistentRunStore {
    private readonly backend;
    constructor(backend: PersistentStore<Run & {
        id: string;
    }>);
    /**
     * Initializes the underlying PersistentStore. Must be called
     * before any other operation.
     */
    initialize(): Promise<void>;
    /**
     * Adds (or replaces) a Run record. The Run is validated at the
     * boundary. Returns the persisted Run.
     *
     * Throws if the Run fails validation (e.g., a `succeeded` Run
     * without evidence references — encodes "an incomplete record is
     * not a verified success" at the persistence boundary).
     */
    add(run: Run): Promise<Run>;
    /**
     * Loads a Run by id. Returns `undefined` when missing OR corrupt.
     * Use `getWithStatus` for the full load result.
     */
    get(id: RunId): Promise<Run | undefined>;
    /**
     * Loads a Run by id, returning the full status (ok / missing / corrupt).
     */
    getWithStatus(id: RunId): Promise<{
        readonly kind: "ok";
        readonly record: Run;
    } | {
        readonly kind: "missing";
    } | {
        readonly kind: "corrupt";
        readonly reason: string;
    }>;
    /**
     * Lists all healthy Runs (corrupt ones are excluded).
     */
    list(): Promise<readonly Run[]>;
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
    transition(id: RunId, toState: RunState, actor: string, reason: string): Promise<Run>;
    /**
     * Records an Evidence reference on a Run (appends to evidenceRefs).
     *
     * Throws `ContractValidationError` if the Run is not found or is corrupt.
     */
    recordEvidenceRef(id: RunId, evidenceId: string): Promise<Run>;
    /**
     * Records an Evaluation reference on a Run.
     */
    recordEvaluationRef(id: RunId, evaluationId: string): Promise<Run>;
    /**
     * Returns the count of healthy Runs.
     */
    size(): Promise<number>;
    /**
     * Runs a health check on the underlying store.
     */
    healthCheck(): Promise<HealthCheckReport>;
    /**
     * Lists quarantined records.
     */
    listQuarantine(): Promise<readonly {
        readonly id: string;
        readonly reason: string;
        readonly quarantinedAt: string;
    }[]>;
    /**
     * Permanently removes all quarantined records. Returns the count.
     */
    purgeQuarantine(): Promise<number>;
    /**
     * Deletes a Run by id. Returns true if deleted.
     */
    delete(id: RunId): Promise<boolean>;
}
//# sourceMappingURL=persistent-run-store.d.ts.map