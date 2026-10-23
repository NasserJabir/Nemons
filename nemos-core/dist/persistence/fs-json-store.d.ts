/**
 * Nemons Persistence — File-System JSON Store
 *
 * The `FileSystemStore` is the canonical in-process implementation of
 * `PersistentStore<T>`. It stores each record as a JSON file on disk.
 *
 * Architectural principles enforced here:
 *   - "Records survive restart": records are written to disk; a new
 *     store instance at the same location loads them.
 *   - "Integrity": each record is wrapped in a `PersistedEnvelope` with
 *     a SHA-256 content hash. On read, the hash is verified. Tampered
 *     files produce "corrupt" results and are quarantined.
 *   - "No silent mutation": the store does NOT modify the record's
 *     fields on read; the file's bytes are loaded and parsed.
 *   - "Failure handling": corrupt records are moved to a quarantine
 *     directory and reported via the health check.
 *   - "Atomic writes": writes go to a temp file first, then rename.
 *     A crash mid-write does not corrupt the existing record.
 *
 * Directory layout:
 *   <root>/
 *     records/<id>.json       — healthy records
 *     quarantine/<id>.json    — records that failed validation
 *     quarantine/<id>.reason  — text file with the failure reason
 *
 * The store is NOT concurrency-safe beyond atomic-rename. Multiple
 * processes writing to the same root will race; use a single-process
 * runtime, or wrap the store in a lock for multi-process use.
 */
import type { PersistentStore, PersistedRecord, PersistedEnvelope, LoadResult, HealthCheckReport, PersistedRecordValidator } from "./persistence-contract.js";
/**
 * Configuration for the FileSystemStore.
 */
export interface FileSystemStoreOptions {
    /**
     * The root directory for the store. Will be created if it doesn't exist.
     * Sub-directories `records/` and `quarantine/` are created inside.
     */
    readonly rootDir: string;
    /**
     * Optional validator. If provided, the store validates each record
     * on add and on read. Validation failures are treated as "corrupt".
     */
    readonly validator?: PersistedRecordValidator<PersistedRecord>;
    /**
     * Whether to run a health check on the first access (lazy).
     * Default: false (the caller decides when to run health checks).
     */
    readonly healthCheckOnStartup?: boolean;
}
export declare class FileSystemStore<T extends PersistedRecord> implements PersistentStore<T> {
    private readonly options;
    private readonly recordsDir;
    private readonly quarantineDir;
    private readonly validator?;
    private readonly quarantined;
    constructor(options: FileSystemStoreOptions);
    /**
     * Initializes the store by creating the directories. Must be called
     * before any other operation. Idempotent.
     */
    initialize(): Promise<void>;
    add(record: T): Promise<PersistedEnvelope<T>>;
    get(id: string): Promise<LoadResult<T>>;
    list(): Promise<readonly PersistedEnvelope<T>[]>;
    delete(id: string): Promise<boolean>;
    healthCheck(): Promise<HealthCheckReport>;
    listQuarantine(): Promise<readonly {
        readonly id: string;
        readonly reason: string;
        readonly quarantinedAt: string;
    }[]>;
    purgeQuarantine(): Promise<number>;
    size(): Promise<number>;
    private recordPath;
    private quarantinePath;
    private sanitizeId;
    private computeHash;
    private validateOrThrow;
    private quarantine;
    private listRecordIds;
    private safeReadDir;
    private refreshQuarantineIndex;
}
//# sourceMappingURL=fs-json-store.d.ts.map