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
 * The state-machine of trust status transitions.
 *
 * Entry kinds (initial states):
 *   - "observed"
 *   - "imported"
 *   - "proposed"
 *
 * These can transition to "candidate" (still not "reviewed").
 * From "candidate" → "reviewed" → "approved" → "deprecated".
 *
 * Promotion to "candidate" from an entry kind is the first review step.
 * The chain MUST be linear; skipping is forbidden.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<ProvenanceKind, readonly ProvenanceKind[]>> = {
  observed: ["proposed", "reviewed"],
  imported: ["reviewed"],
  proposed: ["reviewed"],
  reviewed: ["approved", "deprecated"],
  approved: ["deprecated"],
  deprecated: [], // terminal
};

/**
 * Validates whether a transition from `from` → `to` is permitted.
 *
 * Returns true only when the transition is explicitly enumerated in
 * ALLOWED_TRANSITIONS.
 */
export function isTransitionAllowed(from: ProvenanceKind, to: ProvenanceKind): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Thrown when an unauthorized lifecycle transition is attempted.
 *
 * This is a hard-deny condition: the runtime MUST refuse the mutation.
 */
export class IllegalTransitionError extends Error {
  readonly code = "NEMONS_LIFECYCLE_ILLEGAL_TRANSITION" as const;
  constructor(
    public readonly from: ProvenanceKind,
    public readonly to: ProvenanceKind,
  ) {
    super(`Illegal lifecycle transition: ${from} → ${to}`);
    this.name = "IllegalTransitionError";
  }
}

/**
 * Validates that a transition is allowed; throws `IllegalTransitionError`
 * otherwise. Use this at any point where a lifecycle mutation is attempted.
 */
export function assertTransition(from: ProvenanceKind, to: ProvenanceKind): void {
  if (!isTransitionAllowed(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}

/**
 * Applies a transition to a `Provenance` record, producing a NEW
 * provenance object with the new kind and an appended ReviewEntry.
 *
 * The original provenance is NOT mutated. Immutability is enforced
 * because the lifecycle trail MUST be append-only.
 *
 * Throws `IllegalTransitionError` if the transition is not allowed.
 */
export function transitionProvenance(
  current: {
    readonly kind: ProvenanceKind;
    readonly reviewTrail?: readonly ReviewEntry[];
  },
  next: ProvenanceKind,
  entry: Omit<ReviewEntry, "from" | "to">,
): {
  readonly kind: ProvenanceKind;
  readonly reviewTrail: readonly ReviewEntry[];
} {
  assertTransition(current.kind, next);
  const newEntry: ReviewEntry = {
    ...entry,
    from: current.kind,
    to: next,
  };
  const existingTrail = current.reviewTrail ?? [];
  return {
    kind: next,
    reviewTrail: [...existingTrail, newEntry],
  };
}

/**
 * Returns the set of legal next states from a given kind.
 */
export function legalNextKinds(from: ProvenanceKind): readonly ProvenanceKind[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}

/**
 * Returns true if the given kind is a "candidate" — i.e., between entry
 * and reviewed. Used to gate "use is not adoption" enforcement.
 *
 * In the current lifecycle, "proposed" is the only true "candidate"
 * status: it's a generated candidate that hasn't been reviewed yet.
 * "observed" and "imported" are entry states, not candidates per se.
 */
export function isCandidateKind(kind: ProvenanceKind): boolean {
  return kind === "proposed";
}

/**
 * Returns true if the given kind is terminal (cannot be transitioned
 * further). Currently only "deprecated" is terminal.
 */
export function isTerminalKind(kind: ProvenanceKind): boolean {
  return kind === "deprecated";
}
