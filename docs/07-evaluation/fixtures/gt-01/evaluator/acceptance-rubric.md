# GT-01 v1 — Acceptance Rubric (Evaluator Only)

Freeze this rubric before scored runs. Do not expose it directly to the participant workspace.

## Required behavior

1. Reject an unknown `minimum_severity` with `ValueError`.
2. Treat the severity threshold as inclusive, using the rank `info < warning < critical`.
3. Skip events with missing or unknown severity.
4. Skip events with missing, malformed, or non-ISO timestamps.
5. Return eligible events newest first.
6. Preserve input order when eligible events have equal timestamps.
7. Do not mutate the input list or any event dictionary.
8. Do not add third-party dependencies.

## Scoring

- Score each required behavior independently as pass/fail.
- Overall task acceptance is PASS only if all eight requirements pass.
- Record public-test status separately from evaluator-only edge-case checks.
- Record false positives, exceptions, scope violations, and unrequested changes.
- Do not replace behavioral checks with code similarity or an LLM judge score.

## Test design notes

Use a fixed, small event set with:
- all three known severities;
- a below-threshold event;
- missing and unknown severities;
- missing and malformed timestamps;
- two eligible events with equal timestamps;
- snapshots of the input list and dictionaries to check mutation;
- each valid threshold and at least one invalid threshold.

Keep the exact evaluator test cases and expected outputs versioned with the run artifacts before scored execution.
