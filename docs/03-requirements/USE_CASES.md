# Use Cases

## UC-01 — Resume work in another Coding Agent

**Actor:** Developer.  
**Precondition:** A Run has a handoff artifact and referenced asset versions.

**Main flow**
1. The developer starts a new Run through a different supported adapter.
2. Nemons resolves the handoff and verifies the referenced sources/versions.
3. Nemons retrieves and curates only task-relevant, eligible information.
4. The Context Pack identifies sources, status, and unresolved work.
5. The new agent resumes and records new evidence against the same task lineage.

**Acceptance:** the new session can complete the continuation task without relying on the previous harness's private conversation state; missing references are surfaced, not guessed.

## UC-02 — Admit a candidate memory

1. A candidate is extracted from an execution or supplied source.
2. Nemons classifies its category and identifies source, scope, sensitivity, and time validity.
3. The policy checks evidence strength and contradiction/staleness.
4. The candidate is accepted, quarantined, abstained, or rejected according to the policy.
5. The decision and rationale are recorded.

**Acceptance:** a weak inference cannot be retrieved as an accepted fact.

## UC-03 — Propose a Skill improvement

1. A run outcome suggests a possible Skill issue.
2. Nemons records failure attribution and links the exact Skill version.
3. A bounded candidate change is generated.
4. Evaluation uses suitable data and regression checks.
5. The authorized reviewer or gate adopts or rejects the candidate.

**Acceptance:** one failure alone cannot silently rewrite an approved Skill.

## UC-04 — Resolve contradictory knowledge

1. Retrieval finds two claims that conflict.
2. Nemons compares source, scope, version, evidence, and freshness.
3. It preserves the contradiction and identifies any supported supersession.
4. If unresolved, it surfaces uncertainty or abstains from asserting one claim.

**Acceptance:** recency alone does not automatically overwrite credible conflicting evidence.

## UC-05 — Share progress between Subagents

1. Independent Subagents produce compact structured updates.
2. Each update includes task scope, source/version, result, and verification status.
3. The coordinator decides which updates are relevant to the Run.
4. Unverified contributions remain labeled as such.
5. Only eligible, governed results may later enter durable Memory.

**Acceptance:** shared run context is distinct from durable Memory.
