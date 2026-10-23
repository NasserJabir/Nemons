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
import { ContractValidationError } from "../core/errors.js";
import { isValidIdString } from "../core/identifiers.js";

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
export function validateSkill(s: unknown): asserts s is Skill {
  if (typeof s !== "object" || s === null) {
    throw new ContractValidationError("Skill must be a non-null object");
  }
  const r = s as Record<string, unknown>;
  if (!isValidIdString(r.id)) {
    throw new ContractValidationError("Skill.id must be a non-empty string");
  }
  if (!isValidIdString(r.version)) {
    throw new ContractValidationError("Skill.version must be a non-empty string");
  }
  if (typeof r.provenance !== "object" || r.provenance === null) {
    throw new ContractValidationError("Skill.provenance must be an object");
  }
  if (!isValidIdString(r.name)) {
    throw new ContractValidationError("Skill.name must be a non-empty string");
  }
  if (typeof r.description !== "string") {
    throw new ContractValidationError("Skill.description must be a string");
  }
  if (typeof r.applicability !== "object" || r.applicability === null) {
    throw new ContractValidationError("Skill.applicability must be an object");
  }
  if (!Array.isArray(r.inputs)) {
    throw new ContractValidationError("Skill.inputs must be an array");
  }
  if (!Array.isArray(r.outputs)) {
    throw new ContractValidationError("Skill.outputs must be an array");
  }
  if (!Array.isArray(r.requiredCapabilities)) {
    throw new ContractValidationError("Skill.requiredCapabilities must be an array");
  }
  if (r.failureConditions !== undefined && !Array.isArray(r.failureConditions)) {
    throw new ContractValidationError("Skill.failureConditions must be an array if present");
  }
  if (r.evaluationRefs !== undefined && !Array.isArray(r.evaluationRefs)) {
    throw new ContractValidationError("Skill.evaluationRefs must be an array if present");
  }
}

/**
 * Returns true iff the Skill is approved for use as authoritative
 * operational knowledge. Approved Skills may still be subject to
 * policy constraints before selection in a given Run.
 */
export function isSkillApproved(s: Skill): boolean {
  return s.provenance.kind === "approved";
}

/**
 * Returns true iff the Skill is a "candidate" — i.e., produced by
 * candidate-generation, not yet reviewed.
 *
 * Candidates MAY be used in controlled experimental Runs but MUST NOT
 * be treated as approved operational knowledge.
 */
export function isSkillCandidate(s: Skill): boolean {
  return s.provenance.kind === "proposed" || s.provenance.kind === "observed" || s.provenance.kind === "imported";
}

/**
 * Returns true iff the Skill is deprecated.
 */
export function isSkillDeprecated(s: Skill): boolean {
  return s.provenance.kind === "deprecated";
}

/**
 * Returns true iff the Skill is missing a required capability in the
 * given available-capability set. (Used by the Context Resolver.)
 */
export function isSkillMissingRequiredCapability(
  s: Skill,
  availableCapabilities: ReadonlySet<string>,
): boolean {
  return s.requiredCapabilities.some(
    (req) =>
      req.required &&
      !availableCapabilities.has(req.capability) &&
      (req.fallbackCapability === undefined || !availableCapabilities.has(req.fallbackCapability)),
  );
}
