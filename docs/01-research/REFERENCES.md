# Research References

This file records references relevant to design hypotheses. A reference is not an automatic product requirement; transfer to coding-agent workflows must be justified and tested.

## Agent architecture and memory

- **CoALA: Cognitive Architectures for Language Agents** — https://arxiv.org/abs/2309.02427  
  Useful conceptual framing for agent memory and action architecture.
- **Mem0** — https://github.com/mem0ai/mem0  
  A memory-system implementation to examine for memory operations and integration patterns; not a mandate to adopt its storage or architecture.
- **Mem0 Agent Mode / MCP** — https://docs.mem0.ai/  
  Investigate tool-mediated memory access and integration boundaries in the current official documentation.
- **AGENTS.md** — https://agents.md/  
  Relevant to repository-local instructions and the risks of treating instruction files as an unlimited context solution.
- **MAST: A Multi-Agent System Failure Taxonomy** — https://arxiv.org/abs/  
  Research lead to verify exact bibliographic details before relying on it; do not cite this placeholder as a validated source.
- **Darwin Gödel Machine** — https://arxiv.org/abs/2505.22954  
  Relevant to self-improvement and evaluation constraints; not permission for unrestricted self-modification.
- **Awesome Self-Evolving Agents** — https://github.com/EvoAgentX/Awesome-Self-Evolving-Agents  
  Discovery index only; verify primary sources individually.

## Recent research leads considered in project discussions

- **HERMES** — https://arxiv.org/abs/2610.07832  
  Design leads: task-adaptive activation, dependency-aware asset selection, evidence-to-component attribution, bounded changes. Do not infer that every file needs a Dev-Primitive or every component needs its own LLM.
- **VERA** — https://arxiv.org/abs/2610.05923  
  Design leads: stage-level evidence, paired evaluation, regression checks, separation of generation, verification, and adoption. Auto-generated rubrics and replay from saved state remain experiments, not requirements.
- **DeLM** — https://arxiv.org/abs/2606.10662  
  Design leads: shared verified context within a run, compact structured updates, asynchronous independent work where justified, conflict resolution using source/version/evidence, and separation of temporary shared context from durable memory.
- **TeleTune** — https://arxiv.org/abs/2610.05437  
  Design leads: offline skill evaluation when suitable logs exist, separation of proposal and evaluation data where possible, regression checks, and evidence-linked skill candidates. Its action-prediction accuracy is a supporting indicator, not proof of task success; transfer from UI agents to coding agents must be tested.
- **Category-Conditioned Memory Retention** — https://arxiv.org/abs/2610.07100  
  Design lead: retention and admission policy should depend on information category. Nemons must calibrate its own policy rather than importing unvalidated thresholds.

## Source-quality rule

Before a research result becomes a design rationale, record its exact title, authors, version/date, method, evidence, limitations, and the specific Nemons decision it informs. Prefer primary papers and official project documentation over secondary summaries. Resolve incomplete or suspect references before citing them in a decision record.
