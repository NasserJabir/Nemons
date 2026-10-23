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
import type { PolicyDecisionId } from "./identifiers.js";
/**
 * Base interface for all Nemons structured errors.
 *
 * Every error has:
 *   - `code`: stable string for switch-based handling.
 *   - `message`: human-readable summary.
 *   - `details`: optional structured payload (JSON-safe).
 *   - `cause`: optional underlying cause (NOT serialized by default).
 */
export interface NemonsErrorLike {
    readonly code: string;
    readonly message: string;
    readonly details?: Readonly<Record<string, unknown>>;
}
/**
 * Abstract base class for all Nemons errors. Carries a `code` field.
 *
 * The `code` field is the canonical way to switch on an error type;
 * do NOT rely on `instanceof` across package boundaries — codes are
 * stable, class identity is not.
 */
export declare abstract class NemonsError extends Error {
    abstract readonly code: string;
    readonly details?: Readonly<Record<string, unknown>>;
    constructor(message: string, options?: {
        details?: Readonly<Record<string, unknown>>;
        cause?: unknown;
    });
    toJSON(): NemonsErrorLike;
}
/**
 * Thrown when an input value violates a contract — wrong shape, missing
 * required field, wrong type, out-of-range value, etc.
 *
 * This is distinct from a policy denial: the input itself is invalid
 * before any policy decision is considered.
 */
export declare class ContractValidationError extends NemonsError {
    readonly code: "NEMONS_CONTRACT_VALIDATION_ERROR";
    constructor(message: string, options?: {
        details?: Readonly<Record<string, unknown>>;
        cause?: unknown;
    });
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
export declare class PolicyDeniedError extends NemonsError {
    readonly decisionId: PolicyDecisionId;
    readonly code: "NEMONS_POLICY_DENIED";
    constructor(decisionId: PolicyDecisionId, message: string, options?: {
        details?: Readonly<Record<string, unknown>>;
        cause?: unknown;
    });
}
/**
 * Thrown when an operation requires an adapter that is not registered
 * or not available in the current runtime configuration.
 */
export declare class AdapterUnavailableError extends NemonsError {
    readonly adapterKind: string;
    readonly code: "NEMONS_ADAPTER_UNAVAILABLE";
    constructor(adapterKind: string, message: string, options?: {
        details?: Readonly<Record<string, unknown>>;
        cause?: unknown;
    });
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
export declare class LifecycleViolationError extends NemonsError {
    readonly code: "NEMONS_LIFECYCLE_VIOLATION";
    constructor(message: string, options?: {
        details?: Readonly<Record<string, unknown>>;
        cause?: unknown;
    });
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
export declare class AuthorityViolationError extends NemonsError {
    readonly violation: string;
    readonly code: "NEMONS_AUTHORITY_VIOLATION";
    constructor(violation: string, message: string, options?: {
        details?: Readonly<Record<string, unknown>>;
        cause?: unknown;
    });
}
/**
 * Thrown when a claim is made without the required evidence to support
 * it — e.g., claiming a Run "succeeded" without the required verification
 * evidence.
 *
 * Encodes the "Evidence before claims" principle at the type level.
 */
export declare class InsufficientEvidenceError extends NemonsError {
    readonly code: "NEMONS_INSUFFICIENT_EVIDENCE";
    constructor(message: string, options?: {
        details?: Readonly<Record<string, unknown>>;
        cause?: unknown;
    });
}
/**
 * Thrown when a Run is in a state that does not allow the requested
 * operation — e.g., trying to record evidence on a Run that is already
 * "completed" or "aborted".
 */
export declare class RunStateError extends NemonsError {
    readonly runState: string;
    readonly code: "NEMONS_RUN_STATE_ERROR";
    constructor(runState: string, message: string, options?: {
        details?: Readonly<Record<string, unknown>>;
        cause?: unknown;
    });
}
/**
 * Type-guard helpers for switching on error codes.
 */
export declare function isNemonsError(e: unknown): e is NemonsError;
export declare function isPolicyDeniedError(e: unknown): e is PolicyDeniedError;
export declare function isContractValidationError(e: unknown): e is ContractValidationError;
export declare function isLifecycleViolationError(e: unknown): e is LifecycleViolationError;
export declare function isAuthorityViolationError(e: unknown): e is AuthorityViolationError;
export declare function isInsufficientEvidenceError(e: unknown): e is InsufficientEvidenceError;
export declare function isRunStateError(e: unknown): e is RunStateError;
export declare function isAdapterUnavailableError(e: unknown): e is AdapterUnavailableError;
//# sourceMappingURL=errors.d.ts.map