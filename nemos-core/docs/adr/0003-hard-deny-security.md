# ADR-0003 — Hard-Deny Security and Default-Deny Baseline

**Status:** Accepted  
**Date:** Stage 0  
**Decision Owner:** Nemons Architecture

## Context

The architectural principles state:
- "Hard-deny security": protected operations must be denied by default when required authorization or policy conditions are not satisfied.
- "Observed is not enforced": logging an event or detecting a violation does not prevent it.

A common failure mode in agent runtimes is "soft-deny" or "warn-only" enforcement: the runtime logs a violation but the operation proceeds. This is incompatible with Nemons' governance requirements.

## Decision

The PolicyEngine enforces **hard-deny** as the baseline:

1. **Default-deny**: every operation starts in the `deny` state. An operation is allowed ONLY when at least one policy rule explicitly returns `allow` AND no rule returns `deny`.
2. **Deny wins**: if ANY rule denies, the aggregate outcome is `deny`. No other rule can override an explicit deny.
3. **Allow overrides defer**: if any rule allows and no rule denies, the aggregate is `allow`. The `DefaultDenyRule` (which always `defers`) is overridden by an explicit `allow`.
4. **Defer is not authorization**: a `defer` outcome is treated as `deny` at the enforcement layer. `enforceDecision()` throws `PolicyDeniedError` for any outcome that is not `allow`.

## Implementation

The aggregation logic lives in `policy/policy-decision.ts::aggregateOutcomes()`:

```typescript
if (rules.length === 0) return "deny";            // default-deny
if (rules.some((r) => r.outcome === "deny")) return "deny";  // deny wins
if (rules.some((r) => r.outcome === "allow")) return "allow"; // allow overrides defer
if (rules.some((r) => r.outcome === "defer")) return "defer"; // no allow → defer
return "deny";                                      // default-deny
```

The enforcement helper is `policy/policy-engine.ts::enforceDecision()`:

```typescript
export function enforceDecision(decision: PolicyDecision): void {
  if (decision.outcome !== "allow") {
    throw new PolicyDeniedError(decision.id, decision.reason, { ... });
  }
}
```

## Built-in Rules

| Rule | Purpose |
|------|---------|
| `DefaultDenyRule` | Baseline — defers ALL operations; provides the audit-trail entry for default-deny |
| `LifecycleGateRule` | Allows `approved`; denies `deprecated`; defers intermediate kinds (observed, imported, proposed, reviewed) |
| `NoCandidatePromotionRule` | Allows candidate inclusion ONLY in explicitly experimental Runs |
| `NoImplicitTrustEscalationRule` | Promotions (`knowledge.promote`, `skill.promote`, `persona.promote`) require explicit `governedReview=true` |
| `CapabilityRequirementRule` | Skill selection requires the adapter to expose every required capability. Returns `defer` (neutral) when no capabilities are required (prevents accidental allow-override) |

## Consequences

- Every protected operation in the runtime MUST call `enforceDecision()` (or check `decision.outcome === "allow"`) before proceeding.
- A `defer` outcome is NOT authorization; callers MUST treat `defer` and `deny` identically at the enforcement layer.
- Custom rules that wish to allow an operation MUST explicitly return `allow` — there is no implicit allow path.
- Tests verify both the allow path AND the deny path for every protected operation (see `tests/policy/policy-engine.test.ts`).

## Compliance

- Tests assert that operations without an explicit allow rule throw (`tests/policy/policy-engine.test.ts > denies (or defers) when no rule explicitly allows`).
- Tests assert that candidate inclusion is denied in non-experimental runs and allowed only in explicitly experimental runs (`tests/context/context-pack-builder.test.ts`).
- Tests assert that promotion without `governedReview=true` is denied (`tests/policy/policy-engine.test.ts`).
- The Run Manager enforces policy on every state transition and on every evidence recording (`tests/run/run-manager.test.ts`).
