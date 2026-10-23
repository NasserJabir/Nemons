# Contract: Runtime State

Runtime State is ephemeral coordination state for active Runs, not durable Memory.

## Fields
- `run_id`, state version, updated timestamp.
- Current stage, pending actions, active subtask refs, blockers.
- Pinned assets, Context Pack, and evidence refs.
- Checkpoint/lease metadata only if required by chosen concurrency design.
- Recovery hints and unresolved decisions.

## Rules
- Reconstruct from Run log and approved sources where practical.
- State changes must not implicitly mutate durable source of truth.
- Handoff snapshots state capture time and known gaps.
- Detect expired/conflicting state; never silently overwrite conflicts.
