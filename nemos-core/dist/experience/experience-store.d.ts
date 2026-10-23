/**
 * Nemons Experience — Store
 *
 * The ExperienceStore is the in-memory store for Experience records.
 *
 * Architectural principles enforced here:
 *   - "Retrieved is not approved": retrieval preserves the lifecycle
 *     kind. The store does NOT silently upgrade an `observed` record
 *     to `approved` on retrieval.
 *   - "No silent mutation": the store's `promote` operation is the
 *     ONLY sanctioned way to change an Experience's lifecycle kind,
 *     and it enforces the lifecycle state machine.
 *
 * Persistence is a Stage-E capability. This in-memory store satisfies
 * the contract surface for Stage D.
 */
import type { Experience } from "../schemas/experience.js";
import type { ExperienceId } from "../core/identifiers.js";
import type { ProvenanceKind, ReviewEntry } from "../core/provenance.js";
/**
 * The ExperienceStore interface.
 */
export interface ExperienceStore {
    /**
     * Adds a new Experience record to the store. The Experience's
     * provenance MUST be `observed` (initial kind). Use `promote` to
     * change the kind later.
     *
     * Throws if the Experience is not `observed` (a contract violation —
     * the store is the entry point for new records, not for promotion).
     */
    add(experience: Experience): Experience;
    /**
     * Retrieves an Experience by id. Returns `undefined` when not found.
     * The returned Experience preserves its lifecycle kind (retrieved
     * is not approved).
     */
    get(id: ExperienceId): Experience | undefined;
    /**
     * Lists all Experience records in the store. The order is
     * insertion order (stable).
     */
    list(): readonly Experience[];
    /**
     * Promotes an Experience from one lifecycle kind to another.
     *
     * Throws `LifecycleViolationError` if the transition is not allowed
     * by the lifecycle state machine.
     *
     * Returns the promoted Experience. The original record is replaced
     * in the store (the store treats this as a controlled mutation).
     */
    promote(id: ExperienceId, toKind: ProvenanceKind, reviewEntry: Omit<ReviewEntry, "from" | "to">): Experience;
    /**
     * Returns the number of records in the store.
     */
    size(): number;
}
/**
 * Default in-memory ExperienceStore implementation.
 *
 * Records are keyed by their `id`. The store validates each record
 * on add (defense in depth against tampering at the boundary).
 *
 * Promotion is the only sanctioned mutation; the store applies the
 * lifecycle state machine via `transitionProvenance`.
 */
export declare class InMemoryExperienceStore implements ExperienceStore {
    private readonly records;
    private readonly insertionOrder;
    add(experience: Experience): Experience;
    get(id: ExperienceId): Experience | undefined;
    list(): readonly Experience[];
    promote(id: ExperienceId, toKind: ProvenanceKind, reviewEntry: Omit<ReviewEntry, "from" | "to">): Experience;
    size(): number;
}
/**
 * Convenience helper: returns true iff the store contains an approved
 * Experience with the given id.
 */
export declare function isExperienceApprovedInStore(store: ExperienceStore, id: ExperienceId): boolean;
//# sourceMappingURL=experience-store.d.ts.map