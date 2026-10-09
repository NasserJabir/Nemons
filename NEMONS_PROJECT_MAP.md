# Nemons Project Map

This map defines the documentation entry points and their responsibilities. It is a navigation aid, not an independent source of requirements.

## Reading order

1. `NEMONS_THESIS.md` — core problem and thesis.
2. `docs/00-charter/` — purpose, problem, exclusions.
3. `docs/01-research/` — external evidence, transfer limits, open gaps.
4. `docs/02-domain/` — vocabulary, domain entities, lifecycle boundaries.
5. `docs/03-requirements/` — product scope and testable requirements.
6. `docs/04-architecture/ARCHITECTURE.md` — responsibility boundaries and data flow.
7. `docs/06-contracts/` — interoperable asset and adapter contracts.
8. `docs/07-evaluation/` — evaluation protocol and measurable claims.
9. `docs/08-decisions/` — accepted decisions and unresolved questions.

## Directory map

- `docs/00-charter`: VISION, PROBLEM, NON_GOALS
- `docs/01-research`: REFERENCES, RESEARCH_MATRIX, RESEARCH_GAPS
- `docs/02-domain`: GLOSSARY, DOMAIN_MODEL, LIFECYCLES
- `docs/03-requirements`: PRD, REQUIREMENTS, USE_CASES
- `docs/04-architecture`: ARCHITECTURE
- `docs/06-contracts`: RUN, CONTEXT_PACK, PERSONA, SKILL, MEMORY, KNOWLEDGE, EXPERIENCE, STATE, EVIDENCE, PROVENANCE, SUBAGENT, TOOL, TOOL_PROVIDER, AGENT_ADAPTER, CODING_AGENT, EXECUTION_ENVIRONMENT
- `docs/07-evaluation`: EVALUATION, GOLDEN_TASKS, METRICS, BASELINES
- `docs/08-decisions`: ADR records

## Document status convention

- **Accepted invariant**: project boundary already established.
- **Proposed**: a design recommendation awaiting explicit decision.
- **Open**: evidence or a product decision is missing.
- **Experimental**: must be tested before promotion to a requirement.

Do not infer acceptance merely because a concept appears in a document. Each ADR must state its status and rationale.
