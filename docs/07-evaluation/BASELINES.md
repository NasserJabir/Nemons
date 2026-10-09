# Baselines

## Purpose

Separate value created by Nemons from value already available through a Coding Agent harness, the model, or a concise manual handoff. A baseline is a controlled comparison condition, not a claim that one approach is universally superior.

## Proposed conditions

- **B0 — Native harness:** the task runs without Nemons-managed continuity or retrieval.
- **B1 — Manual handoff:** a concise, human-prepared handoff containing the agreed task state, decisions, and next steps.
- **N1 — Nemons handoff/context:** Nemons produces the handoff and curated Context Pack using pinned assets.
- **N2 — Governed retrieval:** N1 plus category-conditioned admission, freshness checks, and provenance-aware retrieval.
- **N3 — Temporary context curation (experiment only):** N1 or N2 with task-adaptive curation of a temporary Context Pack, compared against its fixed-pack counterpart. Durable Memory/source files must not be edited by this condition.
- **S0/S1 — Skill comparison (experiment only):** existing Skill versus candidate refined Skill, evaluated on the same held-out tasks. Candidate-generation traces must not leak into held-out scoring.

Do not run every condition for every task. Select the smallest comparison that answers the stated research question.

## Controls

- Pin task fixtures, repository state, environment, model/harness versions, and acceptance criteria.
- Record Nemons revision, Adapter version/capabilities, asset/policy versions, and relevant model settings where available.
- Keep the model/harness constant when measuring Nemons' incremental effect. If that is impossible, record the confound and avoid causal claims.
- Use paired tasks and repeated runs where stochasticity matters; randomize run order where practical.
- Freeze scoring criteria before the comparison and use the same criteria for all conditions.
- Separate proposal-generation data from held-out evaluation data. Do not select only favorable traces or omit failures without a recorded exclusion reason.
- Record telemetry gaps and use comparable cost measurements; token counts alone are not total cost.
- Include negative security/governance cases, not only productive happy paths.

## Interpretation

- Report task quality and overhead together.
- Distinguish observed correlation from causal attribution.
- If a result changes across repetitions or the effect is smaller than run-to-run noise, report it as uncertain rather than claiming improvement.
- A successful run, judge approval, or action-prediction score alone is not sufficient evidence for adoption.
- A candidate Skill or Context Pack remains unadopted until held-out evaluation, regression checks, and the required governance decision are complete.

## Status

These conditions are proposed; no performance claims or numeric release thresholds have been established. Establish pilot results first and record threshold decisions in an ADR.
