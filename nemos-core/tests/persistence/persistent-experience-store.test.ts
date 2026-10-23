/**
 * Stage E — PersistentExperienceStore tests.
 *
 * Verifies:
 *   P1: add() persists an Experience; get() returns it.
 *   P2: Records survive restart (new store at same dir loads records).
 *   P3: promote() persists the new lifecycle kind across restarts.
 *   P4: Tampered Experience is detected as corrupt on read.
 *   P5: getWithStatus distinguishes ok / missing / corrupt.
 *   P6: add rejects non-observed Experiences (lifecycle preserved).
 *   P7: promote rejects forbidden transitions (lifecycle enforced).
 *   P8: healthCheck reports corrupt records.
 *   P9: The provenance kind is NOT modified on read.
 *   P10: Full restart simulation: Run A derives Experience, restart, Run B retrieves.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  FileSystemStore,
} from "../../src/persistence/fs-json-store.js";
import {
  PersistentExperienceStore,
  experienceValidator,
} from "../../src/persistence/persistent-experience-store.js";
import type { Experience } from "../../src/schemas/experience.js";
import {
  asExperienceId,
  asRunId,
  asEvaluationId,
  asEvidenceId,
} from "../../src/core/identifiers.js";
import {
  isContractValidationError,
  isLifecycleViolationError,
} from "../../src/core/errors.js";

function makeExperience(overrides: Partial<Experience> = {}): Experience {
  return {
    id: asExperienceId("x-1"),
    runId: asRunId("r-source"),
    evaluationId: asEvaluationId("ev-source"),
    provenance: {
      kind: "observed",
      source: {
        kind: "evidence",
        evidenceId: asEvidenceId("ev-source") as never,
        at: "2024-01-01T00:00:00Z",
      },
    },
    applicability: { taskKinds: ["test-fix"] },
    reusability: "reusable",
    summary: "Rebuild before tests to avoid stale artifacts.",
    learnedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

async function withTempDir<T>(
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nem-exp-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("Stage E — PersistentExperienceStore", () => {
  describe("P1 + P2: persistence basics + restart survival", () => {
    it("P1: add persists; get returns the Experience", async () => {
      await withTempDir(async (dir) => {
        const backend = new FileSystemStore<Experience & { id: string }>({
          rootDir: dir,
          validator: experienceValidator as unknown as (r: unknown) => asserts r is Experience & { id: string },
        });
        const store = new PersistentExperienceStore(backend);
        await store.initialize();

        const exp = makeExperience({ id: asExperienceId("x-p1") });
        await store.add(exp);

        const result = await store.get(exp.id);
        expect(result).toBeDefined();
        expect(result!.id).toBe(exp.id);
        expect(result!.summary).toBe(exp.summary);
      });
    });

    it("P2: records survive restart (new store loads records)", async () => {
      await withTempDir(async (dir) => {
        // First instance: add a record
        const backend1 = new FileSystemStore<Experience & { id: string }>({
          rootDir: dir,
          validator: experienceValidator as unknown as (r: unknown) => asserts r is Experience & { id: string },
        });
        const store1 = new PersistentExperienceStore(backend1);
        await store1.initialize();
        await store1.add(makeExperience({ id: asExperienceId("x-survive") }));

        // Second instance at same dir
        const backend2 = new FileSystemStore<Experience & { id: string }>({
          rootDir: dir,
          validator: experienceValidator as unknown as (r: unknown) => asserts r is Experience & { id: string },
        });
        const store2 = new PersistentExperienceStore(backend2);
        await store2.initialize();
        const result = await store2.get(asExperienceId("x-survive"));
        expect(result).toBeDefined();
        expect(result!.id).toBe("x-survive");
        expect(result!.summary).toBe("Rebuild before tests to avoid stale artifacts.");
      });
    });
  });

  describe("P3: promote persists the new lifecycle kind across restarts", () => {
    it("the promoted kind survives restart", async () => {
      await withTempDir(async (dir) => {
        // First instance: add + promote to approved
        const backend1 = new FileSystemStore<Experience & { id: string }>({
          rootDir: dir,
          validator: experienceValidator as unknown as (r: unknown) => asserts r is Experience & { id: string },
        });
        const store1 = new PersistentExperienceStore(backend1);
        await store1.initialize();
        const exp = makeExperience({ id: asExperienceId("x-promote") });
        await store1.add(exp);
        await store1.promote(exp.id, "reviewed", {
          at: "2024-01-02T00:00:00Z",
          actor: "reviewer",
          reason: "Reviewed",
        });
        await store1.promote(exp.id, "approved", {
          at: "2024-01-03T00:00:00Z",
          actor: "approver",
          reason: "Approved",
        });

        // Second instance: should load the approved kind
        const backend2 = new FileSystemStore<Experience & { id: string }>({
          rootDir: dir,
          validator: experienceValidator as unknown as (r: unknown) => asserts r is Experience & { id: string },
        });
        const store2 = new PersistentExperienceStore(backend2);
        await store2.initialize();
        const result = await store2.get(exp.id);
        expect(result).toBeDefined();
        // CRITICAL: the promoted kind survived restart — no silent downgrade
        expect(result!.provenance.kind).toBe("approved");
        // The review trail also survived
        expect(result!.provenance.reviewTrail).toHaveLength(2);
        expect(result!.provenance.reviewTrail?.[0]?.to).toBe("reviewed");
        expect(result!.provenance.reviewTrail?.[1]?.to).toBe("approved");
      });
    });
  });

  describe("P4: tampered Experience is detected as corrupt", () => {
    it("a tampered file produces a corrupt load result", async () => {
      await withTempDir(async (dir) => {
        const backend = new FileSystemStore<Experience & { id: string }>({
          rootDir: dir,
          validator: experienceValidator as unknown as (r: unknown) => asserts r is Experience & { id: string },
        });
        const store = new PersistentExperienceStore(backend);
        await store.initialize();
        const exp = makeExperience({ id: asExperienceId("x-tamper") });
        await store.add(exp);

        // Tamper
        const recordPath = path.join(dir, "records", "x-tamper.json");
        const raw = await fs.readFile(recordPath, "utf8");
        const envelope = JSON.parse(raw);
        envelope.record.summary = "TAMPERED SUMMARY";
        await fs.writeFile(recordPath, JSON.stringify(envelope, null, 2), "utf8");

        // getWithStatus exposes the corruption status (the first call
        // detects the mismatch and quarantines the record).
        const statusResult = await store.getWithStatus(exp.id);
        expect(statusResult.kind).toBe("corrupt");
        if (statusResult.kind === "corrupt") {
          expect(statusResult.reason).toContain("hash mismatch");
        }

        // A second call returns "missing" because the file was quarantined.
        const secondCall = await store.getWithStatus(exp.id);
        expect(secondCall.kind).toBe("missing");
      });
    });
  });

  describe("P5: getWithStatus distinguishes ok / missing / corrupt", () => {
    it("returns 'ok' for a healthy record", async () => {
      await withTempDir(async (dir) => {
        const backend = new FileSystemStore<Experience & { id: string }>({
          rootDir: dir,
          validator: experienceValidator as unknown as (r: unknown) => asserts r is Experience & { id: string },
        });
        const store = new PersistentExperienceStore(backend);
        await store.initialize();
        const exp = makeExperience({ id: asExperienceId("x-ok") });
        await store.add(exp);
        const result = await store.getWithStatus(exp.id);
        expect(result.kind).toBe("ok");
      });
    });

    it("returns 'missing' for an unknown id", async () => {
      await withTempDir(async (dir) => {
        const backend = new FileSystemStore<Experience & { id: string }>({
          rootDir: dir,
          validator: experienceValidator as unknown as (r: unknown) => asserts r is Experience & { id: string },
        });
        const store = new PersistentExperienceStore(backend);
        await store.initialize();
        const result = await store.getWithStatus(asExperienceId("nonexistent"));
        expect(result.kind).toBe("missing");
      });
    });

    it("returns 'corrupt' for a tampered record", async () => {
      await withTempDir(async (dir) => {
        const backend = new FileSystemStore<Experience & { id: string }>({
          rootDir: dir,
          validator: experienceValidator as unknown as (r: unknown) => asserts r is Experience & { id: string },
        });
        const store = new PersistentExperienceStore(backend);
        await store.initialize();
        const exp = makeExperience({ id: asExperienceId("x-corrupt") });
        await store.add(exp);

        // Tamper
        const recordPath = path.join(dir, "records", "x-corrupt.json");
        const raw = await fs.readFile(recordPath, "utf8");
        const envelope = JSON.parse(raw);
        envelope.record.summary = "TAMPERED";
        await fs.writeFile(recordPath, JSON.stringify(envelope, null, 2), "utf8");

        const result = await store.getWithStatus(exp.id);
        expect(result.kind).toBe("corrupt");
      });
    });
  });

  describe("P6: add rejects non-observed Experiences", () => {
    it("an approved Experience is rejected on add", async () => {
      await withTempDir(async (dir) => {
        const backend = new FileSystemStore<Experience & { id: string }>({
          rootDir: dir,
          validator: experienceValidator as unknown as (r: unknown) => asserts r is Experience & { id: string },
        });
        const store = new PersistentExperienceStore(backend);
        await store.initialize();

        const approvedExp = makeExperience({
          provenance: {
            kind: "approved",
            source: {
              kind: "evidence",
              evidenceId: asEvidenceId("ev-x") as never,
              at: "2024-01-01T00:00:00Z",
            },
          },
        });
        expect(() => store.add(approvedExp)).rejects.toThrow();
        try {
          await store.add(approvedExp);
        } catch (e) {
          expect(isContractValidationError(e)).toBe(true);
        }
      });
    });
  });

  describe("P7: promote rejects forbidden transitions", () => {
    it("observed → approved is forbidden (must go through reviewed)", async () => {
      await withTempDir(async (dir) => {
        const backend = new FileSystemStore<Experience & { id: string }>({
          rootDir: dir,
          validator: experienceValidator as unknown as (r: unknown) => asserts r is Experience & { id: string },
        });
        const store = new PersistentExperienceStore(backend);
        await store.initialize();
        const exp = makeExperience({ id: asExperienceId("x-trans") });
        await store.add(exp);

        expect(
          store.promote(exp.id, "approved", {
            at: "x",
            actor: "x",
            reason: "skip review",
          }),
        ).rejects.toThrow();
        try {
          await store.promote(exp.id, "approved", {
            at: "x",
            actor: "x",
            reason: "skip review",
          });
        } catch (e) {
          expect(isLifecycleViolationError(e)).toBe(true);
        }
      });
    });
  });

  describe("P8: healthCheck reports corrupt records", () => {
    it("the health check reports healthy + corrupt records", async () => {
      await withTempDir(async (dir) => {
        const backend = new FileSystemStore<Experience & { id: string }>({
          rootDir: dir,
          validator: experienceValidator as unknown as (r: unknown) => asserts r is Experience & { id: string },
        });
        const store = new PersistentExperienceStore(backend);
        await store.initialize();
        await store.add(makeExperience({ id: asExperienceId("x-healthy") }));
        await store.add(makeExperience({ id: asExperienceId("x-corrupt") }));

        // Tamper
        const recordPath = path.join(dir, "records", "x-corrupt.json");
        const raw = await fs.readFile(recordPath, "utf8");
        const envelope = JSON.parse(raw);
        envelope.record.summary = "TAMPERED";
        await fs.writeFile(recordPath, JSON.stringify(envelope, null, 2), "utf8");

        const report = await store.healthCheck();
        expect(report.totalRecords).toBe(2);
        expect(report.healthy).toContain("x-healthy");
        expect(report.corrupt).toHaveLength(1);
        expect(report.corrupt[0]!.id).toBe("x-corrupt");
      });
    });
  });

  describe("P9: provenance kind is NOT modified on read", () => {
    it("an observed Experience stays observed across restarts", async () => {
      await withTempDir(async (dir) => {
        // First instance: add an observed Experience (no promotion)
        const backend1 = new FileSystemStore<Experience & { id: string }>({
          rootDir: dir,
          validator: experienceValidator as unknown as (r: unknown) => asserts r is Experience & { id: string },
        });
        const store1 = new PersistentExperienceStore(backend1);
        await store1.initialize();
        const exp = makeExperience({ id: asExperienceId("x-obs-stays") });
        await store1.add(exp);
        expect((await store1.get(exp.id))!.provenance.kind).toBe("observed");

        // Second instance: the record is STILL observed (not silently approved)
        const backend2 = new FileSystemStore<Experience & { id: string }>({
          rootDir: dir,
          validator: experienceValidator as unknown as (r: unknown) => asserts r is Experience & { id: string },
        });
        const store2 = new PersistentExperienceStore(backend2);
        await store2.initialize();
        const result = await store2.get(exp.id);
        // CRITICAL INVARIANT: retrieval does NOT upgrade the trust status.
        // The persisted observed record stays observed on read.
        expect(result!.provenance.kind).toBe("observed");
      });
    });
  });

  describe("P10: full restart simulation (Run A → restart → Run B retrieves)", () => {
    it("Run A's Experience is retrievable after restart by Run B", async () => {
      await withTempDir(async (dir) => {
        // ─── Instance 1 (Run A's runtime) ───
        const backend1 = new FileSystemStore<Experience & { id: string }>({
          rootDir: dir,
          validator: experienceValidator as unknown as (r: unknown) => asserts r is Experience & { id: string },
        });
        const store1 = new PersistentExperienceStore(backend1);
        await store1.initialize();
        const exp = makeExperience({
          id: asExperienceId("x-cross-restart"),
          summary: "Rebuild before tests.",
        });
        await store1.add(exp);
        await store1.promote(exp.id, "reviewed", {
          at: "2024-01-02T00:00:00Z",
          actor: "r1",
          reason: "Reviewed in instance 1",
        });
        await store1.promote(exp.id, "approved", {
          at: "2024-01-03T00:00:00Z",
          actor: "a1",
          reason: "Approved in instance 1",
        });
        // Instance 1 "shuts down" (just drop the references)

        // ─── Instance 2 (Run B's runtime) ───
        const backend2 = new FileSystemStore<Experience & { id: string }>({
          rootDir: dir,
          validator: experienceValidator as unknown as (r: unknown) => asserts r is Experience & { id: string },
        });
        const store2 = new PersistentExperienceStore(backend2);
        await store2.initialize();

        // Run B can retrieve Run A's approved Experience
        const result = await store2.get(exp.id);
        expect(result).toBeDefined();
        expect(result!.provenance.kind).toBe("approved");
        expect(result!.summary).toBe("Rebuild before tests.");
        expect(result!.provenance.reviewTrail).toHaveLength(2);
        expect(result!.provenance.reviewTrail?.[0]?.reason).toBe("Reviewed in instance 1");
        expect(result!.provenance.reviewTrail?.[1]?.reason).toBe("Approved in instance 1");
      });
    });
  });

  describe("size()", () => {
    it("returns the count of healthy records", async () => {
      await withTempDir(async (dir) => {
        const backend = new FileSystemStore<Experience & { id: string }>({
          rootDir: dir,
          validator: experienceValidator as unknown as (r: unknown) => asserts r is Experience & { id: string },
        });
        const store = new PersistentExperienceStore(backend);
        await store.initialize();
        await store.add(makeExperience({ id: asExperienceId("x-size-1") }));
        await store.add(makeExperience({ id: asExperienceId("x-size-2") }));
        expect(await store.size()).toBe(2);
      });
    });
  });

  describe("list()", () => {
    it("returns all healthy records", async () => {
      await withTempDir(async (dir) => {
        const backend = new FileSystemStore<Experience & { id: string }>({
          rootDir: dir,
          validator: experienceValidator as unknown as (r: unknown) => asserts r is Experience & { id: string },
        });
        const store = new PersistentExperienceStore(backend);
        await store.initialize();
        await store.add(makeExperience({ id: asExperienceId("x-list-1") }));
        await store.add(makeExperience({ id: asExperienceId("x-list-2") }));
        const list = await store.list();
        expect(list).toHaveLength(2);
        const ids = list.map((e) => e.id);
        expect(ids).toContain("x-list-1");
        expect(ids).toContain("x-list-2");
      });
    });
  });
});
