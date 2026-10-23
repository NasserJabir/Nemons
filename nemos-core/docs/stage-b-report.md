# Stage B Report — Core Contract Integrity

**Status:** Complete  
**Date:** Stage B  
**Owner:** Nemons Architecture

## Stage B Scope (per the Project Brief)

Stage B verifies:
1. Core schemas (contract validation)
2. Hard-deny rules
3. Adapter boundary
4. Context-resolution behavior
5. Error semantics

The exit condition is: tests demonstrate the intended contracts, including invalid inputs and denied operations.

## What Was Delivered

### B1. Boundary tests (`tests/stage-b/boundary-tests.test.ts`) — 117 tests

Verifies behavior at the extremes of valid input:
- Identifier length boundaries: 1, 1024 (max), 1025 (over), 0 (empty)
- SHA-256 with empty input, 10KB input, single-byte differences, Uint8Array inputs
- `freshId` uniqueness at scale (1000 distinct ids)
- Lifecycle transition table completeness — all 6×6=36 (from,to) pairs are classified
- Provenance helpers (`isApproved`, `isDeprecated`, `isObservedOnly`, `meetsMinimumTrust`) — full matrix over all 6 kinds
- `assertDefined` with falsy-but-defined values (0, "", false)

### B2. Cross-component invariants (`tests/stage-b/cross-component-invariants.test.ts`) — 13 tests

Verifies invariants spanning multiple components:
- Run ↔ Context Pack: `run.contextPackId` matches the pack built
- Evidence ↔ Run: every Evidence produced by the collector carries the Run's id; provenance source is `run`-kind with the right runId
- Context Pack ↔ Provenance: every asset's `provenanceKind` matches the source asset's `provenance.kind`
- Context Pack exclusions cover both Resolver-excluded (lifecycle/applicability/capability) and Policy-excluded assets
- Policy ↔ PolicyDecisionId: every decision has a unique id; the operation kind is preserved
- Evaluation ↔ Run: an Evaluation references the Run it was evaluated against; results array has one entry per criterion in order
- Adapter ↔ Run outputs: the adapter's result `runId` matches the input `runId`
- RunManager: terminal Runs reject all further state changes
- EvidenceCollector: every Evidence with an inline payload has a matching contentHash

### B3. Lifecycle property-based tests (`tests/stage-b/lifecycle-property-tests.test.ts`) — 97 tests

Verifies 8 properties (P1–P8) that hold for ALL valid inputs:
- P1: `isTransitionAllowed` is deterministic
- P2 + P3: every allowed transition succeeds; every forbidden transition throws
- P4: the review trail is append-only across multiple transitions; branches from the same start are independent
- P5: terminal kinds cannot be transitioned out of
- P6: `legalNextKinds` and `isTransitionAllowed` are consistent
- P7: `transitionProvenance` does not mutate the original record
- P8: every legal next kind is a valid `ProvenanceKind`

### B4. Adapter Conformance Suite (`tests/conformance/adapter-conformance.test.ts`) — 11 tests

An abstract test suite that ANY `AdapterContract` implementation must pass:
- C1: declares a stable, non-empty `kind`
- C2: `getCapabilities` returns a non-empty capability set with a summary
- C3 + C4: `invoke` returns a result with matching `runId` and a valid `claimedOutcome`
- C5: `invoke` does NOT mutate the input Context Pack
- C6: `invoke` emits at least one `adapterEvent` with kind + ISO timestamp
- C7: `invoke` returns a `traceRef`
- C8: capabilities are stable across repeated calls

Plus checks for `adapterHasCapability` / `adapterHasAllCapabilities`.

The `describeAdapter(name, factory)` function is exported so future adapters (OpenHands, Cezar, etc.) can be plugged in and verified against the same conformance surface.

### B5. Golden Task fixture (`tests/stage-b/golden-task.test.ts`) — 7 tests

A controlled mini-GT-01 fixture that validates the full Nemons lifecycle end-to-end:
- Reproducible fixture identity (`nemons.golden-task.mini-gt-01.stage-b`)
- Approved, applicable Persona + Skill + Knowledge
- Run creation, Context Pack build (all 3 assets included, no exclusions), MockAdapter invocation, Evidence collection, hash verification, Evaluation (`verified_succeeded`), `markSucceeded` with Evidence + Evaluation refs
- Negative paths: candidate Persona is NOT silently approved; no Run can be marked succeeded without Evidence; non-test-fix task cannot use the test-fix Persona

### B6. Error code stability (`tests/stage-b/error-code-stability.test.ts`) — 25 tests

Verifies the structured error `code` field is:
- E1: stable across instances of the same class
- E2: distinct across classes (no collisions)
- E3: independent of the error message
- E4: JSON-serializable (toJSON preserves code, message, details)

Plus type guards (isXxxError) for every class, and preservation of primary key fields (`decisionId`, `adapterKind`, `runState`).

