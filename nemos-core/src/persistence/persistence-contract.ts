/**
 * Nemons Persistence — Store Contract
 *
 * The `PersistentStore<T>` interface is the generic contract for any
 * persistence backend. It is parameterized by the record type T,
 * which MUST be a JSON-serializable object with a stable `id` field.
 *
 * Architectural principles enforced here:
 *   - "Records survive restart and can be retrieved and verified
 *     without silently changing their trust status."
 *   - "No silent mutation": persistence MUST NOT change the
 *     provenance kind of a record on retrieval.
 *   - "Failure handling": a corrupt or tampered record is QUARANTINED,
 *     not silently dropped. The store returns a structured health
 *     report so callers can audit and repair.
 *
 * The interface is intentionally backend-agnostic. Implementations may
 * use file-system JSON, SQLite, an external service, etc.
 *
 * Stage E deliverables:
 *   - FileSystemStore (the canonical in-process implementation)
 *   - PersistentExperienceStore (wraps PersistentStore for Experience)
 *   - HealthCheck (audits the store on startup + on demand)
 */

/**
 * The minimal record shape that any PersistentStore can handle.
 * Records MUST have a stable string id and be JSON-serializable.
 *
 * The `__nemPersistedAt` and `__nemContentHash` fields are added by
 * the store on write; they are NOT part of the user's record schema
 * and are verified on read.
 */
export interface PersistedRecord {
  /**
   * A stable, unique identifier for the record. MUST be a non-empty
   * string suitable for use as a filename (after sanitization).
   */
  readonly id: string;
}

/**
 * A wrapper around the stored record that carries the content hash
 * and the persisted-at timestamp. The wrapper is what gets written
 * to the backend; the unwrapped record is what callers see.
 */
export interface PersistedEnvelope<T extends PersistedRecord> {
  readonly record: T;
  readonly contentHash: string;
  readonly persistedAt: string;
}

/**
 * The result of a load operation. Either:
 *   - `kind: "ok"` with the record (hash verified), OR
 *   - `kind: "missing"` (no record with that id), OR
 *   - `kind: "corrupt"` (the record exists but failed validation
 *     — hash mismatch or schema validation failure).
 *
 * Corrupt records are quarantined by the store; the caller is informed.
 */
export type LoadResult<T extends PersistedRecord> =
  | { readonly kind: "ok"; readonly record: T; readonly envelope: PersistedEnvelope<T> }
  | { readonly kind: "missing" }
  | { readonly kind: "corrupt"; readonly reason: string; readonly quarantined: boolean };

/**
 * A record of a health-check sweep: which records are healthy,
 * which are corrupt (and were quarantined), which are missing.
 */
export interface HealthCheckReport {
  readonly checkedAt: string;
  readonly totalRecords: number;
  readonly healthy: readonly string[];
  readonly corrupt: readonly { readonly id: string; readonly reason: string }[];
  readonly missing: readonly string[]; // ids listed but not found
}

/**
 * The generic PersistentStore interface.
 *
 * Implementations MUST:
 *   - Compute a content hash on `add()` and persist it alongside the record.
 *   - Verify the content hash on `get()` and `list()`. Mismatches produce
 *     `kind: "corrupt"` results; the underlying record is quarantined.
 *   - Re-validate the record against the provided validator (if any) on
 *     `get()` and `list()`. Validation failures also produce "corrupt".
 *   - Survive restart: a new store instance pointing at the same
 *     backend location MUST return previously-written records.
 *   - Not silently mutate a record's fields (especially the provenance
 *     kind) on retrieval.
 */
export interface PersistentStore<T extends PersistedRecord> {
  /**
   * Adds (or replaces) a record. Returns the persisted envelope.
   *
   * Throws if the record fails the validator (if provided).
   */
  add(record: T): Promise<PersistedEnvelope<T>>;

  /**
   * Loads a record by id. Returns a `LoadResult` that distinguishes
   * ok / missing / corrupt. Corrupt records are quarantined by the
   * store; the caller is informed.
   */
  get(id: string): Promise<LoadResult<T>>;

  /**
   * Lists all healthy records (corrupt ones are excluded). Returns
   * envelopes with the persisted metadata.
   */
  list(): Promise<readonly PersistedEnvelope<T>[]>;

  /**
   * Deletes a record. Returns true if the record existed and was
   * deleted; false otherwise. Quarantined records are NOT deleted
   * by this call (use `purgeQuarantine` for that).
   */
  delete(id: string): Promise<boolean>;

  /**
   * Runs a health check: scans all records, verifies hashes and
   * schemas, quarantines any that fail. Returns the report.
   */
  healthCheck(): Promise<HealthCheckReport>;

  /**
   * Lists the ids of quarantined records (those that failed
   * validation on a previous get/list/healthCheck).
   */
  listQuarantine(): Promise<readonly { readonly id: string; readonly reason: string; readonly quarantinedAt: string }[]>;

  /**
   * Permanently removes all quarantined records. Returns the count.
   * Use with caution — quarantined records are typically preserved
   * for audit.
   */
  purgeQuarantine(): Promise<number>;

  /**
   * Returns the count of healthy records.
   */
  size(): Promise<number>;
}

/**
 * A validator function: throws if the record is invalid (e.g., fails
 * schema validation). Used by the store on `add` and on `get`/`list`
 * (to detect tampering that preserves the hash but corrupts the schema).
 *
 * Note: schema validation is a SECONDARY check; the PRIMARY integrity
 * check is the content hash. Schema validation catches the case where
 * the file was tampered in a way that preserves the hash (impossible
 * with a secure hash function, but defense in depth).
 */
export type PersistedRecordValidator<T extends PersistedRecord> = (record: unknown) => asserts record is T;
