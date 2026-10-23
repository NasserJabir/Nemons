# Contract: Subagent

A Subagent is a bounded delegated worker with explicit task and capability scope.

## Fields
- `subagent_id`, Run ID, task scope, status.
- Assigned role, input refs, allowed capabilities.
- Output refs, evidence refs, verification status.
- Parent task, dependencies, termination/failure reason.
- Model/harness details where relevant and available.

## Rules
- Delegation is not authorization; all actions remain subject to tool policy and hard-deny.
- Share compact structured updates with provenance and verification status.
- Subagent contributions remain untrusted until evaluated.
- Use asynchronous queues only when independent parallel work and evidence justify them.
- Coordinate dependencies/governance centrally; independent subtasks may have bounded autonomy.
