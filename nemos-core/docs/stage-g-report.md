# Stage G Report — Persistent Run & Evidence

**Status:** Complete  
**Date:** Stage G  
**Owner:** Nemons Architecture

## Stage G Scope (per the user's instructions)

> تخزين سجلات `Run` و`Evidence` واستعادتها بعد إعادة التشغيل.
> ربط كل Evidence بالـ Run والمصدر والـ artifact المناسب.
> كشف السجلات المفقودة أو التالفة.
> الحفاظ على اتساق المراجع بين Run وEvaluation وExperience.
>
> معيار القبول: إعادة التشغيل لا تفقد الأدلة أو تغيّر دلالتها، والسجل غير المكتمل لا يُعامل كنجاح موثّق.

## What Was Delivered

### G1. PersistentRunStore (`src/persistence/persistent-run-store.ts`)

Persists Run records to disk via the FileSystemStore backend.

Key properties:
- `add()` validates the Run + REJECTS a `succeeded` Run with no `evidenceRefs` (encodes "an incomplete record is not a verified success" at the persistence boundary).
- `transition()` enforces the Run state machine (`IllegalRunTransitionError` for forbidden transitions).
- `transition()` to `succeeded` requires evidence references (defense in depth — also enforced by the InMemoryRunManager).
- `recordEvidenceRef()` and `recordEvaluationRef()` append to the Run's references, persisted.
- `getWithStatus()` distinguishes ok / missing / corrupt.
- Quarantine on tampering (via underlying FileSystemStore).

### G2. PersistentEvidenceStore (`src/persistence/persistent-evidence-store.ts`)

Persists Evidence records to disk.

Key properties:
- `add()` validates the Evidence AND verifies the inline-payload content hash at the boundary.
- `get()` returns `undefined` for both missing AND corrupt records; use `getWithStatus()` for the full status.
- `listByRunId(runId)` — the canonical "find all Evidence for Run X" query.
- `listByKind(kind)` — filter by Evidence kind.
- `listVerified()` — only verified Evidence (used by EvaluationEngine).
- `markVerified(id)` — sets `verified=true`; for inline-payload Evidence, verifies the hash before marking (defense in depth). Persisted across restart.
- The `verified` flag is preserved across restart (no silent upgrade).

### G3. CrossReferenceChecker (`src/persistence/cross-reference-checker.ts`)

Verifies that references between persistent records are consistent.

Checks:
- Evidence ↔ Run: every Evidence's `runId` MUST reference an existing (healthy) Run.
- Experience ↔ Run: every Experience's `runId` SHOULD reference an existing Run.
- Experience ↔ Evaluation: every Experience's `evaluationId` SHOULD be in the in-session Evaluation set (Evaluations are in-memory; this check only applies if a session-provided set is passed).
- Candidate ↔ Candidate: every Candidate with `supersedesCandidateId` SHOULD reference an existing Candidate (already enforced by the CandidateStore at add() time, but the checker provides defense in depth).

The checker is non-destructive: it REPORTS orphans but does NOT quarantine or delete them. The caller decides what to do.

Helpers:
- `hasOrphans(report)` — quick "is the chain consistent?" check.
- `summarizeReport(report)` — human-readable summary.

### G4. Full Persistent Runtime (`src/persistence/build-full-persistent-runtime.ts`)

`buildFullPersistentRuntime({ rootDir })` constructs a runtime backed by persistent Run, Evidence, Experience, and Candidate stores. ALL operational knowledge records survive restart.

Directory layout:
```
<rootDir>/
  runs/<id>.json
  evidence/<id>.json
  experiences/<id>.json
  candidates/<id>.json
```

The runtime exposes:
- All base runtime components (policyEngine, adapterRegistry, runManager, evidenceCollector, evidenceValidator, evaluationEngine, experienceDeriver).
- Four persistent stores (persistentRunStore, persistentEvidenceStore, persistentExperienceStore, persistentCandidateStore).
- `crossReferenceChecker` — ready to use.

### G5. Bug Fix: FileSystemStore.computeHash

Found and fixed a CRITICAL bug in `FileSystemStore.computeHash`:

**Before (broken):** `JSON.stringify(record, Object.keys(record).sort())` — the replacer array only includes the top-level keys; nested objects were serialized as `{}` (empty). The hash did NOT capture nested content, so tampering of nested fields (e.g., `inputs.taskDescription` in a Run) was NOT detected.

**After (fixed):** Recursive `canonicalizeForHash(value)` that sorts ALL keys (top-level + nested). Arrays are traversed (array order preserved). The hash now captures the FULL content of the record.

This bug affected ALL persistent stores. The fix:
- Detects tampering at any depth (previously: only top-level fields).
- All existing tests still pass (the canonical form is deterministic).
- The fix is in `fs-json-store.ts` and applies to every `PersistentStore<T>` implementation.

## Tests Delivered

| Test file | Tests | Status |
|-----------|-------|--------|
| `tests/persistence/persistent-run-store.test.ts` | 17 | ✅ |
| `tests/persistence/persistent-evidence-store.test.ts` | 15 | ✅ |
| `tests/persistence/cross-reference-checker.test.ts` | 14 | ✅ |
| `tests/stage-g/full-chain-integration.test.ts` | 3 | ✅ |
| **Stage G subtotal** | **49** | ✅ |

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
| **Cumulative total** | **890** | ✅ |

