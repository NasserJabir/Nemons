# ADR-0005 — Lifecycle as the Approval Surface (No "Approved" Boolean Field)

**Status:** Accepted  
**Date:** Stage 0  
**Decision Owner:** Nemons Architecture

## Context

The architectural principles state:
- "Use is not adoption": using a candidate asset does not make it approved.
- "Retrieved is not approved": retrieval preserves trust and lifecycle status.
- "No silent mutation": operational assets must not change their approved state without the required governance process.

A common failure mode is adding a `approved: boolean` field directly on an asset (Persona, Skill, Knowledge, etc.). This causes:
1. Two sources of truth: the field and the lifecycle status. They can drift.
2. Silent mutation: setting `approved = true` is a single statement, with no audit trail.
3. Lifecycle confusion: a record that was "approved" but is now "deprecated" needs both fields updated.

## Decision

Do NOT add an `approved: boolean` field to operational assets. The asset's lifecycle status IS the approval decision, and it lives in `provenance.kind` (one of: `observed`, `imported`, `proposed`, `reviewed`, `approved`, `deprecated`).

The lifecycle is enforced by `core/lifecycle.ts`:
- Strict state machine: only enumerated transitions are allowed.
- Append-only review trail: each transition records who/what/when/why.
- Immutability: `transitionProvenance()` returns a NEW record; the original is unchanged.

## Implementation

**The 6 lifecycle kinds are encoded in `core/provenance.ts::ProvenanceKind`:**

```typescript
export type ProvenanceKind =
  | "observed"   // lowest trust — derived from runtime observation
  | "imported"   // introduced from an external source
  | "proposed"   // suggested by candidate-generation
  | "reviewed"   // examined by a review process (NOT yet approved)
  | "approved"   // governed and eligible for non-candidate use
  | "deprecated"; // explicitly retired
```

**Allowed transitions:**

```typescript
const ALLOWED_TRANSITIONS: Readonly<Record<ProvenanceKind, readonly ProvenanceKind[]>> = {
  observed:  ["proposed", "reviewed"],
  imported:  ["reviewed"],
  proposed:  ["reviewed"],
  reviewed:  ["approved", "deprecated"],
  approved:  ["deprecated"],
  deprecated: [],  // terminal
};
```

**Schema helpers check approval status by querying `provenance.kind`:**

```typescript
export function isPersonaApproved(p: Persona): boolean {
  return p.provenance.kind === "approved";  // no field, just lifecycle
}
```

## Consequences

- An asset's approval state is observed via `is{Type}Approved(asset)` helpers, not via `asset.approved === true`.
- Lifecycle transitions MUST go through `transitionProvenance()` (or higher-level governance functions); direct field mutation is prevented by `readonly`.
- The review trail is the audit trail — every transition is traceable.
- "Use is not adoption" is encoded at the policy level: `LifecycleGateRule` allows `approved` assets and defers intermediate kinds (requiring explicit authorization for candidate use).

## Compliance

- `tests/core/lifecycle.test.ts` verifies every allowed and forbidden transition.
- `tests/schemas/persona.test.ts` (and equivalent for other schemas) verifies `is{Type}Approved` queries `provenance.kind`.
- `tests/policy/policy-engine.test.ts` verifies the `LifecycleGateRule` enforces this distinction.
- No schema has an `approved` field — verified by inspection of all schema files in `src/schemas/`.
