/**
 * Nemons Schema — Experience
 *
 * Experience is a structured record derived from execution evidence
 * and evaluation. It captures what was learned, under which conditions,
 * and whether it is suitable for reuse.
 *
 * Architectural principles enforced here:
 *   - Experience is NOT a raw transcript or an unverified success story.
 *   - Experience MUST be derived from Evidence + Evaluation, never from
 *     a claim alone.
 *   - Experience MUST record its provenance and applicability conditions
 *     so retrieval can preserve trust status.
 */

import type { Provenance } from "../core/provenance.js";
import type {
  ExperienceId,
  RunId,
  EvaluationId,
} from "../core/identifiers.js";
import { ContractValidationError } from "../core/errors.js";
import { isValidIdString } from "../core/identifiers.js";

/**
 * The applicability conditions under which the Experience may be reused.
 *
 * Used by the Context Resolver and Memory retriever to decide whether
 * the Experience is relevant — and eligible — for a new Run.
 */
export interface ExperienceApplicability {
  readonly taskKinds?: readonly string[];
  readonly taskTags?: readonly string[];
  readonly repoPatterns?: readonly string[];
  readonly adapterKinds?: readonly string[]; // adapters the experience is known to work with
}

/**
 * The reusability classification of an Experience.
 *
 * - `reusable`: the Experience is eligible for reuse in applicable Runs.
 * - `conditionally_reusable`: the Experience is eligible only under
 *     additional conditions (recorded in `reuseConditions`).
 * - `not_reusable`: the Experience is recorded for audit but is not
 *     eligible for reuse (e.g., a failed approach that should be
 *     avoided).
 */
export type ExperienceReusability =
  | "reusable"
  | "conditionally_reusable"
  | "not_reusable";

/**
 * An Experience record.
 *
 * Field invariants:
 *   - `id`: stable ExperienceId.
 *   - `runId`: the Run that produced this Experience.
 *   - `evaluationId`: the Evaluation that supports this Experience.
 *      MUST be present and the Evaluation MUST be `verified_succeeded`
 *      for the Experience to be `reusable`.
 *   - `provenance`: lifecycle + origin (typically `evidence`-kind
 *      source with the source evidence reference).
 *   - `applicability`: the conditions under which the Experience applies.
 *   - `reusability`: the reusability classification.
 *   - `reuseConditions`: the additional conditions for conditional reuse.
 *   - `learnedAt`: ISO timestamp of Experience derivation.
 */
export interface Experience {
  readonly id: ExperienceId;
  readonly runId: RunId;
  readonly evaluationId: EvaluationId;
  readonly provenance: Provenance;
  readonly applicability: ExperienceApplicability;
  readonly reusability: ExperienceReusability;
  readonly reuseConditions?: readonly string[];
  readonly summary: string;
  readonly learnedAt: string;
}

/**
 * Validates the structural contract of an Experience record.
 */
export function validateExperience(e: unknown): asserts e is Experience {
  if (typeof e !== "object" || e === null) {
    throw new ContractValidationError("Experience must be a non-null object");
  }
  const r = e as Record<string, unknown>;
  if (!isValidIdString(r.id)) {
    throw new ContractValidationError("Experience.id must be a non-empty string");
  }
  if (!isValidIdString(r.runId)) {
    throw new ContractValidationError("Experience.runId must be a non-empty string");
  }
  if (!isValidIdString(r.evaluationId)) {
    throw new ContractValidationError("Experience.evaluationId must be a non-empty string");
  }
  if (typeof r.provenance !== "object" || r.provenance === null) {
    throw new ContractValidationError("Experience.provenance must be an object");
  }
  if (typeof r.applicability !== "object" || r.applicability === null) {
    throw new ContractValidationError("Experience.applicability must be an object");
  }
  if (
    r.reusability !== "reusable" &&
    r.reusability !== "conditionally_reusable" &&
    r.reusability !== "not_reusable"
  ) {
    throw new ContractValidationError("Experience.reusability must be a valid ExperienceReusability");
  }
  if (typeof r.summary !== "string" || r.summary.length === 0) {
    throw new ContractValidationError("Experience.summary must be a non-empty string");
  }
  if (typeof r.learnedAt !== "string" || r.learnedAt.length === 0) {
    throw new ContractValidationError("Experience.learnedAt must be a non-empty string");
  }
  // An Experience marked `reusable` MUST have an evaluationId; this is
  // enforced by the type, but we re-check here for defense in depth.
  if (r.reusability === "reusable" && !isValidIdString(r.evaluationId)) {
    throw new ContractValidationError(
      "A reusable Experience MUST have an evaluationId (verified-succeeded Evaluation)",
    );
  }
}

/**
 * Returns true iff the Experience is eligible for reuse.
 */
export function isExperienceReusable(e: Experience): boolean {
  return e.reusability === "reusable" || e.reusability === "conditionally_reusable";
}

/**
 * Returns true iff the Experience is approved (i.e., its provenance
 * kind is `approved`). This is the canonical "approved operational
 * knowledge" check.
 */
export function isExperienceApproved(e: Experience): boolean {
  return e.provenance.kind === "approved";
}

/**
 * Returns true iff BOTH:
 *   - the Experience is approved operational knowledge
 *   - the Experience is reusable
 *
 * This is the conjunction enforced by the policy engine before
 * Experience can be included in a Context Pack for a non-experimental
 * Run.
 */
export function isExperienceApprovedAndReusable(e: Experience): boolean {
  return isExperienceApproved(e) && isExperienceReusable(e);
}
