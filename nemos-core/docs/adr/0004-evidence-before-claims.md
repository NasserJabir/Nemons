# ADR-0004 — Evidence Before Claims (Verified Execution)

**Status:** Accepted  
**Date:** Stage 0  
**Decision Owner:** Nemons Architecture

## Context

The architectural principles state:
- "Evidence before claims": execution success and knowledge promotion must be supported by evidence appropriate to the claim.
- "Verification over appearance": passing tests and satisfying acceptance criteria matter more than a plausible implementation narrative.
- "No implicit trust escalation": candidate → approved transitions never happen implicitly.

A common failure mode is treating a Coding Agent's claim of success as authoritative — "the agent said it passed, so it passed." This creates two problems:
1. A claim without backing evidence is untrustworthy.
2. The "verified" vs "claimed" distinction is lost, so downstream consumers cannot make informed reuse decisions.

## Decision

Encode the distinction at the type level:

1. A `Run` may be in `succeeded` state ONLY if it has at least one Evidence reference. `RunManager.markSucceeded()` throws `InsufficientEvidenceError` if no Evidence is recorded.
2. An `Evidence` record has a `verified: boolean` field that is `false` until the EvidenceValidator confirms the artifact hash matches.
3. The `EvaluationEngine` distinguishes four outcomes:
   - `verified_succeeded`: criteria met AND verified Evidence present.
   - `claimed_succeeded_unverified`: the Run claimed success but verified Evidence is absent or insufficient.
   - `failed`: criteria not met OR Evidence shows the Run failed.
   - `inconclusive`: criteria could not be evaluated.
4. An `Experience` may be marked `reusable` only if its backing `evaluationId` exists (and the Evaluation is `verified_succeeded` — enforced by the lifecycle).

## Implementation

**`RunManager.markSucceeded()` requires Evidence:**

```typescript
markSucceeded(runId: RunId): Run {
  // CRITICAL: succeeded requires verified evidence
  if ((current.evidenceRefs?.length ?? 0) === 0) {
    throw new InsufficientEvidenceError(
      "Cannot mark Run as succeeded: no Evidence references recorded. " +
      "A claimed success without evidence is not a verified success."
    );
  }
  // ...
}
```

**Evidence kinds are classified as sufficient or insufficient for success:**

```typescript
export function isEvidenceKindSufficientForSuccess(kind: EvidenceKind): boolean {
  return kind !== "text_assertion";
}
```

A `text_assertion` is the lowest-trust Evidence kind: a textual claim with no underlying artifact. It MAY be recorded (the runtime allows it) but does NOT support a verified-succeeded Evaluation on its own.

**EvidenceValidator verifies content integrity:**

```typescript
verify(evidence: Evidence): Evidence {
  if (evidence.artifact.inlinePayload !== undefined) {
    const ok = verifyInlineEvidence(evidence);
    if (!ok) {
      throw new ContractValidationError("Evidence integrity violation: ...");
    }
    return { ...evidence, verified: true };
  }
  // URI-backed: external verification required
  return evidence;
}
```

**EvaluationEngine does not count unverified evidence toward criterion satisfaction:**

```typescript
private evaluateCriterion(c, evidence) {
  const examined = evidence.filter((e) => c.requiredEvidenceKinds.includes(e.kind));
  const verifiedMatching = examined.filter((e) => e.verified);  // CRITICAL
  const satisfied = verifiedMatching.length > 0;
  // ...
}
```

## Consequences

- `RunManager.markSucceeded()` is gated on Evidence — tests verify this throws when no Evidence is recorded.
- Tests verify that unverified Evidence does not satisfy evaluation criteria (`tests/evaluation/evaluation-engine.test.ts > does NOT count unverified evidence toward criterion satisfaction`).
- Tests verify that a `succeeded` Run with no Evidence returns `false` for `isRunVerifiedSucceeded()` (the contract violation case).
- The `claimed_succeeded_unverified` Evaluation outcome preserves the distinction between "claimed success" and "verified success" — downstream code MUST NOT treat these equivalently.

## Compliance

- `tests/run/run-manager.test.ts > FORBIDS markSucceeded without Evidence` (architectural rule encoded as a test).
- `tests/schemas/run.test.ts > isRunVerifiedSucceeded` (verifies the contract-violation detection).
- `tests/evaluation/evaluation-engine.test.ts > claimed_succeeded_unverified` (verifies the distinction is preserved).
- `tests/evidence/evidence-collector.test.ts > THROWS on integrity violation` (verifies hash mismatch hard-fails).
