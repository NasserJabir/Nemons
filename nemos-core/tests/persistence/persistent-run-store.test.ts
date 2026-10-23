/**
 * Stage G — PersistentRunStore tests.
 *
 * Verifies:
 *   PR1: add persists; get returns the Run.
 *   PR2: records survive restart (new instance loads records).
 *   PR3: state transitions persist across restart.
 *   PR4: tampered Run is detected as corrupt.
 *   PR5: add REJECTS a 'succeeded' Run with no evidenceRefs
 *        (incomplete record is not a verified success).
 *   PR6: transition REJECTS to 'succeeded' without evidenceRefs.
 *   PR7: recordEvidenceRef appends to evidenceRefs.
 *   PR8: recordEvaluationRef sets evaluationRef.
 *   PR9: getWithStatus distinguishes ok / missing / corrupt.
 *   PR10: external mutation does NOT corrupt the store.
 *   PR11: illegal transitions throw IllegalRunTransitionError.
 *   PR12: size + list work as expected.
 *   PR13: healthCheck reports healthy + corrupt.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { FileSystemStore } from "../../src/persistence/fs-json-store.js";
import {
  PersistentRunStore,
  runValidator,
  IllegalRunTransitionError,
} from "../../src/persistence/persistent-run-store.js";
import type { Run } from "../../src/schemas/run.js";
import {
  asRunId,
  asContextPackId,
  sha256Hex,
} from "../../src/core/identifiers.js";
import {
  isContractValidationError,
  isLifecycleViolationError,
} from "../../src/core/errors.js";

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: asRunId("r-1"),
    state: "pending",
    inputs: {
      taskDescription: "Fix the failing test",
      taskKind: "test-fix",
      repoInstance: {
        repoIdentity: { repo: "https://example.com/repo.git", sha: "abc123" },
        instanceId: "inst-1",
      },
    },
    contextPackId: asContextPackId("cp-1"),
    provenance: {
      kind: "observed",
      source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
    },
    ...overrides,
  };
}

function makeBackend(dir: string) {
  return new FileSystemStore<Run & { id: string }>({
    rootDir: dir,
    validator: runValidator as unknown as (r: unknown) => asserts r is Run & { id: string },
  });
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nem-prun-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("Stage G — PersistentRunStore", () => {
  describe("PR1 + PR2: persistence + restart survival", () => {
    it("PR1: add persists; get returns the Run", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentRunStore(makeBackend(dir));
        await store.initialize();
        const run = makeRun();
        await store.add(run);
        const result = await store.get(run.id);
        expect(result).toBeDefined();
        expect(result!.id).toBe(run.id);
        expect(result!.state).toBe("pending");
      });
    });

    it("PR2: records survive restart", async () => {
      await withTempDir(async (dir) => {
        // Instance 1
        const store1 = new PersistentRunStore(makeBackend(dir));
        await store1.initialize();
        await store1.add(makeRun({ id: asRunId("r-survive") }));

        // Instance 2 at same dir
        const store2 = new PersistentRunStore(makeBackend(dir));
        await store2.initialize();
        const result = await store2.get(asRunId("r-survive"));
        expect(result).toBeDefined();
        expect(result!.id).toBe("r-survive");
      });
    });
  });

  describe("PR3: state transitions persist across restart", () => {
    it("the transitioned state survives restart", async () => {
      await withTempDir(async (dir) => {
        const store1 = new PersistentRunStore(makeBackend(dir));
        await store1.initialize();
        const run = makeRun({ id: asRunId("r-trans") });
        await store1.add(run);
        // Need evidenceRefs before transitioning to 'succeeded'
        await store1.recordEvidenceRef(run.id, "ev-1");
        await store1.recordEvidenceRef(run.id, "ev-2");
        await store1.transition(run.id, "in_progress", "tester", "Start");
        await store1.transition(run.id, "succeeded", "tester", "Done");

        // Instance 2: should see 'succeeded' state
        const store2 = new PersistentRunStore(makeBackend(dir));
        await store2.initialize();
        const result = await store2.get(run.id);
        expect(result).toBeDefined();
        // CRITICAL: the transitioned state survived restart
        expect(result!.state).toBe("succeeded");
        expect(result!.evidenceRefs).toEqual(["ev-1", "ev-2"]);
      });
    });
  });

  describe("PR4: tampered Run is detected as corrupt", () => {
    it("a tampered Run produces a corrupt load result", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentRunStore(makeBackend(dir));
        await store.initialize();
        const run = makeRun({ id: asRunId("r-tamper") });
        await store.add(run);

        // Tamper
        const recordPath = path.join(dir, "records", "r-tamper.json");
        const raw = await fs.readFile(recordPath, "utf8");
        const envelope = JSON.parse(raw);
        envelope.record.inputs.taskDescription = "TAMPERED";
        await fs.writeFile(recordPath, JSON.stringify(envelope, null, 2), "utf8");

        const status = await store.getWithStatus(run.id);
        expect(status.kind).toBe("corrupt");
      });
    });
  });

  describe("PR5: add REJECTS a 'succeeded' Run with no evidenceRefs", () => {
    it("throws ContractValidationError", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentRunStore(makeBackend(dir));
        await store.initialize();
        const badRun = makeRun({
          id: asRunId("r-bad-success"),
          state: "succeeded",
          // no evidenceRefs
        });
        expect(() => store.add(badRun)).rejects.toThrow();
        try {
          await store.add(badRun);
        } catch (e) {
          expect(isContractValidationError(e)).toBe(true);
        }
      });
    });

    it("accepts a 'succeeded' Run WITH evidenceRefs", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentRunStore(makeBackend(dir));
        await store.initialize();
        const goodRun = makeRun({
          id: asRunId("r-good-success"),
          state: "succeeded",
          evidenceRefs: ["ev-1"],
        });
        await store.add(goodRun);
        const result = await store.get(goodRun.id);
        expect(result).toBeDefined();
        expect(result!.state).toBe("succeeded");
      });
    });
  });

  describe("PR6: transition REJECTS to 'succeeded' without evidenceRefs", () => {
    it("throws LifecycleViolationError", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentRunStore(makeBackend(dir));
        await store.initialize();
        const run = makeRun({ id: asRunId("r-no-ev") });
        await store.add(run);
        await store.transition(run.id, "in_progress", "x", "x");
        // No evidenceRefs recorded → cannot transition to 'succeeded'
        expect(
          store.transition(run.id, "succeeded", "x", "x"),
        ).rejects.toThrow();
        try {
          await store.transition(run.id, "succeeded", "x", "x");
        } catch (e) {
          expect(isLifecycleViolationError(e)).toBe(true);
        }
      });
    });
  });

  describe("PR7 + PR8: recordEvidenceRef + recordEvaluationRef", () => {
    it("PR7: recordEvidenceRef appends to evidenceRefs", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentRunStore(makeBackend(dir));
        await store.initialize();
        const run = makeRun({ id: asRunId("r-ev") });
        await store.add(run);
        await store.recordEvidenceRef(run.id, "ev-1");
        await store.recordEvidenceRef(run.id, "ev-2");
        const result = await store.get(run.id);
        expect(result!.evidenceRefs).toEqual(["ev-1", "ev-2"]);
      });
    });

    it("PR8: recordEvaluationRef sets evaluationRef", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentRunStore(makeBackend(dir));
        await store.initialize();
        const run = makeRun({ id: asRunId("r-eval") });
        await store.add(run);
        await store.recordEvaluationRef(run.id, "eval-1");
        const result = await store.get(run.id);
        expect(result!.evaluationRef).toBe("eval-1");
      });
    });
  });

  describe("PR9: getWithStatus", () => {
    it("returns 'ok' for a healthy record", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentRunStore(makeBackend(dir));
        await store.initialize();
        const run = makeRun({ id: asRunId("r-ok") });
        await store.add(run);
        const status = await store.getWithStatus(run.id);
        expect(status.kind).toBe("ok");
      });
    });

    it("returns 'missing' for an unknown id", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentRunStore(makeBackend(dir));
        await store.initialize();
        const status = await store.getWithStatus(asRunId("nonexistent"));
        expect(status.kind).toBe("missing");
      });
    });
  });

  describe("PR10: external mutation does NOT corrupt the store", () => {
    it("mutating a returned Run does not affect the stored record", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentRunStore(makeBackend(dir));
        await store.initialize();
        const run = makeRun({ id: asRunId("r-mut") });
        await store.add(run);
        const retrieved = await store.get(run.id);
        (retrieved as { state: string }).state = "succeeded"; // TAMPER
        const fresh = await store.get(run.id);
        expect(fresh!.state).toBe("pending"); // unchanged
      });
    });
  });

  describe("PR11: illegal transitions throw", () => {
    it("pending → succeeded is forbidden (must go through in_progress)", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentRunStore(makeBackend(dir));
        await store.initialize();
        const run = makeRun({ id: asRunId("r-illegal") });
        await store.add(run);
        expect(
          store.transition(run.id, "succeeded", "x", "x"),
        ).rejects.toThrow();
        try {
          await store.transition(run.id, "succeeded", "x", "x");
        } catch (e) {
          expect(e).toBeInstanceOf(IllegalRunTransitionError);
        }
      });
    });

    it("succeeded → in_progress is forbidden (terminal)", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentRunStore(makeBackend(dir));
        await store.initialize();
        const run = makeRun({
          id: asRunId("r-terminal"),
          state: "in_progress",
          evidenceRefs: ["ev-1"],
        });
        await store.add(run);
        await store.transition(run.id, "succeeded", "x", "x");
        expect(
          store.transition(run.id, "in_progress", "x", "x"),
        ).rejects.toThrow();
      });
    });
  });

  describe("PR12: size + list", () => {
    it("size returns the count", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentRunStore(makeBackend(dir));
        await store.initialize();
        await store.add(makeRun({ id: asRunId("r-1") }));
        await store.add(makeRun({ id: asRunId("r-2") }));
        expect(await store.size()).toBe(2);
      });
    });

    it("list returns all healthy records", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentRunStore(makeBackend(dir));
        await store.initialize();
        await store.add(makeRun({ id: asRunId("r-1") }));
        await store.add(makeRun({ id: asRunId("r-2") }));
        const list = await store.list();
        expect(list).toHaveLength(2);
      });
    });
  });

  describe("PR13: healthCheck", () => {
    it("reports healthy + corrupt records", async () => {
      await withTempDir(async (dir) => {
        const store = new PersistentRunStore(makeBackend(dir));
        await store.initialize();
        await store.add(makeRun({ id: asRunId("r-healthy") }));
        await store.add(makeRun({ id: asRunId("r-corrupt") }));

        // Tamper the second
        const recordPath = path.join(dir, "records", "r-corrupt.json");
        const raw = await fs.readFile(recordPath, "utf8");
        const envelope = JSON.parse(raw);
        envelope.record.inputs.taskDescription = "TAMPERED";
        await fs.writeFile(recordPath, JSON.stringify(envelope, null, 2), "utf8");

        const report = await store.healthCheck();
        expect(report.totalRecords).toBe(2);
        expect(report.healthy).toContain("r-healthy");
        expect(report.corrupt).toHaveLength(1);
        expect(report.corrupt[0]!.id).toBe("r-corrupt");
      });
    });
  });
});
