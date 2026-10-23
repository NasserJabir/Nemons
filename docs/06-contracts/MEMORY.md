# Contract: Memory

Memory is durable information managed by policy. It is distinct from active Context, a Context Pack, and temporary run coordination.

## Four-layer boundary

1. Markdown Source of Truth.
2. Derived Rebuildable Index.
3. Ephemeral Runtime State.
4. Handoff/Delivery Artifact.

Do not create a fifth layer. Implementations may use different storage technologies, but they must preserve these logical boundaries.

## Memory record fields

- `memory_id`, `record_version`, `category`, `claim_or_content`.
- `scope`, `sensitivity`, `valid_from`, `valid_until` when applicable.
- `source_refs[]`, `provenance_ref`, `evidence_refs[]`.
- `admission_status`, `admission_policy_version`, `decision_rationale`.
- `confidence_or_uncertainty` where meaningful, with its basis.
- `created_at`, `last_verified_at`, `staleness_status`.
- `contradiction_refs[]`, `supersedes_ref` only when justified.
- `sensitivity_handling` and retention/deletion constraints.

## Category-conditioned admission

Classify candidate information before deciding retention. Candidate categories may include Fact, Preference, Belief/Inference, Observation, Experience, Decision, Procedure, and Constraint. Categories can be refined through a versioned decision; do not assume these labels are an immutable universal taxonomy.

Evaluate category alongside source reliability, directness of evidence, scope, sensitivity, time validity, contradictions, reuse value, and the consequences of being wrong. A numeric confidence score alone is insufficient.

Proposed states: `QUARANTINED`, `ACCEPTED`, `ABSTAINED`, `REJECTED`. These are Nemons policy states, not a claim that a research paper uses the same names.

- **ACCEPTED** means admitted under a policy at a point in time, not permanently true.
- **QUARANTINED** means not available as accepted fact.
- **ABSTAINED** means evidence is insufficient for a durable assertion; preserve the audit record without promoting the claim.
- **REJECTED** means the candidate failed policy or is unsuitable for admission.

## Retrieval and staleness

Memory → Retrieval → Curation → Context.

Retrieval considers task relevance, category, provenance, status, scope, and freshness. When a source changes or supporting evidence becomes stale, mark the record `UNVERIFIED_STALE` and revalidate when required. Do not silently delete or treat stale content as verified in a sensitive task. Preserve credible contradictions until resolved.

## Safety constraints

- Avoid turning weak inferences about a user's beliefs, intentions, or identity into durable facts.
- Apply stricter evidence and review to sensitive or high-impact claims.
- An experience proves only what was observed in that episode; it does not establish a universal rule.
- No candidate becomes trusted solely because a model generated it or a run succeeded.
