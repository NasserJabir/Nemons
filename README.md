# Nemons

<p align="center">
  <strong>An independent Agent Runtime for continuity, evidence, and governed reuse across Coding Agents.</strong>
</p>

<p align="center">
  <a href="https://github.com/NasserJabir/Nemons/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/NasserJabir/Nemons/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/NasserJabir/Nemons/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/NasserJabir/Nemons?display_name=tag"></a>
  <a href="https://github.com/NasserJabir/Nemons/issues"><img alt="Issues" src="https://img.shields.io/github/issues/NasserJabir/Nemons"></a>
</p>

Nemons is an **Agent Runtime independent of any Coding Agent**. It coordinates operational context and assets across execution cycles so that knowledge and experience can travel with work—even when that work moves between Coding Agents.

> **Governing principle:** Generation may be free; adoption is always guarded.

Nemons is a **meta-harness above Coding Agent harnesses**, not a replacement for them. The underlying harness remains responsible for its agent loop, model interaction, tool invocation, permissions, and execution environment. Nemons focuses on continuity, evidence, asset lifecycle, and controlled reuse.

## Why Nemons?

Coding Agents can complete tasks, but useful context and lessons are often scattered across sessions, tools, prompts, and repositories. Reusing generated assets without provenance or review can also turn one mistake into a repeated failure.

Nemons is designed to help teams:

- **Carry operational context forward** across sessions and supported Coding Agents.
- **Build a traceable record of execution** with evidence and provenance.
- **Evaluate before trusting** rather than treating a successful test or model judgment as proof of correctness.
- **Govern reusable assets** such as Personas, Skills, and Subagents through explicit lifecycle and review controls.
- **Learn without silent mutation**: generated or learned changes remain candidates until the appropriate gate is passed.

## Architecture at a glance

```text
Coding Agent / Harness
        │
        ▼
Nemons daemon (`nemos/`)
  intercept · context · evidence · evaluation
        │
        ▼
Nemons Core (`nemos-core/`)
  contracts · validation · governed evolution
        │
        ▼
Traceable operational assets and execution history
```

The daemon is the integration-facing runtime. The TypeScript `@nemons/core` package provides core contracts and governed operations. The bridge at `nemos/src/utils/nemos-bridge.js` connects the daemon to the core package.

### Core execution loop

The supported product path is intentionally narrower than the daemon's full endpoint surface:

```text
/analyze
   → /evidence
   → /evaluate
   → /experiences
   → /core/*
```

- `/analyze` — intercept work and assemble a Context Pack.
- `/evidence` — collect and redact execution evidence.
- `/evaluate` — verify results against multiple checks.
- `/experiences` — record reusable lessons from execution.
- `/core/*` — validate and govern asset evolution.

`/health` and `/metrics` support operational visibility. Other endpoint families—including research modules, harness routing, delegation, skillbank, and Kanban/A2A features—are experimental and may change or be removed without a major-version guarantee. Build integrations on the core loop unless a capability is explicitly documented as supported.

## Project status

**Reported project version: v4.5.0 — MCP-native release.**

The project status supplied for 2026-10-27 reports the v4.3.0 P0–P3 quality cycle (closure of path traversal, timing-leaky authentication, and rate-limiting wiring; a daemon composition root and domain route modules; durable governed review decisions in `@nemons/core`; a consumable npm package surface; readable source modules), the v4.4.0 additions (a redesigned zero-dependency dashboard with live KPI cards and a verification-loop tester, the first empirical audit of all 7 coding-agent plugins, and a StrykerJS mutation-testing baseline at 63.12% on `paired-evaluator.ts`), and the v4.5.0 addition: a **spec-correct MCP server at `/mcp`** (Streamable HTTP, stateless; seven schema-validated tools sharing one core-loop implementation with the HTTP API; zero new dependencies) with a 26-test conformance suite — closing the claude-code plugin's declared-but-missing MCP surface.

The same reports record **1,369 passing checks** across daemon, MCP conformance, integration, security, end-to-end, and TypeScript core suites. Treat the live CI workflow and tagged release artifacts as the authoritative source for current status; counts in documentation are snapshots and can become stale.

### Implementation

| Path | Responsibility |
|---|---|
| `nemos/` | JavaScript daemon (CommonJS), HTTP API, integrations, evidence collection, and verification flow |
| `nemos-core/` | TypeScript `@nemons/core` package (ESM, strict mode), validation, stores, evaluation, and governed evolution |
| `personas/` | Ready-to-use operational Persona definitions |
| `subagents/` | Ready-to-use Subagent definitions |
| `skills/` | Reusable Skill definitions |
| `plugins/` | Coding Agent integration plugins |
| `docs/` | Project specification, architecture, contracts, evaluation, and decisions |
| `releases/` | Snapshot archives, where available |
| `build-scripts/` | Release build tooling |
| `WORKLOG.md` | Development and execution history |

