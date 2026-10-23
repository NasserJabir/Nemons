/**
 * P2/P3 Features tests — F-001, F-015, F-051, F-045, F-050, F-062, F-056, F-030, F-037, F-063
 */

import { describe, it, expect } from "vitest";
import {
  InMemoryProjectStore,
  optimizeForBudget,
  DEFAULT_CONTEXT_BUDGET,
  checkRunBudget,
  detectRegression,
  checkPermission,
  DEFAULT_PERMISSION_SCOPE,
  DEFAULT_RUNTIME_CONFIG,
  buildLineage,
  reconstructRun,
  FULL_CONFIG,
  runAblation,
  exportAssets,
  importAssets,
} from "../src/p2-features.js";
import type { Run } from "../src/schemas/run.js";
import { asRunId, asContextPackId } from "../src/core/identifiers.js";

function makeRun(id: string, state: "succeeded" | "failed"): Run {
  return {
    id: asRunId(id),
    state,
    inputs: { taskDescription: "x", taskKind: "test-fix", repoInstance: { repoIdentity: { repo: "x", sha: "y" }, instanceId: "i" } },
    contextPackId: asContextPackId("cp-1"),
    provenance: { kind: "observed", source: { kind: "human", actor: "x", at: "x" } },
    evidenceRefs: ["ev-1"],
  };
}

