/**
 * Nemons Governed Evolution — Candidate Store
 *
 * The CandidateStore is the in-memory store for CandidateRecord.
 * It supports version chain queries: given an assetId, return the
 * ordered list of candidates (newest first).
 *
 * Architectural principles enforced here:
 *   - "No silent mutation": the store's `transition` operation is
 *     the ONLY sanctioned way to change a candidate's status, and
 *     it enforces the candidate state machine.
 *   - "The process must preserve provenance, review decisions,
 *     version history": the store's `getVersionChain` returns the
 *     full history of candidates for an asset.
 *
 * Persistence is a Stage E capability; this in-memory store
 * satisfies the contract surface for Stage F. A persistent version
 * would wrap a PersistentStore<CandidateRecord>.
 */
import type { CandidateRecord, CandidateStatus } from "../schemas/candidate.js";
import type { CandidateId } from "../core/identifiers.js";
import type { ReviewEntry } from "../core/provenance.js";
/**
 * The CandidateStore interface.
 */
export interface CandidateStore {
    /**
     * Adds a new CandidateRecord. The candidate's status MUST be
     * `proposed` (the initial status). Use `transition` to change
     * the status later.
     */
    add(candidate: CandidateRecord): CandidateRecord;
    /**
     * Retrieves a candidate by id. Returns `undefined` when not found.
     * The returned record's status is preserved (retrieved is not
     * approved).
     */
    get(id: CandidateId): CandidateRecord | undefined;
    /**
     * Lists all candidates in insertion order.
     */
    list(): readonly CandidateRecord[];
    /**
     * Transitions a candidate from one status to another.
     *
     * Throws `IllegalCandidateTransitionError` for forbidden transitions.
     * Throws `ContractValidationError` if the candidate is not found.
     *
     * Returns the updated candidate. The original record is replaced
     * in the store (controlled mutation).
     */
    transition(id: CandidateId, toStatus: CandidateStatus, reviewEntry: Omit<ReviewEntry, "from" | "to">): CandidateRecord;
    /**
     * Appends an entry to the candidate's review trail WITHOUT changing
     * its status. The sanctioned way for the governed engine to record a
     * review decision (e.g. an approval whose rules are not yet
     * satisfied) — previously the engine built the updated record and
     * never stored it, so the persisted view and the engine's view
     * diverged silently.
     */
    appendReviewTrail(id: CandidateId, reviewEntry: Omit<ReviewEntry, "from" | "to">): CandidateRecord;
    /**
     * Returns the version chain for an asset — the ordered list of
     * candidates that target the given assetId. The order is from
     * newest to oldest (by `proposedAt`).
     *
     * The chain is built by traversing `supersedesCandidateId` links
     * starting from the most recent candidate that is NOT superseded
     * by any other candidate in the store.
     */
    getVersionChain(assetId: string): readonly CandidateRecord[];
    /**
     * Returns the latest approved candidate for an asset (the active
     * version). Returns `undefined` if no approved candidate exists.
     */
    getActiveApproved(assetId: string): CandidateRecord | undefined;
    /**
     * Returns the count of candidates in the store.
     */
    size(): number;
}
/**
 * Default in-memory CandidateStore implementation.
 */
export declare class InMemoryCandidateStore implements CandidateStore {
    private readonly records;
    private readonly insertionOrder;
    add(candidate: CandidateRecord): CandidateRecord;
    get(id: CandidateId): CandidateRecord | undefined;
    list(): readonly CandidateRecord[];
    transition(id: CandidateId, toStatus: CandidateStatus, reviewEntry: Omit<ReviewEntry, "from" | "to">): CandidateRecord;
    appendReviewTrail(id: CandidateId, reviewEntry: Omit<ReviewEntry, "from" | "to">): CandidateRecord;
    getVersionChain(assetId: string): readonly CandidateRecord[];
    getActiveApproved(assetId: string): CandidateRecord | undefined;
    size(): number;
}
//# sourceMappingURL=candidate-store.d.ts.map