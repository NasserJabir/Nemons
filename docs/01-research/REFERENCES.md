# Research References

These references inform design hypotheses; a reference is not an automatic product requirement. Transfer to coding-agent workflows must be justified and tested. Recent-paper entries below are an **initial review of accessible abstracts and paper pages**, not a claim that every full paper, appendix, or experiment has been independently verified.

## Agent architecture and memory

- **CoALA: Cognitive Architectures for Language Agents** — https://arxiv.org/abs/2309.02427  
  Conceptual framing for agent memory and action architecture.
- **Mem0** — https://github.com/mem0ai/mem0 and https://docs.mem0.ai/  
  Inspect memory operations and integration patterns; adopting its storage/architecture is not required.
- **AGENTS.md** — https://agents.md/  
  Repository-local agent instructions; not a replacement for runtime enforcement.
- **Why Do Multi-Agent LLM Systems Fail? (MAST)** — https://arxiv.org/abs/2503.13657 and https://github.com/multi-agent-systems-failure-taxonomy/MAST  
  Failure taxonomy and trace analysis; useful for evaluation design, not a direct Nemons architecture specification.
- **Darwin Gödel Machine** — https://arxiv.org/abs/2505.22954  
  Relevant to self-improvement and evaluation constraints; not permission for unrestricted self-modification.
- **Awesome Self-Evolving Agents** — https://github.com/EvoAgentX/Awesome-Self-Evolving-Agents  
  Discovery index only; verify primary sources individually.

## Recent research leads considered in project discussions

- **HERMES** — https://arxiv.org/abs/2610.07832  
  Design leads: task-adaptive activation, dependency-aware asset selection, evidence-to-component attribution, bounded changes. Do not infer every file needs a Dev-Primitive or every component needs its own LLM.
- **VERA** — https://arxiv.org/abs/2610.05923  
  Design leads: stage-level evidence, paired evaluation, regression checks, separation of generation, verification, and adoption. Auto-generated rubrics and replay from saved state remain experiments, not requirements.
- **DeLM** — https://arxiv.org/abs/2606.10662  
  Design leads: shared verified context within a run, compact structured updates, asynchronous independent work where justified, conflict resolution using source/version/evidence, and separation of temporary shared context from durable memory.
- **TeleTune** — https://arxiv.org/abs/2610.05437  
  Design leads: offline skill evaluation when suitable logs exist, separation of proposal and evaluation data where possible, regression checks, and evidence-linked skill candidates. Action-prediction accuracy is a supporting indicator, not proof of task success; transfer from UI agents to coding agents must be tested.
- **Category-Conditioned Memory Retention** — https://arxiv.org/abs/2610.07100  
  Design lead: retention and admission policy should depend on information category. Nemons must calibrate its own policy rather than importing unvalidated thresholds.

## October 2026 review: additional papers

The status labels below are Nemons-specific recommendations, not claims that the papers themselves prescribe these product decisions.

- **Continuous Memory Machines (CMM)** — https://arxiv.org/abs/2610.07907  
  Studies a recurrent neural architecture with short- and long-term matrix-valued memory states. **Treatment: context only.** It is not evidence that Nemons needs another memory layer or should replace its Markdown Source of Truth.
- **Context Language Models (CLM)** — https://www.alphaxiv.org/abs/2609.37725  
  Explores models that manage and edit an active context. **Treatment: candidate experiment.** Test task-adaptive curation in a temporary Context Pack; do not grant unrestricted edits to durable Memory, governance, or source-of-truth assets.
- **SkillRefiner: Offline Skill Refinement from Historical Agent Traces** — https://www.alphaxiv.org/abs/2610.skillrefiner-offline-skill-refinement  
  Uses historical traces and failure clusters to propose and evaluate Skill edits. **Treatment: candidate experiment.** Require trace provenance, causal attribution, held-out regression tasks, and a separate adoption gate. Reported token-efficiency gains are paper-specific and do not establish lower wall-clock time or total compute in Nemons.
- **MIMESIS: Learning User Simulators as Training Environments for Interactive Agents** — https://arxiv.org/abs/2610.09484  
  Studies learned user simulation for training interactive agents. **Treatment: deferred evaluation option.** Consider only if Nemons needs repeatable tests of multi-turn interaction, ambiguity, or user-response handling; not an MVP runtime component.
- **Before They Can Solve: Predicting Post-Training Coding-Agent Performance from Base Models** — https://www.alphaxiv.org/abs/2610.10478  
  Investigates predicting later coding-agent performance from probes of decisive actions. **Treatment: evaluation context.** It motivates separating model capability from harness/Skill/environment effects, but small-cohort correlations are not a universal predictor or a runtime policy.
- **What Does a Harness Buy? Tokens, Mostly** — https://arxiv.org/abs/2610.04433  
  Compares models and coding harnesses, highlighting cost and run variability. **Treatment: adopt evaluation principles.** Record model, harness, task, token/cost, latency, and tool-call metadata; use paired repeated runs rather than conclusions from a single run.
- **Coco: An Agentic Copilot for the Hardware–Software Co-Design Lifecycle** — https://arxiv.org/abs/2610.02376  
  Describes typed tools and normalized, queryable records for workflow results. **Treatment: adopt as a contract-design reference only.** Strengthen typed Tool outputs and evidence/provenance links; do not copy its domain-specific platform architecture.
- **Mid-Harness: Scaling Actions Between Model and Harness for Terminal Agents** — https://arxiv.org/abs/2609.39982  
  Studies sampling candidate actions and verifying them before execution. **Treatment: later, bounded experiment.** Evaluate only where an Agent Adapter can intercept actions. Probabilistic verification must never override deterministic hard-deny rules or authorization policy.

## Source-quality rule

Before a research result becomes a design rationale, record its exact title, authors, version/date, method, evidence, limitations, and the specific Nemons decision it informs. Prefer primary papers and official project documentation over secondary summaries. Re-check bibliographic details and full experimental methods before implementation decisions; do not infer product requirements directly from a paper.
