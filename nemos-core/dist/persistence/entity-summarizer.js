/**
 * Nemons Persistence — Entity Summarizer
 *
 * The EntitySummarizer provides queryable "Entity Pages" for Nemons
 * entities (Run, Evidence, Experience, Candidate). Each summary
 * aggregates all records referencing a given entity, showing both
 * incoming and outgoing references.
 *
 * Architectural principles enforced here:
 *   - "Follow the Entities" (CorpusMap, ADR-0009): organize information
 *     around stable entities with Entity Pages that link to every
 *     record that refers to them.
 *   - Read-only: the summarizer does NOT modify any state. It's a
 *     query layer over the persistent stores.
 *   - Complements the CrossReferenceChecker (Stage G): the checker
 *     detects orphans; the summarizer provides the full audit view.
 *
 * Authorized by ADR-0006 (Stage C) + ADR-0009 (Entity Summary).
 */
/**
 * Default EntitySummarizer implementation.
 *
 * Takes pre-loaded arrays of records (from the persistent stores'
 * `list()` methods) and provides sync query methods. The caller
 * is responsible for loading the records before querying.
 *
 * Usage:
 *   const stores = {
 *     runs: await persistentRunStore.list(),
 *     evidence: await persistentEvidenceStore.list(),
 *     experiences: await persistentExperienceStore.list(),
 *     candidates: await persistentCandidateStore.list(),
 *     decisionLogEntries: decisionLog.list(),
 *   };
 *   const summarizer = new DefaultEntitySummarizer(stores);
 *   const summary = summarizer.summarizeRun("r-1");
 *   console.log(summary.summary);
 */
