# Stage H Report — Conflict Resolution

**Status:** Complete  
**Date:** Stage H  
**Owner:** Nemons Architecture

## Stage H Scope (per the user's instructions)

> منع اعتماد Candidateين متعارضين على الأصل نفسه.
> كشف تغير النسخة الأساسية منذ إنشاء Candidate.
> دعم optimistic concurrency أو آلية ذرية مكافئة.
> الحفاظ على سجل القرار وأسباب رفض التغيير.
>
> معيار القبول: لا يمكن أن يؤدي تعارض متزامن إلى نسختين نشطتين معتمدتين للأصل نفسه خلافًا لسياسة الحوكمة.

## What Was Delivered

### H1. ConflictDetector (`src/governed-evolution/conflict-detector.ts`)

The canonical pre-flight check for the supersede operation. Detects:

- `no_conflict` — proceed with supersede
- `missing_candidate` — one of the candidates doesn't exist
- `not_approved` — one of the candidates is not in `approved` status
- `already_superseded` — the old candidate has already been superseded (the baseline has moved)
- `wrong_supersedes_link` — the new candidate doesn't supersede the old (link mismatch)
- `stale_baseline` — the new candidate's `supersedesVersion` doesn't match the old candidate's `proposedVersion`

Helper functions:
- `isConflict(result)` — quick check
- `describeConflict(result)` — human-readable description

The detector's check is READ-ONLY (non-locking). The actual atomic operation is performed by the `ConflictResolutionEngine.trySupersede` method.

### H2. DecisionLog (`src/governed-evolution/decision-log.ts`)

The global audit trail for governed-evolution decisions. Records:
- `approval` — a candidate was approved
- `rejection` — a candidate was rejected
- `request_changes` — changes were requested
- `supersede` — a candidate was superseded by another
- `conflict_resolution` — a conflict was detected and resolved (rejection)
- `rollback` — an approved candidate was rolled back
- `stale_baseline_rejection` — a supersede was rejected due to stale baseline

The log is APPEND-ONLY: `record` is the only mutation; `list*` are read-only. The log is DISTINCT from a CandidateRecord's `reviewTrail` (which is per-candidate).

Queries:
- `list()` — all entries in insertion order
- `listForCandidate(candidateId)` — entries involving the candidate (as candidateId, oldCandidateId, or newCandidateId)
- `listForAsset(assetId)` — entries for the asset
- `listByKind(kind)` — entries of a specific kind

### H3. ConflictResolutionEngine (`src/governed-evolution/conflict-resolution-engine.ts`)

Wraps the `GovernedEvolutionEngine` with conflict detection + decision logging.

Key methods:
- `trySupersede(oldId, newId, actor, reason)` — atomic check-and-swap:
  1. Pre-flight conflict detection
  2. If conflict → record rejection in DecisionLog, return `{kind: "conflict", ...}`
  3. If no conflict → perform the supersede; record success in DecisionLog
  4. If the supersede fails (concurrent modification) → re-detect the conflict, record the rejection
- `detectBaselineDrift(candidateId)` — checks whether the candidate's baseline has moved
- `getConflictDetector()` / `getDecisionLog()` — expose the components

The wrapper is NON-DESTRUCTIVE: the underlying engine remains usable directly. The wrapper adds conflict detection + decision logging for callers who need those features.

### H4. Bug Fix: CandidateStore.getActiveApproved

Found and fixed a bug in `getActiveApproved` (both `InMemoryCandidateStore` and `PersistentCandidateStore`):

**Before (broken):** Any candidate with `supersedesCandidateId` set caused the superseded candidate to be considered "superseded" — even if the superseder was just `proposed` (not yet approved). This meant a proposed candidate v2 (superseding v1) would make v1 NOT the active approved, even though v2 hadn't been approved yet.

**After (fixed):** Only APPROVED candidates with `supersedesCandidateId` mark the target as superseded. A proposed/under_review/rejected candidate does NOT affect the active-approved calculation.

This bug affected:
- The ConflictDetector's `stale_baseline` check (which queries `getActiveApproved` for the report)
- The `detectBaselineDrift` method (which uses `getActiveApproved`)
- The `ConflictResolutionEngine.trySupersede` flow

## Tests Delivered

