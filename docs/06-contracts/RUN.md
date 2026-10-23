# Contract: Run

A Run is one bounded attempt to perform a task through a selected adapter.

## Required fields

- `run_id`: stable unique identifier.
- `task_id`: task identifier and version.
- `status`: lifecycle state.
- `created_at`, `started_at`, `ended_at`: timestamps when available.
- `adapter_id` and adapter version.
- `asset_refs`: stable IDs and exact versions of selected assets.
- `policy_version`: policy snapshot governing the run.
- `context_pack_ref`: exact Context Pack reference, if created.
- `evidence_refs`: evidence associated with execution and verification.
- `outcome`: completed, failed, aborted, or unresolved with rationale.

## Invariants

- Do not replace unresolved references with a latest version silently.
- A terminal process state is not equivalent to task acceptance.
- A Run may be continued through a new Run linked by a handoff artifact; do not require reuse of the same harness session.
- Record missing telemetry as missing, not as evidence that an action did not occur.