The repository contains both the formal project specification and a working implementation. The specification remains the place to understand intended behavior and unresolved decisions; implementation details should not silently override the documented requirements.

## Getting started

1. Read the [Project Map](NEMONS_PROJECT_MAP.md) to navigate the repository.
2. Read the [daemon quick start](nemos/README.md) for local setup and health checks.
3. Read the [Architecture](docs/04-architecture/ARCHITECTURE.md) before building an integration.
4. Review the [Product Requirements](docs/03-requirements/PRD.md) and [Evaluation Strategy](docs/07-evaluation/EVALUATION.md) to understand the intended behavior and verification model.

For a conceptual introduction, start with the [Thesis](NEMONS_THESIS.md) and [Vision](docs/00-charter/VISION.md).

## Design invariants

These invariants constrain implementation and future evolution:

- **Identity ≠ Instance.** An identity is not tied to one process or session.
- **Memory ≠ Context.** Memory is a governed source; retrieval and curation determine what enters a task's Context Pack.
- **Persona ≠ Authorization.** A Persona describes operational behavior and grants no permissions.
- **Use ≠ Adopt.** Using or evaluating an asset does not automatically make it trusted.
- **Test passed ≠ task correct.** Evidence must be assessed against task intent and acceptance criteria.
- **LLM judge approved ≠ truth.** Model-based review is supporting evidence, not ground truth by itself.
- **No silent mutation.** Generated or learned assets remain candidates until the required governance gate is passed.
- **Hard-deny rules are non-overridable.** Prior approval, Personas, Skills, and model output cannot bypass destructive-action denial or security boundaries.
- **Evidence requires provenance.** Claims and asset changes should identify their source, scope, version, and rationale.
- **No fifth memory layer.** Preserve the four established layers: Markdown Source of Truth; rebuildable derived index; ephemeral runtime state; and handoff/delivery artifact.

## Documentation

| Area | What it covers |
|---|---|
| [Project Map](NEMONS_PROJECT_MAP.md) | Repository navigation |
| [Thesis](NEMONS_THESIS.md) | Core concept and rationale |
| [Vision](docs/00-charter/VISION.md) | Project vision |
| [Problem Statement](docs/00-charter/PROBLEM.md) | Problem definition |
| [Non-goals](docs/00-charter/NON_GOALS.md) | Explicit scope boundaries |
| [Research References](docs/01-research/REFERENCES.md) | Source literature and references |
| [Research Matrix](docs/01-research/RESEARCH_MATRIX.md) | Research-to-design mapping |
| [Research Gaps](docs/01-research/RESEARCH_GAPS.md) | Open research questions |
| [Domain Model](docs/02-domain/) | Concepts, entities, and lifecycles |
| [Product Requirements](docs/03-requirements/PRD.md) | Product requirements |
| [Architecture](docs/04-architecture/ARCHITECTURE.md) | Runtime boundaries and architecture |
| [Contracts](docs/06-contracts/) | Asset and integration contracts |
| [Evaluation](docs/07-evaluation/EVALUATION.md) | Evaluation strategy and evidence |
| [Architecture Decisions](docs/08-decisions/) | Decision records |

## Security and trust model

Security is part of the runtime boundary, not a feature that Personas or model instructions can override. The reported CI pipeline includes regression coverage for path containment, authentication, and rate limiting, plus a release-blocking dependency audit and hardcoded-secret scan.

If you discover a security issue, avoid posting exploit details in a public issue. Use the repository's supported private reporting mechanism if one is enabled; otherwise contact the maintainer privately before disclosure.

## Scope boundaries

Nemons does not:

- Replace the underlying Coding Agent harness or its execution loop.
- Train model weights.
- Treat unverified generated output as trusted Memory.
- Silently change governance, security boundaries, identity, capabilities, approval thresholds, or evidence rules.

New ideas begin as proposals, are linked to evidence, and are evaluated against the project invariants. A candidate is not an accepted asset.

## Contributing

Contributions should preserve the design invariants and distinguish implemented behavior from proposals. Before submitting a change, review the relevant requirements, architecture, contracts, and evaluation documentation. Include tests and evidence for behavioral changes, especially those affecting security, governance, identity, or asset lifecycle.

Open an issue for a substantial design proposal before investing in a large implementation. Keep unresolved choices explicit rather than presenting assumptions as accepted requirements.

## License

Check the repository's [LICENSE](LICENSE) file for the terms that apply to this project.