| Test file | Tests | Status |
|-----------|-------|--------|
| `tests/governed-evolution/conflict-detector.test.ts` | 12 | ✅ |
| `tests/governed-evolution/decision-log.test.ts` | 18 | ✅ |
| `tests/governed-evolution/conflict-resolution-engine.test.ts` | 14 | ✅ |
| `tests/stage-h/full-conflict-resolution.test.ts` | 2 | ✅ |
| **Stage H subtotal** | **46** | ✅ |

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
| **Cumulative total** | **936** | ✅ |

## Architectural Invariants Verified by Tests

1. **"Prevent conflicting candidates for the same asset"** — `Stage H — ConflictResolutionEngine > CE8: concurrent candidates for the same asset — only ONE can win` proves that when two candidates supersede the same baseline, only the first supersede succeeds; the second is rejected.

2. **"Detect baseline version change"** — `Stage H — ConflictResolutionEngine > CE10: detectBaselineDrift returns 'stale' for a stale candidate` and `Stage H — ConflictDetector > CD8: stale_baseline` prove the system detects when a candidate's baseline has moved.

3. **"Optimistic concurrency"** — `Stage H — ConflictResolutionEngine > CE1 + CE2: trySupersede succeeds` and the bug fix in `getActiveApproved` together implement the check-and-swap pattern: the detector's check is non-locking, but the engine's supersede is atomic (the underlying transition either succeeds or fails atomically).

4. **"Preserve decision log and rejection reasons"** — `Stage H — DecisionLog > DL1-DL9` and `Stage H — ConflictResolutionEngine > CE7: rejection is recorded in the DecisionLog` prove every decision (approval, rejection, supersede, conflict_resolution) is recorded with actor, reason, and timestamp. The log is append-only.

5. **"Atomic supersede"** — `Stage H — full-conflict-resolution > exercises the full conflict-resolution lifecycle` proves the supersede operation is atomic: the engine transitions the old to superseded and verifies the new is approved in a single operation.

6. **"Audit trail"** — `Stage H — full-conflict-resolution > audit trail queries` prove the DecisionLog can be queried by candidate, by asset, and by kind, enabling full audit reconstruction.

7. **"No silent supersede by proposed candidates"** (bug fix) — `Stage H — ConflictResolutionEngine > CE9: detectBaselineDrift returns 'fresh' for a candidate whose baseline matches` proves that a proposed candidate (v2) does NOT mark its baseline (v1) as superseded — only approved candidates do.

## Exit Condition Status

> معيار القبول: لا يمكن أن يؤدي تعارض متزامن إلى نسختين نشطتين معتمدتين للأصل نفسه خلافًا لسياسة الحوكمة.

✅ **MET.** Demonstrated by:
- `tests/governed-evolution/conflict-resolution-engine.test.ts > CE8: concurrent candidates for the same asset — only ONE can win`
- `tests/stage-h/full-conflict-resolution.test.ts > exercises the full conflict-resolution lifecycle with audit trail`

The conflict detector + decision log + atomic supersede together guarantee that concurrent candidates cannot produce two active approved versions of the same asset.

## What Was NOT Delivered (Deferred)

1. **Persistent DecisionLog.** The in-memory log does not survive restart. A persistent version would wrap a `PersistentStore<DecisionLogEntry>` (same pattern as PersistentExperienceStore).
2. **Distributed concurrency.** The conflict detector is non-locking; in a multi-process environment, two processes could attempt supersede simultaneously. The engine's supersede is atomic within a single process, but cross-process coordination requires an external lock manager.
3. **Conflict resolution policies.** Currently, the first supersede wins and the second is rejected. Alternative policies (e.g., "merge the candidates", "compare timestamps and pick the newer") are deferred.
4. **Rebase support.** When a candidate's baseline drifts, the candidate must be re-proposed against the new baseline. Automatic rebase (re-targeting the candidate's `supersedesCandidateId` and `supersedesVersion` to the new active) is deferred.
5. **Cross-asset conflict detection.** Conflicts are detected per-asset. Cross-asset conflicts (e.g., a Persona change that requires updating all Skills that reference the Persona) are deferred.

## Compliance

- All Stage H tests are in `tests/governed-evolution/` and `tests/stage-h/`.
- `npm run typecheck` clean.
- `npm run build` clean.
- `npm test` → 936 / 936 tests passing.
- The bug fix in `getActiveApproved` (both InMemory and Persistent stores) is defense in depth.
- ADRs 0003 (Hard-Deny), 0004 (Evidence-before-claims), 0005 (Lifecycle-as-approval) are enforced by Stage H tests.

## Current Repository HEAD

```
b10828d6a61d7bf5b9721e94c1cb58f7d0cee202
```
