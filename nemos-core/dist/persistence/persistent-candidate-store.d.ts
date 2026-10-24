/**
 * Nemons Persistence — Persistent Candidate Store
 *
 * Wraps a `PersistentStore<CandidateRecord>` to implement the
 * `CandidateStore` interface. Candidates survive restart: a new
 * instance at the same persistence location loads previously-written
 * candidates, with status, version chains, and review trails preserved.
 *
 * Architectural principles enforced here:
 *   - "Records survive restart": backed by `PersistentStore`.
 *   - "No silent mutation": candidates' status is preserved on read;
 *     promote via `transition()` is the only sanctioned way to change.
 *   - "Failure handling": corrupt candidates are quarantined by the
 *     underlying PersistentStore.
 *
 * This is the Stage E+F integration: governed evolution records now
 * survive restart, completing the persistent operational-knowledge
 * surface.
 */
import type { CandidateRecord, CandidateStatus } from "../schemas/candidate.js";
import type { CandidateId } from "../core/identifiers.js";
import type { ReviewEntry } from "../core/provenance.js";
import type { PersistentStore, HealthCheckReport } from "./persistence-contract.js";
/**
 * A validator function for CandidateRecord. Used by FileSystemStore
 * to validate candidates on add and on read.
 *
 * NOTE: TypeScript assertions require the function declaration to use
 * the explicit `asserts` keyword in a function declaration.
 */
export declare function candidateValidator(record: unknown): asserts record is CandidateRecord;
/**
 * The PersistentCandidateStore. Implements the same interface surface
 * as `InMemoryCandidateStore`, but with persistence.
 *
 * Note: the InMemoryCandidateStore has sync methods; we expose async
 * equivalents here. Callers that need a sync interface should use
 * InMemoryCandidateStore.
 */
export declare class PersistentCandidateStore {
    private readonly backend;
    constructor(backend: PersistentStore<CandidateRecord & {
        id: string;
    }>);
    /**
     * Initializes the underlying PersistentStore. Must be called before
     * any other operation.
     */
    initialize(): Promise<void>;
    /**
     * Adds a new CandidateRecord. The candidate's status MUST be
     * `proposed` (the initial status).
     *
     * Throws if the candidate is not `proposed` or fails validation.
     * Throws if the candidate's `supersedesCandidateId` does not exist
     * in the store.
     */
    add(candidate: CandidateRecord): Promise<CandidateRecord>;
    /**
     * Loads a CandidateRecord by id. Returns `undefined` when missing
     * OR when the record is corrupt (the corruption is recorded in
     * the health check report).
     *
     * Use `getWithStatus` for the full load result (ok / missing / corrupt).
     */
    get(id: CandidateId): Promise<CandidateRecord | undefined>;
    /**
     * Loads a candidate by id, returning the full status (ok / missing / corrupt).
     */
    getWithStatus(id: CandidateId): Promise<{
        readonly kind: "ok";
        readonly record: CandidateRecord;
    } | {
        readonly kind: "missing";
    } | {
        readonly kind: "corrupt";
        readonly reason: string;
    }>;
    /**
     * Lists all healthy candidates (corrupt ones are excluded).
     */
    list(): Promise<readonly CandidateRecord[]>;
    /**
     * Transitions a candidate from one status to another. The
     * transition is persisted: a new instance of the store loading
     * the same backend will see the new status.
     *
     * Throws `IllegalCandidateTransitionError` for forbidden transitions.
     * Throws `ContractValidationError` if the candidate is not found.
     */
    transition(id: CandidateId, toStatus: CandidateStatus, reviewEntry: Omit<ReviewEntry, "from" | "to">): Promise<CandidateRecord>;
    /**
     * Appends an entry to the candidate's review trail WITHOUT changing
     * its status, and PERSISTS the updated record. The persistent
     * counterpart of CandidateStore.appendReviewTrail — this is what
     * makes governed review decisions (including an approval whose
     * rules are not yet satisfied) survive a restart.
     */
    appendReviewTrail(id: CandidateId, reviewEntry: Omit<ReviewEntry, "from" | "to">): Promise<CandidateRecord>;
    /**
     * Returns the version chain for an asset — the ordered list of
     * candidates that target the given assetId. The order is newest first.
     */
    getVersionChain(assetId: string): Promise<readonly CandidateRecord[]>;
    /**
     * Returns the latest approved candidate for an asset (the active
     * version). Returns `undefined` if no approved candidate exists.
     *
     * NOTE: a candidate with `supersedesCandidateId` set but status
     * `proposed` does NOT supersede the referenced candidate — the
     * supersede only takes effect when BOTH the superseder AND the
     * superseded are approved (the engine's `supersede` operation
     * is the canonical way to advance this).
     */
    getActiveApproved(assetId: string): Promise<CandidateRecord | undefined>;
    /**
     * Returns the count of healthy candidates.
     */
    size(): Promise<number>;
    /**
     * Runs a health check on the underlying store.
     */
    healthCheck(): Promise<HealthCheckReport>;
    /**
     * Lists the ids of quarantined records.
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
}
//# sourceMappingURL=persistent-candidate-store.d.ts.map