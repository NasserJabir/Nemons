# ADR-0015 — Offline Skill Evaluation (from TeleTune research)

**Status:** Accepted  
**Date:** 2026-10-21  
**Decision Owner:** Senior Research Engineer  
**Research Source:** TeleTune: Evolving Agent Skills From Offline Telemetry (https://arxiv.org/abs/2610.05437)

## Context

TeleTune (Chen et al., Oct 2026) introduced a framework for learning textual skill libraries from offline telemetry logs. Key findings:

- Uses **action-prediction errors** on logged trajectories to propose library edits.
- Keeps only those that improve **held-out action-prediction accuracy** ("skill-guided progress").
- **Separates candidate-generation data from evaluation data** to reduce overfitting.
- **Action-prediction accuracy is a supporting metric, not proof of task success.**
- Optimizing on fixed logs costs **5-75x fewer tokens** than live episodes.

The original Nemons project document recorded these decisions:
> - Evaluate Skills using suitable historical execution data where available.
> - Keep candidate Skill modifications distinct from evaluation data to reduce overfitting.
> - Treat Action-Prediction Accuracy as a supporting metric, not proof of task success.
> - Associate each Skill change candidate with its source, rationale, affected version, and evidence.

**Current gap:** Nemons has the infrastructure for offline evaluation — PersistentRunStore, PersistentEvidenceStore, Failure Attribution (ADR-0010), Evidence-to-Component Attribution (ADR-0012), Run Metrics (ADR-0011), Paired Evaluation (ADR-0013). But there's no component that:
1. Collects historical Runs that reference a specific Skill (via `attributedComponent`).
2. Splits them into generation and evaluation sets (to prevent overfitting).
3. Evaluates the Skill's effectiveness on the held-out set.
4. Reports failure attribution breakdown (from ADR-0010).
5. Reports action-prediction accuracy as a SUPPORTING metric only.

## Decision

Add an **`OfflineSkillEvaluator`** component that:

1. **Collects** historical Runs whose Evidence references a specific Skill (via `attributedComponent.componentId`).
2. **Splits** the data into generation and evaluation sets (configurable ratio, default 50/50).
3. **Evaluates** the Skill on the evaluation set:
   - Success rate (fraction of Runs where the Skill was used and the Run succeeded).
   - Failure attribution breakdown (model/harness/skill/knowledge/tool/policy/environment/unknown).
   - Average metrics (latency, cost, tool calls) — from ADR-0011.
4. **Reports** action-prediction accuracy as a SUPPORTING metric (NOT proof of task success).
5. **Does NOT** automatically promote any Skill. Results are for governed review only.

### What This Does NOT Do

- Does NOT use an LLM to generate candidate Skills (deferred — requires external model).
- Does NOT automatically adopt Skill changes (requires governed review per Stage F).
- Does NOT use action-prediction accuracy as proof of task success (TeleTune's explicit limitation).
- Does NOT require live execution (offline evaluation on historical data only).
- Does NOT modify any existing schema.
- Does NOT weaken any test or authorization boundary.

### Data Separation (from TeleTune)

The evaluator splits historical Runs into two non-overlapping sets:
- **Generation set**: used to identify failure patterns and propose candidates (future: CandidateGenerator uses this).
- **Evaluation set**: used to evaluate candidates (held-out — the candidate has NOT seen this data).

This prevents overfitting: a Skill that looks good on the generation set but fails on the evaluation set should NOT be adopted.

### Integration with Existing Components

The evaluator uses:
- **ADR-0010 (Failure Attribution)**: to categorize failures by cause.
- **ADR-0012 (Evidence-to-Component)**: to find Evidence about a specific Skill.
- **ADR-0011 (Run Metrics)**: for cost/latency analysis.
- **ADR-0013 (Paired Evaluation)**: for before/after comparison (future: when a candidate is proposed, compare against the current Skill's evaluation).

## Rationale

1. **Research-backed**: TeleTune outperforms baselines by 6.7-7.7% on WorkArena and Online-Mind2Web.
2. **Completes the chain**: Run → Evidence → Evaluation → Experience → Candidate → **Offline Evaluation** → Governed Adoption.
3. **Fills the last major gap**: no offline Skill evaluation existed.
4. **Low risk**: read-only component, no state mutation, no automatic adoption.
5. **Fits authorization**: within Stage C scope (ADR-0006).
