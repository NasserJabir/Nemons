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
export {};
//# sourceMappingURL=persistence-contract.js.map