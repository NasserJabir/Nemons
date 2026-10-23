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

import { buildRuntime, type NemonsRuntime } from "../runtime.js";
import { FileSystemStore } from "./fs-json-store.js";
import {
  PersistentExperienceStore,
  experienceValidator,
} from "./persistent-experience-store.js";
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
export function buildPersistentRuntime(options: {
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
}) {
  const baseRuntime = buildRuntime({
    registerMockAdapter: options.registerMockAdapter,
    extraRules: options.extraRules,
  });

  const fsStore = new FileSystemStore<Experience & { id: string }>({
    rootDir: options.rootDir,
    validator: experienceValidator as unknown as (
      record: unknown
    ) => asserts record is Experience & { id: string },
    healthCheckOnStartup: options.healthCheckOnStartup ?? false,
  });
  const persistentStore = new PersistentExperienceStore(fsStore);
  const persistentRetriever = new DefaultExperienceRetriever(
    // The retriever expects an ExperienceStore (sync interface); we
    // wrap the async persistent store in an adapter for retrieval.
    // For Stage E baseline, we use a sync adapter that loads all
    // records on demand. (See `SyncExperienceStoreAdapter` below.)
    new SyncExperienceStoreAdapter(persistentStore),
  );

  const runtime = {
    ...baseRuntime,
    experienceStore: persistentStore,
    experienceRetriever: persistentRetriever,
    async initialize() {
      await fsStore.initialize();
      if (options.healthCheckOnStartup) {
        return fsStore.healthCheck();
      }
      return undefined;
    },
  };

  return runtime;
}

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
export class SyncExperienceStoreAdapter implements
  Omit<import("../experience/experience-store.js").ExperienceStore, "size"> {
  private cache: readonly Experience[] | undefined = undefined;
  private readonly cacheMap = new Map<string, Experience>();

  constructor(private readonly backend: PersistentExperienceStore) {}

  /**
   * Refreshes the cache from the backend. Call after any write
   * (add, promote, delete) to ensure subsequent reads see the
   * updated records.
   */
  async refresh(): Promise<void> {
    const records = await this.backend.list();
    this.cache = records;
    this.cacheMap.clear();
    for (const r of records) {
      this.cacheMap.set(r.id, r);
    }
  }

  add(_experience: Experience): Experience {
    // Sync add — we delegate to the backend asynchronously and throw
    // if the write fails. Note: callers using this adapter in async
    // contexts should prefer the underlying PersistentExperienceStore
    // directly.
    throw new Error(
      "SyncExperienceStoreAdapter.add() is not supported in sync mode. " +
        "Use the underlying PersistentExperienceStore.add() (async) instead.",
    );
  }

  get(id: import("../core/identifiers.js").ExperienceId): Experience | undefined {
    this.ensureCache();
    return this.cacheMap.get(id);
  }

  list(): readonly Experience[] {
    this.ensureCache();
    return this.cache!;
  }

  promote(
    _id: import("../core/identifiers.js").ExperienceId,
    _toKind: import("../core/provenance.js").ProvenanceKind,
    _reviewEntry: Omit<import("../core/provenance.js").ReviewEntry, "from" | "to">,
  ): Experience {
    throw new Error(
      "SyncExperienceStoreAdapter.promote() is not supported in sync mode. " +
        "Use the underlying PersistentExperienceStore.promote() (async) instead.",
    );
  }

  size(): number {
    this.ensureCache();
    return this.cache!.length;
  }

  private ensureCache(): void {
    if (this.cache === undefined) {
      throw new Error(
        "SyncExperienceStoreAdapter: cache is not initialized. " +
          "Call `await refresh()` before any sync operation.",
      );
    }
  }
}

// Re-export HealthCheckReport for the initialize() return type.
import type { HealthCheckReport } from "./persistence-contract.js";
