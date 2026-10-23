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

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type * as fsSync from "node:fs";
import { createHash } from "node:crypto";
import type {
  PersistentStore,
  PersistedRecord,
  PersistedEnvelope,
  LoadResult,
  HealthCheckReport,
  PersistedRecordValidator,
} from "./persistence-contract.js";

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

/**
 * Default FileSystemStore implementation. Records are stored as JSON
 * files; each file contains a `PersistedEnvelope`.
 *
 * The envelope's `contentHash` is computed over the canonical JSON
 * serialization of the record. The hash is verified on read; mismatches
 * produce "corrupt" results.
 */
/**
 * Recursively sorts ALL keys (top-level + nested) in a JSON-serializable
 * value. Used to compute a stable content hash that captures the FULL
 * content of the record, including nested objects.
 *
 * Arrays are traversed (but array order is preserved — arrays are
 * positional, not keyed).
 *
 * Used by `FileSystemStore.computeHash` to detect tampering of any
 * field at any depth.
 */
function canonicalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => canonicalizeForHash(v));
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, unknown> = {};
    for (const k of sortedKeys) {
      result[k] = canonicalizeForHash(obj[k]);
    }
    return result;
  }
  return value;
}

export class FileSystemStore<T extends PersistedRecord> implements PersistentStore<T> {
  private readonly recordsDir: string;
  private readonly quarantineDir: string;
  private readonly validator?: PersistedRecordValidator<PersistedRecord>;

  // Track quarantined ids in-memory so listQuarantine can return them
  // without re-scanning the quarantine directory (which may be large).
  private readonly quarantined = new Map<
    string,
    { readonly reason: string; readonly quarantinedAt: string }
  >();

  constructor(private readonly options: FileSystemStoreOptions) {
    this.recordsDir = path.join(options.rootDir, "records");
    this.quarantineDir = path.join(options.rootDir, "quarantine");
    this.validator = options.validator;
  }

