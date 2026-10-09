# Research Matrix

| Research direction | Potential contribution | Transfer limitation | Nemons treatment |
|---|---|---|---|
| Cognitive agent architectures (CoALA) | Vocabulary for memory and action organization | Conceptual model does not prescribe a production runtime | Use as framing; preserve current memory boundaries |
| Memory read/write/manage lifecycle | Separate admission, retention, retrieval, and curation | Provider-specific memory products may imply unnecessary infrastructure | Model as policy and contracts first |
| Category-conditioned retention | Category-aware admission and retention | Thresholds may not transfer across categories or risk levels | Adopt the principle; calibrate thresholds experimentally |
| Task-adaptive retrieval (HERMES lead) | Select relevant assets by task and dependency | Selection accuracy and overhead need measurement | Candidate design for retrieval experiments |
| Stage-level verification (VERA lead) | Evidence at meaningful execution stages | Automated rubric generation can introduce judge bias | Use explicit acceptance criteria and regression checks |
| Multi-agent shared context (DeLM lead) | Compact updates and shared verified progress | Concurrency and conflicts add complexity | Scope to a run; durable adoption remains governed |
| Skill evaluation (TeleTune lead) | Offline evaluation and evidence-linked changes | UI-agent methods may not transfer to coding tasks | Evaluate with coding-agent trajectories and held-out tasks |
| Self-improvement research | Bounded candidate generation and testing | Can overfit tasks or mutate unsafe policies | Never bypass governance or hard-deny controls |
| Repository instruction files | Local, portable instructions | Instructions are not a runtime or a guarantee of enforcement | Use as adapter inputs, not as Nemons itself |

## Research-to-decision rule

Every adopted principle should have: (1) a source, (2) a statement of what the source actually supports, (3) transfer limitations, (4) a Nemons-specific choice, and (5) an evaluation plan. Absence of evidence is an open question, not permission to invent a requirement.
