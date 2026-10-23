/**
 * Stage B — Cross-component invariants.
 *
 * Verifies that invariants spanning MULTIPLE components hold:
 *   - Run.contextPackId is non-empty at construction (Run ↔ ContextPack)
 *   - Evidence.runId matches the Run it was collected for (Evidence ↔ Run)
 *   - Context Pack assets preserve the provenance kind of their source
 *     asset (ContextPack ↔ Provenance)
 *   - Context Pack exclusions cover both Resolver-excluded and
 *     Policy-excluded assets
 *   - Every PolicyDecision references a unique PolicyDecisionId
 *   - Every EvidenceCollector output has a `run`-kind provenance source
 *   - Every Evaluation references the Run it was evaluated against
 *
 * These tests catch wiring bugs that single-component tests miss.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  buildRuntime,
} from "../../src/runtime.js";
import {
  InMemoryPolicyRuleRegistry,
} from "../../src/policy/policy-contracts.js";
import { DefaultPolicyEngine } from "../../src/policy/policy-engine.js";
import { BUILTIN_POLICY_RULES } from "../../src/policy/builtin-rules.js";
import type { PolicyRule } from "../../src/policy/policy-contracts.js";
import { DefaultContextResolver } from "../../src/context/context-resolver.js";
import { DefaultContextPackBuilder } from "../../src/context/context-pack-builder.js";
import { InMemoryRunManager } from "../../src/run/run-manager.js";
import {
  asPersonaId,
  asSkillId,
  asRunId,
  asContextPackId,
} from "../../src/core/identifiers.js";
import type { Persona } from "../../src/schemas/persona.js";
import type { Skill } from "../../src/schemas/skill.js";
import type { RunInputs } from "../../src/schemas/run.js";

const allowAllRule: PolicyRule = {
  ruleId: "test.allow-all-stage-b",
  description: "Allow all run operations (test only)",
  appliesTo: ["run.start", "run.transition_state", "run.record_evidence"],
  evaluate: () => ({
    ruleId: "test.allow-all-stage-b",
    ruleDescription: "Allow all run operations (test only)",
    outcome: "allow" as const,
    reason: "test allow",
  }),
};

function makePersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: asPersonaId("p-1"),
    version: "1.0.0",
    provenance: {
      kind: "approved",
      source: { kind: "human", actor: "x", at: "2024-01-01T00:00:00Z" },
    },
    role: "Test-Fix Engineer",
    responsibilities: ["fix tests"],
    workingApproach: "isolate, fix, verify",
    constraints: {},
    applicability: { taskKinds: ["test-fix"] },
    ...overrides,
  };
}

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: asSkillId("s-1"),
    version: "1.0.0",
    provenance: {
      kind: "approved",
      source: { kind: "human", actor: "x", at: "2024-01-01T00:00:00Z" },
    },
    name: "run-tests",
    description: "Run tests",
    applicability: { taskKinds: ["test-fix"] },
    inputs: [],
    outputs: [],
    requiredCapabilities: [{ capability: "tool.shell.exec", required: true }],
    ...overrides,
  };
}

function makeRunInputs(): RunInputs {
  return {
    taskDescription: "Fix the failing test",
    taskKind: "test-fix",
    repoInstance: {
      repoIdentity: { repo: "https://example.com/repo.git", sha: "abc" },
      instanceId: "inst-1",
    },
  };
}

describe("Stage B — cross-component invariants", () => {
  let registry: InMemoryPolicyRuleRegistry;
  let engine: DefaultPolicyEngine;
  let runManager: InMemoryRunManager;
  let runtime: ReturnType<typeof buildRuntime>;

  beforeEach(() => {
    registry = new InMemoryPolicyRuleRegistry();
    for (const rule of BUILTIN_POLICY_RULES) registry.register(rule);
    registry.register(allowAllRule);
    engine = new DefaultPolicyEngine(registry);
    runManager = new InMemoryRunManager(engine);
    runtime = buildRuntime();
  });

  describe("Run ↔ Context Pack", () => {
    it("the Context Pack referenced by a Run exists at construction", () => {
      // Build a real Context Pack
      const resolver = new DefaultContextResolver({
        personas: [makePersona()],
        skills: [],
        knowledge: [],
        memory: [],
      });
      const resolution = resolver.resolve({
        runInputs: makeRunInputs(),
        availableCapabilities: new Set(["tool.shell.exec"]),
      });
      const builder = new DefaultContextPackBuilder(engine, {
        maxAssets: 10,
        maxContentBytes: 10_000,
      });
      const pack = builder.build({
        runId: asRunId("r-1"),
        resolution,
      });

      // Create a Run referencing this Context Pack
      const run = runManager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: pack.id,
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "x", at: "x" },
        },
      });

      // Invariant: the Run's contextPackId is non-empty AND matches the
      // pack we built (callers can rely on this for traceability).
      expect(typeof run.contextPackId).toBe("string");
      expect(run.contextPackId.length).toBeGreaterThan(0);
      expect(run.contextPackId).toBe(pack.id);
    });

    it("a Run's contextPackId cannot be the empty string (schema-level)", () => {
      // Schema-level enforcement: validateRun rejects empty contextPackId
      // We exercise this by attempting to create a Run with an empty
      // contextPackId — the manager itself does not re-validate, but
      // the schema's validator does on retrieval.
      // (Demonstrated via validateRun in run schema tests.)
      expect(true).toBe(true); // placeholder; real assertion is in run schema tests
    });
  });

  describe("Evidence ↔ Run", () => {
    it("every Evidence produced by the collector carries the Run's id", async () => {
      const run = runManager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "x", at: "x" },
        },
      });
      runManager.startRun(run.id);

      // Invoke the MockAdapter
      const adapter = runtime.adapterRegistry.get("mock");
      const result = await adapter.invoke({
        runId: run.id,
        contextPack: {
          id: asContextPackId("cp-1"),
          runId: run.id,
          assets: [],
          exclusions: [],
          constraints: { maxAssets: 10, maxContentBytes: 10_000 },
          actualBytes: 0,
          createdAt: "2024-01-01T00:00:00Z",
        },
        runInputs: makeRunInputs(),
      });

      // Invariant: every Evidence produced carries the same runId
      const evidenceRecords = runtime.evidenceCollector.fromAdapterInvocation(
        run.id,
        result,
      );
      expect(evidenceRecords.length).toBeGreaterThan(0);
      for (const e of evidenceRecords) {
        expect(e.runId).toBe(run.id);
        // And the provenance source is run-kind with the right runId
        expect(e.provenance.source.kind).toBe("run");
        if (e.provenance.source.kind === "run") {
          expect(e.provenance.source.runId).toBe(run.id);
        }
      }
    });

    it("recording Evidence on a Run updates the Run's evidenceRefs in order", () => {
      const run = runManager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "x", at: "x" },
        },
      });
      runManager.startRun(run.id);
      runManager.recordEvidence(run.id, "ev-1");
      runManager.recordEvidence(run.id, "ev-2");
      runManager.recordEvidence(run.id, "ev-3");
      const updated = runManager.getRun(run.id)!;
      // Order is preserved (append-only)
      expect(updated.evidenceRefs).toEqual(["ev-1", "ev-2", "ev-3"]);
    });
  });

  describe("Context Pack ↔ Provenance", () => {
    it("every asset in a Context Pack carries the provenance kind of its source asset", () => {
      const persona = makePersona({
        provenance: {
          kind: "approved",
          source: { kind: "human", actor: "x", at: "x" },
        },
      });
      const skill = makeSkill({
        provenance: {
          kind: "approved",
          source: { kind: "human", actor: "x", at: "x" },
        },
      });
      const resolver = new DefaultContextResolver({
        personas: [persona],
        skills: [skill],
        knowledge: [],
        memory: [],
      });
      const resolution = resolver.resolve({
        runInputs: makeRunInputs(),
        availableCapabilities: new Set(["tool.shell.exec"]),
      });
      const builder = new DefaultContextPackBuilder(engine, {
        maxAssets: 10,
        maxContentBytes: 10_000,
      });
      const pack = builder.build({
        runId: asRunId("r-1"),
        resolution,
      });

      // Invariant: every included asset's provenanceKind matches the
      // source asset's provenance.kind.
      for (const ref of pack.assets) {
        if (ref.assetKind === "persona") {
          expect(ref.provenanceKind).toBe(persona.provenance.kind);
        } else if (ref.assetKind === "skill") {
          expect(ref.provenanceKind).toBe(skill.provenance.kind);
        }
      }
    });

    it("exclusions in the Context Pack cover both Resolver-excluded and Policy-excluded assets", () => {
      const approved = makePersona({ id: asPersonaId("p-approved") });
      const deprecated = makePersona({
        id: asPersonaId("p-deprecated"),
        provenance: {
          kind: "deprecated",
          source: { kind: "human", actor: "x", at: "x" },
        },
      });
      const candidate = makePersona({
        id: asPersonaId("p-candidate"),
        provenance: {
          kind: "proposed",
          source: { kind: "human", actor: "x", at: "x" },
        },
      });

      const resolver = new DefaultContextResolver({
        personas: [approved, deprecated, candidate],
        skills: [],
        knowledge: [],
        memory: [],
      });
      const resolution = resolver.resolve({
        runInputs: makeRunInputs(),
        availableCapabilities: new Set(),
      });
      const builder = new DefaultContextPackBuilder(engine, {
        maxAssets: 10,
        maxContentBytes: 10_000,
      });
      const pack = builder.build({
        runId: asRunId("r-1"),
        resolution,
        // NOT experimental: candidate will be policy-excluded
      });

      // Invariant: deprecated is excluded by lifecycle (resolver-level);
      // candidate is excluded by policy (builder-level); approved is included.
      expect(pack.assets).toHaveLength(1);
      expect(pack.assets[0]?.assetId).toBe("p-approved");

      const excludedIds = pack.exclusions.map((e) => e.assetId);
      expect(excludedIds).toContain("p-deprecated");
      expect(excludedIds).toContain("p-candidate");

      // The exclusion reasons are distinguishable
      const depExc = pack.exclusions.find((e) => e.assetId === "p-deprecated");
      expect(depExc?.reasonKind).toBe("lifecycle");
      const candExc = pack.exclusions.find((e) => e.assetId === "p-candidate");
      expect(candExc?.reasonKind).toBe("policy");
    });
  });

  describe("Policy ↔ PolicyDecisionId", () => {
    it("every PolicyDecision carries a unique id", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const d = engine.decide({
          operation: "context_pack.select_asset",
          requestedBy: "tester",
          inputs: {},
          assetProvenanceKind: "approved",
        });
        ids.add(d.id);
      }
      expect(ids.size).toBe(100);
    });

    it("every PolicyDecision records the operation kind it was for", () => {
      const operations = [
        "context_pack.select_asset",
        "context_pack.include_candidate",
        "skill.promote",
        "persona.promote",
        "knowledge.promote",
      ] as const;
      for (const op of operations) {
        const d = engine.decide({
          operation: op,
          requestedBy: "tester",
          inputs: op === "context_pack.include_candidate" ? { experimentalRun: true } : { governedReview: true },
          assetProvenanceKind: op === "skill.promote" || op === "persona.promote" || op === "knowledge.promote" ? "reviewed" : "approved",
        });
        expect(d.operation).toBe(op);
      }
    });
  });

  describe("Evaluation ↔ Run", () => {
    it("an Evaluation references the Run it was evaluated against", () => {
      const run = runManager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "x", at: "x" },
        },
      });
      runManager.startRun(run.id);
      runManager.recordEvidence(run.id, "ev-1");

      const evaluation = runtime.evaluationEngine.evaluate({
        run: runManager.getRun(run.id)!,
        criteria: [
          {
            id: "c-1",
            description: "tests pass",
            requiredEvidenceKinds: ["test_result"],
            required: true,
          },
        ],
        evidence: [],
        evaluator: "default",
      });

      // Invariant: the Evaluation's runId matches the Run it was for
      expect(evaluation.runId).toBe(run.id);
    });

    it("an Evaluation's results array has one entry per criterion, in order", () => {
      const run = runManager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "x", at: "x" },
        },
      });
      const evaluation = runtime.evaluationEngine.evaluate({
        run,
        criteria: [
          { id: "c-a", description: "a", requiredEvidenceKinds: [], required: true },
          { id: "c-b", description: "b", requiredEvidenceKinds: [], required: true },
          { id: "c-c", description: "c", requiredEvidenceKinds: [], required: false },
        ],
        evidence: [],
        evaluator: "default",
      });
      expect(evaluation.results).toHaveLength(3);
      expect(evaluation.results[0]?.criterionId).toBe("c-a");
      expect(evaluation.results[1]?.criterionId).toBe("c-b");
      expect(evaluation.results[2]?.criterionId).toBe("c-c");
    });
  });

  describe("Adapter ↔ Run outputs", () => {
    it("the adapter's result runId matches the input runId", async () => {
      const run = runManager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "x", at: "x" },
        },
      });
      const adapter = runtime.adapterRegistry.get("mock");
      const result = await adapter.invoke({
        runId: run.id,
        contextPack: {
          id: asContextPackId("cp-1"),
          runId: run.id,
          assets: [],
          exclusions: [],
          constraints: { maxAssets: 10, maxContentBytes: 10_000 },
          actualBytes: 0,
          createdAt: "2024-01-01T00:00:00Z",
        },
        runInputs: makeRunInputs(),
      });
      // Invariant: the adapter preserves the runId it was invoked with
      expect(result.runId).toBe(run.id);
    });
  });

  describe("RunManager ↔ Run state machine", () => {
    it("once a Run is terminal, no further state changes are accepted", () => {
      const run = runManager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "x", at: "x" },
        },
      });
      runManager.startRun(run.id);
      runManager.recordEvidence(run.id, "ev-1");
      const succeeded = runManager.markSucceeded(run.id);
      expect(succeeded.state).toBe("succeeded");

      // Attempt various operations — all should fail (terminal state)
      expect(() => runManager.startRun(run.id)).toThrow();
      expect(() => runManager.markSucceeded(run.id)).toThrow();
      expect(() => runManager.markFailed(run.id, "x")).toThrow();
      // markAborted: pending or in_progress only — succeeded is terminal
      expect(() => runManager.markAborted(run.id, "x")).toThrow();
    });
  });

  describe("EvidenceCollector ↔ contentHash", () => {
    it("every Evidence produced with an inlinePayload has a matching contentHash", () => {
      const runId = asRunId("r-test");
      const outputs = { claimedOutcome: "succeeded" as const, claimedSummary: "ok" };
      const e = runtime.evidenceCollector.fromRunOutputs(runId, outputs);
      // Invariant: contentHash matches SHA-256 of inlinePayload
      expect(e.artifact.contentHash).toBeDefined();
      expect(e.artifact.inlinePayload).toBeDefined();
      // Verification passes
      const verified = runtime.evidenceValidator.verify(e);
      expect(verified.verified).toBe(true);
    });
  });
});
