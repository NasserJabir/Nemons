---
name: nemons-orchestrator
description: |
  Nemons transparent orchestrator — activate automatically on every code-related
  prompt to inject Context Pack, collect Evidence, run Verification Loop, and
  derive Experiences. Skip for trivial questions, definitions, or non-code prompts.
  
  TRIGGERS when prompt contains: build, implement, add, create, make, fix, bug,
  refactor, clean, improve, optimize, test, deploy, ship, debug, trace, investigate.
  
  SKIPS when: prompt < 20 chars, or matches "what is", "how to", "explain",
  "define", "hi", "hello", "test" (lone word), "thank you".
disable-model-invocation: false
user-invocable: true
---

# Nemons Orchestrator Skill

This skill runs transparently in the background. When a code-related task is
detected, it orchestrates the full Nemons pipeline automatically.

## Auto-Trigger Rules

### Intercept (run full pipeline)
- Prompt length >= 20 characters
- Prompt contains code-intent keywords (build, fix, refactor, test, deploy, debug)
- Prompt references files, functions, or components

### Skip (let agent handle directly)
- Prompt < 20 characters
- Definition questions: "what is X?", "explain Y"
- Greetings or thanks
- Pure documentation reading

## Pipeline (runs on every intercepted prompt)

### Step 1: Pre-flight Analysis
```
GET http://localhost:3456/analyze
body: { prompt, project_root, adapter }
```
Returns: `{ should_intercept: bool, suggested_pack_id: string, similar_experiences: [...] }`

If `should_intercept: false` → exit, let agent respond directly.

### Step 2: Load Context Pack
```
GET http://localhost:3456/context-pack/{pack_id}
```
Returns: `{ persona, skills, knowledge, success_criteria }`

Inject this pack as system context BEFORE the user's prompt reaches the agent.

### Step 3: Execute (via adapter)
Pass the augmented prompt (context pack + user prompt) to the agent.
The agent uses its normal tools and model to generate a response.

### Step 4: Collect Evidence
After the agent responds, collect:
- `git diff` (uncommitted changes)
- `git rev-parse HEAD` (hash before)
- Test results (if applicable)
- Lint results (if applicable)
- Type check results (if TypeScript)

```
POST http://localhost:3456/evidence
body: { run_id, diff, test_results, lint_results, type_check }
```

### Step 5: Evaluate
```
POST http://localhost:3456/evaluate
body: { run_id, evidence }
```
Returns: `{ passed: bool, level: must|should|nice, failures: [...], suggestions: [...] }`

### Step 6: Handle Result
- If `passed: true` → store Experience
- If `passed: false` and `retries < max_retries`:
  - Enrich context with failures + 3 similar past experiences
  - Re-run from Step 3
- If `passed: false` and `retries == max_retries`:
  - Report failure to user with diagnosis

### Step 7: Store Experience (on success)
```
POST http://localhost:3456/experiences
body: { run_id, prompt, context_pack_id, evidence, adapter, derived_skills: [...] }
```

## Important Notes

- Never expose internal Nemons details to the user unless explicitly asked
- Never break the user's flow — work in the background
- If the daemon is unreachable, gracefully degrade to "no-op" mode
- If a step fails, log the error but do not block the agent's response

## User-Visible Feedback

The only thing the user sees is a small status indicator:
- `[nemons: pack=auth-feature, experiences=3/47]` — when running
- `[nemons: skipped (trivial)]` — when skipped
- `[nemons: ✅ verified, experience stored]` — on success
- `[nemons: ⚠ verification failed (2 retries)]` — on failure

## Emergency Disable

If the user says "disable nemons" or "nemons off":
- Set `interception.targets[*].intercept: false` in daemon config
- Subsequent prompts go directly to the agent (no overhead)
