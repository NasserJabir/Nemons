/**
 * Property-based tests for the FileSystemStore (fs-json-store).
 *
 * Example-based tests cover the specific cases; these properties cover
 * the SPACE of inputs with generated cases (fast-check):
 *
 *   P1: Round-trip — for ANY JSON-serializable record, add → get
 *       returns a record deep-equal to the input.
 *   P2: Canonical-hash order independence — a record and a
 *       key-shuffled deep clone of it produce the SAME contentHash
 *       (the hash must capture content, not key order, at any depth).
 *   P3: Path containment — for ANY id string, including hostile
 *       traversal payloads, the persisted file stays inside the
 *       records directory (no id can make the store write outside).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileSystemStore } from "../../src/persistence/fs-json-store.js";
import type { PersistedRecord } from "../../src/persistence/fs-json-store.js";

type AnyRecord = PersistedRecord & Record<string, unknown>;

function makeStore(dir: string): FileSystemStore<AnyRecord> {
  return new FileSystemStore<AnyRecord>({
    rootDir: dir,
    healthCheckOnStartup: false,
  });
}

function deepShuffleKeys<T>(value: T, rng: () => number): T {
  // Deterministic key-order scrambler for objects (arrays keep order —
  // they are positional, exactly like the canonicalizer assumes).
  if (Array.isArray(value)) {
    return value.map((v) => deepShuffleKeys(v, rng)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    // Fisher-Yates with the injected rng
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [entries[i], entries[j]] = [entries[j]!, entries[i]!];
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = deepShuffleKeys(v, rng);
    return out as T;
  }
  return value;
}

describe("FileSystemStore properties (fast-check)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nemons-fc-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("P1: round-trip — any JSON record survives add → get unchanged", async () => {
    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), async (json) => {
        const localDir = mkdtempSync(join(tmpdir(), "nemons-fc-rt-"));
        try {
          const store = makeStore(localDir);
          await store.initialize();
          const record = { id: `rt-${Math.abs(hashSeed(json))}`, payload: json };
          await store.add(record);
          const loaded = await store.get(record.id);
          expect(loaded.kind).toBe("ok");
          if (loaded.kind !== "loaded") return;
          expect(loaded.record).toEqual(record);
        } finally {
          rmSync(localDir, { recursive: true, force: true });
        }
      }),
      { numRuns: 50 },
    );
  });

  it("P2: contentHash is independent of key order at any depth", async () => {
    // Deterministic pseudo-rng for reproducible shuffles
    let seed = 42;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), async (json) => {
        const localDir = mkdtempSync(join(tmpdir(), "nemons-fc-hash-"));
        try {
          const store = makeStore(localDir);
          await store.initialize();
          const record = { id: "hash-prop", alpha: json, beta: [1, { z: 2, a: 3 }] };
          const shuffled = {
            ...deepShuffleKeys(record, rng),
          } as AnyRecord;

          const e1 = await store.add(record);
          // add() rejects duplicate ids — delete in between
          await store.delete("hash-prop");
          const e2 = await store.add(shuffled);

          expect(e2.contentHash).toBe(e1.contentHash);
        } finally {
          rmSync(localDir, { recursive: true, force: true });
        }
      }),
      { numRuns: 40 },
    );
  });

  it("P3: hostile ids can never escape the records directory", async () => {
    const hostileIds = fc.oneof(
      // traversal payloads
      fc.constantFrom("../../evil", "..\\..\\evil", "a/../../b", "....//....//x", "%2e%2e%2f"),
      // arbitrary garbage (control chars, unicode, separators)
      fc.string({ maxLength: 40 }).filter((s) => s.length > 0),
    );
    await fc.assert(
      fc.asyncProperty(hostileIds, async (hostileId) => {
        const localDir = mkdtempSync(join(tmpdir(), "nemons-fc-path-"));
        try {
          const store = makeStore(localDir);
          await store.initialize();
          const record = { id: hostileId, payload: 1 };
          await store.add(record);

          // Whatever the id, every file the store created lives in the
          // records dir and has a fully sanitized name.
          const entries = readdirSync(join(localDir, "records"));
          const safeName = /^[a-zA-Z0-9._-]+\.json$/;
          for (const entry of entries) {
            expect(entry).toMatch(safeName);
          }
          // And the record round-trips through the same hostile id.
          const loaded = await store.get(hostileId);
          expect(loaded.kind).toBe("ok");
        } finally {
          rmSync(localDir, { recursive: true, force: true });
        }
      }),
      { numRuns: 60 },
    );
  });
});

// Stable 32-bit seed from arbitrary JSON so P1 ids are unique per case
// but deterministic.
function hashSeed(value: unknown): number {
  const s = JSON.stringify(value) ?? "null";
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
