---
name: nemons-orchestrator
description: |
  Nemons orchestrator. Use on code-related work to inject a Context Pack, collect
  Evidence, run the Verification Loop, and derive Experiences. Skip for trivial
  questions, definitions, or non-code prompts.

  This is a skill description, not an interceptor: hosts that auto-select skills
  may load it on matching prompts, and some hosts require explicit invocation.
  Nothing runs unless the model calls the daemon at http://127.0.0.1:3456.
  
  TRIGGERS when prompt contains: build, implement, add, create, make, fix, bug,
  refactor, clean, improve, optimize, test, deploy, ship, debug, trace, investigate.
  
  SKIPS when: prompt < 20 chars, or matches "what is", "how to", "explain",
  "define", "hi", "hello", "test" (lone word), "thank you".
disable-model-invocation: false
user-invocable: true
---

<!--
  Copy of config/skills/nemons-orchestrator.md.
  The plugin manifest points here because loaders resolve skill paths relative to
  the plugin root. If you edit the skill, update both files — the config copy is
  the source of truth.
-->

# Nemons Orchestrator Skill

This skill tells the model to orchestrate the Nemons pipeline when a code-related
task is detected. It is instructions to the model, not a background process: if
the host does not load this skill, or the model never calls the daemon, nothing
happens.

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
POST http://127.0.0.1:3456/analyze
body: { prompt, project_root, adapter }
```
Returns: `{ should_intercept: bool, suggested_pack_id: string, context_pack: {...} }`

If `should_intercept: false` → exit, let agent respond directly.

### Step 2: Load Context Pack
```
GET http://127.0.0.1:3456/context-pack/{pack_id}
```
Returns: `{ persona, skills, knowledge, success_criteria }`

Use it as system context for the task. (A pack with `is_synthetic: true` was not
retrieved — it is a placeholder, do not present it as project knowledge.)

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
POST http://127.0.0.1:3456/evidence
body: { run_id, evidence: { prompt, response, git_diff, tests_pass, ... } }
```

### Step 5: Evaluate
```
POST http://127.0.0.1:3456/evaluate
body: { run_id, evidence }
```
Returns: `{ pass, failures: [...], layers: {...}, post_run: {...} }`

### Step 6: Handle Result
- If `pass: true` → the daemon already stored the experience and compiled a
  skill **candidate** (it is not usable until approved).
- If `pass: false` and `retries < max_retries`:
  - Enrich context with failures + similar past experiences
  - Re-run from Step 3
- If `pass: false` and `retries == max_retries`:
  - Report failure to user with diagnosis, and the failed constraint names

### Step 7: Store Experience (if you skipped Step 5)
```
POST http://127.0.0.1:3456/experiences
body: { prompt, evidence, adapter, ... }
```

## Important Notes

- Never expose internal Nemons details to the user unless explicitly asked
- Never break the user's flow — if the daemon is unreachable, degrade to a no-op
- If a step fails, log the error but do not block the agent's response
- Generated skills/personas/knowledge are **candidates**: they are not injected
  into later packs until a human approves them

## User-Visible Feedback

The only thing the user sees is a small status indicator:
- `[nemons: pack=<id>, experiences=<n>]` — when running
- `[nemons: skipped (trivial)]` — when skipped
- `[nemons: verified, experience stored]` — on success
- `[nemons: verification failed (2 retries)]` — on failure

## Emergency Disable

If the user says "disable nemons" or "nemons off":
- Set `interception.targets[*].intercept: false` in daemon config (adapter-side),
  or stop the daemon (`nemons daemon stop`)
- Subsequent prompts go directly to the agent (no overhead)
