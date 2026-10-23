# Architecture

Status: conceptual architecture; implementation technology remains open unless explicitly decided.

## Boundary

Nemons is an independent Agent Runtime / meta-harness above Coding Agent harnesses. Harnesses retain responsibility for their own model loop, native tool invocation, permission checks, and execution environment. Nemons provides cross-run orchestration of operational assets, context selection, handoff, provenance, evidence, and controlled adoption.

## Logical components

1. **Run Coordinator** — establishes task scope, lifecycle, and run identity.
2. **Asset Registry** — resolves versioned Personas, Skills, Tool definitions, Subagent definitions, and policies.
3. **Context Curator** — selects and composes a bounded Context Pack from eligible sources.
4. **Memory Admission and Retrieval Policy** — classifies candidates, checks evidence/status/staleness, and governs retention and retrieval.
5. **Evidence and Provenance Registry** — links observations and artifacts to claims, runs, decisions, and versions.
6. **Adapter Boundary** — translates portable contracts to supported Coding Agent harnesses and exposes capability limitations.
7. **Governance Gate** — separates proposal, evaluation, review, and adoption; enforces non-overridable hard-deny rules.
8. **Evaluation Harness** — executes Golden Tasks, paired comparisons, regression tests, and overhead measurement.

These are logical responsibilities, not a commitment to separate processes or services.

## Data flow

Task + policy → prepare Run → resolve pinned assets → retrieve eligible sources → curate Context Pack → execute through adapter/harness → capture events/evidence → verify outcome → create Experience summary → optionally propose asset or memory candidates → evaluate → governance decision → adopt or reject.

Memory admission and Skill evolution are separate policy paths. A successful run does not automatically create a trusted fact or Skill update.

## Four memory-related layers

1. **Markdown Source of Truth** — human-reviewable durable source records.
2. **Derived Rebuildable Index** — search/index material that can be regenerated from source.
3. **Ephemeral Runtime State** — active run state, temporary working data, and coordination state.
4. **Handoff/Delivery Artifact** — a bounded package for continuity across sessions/agents.

Do not add a fifth memory layer. A Context Pack is a derived task artifact, not another durable memory store.

## Shared context and concurrency

Shared Verified Context may coordinate Subagents within a Run. Updates should be compact, structured, versioned, and labeled with verification state. Central coordination is appropriate where task ordering or governance is critical; more decentralized execution may be considered for independent subtasks. Asynchronous queues are optional and require a demonstrated workload.

Conflicts must be resolved using source identity, version, scope, and evidence—not timestamp alone. Run-scoped shared context must not be confused with permanent Memory.

## Trust and evolution

- Generated assets enter quarantine.
- Verification evidence is tied to exact versions and task scope.
- Adoption is a separate governed decision.
- Hard-deny controls and security boundaries cannot be changed by the evolution loop.
- Failure attribution considers MODEL, HARNESS, SKILL, KNOWLEDGE, TOOL, POLICY, ENVIRONMENT, and UNKNOWN.
- Offline Skill evaluation is enabled only when suitable records exist; proposal data and evaluation data should be separated where feasible.

## Open architecture decisions

Storage implementation, adapter protocols, queue requirements, concurrency model, retention durations, numerical thresholds, and governance roles remain open until their ADRs and evaluation evidence are ready.
