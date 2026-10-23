/**
 * Nemons Core — Lifecycle
 *
 * Enforces the explicit lifecycle of operational assets:
 *
 *   Observed → Candidate → Reviewed → Approved → Deprecated
 *
 * Architectural principles enforced here:
 *   - "No silent mutation": operational assets must not change their
 *     approved state without the required governance process.
 *   - "Use is not adoption": using a candidate asset does not make it
 *     approved.
 *   - "Retrieved is not approved": retrieval preserves trust status.
 *
 * The lifecycle is a strict state machine; transitions not enumerated
 * here are forbidden. The functions in this module are the ONLY
 * sanctioned way to transition an asset's lifecycle status.
 */
import type { ProvenanceKind } from "./provenance.js";
import type { ReviewEntry } from "./provenance.js";
/**
 * Validates whether a transition from `from` → `to` is permitted.
 *
 * Returns true only when the transition is explicitly enumerated in
 * ALLOWED_TRANSITIONS.
 */
export declare function isTransitionAllowed(from: ProvenanceKind, to: ProvenanceKind): boolean;
/**
 * Thrown when an unauthorized lifecycle transition is attempted.
 *
 * This is a hard-deny condition: the runtime MUST refuse the mutation.
 */
export declare class IllegalTransitionError extends Error {
    readonly from: ProvenanceKind;
    readonly to: ProvenanceKind;
    readonly code: "NEMONS_LIFECYCLE_ILLEGAL_TRANSITION";
    constructor(from: ProvenanceKind, to: ProvenanceKind);
}
/**
 * Validates that a transition is allowed; throws `IllegalTransitionError`
 * otherwise. Use this at any point where a lifecycle mutation is attempted.
 */
export declare function assertTransition(from: ProvenanceKind, to: ProvenanceKind): void;
/**
 * Applies a transition to a `Provenance` record, producing a NEW
 * provenance object with the new kind and an appended ReviewEntry.
 *
 * The original provenance is NOT mutated. Immutability is enforced
 * because the lifecycle trail MUST be append-only.
 *
 * Throws `IllegalTransitionError` if the transition is not allowed.
 */
export declare function transitionProvenance(current: {
    readonly kind: ProvenanceKind;
    readonly reviewTrail?: readonly ReviewEntry[];
}, next: ProvenanceKind, entry: Omit<ReviewEntry, "from" | "to">): {
    readonly kind: ProvenanceKind;
    readonly reviewTrail: readonly ReviewEntry[];
};
/**
 * Returns the set of legal next states from a given kind.
 */
export declare function legalNextKinds(from: ProvenanceKind): readonly ProvenanceKind[];
/**
 * Returns true if the given kind is a "candidate" — i.e., between entry
 * and reviewed. Used to gate "use is not adoption" enforcement.
 *
 * In the current lifecycle, "proposed" is the only true "candidate"
 * status: it's a generated candidate that hasn't been reviewed yet.
 * "observed" and "imported" are entry states, not candidates per se.
 */
export declare function isCandidateKind(kind: ProvenanceKind): boolean;
/**
 * Returns true if the given kind is terminal (cannot be transitioned
 * further). Currently only "deprecated" is terminal.
 */
export declare function isTerminalKind(kind: ProvenanceKind): boolean;
//# sourceMappingURL=lifecycle.d.ts.map