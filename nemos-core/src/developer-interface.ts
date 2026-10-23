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

import type { Run } from "./schemas/run.js";
import type { Evidence } from "./schemas/evidence.js";
import type { Experience } from "./schemas/experience.js";
import type { CandidateRecord } from "./schemas/candidate.js";
import type { Persona } from "./schemas/persona.js";
import type { Skill } from "./schemas/skill.js";
import type { Knowledge } from "./schemas/knowledge.js";
import type { MemoryRecord } from "./schemas/memory.js";
import type { HealthCheckReport } from "./persistence/persistence-contract.js";
import type { CrossReferenceReport } from "./persistence/cross-reference-checker.js";
import type { EntitySummary } from "./persistence/entity-summarizer.js";

/**
 * The stores the developer interface queries.
 * Each is optional — the interface skips queries for missing stores.
 */
export interface DeveloperInterfaceStores {
  readonly runs?: readonly Run[];
  readonly evidence?: readonly Evidence[];
  readonly experiences?: readonly Experience[];
  readonly candidates?: readonly CandidateRecord[];
  readonly personas?: readonly Persona[];
  readonly skills?: readonly Skill[];
  readonly knowledge?: readonly Knowledge[];
  readonly memory?: readonly MemoryRecord[];
  readonly healthReports?: readonly HealthCheckReport[];
  readonly crossReferenceReport?: CrossReferenceReport;
}

/**
 * The developer interface (F-059).
 */
export interface DeveloperInterface {
  /** List all Runs with their state and outcome. */
  listRuns(): readonly { readonly id: string; readonly state: string; readonly outcome?: string; readonly startedAt?: string; readonly endedAt?: string }[];

  /** Inspect a Run's context, evidence, evaluation, and failure causes. */
  inspectRun(runId: string): { readonly run?: Run; readonly evidence?: readonly Evidence[]; readonly summary: string };

  /** List all Experience records with their provenance kind and reusability. */
  listExperiences(): readonly { readonly id: string; readonly provenanceKind: string; readonly reusability: string; readonly summary: string }[];

  /** List all Candidates with their status and asset. */
  listCandidates(): readonly { readonly id: string; readonly status: string; readonly assetId: string; readonly proposedVersion: string }[];

  /** List all Personas with their version and approval status. */
  listPersonas(): readonly { readonly id: string; readonly version: string; readonly approved: boolean; readonly role: string }[];

  /** List all Skills with their version and approval status. */
  listSkills(): readonly { readonly id: string; readonly version: string; readonly approved: boolean; readonly name: string }[];

  /** List all Knowledge with their provenance. */
  listKnowledge(): readonly { readonly id: string; readonly provenanceKind: string; readonly title: string }[];

  /** List all Memory records. */
  listMemory(): readonly { readonly id: string; readonly kind: string; readonly provenanceKind: string }[];

  /** Health check: detect missing data, orphaned records, storage issues. */
  healthCheck(): { readonly crossReferenceReport?: CrossReferenceReport; readonly summary: string };

  /** Get a summary of an entity (Entity Page, ADR-0009). */
  summarizeEntity(entityKind: "run" | "evidence" | "experience" | "candidate", entityId: string): EntitySummary | { readonly entityKind: string; readonly entityId: string; readonly found: false; readonly summary: string };
}

/**
 * Default DeveloperInterface implementation.
 * Takes pre-loaded arrays (from persistent stores' list() methods).
 */
export class DefaultDeveloperInterface implements DeveloperInterface {
  constructor(private readonly stores: DeveloperInterfaceStores) {}

  listRuns(): readonly { readonly id: string; readonly state: string; readonly outcome?: string; readonly startedAt?: string; readonly endedAt?: string }[] {
    return (this.stores.runs ?? []).map((r) => ({
      id: r.id,
      state: r.state,
      outcome: r.outputs?.claimedOutcome,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
    }));
  }

  inspectRun(runId: string): { readonly run?: Run; readonly evidence?: readonly Evidence[]; readonly summary: string } {
    const run = this.stores.runs?.find((r) => r.id === runId);
    if (!run) {
      return { summary: `Run '${runId}' not found.` };
    }
    const runEvidence = (this.stores.evidence ?? []).filter((e) => e.runId === runId);
    const lines: string[] = [
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

  listExperiences(): readonly { readonly id: string; readonly provenanceKind: string; readonly reusability: string; readonly summary: string }[] {
    return (this.stores.experiences ?? []).map((e) => ({
      id: e.id,
      provenanceKind: e.provenance.kind,
      reusability: e.reusability,
      summary: e.summary,
    }));
  }

  listCandidates(): readonly { readonly id: string; readonly status: string; readonly assetId: string; readonly proposedVersion: string }[] {
    return (this.stores.candidates ?? []).map((c) => ({
      id: c.id,
      status: c.status,
      assetId: c.assetId,
      proposedVersion: c.proposedVersion,
    }));
  }

  listPersonas(): readonly { readonly id: string; readonly version: string; readonly approved: boolean; readonly role: string }[] {
    return (this.stores.personas ?? []).map((p) => ({
      id: p.id,
      version: p.version,
      approved: p.provenance.kind === "approved",
      role: p.role,
    }));
  }

  listSkills(): readonly { readonly id: string; readonly version: string; readonly approved: boolean; readonly name: string }[] {
    return (this.stores.skills ?? []).map((s) => ({
      id: s.id,
      version: s.version,
      approved: s.provenance.kind === "approved",
      name: s.name,
    }));
  }

  listKnowledge(): readonly { readonly id: string; readonly provenanceKind: string; readonly title: string }[] {
    return (this.stores.knowledge ?? []).map((k) => ({
      id: k.id,
      provenanceKind: k.provenance.kind,
      title: k.title,
    }));
  }

  listMemory(): readonly { readonly id: string; readonly kind: string; readonly provenanceKind: string }[] {
    return (this.stores.memory ?? []).map((m) => ({
      id: m.id,
      kind: m.kind,
      provenanceKind: m.provenance.kind,
    }));
  }

  healthCheck(): { readonly crossReferenceReport?: CrossReferenceReport; readonly summary: string } {
    const report = this.stores.crossReferenceReport;
    if (!report) {
      return { summary: "No cross-reference report available." };
    }
    const lines: string[] = [
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

  summarizeEntity(entityKind: "run" | "evidence" | "experience" | "candidate", entityId: string): EntitySummary | { readonly entityKind: string; readonly entityId: string; readonly found: false; readonly summary: string } {
    // The EntitySummarizer requires a separate instantiation with stores.
    // For the developer interface, we provide a simplified lookup.
    switch (entityKind) {
      case "run": {
        const run = this.stores.runs?.find((r) => r.id === entityId);
        if (!run) return { entityKind, entityId, found: false, summary: `Run '${entityId}' not found.` };
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
        if (!exp) return { entityKind, entityId, found: false, summary: `Experience '${entityId}' not found.` };
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
        if (!cand) return { entityKind, entityId, found: false, summary: `Candidate '${entityId}' not found.` };
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
