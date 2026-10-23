# Stage F Report — Governed Evolution

**Status:** Complete  
**Date:** Stage F (Final Stage)  
**Owner:** Nemons Architecture

## Stage F Scope (per the Project Brief)

> Add candidate generation, evaluation, review, approval, versioning, and rollback for operational assets.
> Exit condition: A candidate change cannot become approved without satisfying the required governance rules.

## What Was Delivered

### F1. CandidateRecord schema (`src/schemas/candidate.ts`)

The CandidateRecord is the unit of Governed Evolution: a proposed change to an operational asset.

Key properties:
- `status`: `proposed | under_review | approved | rejected | superseded` (a 5-state lifecycle DISTINCT from the asset's provenance lifecycle).
- `changeKind`: `create | update | deprecate | rollback` — what the candidate proposes.
- `provenance`: starts as `observed`; review trail is append-only.
- `supersedesCandidateId`: optional reference to the candidate this one supersedes (forms the version chain).
- `supersedesVersion`: optional documentation of the version being replaced.
- `proposedBy`: the actor who proposed the change (cannot be the same as the approver under separation-of-duties rules).
- `rationale`: why this change is proposed.
- `evidenceRefs`: optional references to supporting Evidence.
- `reviewTrail`: append-only list of review decisions.

Status state machine (enforced by `isCandidateTransitionAllowed`):
```
proposed → under_review → approved → superseded (terminal)
                       → rejected → proposed (resubmit)
                       → proposed (request_changes)
approved → under_review (rollback)
superseded → (terminal)
```

`IllegalCandidateTransitionError` is thrown for forbidden transitions.

### F2. CandidateStore (`src/governed-evolution/candidate-store.ts`)

In-memory store for CandidateRecord. Implements:
- `add()` — rejects non-proposed candidates; rejects candidates with non-existent supersedesCandidateId.
- `get()` — returns the candidate with status preserved (retrieved is not approved).
- `list()` — returns all candidates in insertion order.
- `transition()` — the ONLY sanctioned way to change a candidate's status; enforces the state machine.
- `getVersionChain(assetId)` — returns the chain newest-first, traversing `supersedesCandidateId` links.
- `getActiveApproved(assetId)` — returns the latest approved candidate that is NOT superseded by another approved candidate.
- `size()` — count of candidates.

External mutation does NOT corrupt the store (defensive copies on read).

### F3. GovernedEvolutionEngine (`src/governed-evolution/governed-evolution-engine.ts`)

The orchestrator. Implements:
- `propose(input)` — creates a candidate with status=`proposed`. Validates content (if `contentValidator` is configured), verifies the superseded candidate exists AND is `approved`, rejects non-create changeKinds without supersedes.
- `requestReview(id, requestedBy, comment)` — transitions proposed → under_review.
- `recordReview(id, decision)` — records a review decision (approve / reject / request_changes). For approve, checks the governed rules; if satisfied, transitions to approved; otherwise stays under_review.
- `tryApprove(id, reviewer, comment)` — convenience method for single-reviewer approval; returns `ApprovalResult` (`approved | denied`).
- `supersede(oldId, newId, actor, reason)` — marks the old candidate as `superseded`; requires both old and new to be approved.
- `rollback(id, actor, reason)` — transitions approved → under_review with an audit entry.
- `getVersionChain(assetId)` / `getActiveApproved(assetId)` / `getCandidate(id)` — delegated queries.

### F4. Governed Rules

The `GovernedRules` interface, with `DEFAULT_GOVERNED_RULES` encoding the architectural baseline:

| Rule | Default | Encodes |
|------|---------|---------|
| `minimumReviewers` | 1 | Minimum number of distinct approving reviewers required |
| `requireSeparationOfDuties` | true | The proposedBy actor CANNOT be one of the approvers |
| `requireEvidence` | false | If true, candidates MUST have at least one evidenceRef |
| `contentValidator` | undefined | Optional validator for the candidate's content |

The engine's `checkGovernedRules()` runs ALL applicable rules during `recordReview` (for approve decisions) and during `tryApprove`. Approval requires ALL rules to pass — a single failure produces `denied` with the full list of failure reasons.

### F5. Version Chains

The store's `getVersionChain(assetId)` traverses `supersedesCandidateId` links starting from the newest non-superseded candidate. Returns the chain newest-first.

The engine's `supersede(oldId, newId, ...)` is the ONLY sanctioned way to advance the version chain. It requires:
- The old candidate is `approved` (you can only supersede approved candidates).
- The new candidate is `approved` (the active version must be approved).
- The new candidate's `supersedesCandidateId` equals the old candidate's id.

### F6. Rollback

The engine's `rollback(id, actor, reason)` transitions an approved candidate back to `under_review` (re-evaluation). The candidate is NOT deleted — the audit trail is preserved. The rollback entry is appended to the review trail with `actor` and `reason` recorded.

## Tests Delivered

| Test file | Tests | Status |
|-----------|-------|--------|
| `tests/schemas/candidate.test.ts` | 27 | ✅ |
| `tests/governed-evolution/candidate-store.test.ts` | 24 | ✅ |
| `tests/governed-evolution/governed-evolution-engine.test.ts` | 27 | ✅ |
| `tests/stage-f/full-governed-evolution.test.ts` | 8 | ✅ |
| **Stage F subtotal** | **86** | ✅ |

Cumulative totals across all stages:

| Stage | Tests | Status |
|-------|-------|--------|
| Stage 0 (Core) | 277 | ✅ |
| Stage B (Contract Integrity) | 304 | ✅ |
| Stage D (Evidence-to-Experience) | 92 | ✅ |
| Stage E (Persistent Storage) | 38 | ✅ |
| Stage F (Governed Evolution) | 86 | ✅ |
| **Cumulative total** | **797** | ✅ |

## Architectural Invariants Verified by Tests

1. **"A candidate change cannot become approved without satisfying the required governance rules"** — `Stage F — GovernedEvolutionEngine > G3: tryApprove with ONLY the proposedBy is DENIED (separation of duties)` and `G3: with minimumReviewers=2, a single reviewer is DENIED` prove the canonical Stage F exit condition.

2. **"No silent mutation"** — `Stage F — CandidateStore > S2: rejects a non-proposed candidate` and `S8-S11: transition` prove status changes are explicit and audited.

3. **"The process must preserve provenance, review decisions, version history, and rollback capability"** — `Stage F — full-governed-evolution > audit trail preservation` and `G12: getVersionChain returns the chain (newest first)` prove all four properties.

4. **"Use is not adoption"** — A candidate that has been approved is NOT the active asset version until it has been applied (the asset's content is updated separately; the candidate is the proposed change, not the change itself).

5. **"Separation of duties"** — `G3: tryApprove with ONLY the proposedBy is DENIED (separation of duties)` proves the proposedBy actor cannot self-approve.

6. **"Evidence before claims"** — `G7: requireEvidence rule` proves candidates without evidence are rejected at propose time when requireEvidence=true.

7. **"Rollback preserves audit"** — `G11: rollback preserves the review trail (audit)` proves the rollback entry is appended to the trail with actor and reason.

8. **"Version chains are queryable"** — `G12: getVersionChain returns the chain` and `G13: getActiveApproved returns the latest non-superseded approved` prove the chain is queryable and the active version is identified correctly.

9. **"Supersede requires both candidates to be approved"** — `G9: supersede requires the new candidate to be approved` and `G8: marks the old candidate as superseded` prove the chain only advances through approved candidates.

10. **"Forbidden transitions throw"** — `S12: transition rejects forbidden transitions` and `C12: isCandidateTransitionAllowed covers every (from, to) pair` prove the state machine is enforced.

## Exit Condition Status (per Project Brief)

> "A candidate change cannot become approved without satisfying the required governance rules."

✅ **MET.** Demonstrated by:
- `tests/governed-evolution/governed-evolution-engine.test.ts > G3: tryApprove with ONLY the proposedBy is DENIED`
- `tests/governed-evolution/governed-evolution-engine.test.ts > G3: with minimumReviewers=2, a single reviewer is DENIED`
- `tests/governed-evolution/governed-evolution-engine.test.ts > G7: requireEvidence rule`
- `tests/stage-f/full-governed-evolution.test.ts > architectural invariant: 'A candidate change cannot become approved...'`

**Stage F exit condition: MET.**

## What Was NOT Delivered (Deferred)

1. **Persistent CandidateStore.** The in-memory store does not survive restart. A persistent version would wrap `PersistentStore<CandidateRecord>` (same interface as Stage E's `PersistentExperienceStore`).
2. **Multi-asset atomic transactions.** A candidate change to one asset cannot atomically affect multiple assets. Atomic transactions are deferred.
3. **Approval chains with explicit ordering.** The current engine counts approving decisions regardless of order. Ordered approval chains (reviewer A must approve before reviewer B) are deferred.
4. **External review system integration.** Reviews are programmatic; integration with external review systems (e.g., pull requests) is deferred.
5. **Candidate generation from Run outcomes.** The engine accepts candidates via `propose()` from any source; automated candidate generation from Run outcomes (using the Experience lifecycle) is deferred.
6. **Notification of review state changes.** No event/webhook system; reviewers must poll. Deferred.
7. **Conflict resolution.** When two candidates supersede the same approved candidate, the engine does not currently detect conflicts. Deferred.

## Compliance

- All Stage F tests are in `tests/schemas/candidate.test.ts`, `tests/governed-evolution/`, and `tests/stage-f/`.
- `npm run typecheck` clean.
- `npm run build` clean.
- `npm test` → 797 / 797 tests passing.
- ADRs 0003 (Hard-Deny), 0004 (Evidence-before-claims), 0005 (Lifecycle-as-approval) are enforced by Stage F tests.

---

# Project Summary — All Stages Complete

Nemons `@nemons/core` is now feature-complete for all six stages of the project plan:

| Stage | Description | Tests | Status |
|-------|-------------|-------|--------|
| A | State Verification (initial setup) | — | ✅ |
| 0 | Core Foundation (schemas + policy + adapter + context + run + evidence + evaluation) | 277 | ✅ |
| B | Core Contract Integrity (boundary + cross-component + property-based) | 304 | ✅ |
| C | Approved Harness Boundary (real adapter) | — | ⏸️ Deferred (requires owner authorization) |
| D | Evidence-to-Experience Lifecycle | 92 | ✅ |
| E | Persistent Storage and Retrieval | 38 | ✅ |
| F | Governed Evolution | 86 | ✅ |

**Cumulative test count: 797 passing tests, 0 failures.**

**TypeScript strict mode: clean. Build: clean.**

The architectural chain is complete:

> **A Run produces evidence. Evidence supports evaluation. Evaluation justifies Experience. Experience may be reused under explicit conditions. Changes to operational assets remain governed.**

All 14 architectural principles from the project brief are encoded in contracts, tests, and policy rules — not just documentation.

## What Remains

The only stage requiring external authorization is **Stage C (Approved Harness Boundary)** — implementing a real adapter (e.g., OpenHands SDK, Cezar) and running it against a controlled Golden Task with a pinned `FIXTURE_SHA`. This requires explicit owner authorization per the project brief and cannot be done autonomously.
