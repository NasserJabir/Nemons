/**
 * Nemons — P2/P3 Features Implementation
 *
 * F-001: Project Management
 * F-015: Context Budget & Optimization
 * F-051: Budget & Stop Controls
 * F-045: Regression Detection
 * F-050: Least-Privilege Execution
 * F-062: Configuration & Provider Management
 * F-056: Typed Lineage Relationships
 * F-030: Historical Reconstruction
 * F-037: Ablation Testing
 * F-063: Import/Export
 */

import type { Run } from "./schemas/run.js";

// ═══ F-001: Project Management ═══

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly repoUrl?: string;
  readonly createdAt: string;
  readonly runIds: readonly string[];
}

export class InMemoryProjectStore {
  private readonly projects = new Map<string, Project>();
  add(p: Project): Project { this.projects.set(p.id, { ...p }); return p; }
  get(id: string): Project | undefined { const p = this.projects.get(id); return p ? { ...p } : undefined; }
  list(): readonly Project[] { return [...this.projects.values()].map((p) => ({ ...p })); }
  addRun(projectId: string, runId: string): Project | undefined {
    const p = this.projects.get(projectId);
    if (!p) return undefined;
    const updated = { ...p, runIds: [...p.runIds, runId] };
    this.projects.set(projectId, updated);
    return { ...updated };
  }
  size(): number { return this.projects.size; }
}

// ═══ F-015: Context Budget & Optimization ═══

export interface ContextBudget {
  readonly maxTokens: number;
  readonly maxAssets: number;
  readonly maxBytes: number;
  readonly preserveMandatory: boolean;
}

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  maxTokens: 32000,
  maxAssets: 20,
  maxBytes: 50000,
  preserveMandatory: true,
};

export interface BudgetedAsset {
  readonly assetKind: string;
  readonly assetId: string;
  readonly estimatedTokens: number;
  readonly estimatedBytes: number;
  readonly mandatory: boolean;
  readonly priority: number;
}

export function optimizeForBudget(
  assets: readonly BudgetedAsset[],
  budget: ContextBudget = DEFAULT_CONTEXT_BUDGET,
): {
  readonly included: readonly BudgetedAsset[];
  readonly excluded: readonly BudgetedAsset[];
  readonly totalTokens: number;
  readonly totalBytes: number;
} {
  const sorted = [...assets].sort((a, b) => b.priority - a.priority);
  const included: BudgetedAsset[] = [];
  const excluded: BudgetedAsset[] = [];
  let totalTokens = 0;
  let totalBytes = 0;
  for (const a of sorted) {
    if (a.mandatory && budget.preserveMandatory) {
      included.push(a);
      totalTokens += a.estimatedTokens;
      totalBytes += a.estimatedBytes;
    } else if (
      included.length < budget.maxAssets &&
      totalTokens + a.estimatedTokens <= budget.maxTokens &&
      totalBytes + a.estimatedBytes <= budget.maxBytes
    ) {
      included.push(a);
      totalTokens += a.estimatedTokens;
      totalBytes += a.estimatedBytes;
    } else {
      excluded.push(a);
    }
  }
  return { included, excluded, totalTokens, totalBytes };
}

// ═══ F-051: Budget & Stop Controls ═══

export interface RunBudgetLimits {
  readonly maxCostUsd?: number;
  readonly maxLatencyMs?: number;
  readonly maxToolCalls?: number;
  readonly maxSteps?: number;
}

export function checkRunBudget(
  metrics: {
    readonly costUsd?: number;
    readonly latencyMs?: number;
    readonly toolCallCount?: number;
    readonly stepCount?: number;
  },
  limits: RunBudgetLimits,
): { readonly exceeded: boolean; readonly reason?: string } {
  if (limits.maxCostUsd !== undefined && metrics.costUsd !== undefined && metrics.costUsd > limits.maxCostUsd) {
    return { exceeded: true, reason: `Cost $${metrics.costUsd} exceeds limit $${limits.maxCostUsd}` };
  }
  if (limits.maxLatencyMs !== undefined && metrics.latencyMs !== undefined && metrics.latencyMs > limits.maxLatencyMs) {
    return { exceeded: true, reason: `Latency ${metrics.latencyMs}ms exceeds limit ${limits.maxLatencyMs}ms` };
  }
  if (limits.maxToolCalls !== undefined && metrics.toolCallCount !== undefined && metrics.toolCallCount > limits.maxToolCalls) {
    return { exceeded: true, reason: `Tool calls ${metrics.toolCallCount} exceeds limit ${limits.maxToolCalls}` };
  }
  if (limits.maxSteps !== undefined && metrics.stepCount !== undefined && metrics.stepCount > limits.maxSteps) {
    return { exceeded: true, reason: `Steps ${metrics.stepCount} exceeds limit ${limits.maxSteps}` };
  }
  return { exceeded: false };
}

// ═══ F-045: Regression Detection ═══

