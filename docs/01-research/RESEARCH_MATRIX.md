# Research Matrix

This matrix separates a research finding from the Nemons-specific decision. Statuses are design recommendations, not claims made by the cited papers. The October 2026 additions are preliminary reviews of accessible paper pages/abstracts; verify full methods and limitations before treating reported results as implementation evidence.

| Research direction / source | Potential contribution | Transfer limitation | Nemons treatment | Evidence needed |
|---|---|---|---|---|
| Cognitive agent architectures (CoALA) | Vocabulary for memory and action organization | Conceptual model does not prescribe a production runtime | Use as framing; preserve current memory boundaries | Trace concepts to existing contracts |
| Memory read/write/manage lifecycle | Separate admission, retention, retrieval, and curation | Provider-specific memory products may imply unnecessary infrastructure | Model as policy and contracts first | Test lifecycle against representative cases |
| Category-conditioned retention | Category-aware admission and retention | Thresholds may not transfer across categories or risk levels | Adopt the principle; calibrate thresholds experimentally | Labeled examples, held-out review, risk-tiered tests |
| Task-adaptive retrieval (HERMES lead) | Select relevant assets by task and dependency | Selection accuracy and overhead need measurement | Candidate design for retrieval experiments | Paired tasks, relevance and cost metrics |
| Stage-level verification (VERA lead) | Evidence at meaningful execution stages | Automated rubric generation can introduce judge bias | Use explicit acceptance criteria and regression checks | Independent criteria and regression results |
| Multi-agent shared context (DeLM lead) | Compact updates and shared verified progress | Concurrency and conflicts add complexity | Scope to a Run; durable adoption remains governed | Versioned updates and conflict cases |
| Offline Skill evaluation (TeleTune lead) | Evaluate Skills using suitable historical traces | UI-agent methods may not transfer to coding tasks | Candidate experiment with coding-agent traces | Held-out tasks, attribution, regression checks |
| Self-improvement research | Bounded candidate generation and testing | Can overfit tasks or mutate unsafe policies | Never bypass governance or hard-deny controls | Explicit approval and audit trail |
| Repository instruction files | Local, portable instructions | Instructions are not a runtime or a guarantee of enforcement | Use as Adapter inputs, not as Nemons itself | Cross-harness portability tests |
| Continuous Memory Machines (CMM) | Recurrent short-/long-term learned memory | Neural state architecture differs from file-based governed Memory; adds complexity | Context only; do not add a memory layer | Revisit only if current retrieval/storage fails a measured need |
| Context Language Models (CLM) | Task-adaptive editing/curation of active context | Unrestricted editing may remove critical constraints; reported benchmarks may not transfer | Candidate experiment for temporary Context Pack only | Compare curated vs baseline context on paired tasks; verify source preservation |
| SkillRefiner | Mine historical traces and failure clusters to propose Skill edits | Trace clustering can misattribute causes or overfit; token savings are not total-cost savings | Candidate offline refinement pipeline, not automatic adoption | Provenance, causal attribution, held-out regression, review gate |
| MIMESIS user simulation | Repeatable multi-turn interactive evaluation | Simulator fidelity and distribution shift can mislead evaluation | Defer until interaction testing is a demonstrated need | Compare simulator outcomes with real/user-authored scenarios |
| Base-model performance prediction | Probe decisive actions before expensive agentic evaluations | Small cohorts and benchmark-specific correlations may not generalize | Evaluation context; separate model effects from harness/Skill/environment | Larger varied cohorts and cross-task validation |
| Harness cost and variance | Harness comparisons and cost awareness | Results depend on versions, prompts, tasks, and run noise | Adopt paired repeated evaluation and cost accounting | Repeated runs, fixed task set, exact version metadata |
| Coco typed tools and normalized records | Structured tool interfaces and queryable evidence | Hardware/software co-design platform is domain-specific | Use as a Tool/Evidence/Provenance contract reference only | Validate typed outputs and source-linked claims in coding tasks |
| Mid-Harness action verification | Verify candidate terminal actions before execution | Requires interception point; verifier errors and overhead can outweigh gains | Later bounded Adapter experiment; never replace deterministic policy checks | Measure unsafe-action blocking, false blocks, task success, latency, cost |

## Research-to-decision rule

Every adopted principle should have: (1) a source, (2) a statement of what the source actually supports, (3) transfer limitations, (4) a Nemons-specific choice, and (5) an evaluation plan. Absence of evidence is an open question, not permission to invent a requirement.

## Current implementation priority

1. **Evaluation baseline first:** paired/repeated runs, task acceptance criteria, model/harness/version metadata, latency, token/cost, and tool-call counts.
2. **Offline Skill refinement second:** propose bounded candidates from historical traces, attribute failures before editing, evaluate on held-out tasks, and require a governed adoption step.
3. **Temporary Context Pack curation third:** compare task-adaptive curation against a fixed baseline while protecting durable Memory and governance.
4. **Action verification later:** prototype only if the Adapter can intercept the relevant actions and measure overhead and verifier errors.
5. **Defer by default:** learned user simulators and CMM-style neural memory architecture until a concrete Nemons need is demonstrated.

These priorities do not authorize changes to approved architecture, governance, identity, authorization, hard-deny, provenance, or evidence rules.
