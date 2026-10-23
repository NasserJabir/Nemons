# Evaluation Strategy

## Objective

Determine whether Nemons improves cross-agent continuity and governed reuse enough to justify its complexity and overhead. Evaluation must distinguish the value of Nemons from capabilities already provided by the Coding Agent harness, the model, and the execution environment.

## Evaluation rules

- Define task intent, acceptance criteria, exclusions, and required evidence before running a comparison.
- Use the same task fixture and conditions for paired comparisons wherever feasible.
- Repeat runs when stochasticity may affect results; report sample count and variability, not only the best run.
- Pin and record model, model settings where available, Coding Agent/harness, harness version, Nemons revision, Adapter, asset versions, policy versions, repository fixture, and environment.
- Separate candidate-generation data from held-out evaluation data. Do not tune on the held-out set and then report it as independent evidence.
- Record every eligible run, including failures, timeouts, missing telemetry, and exclusions with reasons.
- Report task quality and overhead together: latency, tokens, tool calls, and cost where measurable.
- Separate task correctness, process completion, provenance completeness, and judge scores. One must not stand in for another.
- An LLM judge is a fallible instrument, not ground truth. Use explicit acceptance criteria and inspect disagreement or high-impact outcomes.
- A successful test run is not proof of correctness; an action prediction or passing sub-step is not proof of task success.

## Evaluation dimensions

1. **Task outcome:** predefined acceptance criteria, correctness, defects, and regressions.
2. **Continuity:** successful resumption, missing critical state, repeated discovery/work, and handoff reconstruction fidelity.
3. **Memory and retrieval:** relevance, category handling, stale/contradictory exposure, abstention, and evidence coverage.
4. **Governance:** quarantine/adoption behavior, separation of proposal and approval, authorization boundaries, and hard-deny enforcement.
5. **Portability:** behavior across supported Coding Agent harnesses and their documented capability differences.
6. **Efficiency:** latency, context size/tokens, tool calls, and cost where measurable.
7. **Reliability:** run-to-run variability, recovery behavior, reference integrity, and reproducibility.
8. **Change quality:** whether a proposed Skill/context change improves held-out tasks without regressions or policy-boundary changes.

## Protocol

### Phase 0 — Freeze the experiment

Record the question, hypotheses, baseline(s), task fixture/version, acceptance rubric, variables to hold constant, telemetry available, and known confounds. Define what result would count as improvement, regression, or inconclusive evidence before observing results.

### Phase 1 — Establish baselines

Run the relevant baseline conditions before tuning Nemons. For continuity tasks, compare native harness behavior, a concise manual handoff, and the Nemons-managed handoff/context when applicable.

### Phase 2 — Paired and repeated runs

Use matched conditions and paired task instances where feasible. Randomize run order where practical. Select run count based on pilot variance, evaluation cost, and the smallest effect worth detecting; record the rationale. Do not invent a universal sample size or threshold.

### Phase 3 — Score independently

Score task acceptance against the frozen rubric. Score governance/security properties separately. Use automated checks where deterministic and manual review where necessary. Keep judge-derived scores labeled as such.

### Phase 4 — Analyze quality and cost

Report per-condition outcomes, paired differences, variability, failures, exclusions, and overhead. Separate model, harness, Skill, Knowledge, Tool, Policy, and Environment effects when evidence permits; otherwise use UNKNOWN rather than guessing.

### Phase 5 — Regression and decision

Run relevant Golden Tasks and negative security/governance tests before adopting a change. Document whether evidence supports adoption, rejection, further experiment, or abstention. Link the decision to exact versions and run evidence.

## Initial experiment order

1. **Baseline reliability and cost:** paired/repeated runs, task acceptance, run metadata, latency, tokens/cost, and tool-call counts.
2. **Offline Skill refinement:** candidate proposals from historical traces, explicit failure attribution, held-out evaluation, regression checks, and a separate governance gate.
3. **Temporary Context Pack curation:** compare task-adaptive curation with a fixed baseline while checking retention of required constraints.
4. **Action verification:** later, only if an Adapter can intercept relevant actions; measure verifier errors and overhead. Probabilistic verification never overrides deterministic hard-deny or authorization rules.

Learned user simulators and CMM-style neural memory are deferred until a concrete evaluation gap demonstrates the need.

## Release gate

Require relevant Golden Task results, baseline comparison, regression suite, negative security/governance tests, known limitations, and measured overhead. Numeric release thresholds remain open until baseline evidence supports them and a decision is recorded in an ADR. No research paper's benchmark result automatically becomes a Nemons threshold.
