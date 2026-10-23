/**
 * PersistentCandidateStore tests.
 *
 * Verifies:
 *   PC1: candidates survive restart (new instance loads records).
 *   PC2: transitions persist across restart (a promoted candidate's status survives).
 *   PC3: version chain persists across restart.
 *   PC4: active approved persists across restart.
 *   PC5: tampered candidates are detected as corrupt.
 *   PC6: add rejects non-proposed candidates (lifecycle preserved).
 *   PC7: add rejects candidates with non-existent supersedesCandidateId.
 *   PC8: getWithStatus distinguishes ok / missing / corrupt.
 *   PC9: external mutation does NOT corrupt the store.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { FileSystemStore } from "../../src/persistence/fs-json-store.js";
import {
  PersistentCandidateStore,
  candidateValidator,
} from "../../src/persistence/persistent-candidate-store.js";
import type { CandidateRecord } from "../../src/schemas/candidate.js";
import { asCandidateId } from "../../src/core/identifiers.js";
import { isContractValidationError, isLifecycleViolationError } from "../../src/core/errors.js";
import { IllegalCandidateTransitionError } from "../../src/schemas/candidate.js";

function makeCandidate(overrides: Partial<CandidateRecord> = {}): CandidateRecord {
  return {
    id: asCandidateId("cand-1"),
    assetKind: "skill",
    assetId: "skill-1",
    proposedVersion: "1.0.0",
    changeKind: "create",
    content: { name: "run-tests" },
    provenance: {
      kind: "observed",
      source: { kind: "human", actor: "alice", at: "2024-01-01T00:00:00Z" },
    },
    status: "proposed",
    proposedBy: "alice",
    proposedAt: "2024-01-01T00:00:00Z",
    rationale: "Initial creation.",
    reviewTrail: [],
    ...overrides,
  };
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nem-pcand-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function makeBackend(dir: string) {
  return new FileSystemStore<CandidateRecord & { id: string }>({
    rootDir: dir,
    validator: candidateValidator as unknown as (r: unknown) => asserts r is CandidateRecord & { id: string },
  });
}

describe("PersistentCandidateStore", () => {
  describe("PC1 + PC2: persistence + restart survival", () => {
    it("PC1: candidates survive restart (new instance loads records)", async () => {
      await withTempDir(async (dir) => {
        // Instance 1: add a candidate
        const store1 = new PersistentCandidateStore(makeBackend(dir));
        await store1.initialize();
        const cand = makeCandidate({ id: asCandidateId("c-persist-1") });
        await store1.add(cand);

        // Instance 2: load the candidate
        const store2 = new PersistentCandidateStore(makeBackend(dir));
        await store2.initialize();
        const result = await store2.get(cand.id);
        expect(result).toBeDefined();
        expect(result!.id).toBe(cand.id);
        expect(result!.status).toBe("proposed");
      });
    });

    it("PC2: transitions persist across restart", async () => {
      await withTempDir(async (dir) => {
        // Instance 1: add + transition to approved
        const store1 = new PersistentCandidateStore(makeBackend(dir));
        await store1.initialize();
        const cand = makeCandidate({ id: asCandidateId("c-trans-persist") });
        await store1.add(cand);
        await store1.transition(cand.id, "under_review", {
          at: "2024-01-02T00:00:00Z",
          actor: "bob",
          reason: "Review",
        });
        await store1.transition(cand.id, "approved", {
          at: "2024-01-03T00:00:00Z",
          actor: "carol",
          reason: "Approved",
        });

        // Instance 2: should see the approved status
        const store2 = new PersistentCandidateStore(makeBackend(dir));
        await store2.initialize();
        const result = await store2.get(cand.id);
        expect(result).toBeDefined();
        // CRITICAL: the promoted status survived restart
        expect(result!.status).toBe("approved");
        expect(result!.provenance.reviewTrail).toHaveLength(2);
      });
    });
  });

  describe("PC3 + PC4: version chain + active approved across restart", () => {
    it("PC3: version chain persists across restart", async () => {
      await withTempDir(async (dir) => {
        // Instance 1: build a 2-element version chain
        const store1 = new PersistentCandidateStore(makeBackend(dir));
        await store1.initialize();
        const v1 = makeCandidate({
          id: asCandidateId("c-vc-v1"),
          assetId: "skill-chain",
          proposedAt: "2024-01-01T00:00:00Z",
        });
        await store1.add(v1);
        await store1.transition(v1.id, "under_review", { at: "x", actor: "x", reason: "x" });
        await store1.transition(v1.id, "approved", { at: "x", actor: "x", reason: "x" });

        const v2 = makeCandidate({
          id: asCandidateId("c-vc-v2"),
          assetId: "skill-chain",
          proposedAt: "2024-01-02T00:00:00Z",
          changeKind: "update",
          supersedesCandidateId: v1.id,
        });
        await store1.add(v2);
        await store1.transition(v2.id, "under_review", { at: "x", actor: "x", reason: "x" });
        await store1.transition(v2.id, "approved", { at: "x", actor: "x", reason: "x" });
        await store1.transition(v1.id, "superseded", { at: "x", actor: "x", reason: "superseded by v2" });

        // Instance 2: the chain is loaded
        const store2 = new PersistentCandidateStore(makeBackend(dir));
        await store2.initialize();
        const chain = await store2.getVersionChain("skill-chain");
        expect(chain).toHaveLength(2);
        expect(chain[0]!.id).toBe("c-vc-v2");
        expect(chain[1]!.id).toBe("c-vc-v1");
      });
    });

    it("PC4: active approved persists across restart", async () => {
      await withTempDir(async (dir) => {
        // Instance 1: add + approve v1, then v2 supersedes v1
        const store1 = new PersistentCandidateStore(makeBackend(dir));
        await store1.initialize();
        const v1 = makeCandidate({
          id: asCandidateId("c-aa-v1"),
          assetId: "skill-active",
          proposedAt: "2024-01-01T00:00:00Z",
        });
        await store1.add(v1);
        await store1.transition(v1.id, "under_review", { at: "x", actor: "x", reason: "x" });
        await store1.transition(v1.id, "approved", { at: "x", actor: "x", reason: "x" });

        const v2 = makeCandidate({
          id: asCandidateId("c-aa-v2"),
          assetId: "skill-active",
          proposedAt: "2024-01-02T00:00:00Z",
          changeKind: "update",
          supersedesCandidateId: v1.id,
        });
        await store1.add(v2);
        await store1.transition(v2.id, "under_review", { at: "x", actor: "x", reason: "x" });
        await store1.transition(v2.id, "approved", { at: "x", actor: "x", reason: "x" });
        await store1.transition(v1.id, "superseded", { at: "x", actor: "x", reason: "x" });

        // Instance 2: the active approved is v2
        const store2 = new PersistentCandidateStore(makeBackend(dir));
        await store2.initialize();
        const active = await store2.getActiveApproved("skill-active");
        expect(active).toBeDefined();
        expect(active!.id).toBe("c-aa-v2");
      });
    });
  });

  describe("PC5: tampered candidates are detected as corrupt", () => {
    it("a tampered candidate is reported as corrupt via getWithStatus", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentCandidateStore(makeBackend(dir));
        await store.initialize();
        const cand = makeCandidate({ id: asCandidateId("c-tamper") });
        await store.add(cand);

        // Tamper
        const recordPath = path.join(dir, "records", "c-tamper.json");
        const raw = await fs.readFile(recordPath, "utf8");
        const envelope = JSON.parse(raw);
        envelope.record.rationale = "TAMPERED";
        await fs.writeFile(recordPath, JSON.stringify(envelope, null, 2), "utf8");

        const status = await store.getWithStatus(cand.id);
        expect(status.kind).toBe("corrupt");
      });
    });
  });

  describe("PC6 + PC7: add rejections", () => {
    it("PC6: rejects a non-proposed candidate", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentCandidateStore(makeBackend(dir));
        await store.initialize();
        expect(() => store.add(makeCandidate({ status: "approved" }))).rejects.toThrow();
      });
    });

    it("PC7: rejects a candidate with non-existent supersedesCandidateId", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentCandidateStore(makeBackend(dir));
        await store.initialize();
        const bad = makeCandidate({
          changeKind: "update",
          supersedesCandidateId: asCandidateId("nonexistent"),
        });
        expect(() => store.add(bad)).rejects.toThrow();
      });
    });
  });

  describe("PC8: getWithStatus", () => {
    it("returns 'ok' for a healthy candidate", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentCandidateStore(makeBackend(dir));
        await store.initialize();
        const cand = makeCandidate({ id: asCandidateId("c-ok") });
        await store.add(cand);
        const status = await store.getWithStatus(cand.id);
        expect(status.kind).toBe("ok");
      });
    });

    it("returns 'missing' for an unknown id", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentCandidateStore(makeBackend(dir));
        await store.initialize();
        const status = await store.getWithStatus(asCandidateId("nonexistent"));
        expect(status.kind).toBe("missing");
      });
    });
  });

  describe("PC9: external mutation does NOT corrupt the store", () => {
    it("mutating a returned candidate does not affect the stored record", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentCandidateStore(makeBackend(dir));
        await store.initialize();
        const cand = makeCandidate({ id: asCandidateId("c-mut") });
        await store.add(cand);
        const retrieved = await store.get(cand.id);
        (retrieved as { rationale: string }).rationale = "TAMPERED";
        const fresh = await store.get(cand.id);
        expect(fresh!.rationale).toBe("Initial creation.");
      });
    });
  });

  describe("transition rejection", () => {
    it("rejects forbidden transitions", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentCandidateStore(makeBackend(dir));
        await store.initialize();
        const cand = makeCandidate({ id: asCandidateId("c-forbid") });
        await store.add(cand);
        // proposed → approved is forbidden
        expect(
          store.transition(cand.id, "approved", { at: "x", actor: "x", reason: "x" }),
        ).rejects.toThrow();
        try {
          await store.transition(cand.id, "approved", { at: "x", actor: "x", reason: "x" });
        } catch (e) {
          expect(e).toBeInstanceOf(IllegalCandidateTransitionError);
        }
      });
    });

    it("rejects transition for an unknown id", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentCandidateStore(makeBackend(dir));
        await store.initialize();
        expect(
          store.transition(asCandidateId("nonexistent"), "under_review", {
            at: "x",
            actor: "x",
            reason: "x",
          }),
        ).rejects.toThrow();
      });
    });
  });

  describe("size + list", () => {
    it("size returns the count of healthy candidates", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentCandidateStore(makeBackend(dir));
        await store.initialize();
        await store.add(makeCandidate({ id: asCandidateId("c-1") }));
        await store.add(makeCandidate({ id: asCandidateId("c-2") }));
        expect(await store.size()).toBe(2);
      });
    });

    it("list returns all healthy candidates", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentCandidateStore(makeBackend(dir));
        await store.initialize();
        await store.add(makeCandidate({ id: asCandidateId("c-1") }));
        await store.add(makeCandidate({ id: asCandidateId("c-2") }));
        const list = await store.list();
        expect(list).toHaveLength(2);
      });
    });
  });
});
