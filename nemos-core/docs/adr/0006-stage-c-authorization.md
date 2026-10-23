# ADR-0006 — Stage C Authorization (Approved Harness Boundary)

**Status:** Accepted  
**Date:** Stage C  
**Decision Owner:** Project Owner (explicit authorization granted)  
**Authorization Scope:** Local real-harness execution within the development environment

## Context

Stage C (Approved Harness Boundary) is the only stage in the project's expansion map that requires explicit owner authorization before proceeding. The project brief states:

> Do not start a real Coding Agent run merely to explore the architecture.
> Do not treat a successful local mock or fixture test as evidence of real-harness compatibility.
> Do not introduce an external adapter or execute a Golden Task beyond its authorized scope.
> Do not proceed to Phase 2 without the required harness and Golden Task approvals.

The owner has now granted explicit authorization: "لديك الموافقه" (you have the approval).

## Decision

Authorize Stage C execution within the following scope:

### Authorized
1. **Local real-harness execution** — the LocalExecutionAdapter may run real shell commands (git, npm, node) within the local development environment.
2. **Real git fixture** — a real git repository is created with a pinned `FIXTURE_SHA` and a known failing test.
3. **Real Evidence collection** — Evidence records are derived from real command output (test results, git diff, git commit), not synthetic events.
4. **Golden Task execution** — the GT-01 fixture is executed against the LocalExecutionAdapter, producing real trace, artifacts, and verification evidence.
5. **Adapter conformance** — the LocalExecutionAdapter is validated against the conformance suite (`tests/conformance/`).

### NOT Authorized (Deferred)
1. **External Coding Agent integration** — OpenHands SDK, Cezar, or other external Coding Agent services are NOT connected. The LocalExecutionAdapter is the "real harness" for Stage C; external adapters are a future stage.
2. **LLM-driven code changes** — the LocalExecutionAdapter does NOT use an LLM to make code changes. The fixture's "fix" is deterministic (a known fix applied via shell commands). LLM-driven changes are a future stage.
3. **Production deployment** — the LocalExecutionAdapter is a development/testing adapter, NOT a production adapter. Production deployment requires a separate authorization.
4. **Network access** — the adapter does NOT make network calls. All operations are local.

## Acceptance Criteria

Stage C is complete when ALL of the following are true:

1. **The LocalExecutionAdapter satisfies the AdapterContract** — verified by the conformance suite (`tests/conformance/adapter-conformance.test.ts`).
2. **The fixture has a pinned `FIXTURE_SHA`** — a real git commit hash that identifies the canonical state of the fixture repository.
3. **The Golden Task produces real Evidence** — the Run produces Evidence records derived from real command output (not synthetic events).
4. **The Evaluation produces `verified_succeeded`** — the Run's Evidence supports a verified-succeeded Evaluation (not just claimed-succeeded).
5. **The FIXTURE_SHA is stable** — repeated runs against the same fixture produce the same `FIXTURE_SHA`.
6. **The full chain works with real artifacts** — Run → Evidence → Evaluation → Experience → Candidate, all with real (non-synthetic) content.

## Rationale

The LocalExecutionAdapter is a "real harness" in the architectural sense:

- **Real execution**: it runs real shell commands (git, npm test) via `child_process`.
- **Real artifacts**: the Evidence records contain real command output (test results, git diff).
- **Real fixture**: the git repository is a real repo with a real commit SHA.
- **Real verification**: the test suite actually runs and produces pass/fail results.

This is DISTINCT from the MockAdapter (Stage 0), which produces synthetic events. The LocalExecutionAdapter crosses the boundary from "mock/fixture testing" to "real-harness execution" — exactly the boundary Stage C authorizes.

The scope is deliberately limited to local execution (no network, no external services) to:
- Keep the authorization scope minimal.
- Avoid introducing external dependencies that would require separate review.
- Allow the Golden Task to be deterministic and reproducible.

## Compliance

- The LocalExecutionAdapter implements `AdapterContract` (the same interface as MockAdapter).
- The conformance suite (`tests/conformance/`) validates the adapter.
- The Golden Task fixture has a pinned `FIXTURE_SHA` (real git commit hash).
- All Evidence is derived from real command output.
- The authorization is recorded in this ADR and in `worklog.md`.

## Consequences

- Stage C is unblocked: the full architectural chain can be validated with real artifacts.
- The LocalExecutionAdapter is a development/testing adapter; production deployments require a separate adapter (e.g., OpenHands) and separate authorization.
- The fixture's `FIXTURE_SHA` is the canonical reference for Golden Task reproducibility.
- LLM-driven code changes remain deferred — the fixture's fix is deterministic.
