# Nemons

**Nemons is an Agent Runtime independent of any Coding Agent.** It manages Context, Personas, Skills, Subagents, Tools, Memory, and Evidence across execution cycles to preserve knowledge and experience when work moves between Coding Agents and turn prior results into reusable, verifiable, governed operational knowledge.

> **Governing principle:** Generation may be free; adoption is always guarded.

Nemons is a **meta-harness / runtime above Coding Agent harnesses**, not a replacement for them. The underlying harness remains responsible for its agent loop, model interaction, tool invocation, permissions, and execution environment. Nemons governs continuity, cross-session state, asset lifecycle, evidence, and controlled reuse across agents.

## Project status

This repository is the documentation-first foundation for the project: thesis, charter, research, domain model, requirements, architecture, contracts, evaluation, and decisions. It does not claim that a working runtime has already been implemented. Unresolved choices must remain explicit rather than being silently treated as accepted requirements.

## Start here

- [Project map](NEMONS_PROJECT_MAP.md)
- [Thesis](NEMONS_THESIS.md)
- [Vision](docs/00-charter/VISION.md)
- [Problem statement](docs/00-charter/PROBLEM.md)
- [Non-goals](docs/00-charter/NON_GOALS.md)
- [Research references](docs/01-research/REFERENCES.md)
- [Research matrix](docs/01-research/RESEARCH_MATRIX.md)
- [Research gaps](docs/01-research/RESEARCH_GAPS.md)
- [Product requirements](docs/03-requirements/PRD.md)
- [Architecture](docs/04-architecture/ARCHITECTURE.md)
- [Evaluation strategy](docs/07-evaluation/EVALUATION.md)

## Design invariants

- **Identity ≠ Instance.** Identity is not a particular process or session.
- **Memory ≠ Context.** Memory is a governed source; retrieval and curation determine what enters a task's Context Pack.
- **Persona ≠ Authorization.** A persona describes operational behavior; it grants no permissions.
- **Use ≠ Adopt.** Use or evaluation does not automatically make an asset trusted.
- **Test passed ≠ task correct.** Evidence must be assessed against task intent and acceptance criteria.
- **LLM judge approved ≠ truth.** Model-based review is supporting evidence, not ground truth by itself.
- **No silent mutation.** Generated or learned assets remain candidates until the appropriate governance gate is passed.
- **Hard-deny rules are non-overridable.** No prior approval, persona, skill, or model output may bypass destructive-action denial or security boundaries.
- **Evidence requires provenance.** Claims and asset changes should identify their source, scope, version, and rationale.
- **No fifth memory layer.** Preserve the four established memory-related layers: Markdown Source of Truth; rebuildable derived index; ephemeral runtime state; handoff/delivery artifact.

## Documentation map

| Area | Purpose |
|---|---|
| `docs/00-charter` | Vision, problem, non-goals |
| `docs/01-research` | References, research matrix, gaps |
| `docs/02-domain` | Glossary, domain model, lifecycles |
| `docs/03-requirements` | PRD, requirements, use cases |
| `docs/04-architecture` | Runtime boundaries and architecture |
| `docs/06-contracts` | Asset and integration contracts |
| `docs/07-evaluation` | Evaluation, Golden Tasks, metrics, baselines |
| `docs/08-decisions` | Architecture decision records |

## Scope boundary

Nemons manages operational assets and execution continuity across Coding Agents. It does not replace the underlying Coding Agent harness, train model weights, silently rewrite governance, or treat unverified generated output as trusted memory.

## Change discipline

New ideas begin as proposals, are linked to evidence, and are evaluated against the project invariants. A generated candidate is not an accepted asset. Changes to governance, security boundaries, identity, capabilities, approval thresholds, or evidence rules cannot be autonomously adopted.
