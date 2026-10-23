# Stage E Report — Persistent Storage and Retrieval

**Status:** Complete  
**Date:** Stage E  
**Owner:** Nemons Architecture

## Stage E Scope (per the Project Brief)

> Introduce persistence only after the record contracts, integrity requirements, access boundaries, and recovery behavior are explicit.
> Exit condition: Records survive restart and can be retrieved and verified without silently changing their trust status.

## What Was Delivered

### E1. Persistence contract (`src/persistence/persistence-contract.ts`)

The generic `PersistentStore<T>` interface — backend-agnostic, parameterized by record type.

Key contracts:
- `add(record)` — writes a record with a content hash; returns the persisted envelope.
- `get(id)` — returns `LoadResult<T>` distinguishing ok / missing / corrupt.
- `list()` — returns healthy records only (corrupt excluded).
- `delete(id)` — removes a record (not quarantined ones).
- `healthCheck()` — runs a full sweep; quarantines corrupt records.
- `listQuarantine()` — returns quarantined records with reasons.
- `purgeQuarantine()` — permanently removes quarantined records (returns count).
- `size()` — count of healthy records.

The `LoadResult` discriminated union is the key safety mechanism: callers MUST distinguish ok / missing / corrupt; corrupt records are never silently returned.

### E2. FileSystemStore (`src/persistence/fs-json-store.ts`)

The canonical in-process implementation of `PersistentStore<T>`. Stores each record as a JSON file.

Key properties:
- **Atomic writes**: writes go to a temp file first, then rename. A crash mid-write does not corrupt the existing record.
- **Content hash**: each record is wrapped in a `PersistedEnvelope` with a SHA-256 content hash. Verified on read.
- **Quarantine directory**: corrupt records (hash mismatch or schema validation failure) are moved to `<root>/quarantine/<id>.json` with a `<id>.reason` file recording why.
- **Sanitized filenames**: ids with special characters are sanitized for filesystem safety.
- **Idempotent initialization**: `initialize()` can be called multiple times.
- **Quarantine index**: in-memory map tracks quarantined records so `listQuarantine()` doesn't re-scan the directory.

Directory layout:
```
<root>/
  records/<id>.json       — healthy records (PersistedEnvelope format)
  quarantine/<id>.json    — quarantined record content
  quarantine/<id>.reason  — text file: timestamp + reason
```

### E3. PersistentExperienceStore (`src/persistence/persistent-experience-store.ts`)

Wraps a `PersistentStore<Experience>` to provide the same surface as `InMemoryExperienceStore` — drop-in replacement.

Key properties:
- `add()` rejects non-observed Experiences (new records MUST start as `observed`; promotion is the only way to change kind).
- `promote()` is the ONLY sanctioned way to change lifecycle kind. It enforces the lifecycle state machine (forbidden transitions throw `LifecycleViolationError`).
- `get()` returns `undefined` for both missing AND corrupt records (the simple interface); use `getWithStatus()` for the full status (ok / missing / corrupt).
- `list()` returns healthy records only.
- `healthCheck()` runs a sweep and quarantines corrupt records.
- `listQuarantine()` and `purgeQuarantine()` exposed.

The wrapper preserves all invariants from `InMemoryExperienceStore` (lifecycle, append-only trail, defense in depth).

### E4. Health Check

`FileSystemStore.healthCheck()` runs a full sweep:
- Lists every record in `records/`.
- For each: read + verify hash + validate schema.
- Healthy records stay in `records/`.
- Corrupt records are moved to `quarantine/`.
- Returns a `HealthCheckReport` (totalRecords, healthy, corrupt, missing).

Optional `healthCheckOnStartup` runs the sweep during `initialize()` — useful for production to detect corruption at startup.

### E5. buildPersistentRuntime (`src/persistence/build-persistent-runtime.ts`)

Constructs a Nemons runtime backed by a persistent `ExperienceStore`. Other components (PolicyEngine, RunManager, EvidenceCollector, EvidenceValidator, EvaluationEngine, ExperienceDeriver, ExperienceRetriever) remain in-memory — they're stateless or per-Run.

Key properties:
- Returns a `PersistentNemonsRuntime` with `experienceStore: PersistentExperienceStore`.
- `initialize()` MUST be called before any Experience-related operation.
- Optional `healthCheckOnStartup` runs the sweep during initialization.

## Tests Delivered

| Test file | Tests | Status |
|-----------|-------|--------|
| `tests/persistence/fs-json-store.test.ts` | 17 | ✅ |
| `tests/persistence/persistent-experience-store.test.ts` | 14 | ✅ |
| `tests/stage-e/wired-persistent-runtime.test.ts` | 7 | ✅ |
| **Stage E subtotal** | **38** | ✅ |

Cumulative totals:

