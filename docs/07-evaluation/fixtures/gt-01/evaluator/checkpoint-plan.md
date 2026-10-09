# GT-01 v1 — Session A Checkpoint Plan (Evaluator Only)

## Purpose

Create a shared, reproducible partial-work state for every Session B condition. Do not use Session A's final solution as the checkpoint.

## Required checkpoint state

1. Start from the exact participant starter commit.
2. Give Session A the initial task prompt.
3. Let Session A inspect the project.
4. Deliver the clarification in `session-a-clarification.md`.
5. Session A may implement the function signature validation and severity filtering, but must stop before implementing timestamp validation, ordering, and edge-case handling.
6. Save the resulting diff as the canonical checkpoint patch and record its SHA-256 plus the base commit.
7. Review the checkpoint to ensure it does not already satisfy all evaluator acceptance criteria.
8. Restore this exact checkpoint before each Session B run.

If Session A implements beyond the allowed checkpoint, do not hand-edit its output into compliance. Restart Session A with the same frozen prompt and record the deviation.

## Handoff condition

For B1, a human creates a concise handoff using only the Session A transcript and canonical checkpoint. It may include the clarification, completed work, remaining work, decisions, test status, and next steps. Record authoring time and exact handoff artifact.

For B0, do not provide the Session A transcript, clarification, notes, or handoff. Session B receives the original task prompt and the exact same checkpoint repository state.
