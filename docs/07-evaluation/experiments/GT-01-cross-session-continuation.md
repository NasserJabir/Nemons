# GT-01 — Cross-session Continuation Experiment

- **Status:** Protocol draft; not yet executable and no results collected.
- **Golden Task:** GT-01
- **Protocol version:** 0.1.0
- **Primary question:** Does an explicit handoff improve correct continuation of a bounded task in a fresh session, compared with relying on the native Coding Agent harness and repository state alone?
- **Nemons claim under test:** A Nemons-managed handoff/Context Pack should preserve task-critical state across sessions with acceptable overhead. This claim cannot be tested until a real Nemons condition exists.
- **Scope:** Same Coding Agent harness and model configuration across conditions. Cross-harness portability is GT-02, not part of this experiment.

## 1. Hypotheses

- **H1 — Continuity:** A handoff condition improves continuation success and critical-state recall compared with the native-harness condition.
- **H2 — Rework:** A handoff condition reduces repeated discovery/work without increasing unsupported assumptions.
- **H3 — Cost trade-off:** Any quality/rework improvement is reported alongside handoff size, elapsed time, token use, tool calls, and cost where telemetry exists.
- **Null / inconclusive:** The observed difference is absent, inconsistent across paired runs, or smaller than the variability that can be resolved by the pilot. Do not claim improvement from a single favorable run.

These are hypotheses, not established properties of Nemons.

## 2. Conditions

Run the smallest comparison that answers the question. Keep model, harness, fixture, environment, acceptance rubric, and checkpoint identical.

| ID | Condition | What session B receives |
|---|---|---|
| B0 | Native harness | The fixture repository at the frozen checkpoint, the original task statement, and only the context naturally available to a fresh session under the declared harness setup. No session-A transcript or authored handoff. |
| B1 | Manual handoff | The same repository and task statement, plus a concise handoff written by a human from session A's recorded state. |
| N1 | Nemons handoff/context | Reserved for a later run after Nemons can generate a versioned handoff/Context Pack. Must not be simulated and labeled as an implemented Nemons result. |

**Important:** B0 must be configured so session B truly cannot access session A's transcript, hidden session state, or unrecorded notes. If the harness automatically carries any of these across sessions, document it as a confound and correct the setup before counting results.

## 3. Candidate task fixture

The fixture must be a small, versioned repository created specifically for evaluation—not the live Nemons source tree. Choose a bounded software task with deterministic acceptance checks and enough meaningful intermediate state to require a handoff.

Recommended task shape: add one narrowly scoped behavior to a small utility module, with tests and a short implementation note. Session A performs the initial investigation and a predeclared subset of the work, then stops at a frozen checkpoint. Session B must inspect the repository, reconstruct the current state, and finish the task.

The exact task, repository commit, tests, and checkpoint are **not yet selected or committed**. Do not start scored runs until these are pinned. The fixture should contain:
- A clear task statement and explicit exclusions.
- A small codebase with a reproducible setup and test command.
- Acceptance tests that check behavior, not similarity to a reference patch.
- At least one recorded decision or constraint that is not fully inferable from the current diff alone.
- A predefined checkpoint that leaves useful work for session B without making the task impossible.
- A known-good solution or rubric kept separate from the prompt shown to the Coding Agent.
- No credentials, personal data, or external service dependency.

Avoid a task whose main difficulty is domain knowledge, large-scale exploration, network access, or ambiguous product judgment. The first experiment is about continuity, not general coding ability.

## 4. Session protocol

### Phase A — Freeze

Before running:
1. Assign fixture ID and version; record repository commit and reset procedure.
2. Freeze task prompt, checkpoint instructions, acceptance criteria, and scoring rubric.
3. Pin model/provider, model settings where available, Coding Agent/harness and version, OS/runtime/toolchain, and test command.
4. Define the run order and repetition rationale based on pilot variability and cost.
5. Create a run record for every planned run, including failures and missing telemetry.
6. Record the intended comparison and confounds before inspecting results.

### Phase B — Session A

