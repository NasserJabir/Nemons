# ADR-0012 — Evidence-to-Component Attribution (from HERMES research)

**Status:** Accepted  
**Date:** 2026-10-21  
**Decision Owner:** Senior Research Engineer  
**Research Source:** HERMES (https://arxiv.org/abs/2610.07832)

## Context

HERMES (Jin et al., Oct 2026) introduced Dev-Primitives and a harness engineering framework for software engineering. Its key mechanism relevant to Nemons:

> "A bug diagnosis mechanism that maps execution evidence back to the components that must be revised."

HERMES uses this attribution to target Skill/harness edits to the components that actually caused the failure. Without evidence-to-component attribution, all failures look the same — you can't tell which Skill, Knowledge item, or Tool was the source of the problem.

**Current gap:** Nemons' Evidence records have `claim`, `artifact`, `provenance`, `verified` — but NO field linking the Evidence to a specific component (Skill, Knowledge, Tool, Persona). This means:
- Offline skill refinement can't determine WHICH Skill an Evidence record is about.
- Failure Attribution (ADR-0010) tells you the failure CATEGORY (model/harness/skill/tool/...), but the Evidence itself doesn't link to the specific component instance.
- The full attribution chain is incomplete: "the failure was a skill failure" (ADR-0010) → but "which Skill?" has no structured answer.

## Decision

Add an **`AttributedComponent`** field to the Evidence schema, linking each Evidence record to the specific component it's about.

### AttributedComponent Fields

| Field | Type | Description |
|-------|------|-------------|
| `componentKind` | `"skill" \| "knowledge" \| "tool" \| "persona" \| "memory" \| "none"` | The kind of component the Evidence is about |
| `componentId?` | `string` | The component's stable id (e.g., Skill id, Knowledge id) |
| `componentVersion?` | `string` | The component's version (e.g., Skill v1.0.0) |
| `relationship` | `string` | How the Evidence relates to the component (e.g., "produced by", "verified against", "failed due to") |

The `componentKind: "none"` option allows Evidence that is NOT about a specific component (e.g., environment-level Evidence like "the filesystem was full").

### What This Does NOT Do

- Does NOT require all Evidence to have an attribution (the field is optional).
- Does NOT use an LLM to infer the attribution (the caller provides it).
- Does NOT modify the Evidence collector's existing behavior (the attribution is optional at collection time).
- Does NOT change the Evaluation engine (the attribution is metadata, not a verification dimension).
- Does NOT introduce Dev-Primitives (HERMES's infrastructure — too heavy for Nemons).

### Relationship to ADR-0010 (Failure Attribution)

ADR-0010 (MAST) answers: "what CATEGORY of failure was this?" (model/harness/skill/tool/...).
ADR-0012 (HERMES) answers: "which SPECIFIC COMPONENT is this Evidence about?"

Together they form the complete attribution chain:
1. Run fails → `failureAttribution.category = "skill"` (ADR-0010)
2. Evidence record → `attributedComponent = {componentKind: "skill", componentId: "skill-run-tests", componentVersion: "1.0.0"}` (ADR-0012)
3. Offline refinement can now target `skill-run-tests` v1.0.0 for improvement

### Paper Alignment

HERMES's "maps execution evidence back to the components that must be revised" is directly implemented. The Dev-Primitives infrastructure (LLM-resident artifacts) is NOT adopted — only the attribution principle.

## Rationale

1. **Research-backed**: HERMES outperforms baselines by 12.4% on average across 4 benchmarks.
2. **Completes the attribution chain**: ADR-0010 (category) + ADR-0012 (component) = full attribution.
3. **Enables Priority 2**: offline skill refinement needs to know WHICH Skill to refine.
4. **Low risk**: additive, optional field. Doesn't change existing behavior.
5. **Fits authorization**: within Stage C scope (ADR-0006). No external services.

## Compliance

- All existing tests continue to pass (the field is optional and additive).
- New tests verify the attribution behavior.
- The architectural invariants are preserved.
