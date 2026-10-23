# Stage D Report — Evidence-to-Experience Lifecycle

**Status:** Complete  
**Date:** Stage D  
**Owner:** Nemons Architecture

## Stage D Scope (per the Project Brief)

Stage D completes the path from execution trace to evidence, evaluation, structured Experience, and reuse in a later Run.

> Exit condition: A controlled scenario demonstrates that evidence-backed Experience can be reused without losing provenance or approval status.

## What Was Delivered

### D1. ExperienceDeriver (`src/experience/experience-deriver.ts`)

Produces a structured Experience from Evidence + Evaluation.

Key invariants enforced:
- Throws `InsufficientEvidenceError` if the Evaluation is NOT `verified_succeeded` (encodes "Evidence before claims" at the derivation level).
- Throws `ContractValidationError` if the Evaluation's runId does not match the Run's id (defense in depth).
- Throws `InsufficientEvidenceError` if no Evidence is provided.
- The derived Experience starts with `provenance.kind = "observed"` (no silent promotion — encodes "No silent mutation").
- The provenance source is `evidence`-kind, referencing the first Evidence's id (preserves the origin chain).
- Default reusability is `conditionally_reusable` (safe default — must be approved before unconditional reuse).
- Applicability defaults are derived from the Run's task kind, tags, and repository.

### D2. ExperienceStore (`src/experience/experience-store.ts`)

In-memory store for Experience records.

Key invariants enforced:
- `add()` rejects non-observed Experiences (new records MUST start as `observed`; promotion is the only way to change kind).
- `add()` rejects duplicate ids.
- `add()` re-validates the Experience structurally (defense in depth at the boundary).
- `promote()` is the ONLY sanctioned way to change a lifecycle kind. It uses `transitionProvenance()` (enforces the lifecycle state machine).
- The review trail is append-only (via `transitionProvenance`).
- The store returns DEFENSIVE COPIES from `get()` and `list()` — external mutation does NOT corrupt the store.
- `isExperienceApprovedInStore()` is the canonical check for approval.

### D3. ExperienceRetriever (`src/experience/experience-retriever.ts`)

Finds applicable Experience records for a new Run.

Key invariants enforced:
- "Retrieved is not approved" — retrieval preserves the provenance kind; the retriever records this in the result metadata.
- Excludes deprecated Experiences (terminal — cannot be used).
- Excludes `not_reusable` Experiences (recorded for audit, not for reuse).
- Excludes non-applicable Experiences (taskKind, taskTag, repoPattern, adapterKind mismatches).
- Applicability matching mirrors the ContextResolver's logic (consistency).

### D4. Experience-to-Memory bridge (`src/experience/experience-memory-bridge.ts`)

Materializes an Experience as a MemoryRecord of kind "experience" so it can be included in a Context Pack.

Key invariants enforced:
- "Retrieved is not approved" — the bridge preserves the Experience's provenance kind; no silent upgrade.
- "No silent mutation" — the bridge produces a NEW MemoryRecord; does NOT modify the source Experience.
- The MemoryRecord references the source Experience via `derivedFromExperienceId` (preserves traceability).
- The MemoryRecord references the source Run via `derivedFromRunId` (preserves the origin chain).
- The bridge REJECTS deprecated Experiences (cannot be materialized for Context Pack inclusion).
- `experiencesToMemoryRecords()` silently skips deprecated records (the retriever already excludes them; the bridge is defensive).

### D5. Governed Evolution interface (`ExperienceStore.promote()`)

Minimal governed-evolution surface:
- `promote(id, toKind, reviewEntry)` advances an Experience through the lifecycle (observed → reviewed → approved → deprecated).
- Enforces the lifecycle state machine (forbidden transitions throw `LifecycleViolationError`).
- The review trail is append-only (each promotion adds exactly one entry).
- The reviewEntry records who/what/when/why (full audit trail).

Full Stage F (candidate generation, multi-step review workflows, rollback) is deferred.

### D6. Runtime wiring (`src/runtime.ts`)

`buildRuntime()` now returns a runtime with three additional components:
- `experienceStore: ExperienceStore`
- `experienceDeriver: ExperienceDeriver`
- `experienceRetriever: ExperienceRetriever`

These are composed alongside the existing components (policyEngine, adapterRegistry, runManager, evidenceCollector, evidenceValidator, evaluationEngine).

## Tests Delivered

