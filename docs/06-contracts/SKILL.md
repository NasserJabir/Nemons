# Contract: Skill

A Skill is a reusable procedural asset for a defined class of tasks.

## Fields

- `skill_id`, `version`, `status`, `purpose`, `scope`, `preconditions`.
- `procedure`, `expected_outputs`, `failure_modes`, `limitations`.
- `required_tools` and capability assumptions.
- `source_refs`, `provenance`, `evidence_refs`.
- `evaluation_records`, `regression_results`, `change_history`.
- `candidate_change_ref` when applicable.

## Change rules

- Each change candidate identifies the reason, source, evidence, exact affected Skill version, expected effect, and evaluation set.
- Use offline evaluation only when appropriate trajectory logs and labels are available.
- Separate proposal data from held-out evaluation data where feasible.
- Action-prediction accuracy is a supporting metric, not sufficient evidence of task success or action correctness.
- A single failure does not justify broad Skill mutation.
- Adoption requires the applicable governance gate; no silent self-modification.