### B7. Evaluation outcome invariants (`tests/stage-b/evaluation-invariants.test.ts`) — 24 tests

Verifies the EvaluationEngine's outcome classification is correct for ALL combinations:
- V1: `verified_succeeded` requires ALL required criteria satisfied by VERIFIED evidence
- V2: `claimed_succeeded_unverified` when claim is success but criteria not all met
- V3: `failed` when Run claimed failure AND criteria not satisfied (otherwise verified evidence overrides the claim)
- V4: `inconclusive` when no claim and criteria not met
- V5: unverified evidence NEVER counts toward criterion satisfaction
- V6: optional criteria (`required: false`) do not block `verified_succeeded`
- V7: limitations are recorded for any input gap

Exhaustive matrix over (claimedOutcome × hasMatchingVerifiedEvidence).

## Bug Found and Fixed During Stage B

**Bug:** The `DefaultContextPackBuilder.processCandidate()` was passing `availableCapabilities: undefined` to the PolicyEngine when evaluating Skill selection. The `CapabilityRequirementRule` denied Skills whose required capabilities were known to be available (because the rule couldn't verify when `availableCapabilities` was undefined).

**Fix:** Added `availableCapabilities` as a `build()` input parameter; the builder now propagates it through to the policy engine. Existing tests were updated to pass the MockAdapter's capability set.

**Architectural principle preserved:** "Explicit boundaries" — the adapter's capability set is now visible to the policy engine, so Skill selection is properly verified.

## Test Counts

| Test file | Tests | Status |
|-----------|-------|--------|
| `tests/stage-b/boundary-tests.test.ts` | 117 | ✅ |
| `tests/stage-b/cross-component-invariants.test.ts` | 13 | ✅ |
| `tests/stage-b/lifecycle-property-tests.test.ts` | 97 | ✅ |
| `tests/stage-b/golden-task.test.ts` | 7 | ✅ |
| `tests/stage-b/error-code-stability.test.ts` | 25 | ✅ |
| `tests/stage-b/evaluation-invariants.test.ts` | 24 | ✅ |
| `tests/conformance/adapter-conformance.test.ts` | 11 | ✅ |
| **Stage B subtotal** | **294** | ✅ |
| **Stage 0 subtotal** | 277 | ✅ (unchanged) |
| **Cumulative total** | **581** | ✅ |

## Exit Condition Status (per Project Brief)

> "Tests demonstrate the intended contracts, including invalid inputs and denied operations."

✅ Invalid inputs: covered by schema validators (Stage 0) and boundary tests (B1).
✅ Denied operations: covered by Hard-Deny policy tests (Stage 0) and error-code stability tests (B6).
✅ Cross-component invariants: covered (B2).
✅ State-machine properties: covered for lifecycle (B3) and Run (Stage 0 + B2).
✅ Adapter conformance: covered (B4).
✅ Deterministic fixture: covered (B5 mini-GT-01).

**Stage B exit condition: MET.**

## Remaining Gaps Before Stage C Authorization

Stage C (Approved Harness Boundary) requires explicit authorization per the Project Brief. The following gaps must be closed before authorization:

1. **No real adapter implementation.** The MockAdapter is the only registered adapter; it is explicitly NON-PRODUCTION. Stage C requires a real adapter (e.g., OpenHands SDK, Cezar) to be implemented and registered.
2. **No repository fixture pinning.** The mini-GT-01 fixture uses a placeholder SHA (`0000…0000`); Stage C requires a real fixture repository with a pinned `FIXTURE_SHA`.
3. **No persistence.** All state is in-memory; Stage E introduces persistence. Stage C authorization should not require persistence, but Stage D does.
4. **No real Coding Agent execution.** The MockAdapter does not invoke any real Coding Agent; Stage C authorization specifically authorizes real-harness execution.
5. **No Golden Task validation against a real baseline.** The mini-GT-01 fixture is self-contained; the project brief's GT-01 mentions a specific baseline-hash gap that must be closed before Stage C.

## Recommendations for Stage C Preparation

1. Select the target adapter (recommend OpenHands SDK as the most documented and most stable).
2. Implement the adapter against `AdapterContract`; run the conformance suite (`tests/conformance/`) to verify.
3. Create a real fixture repository with a pinned `FIXTURE_SHA` and `baseline_hash`.
4. Re-implement the Golden Task fixture using the real adapter and real repository.
5. Request explicit owner authorization to cross from fixture-based validation into real-harness execution.

## Compliance

- All Stage B tests are in `tests/stage-b/` and `tests/conformance/`.
- `npm run typecheck` clean.
- `npm run build` clean.
- `npm test` → 581 / 581 tests passing.
- The Hard-Deny security ADR (0003) and Evidence-before-claims ADR (0004) are enforced by tests in B2, B5, B7.
