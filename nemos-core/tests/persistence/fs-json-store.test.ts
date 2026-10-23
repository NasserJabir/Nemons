/**
 * Stage E — FileSystemStore tests.
 *
 * Verifies:
 *   F1: add() writes a record to disk; get() returns it.
 *   F2: Records survive restart (new store at same location loads records).
 *   F3: Tampered records (modified content hash) are detected as corrupt.
 *   F4: Corrupt records are quarantined (not silently dropped).
 *   F5: list() returns healthy records only.
 *   F6: delete() removes a record.
 *   F7: healthCheck() reports healthy + corrupt records.
 *   F8: size() returns the count of healthy records.
 *   F9: Atomic writes: a temp file is used, then renamed.
 *   F10: Schema validation failures on read produce "corrupt".
 *   F11: The store does NOT modify the record's fields on read.
 *   F12: listQuarantine() returns quarantined records with reasons.
 *   F13: purgeQuarantine() permanently removes quarantined records.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { FileSystemStore } from "../../src/persistence/fs-json-store.js";
import type { PersistedRecord } from "../../src/persistence/persistence-contract.js";

interface TestRecord extends PersistedRecord {
  readonly id: string;
  readonly value: string;
  readonly tags: readonly string[];
}

function makeRecord(overrides: Partial<TestRecord> = {}): TestRecord {
  return {
    id: "rec-1",
    value: "hello",
    tags: ["a", "b"],
    ...overrides,
  };
}

async function withTempDir<T>(
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nem-test-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("Stage E — FileSystemStore", () => {
  describe("F1 + F2: persistence basics + restart survival", () => {
    it("F1: add writes a record; get returns it", async () => {
      await withTempDir(async (dir) => {
        const store = new FileSystemStore<TestRecord>({ rootDir: dir });
        await store.initialize();
        const rec = makeRecord();
        await store.add(rec);
        const result = await store.get(rec.id);
        expect(result.kind).toBe("ok");
        if (result.kind === "ok") {
          expect(result.record.id).toBe(rec.id);
          expect(result.record.value).toBe(rec.value);
          expect(result.record.tags).toEqual(rec.tags);
          expect(result.envelope.contentHash).toBeDefined();
          expect(result.envelope.persistedAt).toBeDefined();
        }
      });
    });

    it("F2: records survive restart (new store at same dir loads records)", async () => {
      await withTempDir(async (dir) => {
        // First instance: write a record
        const store1 = new FileSystemStore<TestRecord>({ rootDir: dir });
        await store1.initialize();
        await store1.add(makeRecord({ id: "r-A", value: "first" }));
        await store1.add(makeRecord({ id: "r-B", value: "second" }));

        // Second instance: load the records
        const store2 = new FileSystemStore<TestRecord>({ rootDir: dir });
        await store2.initialize();
        const resultA = await store2.get("r-A");
        const resultB = await store2.get("r-B");
        expect(resultA.kind).toBe("ok");
        expect(resultB.kind).toBe("ok");
        if (resultA.kind === "ok" && resultB.kind === "ok") {
          expect(resultA.record.value).toBe("first");
          expect(resultB.record.value).toBe("second");
        }
      });
    });
  });

  describe("F3 + F4: tampering detection + quarantine", () => {
    it("F3: tampered content (hash mismatch) is detected as corrupt", async () => {
      await withTempDir(async (dir) => {
        const store = new FileSystemStore<TestRecord>({ rootDir: dir });
        await store.initialize();
        const rec = makeRecord({ id: "r-tamper", value: "original" });
        await store.add(rec);

        // Tamper: modify the file directly on disk
        const recordPath = path.join(dir, "records", "r-tamper.json");
        const raw = await fs.readFile(recordPath, "utf8");
        const envelope = JSON.parse(raw);
        // Modify the record's value but KEEP the old hash → mismatch on read
        envelope.record.value = "TAMPERED";
        await fs.writeFile(recordPath, JSON.stringify(envelope, null, 2), "utf8");

        const result = await store.get("r-tamper");
        expect(result.kind).toBe("corrupt");
        if (result.kind === "corrupt") {
          expect(result.quarantined).toBe(true);
          expect(result.reason).toContain("hash mismatch");
        }
      });
    });

    it("F4: corrupt records are quarantined (not silently dropped)", async () => {
      await withTempDir(async (dir) => {
        const store = new FileSystemStore<TestRecord>({ rootDir: dir });
        await store.initialize();
        const rec = makeRecord({ id: "r-quarantine" });
        await store.add(rec);

        // Tamper
        const recordPath = path.join(dir, "records", "r-quarantine.json");
        const raw = await fs.readFile(recordPath, "utf8");
        const envelope = JSON.parse(raw);
        envelope.record.value = "TAMPERED";
        await fs.writeFile(recordPath, JSON.stringify(envelope, null, 2), "utf8");

        // Read — should quarantine
        const result = await store.get("r-quarantine");
        expect(result.kind).toBe("corrupt");

        // The quarantined file should exist in the quarantine dir
        const quarantinePath = path.join(dir, "quarantine", "r-quarantine.json");
        const reasonPath = path.join(dir, "quarantine", "r-quarantine.reason");
        const stat = await fs.stat(quarantinePath);
        expect(stat.isFile()).toBe(true);
        const reasonStat = await fs.stat(reasonPath);
        expect(reasonStat.isFile()).toBe(true);

        // The original records dir should NOT have the file anymore
        await expect(fs.stat(recordPath)).rejects.toThrow();
      });
    });

    it("F4: listQuarantine() returns quarantined records with reasons", async () => {
      await withTempDir(async (dir) => {
        const store = new FileSystemStore<TestRecord>({ rootDir: dir });
        await store.initialize();
        const rec = makeRecord({ id: "r-list-q" });
        await store.add(rec);

        // Tamper
        const recordPath = path.join(dir, "records", "r-list-q.json");
        const raw = await fs.readFile(recordPath, "utf8");
        const envelope = JSON.parse(raw);
        envelope.record.value = "TAMPERED";
        await fs.writeFile(recordPath, JSON.stringify(envelope, null, 2), "utf8");

        // Trigger quarantine via get
        await store.get("r-list-q");

        const quarantined = await store.listQuarantine();
        expect(quarantined).toHaveLength(1);
        expect(quarantined[0]!.id).toBe("r-list-q");
        expect(quarantined[0]!.reason).toContain("hash mismatch");
        expect(quarantined[0]!.quarantinedAt).toBeDefined();
      });
    });
  });

  describe("F5 + F6: list + delete", () => {
    it("F5: list returns healthy records only (corrupt excluded)", async () => {
      await withTempDir(async (dir) => {
        const store = new FileSystemStore<TestRecord>({ rootDir: dir });
        await store.initialize();
        await store.add(makeRecord({ id: "r-healthy" }));
        await store.add(makeRecord({ id: "r-corrupt" }));

        // Tamper the second record
        const recordPath = path.join(dir, "records", "r-corrupt.json");
        const raw = await fs.readFile(recordPath, "utf8");
        const envelope = JSON.parse(raw);
        envelope.record.value = "TAMPERED";
        await fs.writeFile(recordPath, JSON.stringify(envelope, null, 2), "utf8");

        const list = await store.list();
        expect(list).toHaveLength(1);
        expect(list[0]!.record.id).toBe("r-healthy");
      });
    });

    it("F6: delete removes a record", async () => {
      await withTempDir(async (dir) => {
        const store = new FileSystemStore<TestRecord>({ rootDir: dir });
        await store.initialize();
        await store.add(makeRecord({ id: "r-del" }));
        const deleted = await store.delete("r-del");
        expect(deleted).toBe(true);
        const result = await store.get("r-del");
        expect(result.kind).toBe("missing");
      });
    });

    it("F6: delete returns false for unknown ids", async () => {
      await withTempDir(async (dir) => {
        const store = new FileSystemStore<TestRecord>({ rootDir: dir });
        await store.initialize();
        const deleted = await store.delete("nonexistent");
        expect(deleted).toBe(false);
      });
    });
  });

  describe("F7 + F8: healthCheck + size", () => {
    it("F7: healthCheck reports healthy + corrupt records", async () => {
      await withTempDir(async (dir) => {
        const store = new FileSystemStore<TestRecord>({ rootDir: dir });
        await store.initialize();
        await store.add(makeRecord({ id: "r-h1" }));
        await store.add(makeRecord({ id: "r-h2" }));
        await store.add(makeRecord({ id: "r-c1" }));

        // Tamper the third
        const recordPath = path.join(dir, "records", "r-c1.json");
        const raw = await fs.readFile(recordPath, "utf8");
        const envelope = JSON.parse(raw);
        envelope.record.value = "TAMPERED";
        await fs.writeFile(recordPath, JSON.stringify(envelope, null, 2), "utf8");

        const report = await store.healthCheck();
        expect(report.totalRecords).toBe(3);
        expect(report.healthy).toEqual(expect.arrayContaining(["r-h1", "r-h2"]));
        expect(report.corrupt).toHaveLength(1);
        expect(report.corrupt[0]!.id).toBe("r-c1");
      });
    });

    it("F8: size returns the count of healthy records", async () => {
      await withTempDir(async (dir) => {
        const store = new FileSystemStore<TestRecord>({ rootDir: dir });
        await store.initialize();
        await store.add(makeRecord({ id: "r-1" }));
        await store.add(makeRecord({ id: "r-2" }));
        expect(await store.size()).toBe(2);
      });
    });
  });

  describe("F9: atomic writes", () => {
    it("the temp file is cleaned up after a successful write", async () => {
      await withTempDir(async (dir) => {
        const store = new FileSystemStore<TestRecord>({ rootDir: dir });
        await store.initialize();
        await store.add(makeRecord({ id: "r-atomic" }));

        // The records dir should contain exactly one .json file
        const entries = await fs.readdir(path.join(dir, "records"));
        const jsonFiles = entries.filter((e) => e.endsWith(".json"));
        expect(jsonFiles).toEqual(["r-atomic.json"]);
        // No temp files
        const tempFiles = entries.filter((e) => e.includes(".tmp-"));
        expect(tempFiles).toEqual([]);
      });
    });
  });

  describe("F10: schema validation failures on read produce corrupt", () => {
    it("a record that fails the validator on read is corrupt", async () => {
      await withTempDir(async (dir) => {
        // Use a validator that rejects records with empty value
        const strictValidator = (r: unknown): void => {
          if (typeof r !== "object" || r === null) throw new Error("not object");
          const rec = r as { value?: unknown };
          if (typeof rec.value !== "string" || rec.value.length === 0) {
            throw new Error("value must be a non-empty string");
          }
        };
        const store = new FileSystemStore<TestRecord>({
          rootDir: dir,
          validator: strictValidator as unknown as (record: unknown) => asserts record is TestRecord,
        });
        await store.initialize();

        // Write a valid record
        await store.add(makeRecord({ id: "r-valid", value: "ok" }));

        // Tamper to make value empty (but keep the original hash — that
        // will trigger BOTH hash mismatch AND validator failure; let's
        // make it pass the hash check by re-computing)
        const recordPath = path.join(dir, "records", "r-valid.json");
        const raw = await fs.readFile(recordPath, "utf8");
        const envelope = JSON.parse(raw);
        envelope.record.value = "";
        // Recompute the hash to match (so only the validator fails)
        const crypto = await import("node:crypto");
        const canonical = JSON.stringify(
          envelope.record,
          Object.keys(envelope.record).sort(),
        );
        envelope.contentHash = crypto.createHash("sha256").update(canonical).digest("hex");
        await fs.writeFile(recordPath, JSON.stringify(envelope, null, 2), "utf8");

        const result = await store.get("r-valid");
        expect(result.kind).toBe("corrupt");
        if (result.kind === "corrupt") {
          expect(result.reason).toContain("Schema validation failed");
        }
      });
    });
  });

  describe("F11: store does NOT modify the record's fields on read", () => {
    it("the record's fields are preserved exactly", async () => {
      await withTempDir(async (dir) => {
        const store = new FileSystemStore<TestRecord>({ rootDir: dir });
        await store.initialize();
        const rec = makeRecord({
          id: "r-exact",
          value: "preserved-exactly",
          tags: ["x", "y", "z"],
        });
        await store.add(rec);
        const result = await store.get("r-exact");
        if (result.kind === "ok") {
          // Every field is preserved exactly
          expect(result.record).toEqual(rec);
        }
      });
    });
  });

  describe("F13: purgeQuarantine", () => {
    it("permanently removes quarantined records", async () => {
      await withTempDir(async (dir) => {
        const store = new FileSystemStore<TestRecord>({ rootDir: dir });
        await store.initialize();
        await store.add(makeRecord({ id: "r-purge" }));

        // Tamper
        const recordPath = path.join(dir, "records", "r-purge.json");
        const raw = await fs.readFile(recordPath, "utf8");
        const envelope = JSON.parse(raw);
        envelope.record.value = "TAMPERED";
        await fs.writeFile(recordPath, JSON.stringify(envelope, null, 2), "utf8");

        // Trigger quarantine via get
        await store.get("r-purge");

        // Verify quarantined
        const quarantinedBefore = await store.listQuarantine();
        expect(quarantinedBefore).toHaveLength(1);

        // Purge
        const count = await store.purgeQuarantine();
        expect(count).toBe(1);

        // No more quarantined records
        const quarantinedAfter = await store.listQuarantine();
        expect(quarantinedAfter).toEqual([]);
      });
    });
  });

  describe("edge cases", () => {
    it("get on a non-existent id returns missing", async () => {
      await withTempDir(async (dir) => {
        const store = new FileSystemStore<TestRecord>({ rootDir: dir });
        await store.initialize();
        const result = await store.get("nonexistent");
        expect(result.kind).toBe("missing");
      });
    });

    it("initialize is idempotent", async () => {
      await withTempDir(async (dir) => {
        const store = new FileSystemStore<TestRecord>({ rootDir: dir });
        await store.initialize();
        await store.initialize();
        await store.initialize();
        expect(await store.size()).toBe(0);
      });
    });

    it("ids with special characters are sanitized for filenames", async () => {
      await withTempDir(async (dir) => {
        const store = new FileSystemStore<TestRecord>({ rootDir: dir });
        await store.initialize();
        const id = "weird/id:with*special?chars";
        await store.add(makeRecord({ id }));
        const result = await store.get(id);
        expect(result.kind).toBe("ok");
        if (result.kind === "ok") {
          expect(result.record.id).toBe(id);
        }
      });
    });
  });
});
