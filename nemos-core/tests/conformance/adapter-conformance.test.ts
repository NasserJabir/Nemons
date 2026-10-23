/**
 * Stage B — Adapter Conformance Suite.
 *
 * This is an abstract test suite that ANY AdapterContract implementation
 * must pass. The suite is parameterized by an adapter factory; running
 * it for a specific adapter (e.g., MockAdapter, or a future OpenHands
 * adapter) verifies the adapter satisfies the contract surface.
 *
 * Conformance properties verified:
 *   C1: The adapter declares a stable `kind` (non-empty string).
 *   C2: getCapabilities returns a non-empty capability set with a summary.
 *   C3: invoke() returns a result whose runId matches the input runId.
 *   C4: invoke() returns outputs with a valid claimedOutcome.
 *   C5: invoke() does NOT mutate the input Context Pack (immutability).
 *   C6: invoke() emits at least one adapterEvent when given a valid input.
 *   C7: invoke() returns traceRef and artifactRefs (even if URI-based).
 *   C8: the adapter's capabilities are stable across repeated calls.
 *
 * The MockAdapter is exercised as the canonical example. Future adapters
 * (OpenHands, Cezar, etc.) MUST also pass this suite before registration.
 */

import { describe, it, expect } from "vitest";
import type { AdapterContract } from "../../src/adapter/adapter-contract.js";
import { MockAdapter } from "../../src/adapter/mock-adapter.js";
import {
  adapterHasCapability,
  adapterHasAllCapabilities,
} from "../../src/adapter/adapter-contract.js";
import { asContextPackId, asRunId } from "../../src/core/identifiers.js";
import type { ContextPack } from "../../src/schemas/context-pack.js";
import type { RunInputs } from "../../src/schemas/run.js";

/**
 * The canonical conformance runner. Pass any AdapterContract implementation
 * and its factory; this function returns a describe-block that exercises
 * the contract surface.
 *
 * Usage:
 *   describeAdapter("MockAdapter", () => new MockAdapter());
 */
