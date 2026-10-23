# Nemons

**Nemons is an Agent Runtime independent of any Coding Agent.** It manages Context, Personas, Skills, Subagents, Tools, Memory, and Evidence across execution cycles to preserve knowledge and experience when work moves between Coding Agents and turn prior results into reusable, verifiable, governed operational knowledge.

> **Governing principle:** Generation may be free; adoption is always guarded.

Nemons is a **meta-harness / runtime above Coding Agent harnesses**, not a replacement for them. The underlying harness remains responsible for its agent loop, model interaction, tool invocation, permissions, and execution environment. Nemons governs continuity, cross-session state, asset lifecycle, evidence, and controlled reuse across agents.

## Project status

**v4.2.1 — Persona-Driven Pipeline + @nemons/core Bridge.** This repository
now contains BOTH the formal specification (thesis, charter, research, domain
model, requirements, architecture, contracts, evaluation, decisions) AND a
complete working implementation.

The implementation consists of:

- **`nemos/`** — the JS daemon (CommonJS) that users run via 7 coding-agent
  plugins (OpenCode, Claude Code, Codex, Kimi, Cline, Qoder, Trae). Provides
  130+ HTTP endpoints, transparent prompt interception, evidence collection,
  3-tier verification loop, persona-driven skill/harness/subagent selection.
- **`nemos-core/`** — the TypeScript `@nemons/core` package (ESM, strict mode,
  1215 tests, 16 ADRs). Implements governed evolution, persistent stores,
  paired evaluation, action interception, regression detection, ablation
  testing, and import/export. Loaded by the JS daemon via a single 213-line
  bridge shim at `nemos/src/utils/nemos-bridge.js`.
- **`personas/`** — 18 ready-to-use personas (2 YML + 16 JSON).
- **`subagents/`** — 13 ready-to-use subagent definitions.
- **`skills/`** — 24 ready-to-use skill definitions.
- **`releases/`** — downloadable archives (`nemos-project-v4.2.1.tar.gz` +
  `.zip`) for users who want a snapshot without git.
- **`build-scripts/`** — Python build scripts for reproducible releases.
- **`WORKLOG.md`** — 1808-line task log documenting 23 task IDs across the
  project's evolution (Stage 0 → Stage I + 10 research-driven improvements +
  P2/P3 features + v4.2.1 fixes).

CI gate (`.github/workflows/ci.yml`) runs 5 jobs on every push and PR:

1. **Daemon Tests** (matrix: ubuntu-latest × macos-latest, Node 18/20/22) —
   syntax check + 35 legacy unit tests + 33 v4.2.1 persona tests + 22 v4.2.1
   bridge integration tests + smoke test (start + verify `/health` +
   `/core/status` + `/core/sha256` + stop + verify port freed)
2. **TS Core Tests** (ubuntu-latest, Node 22) — strict typecheck + build +
   vitest (1215 tests) + verify bridge loads freshly built dist
3. **Code Quality** (lint + JSON validity)
4. **Security Advisory** (npm audit at all severities, informational only —
   surfaces in the GitHub Security tab)
5. **Security Gate (release-blocking)** — strict npm audit at `moderate`
   threshold + hardcoded-secret scan. This job blocks any release with
   known moderate-or-higher vulnerabilities OR hardcoded secrets.

Verification status: **1305 / 1305 tests passing** (35 legacy + 33 v4.2.1
persona + 22 v4.2.1 bridge + 1215 TS core), 0 open exceptions in the CI gate.

This repository is the documentation-first foundation for the project: thesis,
charter, research, domain model, requirements, architecture, contracts,
evaluation, and decisions. Unresolved choices must remain explicit rather than
being silently treated as accepted requirements.

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
