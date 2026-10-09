# Metrics

Definitions and calculation rules must be versioned with the evaluation protocol. Report numerator, denominator, eligible population, exclusions, and missing telemetry for every rate. Where possible, report paired differences and uncertainty rather than a single aggregate.

| Metric | Definition | Reporting / caution |
|---|---|---|
| Task Acceptance Rate | Eligible runs meeting frozen acceptance criteria / eligible runs | Main outcome measure; freeze rubric before runs |
| Continuation Success | Handoffs completing the continuation task / eligible handoffs | Text similarity alone is insufficient |
| Critical State Recall | Required handoff facts recovered correctly / required facts tested | Report false recall and unsupported additions separately |
| Repeated Work Ratio | Predefined repeated-work units under a condition relative to the chosen baseline | Define what counts as repeated work; lower is generally better |
| Stale Claim Exposure | Opportunities where stale claims are presented as current verified facts / relevant stale-claim opportunities | Lower is better; test before sensitive reuse |
| Correct Abstention Rate | Cases requiring abstention that are correctly left unasserted / eligible abstention cases | Preserve source evidence; do not equate abstention with deletion |
| Evidence Coverage | Required claims/actions with adequate linked evidence / total claims/actions requiring evidence | Link existence alone does not establish adequacy |
| Provenance Completeness | Required records with resolvable source and version / required records | Never count guessed references |
| Candidate False Acceptance | Unsupported or unsafe candidates incorrectly promoted / reviewed candidates | Slice by information category and risk |
| Regression Rate | Previously passing held-out tasks that fail after a change / previously passing held-out tasks | Pin baseline and task versions |
| Hard-Deny Correctness | Correct denials / prohibited-action attempts | Include prompt-injection and claimed-prior-approval bypass attempts |
| False Denial Rate | Safe, allowed actions incorrectly denied / eligible safe-action attempts | Evaluate alongside hard-deny correctness |
| Retrieval Utility | Paired outcome difference attributable to retrieval under matched conditions | Relevance ratings alone are insufficient |
| Required-Constraint Retention | Required constraints preserved in the curated Context Pack / required constraints supplied | Report dropped constraints even when task passes |
| Schema Conformance | Tool results conforming to the declared schema / tool results evaluated | Also report whether malformed results fail safely |
| Action-Verification Block Rate | Prohibited/unsafe candidate actions blocked before execution / eligible prohibited/unsafe candidates | Deferred metric; does not replace deterministic policy tests |
| Action-Verification False Block Rate | Safe candidate actions incorrectly blocked / eligible safe candidates | Report verifier version and added latency/cost |
| Run-to-Run Variability | Dispersion of outcomes/cost across repeated matched runs | Select and disclose an appropriate statistic; do not hide failures |
| Latency | Elapsed time measured under a declared start/stop rule | Report median and distribution, not only best case |
| Token Use | Input/output tokens where the provider exposes them | Record missing or incomparable telemetry |
| Tool Calls | Number of tool invocations per run, with retries distinguished where possible | More calls are not automatically worse if quality improves |
| Cost | Measured or consistently estimated per-run cost | State pricing/date and estimation method; do not equate token count with total cost |
| Action-Prediction Accuracy | Correct predicted actions / evaluated predictions | Supporting diagnostic only, not proof of task success |

## Reporting slices

Where relevant, break results down by:
- Model and model configuration.
- Coding Agent/harness and version.
- Nemons/Adapter/policy/asset versions.
- Golden Task and difficulty/risk category.
- Baseline condition and run.
- Failure attribution: MODEL, HARNESS, SKILL, KNOWLEDGE, TOOL, POLICY, ENVIRONMENT, UNKNOWN.

No numeric targets are fixed. Set thresholds after baseline and pilot runs, then record the rationale and decision in an ADR.
