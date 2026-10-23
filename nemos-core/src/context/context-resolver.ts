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
export function isApplicable(
  asset: {
    readonly applicability: {
      readonly taskKinds?: readonly string[];
      readonly taskTags?: readonly string[];
      readonly repoPatterns?: readonly string[];
    };
  },
  run: RunInputs,
): boolean {
  const a = asset.applicability;
  // taskKinds
  if (a.taskKinds !== undefined && a.taskKinds.length > 0) {
    if (!a.taskKinds.includes(run.taskKind)) return false;
  }
  // taskTags (AND semantics: every asset tag must be present in the run)
  if (a.taskTags !== undefined && a.taskTags.length > 0) {
    const runTags = new Set(run.taskTags ?? []);
    for (const t of a.taskTags) {
      if (!runTags.has(t)) return false;
    }
  }
  // repoPatterns (any-of: at least one pattern matches)
  if (a.repoPatterns !== undefined && a.repoPatterns.length > 0) {
    const repo = run.repoInstance.repoIdentity.repo;
    const matched = a.repoPatterns.some((p) => patternMatchesRepo(p, repo));
    if (!matched) return false;
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
function patternMatchesRepo(pattern: string, repo: string): boolean {
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
export class DefaultContextResolver implements ContextResolver {
  constructor(
    private readonly catalogs: {
      readonly personas: readonly Persona[];
      readonly skills: readonly Skill[];
      readonly knowledge: readonly Knowledge[];
      readonly memory: readonly MemoryRecord[];
    },
  ) {}

  resolve(input: {
    readonly runInputs: RunInputs;
    readonly availableCapabilities: ReadonlySet<string>;
    readonly experimentalRun?: boolean;
  }): ContextResolutionResult {
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

  private resolvePersona(p: Persona, run: RunInputs): ResolvedAssetCandidate<Persona> {
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

  private resolveSkill(
    s: Skill,
    run: RunInputs,
    available: ReadonlySet<string>,
  ): ResolvedAssetCandidate<Skill> {
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
    const missing = s.requiredCapabilities.filter(
      (req) =>
        req.required &&
        !available.has(req.capability) &&
        (req.fallbackCapability === undefined || !available.has(req.fallbackCapability)),
    );
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

  private resolveKnowledge(k: Knowledge, run: RunInputs): ResolvedAssetCandidate<Knowledge> {
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

  private resolveMemory(m: MemoryRecord, run: RunInputs): ResolvedAssetCandidate<MemoryRecord> {
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
