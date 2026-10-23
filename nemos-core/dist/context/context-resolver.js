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
export function isApplicable(asset, run) {
    const a = asset.applicability;
    // taskKinds
    if (a.taskKinds !== undefined && a.taskKinds.length > 0) {
        if (!a.taskKinds.includes(run.taskKind))
            return false;
    }
    // taskTags (AND semantics: every asset tag must be present in the run)
    if (a.taskTags !== undefined && a.taskTags.length > 0) {
        const runTags = new Set(run.taskTags ?? []);
        for (const t of a.taskTags) {
            if (!runTags.has(t))
                return false;
        }
    }
    // repoPatterns (any-of: at least one pattern matches)
    if (a.repoPatterns !== undefined && a.repoPatterns.length > 0) {
        const repo = run.repoInstance.repoIdentity.repo;
        const matched = a.repoPatterns.some((p) => patternMatchesRepo(p, repo));
        if (!matched)
            return false;
    }
    return true;
}
/**
 * Simple pattern match: a pattern ending in `*` is a prefix match;
 * otherwise it's an exact match.
 *
 * No full glob engine — keeps the Core dependency-light. The
 * `micromatch` / `minimatch` packages may be used by adapters if
 * richer matching is needed.
 */
function patternMatchesRepo(pattern, repo) {
    if (pattern.endsWith("*")) {
        return repo.startsWith(pattern.slice(0, -1));
    }
    return pattern === repo;
}
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
export class DefaultContextResolver {
    catalogs;
    constructor(catalogs) {
        this.catalogs = catalogs;
    }
    resolve(input) {
        const { runInputs, availableCapabilities } = input;
        const personas = this.catalogs.personas.map((p) => this.resolvePersona(p, runInputs));
        const skills = this.catalogs.skills.map((s) => this.resolveSkill(s, runInputs, availableCapabilities));
        const knowledge = this.catalogs.knowledge.map((k) => this.resolveKnowledge(k, runInputs));
        const memory = this.catalogs.memory.map((m) => this.resolveMemory(m, runInputs));
        return {
            personas,
            skills,
            knowledge,
            memory,
            resolvedAt: new Date().toISOString(),
        };
    }
    resolvePersona(p, run) {
        if (p.provenance.kind === "deprecated") {
            return {
                asset: p,
                included: false,
                reason: "Persona is deprecated.",
                exclusionReasonKind: "lifecycle",
            };
        }
        if (!isApplicable(p, run)) {
            return {
                asset: p,
                included: false,
                reason: "Persona applicability conditions not met.",
                exclusionReasonKind: "applicability",
            };
        }
        return { asset: p, included: true, reason: "Persona is applicable." };
    }
    resolveSkill(s, run, available) {
        if (s.provenance.kind === "deprecated") {
            return {
                asset: s,
                included: false,
                reason: "Skill is deprecated.",
                exclusionReasonKind: "lifecycle",
            };
        }
        if (!isApplicable(s, run)) {
            return {
                asset: s,
                included: false,
                reason: "Skill applicability conditions not met.",
                exclusionReasonKind: "applicability",
            };
        }
        // Capability check (preserves the "explicit boundaries" principle)
        const missing = s.requiredCapabilities.filter((req) => req.required &&
            !available.has(req.capability) &&
            (req.fallbackCapability === undefined || !available.has(req.fallbackCapability)));
        if (missing.length > 0) {
            return {
                asset: s,
                included: false,
                reason: `Adapter missing required capabilities: ${missing.map((m) => m.capability).join(", ")}`,
                exclusionReasonKind: "capability",
            };
        }
        return { asset: s, included: true, reason: "Skill is applicable and capabilities are available." };
    }
    resolveKnowledge(k, run) {
        if (k.provenance.kind === "deprecated") {
            return {
                asset: k,
                included: false,
                reason: "Knowledge is deprecated.",
                exclusionReasonKind: "lifecycle",
            };
        }
        if (!isApplicable(k, run)) {
            return {
                asset: k,
                included: false,
                reason: "Knowledge applicability conditions not met.",
                exclusionReasonKind: "applicability",
            };
        }
        return { asset: k, included: true, reason: "Knowledge is applicable." };
    }
    resolveMemory(m, run) {
        if (m.provenance.kind === "deprecated") {
            return {
                asset: m,
                included: false,
                reason: "Memory record is deprecated.",
                exclusionReasonKind: "lifecycle",
            };
        }
        // Memory applicability is checked against MemoryApplicability
        // (a subset of the standard shape with taskKinds/taskTags/repoPatterns).
        if (!isApplicable({ applicability: m.applicability }, run)) {
            return {
                asset: m,
                included: false,
                reason: "Memory applicability conditions not met.",
                exclusionReasonKind: "applicability",
            };
        }
        // Memory expiry check
        if (m.applicability.expiresAt !== undefined && m.applicability.expiresAt <= new Date().toISOString()) {
            return {
                asset: m,
                included: false,
                reason: "Memory record is expired.",
                exclusionReasonKind: "applicability",
            };
        }
        return { asset: m, included: true, reason: "Memory record is applicable and not expired." };
    }
}
//# sourceMappingURL=context-resolver.js.map