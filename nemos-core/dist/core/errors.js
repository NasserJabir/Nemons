/**
 * Nemons Core — Errors
 *
 * Structured, fail-explicit error types.
 *
 * Architectural principle enforced here:
 *   - "Failure handling": each component must fail explicitly and preserve
 *     enough information for diagnosis. A denied operation returns a
 *     structured failure reason rather than silently continuing.
 *
 * The error classes here use a discriminated `code` field so callers
 * can switch on it without parsing message strings. This also keeps
 * the runtime serialization-safe: every error field is JSON-safe.
 */
/**
 * Abstract base class for all Nemons errors. Carries a `code` field.
 *
 * The `code` field is the canonical way to switch on an error type;
 * do NOT rely on `instanceof` across package boundaries — codes are
 * stable, class identity is not.
 */
export class NemonsError extends Error {
    details;
    constructor(message, options) {
        super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
        this.name = this.constructor.name;
        if (options?.details !== undefined) {
            this.details = options.details;
        }
    }
    toJSON() {
        return {
            code: this.code,
            message: this.message,
            details: this.details,
        };
    }
}
/**
 * Thrown when an input value violates a contract — wrong shape, missing
 * required field, wrong type, out-of-range value, etc.
 *
 * This is distinct from a policy denial: the input itself is invalid
 * before any policy decision is considered.
 */
export class ContractValidationError extends NemonsError {
    code = "NEMONS_CONTRACT_VALIDATION_ERROR";
    constructor(message, options) {
        super(message, options);
    }
}
/**
 * Thrown when a policy decision is `deny`.
 *
 * This is the runtime embodiment of the "Hard-Deny Security" principle.
 * The runtime MUST raise this rather than silently continuing when an
 * operation is denied by policy.
 *
 * The `decisionId` references the recorded `PolicyDecision` so callers
 * can audit the exact reason, the rules evaluated, and the inputs.
 */
export class PolicyDeniedError extends NemonsError {
    decisionId;
    code = "NEMONS_POLICY_DENIED";
    constructor(decisionId, message, options) {
        super(message, options);
        this.decisionId = decisionId;
    }
}
/**
 * Thrown when an operation requires an adapter that is not registered
 * or not available in the current runtime configuration.
 */
export class AdapterUnavailableError extends NemonsError {
    adapterKind;
    code = "NEMONS_ADAPTER_UNAVAILABLE";
    constructor(adapterKind, message, options) {
        super(message, options);
        this.adapterKind = adapterKind;
    }
}
/**
 * Thrown when an operation is attempted against an asset whose
 * lifecycle status does not permit the operation — e.g., trying to
 * USE a `proposed` Skill as if it were `approved`.
 *
 * Distinct from `PolicyDeniedError`: this is a domain-level lifecycle
 * violation, not a policy decision. (Both can occur for the same
 * operation; lifecycle is checked first.)
 */
export class LifecycleViolationError extends NemonsError {
    code = "NEMONS_LIFECYCLE_VIOLATION";
    constructor(message, options) {
        super(message, options);
    }
}
/**
 * Thrown when an actor attempts an operation they're not authorized
 * for, per the ApprovalPolicy.
 *
 * This is the Stage I extension of the Hard-Deny principle: every
 * sensitive transition is subject to explicit, testable authority
 * policies. Authority violations produce this error with a stable
 * code and a clear reason.
 *
 * The `violation` field carries the specific violation kind
 * (e.g., "proposer_cannot_approve_own", "not_in_approver_authorities").
 */
export class AuthorityViolationError extends NemonsError {
    violation;
    code = "NEMONS_AUTHORITY_VIOLATION";
    constructor(violation, message, options) {
        super(message, options);
        this.violation = violation;
    }
}
/**
 * Thrown when a claim is made without the required evidence to support
 * it — e.g., claiming a Run "succeeded" without the required verification
 * evidence.
 *
 * Encodes the "Evidence before claims" principle at the type level.
 */
export class InsufficientEvidenceError extends NemonsError {
    code = "NEMONS_INSUFFICIENT_EVIDENCE";
    constructor(message, options) {
        super(message, options);
    }
}
/**
 * Thrown when a Run is in a state that does not allow the requested
 * operation — e.g., trying to record evidence on a Run that is already
 * "completed" or "aborted".
 */
export class RunStateError extends NemonsError {
    runState;
    code = "NEMONS_RUN_STATE_ERROR";
    constructor(runState, message, options) {
        super(message, options);
        this.runState = runState;
    }
}
/**
 * Type-guard helpers for switching on error codes.
 */
export function isNemonsError(e) {
    return e instanceof NemonsError;
}
export function isPolicyDeniedError(e) {
    return e instanceof PolicyDeniedError;
}
export function isContractValidationError(e) {
    return e instanceof ContractValidationError;
}
export function isLifecycleViolationError(e) {
    return e instanceof LifecycleViolationError;
}
export function isAuthorityViolationError(e) {
    return e instanceof AuthorityViolationError;
}
export function isInsufficientEvidenceError(e) {
    return e instanceof InsufficientEvidenceError;
}
export function isRunStateError(e) {
    return e instanceof RunStateError;
}
export function isAdapterUnavailableError(e) {
    return e instanceof AdapterUnavailableError;
}
//# sourceMappingURL=errors.js.map