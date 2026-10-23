# ADR-0002 — Core Independence from External Runtimes (Strategy C)

**Status:** Accepted  
**Date:** Stage 0  
**Decision Owner:** Nemons Architecture

## Context

The project brief identifies multiple external open-source projects (Cezar, NAR/NassAI-Praxis, OpenHands SDK, DeepSeek Harness, OpenFang) as research inputs and possible sources of replaceable components. There is a temptation to adopt one of them wholesale as the runtime backend.

The architectural principles state:
- "Agent independence": Nemons must not depend on a single Coding Agent's internal architecture.
- "No silent mutation": operational assets must not change their approved state without the required governance process.
- "Retrieved is not approved": retrieval preserves trust status.

Adopting an external runtime wholesale would risk:
- Coupling the Core's domain model to that runtime's implementation choices.
- Letting the external runtime define governance, lifecycle, or approval semantics.
- Losing the ability to preserve provenance and approval status across agent switches.

## Decision

Adopt **Strategy C: Build the Nemons Core independently**. Use external implementations selectively, only behind replaceable boundaries (adapters, isolated storage, retrieval components, telemetry exporters, verification utilities).

## Rationale

- Nemons owns its essential domain model (Persona, Skill, Knowledge, Memory, Context Pack, Run, Evidence, Evaluation, Experience). This is the contract surface, and it must not be silently redefined by an external runtime.
- Adapters are the explicit boundary; they translate between Nemons' contracts and the target agent's supported capabilities without redefining Nemons' domain semantics.
- Strategy C does NOT mean reimplementing every useful component from scratch. It means Nemons owns the contracts, the policy decisions, the hard-deny behavior, the asset lifecycle, the evidence and provenance requirements, the evaluation records, and the governance of operational asset changes.

## What May Be Reused (Subject to Review)

- Adapter implementations (e.g., an OpenHands adapter, a Cezar adapter).
- Execution event translators.
- Standard protocol clients (MCP, ACP, A2A).
- Verification utilities.
- Telemetry exporters (OpenTelemetry GenAI).
- Isolated storage or retrieval components.
- Test fixtures and benchmark ideas.

## What Must Remain Under Nemons' Control

- Core domain contracts (9 schemas).
- Identity and binding semantics.
- Policy decisions and hard-deny behavior.
- Asset lifecycle and approval rules.
- Evidence and provenance requirements.
- Evaluation records.
- Experience reuse eligibility.
- Governance of operational asset changes.

## Consequences

- External runtimes are NOT approved dependencies by default.
- Every external integration MUST be evaluated against the project's reuse assessment checklist (problem, upstream, license, security, Nemons interface containing it, replaceability, behavioral tests, why-not-internal).
- The MockAdapter is the only adapter shipped with the Core; production deployments MUST register their own adapter.
- A passing MockAdapter test is NOT evidence of real-harness compatibility (the MockAdapter is explicitly marked NON-PRODUCTION).

## Compliance

- All core types live under `src/` and have no `import` of any non-Node-builtin external package.
- All adapter contracts are interfaces (`AdapterContract`), so concrete adapters can be substituted without touching the Core.
- The PolicyEngine, RunManager, EvidenceCollector, EvidenceValidator, and EvaluationEngine depend only on Core types.
