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
import { createHash } from "node:crypto";
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
function canonicalizeForHash(value) {
    if (Array.isArray(value)) {
        return value.map((v) => canonicalizeForHash(v));
    }
    if (value !== null && typeof value === "object") {
        const obj = value;
        const sortedKeys = Object.keys(obj).sort();
        const result = {};
        for (const k of sortedKeys) {
            result[k] = canonicalizeForHash(obj[k]);
        }
        return result;
    }
    return value;
}
export class FileSystemStore {
    options;
    recordsDir;
    quarantineDir;
    validator;
    // Track quarantined ids in-memory so listQuarantine can return them
    // without re-scanning the quarantine directory (which may be large).
    quarantined = new Map();
    constructor(options) {
        this.options = options;
        this.recordsDir = path.join(options.rootDir, "records");
        this.quarantineDir = path.join(options.rootDir, "quarantine");
        this.validator = options.validator;
    }
    /**
     * Initializes the store by creating the directories. Must be called
     * before any other operation. Idempotent.
     */
    async initialize() {
        await fs.mkdir(this.recordsDir, { recursive: true });
        await fs.mkdir(this.quarantineDir, { recursive: true });
        // Load any existing quarantine entries into the in-memory map
        await this.refreshQuarantineIndex();
        if (this.options.healthCheckOnStartup) {
            await this.healthCheck();
        }
    }
    async add(record) {
        // Validate first (defense in depth)
        this.validateOrThrow(record);
        const contentHash = this.computeHash(record);
        const envelope = {
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
    async get(id) {
        const targetPath = this.recordPath(id);
        try {
            const json = await fs.readFile(targetPath, "utf8");
            const parsed = JSON.parse(json);
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
            }
            catch (e) {
                const reason = `Schema validation failed: ${e.message}`;
                await this.quarantine(id, json, reason);
                return { kind: "corrupt", reason, quarantined: true };
            }
            return { kind: "ok", record: parsed.record, envelope: parsed };
        }
        catch (e) {
            const err = e;
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
            }
            catch {
                // Could not read the file at all — report as missing (the file
                // does not exist or is unreadable).
                return { kind: "missing" };
            }
        }
    }
    async list() {
        const entries = await this.listRecordIds();
        const results = [];
        for (const id of entries) {
            const load = await this.get(id);
            if (load.kind === "ok") {
                results.push(load.envelope);
            }
            // Corrupt and missing records are skipped (already quarantined)
        }
        return results;
    }
    async delete(id) {
        const targetPath = this.recordPath(id);
        try {
            await fs.unlink(targetPath);
            return true;
        }
        catch (e) {
            const err = e;
            if (err.code === "ENOENT")
                return false;
            throw e;
        }
    }
    async healthCheck() {
        const entries = await this.listRecordIds();
        const healthy = [];
        const corrupt = [];
        const missing = [];
        for (const id of entries) {
            const load = await this.get(id);
            if (load.kind === "ok") {
                healthy.push(id);
            }
            else if (load.kind === "corrupt") {
                corrupt.push({ id, reason: load.reason });
            }
            else {
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
    async listQuarantine() {
        return [...this.quarantined.entries()].map(([id, v]) => ({
            id,
            reason: v.reason,
            quarantinedAt: v.quarantinedAt,
        }));
    }
    async purgeQuarantine() {
        let count = 0;
        const entries = await this.safeReadDir(this.quarantineDir);
        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith(".json")) {
                const fullPath = path.join(this.quarantineDir, entry.name);
                try {
                    await fs.unlink(fullPath);
                    count++;
                }
                catch {
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
                }
                catch {
                    // ignore
                }
            }
        }
        this.quarantined.clear();
        return count;
    }
    async size() {
        const entries = await this.listRecordIds();
        return entries.length;
    }
    // ─── Internal helpers ───
    recordPath(id) {
        // Sanitize the id (allow only safe characters)
        const safe = this.sanitizeId(id);
        return path.join(this.recordsDir, `${safe}.json`);
    }
    quarantinePath(id, ext) {
        const safe = this.sanitizeId(id);
        return path.join(this.quarantineDir, `${safe}.${ext}`);
    }
    sanitizeId(id) {
        // Allow only [a-zA-Z0-9._-]
        return id.replace(/[^a-zA-Z0-9._-]/g, "_");
    }
    computeHash(record) {
        // Canonical JSON: recursively sort ALL keys (top-level + nested).
        // The previous implementation used JSON.stringify(record, replacerArray)
        // which only includes top-level keys; nested objects were serialized
        // as `{}` (empty), causing the hash to miss nested content. This
        // is a CRITICAL bug for tampering detection.
        const canonical = JSON.stringify(canonicalizeForHash(record));
        return createHash("sha256").update(canonical).digest("hex");
    }
    validateOrThrow(record) {
        const validator = this.validator;
        if (validator) {
            validator(record);
        }
    }
    async quarantine(id, rawContent, reason) {
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
        }
        catch {
            // ignore — best effort
        }
    }
    async listRecordIds() {
        const entries = await this.safeReadDir(this.recordsDir);
        return entries
            .filter((e) => e.isFile() && e.name.endsWith(".json"))
            .map((e) => e.name.replace(/\.json$/, ""));
    }
    async safeReadDir(dir) {
        try {
            return await fs.readdir(dir, { withFileTypes: true });
        }
        catch (e) {
            const err = e;
            if (err.code === "ENOENT")
                return [];
            throw e;
        }
    }
    async refreshQuarantineIndex() {
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
                }
                catch {
                    // ignore — best effort
                }
            }
        }
    }
}
//# sourceMappingURL=fs-json-store.js.map