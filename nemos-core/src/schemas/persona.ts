/**
 * Nemons Schema — Persona
 *
 * A Persona is a versioned operational asset defining an agent's role,
 * responsibilities, working approach, and applicable constraints.
 *
 * Architectural principle enforced here:
 *   "Persona ≠ Authorization" — a Persona cannot independently grant
 *   permissions or bypass runtime policies. Selecting a Persona for a
 *   Run does NOT authorize any protected operation.
 *
 * A Persona is more than a prompt string. It has:
 *   - identity (PersonaId + version)
 *   - provenance (origin + lifecycle kind)
 *   - applicability conditions
 *   - role/responsibilities/constraints (separated fields, not freeform text)
 *   - evaluation history (where appropriate)
 */

import type { Provenance } from "../core/provenance.js";
import type { PersonaId } from "../core/identifiers.js";
import { ContractValidationError } from "../core/errors.js";
import { isValidIdString } from "../core/identifiers.js";

/**
 * Constraints attached to a Persona — distinct from authorization.
 *
 * Constraints describe how the agent should behave; they are NOT
 * permissions. Permission decisions are made by the policy engine,
 * not by the Persona.
 *
 * Example constraint: "do not modify files outside src/".
 * This is a behavioral instruction, enforced by policy & adapter
 * checks, not granted by the Persona itself.
 */
export interface PersonaConstraints {
  /** Hard restrictions the agent must respect during this Run. */
  readonly mustNot?: readonly string[];
  /** Required behaviors the agent must perform. */
  readonly must?: readonly string[];
  /** Working-tree or path scope. */
  readonly scope?: readonly string[];
}

/**
 * Applicability conditions for a Persona — when is this Persona the
 * right one to use?
 *
 * Conditions are evaluated by the Context Resolver; the Persona itself
 * does not decide its own applicability.
 */
export interface PersonaApplicability {
  /** Task keywords/tags that match this Persona. */
  readonly taskTags?: readonly string[];
  /** Repository paths or patterns that match. */
  readonly repoPatterns?: readonly string[];
  /** Explicit task kind classification (e.g., "test-fix", "refactor"). */
  readonly taskKinds?: readonly string[];
}

/**
 * A Persona record.
 *
 * Field invariants:
 *   - `id`: stable PersonaId (branded).
 *   - `version`: non-empty version string.
 *   - `provenance`: lifecycle + origin. MUST be present; a Persona
 *     without provenance is forbidden.
 *   - `role`: short role label (e.g., "Test-Fix Engineer").
 *   - `responsibilities`: what this Persona is responsible for.
 *   - `workingApproach`: how the Persona should approach work.
 *   - `constraints`: behavioral constraints (NOT permissions).
 *   - `applicability`: when this Persona applies.
 *   - `evaluationRefs`: optional list of Evaluation IDs that have
 *      examined this Persona.
 */
export interface Persona {
  readonly id: PersonaId;
  readonly version: string;
  readonly provenance: Provenance;
  readonly role: string;
  readonly responsibilities: readonly string[];
  readonly workingApproach: string;
  readonly constraints: PersonaConstraints;
  readonly applicability: PersonaApplicability;
  readonly evaluationRefs?: readonly string[];
}

/**
 * Validates the structural contract of a Persona record.
 *
 * Throws `ContractValidationError` on any violation. The validator is
 * the canonical entry point — both at construction time and at load
 * time (retrieval MUST re-validate to defend against tampering).
 */
export function validatePersona(p: unknown): asserts p is Persona {
  if (typeof p !== "object" || p === null) {
    throw new ContractValidationError("Persona must be a non-null object");
  }
  const r = p as Record<string, unknown>;

  if (!isValidIdString(r.id)) {
    throw new ContractValidationError("Persona.id must be a non-empty string", {
      details: { field: "id" },
    });
  }
  if (!isValidIdString(r.version)) {
    throw new ContractValidationError("Persona.version must be a non-empty string", {
      details: { field: "version" },
    });
  }
  if (typeof r.provenance !== "object" || r.provenance === null) {
    throw new ContractValidationError("Persona.provenance must be an object", {
      details: { field: "provenance" },
    });
  }
  if (!isValidIdString(r.role)) {
    throw new ContractValidationError("Persona.role must be a non-empty string", {
      details: { field: "role" },
    });
  }
  if (!Array.isArray(r.responsibilities) || r.responsibilities.some((s) => typeof s !== "string")) {
    throw new ContractValidationError("Persona.responsibilities must be string[]", {
      details: { field: "responsibilities" },
    });
  }
  if (typeof r.workingApproach !== "string" || r.workingApproach.length === 0) {
    throw new ContractValidationError("Persona.workingApproach must be non-empty string", {
      details: { field: "workingApproach" },
    });
  }
  if (typeof r.constraints !== "object" || r.constraints === null) {
    throw new ContractValidationError("Persona.constraints must be an object", {
      details: { field: "constraints" },
    });
  }
  if (typeof r.applicability !== "object" || r.applicability === null) {
    throw new ContractValidationError("Persona.applicability must be an object", {
      details: { field: "applicability" },
    });
  }
  if (r.evaluationRefs !== undefined) {
    if (!Array.isArray(r.evaluationRefs) || r.evaluationRefs.some((s) => typeof s !== "string")) {
      throw new ContractValidationError("Persona.evaluationRefs must be string[]", {
        details: { field: "evaluationRefs" },
      });
    }
  }
}

/**
 * Returns true iff the Persona is approved (i.e., its provenance kind
 * is "approved"). This is the ONLY way an approved Persona is recognized
 * — no field on Persona says "approved=true"; lifecycle status IS the
 * approval decision.
 */
export function isPersonaApproved(p: Persona): boolean {
  return p.provenance.kind === "approved";
}

/**
 * Returns true iff the Persona is deprecated (explicitly retired).
 * Deprecated Personas MUST NOT be selected for new Runs except under
 * governed review (e.g., audit / reproduction).
 */
export function isPersonaDeprecated(p: Persona): boolean {
  return p.provenance.kind === "deprecated";
}
