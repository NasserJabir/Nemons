/**
 * Nemons Core — Identifiers
 *
 * Stable identity types that distinguish durable asset identity from
 * per-instance, per-checkout, or per-execution identity.
 *
 * Architectural principle enforced here:
 *   "Identity is not instance" — a stable asset or repository identity
 *   must be distinguished from a particular checkout, execution, or
 *   runtime instance.
 */
/**
 * A versioned identifier for a durable operational asset.
 *
 * `id` is the stable, content- or name-derived identifier.
 * `version` is the asset version (semver-like or hash-based).
 *
 * Two `AssetId` values are considered the same asset only when both `id`
 * and `version` match. A different version of the same `id` is a
 * distinct asset for runtime purposes (lifecycle, policy, evaluation).
 */
export interface AssetId {
    readonly id: string;
    readonly version: string;
}
/**
 * A stable identity for a repository (or fixture) source-of-truth.
 *
 * `repo` is the canonical repository URL or name.
 * `sha` is the exact commit SHA the identity refers to.
 *
 * IMPORTANT: This is *not* a particular checkout; it is a stable pointer
 * to a commit. A working-tree state must be represented by
 * `RepositoryInstanceId`, not `RepositoryIdentity`.
 */
export interface RepositoryIdentity {
    readonly repo: string;
    readonly sha: string;
}
/**
 * A particular checkout / working-tree instance of a repository.
 *
 * Distinct from `RepositoryIdentity`: two checkouts of the same commit
 * are the same `RepositoryIdentity` but different instances.
 */
export interface RepositoryInstanceId {
    readonly repoIdentity: RepositoryIdentity;
    readonly instanceId: string;
    readonly workTreePath?: string;
}
/**
 * A stable identifier for a Run.
 *
 * One Run = one execution of a coding task under a defined set of
 * inputs, assets, policies, and environment conditions.
 */
export type RunId = string & {
    readonly __brand: "RunId";
};
/**
 * A stable identifier for an Evidence record.
 */
export type EvidenceId = string & {
    readonly __brand: "EvidenceId";
};
/**
 * A stable identifier for a Context Pack.
 */
export type ContextPackId = string & {
    readonly __brand: "ContextPackId";
};
/**
 * A stable identifier for an Evaluation decision.
 */
export type EvaluationId = string & {
    readonly __brand: "EvaluationId";
};
/**
 * A stable identifier for an Experience record.
 */
export type ExperienceId = string & {
    readonly __brand: "ExperienceId";
};
/**
 * A stable identifier for a Memory record.
 */
export type MemoryRecordId = string & {
    readonly __brand: "MemoryRecordId";
};
/**
 * A stable identifier for a Policy decision.
 */
export type PolicyDecisionId = string & {
    readonly __brand: "PolicyDecisionId";
};
/**
 * A stable identifier for a Persona.
 */
export type PersonaId = string & {
    readonly __brand: "PersonaId";
};
/**
 * A stable identifier for a Skill.
 */
export type SkillId = string & {
    readonly __brand: "SkillId";
};
/**
 * A stable identifier for a Knowledge item.
 */
export type KnowledgeId = string & {
    readonly __brand: "KnowledgeId";
};
/**
 * A stable identifier for a Candidate record (Governed Evolution).
 */
export type CandidateId = string & {
    readonly __brand: "CandidateId";
};
/**
 * Branded-type constructors. Using `as` cast at the boundary to keep
 * the brand meaningful at the type level while remaining runtime-cheap.
 */
export declare const asRunId: (s: string) => RunId;
export declare const asEvidenceId: (s: string) => EvidenceId;
export declare const asContextPackId: (s: string) => ContextPackId;
export declare const asEvaluationId: (s: string) => EvaluationId;
export declare const asExperienceId: (s: string) => ExperienceId;
export declare const asMemoryRecordId: (s: string) => MemoryRecordId;
export declare const asPolicyDecisionId: (s: string) => PolicyDecisionId;
export declare const asPersonaId: (s: string) => PersonaId;
export declare const asSkillId: (s: string) => SkillId;
export declare const asKnowledgeId: (s: string) => KnowledgeId;
export declare const asCandidateId: (s: string) => CandidateId;
/**
 * Generates a fresh opaque identifier (collision-resistant).
 *
 * Uses `crypto.randomUUID()` from the Node.js standard library — no
 * external dependencies introduced. Identifiers are stable in the
 * sense of being unique per call; they are not content-addressed.
 */
export declare function freshId(): string;
/**
 * Predicate: is the value a non-empty string suitable as an id?
 */
export declare function isValidIdString(s: unknown): s is string;
export declare function sha256Hex(canonicalBytes: string | Uint8Array): string;
/**
 * Helper used to satisfy TS strict checks when a value is provably
 * defined. Avoids spreading `!` non-null assertions across the codebase.
 */
export declare function assertDefined<T>(v: T | undefined | null, msg: string): T;
//# sourceMappingURL=identifiers.d.ts.map