| Test file | Tests | Status |
|-----------|-------|--------|
| `tests/experience/experience-deriver.test.ts` | 20 | ✅ |
| `tests/experience/experience-store.test.ts` | 27 | ✅ |
| `tests/experience/experience-retriever.test.ts` | 16 | ✅ |
| `tests/experience/experience-memory-bridge.test.ts` | 21 | ✅ |
| `tests/stage-d/full-lifecycle.test.ts` | 4 | ✅ |
| `tests/stage-d/wired-runtime.test.ts` | 4 | ✅ |
| **Stage D subtotal** | **92** | ✅ |

Plus the cumulative totals:

| Stage | Tests | Status |
|-------|-------|--------|
| Stage 0 (Core) | 277 | ✅ |
| Stage B (Contract Integrity) | 304 | ✅ |
| Stage D (Evidence-to-Experience) | 92 | ✅ |
| **Cumulative total** | **673** | ✅ |

## Architectural Invariants Verified by Tests

1. **"Evidence before claims"** — `ExperienceDeriver` throws when the Evaluation is not `verified_succeeded` (D-test: "deriving an Experience from a non-verified Evaluation FAILS").
2. **"No silent mutation"** — Derived Experiences start as `observed`; promotion is the only way to change kind (`Stage D — ExperienceStore > S2: rejects non-observed Experience`).
3. **"Retrieved is not approved"** — `ExperienceRetriever` preserves provenance kind; no silent upgrade on retrieval (`Stage D — ExperienceRetriever > R8`).
4. **"Use is not adoption"** — An approved Experience becomes a MemoryRecord only after governed promotion; an observed Experience retrieved stays observed (`Stage D — wired-runtime > architectural invariants`).
5. **Lifecycle state machine** — Forbidden transitions throw `LifecycleViolationError` (`Stage D — ExperienceStore > S10`).
6. **Append-only review trail** — Each promotion adds exactly one entry (`Stage D — ExperienceStore > S12`).
7. **Defense in depth** — Store re-validates on `add()`; retriever returns defensive copies; bridge rejects deprecated records.
8. **Full chain traceability** — Run A → Evidence → Evaluation → Experience → Memory → Run B's Context Pack, with provenance preserved at every step (`Stage D — wired-runtime > Run A → Experience → Run B`).

## Exit Condition Status (per Project Brief)

> "A controlled scenario demonstrates that evidence-backed Experience can be reused without losing provenance or approval status."

✅ **MET.** The `tests/stage-d/wired-runtime.test.ts > Run A → Experience → Run B (Context Pack includes Experience)` test demonstrates:
- Run A produces verified-succeeded Evidence + Evaluation.
- An Experience is derived (starting as `observed`).
- The Experience is promoted (observed → reviewed → approved) via governed review.
- The approved Experience is retrieved for Run B.
- The Experience is bridged to a MemoryRecord (provenance preserved as `approved`).
- The MemoryRecord is included in Run B's Context Pack.
- Provenance and approval status are preserved at every step.

**Stage D exit condition: MET.**

## What Was NOT Delivered (Deferred)

1. **Persistence (Stage E).** All Experience records are in-memory; the store does not survive restart. Stage E introduces persistence with integrity + access boundaries.
2. **Full Stage F Governed Evolution.** Candidate generation, multi-step review workflows, versioning, and rollback are deferred. The minimal `promote()` interface satisfies Stage D needs.
3. **Real adapter integration (Stage C).** The MockAdapter remains the only registered adapter. Stage C authorization is required before real-harness execution.
4. **Cross-Run Memory store.** Stage E will introduce a persistent Memory store; for Stage D, Experience records are the persistent operational knowledge.
5. **Experience versioning.** When an Experience is superseded, the current approach deprecates the old one. Version chains (explicit version relationships) are deferred to Stage F.

## Recommendations for Stage E Preparation

1. **Define the persistence boundary.** Decide between file-system JSON, SQLite, or a pluggable storage interface.
2. **Define integrity guarantees.** Content hashes on stored records; verification on load.
3. **Define access boundaries.** Per-record access control; who can read which records.
4. **Define recovery behavior.** What happens when a stored record fails validation on load (reject? quarantine? repair?).
5. **Define the persistence contract surface.** The persistent store should satisfy the same `ExperienceStore` interface (so tests transfer).

## Compliance

- All Stage D tests are in `tests/experience/` and `tests/stage-d/`.
- `npm run typecheck` clean.
- `npm run build` clean.
- `npm test` → 673 / 673 tests passing.
- The Hard-Deny ADR (0003), Evidence-before-claims ADR (0004), and Lifecycle-as-approval ADR (0005) are enforced by Stage D tests.
