# Stage I Report — Approval Policies

**Status:** Complete  
**Date:** Stage I (Final Stage of the Expansion Map)  
**Owner:** Nemons Architecture

## Stage I Scope (per the user's instructions)

> مراجعات متعددة المراحل عند الحاجة.
> فصل صلاحيات المقترح والمراجع والمعتمد.
> تسجيل قرارات الموافقة والرفض بصورة قابلة للتدقيق.
> اختبارات للتجاوزات ومحاولات إعادة استخدام الموافقات.
>
> معيار القبول: كل انتقال حساس يخضع لسياسة صلاحيات صريحة وقابلة للاختبار.

## What Was Delivered

### I1. ApprovalPolicy (`src/governed-evolution/approval-policy.ts`)

Extends the existing `GovernedRules` with explicit authority sets and ordered approval chains.

Key fields:
- `proposerAuthorities` — explicit set of actors who can propose
- `reviewerAuthorities` — explicit set of actors who can request review
- `approverAuthorities` — explicit set of actors who can approve
- `requireOrderedReviewers` — if true, reviewers MUST approve in the declared order
- `orderedReviewerChain` — the ordered list of reviewer authorities
- `requireThreeWaySeparation` — if true, proposer ≠ reviewer ≠ approver (stricter than `requireSeparationOfDuties`)

Authority check functions:
- `checkProposerAuthority(policy, actor)` — returns `allowed` or `denied` with `not_in_proposer_authorities`
- `checkReviewerAuthority(policy, actor)` — returns `allowed` or `denied` with `not_in_reviewer_authorities`
- `checkApproverAuthority(policy, actor, proposedBy)` — returns `allowed` or `denied` with `not_in_approver_authorities` or `proposer_cannot_approve_own`
- `checkOrderedChainPosition(policy, reviewer, approversSoFar)` — returns `allowed` or `denied` with `out_of_order_approval` or `missing_predecessor_approval`

The `isAuthorityDenied()` type guard narrows the result type for safe access to `violation` and `reason`.

### I2. AuthorityViolationError (`src/core/errors.ts`)

A new structured error type with a stable code (`NEMONS_AUTHORITY_VIOLATION`). Carries the `violation` field (e.g., `"proposer_cannot_approve_own"`, `"not_in_approver_authorities"`) so callers can switch on the specific violation kind.

### I3. PolicyEnforcedEngine (`src/governed-evolution/policy-enforced-engine.ts`)

Wraps the existing `GovernedEvolutionEngine` with authority checks at every sensitive transition:
- `proposePolicyEnforced()` — checks proposer authority
- `requestReviewPolicyEnforced()` — checks reviewer authority
- `tryApprovePolicyEnforced()` — checks approver authority + separation of duties + ordered chain + duplicate prevention
- `trySupersedePolicyEnforced()` — checks approver authority
- `rollbackPolicyEnforced()` — checks approver authority

Every authority check is recorded in the DecisionLog. Rejections include the specific violation kind in the reason.

The wrapper is NON-DESTRUCTIVE: the underlying engine remains usable directly.

### I4. Approval Reuse Prevention

The PolicyEnforcedEngine tracks approvers per candidate (`approversByCandidate` map). An approver's signature is bound to the **candidate id**, NOT the asset. A re-proposed candidate (new id) starts with an empty approvers list — previous approvals do NOT carry over.

CRITICAL FIX: approvers are recorded EVEN when the governed rules deny (e.g., insufficient reviewers). This is essential for ordered chains: the next reviewer needs to see that the predecessor approved, even if the candidate hasn't reached the minimum threshold yet.

### I5. Bypass Attempt Prevention

The PolicyEnforcedEngine explicitly tests and rejects:
- A proposer trying to approve their own candidate (`proposer_cannot_approve_own`)
- A reviewer approving twice (`duplicate_approval`)
- An out-of-order approval (`out_of_order_approval` / `missing_predecessor_approval`)
- An unauthorized actor attempting any operation (`not_in_proposer_authorities` / `not_in_reviewer_authorities` / `not_in_approver_authorities`)

All bypass attempts are recorded in the DecisionLog with the specific violation kind.

## Tests Delivered

| Test file | Tests | Status |
|-----------|-------|--------|
| `tests/governed-evolution/policy-enforced-engine.test.ts` | 28 | ✅ |
| **Stage I subtotal** | **28** | ✅ |

Cumulative totals:

| Stage | Tests | Status |
|-------|-------|--------|
| Stage 0 (Core) | 277 | ✅ |
| Stage B (Contract Integrity) | 304 | ✅ |
| Stage D (Evidence-to-Experience) | 92 | ✅ |
| Stage E (Persistent Storage) | 38 | ✅ |
| Stage F (Governed Evolution) | 86 | ✅ |
| Extensions (PersistentCandidateStore + CandidateGenerator) | 44 | ✅ |
| Stage G (Persistent Run + Evidence + CrossReferenceChecker) | 49 | ✅ |
| Stage H (Conflict Resolution) | 46 | ✅ |
| Stage I (Approval Policies) | 28 | ✅ |
| **Cumulative total** | **964** | ✅ |

