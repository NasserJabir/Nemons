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
import { ContractValidationError } from "../core/errors.js";
import { isValidIdString } from "../core/identifiers.js";
/**
 * Validates the structural contract of a Persona record.
 *
 * Throws `ContractValidationError` on any violation. The validator is
 * the canonical entry point — both at construction time and at load
 * time (retrieval MUST re-validate to defend against tampering).
 */
export function validatePersona(p) {
    if (typeof p !== "object" || p === null) {
        throw new ContractValidationError("Persona must be a non-null object");
    }
    const r = p;
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
export function isPersonaApproved(p) {
    return p.provenance.kind === "approved";
}
/**
 * Returns true iff the Persona is deprecated (explicitly retired).
 * Deprecated Personas MUST NOT be selected for new Runs except under
 * governed review (e.g., audit / reproduction).
 */
export function isPersonaDeprecated(p) {
    return p.provenance.kind === "deprecated";
}
//# sourceMappingURL=persona.js.map