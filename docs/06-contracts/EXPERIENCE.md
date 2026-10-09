# Contract: Experience

An Experience records an execution episode; it does not automatically become a Skill, Knowledge claim, or accepted Memory.

## Fields
- `experience_id`, `run_id`, `task_id`, timestamp.
- Initial state, asset versions, adapter version, environment refs.
- Action summary, observed outcome, acceptance result.
- Evidence refs, limitations, missing telemetry.
- Failure attribution: MODEL / HARNESS / SKILL / KNOWLEDGE / TOOL / POLICY / ENVIRONMENT / UNKNOWN.
- Candidate changes and linked evaluation/governance decisions.

## Rules
- Separate observed facts from causal explanations.
- Do not blame a Skill without evidence; multiple causes may contribute.
- One success supports only the observed episode, not a universal rule.
- Keep uncertainty where attribution is unresolved.