## Architectural Invariants Verified by Tests

1. **"Separation of duties"** — `Stage I — PolicyEnforcedEngine > PE6 + BY1: denied with proposer_cannot_approve_own (bypass attempt)` proves a proposer cannot approve their own candidate.

2. **"Multi-stage reviews"** — `Stage I — PolicyEnforcedEngine > PE9: allows in-order approval (security → domain → owner)` proves the ordered chain works when reviewers approve in order.

3. **"Out-of-order rejection"** — `Stage I — PolicyEnforcedEngine > PE8 + BY3: denies out-of-order approval (domain before security)` proves the chain rejects out-of-order approvals.

4. **"Missing predecessor rejection"** — `Stage I — checkOrderedChainPosition > AP8: denied with missing_predecessor_approval` proves the chain rejects approvals when a predecessor hasn't approved yet.

5. **"Duplicate approval prevention"** — `Stage I — PolicyEnforcedEngine > PE7 + BY2: denies duplicate approval (same approver twice)` proves an approver cannot approve the same candidate twice.

6. **"Authority checks"** — `Stage I — PolicyEnforcedEngine > PE2 + BY4: denied with unauthorized proposer` proves unauthorized actors are rejected at every transition.

7. **"Auditable decisions"** — `Stage I — PolicyEnforcedEngine > PE11: all authority rejections are recorded in the DecisionLog` proves every rejection is recorded with the violation kind in the reason.

8. **"No approval reuse"** — `Stage I — PolicyEnforcedEngine > RE1: a re-proposed candidate (new id) requires fresh approval` proves an approver's signature is bound to the candidate id, not the asset.

9. **"Approval bound to candidate id"** — `Stage I — PolicyEnforcedEngine > RE2: an approver's signature is bound to the candidate id, not the asset` proves a new candidate allows fresh approval even from the same approver.

10. **"Rollback authority"** — `Stage I — PolicyEnforcedEngine > PE10: rollbackPolicyEnforced authority` proves rollback operations are also subject to authority checks.

## Exit Condition Status

> معيار القبول: كل انتقال حساس يخضع لسياسة صلاحيات صريحة وقابلة للاختبار.

✅ **MET.** Every sensitive transition (propose, requestReview, tryApprove, supersede, rollback) is subject to explicit authority policies. Every bypass attempt is rejected and recorded in the DecisionLog with the specific violation kind.

## Bug Found and Fixed

**Bug:** When the governed rules denied an approval (e.g., insufficient reviewers), the PolicyEnforcedEngine did NOT record the approver in `approversByCandidate`. This broke the ordered chain: the next reviewer couldn't see that the predecessor had approved.

**Fix:** Record the approver ALWAYS — even when the governed rules deny. The approver's signature is valid; the candidate just hasn't reached the minimum threshold yet. This is critical for ordered chains.

## What Was NOT Delivered (Deferred)

1. **Persistent DecisionLog.** The in-memory log does not survive restart. A persistent version would wrap a `PersistentStore<DecisionLogEntry>`.
2. **Dynamic policy changes.** The policy is set at construction time. Dynamic policy changes (e.g., "increase minimumReviewers from 1 to 3 for high-risk assets") are deferred.
3. **Policy versioning.** When a policy changes, existing candidates may have been approved under the old policy. Versioning the policy and tracking which version applied to which candidate is deferred.
4. **External identity provider integration.** Authority sets are string-based; integration with external identity providers (e.g., OAuth, SAML) is deferred.
5. **Approval delegation.** An approver delegating their authority to another actor is deferred.

## Compliance

- All Stage I tests are in `tests/governed-evolution/policy-enforced-engine.test.ts`.
- `npm run typecheck` clean.
- `npm run build` clean.
- `npm test` → 964 / 964 tests passing.
- ADRs 0003 (Hard-Deny), 0004 (Evidence-before-claims), 0005 (Lifecycle-as-approval) are enforced by Stage I tests.

## Current Repository HEAD

```
4da2e6ea977fac7c057f3529c073d3af71987da7
```

---

# Project Complete — All Stages of the Expansion Map

The Nemons `@nemons/core` project has now completed ALL stages of the user's expansion map:

| Stage | Description | Tests | Status |
|-------|-------------|-------|--------|
| A | State Verification | — | ✅ |
| 0 | Core Foundation | 277 | ✅ |
| B | Contract Integrity | 304 | ✅ |
| C | Approved Harness Boundary | — | ⏸️ Requires owner authorization |
| D | Evidence-to-Experience | 92 | ✅ |
| E | Persistent Storage | 38 | ✅ |
| F | Governed Evolution | 86 | ✅ |
| Extensions | PersistentCandidateStore + CandidateGenerator | 44 | ✅ |
| G | Persistent Run + Evidence | 49 | ✅ |
| H | Conflict Resolution | 46 | ✅ |
| I | Approval Policies | 28 | ✅ |
| **Cumulative total** | | **964** | ✅ |

The only remaining stage is **Stage C (Approved Harness Boundary)**, which requires explicit owner authorization for real-harness execution and cannot be completed autonomously.
