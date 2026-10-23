/**
 * Nemons Persistence — Build Persistent Runtime.
 *
 * `buildPersistentRuntime` constructs a Nemons runtime backed by a
 * persistent `ExperienceStore`. Records written by this runtime
 * survive restart: a new instance at the same persistence location
 * loads previously-written records.
 *
 * Architectural principles enforced here:
 *   - "Records survive restart": backed by `PersistentExperienceStore`
 *     (which uses `FileSystemStore` by default).
 *   - "No silent mutation": the persistent store preserves the
 *     provenance kind on read; promote() persists the new kind.
 *   - "Failure handling": corrupt records are quarantined; the
 *     health check reports them.
 *
 * Other components (PolicyEngine, RunManager, EvidenceCollector,
 * EvidenceValidator, EvaluationEngine, ExperienceDeriver,
 * ExperienceRetriever) remain in-memory — they're stateless or
 * per-Run. Persistence for Run/Evidence is a Stage E+ extension;
 * the Stage E baseline focuses on Experience persistence.
 */
import { type NemonsRuntime } from "../runtime.js";
import { PersistentExperienceStore } from "./persistent-experience-store.js";
import { DefaultExperienceRetriever } from "../experience/experience-retriever.js";
import type { Experience } from "../schemas/experience.js";
/**
 * A Nemons runtime with persistent Experience storage. The
 * `experienceStore` and `experienceRetriever` fields are replaced
 * with persistent-backed versions; everything else is identical
 * to the in-memory runtime.
 */
export type PersistentNemonsRuntime = Omit<NemonsRuntime, "experienceStore" | "experienceRetriever"> & {
    readonly experienceStore: PersistentExperienceStore;
    readonly experienceRetriever: DefaultExperienceRetriever;
};
/**
 * Builds a Nemons runtime backed by a persistent `ExperienceStore`.
 *
 * Options:
 *   - `rootDir`: the root directory for the FileSystemStore.
 *     Sub-directories `records/` and `quarantine/` are created inside.
 *   - `registerMockAdapter` (default: true): passed to `buildRuntime`.
 *   - `extraRules`: passed to `buildRuntime`.
 *   - `healthCheckOnStartup` (default: false): if true, runs a health
 *     check during `initialize()`. Use this in production to detect
 *     corrupt records at startup.
 *
 * The returned runtime's `initialize()` method MUST be called before
 * any Experience-related operation (add, get, list, promote, retrieve).
 */
export declare function buildPersistentRuntime(options: {
    readonly rootDir: string;
    readonly registerMockAdapter?: boolean;
    readonly extraRules?: readonly import("../policy/policy-contracts.js").PolicyRule[];
    readonly healthCheckOnStartup?: boolean;
}): (PersistentNemonsRuntime & {
    /**
     * Initializes the persistence layer. Must be called before any
     * Experience-related operation.
     */
    initialize(): Promise<HealthCheckReport | undefined>;
});
/**
 * A sync adapter that wraps an async PersistentExperienceStore so it
 * can be used by components that expect a sync ExperienceStore (like
 * the DefaultExperienceRetriever).
 *
 * The adapter loads all records on first access (lazy) and caches them.
 * Subsequent calls return the cached records. To refresh the cache,
 * call `refresh()` after a write.
 *
 * This is a Stage E baseline; a more sophisticated adapter would
 * watch for filesystem changes or use a notification mechanism.
 */
export declare class SyncExperienceStoreAdapter implements Omit<import("../experience/experience-store.js").ExperienceStore, "size"> {
    private readonly backend;
    private cache;
    private readonly cacheMap;
    constructor(backend: PersistentExperienceStore);
    /**
     * Refreshes the cache from the backend. Call after any write
     * (add, promote, delete) to ensure subsequent reads see the
     * updated records.
     */
    refresh(): Promise<void>;
    add(_experience: Experience): Experience;
    get(id: import("../core/identifiers.js").ExperienceId): Experience | undefined;
    list(): readonly Experience[];
    promote(_id: import("../core/identifiers.js").ExperienceId, _toKind: import("../core/provenance.js").ProvenanceKind, _reviewEntry: Omit<import("../core/provenance.js").ReviewEntry, "from" | "to">): Experience;
    size(): number;
    private ensureCache;
}
import type { HealthCheckReport } from "./persistence-contract.js";
//# sourceMappingURL=build-persistent-runtime.d.ts.map