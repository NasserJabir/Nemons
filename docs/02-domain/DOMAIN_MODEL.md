# Domain Model

## Core entities

- **Project** owns configuration, policy versions, approved asset registries, and evaluation definitions.
- **Run** binds a task to a selected adapter, execution environment, asset snapshots, events, and outcome.
- **Task** defines intent, constraints, acceptance criteria, and risk classification.
- **Asset** is a versioned operational object. Specialized assets include Persona, Skill, Tool definition, Context Pack, and Subagent definition.
- **Memory Record** stores a classified claim or episode with status, provenance, validity/staleness metadata, and links to evidence.
- **Knowledge Claim** expresses a proposition with scope and support; it is not automatically true because it is stored.
- **Evidence Item** identifies a source or observation, integrity metadata, capture time, and the claim/decision it supports or challenges.
- **Experience Record** describes an execution episode and includes outcome and failure attribution.
- **Candidate Change** proposes a change to an asset or memory record and includes rationale, source, evidence, affected version, and evaluation results.
- **Governance Decision** records the authority, scope, decision, rationale, and applicable policy version.
- **Adapter** maps the portable contracts to a harness and records capability/limitation information.

## Relationships

- A Run uses immutable or pinned versions of selected assets where feasible.
- A Run emits events and Evidence Items.
- Experience summarizes a Run but does not automatically become Knowledge.
- Memory admission can create or update records only through the defined policy.
- Candidate Changes reference the exact source and target versions.
- Governance Decisions authorize only the scope explicitly named; they do not override hard-deny rules.
- Context Packs are derived for a task/stage from eligible sources; they are not a separate permanent memory layer.

## Identity and versioning

Stable identifiers must be separate from version identifiers. References to evidence, policy, asset, and source versions should remain resolvable. If an identifier cannot be resolved, consumers must not silently substitute the latest version.
