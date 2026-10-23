/**
 * Nemons Persistence — PersistentExperienceStore
 *
 * Wraps a `PersistentStore<Experience>` to implement the `ExperienceStore`
 * interface. This is a drop-in replacement for `InMemoryExperienceStore`:
 * records survive restart, integrity is verified on load, and corrupt
 * records are quarantined (not silently dropped).
 *
 * Architectural principles enforced here:
 *   - "Records survive restart": backed by `PersistentStore`, records
 *     are loaded from disk on `initialize()`.
 *   - "No silent mutation": the lifecycle state machine is preserved
 *     across restarts — an `observed` record on disk stays `observed`
 *     when loaded; promote() persists the new kind.
 *   - "Retrieved is not approved": the store preserves the provenance
 *     kind on read; a record retrieved as `observed` is still `observed`.
 *   - "Failure handling": corrupt records are quarantined by the
 *     underlying PersistentStore; the wrapper surfaces them via the
 *     health-check report and `listQuarantine`.
 */
import type { ExperienceStore } from "../experience/experience-store.js";
import type { Experience } from "../schemas/experience.js";
import type { ExperienceId } from "../core/identifiers.js";
import type { ProvenanceKind, ReviewEntry } from "../core/provenance.js";
import type { PersistentStore, HealthCheckReport } from "./persistence-contract.js";
/**
 * The PersistentExperienceStore. Implements the `ExperienceStore`
 * interface (so it's a drop-in replacement for InMemoryExperienceStore).
 *
 * All operations are async (the underlying PersistentStore is async).
 *
 * Note: the ExperienceStore interface in `experience-store.ts` has
 * synchronous methods; we expose async equivalents here. Callers that
 * need a sync interface should use `InMemoryExperienceStore`.
 */
export declare class PersistentExperienceStore implements Omit<ExperienceStore, "add" | "get" | "list" | "promote" | "size"> {
    private readonly backend;
    constructor(backend: PersistentStore<Experience & {
        id: string;
    }>);
    /**
     * Initializes the underlying PersistentStore. Must be called before
     * any other operation.
     */
    initialize(): Promise<void>;
    /**
     * Adds (or replaces) an Experience. The Experience MUST start as
     * `observed` (the same constraint as InMemoryExperienceStore).
     *
     * Throws if the Experience is not `observed` or fails validation.
     */
    add(experience: Experience): Promise<Experience>;
    /**
     * Loads an Experience by id. Returns `undefined` when missing OR when
     * the record is corrupt (the corruption is recorded in the health
     * check report; the caller can call `listQuarantine` to inspect).
     *
     * This differs from the sync ExperienceStore which returns `undefined`
     * only for truly missing records. Here, corrupt records also return
     * `undefined` to preserve the interface contract.
     *
     * Use `getWithStatus` for the full load result (ok / missing / corrupt).
     */
    get(id: ExperienceId): Promise<Experience | undefined>;
    /**
     * Loads an Experience by id, returning the full status (ok / missing /
     * corrupt). Use this when the caller needs to distinguish between
     * truly missing records and corrupt ones.
     */
    getWithStatus(id: ExperienceId): Promise<{
        readonly kind: "ok";
        readonly record: Experience;
    } | {
        readonly kind: "missing";
    } | {
        readonly kind: "corrupt";
        readonly reason: string;
    }>;
    /**
     * Lists all healthy Experiences (corrupt ones are excluded; they're
     * in the quarantine). The order is undefined (the underlying store
     * decides; FileSystemStore returns filesystem order).
     */
    list(): Promise<readonly Experience[]>;
    /**
     * Promotes an Experience from one lifecycle kind to another. The
     * promotion is persisted: a new instance of the store loading the
     * same backend will see the promoted kind.
     *
     * Throws `LifecycleViolationError` for forbidden transitions.
     * Throws `ContractValidationError` if the Experience is not found.
     */
    promote(id: ExperienceId, toKind: ProvenanceKind, reviewEntry: Omit<ReviewEntry, "from" | "to">): Promise<Experience>;
    /**
     * Returns the count of healthy records.
     */
    size(): Promise<number>;
    /**
     * Runs a health check on the underlying store. Returns the report.
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
/**
 * A validator function for Experience records. Used by FileSystemStore
 * to validate records on add and on read.
 *
 * NOTE: TypeScript assertions require the function declaration to use
 * the explicit `asserts` keyword in a function declaration (not an
 * arrow function assigned to a const).
 */
export declare function experienceValidator(record: unknown): asserts record is Experience;
//# sourceMappingURL=persistent-experience-store.d.ts.map