# Non-Goals

The following are outside the current project commitment unless a later, evidence-backed decision changes the boundary:

- Replacing Claude Code, Codex, OpenCode, or other Coding Agent harnesses.
- Reimplementing the model's inner agent loop without demonstrated need.
- Training or fine-tuning model weights.
- Automatically adopting generated Skills, Personas, beliefs, or memories without the required gate.
- Allowing a Persona or Skill to grant authorization.
- Treating an LLM judge as ground truth.
- Treating a passing test as sufficient proof of overall task correctness.
- Creating a fifth memory layer; retain the four established memory-related layers.
- Introducing a database, vector store, daemon, queue, or distributed graph solely because a reference project uses one. Infrastructure requires a specific requirement and evaluation.
- Automatically changing governance, hard-deny rules, identity, capabilities, security boundaries, approval thresholds, or evidence requirements.
- Assuming every task needs Subagents, asynchronous execution, or a large Context Pack.
- Claiming portability or performance before cross-harness evaluation.

These non-goals are scope controls, not claims that such technologies are universally undesirable.
