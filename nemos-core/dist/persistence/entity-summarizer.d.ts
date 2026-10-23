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
import type { Run } from "../schemas/run.js";
import type { Evidence } from "../schemas/evidence.js";
import type { Experience } from "../schemas/experience.js";
import type { CandidateRecord } from "../schemas/candidate.js";
import type { DecisionLogEntry } from "../governed-evolution/decision-log.js";
/**
 * A reference to another entity. `kind` is the entity type,
 * `id` is the entity's stable id, `relationship` describes how
 * the referencing entity relates to the referenced one.
 */
export interface EntityReference {
    readonly kind: "run" | "evidence" | "experience" | "candidate" | "decision_log" | "asset" | "context_pack" | "repository" | "evaluation";
    readonly id: string;
    readonly relationship: string;
}
/**
 * The cross-reference status of an entity.
 *
 * - `healthy`: the entity exists and all its outgoing references are satisfied.
 * - `orphaned`: the entity exists but at least one outgoing reference points to a missing entity.
 * - `missing`: the entity itself does not exist in any store.
 */
export type CrossReferenceStatus = "healthy" | "orphaned" | "missing";
/**
 * An Entity Summary — the "Entity Page" for a Nemons entity.
 *
 * Contains:
 *   - `entityKind`: the type of entity (run, evidence, experience, candidate)
 *   - `entityId`: the entity's stable id
 *   - `found`: whether the entity was found in its primary store
 *   - `incoming`: references FROM other entities TO this one
 *   - `outgoing`: references FROM this entity TO others
 *   - `crossReferenceStatus`: healthy / orphaned / missing
 *   - `summary`: human-readable summary for audit output
 */
export interface EntitySummary {
    readonly entityKind: "run" | "evidence" | "experience" | "candidate";
    readonly entityId: string;
    readonly found: boolean;
    readonly incoming: readonly EntityReference[];
    readonly outgoing: readonly EntityReference[];
    readonly crossReferenceStatus: CrossReferenceStatus;
    readonly summary: string;
}
/**
 * The stores the EntitySummarizer queries. Each store is optional;
 * the summarizer skips references for missing stores.
 */
export interface EntitySummarizerStores {
    readonly runs?: readonly Run[];
    readonly evidence?: readonly Evidence[];
    readonly experiences?: readonly Experience[];
    readonly candidates?: readonly CandidateRecord[];
    readonly decisionLogEntries?: readonly DecisionLogEntry[];
}
/**
 * The EntitySummarizer interface.
 */
export interface EntitySummarizer {
    /**
     * Summarizes a Run entity: finds the Run and all Evidence,
     * Experience, and Candidates that reference it.
     */
    summarizeRun(runId: string): EntitySummary;
    /**
     * Summarizes an Experience entity: finds the Experience and all
     * Candidates, Memory records, and the source Run/Evaluation.
     */
    summarizeExperience(experienceId: string): EntitySummary;
    /**
     * Summarizes a Candidate entity: finds the Candidate, its version
     * chain, and all DecisionLog entries referencing it.
     */
    summarizeCandidate(candidateId: string): EntitySummary;
    /**
     * Summarizes any entity by kind + id. Dispatches to the
     * appropriate summarize* method.
     */
    summarize(entityKind: "run" | "evidence" | "experience" | "candidate", entityId: string): EntitySummary;
}
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
export declare class DefaultEntitySummarizer implements EntitySummarizer {
    private readonly stores;
    constructor(stores: EntitySummarizerStores);
    summarizeRun(runId: string): EntitySummary;
    summarizeExperience(experienceId: string): EntitySummary;
    summarizeCandidate(candidateId: string): EntitySummary;
    summarize(entityKind: "run" | "evidence" | "experience" | "candidate", entityId: string): EntitySummary;
    private computeStatus;
    private buildSummary;
}
//# sourceMappingURL=entity-summarizer.d.ts.map