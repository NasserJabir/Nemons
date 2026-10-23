/**
 * Nemons Context — Resolver
 *
 * The ContextResolver selects relevant AND eligible operational assets
 * for a Run.
 *
 * Architectural principles enforced here:
 *   - "Retrieved is not approved": the Resolver preserves the
 *     provenance of each asset; retrieval does not upgrade trust.
 *   - "Explicit boundaries": only assets whose applicability
 *     conditions match the Run are selected.
 *   - The Resolver does NOT make policy decisions — it produces
 *     candidates with eligibility metadata. Policy is enforced by
 *     the PolicyEngine in the Context Pack Builder.
 */
import type { Persona } from "../schemas/persona.js";
import type { Skill } from "../schemas/skill.js";
import type { Knowledge } from "../schemas/knowledge.js";
import type { MemoryRecord } from "../schemas/memory.js";
import type { RunInputs } from "../schemas/run.js";
/**
 * A candidate asset discovered by the Resolver. Carries the asset
 * plus the reason it was selected (or not).
 *
 * - `included: true` — the asset is eligible for the Context Pack.
 * - `included: false` — the asset was considered but excluded; the
 *   `exclusionReasonKind` records why.
 */
export interface ResolvedAssetCandidate<T> {
    readonly asset: T;
    readonly included: boolean;
    readonly reason: string;
    readonly exclusionReasonKind?: "lifecycle" | "applicability" | "capability";
}
/**
 * The result of Context Resolution — all considered assets, with
 * inclusion/exclusion metadata. The Context Pack Builder consumes
 * this and produces a validated, resource-bounded Context Pack.
 */
export interface ContextResolutionResult {
    readonly personas: readonly ResolvedAssetCandidate<Persona>[];
    readonly skills: readonly ResolvedAssetCandidate<Skill>[];
    readonly knowledge: readonly ResolvedAssetCandidate<Knowledge>[];
    readonly memory: readonly ResolvedAssetCandidate<MemoryRecord>[];
    readonly resolvedAt: string;
}
/**
 * The ContextResolver interface.
 */
export interface ContextResolver {
    resolve(input: {
        readonly runInputs: RunInputs;
        readonly availableCapabilities: ReadonlySet<string>;
        readonly experimentalRun?: boolean;
    }): ContextResolutionResult;
}
/**
 * Applicability-matching helper — does the Run's task match the
 * asset's applicability conditions?
 *
 * Matching rules:
 *   - If the asset has no `taskKinds`/`taskTags`/`repoPatterns`:
 *     treat as applicable (it's a "default" asset).
 *   - Else ALL specified conditions must match (AND semantics).
 *
 * `repoPatterns` are interpreted as glob-like patterns against the
 * Run's `repoIdentity.repo` URL. (Simple `*`-suffix matching; no
 * full glob engine to keep the Core dependency-light.)
 */
export declare function isApplicable(asset: {
    readonly applicability: {
        readonly taskKinds?: readonly string[];
        readonly taskTags?: readonly string[];
        readonly repoPatterns?: readonly string[];
    };
}, run: RunInputs): boolean;
/**
 * Default ContextResolver implementation.
 *
 * The resolver takes catalogs of available assets (Personas, Skills,
 * Knowledge, Memory) and produces a ContextResolutionResult.
 *
 * For each asset:
 *   1. If the asset is `deprecated` → excluded (exclusion: lifecycle).
 *   2. If the asset's applicability does not match the Run → excluded
 *      (exclusion: applicability).
 *   3. If the asset is a Skill and is missing required capabilities →
 *      excluded (exclusion: capability).
 *   4. Otherwise → included as a candidate.
 *
 * The Resolver does NOT make policy decisions; candidate inclusion
 * is subject to PolicyEngine enforcement in the Context Pack Builder.
 */
export declare class DefaultContextResolver implements ContextResolver {
    private readonly catalogs;
    constructor(catalogs: {
        readonly personas: readonly Persona[];
        readonly skills: readonly Skill[];
        readonly knowledge: readonly Knowledge[];
        readonly memory: readonly MemoryRecord[];
    });
    resolve(input: {
        readonly runInputs: RunInputs;
        readonly availableCapabilities: ReadonlySet<string>;
        readonly experimentalRun?: boolean;
    }): ContextResolutionResult;
    private resolvePersona;
    private resolveSkill;
    private resolveKnowledge;
    private resolveMemory;
}
//# sourceMappingURL=context-resolver.d.ts.map