| Stage | Tests | Status |
|-------|-------|--------|
| Stage 0 (Core) | 277 | ✅ |
| Stage B (Contract Integrity) | 304 | ✅ |
| Stage D (Evidence-to-Experience) | 92 | ✅ |
| Stage E (Persistent Storage) | 38 | ✅ |
| **Cumulative total** | **711** | ✅ |

## Architectural Invariants Verified by Tests

1. **"Records survive restart"** — `Stage E — PersistentExperienceStore > P2: records survive restart` and `Stage E — wired-persistent-runtime > Run A's Experience is retrievable after restart by Run B` prove records written by Instance 1 are loaded by Instance 2 at the same persistence location.

2. **"No silent mutation on read"** — `Stage E — PersistentExperienceStore > P9: provenance kind is NOT modified on read` proves an `observed` record on disk stays `observed` when loaded; an `approved` record stays `approved`. No silent upgrade.

3. **"promote persists across restarts"** — `Stage E — PersistentExperienceStore > P3: promote persists the new lifecycle kind across restarts` proves a `promote()` call's effect survives restart.

4. **"Tampering detection"** — `Stage E — PersistentExperienceStore > P4: tampered Experience is detected as corrupt` proves a tampered file (modified content but old hash) produces a `corrupt` load result.

5. **"Quarantine, not silent drop"** — `Stage E — FileSystemStore > F4: corrupt records are quarantined (not silently dropped)` proves corrupt records are moved to `quarantine/` and reported via `listQuarantine()`.

6. **"Schema validation on read"** — `Stage E — FileSystemStore > F10: schema validation failures on read produce corrupt` proves records that pass the hash check but fail the validator are still caught.

7. **"Atomic writes"** — `Stage E — FileSystemStore > F9: atomic writes` proves the temp file is cleaned up after a successful write; no `.tmp-*` files leak.

8. **"Startup health check"** — `Stage E — wired-persistent-runtime > a tampered record is quarantined on Instance 2 startup healthCheck` proves `healthCheckOnStartup=true` quarantines corrupt records at initialization.

9. **"Lifecycle state machine preserved"** — `Stage E — PersistentExperienceStore > P7: promote rejects forbidden transitions` proves the lifecycle state machine is enforced by the persistent store.

10. **"Full chain across restarts"** — `Stage E — wired-persistent-runtime > Run A → restart → Run B retrieves` proves the full chain: Run A produces Experience → promote → restart → Run B's Context Pack includes the Experience-Memory → Run B executes.

## Exit Condition Status (per Project Brief)

> "Records survive restart and can be retrieved and verified without silently changing their trust status."

✅ **MET.** Demonstrated by:
- `tests/stage-e/wired-persistent-runtime.test.ts > Run A → restart → Run B retrieves`
- `tests/persistence/persistent-experience-store.test.ts > P2 + P3 + P9`

The Experience records written by Instance 1 are loaded by Instance 2 at the same persistence location, with provenance kind, review trail, and content hash all preserved.

**Stage E exit condition: MET.**

## What Was NOT Delivered (Deferred)

1. **Cross-record persistence (Run, Evidence, MemoryRecord).** Stage E focused on Experience persistence (the canonical case). Run and Evidence remain in-memory; their persistence is a Stage E+ extension that uses the same `PersistentStore<T>` interface.
2. **Per-record access control.** The current implementation relies on filesystem permissions; per-record access boundaries are deferred.
3. **Multi-process safety.** The store uses atomic-rename for write safety but does not implement inter-process locking; multiple processes writing to the same root will race.
4. **Pluggable storage backends.** Only `FileSystemStore` is implemented. A SQLite or external-service backend would satisfy the same `PersistentStore<T>` interface (drop-in).
5. **Real-time cache invalidation.** The `SyncExperienceStoreAdapter` provides a sync view of the persistent store for the `DefaultExperienceRetriever`; it requires explicit `refresh()` calls after writes. A watch-based notification mechanism is deferred.
6. **Audit log.** Quarantine entries are stored as files; a structured audit log with timestamp + actor + reason is deferred.

## Recommendations for Stage F Preparation

Stage F (Governed Evolution) introduces:
1. **Candidate generation** — automated proposal of changes to operational assets (Skills, Personas, Knowledge).
2. **Multi-step review workflows** — beyond the simple `promote()` interface; explicit approval chains with multiple reviewers.
3. **Version chains** — explicit version relationships when a candidate supersedes an approved record.
4. **Rollback** — reverting an approved record back to reviewed (with audit).
5. **Stage E persistence for the candidate records** — extend the persistence surface to cover candidate-generation metadata.

The Stage E `PersistentStore<T>` interface is reusable for Stage F: candidate records are just another `T`.

## Compliance

- All Stage E tests are in `tests/persistence/` and `tests/stage-e/`.
- `npm run typecheck` clean.
- `npm run build` clean.
- `npm test` → 711 / 711 tests passing.
- ADRs 0003 (Hard-Deny), 0004 (Evidence-before-claims), 0005 (Lifecycle-as-approval) are enforced by Stage E tests.
