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
export class InMemoryProjectStore {
    projects = new Map();
    add(p) { this.projects.set(p.id, { ...p }); return p; }
    get(id) { const p = this.projects.get(id); return p ? { ...p } : undefined; }
    list() { return [...this.projects.values()].map((p) => ({ ...p })); }
    addRun(projectId, runId) {
        const p = this.projects.get(projectId);
        if (!p)
            return undefined;
        const updated = { ...p, runIds: [...p.runIds, runId] };
        this.projects.set(projectId, updated);
        return { ...updated };
    }
    size() { return this.projects.size; }
}
export const DEFAULT_CONTEXT_BUDGET = {
    maxTokens: 32000,
    maxAssets: 20,
    maxBytes: 50000,
    preserveMandatory: true,
};
export function optimizeForBudget(assets, budget = DEFAULT_CONTEXT_BUDGET) {
    const sorted = [...assets].sort((a, b) => b.priority - a.priority);
    const included = [];
    const excluded = [];
    let totalTokens = 0;
    let totalBytes = 0;
    for (const a of sorted) {
        if (a.mandatory && budget.preserveMandatory) {
            included.push(a);
            totalTokens += a.estimatedTokens;
            totalBytes += a.estimatedBytes;
        }
        else if (included.length < budget.maxAssets &&
            totalTokens + a.estimatedTokens <= budget.maxTokens &&
            totalBytes + a.estimatedBytes <= budget.maxBytes) {
            included.push(a);
            totalTokens += a.estimatedTokens;
            totalBytes += a.estimatedBytes;
        }
        else {
            excluded.push(a);
        }
    }
    return { included, excluded, totalTokens, totalBytes };
}
export function checkRunBudget(metrics, limits) {
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
export function detectRegression(skillId, baselineRuns, candidateRuns, threshold = 0.1) {
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
export const DEFAULT_PERMISSION_SCOPE = {
    networkAccess: false,
    fileWriteAccess: true,
};
export function checkPermission(action, scope) {
    if (action.command) {
        if (scope.deniedCommands?.some((c) => action.command.includes(c))) {
            return { allowed: false, reason: `Command matches denied pattern` };
        }
        if (scope.allowedCommands && !scope.allowedCommands.some((c) => action.command.includes(c))) {
            return { allowed: false, reason: `Command not in allowed list` };
        }
    }
    if (action.estimatedImpact === "write" && !scope.fileWriteAccess) {
        return { allowed: false, reason: "File write access denied" };
    }
    return { allowed: true };
}
export const DEFAULT_RUNTIME_CONFIG = {
    defaultMaxRetries: 3,
    defaultNoiseThresholdPct: 13,
    strictRetentionByDefault: true,
    denyDestructiveActions: true,
    healthCheckOnStartup: false,
};
export function buildLineage(records) {
    const edges = [];
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
export function reconstructRun(runId, stores) {
    const run = stores.runs?.find((r) => r.id === runId);
    const evidence = (stores.evidence ?? []).filter((e) => e.runId === runId);
    const evaluation = stores.evaluations?.find((e) => e.runId === runId);
    const experience = stores.experiences?.find((e) => e.runId === runId);
    const evidenceIds = new Set(evidence.map((e) => e.id));
    const candidates = (stores.candidates ?? []).filter((c) => c.evidenceRefs?.some((r) => evidenceIds.has(r)));
    const lines = [`Reconstructed Run ${runId}:`];
    lines.push(`  Run: ${run ? `found (state=${run.state})` : "NOT FOUND"}`);
    lines.push(`  Evidence: ${evidence.length} record(s)`);
    if (evaluation)
        lines.push(`  Evaluation: ${evaluation.overallResult}`);
    if (experience)
        lines.push(`  Experience: ${experience.summary}`);
    lines.push(`  Candidates: ${candidates.length}`);
    return { run, evidence, evaluation, experience, candidates, summary: lines.join("\n") };
}
export const FULL_CONFIG = {
    disablePersonas: false,
    disableSkills: false,
    disableKnowledge: false,
    disableMemory: false,
    disableExperience: false,
};
export async function runAblation(configs, executeFn) {
    return Promise.all(configs.map((c) => executeFn(c)));
}
export function exportAssets(assets) {
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
export function importAssets(bundle) {
    return {
        personas: bundle.personas,
        skills: bundle.skills,
        knowledge: bundle.knowledge,
        experiences: bundle.experiences,
        candidates: bundle.candidates,
    };
}
//# sourceMappingURL=p2-features.js.map