1. Start from a clean reset of the fixture.
2. Give session A the frozen task prompt and checkpoint instruction.
3. Let it investigate and perform only the allowed initial work.
4. At the checkpoint, save the repository state and record the exact commit/diff.
5. Capture the session-A trace for evaluation only. Do not expose it to B0.
6. For B1, have a human produce the handoff using only information available at the checkpoint. Record authoring time and handoff size.
7. Do not allow session A to continue after producing the checkpoint artifacts.

### Phase C — Session B

1. Start a genuinely fresh conversation/session with the same pinned configuration.
2. Restore the exact frozen checkpoint repository state.
3. Provide only the artifacts permitted by the assigned condition.
4. Ask session B to continue and finish the original task. Do not add condition-specific hints.
5. Save the final diff, test output, session trace, and available telemetry.
6. Record all deviations, tool errors, timeouts, and human interventions.

Use matched run instances for each condition where practical. Reset the fixture between runs; never let one condition inherit files or notes created by another condition.

### Phase D — Score

1. Run the frozen automated tests and any static checks.
2. Score each acceptance criterion independently of the model's self-assessment.
3. Score critical-state recall against the frozen list of required facts/constraints.
4. Count repeated-work units using the predefined rubric; do not infer rework from transcript length alone.
5. Record unsupported assumptions, omitted constraints, and unrequested changes.
6. Review uncertain or high-impact outcomes manually. Label any LLM-judge output as judge-derived and non-authoritative.
7. Calculate per-condition outcomes and paired differences; report sample count and variability.

## 5. Acceptance rubric

Freeze the specific checks with the fixture before scored runs. At minimum, score these dimensions separately:

| Dimension | Scoring rule |
|---|---|
| Task acceptance | Pass/fail against each frozen behavioral acceptance criterion; report overall pass only if all required criteria pass. |
| Continuation success | Session B completes the required task from the checkpoint without unauthorized help or hidden access to session A. |
| Critical-state recall | Correctly preserves each item in a frozen list of decisions, constraints, known facts, and next steps. Report false recall separately. |
| Repeated work | Count only predefined repeated-work units, such as repeating an already completed investigation or redoing checkpoint work without need. |
| Unsupported assumptions | Count claims/actions not supported by task, repository, handoff, or permitted evidence; classify severity. |
| Scope discipline | Record changes outside the task scope and violations of explicit constraints. |
| Overhead | Handoff authoring time and size; session-B elapsed time, tokens, tool calls, and cost where measurable. |

Do not collapse all dimensions into a single opaque score. If an aggregate is later useful, publish its formula and weights before evaluation and retain the underlying metrics.

## 6. Required telemetry

One record per run, with paired-run and condition identifiers:

- Experiment/protocol version, fixture ID/version, repository commit, and reset result.
- Condition (B0/B1/N1), pair ID, run ID, timestamp, and outcome status.
- Model/provider/configuration and available token counts.
- Coding Agent/harness name/version and session isolation method.
- OS, language/runtime/toolchain, test command, and relevant environment versions.
- Session-A checkpoint commit/diff and session-B final commit/diff.
- Handoff text or immutable artifact reference, byte/token count, and human authoring time for B1.
- Acceptance test results and static-check results.
- Critical-state recall items: recovered / missed / contradicted / unsupported.
- Repeated-work units and rationale; unsupported assumptions and scope deviations.
- Start/stop timestamps, elapsed time, tool calls, retries, and cost with measurement basis where available.
- Human interventions, failures, timeouts, exclusions, missing telemetry, and reason.
- Failure attribution: MODEL / HARNESS / SKILL / KNOWLEDGE / TOOL / POLICY / ENVIRONMENT / UNKNOWN, with evidence and confidence. Use UNKNOWN when evidence is insufficient.

Do not estimate unavailable token/cost data silently. Mark it missing and report the coverage of the metric.

## 7. Reset and isolation requirements

The fixture is not yet committed, so this section is a required implementation checklist rather than a verified procedure.

- Reset to the exact fixture commit before every session-A run.
- Save session A's checkpoint as an immutable commit or patch and restore that exact state for each session-B condition.
- Use a fresh session identity for every session B.
- Clear or isolate harness-specific conversation state, workspace notes, caches that can contain task-specific information, and environment variables where feasible.
- Verify B0 cannot read the B1 handoff or session-A trace.
- Verify B1 receives no additional repository changes beyond the same checkpoint and the permitted handoff.
- Keep run artifacts in condition-specific directories; do not share mutable output files.
- Run a reset smoke check and record its result before each scored run.