describe("P2/P3 Features", () => {

  // ═══ F-001: Project Management ═══
  describe("F-001: Project Management", () => {
    it("creates and retrieves a project", () => {
      const store = new InMemoryProjectStore();
      const p = store.add({ id: "proj-1", name: "Test Project", description: "desc", createdAt: "x", runIds: [] });
      expect(store.get("proj-1")?.name).toBe("Test Project");
      expect(store.size()).toBe(1);
    });
    it("adds runs to a project", () => {
      const store = new InMemoryProjectStore();
      store.add({ id: "p1", name: "P", description: "d", createdAt: "x", runIds: [] });
      const updated = store.addRun("p1", "r-1");
      expect(updated?.runIds).toEqual(["r-1"]);
      store.addRun("p1", "r-2");
      expect(store.get("p1")?.runIds).toEqual(["r-1", "r-2"]);
    });
    it("returns undefined for unknown project", () => {
      const store = new InMemoryProjectStore();
      expect(store.get("nonexistent")).toBeUndefined();
    });
  });

  // ═══ F-015: Context Budget & Optimization ═══
  describe("F-015: Context Budget & Optimization", () => {
    it("includes assets within budget", () => {
      const assets = [
        { assetKind: "persona", assetId: "p1", estimatedTokens: 1000, estimatedBytes: 500, mandatory: true, priority: 10 },
        { assetKind: "skill", assetId: "s1", estimatedTokens: 500, estimatedBytes: 200, mandatory: false, priority: 5 },
      ];
      const result = optimizeForBudget(assets);
      expect(result.included).toHaveLength(2);
      expect(result.totalTokens).toBe(1500);
    });
    it("excludes assets exceeding budget", () => {
      const assets = [
        { assetKind: "persona", assetId: "p1", estimatedTokens: 30000, estimatedBytes: 500, mandatory: false, priority: 10 },
        { assetKind: "skill", assetId: "s1", estimatedTokens: 5000, estimatedBytes: 200, mandatory: false, priority: 5 },
      ];
      const result = optimizeForBudget(assets, { ...DEFAULT_CONTEXT_BUDGET, maxTokens: 10000 });
      expect(result.included).toHaveLength(1);
      expect(result.excluded).toHaveLength(1);
    });
    it("preserves mandatory assets even if over budget", () => {
      const assets = [
        { assetKind: "persona", assetId: "p1", estimatedTokens: 50000, estimatedBytes: 1000, mandatory: true, priority: 10 },
      ];
      const result = optimizeForBudget(assets, { ...DEFAULT_CONTEXT_BUDGET, maxTokens: 1000 });
      expect(result.included).toHaveLength(1); // mandatory preserved
    });
  });

  // ═══ F-051: Budget & Stop Controls ═══
  describe("F-051: Budget & Stop Controls", () => {
    it("detects cost exceeded", () => {
      const result = checkRunBudget({ costUsd: 1.5 }, { maxCostUsd: 1.0 });
      expect(result.exceeded).toBe(true);
      expect(result.reason).toContain("Cost");
    });
    it("detects latency exceeded", () => {
      const result = checkRunBudget({ latencyMs: 6000 }, { maxLatencyMs: 5000 });
      expect(result.exceeded).toBe(true);
      expect(result.reason).toContain("Latency");
    });
    it("detects tool calls exceeded", () => {
      const result = checkRunBudget({ toolCallCount: 15 }, { maxToolCalls: 10 });
      expect(result.exceeded).toBe(true);
    });
    it("allows within budget", () => {
      const result = checkRunBudget({ costUsd: 0.5, latencyMs: 1000 }, { maxCostUsd: 1.0, maxLatencyMs: 5000 });
      expect(result.exceeded).toBe(false);
    });
  });

  // ═══ F-045: Regression Detection ═══
  describe("F-045: Regression Detection", () => {
    it("detects regression", () => {
      const baseline = [makeRun("r1", "succeeded"), makeRun("r2", "succeeded"), makeRun("r3", "succeeded")];
      const candidate = [makeRun("r4", "succeeded"), makeRun("r5", "failed"), makeRun("r6", "failed")];
      const report = detectRegression("skill-1", baseline, candidate);
      expect(report.regressed).toBe(true);
      expect(report.baselineSuccessRate).toBe(1.0);
      expect(report.candidateSuccessRate).toBeCloseTo(0.333, 1);
    });
    it("no regression when success rate stable", () => {
      const baseline = [makeRun("r1", "succeeded")];
      const candidate = [makeRun("r2", "succeeded")];
      const report = detectRegression("skill-1", baseline, candidate);
      expect(report.regressed).toBe(false);
    });
  });

  // ═══ F-050: Least-Privilege Execution ═══
  describe("F-050: Least-Privilege Execution", () => {
    it("denies command in denied list", () => {
      const result = checkPermission({ command: "rm -rf /" }, { ...DEFAULT_PERMISSION_SCOPE, deniedCommands: ["rm -rf"] });
      expect(result.allowed).toBe(false);
    });
    it("denies write when fileWriteAccess=false", () => {
      const result = checkPermission({ estimatedImpact: "write" }, { ...DEFAULT_PERMISSION_SCOPE, fileWriteAccess: false });
      expect(result.allowed).toBe(false);
    });
    it("allows read-only by default", () => {
      const result = checkPermission({ estimatedImpact: "read-only" }, DEFAULT_PERMISSION_SCOPE);
      expect(result.allowed).toBe(true);
    });
  });

  // ═══ F-062: Configuration & Provider Management ═══
  describe("F-062: Configuration", () => {
    it("default config has expected values", () => {
      expect(DEFAULT_RUNTIME_CONFIG.defaultMaxRetries).toBe(3);
      expect(DEFAULT_RUNTIME_CONFIG.defaultNoiseThresholdPct).toBe(13);
      expect(DEFAULT_RUNTIME_CONFIG.denyDestructiveActions).toBe(true);
    });
  });

  // ═══ F-056: Typed Lineage ═══
  describe("F-056: Typed Lineage", () => {
    it("builds lineage edges from records", () => {
      const records = [
        { id: "x-1", kind: "experience", derivedFromRunId: "r-1", evaluationId: "ev-1", evidenceRefs: ["e-1"], provenanceSource: undefined },
        { id: "c-1", kind: "candidate", supersedesCandidateId: "c-0", evidenceRefs: ["x-1"], provenanceSource: undefined },
      ];
      const result = buildLineage(records);
      expect(result.edges.length).toBeGreaterThan(0);
      const derivedEdge = result.edges.find((e) => e.relation === "derived_from");
      expect(derivedEdge).toBeDefined();
      const supersedesEdge = result.edges.find((e) => e.relation === "supersedes");
      expect(supersedesEdge).toBeDefined();
    });
    it("empty records → no edges", () => {
      const result = buildLineage([]);
      expect(result.edges).toHaveLength(0);
    });
  });

  // ═══ F-030: Historical Reconstruction ═══
  describe("F-030: Historical Reconstruction", () => {
    it("reconstructs a Run with evidence and evaluation", () => {
      const run = makeRun("r-recon", "succeeded");
      const stores = {
        runs: [run],
        evidence: [{ id: "ev-1", runId: "r-recon", kind: "test_result", claim: "pass", verified: true }],
        evaluations: [{ id: "ev-1", runId: "r-recon", overallResult: "verified_succeeded" }],
        experiences: [{ id: "x-1", runId: "r-recon", summary: "Learned" }],
        candidates: [{ id: "c-1", evidenceRefs: ["ev-1"], status: "approved" }],
      };
      const result = reconstructRun("r-recon", stores);
      expect(result.run).toBeDefined();
      expect(result.evidence).toHaveLength(1);
      expect(result.evaluation?.overallResult).toBe("verified_succeeded");
      expect(result.experience?.summary).toBe("Learned");
      expect(result.candidates).toHaveLength(1);
      expect(result.summary).toContain("r-recon");
    });
    it("returns not-found for unknown Run", () => {
      const result = reconstructRun("nonexistent", {});
      expect(result.run).toBeUndefined();
      expect(result.summary).toContain("NOT FOUND");
    });
  });

  // ═══ F-037: Ablation Testing ═══
  describe("F-037: Ablation Testing", () => {
    it("runs ablation with multiple configs", async () => {
      const configs = [
        { ...FULL_CONFIG },
        { ...FULL_CONFIG, disableSkills: true },
        { ...FULL_CONFIG, disableMemory: true },
      ];
      const results = await runAblation(configs, async (config) => ({
        config,
        success: !config.disableSkills, // skills matter
        metrics: { latencyMs: 1000 },
        summary: `Skills: ${!config.disableSkills}`,
      }));
      expect(results).toHaveLength(3);
      expect(results[0]!.success).toBe(true);
      expect(results[1]!.success).toBe(false); // skills disabled
    });
  });

  // ═══ F-063: Import/Export ═══
  describe("F-063: Import/Export", () => {
    it("exports assets to a bundle", () => {
      const bundle = exportAssets({
        personas: [{ id: "p1" }],
        skills: [{ id: "s1" }],
        knowledge: [],
        experiences: [{ id: "x1" }],
        candidates: [],
      });
      expect(bundle.version).toBe("1.0.0");
      expect(bundle.personas).toHaveLength(1);
      expect(bundle.skills).toHaveLength(1);
      expect(bundle.experiences).toHaveLength(1);
      expect(bundle.candidates).toHaveLength(0);
    });
    it("imports a bundle", () => {
      const bundle = exportAssets({ personas: [{ id: "p1" }], skills: [{ id: "s1" }] });
      const imported = importAssets(bundle);
      expect(imported.personas).toHaveLength(1);
      expect(imported.skills).toHaveLength(1);
    });
    it("round-trips without loss", () => {
      const original = { personas: [{ id: "p1" }], skills: [{ id: "s1" }], knowledge: [{ id: "k1" }] };
      const bundle = exportAssets(original);
      const imported = importAssets(bundle);
      // exportAssets adds empty arrays for missing types; check the present ones
      expect(imported.personas).toEqual(original.personas);
      expect(imported.skills).toEqual(original.skills);
      expect(imported.knowledge).toEqual(original.knowledge);
      expect(imported.experiences).toEqual([]);
      expect(imported.candidates).toEqual([]);
    });
  });
});
