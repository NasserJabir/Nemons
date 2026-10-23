/**
 * Nemons Experience — Retriever
 *
 * The ExperienceRetriever finds Experience records applicable to a
 * given Run, suitable for inclusion in a Context Pack.
 *
 * Architectural principles enforced here:
 *   - "Retrieved is not approved": retrieval preserves the lifecycle
 *     kind. The retriever returns records WITH their provenance; the
 *     Context Pack Builder decides whether to include based on the
 *     kind (approved → eligible; non-approved → candidate use only).
 *   - "Use is not adoption": a retrieved Experience does NOT become
 *     approved by virtue of being retrieved. The retriever records
 *     this in its result metadata.
 *   - Applicability filtering: only Experiences whose applicability
 *     conditions match the Run's task kind, tags, and repository
 *     are returned.
 *   - Reusability gating: an Experience marked `not_reusable` is
 *     excluded from retrieval (it's recorded for audit, not reuse).
 */
import type { Experience } from "../schemas/experience.js";
import type { ExperienceStore } from "./experience-store.js";
import type { RunInputs } from "../schemas/run.js";
import type { ExperienceId } from "../core/identifiers.js";
/**
 * A retrieved Experience candidate — the Experience plus metadata
 * about WHY it was retrieved and WHETHER it's eligible for use.
 *
 * - `included: true` — eligible for inclusion in a Context Pack
 *     (subject to policy enforcement in the builder).
 * - `included: false` — retrieved but excluded; the reason records why.
 *
 * Possible exclusion reasons:
 *   - `not_reusable` — the Experience's `reusability` is `not_reusable`.
 *   - `not_applicable` — the Experience's applicability conditions do
 *     not match the Run.
 *   - `deprecated` — the Experience's provenance kind is `deprecated`.
 */
export interface RetrievedExperience {
    readonly experience: Experience;
    readonly included: boolean;
    readonly reason: string;
    readonly exclusionReasonKind?: "not_reusable" | "not_applicable" | "deprecated";
}
/**
 * The retrieval result — all considered Experiences with inclusion
 * metadata. Consumed by the Context Pack Builder (or wired through
 * the Context Resolver).
 */
export interface ExperienceRetrievalResult {
    readonly retrieved: readonly RetrievedExperience[];
    readonly retrievedAt: string;
}
/**
 * The ExperienceRetriever interface.
 */
export interface ExperienceRetriever {
    /**
     * Finds Experience records applicable to the given Run inputs.
     *
     * Returns records WITH their provenance; retrieval does NOT upgrade
     * trust status. The caller (Context Pack Builder) decides whether
     * to include based on the kind + policy.
     */
    retrieve(input: {
        readonly runInputs: RunInputs;
        readonly adapterKind?: string;
    }): ExperienceRetrievalResult;
}
/**
 * Default ExperienceRetriever implementation.
 *
 * Algorithm:
 *   1. Iterate all Experiences in the store.
 *   2. For each, check:
 *      a. If `reusability === "not_reusable"` → exclude (not_reusable).
 *      b. If `provenance.kind === "deprecated"` → exclude (deprecated).
 *      c. If applicability conditions don't match the Run → exclude (not_applicable).
 *      d. Otherwise → include.
 *
 * Applicability matching mirrors the ContextResolver's logic:
 *   - taskKinds: AND-of-required vs OR-of-allowed (if asset declares taskKinds, Run's taskKind must be in the list)
 *   - taskTags: AND semantics (every asset tag must be in the Run's tags)
 *   - repoPatterns: OR semantics (any pattern matches → OK)
 *   - adapterKinds: OR semantics (any adapter kind matches → OK)
 */
export declare class DefaultExperienceRetriever implements ExperienceRetriever {
    private readonly store;
    constructor(store: ExperienceStore);
    retrieve(input: {
        readonly runInputs: RunInputs;
        readonly adapterKind?: string;
    }): ExperienceRetrievalResult;
    private evaluateOne;
    private isApplicable;
    private patternMatchesRepo;
}
/**
 * Convenience helper: returns the Experience ids that were INCLUDED
 * (i.e., eligible for Context Pack selection, subject to policy).
 */
export declare function includedExperienceIds(result: ExperienceRetrievalResult): readonly ExperienceId[];
//# sourceMappingURL=experience-retriever.d.ts.map