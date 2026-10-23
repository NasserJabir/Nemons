# Stage C Report — Approved Harness Boundary

**Status:** Complete  
**Date:** Stage C (Final Stage)  
**Owner:** Project Owner (explicit authorization granted: "لديك الموافقه")  
**Authorization:** ADR-0006

## Stage C Scope (per the user's instructions)

> اختيار Adapter حقيقي.
> تثبيت هوية الـ fixture والـ baseline.
> اختبار دورة تنفيذ حقيقية بعد موافقتك الصريحة.

## What Was Delivered

### C1. ADR-0006 — Stage C Authorization (`docs/adr/0006-stage-c-authorization.md`)

Documents the owner's explicit authorization for Stage C execution. Defines:
- **Authorized**: local real-harness execution (git, npm test), real git fixture, real Evidence collection, Golden Task execution, adapter conformance.
- **NOT Authorized (deferred)**: external Coding Agent integration (OpenHands, Cezar), LLM-driven code changes, production deployment, network access.

### C2. Real Git Fixture (`scripts/stage-c/setup-fixture.sh`)

A real git repository with:
- `git init` + `git commit` (real git operations)
- A pinned `FIXTURE_SHA` (real git commit hash)
- A math module (`src/math.js`) with an intentional bug: `add()` returns `a - b` instead of `a + b`
- A test suite (`src/math.test.js`) using `node:test` + `node:assert/strict` — 3 tests, 1 fails due to the bug
- `npm test` runs `node --test` (real Node.js test runner)

The `FIXTURE_SHA` is stable: repeated runs against the same fixture produce the same SHA.

### C3. LocalExecutionAdapter (`src/stage-c/local-execution-adapter.ts`)

A REAL adapter (not a mock) that:
- Implements `AdapterContract` (the same interface as MockAdapter)
- Runs real shell commands via `child_process.exec`:
  - `npm test` — runs the real test suite
  - `git diff` — captures the real diff
  - `git rev-parse HEAD` — reads the real FIXTURE_SHA
  - `git checkout -- .` — resets the fixture
- Reads and writes files via `node:fs/promises`
- Applies a deterministic fix (changes `a - b` to `a + b` in the `add()` function)
- Advertises real capabilities: `tool.shell.exec`, `tool.file.read`, `tool.file.write`, `tool.git.diff`, `tool.git.commit`, `tool.git.status`, `tool.test.run`, `event.trace.full`
- Produces real adapter events (invocation.start, file.read, file.write, test.run, git.diff, invocation.end)

The fix is DETERMINISTIC (not LLM-driven) — authorized by ADR-0006.

### C4. Conformance Suite Validation

The `LocalExecutionAdapter` passes the same conformance suite as the `MockAdapter`:
- 11 conformance checks (C1-C8 from Stage B + capability helpers)
- 4 fixture identity checks (FIXTURE_SHA validity, stability, expected files, test fails before fix)

Total: 26 Stage C conformance tests, all passing.

### C5. Real Golden Task (GT-01)

A real execution cycle against the `LocalExecutionAdapter`:

1. **Fixture setup**: real git repo created, `FIXTURE_SHA` captured.
2. **Pre-verification**: the test fails before the fix (the known bug).
3. **Run creation**: a Run is created with the fixture's repo identity.
4. **Adapter invocation**: the `LocalExecutionAdapter.invoke()` runs:
   - Reads `src/math.js`
   - Applies the deterministic fix (`a - b` → `a + b` in `add()`)
   - Runs `npm test` → real test output (exit code 0)
   - Runs `git diff` → real diff showing the fix
5. **Evidence collection**: REAL Evidence records derived from:
   - The adapter's events (invocation.start, file.read, file.write, test.run, git.diff, invocation.end)
   - A `verification_report` Evidence with the real test output (stdout, stderr, exit code)
6. **Evaluation**: `verified_succeeded` — backed by the real `verification_report` Evidence.
7. **Run completion**: `markSucceeded()` with real evidence references.
8. **Experience derivation**: an Experience is derived from the verified Run.
9. **FIXTURE_SHA stability**: the SHA is the same before and after the run (the adapter doesn't commit).

## Tests Delivered

| Test file | Tests | Status |
|-----------|-------|--------|
| `tests/stage-c/conformance.test.ts` | 26 | ✅ |
| `tests/stage-c/golden-task.test.ts` | 3 | ✅ |
| **Stage C subtotal** | **29** | ✅ |

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
| Stage C (Approved Harness Boundary) | 29 | ✅ |
| **Cumulative total** | **993** | ✅ |

## Exit Condition Status

> معيار القبول: الـ adapter يُرضي العقد الموثّق، والـ Run يُنتج الأثر والقطع الأثرية ودليل التحقق المطلوب.

✅ **MET.** Demonstrated by:
- `tests/stage-c/conformance.test.ts` — the LocalExecutionAdapter passes the conformance suite.
- `tests/stage-c/golden-task.test.ts > exercises the full chain with REAL Evidence` — the Run produces real trace, artifacts, and verification evidence.

## What Was NOT Delivered (Deferred)

1. **External Coding Agent integration** — OpenHands SDK, Cezar. The LocalExecutionAdapter is the "real harness" for Stage C; external adapters are a future stage.
2. **LLM-driven code changes** — the fix is deterministic. LLM-driven changes require a separate authorization and infrastructure.
3. **Production deployment** — the LocalExecutionAdapter is development/testing only.
4. **Persistent Golden Task state** — the Golden Task fixture is set up fresh per test run; a persistent fixture (committed to a separate repo) is a future enhancement.

## Current Repository HEAD

```
c395e7e7cb0863eecc4374e8e969b28249e8502a
```

---

# 🏆 PROJECT COMPLETE — ALL STAGES DONE

The Nemons `@nemons/core` project has now completed ALL stages:

| Stage | Description | Tests | Status |
|-------|-------------|-------|--------|
| A | State Verification | — | ✅ |
| 0 | Core Foundation | 277 | ✅ |
| B | Contract Integrity | 304 | ✅ |
| C | Approved Harness Boundary | 29 | ✅ |
| D | Evidence-to-Experience | 92 | ✅ |
| E | Persistent Storage | 38 | ✅ |
| F | Governed Evolution | 86 | ✅ |
| Extensions | PersistentCandidateStore + CandidateGenerator | 44 | ✅ |
| G | Persistent Run + Evidence | 49 | ✅ |
| H | Conflict Resolution | 46 | ✅ |
| I | Approval Policies | 28 | ✅ |
| **TOTAL** | | **993** | ✅ |

All 14 architectural principles from the project brief are encoded in contracts, tests, and policy rules.

The full architectural chain is validated end-to-end with REAL artifacts:

> **A Run produces evidence. Evidence supports evaluation. Evaluation justifies Experience. Experience may be reused under explicit conditions. Changes to operational assets remain governed.**
