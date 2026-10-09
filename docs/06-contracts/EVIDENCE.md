# Contract: Evidence

Evidence is a source or observation that supports, weakens, or contradicts a claim, outcome, or decision.

## Fields
- `evidence_id`, type, capture time.
- Source URI/artifact ref and source version/digest when available.
- Run/task/stage and asset versions when applicable.
- Claim/decision refs, provenance ref, integrity status.
- Relevance assessment, limitations, verification method.

## Principles
- Capture evidence at meaningful stages, not only at final completion.
- Link evidence to exact Run, asset, and policy versions.
- Preserve contradictions and state what evidence does and does not establish.
- A passing test supports only the tested property under tested conditions.
- An LLM judge is supporting evidence, not ground truth.
- Missing telemetry is unknown, not proof an event did not happen.
- Protect sensitive evidence and minimize unnecessary retained data.
