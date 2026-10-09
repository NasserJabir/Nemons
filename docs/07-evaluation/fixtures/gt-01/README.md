# GT-01 Fixture v1

This directory defines an isolated, bounded Python task for the GT-01 cross-session continuation experiment.

## Separation rule

- `participant/` is the only directory copied into the Coding Agent's task workspace.
- `evaluator/` contains prompts, clarification, checkpoint plan, and scoring criteria. Keep it outside the participant workspace and do not expose it to the Coding Agent except for the explicitly scheduled Session A clarification.
- The full evaluation repository may contain evaluator artifacts, so never run the Coding Agent with this directory as its working root. Copy only `participant/` to a fresh workspace.

## Task summary

Implement an alert selector that filters events by minimum severity and returns the newest eligible events first. Session A receives an additional user clarification after investigating the starter project. Session A then stops at a fixed partial-work checkpoint. Session B must continue from the same checkpoint under B0 or B1.

## Status

This is a candidate fixture, not yet validated as an executable benchmark. The reset script and session-isolation procedure must be exercised manually before scored runs. No performance results are included here.

## Contents

- `participant/`: starter project visible to the Coding Agent.
- `evaluator/task-prompt.md`: initial task prompt.
- `evaluator/session-a-clarification.md`: clarification delivered only to Session A.
- `evaluator/checkpoint-plan.md`: required checkpoint state.
- `evaluator/acceptance-rubric.md`: evaluator-only acceptance criteria.
- `evaluator/reset-and-run.md`: reset and isolation checklist.