export interface RegressionReport {
  readonly skillId: string;
  readonly baselineSuccessRate: number;
  readonly candidateSuccessRate: number;
  readonly regressed: boolean;
  readonly regressedRunIds: readonly string[];
  readonly summary: string;
}

export function detectRegression(
  skillId: string,
  baselineRuns: readonly Run[],
  candidateRuns: readonly Run[],
  threshold: number = 0.1,
): RegressionReport {
  const baselineSuccesses = baselineRuns.filter((r) => r.state === "succeeded").length;
  const baselineRate = baselineRuns.length > 0 ? baselineSuccesses / baselineRuns.length : 0;
  const candidateSuccesses = candidateRuns.filter((r) => r.state === "succeeded").length;
  const candidateRate = candidateRuns.length > 0 ? candidateSuccesses / candidateRuns.length : 0;
  const delta = candidateRate - baselineRate;
  const regressed = delta < -threshold;
  const regressedRunIds = candidateRuns.filter((r) => r.state === "failed").map((r) => r.id);
  return {
    skillId,
    baselineSuccessRate: baselineRate,
    candidateSuccessRate: candidateRate,
    regressed,
    regressedRunIds,
    summary: `Skill ${skillId}: baseline ${(baselineRate * 100).toFixed(1)}% → candidate ${(candidateRate * 100).toFixed(1)}% (delta ${(delta * 100).toFixed(1)}%). ${regressed ? "REGRESSION DETECTED." : "No regression."}`,
  };
}

// ═══ F-050: Least-Privilege Execution ═══

export interface PermissionScope {
  readonly allowedPaths?: readonly string[];
  readonly deniedPaths?: readonly string[];
  readonly allowedCommands?: readonly string[];
  readonly deniedCommands?: readonly string[];
  readonly networkAccess: boolean;
  readonly fileWriteAccess: boolean;
}

export const DEFAULT_PERMISSION_SCOPE: PermissionScope = {
  networkAccess: false,
  fileWriteAccess: true,
};

export function checkPermission(
  action: { readonly command?: string; readonly estimatedImpact?: string },
  scope: PermissionScope,
): { readonly allowed: boolean; readonly reason?: string } {
  if (action.command) {
    if (scope.deniedCommands?.some((c) => action.command!.includes(c))) {
      return { allowed: false, reason: `Command matches denied pattern` };
    }
    if (scope.allowedCommands && !scope.allowedCommands.some((c) => action.command!.includes(c))) {
      return { allowed: false, reason: `Command not in allowed list` };
    }
  }
  if (action.estimatedImpact === "write" && !scope.fileWriteAccess) {
    return { allowed: false, reason: "File write access denied" };
  }
  return { allowed: true };
}

// ═══ F-062: Configuration & Provider Management ═══