## Architectural Invariants Verified by Tests

1. **"Records survive restart"** — `Stage G — PersistentRunStore > PR2` and `PersistentEvidenceStore > PE2` prove records survive restart with state, content hash, and `verified` flag preserved.

2. **"Reference consistency"** — `Stage G — CrossReferenceChecker > XC4 + XC5 + XC6` prove the checker detects orphaned Evidence (missing Run), orphaned Experience (missing Run), and orphaned Candidate (missing supersedesCandidateId).

3. **"An incomplete record is not a verified success"** — `Stage G — PersistentRunStore > PR5: add REJECTS a 'succeeded' Run with no evidenceRefs` and `PR6: transition REJECTS to 'succeeded' without evidenceRefs` prove the persistence layer enforces this at the boundary.

4. **"Evidence before claims"** — `Stage G — PersistentEvidenceStore > PE3 + PE4` prove tampered Evidence (content hash mismatch) is detected as corrupt and quarantined.

5. **"No silent mutation on read"** — `Stage G — PersistentEvidenceStore > PE13` proves the `verified` flag is preserved across restart; an unverified Evidence stays unverified.

6. **"Tampering detection at any depth"** — The bug fix in `FileSystemStore.computeHash` ensures that tampering of ANY field (top-level or nested) is detected via content hash mismatch. Verified by `Stage G — PersistentRunStore > PR4` (tampered `inputs.taskDescription`).

7. **"Cross-references can be reconstructed after restart"** — `Stage G — full-chain-integration > Run A's full chain survives restart with all references intact` proves that after restart, the CrossReferenceChecker finds no orphans across Run, Evidence, and Experience stores.

8. **"markVerified persists across restart"** — `Stage G — PersistentEvidenceStore > PE9` proves that the `verified=true` flag set via `markVerified()` survives restart.

9. **"Health check reports corrupt records"** — `Stage G — PersistentRunStore > PR13` and `PersistentEvidenceStore > PE12` prove the health check identifies and quarantines corrupt records.

10. **"Defense in depth"** — Evidence's `verified` flag is checked twice: once when set via `markVerified()` (which verifies the inline-payload hash), and once on read via `evidenceValidator`. Tampering of either the flag or the payload is caught.

## Exit Condition Status

> معيار القبول: إعادة التشغيل لا تفقد الأدلة أو تغيّر دلالتها، والسجل غير المكتمل لا يُعامل كنجاح موثّق.

✅ **MET.** Demonstrated by:
- `tests/stage-g/full-chain-integration.test.ts > Run A's full chain survives restart with all references intact`
- `tests/persistence/persistent-run-store.test.ts > PR5 + PR6`
- `tests/persistence/persistent-evidence-store.test.ts > PE3 + PE4 + PE13`
- `tests/persistence/cross-reference-checker.test.ts > XC4 + XC5 + XC6`

The bug fix in `FileSystemStore.computeHash` is a critical enabler: without it, tampering of nested fields would have gone undetected, violating the "evidence doesn't change semantics" requirement.

## What Was NOT Delivered (Deferred)

1. **Persistent Evaluation store.** Evaluations are in-memory (per-Run computations). The CrossReferenceChecker accepts an in-session Evaluation id set for the Experience ↔ Evaluation check; a persistent Evaluation store would require additional design (Evaluation lifecycle, re-evaluation across runs, etc.).
2. **Cross-store transactions.** Adding a Run + its Evidence is not atomic. A crash mid-add could leave a Run without its Evidence (or vice versa). The CrossReferenceChecker detects this as an orphan, but doesn't prevent it. True atomicity requires a transactional backend (SQLite, etc.).
3. **Live in-memory RunManager integration.** The InMemoryRunManager remains the live runtime; the PersistentRunStore is the durable archive. A "live + persistent" RunManager that auto-archives on every transition is a future enhancement (the current pattern is: explicit `add()` calls at checkpoints).
4. **Notification system.** The CrossReferenceChecker is poll-based; no event/webhook when orphans are detected.
5. **Automatic orphan recovery.** The checker reports orphans but does NOT quarantine or delete them. Automatic recovery (e.g., "if Evidence's runId is missing, also quarantine the Evidence") is deferred.

## Compliance

- All Stage G tests are in `tests/persistence/` and `tests/stage-g/`.
- `npm run typecheck` clean.
- `npm run build` clean.
- `npm test` → 890 / 890 tests passing.
- The bug fix in `FileSystemStore.computeHash` improves tampering detection for ALL persistent stores, not just Stage G additions.
- ADRs 0003 (Hard-Deny), 0004 (Evidence-before-claims), 0005 (Lifecycle-as-approval) are enforced by Stage G tests.

## Current Repository HEAD

```
3fcad27814add82666f985a50c08f68ef6616b92
```

(The repository is at this commit after Stage G completion. Note: this is the HEAD of the local working repository; the user can verify by running `git rev-parse HEAD`.)
