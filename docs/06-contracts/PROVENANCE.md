# Contract: Provenance

Provenance records where a claim, asset, or evidence item originated and how it changed.

## Fields
- `provenance_id`, subject ID/version.
- Origin type: user-supplied, repository, external source, run observation, model-generated, or derived.
- Origin reference, source version/digest, timestamp when available.
- Transformation steps with actor/tool, time, inputs, outputs.
- Parent refs, evidence refs, admission decision ref, limitations.

## Rules
- Preserve lineage through extraction, summarization, merging, and handoff.
- Never invent a source or claim an unverified digest.
- Derived summaries retain links to underlying records.
- If source/version is unknown, label the limitation and restrict trust.
- Provenance is necessary for trust decisions but does not itself prove truth.