export class DefaultEntitySummarizer {
    stores;
    constructor(stores) {
        this.stores = stores;
    }
    summarizeRun(runId) {
        const run = this.stores.runs?.find((r) => r.id === runId);
        const found = run !== undefined;
        const incoming = [];
        const outgoing = [];
        // Incoming: Evidence records referencing this Run
        for (const ev of this.stores.evidence ?? []) {
            if (ev.runId === runId) {
                incoming.push({
                    kind: "evidence",
                    id: ev.id,
                    relationship: `Evidence (${ev.kind}) — claim: "${ev.claim}"`,
                });
            }
        }
        // Incoming: Experience records derived from this Run
        for (const exp of this.stores.experiences ?? []) {
            if (exp.runId === runId) {
                incoming.push({
                    kind: "experience",
                    id: exp.id,
                    relationship: `Experience — summary: "${exp.summary.substring(0, 80)}..."`,
                });
            }
        }
        // Incoming: Candidates that reference this Run (via evidenceRefs)
        const evidenceIds = new Set((this.stores.evidence ?? [])
            .filter((e) => e.runId === runId)
            .map((e) => e.id));
        for (const cand of this.stores.candidates ?? []) {
            if (cand.evidenceRefs?.some((ref) => evidenceIds.has(ref))) {
                incoming.push({
                    kind: "candidate",
                    id: cand.id,
                    relationship: `Candidate (${cand.changeKind}) — asset: ${cand.assetId}, version: ${cand.proposedVersion}`,
                });
            }
        }
        // Outgoing: Context Pack
        if (run?.contextPackId) {
            outgoing.push({
                kind: "context_pack",
                id: run.contextPackId,
                relationship: "Context Pack used by this Run",
            });
        }
        // Outgoing: Repository identity
        if (run?.inputs.repoInstance.repoIdentity) {
            outgoing.push({
                kind: "repository",
                id: run.inputs.repoInstance.repoIdentity.repo,
                relationship: `Repository (SHA: ${run.inputs.repoInstance.repoIdentity.sha})`,
            });
        }
        // Outgoing: Evidence references
        if (run?.evidenceRefs) {
            for (const evRef of run.evidenceRefs) {
                outgoing.push({
                    kind: "evidence",
                    id: evRef,
                    relationship: "Evidence reference recorded on this Run",
                });
            }
        }
        // Outgoing: Evaluation reference
        if (run?.evaluationRef) {
            outgoing.push({
                kind: "evaluation", // Evaluations are in-memory, not persistent
                id: run.evaluationRef,
                relationship: "Evaluation reference recorded on this Run",
            });
        }
        const crossReferenceStatus = this.computeStatus(found, outgoing);
        const summary = this.buildSummary("run", runId, found, incoming, outgoing);
        return {
            entityKind: "run",
            entityId: runId,
            found,
            incoming,
            outgoing,
            crossReferenceStatus,
            summary,
        };
    }
    summarizeExperience(experienceId) {
        const exp = this.stores.experiences?.find((e) => e.id === experienceId);
        const found = exp !== undefined;
        const incoming = [];
        const outgoing = [];
        // Incoming: Candidates generated from this Experience (via evidenceRefs)
        for (const cand of this.stores.candidates ?? []) {
            if (cand.evidenceRefs?.includes(experienceId)) {
                incoming.push({
                    kind: "candidate",
                    id: cand.id,
                    relationship: `Candidate (${cand.changeKind}) — asset: ${cand.assetId}, status: ${cand.status}`,
                });
            }
        }
        // Outgoing: Source Run
        if (exp?.runId) {
            outgoing.push({
                kind: "run",
                id: exp.runId,
                relationship: "Source Run that produced this Experience",
            });
        }
        // Outgoing: Source Evaluation
        if (exp?.evaluationId) {
            outgoing.push({
                kind: "evaluation", // Evaluations are in-memory, not persistent
                id: exp.evaluationId,
                relationship: "Source Evaluation supporting this Experience",
            });
        }
        // Outgoing: Source Evidence (from provenance)
        if (exp?.provenance.source.kind === "evidence") {
            outgoing.push({
                kind: "evidence",
                id: exp.provenance.source.evidenceId,
                relationship: "Source Evidence referenced in provenance",
            });
        }
        const crossReferenceStatus = this.computeStatus(found, outgoing);
        const summary = this.buildSummary("experience", experienceId, found, incoming, outgoing);
        return {
            entityKind: "experience",
            entityId: experienceId,
            found,
            incoming,
            outgoing,
            crossReferenceStatus,
            summary,
        };
    }
    summarizeCandidate(candidateId) {
        const cand = this.stores.candidates?.find((c) => c.id === candidateId);
        const found = cand !== undefined;
        const incoming = [];
        const outgoing = [];
        // Incoming: Other Candidates that supersede this one
        for (const other of this.stores.candidates ?? []) {
            if (other.supersedesCandidateId === candidateId) {
                incoming.push({
                    kind: "candidate",
                    id: other.id,
                    relationship: `Superseded by ${other.id} (version: ${other.proposedVersion})`,
                });
            }
        }
        // Incoming: DecisionLog entries referencing this Candidate
        for (const entry of this.stores.decisionLogEntries ?? []) {
            if (entry.candidateId === candidateId ||
                entry.oldCandidateId === candidateId ||
                entry.newCandidateId === candidateId) {
                incoming.push({
                    kind: "decision_log",
                    id: entry.id,
                    relationship: `Decision (${entry.kind}) by ${entry.actor}: ${entry.reason.substring(0, 80)}`,
                });
            }
        }
        // Outgoing: Supersedes link
        if (cand?.supersedesCandidateId) {
            outgoing.push({
                kind: "candidate",
                id: cand.supersedesCandidateId,
                relationship: `Supersedes ${cand.supersedesCandidateId} (version: ${cand.supersedesVersion ?? "unknown"})`,
            });
        }
        // Outgoing: Asset
        if (cand?.assetId) {
            outgoing.push({
                kind: "asset",
                id: cand.assetId,
                relationship: `Targets asset: ${cand.assetId} (${cand.assetKind})`,
            });
        }
        // Outgoing: Evidence references
        if (cand?.evidenceRefs) {
            for (const evRef of cand.evidenceRefs) {
                outgoing.push({
                    kind: "evidence",
                    id: evRef,
                    relationship: "Evidence reference supporting this Candidate",
                });
            }
        }
        const crossReferenceStatus = this.computeStatus(found, outgoing);
        const summary = this.buildSummary("candidate", candidateId, found, incoming, outgoing);
        return {
            entityKind: "candidate",
            entityId: candidateId,
            found,
            incoming,
            outgoing,
            crossReferenceStatus,
            summary,
        };
    }
    summarize(entityKind, entityId) {
        switch (entityKind) {
            case "run":
                return this.summarizeRun(entityId);
            case "experience":
                return this.summarizeExperience(entityId);
            case "candidate":
                return this.summarizeCandidate(entityId);
            default:
                return {
                    entityKind,
                    entityId,
                    found: false,
                    incoming: [],
                    outgoing: [],
                    crossReferenceStatus: "missing",
                    summary: `Entity type '${entityKind}' is not supported by the summarizer.`,
                };
        }
    }
    // ─── Internal helpers ───
    computeStatus(found, outgoing) {
        if (!found)
            return "missing";
        // Check if all outgoing references are satisfied
        const allIds = new Set([
            ...(this.stores.runs ?? []).map((r) => r.id),
            ...(this.stores.evidence ?? []).map((e) => e.id),
            ...(this.stores.experiences ?? []).map((e) => e.id),
            ...(this.stores.candidates ?? []).map((c) => c.id),
        ]);
        // Only check references to Nemons entities (not assets, repos, etc.)
        const nemonsRefs = outgoing.filter((ref) => ref.kind === "run" || ref.kind === "evidence" || ref.kind === "experience" || ref.kind === "candidate");
        const allSatisfied = nemonsRefs.every((ref) => allIds.has(ref.id));
        return allSatisfied ? "healthy" : "orphaned";
    }
    buildSummary(entityKind, entityId, found, incoming, outgoing) {
        if (!found) {
            return `${entityKind} '${entityId}': NOT FOUND in any store.`;
        }
        return [
            `${entityKind} '${entityId}': found.`,
            `  Incoming: ${incoming.length} reference(s).`,
            `  Outgoing: ${outgoing.length} reference(s).`,
        ].join("\n");
    }
}
//# sourceMappingURL=entity-summarizer.js.map