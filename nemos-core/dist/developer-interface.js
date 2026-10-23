/**
 * Nemons — Developer Interface (F-059)
 *
 * A programmatic CLI interface for inspecting Runs, assets,
 * Experience, Candidates, and governance state.
 *
 * This is NOT a standalone CLI binary — it's a programmatic interface
 * that can be called from a CLI wrapper, a REPL, or a web dashboard.
 * The actual CLI entry point (bin/nem) would be a separate package.
 *
 * Architectural principles enforced here:
 *   - Read-only: the interface does NOT modify any state.
 *   - No LLM: all output is deterministic.
 *   - No network: all queries are local.
 */
/**
 * Default DeveloperInterface implementation.
 * Takes pre-loaded arrays (from persistent stores' list() methods).
 */
export class DefaultDeveloperInterface {
    stores;
    constructor(stores) {
        this.stores = stores;
    }
    listRuns() {
        return (this.stores.runs ?? []).map((r) => ({
            id: r.id,
            state: r.state,
            outcome: r.outputs?.claimedOutcome,
            startedAt: r.startedAt,
            endedAt: r.endedAt,
        }));
    }
    inspectRun(runId) {
        const run = this.stores.runs?.find((r) => r.id === runId);
        if (!run) {
            return { summary: `Run '${runId}' not found.` };
        }
        const runEvidence = (this.stores.evidence ?? []).filter((e) => e.runId === runId);
        const lines = [
            `Run ${run.id}:`,
            `  State: ${run.state}`,
            `  Task: ${run.inputs.taskDescription}`,
            `  Outcome: ${run.outputs?.claimedOutcome ?? "unknown"}`,
            `  Evidence: ${runEvidence.length} record(s)`,
            `  Evidence refs: ${run.evidenceRefs?.length ?? 0}`,
            `  Evaluation: ${run.evaluationRef ?? "none"}`,
        ];
        if (run.failureAttribution) {
            lines.push(`  Failure attribution: ${run.failureAttribution.category} — ${run.failureAttribution.description}`);
        }
        if (run.outputs?.metrics) {
            lines.push(`  Metrics: latency=${run.outputs.metrics.latencyMs}ms, toolCalls=${run.outputs.metrics.toolCallCount}, steps=${run.outputs.metrics.stepCount}`);
        }
        return { run, evidence: runEvidence, summary: lines.join("\n") };
    }
    listExperiences() {
        return (this.stores.experiences ?? []).map((e) => ({
            id: e.id,
            provenanceKind: e.provenance.kind,
            reusability: e.reusability,
            summary: e.summary,
        }));
    }
    listCandidates() {
        return (this.stores.candidates ?? []).map((c) => ({
            id: c.id,
            status: c.status,
            assetId: c.assetId,
            proposedVersion: c.proposedVersion,
        }));
    }
    listPersonas() {
        return (this.stores.personas ?? []).map((p) => ({
            id: p.id,
            version: p.version,
            approved: p.provenance.kind === "approved",
            role: p.role,
        }));
    }
    listSkills() {
        return (this.stores.skills ?? []).map((s) => ({
            id: s.id,
            version: s.version,
            approved: s.provenance.kind === "approved",
            name: s.name,
        }));
    }
    listKnowledge() {
        return (this.stores.knowledge ?? []).map((k) => ({
            id: k.id,
            provenanceKind: k.provenance.kind,
            title: k.title,
        }));
    }
    listMemory() {
        return (this.stores.memory ?? []).map((m) => ({
            id: m.id,
            kind: m.kind,
            provenanceKind: m.provenance.kind,
        }));
    }
    healthCheck() {
        const report = this.stores.crossReferenceReport;
        if (!report) {
            return { summary: "No cross-reference report available." };
        }
        const lines = [
            `Health Check:`,
            `  Evidence: ${report.totalEvidence} total, ${report.healthyEvidence.length} healthy, ${report.orphanedEvidence.length} orphaned`,
            `  Experiences: ${report.totalExperiences} total, ${report.healthyExperiences.length} healthy, ${report.orphanedExperiences.length} orphaned`,
            `  Candidates: ${report.totalCandidates} total, ${report.healthyCandidates.length} healthy, ${report.orphanedCandidates.length} orphaned`,
        ];
        if (report.orphanedEvidence.length > 0) {
            lines.push(`  WARNING: ${report.orphanedEvidence.length} orphaned Evidence record(s) detected.`);
        }
        return { crossReferenceReport: report, summary: lines.join("\n") };
    }
    summarizeEntity(entityKind, entityId) {
        // The EntitySummarizer requires a separate instantiation with stores.
        // For the developer interface, we provide a simplified lookup.
        switch (entityKind) {
            case "run": {
                const run = this.stores.runs?.find((r) => r.id === entityId);
                if (!run)
                    return { entityKind, entityId, found: false, summary: `Run '${entityId}' not found.` };
                return {
                    entityKind: "run",
                    entityId,
                    found: true,
                    incoming: [],
                    outgoing: [],
                    crossReferenceStatus: "healthy",
                    summary: `Run '${entityId}': state=${run.state}, outcome=${run.outputs?.claimedOutcome ?? "unknown"}`,
                };
            }
            case "experience": {
                const exp = this.stores.experiences?.find((e) => e.id === entityId);
                if (!exp)
                    return { entityKind, entityId, found: false, summary: `Experience '${entityId}' not found.` };
                return {
                    entityKind: "experience",
                    entityId,
                    found: true,
                    incoming: [],
                    outgoing: [],
                    crossReferenceStatus: "healthy",
                    summary: `Experience '${entityId}': provenance=${exp.provenance.kind}, reusability=${exp.reusability}`,
                };
            }
            case "candidate": {
                const cand = this.stores.candidates?.find((c) => c.id === entityId);
                if (!cand)
                    return { entityKind, entityId, found: false, summary: `Candidate '${entityId}' not found.` };
                return {
                    entityKind: "candidate",
                    entityId,
                    found: true,
                    incoming: [],
                    outgoing: [],
                    crossReferenceStatus: "healthy",
                    summary: `Candidate '${entityId}': status=${cand.status}, asset=${cand.assetId}, version=${cand.proposedVersion}`,
                };
            }
            default:
                return { entityKind, entityId, found: false, summary: `Entity type '${entityKind}' not supported.` };
        }
    }
}
//# sourceMappingURL=developer-interface.js.map