# Nemos Architectural Principles

## Core Principle: Nemos is a LAYER, not an LLM

Nemos is an orchestration service that a coding agent calls over HTTP/MCP; it is NOT in the model's inference path and does not intercept anything by itself. Given a call, it:

- ✅ Receives prompts from a host adapter or skill (not from a process hook it installs)
- ✅ Injects Context Packs
- ✅ Collects Evidence
- ✅ Runs Verification (heuristic — no LLM)
- ✅ Stores Experiences
- ✅ Manages Trust Factor

It does NOT:
- ❌ Call LLM APIs directly (OpenAI, Anthropic, etc.)
- ❌ Generate code
- ❌ Write responses
- ❌ Require API keys for LLMs
- ❌ Execute subagents (it spawns and dispatches them; the calling agent runs them, unless an executor is injected)

## How Verification Works (v2.5.1+)

The 4-Layer Verification uses heuristics that work WITHOUT any LLM:

1. **Grounding Check**: Text overlap analysis (no LLM needed)
2. **Self-Consistency**: Test result consistency (no LLM needed)
3. **LLM-as-a-Judge**: Builds a "judge prompt" that the CALLER can send through the coding agent's adapter. Nemos does NOT call the LLM directly.
4. **Constraint Verification**: Deterministic checks (no LLM needed)

## LLM-as-a-Judge Pattern (Correct)

```
Nemons builds judge prompt
    ↓
Caller sends prompt through adapter
    ↓
Coding agent evaluates with its OWN LLM
    ↓
Result comes back through adapter
    ↓
Nemons parses the evaluation
```

This ensures:
- Nemons has ZERO LLM API dependencies
- No API keys needed in Nemons config
- The coding agent uses whatever LLM it already has
- Nemons remains a stateless, side-channel service (no agent process is modified)
