/**
 * Nemons Schema — Skill
 *
 * A Skill is a reusable capability or procedure that can be selected
 * for an appropriate task.
 *
 * Architectural principles enforced here:
 *   - "Use is not adoption": using a candidate Skill in a Run does
 *     NOT make it approved.
 *   - "Skills must not be silently promoted": the candidate →
 *     approved transition requires governed review.
 *
 * A Skill should eventually include:
 *   - Stable identity and version.
 *   - Description and applicability conditions.
 *   - Required inputs and expected outputs.
 *   - Dependencies and capability requirements.
 *   - Provenance and change history.
 *   - Evaluation evidence.
 *   - Known limitations and failure conditions.
 *   - Lifecycle status.
 */
import type { Provenance } from "../core/provenance.js";
import type { SkillId } from "../core/identifiers.js";
/**
 * The runtime-required capabilities a Skill depends on. The Context
 * Resolver and Adapter Layer use this to verify that a Skill can be
 * used in the current Run (i.e., the adapter exposes the capabilities).
 *
 * Distinct from external package dependencies — those are tracked
 * elsewhere if relevant.
 */
export interface SkillCapabilityRequirement {
    readonly capability: string;
    readonly required: boolean;
    readonly fallbackCapability?: string;
}
/**
 * A Skill's input contract.
 */
export interface SkillInputSpec {
    readonly name: string;
    readonly type: string;
    readonly required: boolean;
    readonly description?: string;
}
/**
 * A Skill's output contract.
 */
export interface SkillOutputSpec {
    readonly name: string;
    readonly type: string;
    readonly description?: string;
}
/**
 * Applicability conditions for a Skill.
 *
 * Used by the Context Resolver to decide whether the Skill is
 * eligible for selection in a given Run.
 */
export interface SkillApplicability {
    readonly taskKinds?: readonly string[];
    readonly taskTags?: readonly string[];
    readonly repoPatterns?: readonly string[];
    /** Other Skills that must be selected alongside this one. */
    readonly requiresSkillIds?: readonly string[];
    /** Other Skills that conflict with this one. */
    readonly conflictsWithSkillIds?: readonly string[];
}
/**
 * Known failure conditions for a Skill — what to watch for when using
 * the Skill, what indicates the Skill has failed to apply.
 */
export interface SkillFailureCondition {
    readonly description: string;
    readonly signal: string;
}
/**
 * A Skill record.
 */
export interface Skill {
    readonly id: SkillId;
    readonly version: string;
    readonly provenance: Provenance;
    readonly name: string;
    readonly description: string;
    readonly applicability: SkillApplicability;
    readonly inputs: readonly SkillInputSpec[];
    readonly outputs: readonly SkillOutputSpec[];
    readonly requiredCapabilities: readonly SkillCapabilityRequirement[];
    readonly failureConditions?: readonly SkillFailureCondition[];
    readonly evaluationRefs?: readonly string[];
}
/**
 * Validates the structural contract of a Skill record.
 *
 * Throws `ContractValidationError` on any violation.
 */
export declare function validateSkill(s: unknown): asserts s is Skill;
/**
 * Returns true iff the Skill is approved for use as authoritative
 * operational knowledge. Approved Skills may still be subject to
 * policy constraints before selection in a given Run.
 */
export declare function isSkillApproved(s: Skill): boolean;
/**
 * Returns true iff the Skill is a "candidate" — i.e., produced by
 * candidate-generation, not yet reviewed.
 *
 * Candidates MAY be used in controlled experimental Runs but MUST NOT
 * be treated as approved operational knowledge.
 */
export declare function isSkillCandidate(s: Skill): boolean;
/**
 * Returns true iff the Skill is deprecated.
 */
export declare function isSkillDeprecated(s: Skill): boolean;
/**
 * Returns true iff the Skill is missing a required capability in the
 * given available-capability set. (Used by the Context Resolver.)
 */
export declare function isSkillMissingRequiredCapability(s: Skill, availableCapabilities: ReadonlySet<string>): boolean;
//# sourceMappingURL=skill.d.ts.map