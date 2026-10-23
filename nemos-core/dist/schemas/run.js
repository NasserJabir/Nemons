/**
 * Nemons Schema — Run
 *
 * A Run represents one execution of a coding task under a defined set
 * of inputs, assets, policies, and environment conditions.
 *
 * Architectural principles enforced here:
 *   - Each Run has a stable identity and a traceable relationship to
 *     its inputs, execution outputs, evidence, and evaluation.
 *   - "Identity is not instance": a Run's identity is distinct from
 *     any specific execution instance of that Run (a Run may be retried
 *     or resumed, producing multiple execution instances).
 *
 * Run state is a strict state machine. Transitions are enforced by
 * the Run Manager (run/run-manager.ts).
 */
import { ContractValidationError } from "../core/errors.js";
import { isValidIdString } from "../core/identifiers.js";
/**
 * Validates the structural contract of a Run record.
 */
export function validateRun(r) {
    if (typeof r !== "object" || r === null) {
        throw new ContractValidationError("Run must be a non-null object");
    }
    const obj = r;
    if (!isValidIdString(obj.id)) {
        throw new ContractValidationError("Run.id must be a non-empty string");
    }
    if (obj.state !== "pending" &&
        obj.state !== "in_progress" &&
        obj.state !== "succeeded" &&
        obj.state !== "failed" &&
        obj.state !== "aborted") {
        throw new ContractValidationError("Run.state must be a valid RunState", {
            details: { field: "state", value: obj.state },
        });
    }
    if (typeof obj.inputs !== "object" || obj.inputs === null) {
        throw new ContractValidationError("Run.inputs must be an object");
    }
    const inputs = obj.inputs;
    if (typeof inputs.taskDescription !== "string" || inputs.taskDescription.length === 0) {
        throw new ContractValidationError("Run.inputs.taskDescription must be a non-empty string");
    }
    if (inputs.taskKind !== "test-fix" &&
        inputs.taskKind !== "refactor" &&
        inputs.taskKind !== "feature" &&
        inputs.taskKind !== "review" &&
        inputs.taskKind !== "investigation" &&
        inputs.taskKind !== "other") {
        throw new ContractValidationError("Run.inputs.taskKind must be a valid RunTaskKind");
    }
    if (typeof inputs.repoInstance !== "object" || inputs.repoInstance === null) {
        throw new ContractValidationError("Run.inputs.repoInstance must be an object");
    }
    if (!isValidIdString(obj.contextPackId)) {
        throw new ContractValidationError("Run.contextPackId must be a non-empty string");
    }
    if (typeof obj.provenance !== "object" || obj.provenance === null) {
        throw new ContractValidationError("Run.provenance must be an object");
    }
    if (obj.outputs !== undefined && typeof obj.outputs !== "object") {
        throw new ContractValidationError("Run.outputs must be an object if present");
    }
}
/**
 * Returns true iff the Run is in a terminal state.
 */
export function isRunTerminal(r) {
    return r.state === "succeeded" || r.state === "failed" || r.state === "aborted";
}
/**
 * Returns true iff the Run is verified-successful — i.e., its state is
 * `succeeded` AND it has at least one Evidence reference.
 *
 * "Verified" requires evidence; a `succeeded` state without Evidence
 * is a contract violation per the Definition of Done.
 */
export function isRunVerifiedSucceeded(r) {
    return r.state === "succeeded" && (r.evidenceRefs?.length ?? 0) > 0;
}
//# sourceMappingURL=run.js.map