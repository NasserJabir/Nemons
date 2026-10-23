# GT-01 v1 — Reset and Session Isolation

This is a required checklist, not yet a verified automation script.

## Prepare

1. Record the fixture revision and the participant starter commit.
2. Copy only `participant/` to a separate task workspace.
3. Keep all `evaluator/` files outside the workspace and inaccessible to the Coding Agent.
4. Confirm the workspace contains no session traces, handoff files, hidden tests, or prior run outputs.

## Create checkpoint

1. Run Session A using the frozen initial prompt and deliver the clarification at the specified stage.
2. Stop Session A at the checkpoint defined in `checkpoint-plan.md`.
3. Record the checkpoint diff, commit/hash, test output, transcript reference, and deviations.
4. Verify the checkpoint is incomplete against the evaluator rubric.

## Run each condition

1. Create a fresh workspace from the exact participant base, then apply the canonical checkpoint patch.
2. Create a new Coding Agent session identity; disable or clear prior conversation carryover where supported.
3. For B0, provide the initial task prompt only. Do not provide Session A's clarification or transcript.
4. For B1, provide the same prompt and checkpoint plus the human-written handoff. Do not alter repository files relative to B0.
5. Record model/provider, model settings, Coding Agent/harness and version, runtime, environment, test command, start/end times, tool calls, token/cost telemetry where available, and human interventions.
6. Save final diff and logs outside the participant workspace.
7. Run the frozen public and evaluator tests after the agent stops.

## Validity checks

Invalidate or flag a run if:
- Session B can access Session A's transcript or hidden evaluator files in B0.
- B0 and B1 start from different repository states.
- An unrecorded human gives hints or edits code.
- The run uses different model/harness settings without being declared as a confound.
- The canonical checkpoint cannot be reproduced.

## Current status

The procedure has been specified but not yet exercised against a real Coding Agent harness. Do not describe session isolation as verified until a dry run demonstrates it.
