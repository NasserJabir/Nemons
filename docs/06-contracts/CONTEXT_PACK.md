# Contract: Context Pack

A Context Pack is a task- or stage-specific, curated delivery artifact assembled from eligible sources. It is not the Memory store and must not be treated as a permanent memory layer.

## Required fields

- `context_pack_id`, `task_id`, `run_id` (when applicable).
- `created_at`, `selection_policy_version`.
- `items[]`: source ID/version, category, scope, status, relevance rationale, and freshness/staleness status.
- `excluded_or_unresolved[]`: relevant conflicts, unavailable sources, or rejected references where needed for safe interpretation.
- `constraints[]`: task constraints and applicable policy references.
- `token_or_size_budget`: target and actual size when measurable.

## Rules

- Select adaptively by task and dependency; do not dump all Memory into Context.
- Exclude quarantined/rejected claims from representation as accepted facts.
- Mark stale or unverified content explicitly.
- Preserve source references and uncertainty.
- Do not include secrets or sensitive personal data unless necessary, authorized, and handled under the applicable policy.
- Context inclusion is not authorization to act.
