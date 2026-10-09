# Evaluation Strategy

## Objective
Determine whether Nemons improves cross-agent continuity and governed reuse enough to justify its complexity and overhead.

## Principles
- Repeatable tasks with predefined acceptance criteria.
- Compare against a baseline using the same model/harness where feasible.
- Separate task success from process completion and judge ratings.
- Use paired runs where feasible; report variability, failures, and overhead.
- Avoid leakage between proposal-generation and held-out evaluation data.
- Pin asset, adapter, policy, and environment versions.
- Report negative results and missing telemetry.

## Dimensions
1. Task outcome: acceptance criteria, defects, regressions.
2. Continuity: resume success, missing state, repeated discovery/work.
3. Retrieval: relevance, stale/contradictory exposure, evidence coverage.
4. Governance: quarantine/adoption behavior and hard-deny enforcement.
5. Portability: behavior across supported harnesses/versions.
6. Efficiency: latency, context size/tokens, tool calls, cost where measurable.
7. Reliability: repeatability, recovery, reference integrity.

Action-prediction accuracy is supporting evidence only. An LLM judge is not ground truth.

## Release gate
Require Golden Task results, baseline comparison, regression suite, negative security/governance tests, known limitations, and measured overhead. Numeric thresholds remain open until recorded in a decision.