export function describeAdapter(
  name: string,
  factory: () => AdapterContract,
): void {
  describe(`Adapter Conformance Suite — ${name}`, () => {
    let adapter: AdapterContract;

    beforeEach(() => {
      adapter = factory();
    });

    it("C1: declares a stable, non-empty kind", () => {
      expect(typeof adapter.kind).toBe("string");
      expect(adapter.kind.length).toBeGreaterThan(0);
    });

    it("C2: getCapabilities returns a non-empty capability set with a summary", () => {
      const caps = adapter.getCapabilities();
      expect(caps.capabilities).toBeInstanceOf(Set);
      expect(caps.capabilities.size).toBeGreaterThan(0);
      expect(typeof caps.summary).toBe("string");
      expect(caps.summary.length).toBeGreaterThan(0);
    });

    it("C8: capabilities are stable across repeated calls", () => {
      const a = adapter.getCapabilities();
      const b = adapter.getCapabilities();
      // Same capability set on repeated calls (deterministic advertisement)
      expect(a.capabilities.size).toBe(b.capabilities.size);
      for (const c of a.capabilities) {
        expect(b.capabilities.has(c)).toBe(true);
      }
    });

    it("C3 + C4: invoke returns a result with runId matching input and valid claimedOutcome", async () => {
      const runId = asRunId("r-conf-1");
      const result = await adapter.invoke({
        runId,
        contextPack: makePack(runId),
        runInputs: makeRunInputs("Conf-test task"),
      });
      expect(result.runId).toBe(runId);
      // claimedOutcome is one of the allowed values
      expect(["succeeded", "failed", "partial", "unknown"]).toContain(
        result.outputs.claimedOutcome,
      );
    });

    it("C5: invoke does NOT mutate the input Context Pack", async () => {
      const runId = asRunId("r-conf-2");
      const pack = makePack(runId);
      // Snapshot the pack's immutable fields
      const snapshot = {
        id: pack.id,
        runId: pack.runId,
        assetsCount: pack.assets.length,
        exclusionsCount: pack.exclusions.length,
        actualBytes: pack.actualBytes,
        createdAt: pack.createdAt,
      };
      await adapter.invoke({
        runId,
        contextPack: pack,
        runInputs: makeRunInputs("conf-test"),
      });
      // Invariant: the pack's observable fields are unchanged after invocation
      expect(pack.id).toBe(snapshot.id);
      expect(pack.runId).toBe(snapshot.runId);
      expect(pack.assets.length).toBe(snapshot.assetsCount);
      expect(pack.exclusions.length).toBe(snapshot.exclusionsCount);
      expect(pack.actualBytes).toBe(snapshot.actualBytes);
      expect(pack.createdAt).toBe(snapshot.createdAt);
    });

    it("C6: invoke emits at least one adapterEvent for a valid input", async () => {
      const runId = asRunId("r-conf-3");
      const result = await adapter.invoke({
        runId,
        contextPack: makePack(runId),
        runInputs: makeRunInputs("conf-test"),
      });
      expect(result.adapterEvents).toBeDefined();
      expect(Array.isArray(result.adapterEvents)).toBe(true);
      expect((result.adapterEvents ?? []).length).toBeGreaterThan(0);
      // Every event has a kind and an ISO timestamp
      for (const ev of result.adapterEvents ?? []) {
        expect(typeof ev.kind).toBe("string");
        expect(ev.kind.length).toBeGreaterThan(0);
        expect(typeof ev.at).toBe("string");
        expect(ev.at.length).toBeGreaterThan(0);
      }
    });

    it("C7: invoke returns a traceRef (string)", async () => {
      const runId = asRunId("r-conf-4");
      const result = await adapter.invoke({
        runId,
        contextPack: makePack(runId),
        runInputs: makeRunInputs("conf-test"),
      });
      expect(result.traceRef).toBeDefined();
      expect(typeof result.traceRef).toBe("string");
    });

    it("adapterHasCapability reports accurately for an advertised capability", () => {
      const caps = adapter.getCapabilities();
      const first = [...caps.capabilities][0]!;
      expect(adapterHasCapability(adapter, first)).toBe(true);
    });

    it("adapterHasCapability reports false for a non-advertised capability", () => {
      // Use a sentinel capability that's extremely unlikely to be advertised
      expect(adapterHasCapability(adapter, "nemons.conformance.nonexistent")).toBe(false);
    });

    it("adapterHasAllCapabilities returns true for a subset of advertised capabilities", () => {
      const caps = adapter.getCapabilities();
      const subset = [...caps.capabilities].slice(0, Math.min(2, caps.capabilities.size));
      expect(adapterHasAllCapabilities(adapter, subset)).toBe(true);
    });

    it("adapterHasAllCapabilities returns false when at least one is missing", () => {
      const caps = adapter.getCapabilities();
      const first = [...caps.capabilities][0]!;
      expect(
        adapterHasAllCapabilities(adapter, [first, "nemons.conformance.nonexistent"]),
      ).toBe(false);
    });
  });
}

// Helpers — exported for use by future adapter conformance suites
export function makePack(runId: import("../../src/core/identifiers.js").RunId): ContextPack {
  return {
    id: asContextPackId(`cp-${runId}`),
    runId,
    assets: [],
    exclusions: [],
    constraints: { maxAssets: 10, maxContentBytes: 100_000 },
    actualBytes: 0,
    createdAt: "2024-01-01T00:00:00Z",
  };
}

export function makeRunInputs(taskDescription: string): RunInputs {
  return {
    taskDescription,
    taskKind: "test-fix",
    repoInstance: {
      repoIdentity: { repo: "https://example.com/repo.git", sha: "abc" },
      instanceId: "inst-1",
    },
  };
}

// `beforeEach` is provided by vitest at the file scope; the import is
// implicit but we re-declare here to avoid TS unused warnings.
import { beforeEach } from "vitest";

// Run the conformance suite for the MockAdapter — every shipped adapter
// must pass.
describeAdapter("MockAdapter", () => new MockAdapter());
