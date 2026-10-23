/**
 * Run Metrics tests (ADR-0011 — from "What Does a Harness Buy?" research).
 *
 * Verifies:
 *   RM1: RunMetrics is an optional field on RunOutputs.
 *   RM2: RunOutputs without metrics is still valid.
 *   RM3: MockAdapter returns simulated metrics.
 *   RM4: LocalExecutionAdapter returns REAL metrics (latencyMs, toolCallCount, stepCount).
 *   RM5: metrics.latencyMs is a positive number (real execution time).
 *   RM6: metrics.toolCallCount matches the actual number of tool calls.
 *   RM7: metrics.stepCount matches the number of adapter events.
 *   RM8: metrics.harnessVersion is set by the adapter.
 *   RM9: Run schema validates RunOutputs with metrics.
 *   RM10: existing tests still pass (backward-compatible).
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { MockAdapter } from "../../src/adapter/mock-adapter.js";
import { LocalExecutionAdapter } from "../../src/stage-c/local-execution-adapter.js";
import { validateRun } from "../../src/schemas/run.js";
import {
  asRunId,
  asContextPackId,
} from "../../src/core/identifiers.js";
import type { RunInputs } from "../../src/schemas/run.js";

const execAsync = promisify(execCb);

function makeRunInputs(taskDescription: string): RunInputs {
  return {
    taskDescription,
    taskKind: "test-fix",
    repoInstance: {
      repoIdentity: { repo: "https://example.com/repo.git", sha: "abc" },
      instanceId: "inst-1",
    },
  };
}

function makeContextPack(runId: string) {
  return {
    id: asContextPackId("cp-1"),
    runId: runId as never,
    assets: [],
    exclusions: [],
    constraints: { maxAssets: 10, maxContentBytes: 100_000 },
    actualBytes: 0,
    createdAt: new Date().toISOString(),
  };
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nem-rm-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("Run Metrics (ADR-0011 — What Does a Harness Buy?)", () => {
  describe("RM1 + RM2: RunMetrics is optional on RunOutputs", () => {
    it("RM1: RunOutputs with metrics is valid", () => {
      const run = {
        id: "r-1",
        state: "succeeded",
        inputs: {
          taskDescription: "Fix test",
          taskKind: "test-fix",
          repoInstance: {
            repoIdentity: { repo: "x", sha: "y" },
            instanceId: "i",
          },
        },
        contextPackId: "cp-1",
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "x", at: "x" },
        },
        outputs: {
          claimedOutcome: "succeeded",
          metrics: {
            latencyMs: 1234,
            toolCallCount: 5,
            stepCount: 3,
            harnessVersion: "test-v1",
          },
        },
        evidenceRefs: ["ev-1"],
      };
      expect(() => validateRun(run)).not.toThrow();
    });

    it("RM2: RunOutputs without metrics is also valid", () => {
      const run = {
        id: "r-1",
        state: "succeeded",
        inputs: {
          taskDescription: "Fix test",
          taskKind: "test-fix",
          repoInstance: {
            repoIdentity: { repo: "x", sha: "y" },
            instanceId: "i",
          },
        },
        contextPackId: "cp-1",
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "x", at: "x" },
        },
        outputs: {
          claimedOutcome: "succeeded",
          // no metrics
        },
        evidenceRefs: ["ev-1"],
      };
      expect(() => validateRun(run)).not.toThrow();
    });
  });

  describe("RM3: MockAdapter returns simulated metrics", () => {
    it("returns metrics with latencyMs, toolCallCount, stepCount, harnessVersion", async () => {
      const adapter = new MockAdapter();
      const result = await adapter.invoke({
        runId: asRunId("r-mock-metrics"),
        contextPack: makeContextPack("r-mock-metrics"),
        runInputs: makeRunInputs("Fix the test"),
      });
      expect(result.outputs.metrics).toBeDefined();
      expect(result.outputs.metrics?.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.outputs.metrics?.toolCallCount).toBe(3);
      expect(result.outputs.metrics?.stepCount).toBe(2);
      expect(result.outputs.metrics?.harnessVersion).toBe("mock-v1");
    });
  });

  describe("RM4 + RM5 + RM6 + RM7 + RM8: LocalExecutionAdapter returns REAL metrics", () => {
    it("returns real latencyMs, toolCallCount, stepCount, harnessVersion", async () => {
      await withTempDir(async (dir) => {
        // Setup the fixture
        const scriptPath = path.join(process.cwd(), "scripts", "stage-c", "setup-fixture.sh");
        await execAsync(`bash ${scriptPath} ${dir}`);

        const adapter = new LocalExecutionAdapter({ workDir: dir });
        const result = await adapter.invoke({
          runId: asRunId("r-real-metrics"),
          contextPack: makeContextPack("r-real-metrics"),
          runInputs: makeRunInputs("Fix the failing test"),
        });

        // RM4: metrics are present
        expect(result.outputs.metrics).toBeDefined();

        // RM5: latencyMs is a positive number (real execution time)
        expect(result.outputs.metrics?.latencyMs).toBeGreaterThan(0);

        // RM6: toolCallCount matches the actual number of tool calls
        // The LocalExecutionAdapter makes: npm test + git diff = 2 tool calls
        expect(result.outputs.metrics?.toolCallCount).toBe(2);

        // RM7: stepCount matches the number of adapter events
        expect(result.outputs.metrics?.stepCount).toBe(result.adapterEvents?.length);

        // RM8: harnessVersion is set
        expect(result.outputs.metrics?.harnessVersion).toBe("local-exec-v1");

        // tokenCount and costUsd should NOT be set (no LLM)
        expect(result.outputs.metrics?.tokenCount).toBeUndefined();
        expect(result.outputs.metrics?.costUsd).toBeUndefined();
      });
    });
  });

  describe("RM9: Run schema validates RunOutputs with all metrics fields", () => {
    it("a Run with full metrics passes validation", () => {
      const run = {
        id: "r-full-metrics",
        state: "succeeded",
        inputs: {
          taskDescription: "Fix test",
          taskKind: "test-fix",
          repoInstance: {
            repoIdentity: { repo: "x", sha: "y" },
            instanceId: "i",
          },
        },
        contextPackId: "cp-1",
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "x", at: "x" },
        },
        outputs: {
          claimedOutcome: "succeeded",
          metrics: {
            tokenCount: 5000,
            costUsd: 0.15,
            latencyMs: 3000,
            toolCallCount: 8,
            stepCount: 5,
            modelId: "gpt-4o",
            harnessVersion: "openhands-v1",
          },
        },
        evidenceRefs: ["ev-1"],
      };
      expect(() => validateRun(run)).not.toThrow();
    });
  });

  describe("RM10: backward compatibility", () => {
    it("a Run with outputs but no metrics passes (existing behavior)", () => {
      const run = {
        id: "r-no-metrics",
        state: "succeeded",
        inputs: {
          taskDescription: "Fix test",
          taskKind: "test-fix",
          repoInstance: {
            repoIdentity: { repo: "x", sha: "y" },
            instanceId: "i",
          },
        },
        contextPackId: "cp-1",
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "x", at: "x" },
        },
        outputs: {
          claimedOutcome: "succeeded",
          claimedSummary: "Tests pass.",
          artifactRefs: ["file://x"],
          traceRef: "mock://trace",
        },
        evidenceRefs: ["ev-1"],
      };
      expect(() => validateRun(run)).not.toThrow();
    });
  });
});