If isolation cannot be demonstrated, mark the run invalid for the primary comparison and document why; do not quietly exclude it.

## 8. Analysis and decision rules

Report at least:
- Task acceptance and continuation success by condition.
- Critical-state recall, false recall, repeated work, unsupported assumptions, and scope deviations.
- Handoff size/authoring time and session-B latency, tokens, tool calls, and cost where available.
- Paired differences, number of runs, variability, failures, exclusions, and missing telemetry.
- Confounds and attribution limits.

Interpretation:
- **Promising pilot:** B1 shows a repeatable direction of improvement on continuity or rework without a material increase in unsupported assumptions or task failures. This justifies further evaluation, not a Nemons product claim.
- **Regression:** The handoff causes dropped constraints, unsupported assumptions, lower task acceptance, or disproportionate overhead.
- **Inconclusive:** Results are inconsistent, the sample is too small to distinguish the effect from variability, or isolation/telemetry is inadequate.
- **Nemons evidence:** No claim about N1 is permitted until a real Nemons implementation generates the tested artifact and its exact revision/assets are pinned.

Numeric thresholds are intentionally open. After an unscored pilot, document the proposed thresholds and rationale in an ADR before the scored evaluation. Do not tune the fixture or rubric after observing scored results without incrementing the protocol version and clearly separating the new experiment.

## 9. Threats to validity

- **Harness carryover:** A fresh-looking session may still inherit conversation or workspace state.
- **Task leakage:** Session B may infer the intended decision from artifacts, or the hidden solution may leak into the prompt.
- **Human handoff bias:** The author may unintentionally include extra expertise or hints; record authoring rules and time.
- **Task difficulty:** One task cannot establish general continuity performance.
- **Stochasticity:** A single run cannot separate intervention effects from model variance.
- **Scoring bias:** Subjective judgments may favor a condition; prefer deterministic checks and blind manual scoring where practical.
- **Tool/environment variance:** Versions, filesystem state, caches, and command availability may affect outcomes.
- **Attribution uncertainty:** A failed continuation does not automatically imply a memory or handoff failure; use the attribution categories and preserve UNKNOWN.

## 10. Run log template

Copy one record per run and preserve the original records.

| Field | Value |
|---|---|
| Experiment / protocol version | GT-01 / 0.1.0 |
| Fixture ID / version / commit | TBD |
| Condition / pair ID / run ID | TBD |
| Model and configuration | TBD |
| Coding Agent / harness version | TBD |
| Nemons / Adapter / asset versions | N/A for B0/B1; mandatory for N1 |
| Reset and isolation verified | TBD |
| Session-A checkpoint commit | TBD |
| Handoff artifact and size | N/A for B0; record for B1/N1 |
| Acceptance criteria passed | TBD |
| Critical-state recall / false recall | TBD |
| Repeated-work units | TBD |
| Unsupported assumptions / scope deviations | TBD |
| Latency / tokens / tool calls / cost | TBD or explicitly unavailable |
| Failures / exclusions / missing telemetry | TBD |
| Failure attribution and evidence | TBD |
| Reviewer / scoring date | TBD |
| Notes / deviations | TBD |

## 11. Readiness checklist

Do not label this experiment executable until all mandatory items are complete:

- [ ] Fixture repository and versioned task prompt exist.
- [ ] Deterministic reset procedure is tested.
- [ ] Checkpoint and session-isolation procedure is verified.
- [ ] Acceptance tests and scoring rubric are frozen.
- [ ] Required critical-state items and repeated-work units are defined.
- [ ] Telemetry capture is tested and missing fields are handled.
- [ ] B0 and B1 run instructions are reproducible.
- [ ] Pilot run count and rationale are documented.
- [ ] Run log location and artifact retention are defined.
- [ ] Any proposed numeric thresholds are recorded in an ADR before scored runs.

## Current conclusion

**Protocol only. No fixture has been committed, no run has been executed, and no performance result is available.** The next implementation step is to create the isolated fixture and test the reset/session-isolation procedure. Only then should an unscored pilot be run.
