# GT-01 v1 — Session A Clarification (Evaluator Only)

Deliver this clarification to Session A after it has inspected the starter project but before it reaches the checkpoint:

"One additional compatibility requirement: skip records whose severity is missing/unknown or whose timestamp is missing/invalid. Severity threshold is inclusive. If two eligible records have the same timestamp, preserve their input order. Do not mutate the input list or any event dictionary. An invalid minimum_severity should raise ValueError."

This clarification is intentionally not provided directly to Session B. In B0, Session B receives only the initial task prompt and checkpoint repository. In B1, the handoff may preserve the clarification as part of the user-confirmed task state.