export interface RuntimeConfiguration {
  readonly defaultAdapterKind?: string;
  readonly defaultMaxRetries: number;
  readonly defaultNoiseThresholdPct: number;
  readonly strictRetentionByDefault: boolean;
  readonly denyDestructiveActions: boolean;
  readonly healthCheckOnStartup: boolean;
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfiguration = {
  defaultMaxRetries: 3,
  defaultNoiseThresholdPct: 13,
  strictRetentionByDefault: true,
  denyDestructiveActions: true,
  healthCheckOnStartup: false,
};

// ═══ F-056: Typed Lineage Relationships ═══

export type LineageRelationKind =
  | "derived_from"
  | "supports"
  | "supersedes"
  | "produced_by"
  | "verified_against"
  | "replaces";

export interface LineageEdge {
  readonly from: { readonly kind: string; readonly id: string };
  readonly to: { readonly kind: string; readonly id: string };
  readonly relation: LineageRelationKind;
}

export interface LineageQueryResult {
  readonly edges: readonly LineageEdge[];
  readonly summary: string;
}

export function buildLineage(
  records: readonly {
    readonly id: string;
    readonly kind: string;
    readonly derivedFromRunId?: string;
    readonly evaluationId?: string;
    readonly supersedesCandidateId?: string;
    readonly evidenceRefs?: readonly string[];
    readonly provenanceSource?: { readonly kind: string; readonly evidenceId?: string; readonly runId?: string };
  }[],
): LineageQueryResult {
  const edges: LineageEdge[] = [];
  for (const r of records) {
    if (r.derivedFromRunId) {
      edges.push({ from: { kind: r.kind, id: r.id }, to: { kind: "run", id: r.derivedFromRunId }, relation: "derived_from" });
    }
    if (r.evaluationId) {
      edges.push({ from: { kind: r.kind, id: r.id }, to: { kind: "evaluation", id: r.evaluationId }, relation: "verified_against" });
    }
    if (r.supersedesCandidateId) {
      edges.push({ from: { kind: r.kind, id: r.id }, to: { kind: "candidate", id: r.supersedesCandidateId }, relation: "supersedes" });
    }
    if (r.evidenceRefs) {
      for (const ref of r.evidenceRefs) {
        edges.push({ from: { kind: r.kind, id: r.id }, to: { kind: "evidence", id: ref }, relation: "supports" });
      }
    }
    if (r.provenanceSource?.evidenceId) {
      edges.push({ from: { kind: r.kind, id: r.id }, to: { kind: "evidence", id: r.provenanceSource.evidenceId }, relation: "produced_by" });
    }
    if (r.provenanceSource?.runId) {
      edges.push({ from: { kind: r.kind, id: r.id }, to: { kind: "run", id: r.provenanceSource.runId }, relation: "produced_by" });
    }
  }
  return { edges, summary: `Lineage: ${edges.length} edge(s) across ${records.length} record(s).` };
}

// ═══ F-030: Historical Reconstruction ═══

export interface ReconstructedRun {
  readonly run: Run | undefined;
  readonly evidence: readonly { readonly id: string; readonly kind: string; readonly claim: string; readonly verified: boolean }[];
  readonly evaluation?: { readonly id: string; readonly overallResult: string };
  readonly experience?: { readonly id: string; readonly summary: string };
  readonly candidates: readonly { readonly id: string; readonly status: string }[];
  readonly summary: string;
}

export function reconstructRun(
  runId: string,
  stores: {
    readonly runs?: readonly Run[];
    readonly evidence?: readonly { readonly id: string; readonly runId: string; readonly kind: string; readonly claim: string; readonly verified: boolean }[];
    readonly evaluations?: readonly { readonly id: string; readonly runId: string; readonly overallResult: string }[];
    readonly experiences?: readonly { readonly id: string; readonly runId: string; readonly summary: string }[];
    readonly candidates?: readonly { readonly id: string; readonly evidenceRefs?: readonly string[]; readonly status: string }[];
  },
): ReconstructedRun {
  const run = stores.runs?.find((r) => r.id === runId);
  const evidence = (stores.evidence ?? []).filter((e) => e.runId === runId);
  const evaluation = stores.evaluations?.find((e) => e.runId === runId);
  const experience = stores.experiences?.find((e) => e.runId === runId);
  const evidenceIds = new Set(evidence.map((e) => e.id));
  const candidates = (stores.candidates ?? []).filter((c) => c.evidenceRefs?.some((r) => evidenceIds.has(r)));
  const lines: string[] = [`Reconstructed Run ${runId}:`];
  lines.push(`  Run: ${run ? `found (state=${run.state})` : "NOT FOUND"}`);
  lines.push(`  Evidence: ${evidence.length} record(s)`);
  if (evaluation) lines.push(`  Evaluation: ${evaluation.overallResult}`);
  if (experience) lines.push(`  Experience: ${experience.summary}`);
  lines.push(`  Candidates: ${candidates.length}`);
  return { run, evidence, evaluation, experience, candidates, summary: lines.join("\n") };
}

// ═══ F-037: Ablation Testing ═══

export interface AblationConfig {
  readonly disablePersonas: boolean;
  readonly disableSkills: boolean;
  readonly disableKnowledge: boolean;
  readonly disableMemory: boolean;
  readonly disableExperience: boolean;
}

export const FULL_CONFIG: AblationConfig = {
  disablePersonas: false,
  disableSkills: false,
  disableKnowledge: false,
  disableMemory: false,
  disableExperience: false,
};

export interface AblationResult {
  readonly config: AblationConfig;
  readonly success: boolean;
  readonly metrics?: { readonly latencyMs?: number; readonly toolCallCount?: number };
  readonly summary: string;
}

export async function runAblation(
  configs: readonly AblationConfig[],
  executeFn: (config: AblationConfig) => Promise<AblationResult>,
): Promise<readonly AblationResult[]> {
  return Promise.all(configs.map((c) => executeFn(c)));
}

// ═══ F-063: Import/Export ═══

export interface ExportBundle {
  readonly version: string;
  readonly exportedAt: string;
  readonly personas: readonly unknown[];
  readonly skills: readonly unknown[];
  readonly knowledge: readonly unknown[];
  readonly experiences: readonly unknown[];
  readonly candidates: readonly unknown[];
}

export function exportAssets(assets: {
  readonly personas?: readonly unknown[];
  readonly skills?: readonly unknown[];
  readonly knowledge?: readonly unknown[];
  readonly experiences?: readonly unknown[];
  readonly candidates?: readonly unknown[];
}): ExportBundle {
  return {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    personas: assets.personas ?? [],
    skills: assets.skills ?? [],
    knowledge: assets.knowledge ?? [],
    experiences: assets.experiences ?? [],
    candidates: assets.candidates ?? [],
  };
}

export function importAssets(bundle: ExportBundle): {
  readonly personas: readonly unknown[];
  readonly skills: readonly unknown[];
  readonly knowledge: readonly unknown[];
  readonly experiences: readonly unknown[];
  readonly candidates: readonly unknown[];
} {
  return {
    personas: bundle.personas,
    skills: bundle.skills,
    knowledge: bundle.knowledge,
    experiences: bundle.experiences,
    candidates: bundle.candidates,
  };
}