  /**
   * Initializes the store by creating the directories. Must be called
   * before any other operation. Idempotent.
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.recordsDir, { recursive: true });
    await fs.mkdir(this.quarantineDir, { recursive: true });
    // Load any existing quarantine entries into the in-memory map
    await this.refreshQuarantineIndex();
    if (this.options.healthCheckOnStartup) {
      await this.healthCheck();
    }
  }

  async add(record: T): Promise<PersistedEnvelope<T>> {
    // Validate first (defense in depth)
    this.validateOrThrow(record);

    const contentHash = this.computeHash(record);
    const envelope: PersistedEnvelope<T> = {
      record,
      contentHash,
      persistedAt: new Date().toISOString(),
    };

    // Atomic write: write to a temp file, then rename
    const targetPath = this.recordPath(record.id);
    const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
    const json = JSON.stringify(envelope, null, 2);
    await fs.writeFile(tempPath, json, "utf8");
    await fs.rename(tempPath, targetPath);

    return envelope;
  }

  async get(id: string): Promise<LoadResult<T>> {
    const targetPath = this.recordPath(id);
    try {
      const json = await fs.readFile(targetPath, "utf8");
      const parsed = JSON.parse(json) as PersistedEnvelope<T>;
      // Verify the content hash
      const recomputedHash = this.computeHash(parsed.record);
      if (recomputedHash !== parsed.contentHash) {
        const reason = `Content hash mismatch: stored=${parsed.contentHash}, recomputed=${recomputedHash}`;
        await this.quarantine(id, json, reason);
        return { kind: "corrupt", reason, quarantined: true };
      }
      // Validate the schema
      try {
        this.validateOrThrow(parsed.record);
      } catch (e) {
        const reason = `Schema validation failed: ${(e as Error).message}`;
        await this.quarantine(id, json, reason);
        return { kind: "corrupt", reason, quarantined: true };
      }
      return { kind: "ok", record: parsed.record, envelope: parsed };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return { kind: "missing" };
      }
      // JSON parse error or other IO error
      const reason = `Load failed: ${err.message}`;
      // Try to quarantine (read the raw file content if possible)
      try {
        const raw = await fs.readFile(targetPath, "utf8");
        await this.quarantine(id, raw, reason);
        return { kind: "corrupt", reason, quarantined: true };
      } catch {
        // Could not read the file at all — report as missing (the file
        // does not exist or is unreadable).
        return { kind: "missing" };
      }
    }
  }

  async list(): Promise<readonly PersistedEnvelope<T>[]> {
    const entries = await this.listRecordIds();
    const results: PersistedEnvelope<T>[] = [];
    for (const id of entries) {
      const load = await this.get(id);
      if (load.kind === "ok") {
        results.push(load.envelope);
      }
      // Corrupt and missing records are skipped (already quarantined)
    }
    return results;
  }

  async delete(id: string): Promise<boolean> {
    const targetPath = this.recordPath(id);
    try {
      await fs.unlink(targetPath);
      return true;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") return false;
      throw e;
    }
  }

  async healthCheck(): Promise<HealthCheckReport> {
    const entries = await this.listRecordIds();
    const healthy: string[] = [];
    const corrupt: { readonly id: string; readonly reason: string }[] = [];
    const missing: string[] = [];

    for (const id of entries) {
      const load = await this.get(id);
      if (load.kind === "ok") {
        healthy.push(id);
      } else if (load.kind === "corrupt") {
        corrupt.push({ id, reason: load.reason });
      } else {
        missing.push(id);
      }
    }

    return {
      checkedAt: new Date().toISOString(),
      totalRecords: entries.length,
      healthy,
      corrupt,
      missing,
    };
  }

  async listQuarantine(): Promise<
    readonly { readonly id: string; readonly reason: string; readonly quarantinedAt: string }[]
  > {
    return [...this.quarantined.entries()].map(([id, v]) => ({
      id,
      reason: v.reason,
      quarantinedAt: v.quarantinedAt,
    }));
  }

  async purgeQuarantine(): Promise<number> {
    let count = 0;
    const entries = await this.safeReadDir(this.quarantineDir);
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".json")) {
        const fullPath = path.join(this.quarantineDir, entry.name);
        try {
          await fs.unlink(fullPath);
          count++;
        } catch {
          // ignore — best effort
        }
      }
    }
    // Also remove the .reason files
    const reasonEntries = await this.safeReadDir(this.quarantineDir);
    for (const entry of reasonEntries) {
      if (entry.isFile() && entry.name.endsWith(".reason")) {
        const fullPath = path.join(this.quarantineDir, entry.name);
        try {
          await fs.unlink(fullPath);
        } catch {
          // ignore
        }
      }
    }
    this.quarantined.clear();
    return count;
  }

  async size(): Promise<number> {
    const entries = await this.listRecordIds();
    return entries.length;
  }

  // ─── Internal helpers ───

  private recordPath(id: string): string {
    // Sanitize the id (allow only safe characters)
    const safe = this.sanitizeId(id);
    return path.join(this.recordsDir, `${safe}.json`);
  }

  private quarantinePath(id: string, ext: string): string {
    const safe = this.sanitizeId(id);
    return path.join(this.quarantineDir, `${safe}.${ext}`);
  }

  private sanitizeId(id: string): string {
    // Allow only [a-zA-Z0-9._-]
    return id.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  private computeHash(record: T): string {
    // Canonical JSON: recursively sort ALL keys (top-level + nested).
    // The previous implementation used JSON.stringify(record, replacerArray)
    // which only includes top-level keys; nested objects were serialized
    // as `{}` (empty), causing the hash to miss nested content. This
    // is a CRITICAL bug for tampering detection.
    const canonical = JSON.stringify(canonicalizeForHash(record));
    return createHash("sha256").update(canonical).digest("hex");
  }

  private validateOrThrow(record: unknown): void {
    const validator = this.validator as ((r: unknown) => void) | undefined;
    if (validator) {
      validator(record);
    }
  }

  private async quarantine(id: string, rawContent: string, reason: string): Promise<void> {
    // Write the raw content to quarantine
    const qJsonPath = this.quarantinePath(id, "json");
    const qReasonPath = this.quarantinePath(id, "reason");
    const quarantinedAt = new Date().toISOString();
    await fs.writeFile(qJsonPath, rawContent, "utf8");
    await fs.writeFile(qReasonPath, `${quarantinedAt}\n${reason}\n`, "utf8");
    this.quarantined.set(id, { reason, quarantinedAt });

    // Remove the corrupted file from the records dir
    try {
      await fs.unlink(this.recordPath(id));
    } catch {
      // ignore — best effort
    }
  }

  private async listRecordIds(): Promise<string[]> {
    const entries = await this.safeReadDir(this.recordsDir);
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => e.name.replace(/\.json$/, ""));
  }

  private async safeReadDir(dir: string): Promise<fsSync.Dirent[]> {
    try {
      return await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") return [];
      throw e;
    }
  }

  private async refreshQuarantineIndex(): Promise<void> {
    const entries = await this.safeReadDir(this.quarantineDir);
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".reason")) {
        const id = entry.name.replace(/\.reason$/, "");
        const reasonPath = path.join(this.quarantineDir, entry.name);
        try {
          const content = await fs.readFile(reasonPath, "utf8");
          const lines = content.split("\n");
          const quarantinedAt = lines[0] ?? "unknown";
          const reason = lines.slice(1).join("\n").trim() || "unknown";
          this.quarantined.set(id, { reason, quarantinedAt });
        } catch {
          // ignore — best effort
        }
      }
    }
  }
}
