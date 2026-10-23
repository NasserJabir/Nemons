# Nemos Architectural Principles

## Core Principle: Nemos is a LAYER, not an LLM

Nemos is a transparent orchestration layer that sits BETWEEN the user and the coding agent. It:

- ✅ Intercepts prompts
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
- Nemons remains a stateless, transparent layer
