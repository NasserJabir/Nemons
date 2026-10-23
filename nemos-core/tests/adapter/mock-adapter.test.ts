import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryAdapterRegistry,
} from "../../src/adapter/adapter-registry.js";
import { MockAdapter, MOCK_ADAPTER_CAPABILITIES } from "../../src/adapter/mock-adapter.js";
import {
  adapterHasCapability,
  adapterHasAllCapabilities,
} from "../../src/adapter/adapter-contract.js";
import { isNemonsError } from "../../src/core/errors.js";
import { asRunId, asContextPackId } from "../../src/core/identifiers.js";
import type { ContextPack } from "../../src/schemas/context-pack.js";
import type { RunInputs } from "../../src/schemas/run.js";

describe("adapter layer", () => {
  describe("MockAdapter", () => {
    const adapter = new MockAdapter();

    it("advertises the kind 'mock'", () => {
      expect(adapter.kind).toBe("mock");
    });

    it("advertises the mock capability set", () => {
      const caps = adapter.getCapabilities();
      expect(caps.capabilities).toEqual(MOCK_ADAPTER_CAPABILITIES);
      expect(caps.summary).toContain("MockAdapter");
    });

    it("returns claimedOutcome=succeeded for normal tasks", async () => {
      const result = await adapter.invoke({
        runId: asRunId("r-1"),
        contextPack: makePack(),
        runInputs: makeRunInputs("Fix the test"),
      });
      expect(result.outputs.claimedOutcome).toBe("succeeded");
    });

    it("returns claimedOutcome=failed for FAIL: prefixed tasks", async () => {
      const result = await adapter.invoke({
        runId: asRunId("r-1"),
        contextPack: makePack(),
        runInputs: makeRunInputs("FAIL: this task will fail"),
      });
      expect(result.outputs.claimedOutcome).toBe("failed");
    });

    it("emits adapter events for evidence collection", async () => {
      const result = await adapter.invoke({
        runId: asRunId("r-1"),
        contextPack: makePack(),
        runInputs: makeRunInputs("Fix the test"),
      });
      expect(result.adapterEvents).toBeDefined();
      expect(result.adapterEvents?.length).toBeGreaterThanOrEqual(2);
      expect(result.adapterEvents?.[0]?.kind).toBe("invocation.start");
      expect(result.adapterEvents?.[1]?.kind).toBe("invocation.end");
    });

    it("returns trace and artifact references", async () => {
      const result = await adapter.invoke({
        runId: asRunId("r-1"),
        contextPack: makePack(),
        runInputs: makeRunInputs("Fix the test"),
      });
      expect(result.traceRef).toContain("mock://runs/");
      expect(result.artifactRefs?.[0]).toContain("mock://runs/");
    });
  });

  describe("adapterHasCapability / adapterHasAllCapabilities", () => {
    const adapter = new MockAdapter();

    it("returns true for a capability the adapter exposes", () => {
      expect(adapterHasCapability(adapter, "tool.file.read")).toBe(true);
    });

    it("returns false for a capability the adapter does NOT expose", () => {
      expect(adapterHasCapability(adapter, "tool.secret.unlock")).toBe(false);
    });

    it("returns true when all capabilities are available", () => {
      expect(
        adapterHasAllCapabilities(adapter, ["tool.file.read", "tool.git.commit"]),
      ).toBe(true);
    });

    it("returns false when at least one capability is missing", () => {
      expect(
        adapterHasAllCapabilities(adapter, ["tool.file.read", "tool.secret.unlock"]),
      ).toBe(false);
    });
  });

  describe("InMemoryAdapterRegistry", () => {
    let registry: InMemoryAdapterRegistry;

    beforeEach(() => {
      registry = new InMemoryAdapterRegistry();
    });

    it("registers and retrieves adapters by kind", () => {
      const adapter = new MockAdapter();
      registry.register(adapter);
      expect(registry.has("mock")).toBe(true);
      expect(registry.get("mock")).toBe(adapter);
    });

    it("prevents duplicate registration for the same kind", () => {
      registry.register(new MockAdapter());
      expect(() => registry.register(new MockAdapter())).toThrowError(/already registered/);
    });

    it("hard-fails (AdapterUnavailableError) when the kind is NOT registered", () => {
      // CRITICAL: this is the hard-deny behavior — no implicit fallback.
      expect(() => registry.get("nonexistent")).toThrow();
      try {
        registry.get("nonexistent");
      } catch (e) {
        expect(isNemonsError(e)).toBe(true);
        expect((e as Error).message).toContain("No adapter registered");
      }
    });

    it("lists all registered kinds", () => {
      registry.register(new MockAdapter());
      expect(registry.listKinds()).toEqual(["mock"]);
    });

    it("has() returns false for unregistered kinds", () => {
      expect(registry.has("not-registered")).toBe(false);
    });
  });
});

// Helpers
function makePack(): ContextPack {
  return {
    id: asContextPackId("cp-1"),
    runId: asRunId("r-1"),
    assets: [],
    exclusions: [],
    constraints: { maxAssets: 10, maxContentBytes: 100_000 },
    actualBytes: 0,
    createdAt: "2024-01-01T00:00:00Z",
  };
}

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
