# Plugin Development Guide

This guide shows you how to build a Nemons plugin for any coding agent.

## Plugin Contract

Every Nemons plugin must implement these capabilities:

1. **Prompt interception** — detect incoming prompts
2. **HTTP client** — talk to the daemon on `http://127.0.0.1:3456`
3. **Context injection** — add Context Pack before the prompt reaches the agent
4. **Evidence collection** — gather diff, tests, lint after the agent responds
5. **Result reporting** — call `/evaluate` and handle pass/fail

## Minimal Plugin Template (TypeScript)

```typescript
// File: ~/.config/opencode/plugins/nemons.ts
import type { Plugin } from "@opencode-ai/plugin";

const DAEMON = "http://127.0.0.1:3456";

async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${DAEMON}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null; // graceful degradation
  }
}

export const NemonsPlugin: Plugin = async ({ directory }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const prompt = input?.text || "";
      
      // Step 1: Analyze
      const analysis = await call<{ should_intercept: boolean; suggested_pack_id?: string }>("/analyze", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          project_root: directory,
          adapter: "opencode",
        }),
      });
      
      if (!analysis?.should_intercept) return output;
      
      // Step 2: Load Context Pack
      if (analysis.suggested_pack_id) {
        const pack = await call<{ persona: any; skills: any[]; knowledge: string[] }>(
          `/context-pack/${analysis.suggested_pack_id}`
        );
        if (pack) {
          // Inject pack as system context
          output.args = output.args || {};
          output.args.system_context = JSON.stringify(pack);
        }
      }
      
      return output;
    },
    
    "tool.execute.after": async (input, output) => {
      // Step 3: Collect evidence
      const evidence = await collectEvidence();
      
      // Step 4: Evaluate
      const result = await call<{ passed: boolean; failures: string[] }>("/evaluate", {
        method: "POST",
        body: JSON.stringify({
          run_id: `run-${Date.now()}`,
          evidence,
        }),
      });
      
      if (result?.passed) {
        console.log("[nemons] ✓ verified");
      } else if (result) {
        console.warn(`[nemons] ⚠ failed: ${result.failures.join("; ")}`);
      }
      
      return output;
    },
  };
};

async function collectEvidence() {
  // Implement: git diff, test results, lint, type check
  return { collected_at: new Date().toISOString() };
}
```

## Plugin Manifest (for Claude Code)

```json
{
  "name": "nemons",
  "version": "1.0.0",
  "description": "Nemons transparent orchestrator",
  "skills": [
    {
      "name": "nemons-orchestrator",
      "path": "skills/nemons-orchestrator.md",
      "auto_load": true,
      "auto_trigger": true
    }
  ]
}
```

## SKILL.md (for auto-triggering)

```markdown
---
name: nemons-orchestrator
description: |
  Auto-triggers on code-related prompts (build, fix, refactor, etc.)
  Skips trivial prompts (hello, what is, define)
  Runs the full Nemons pipeline transparently.
triggers:
  - "build|implement|add|create"
  - "fix|bug|issue|broken"
  - "refactor|clean|improve"
---

When user requests a code change:
1. POST /analyze with prompt
2. If should_intercept=true, GET /context-pack/{pack_id}
3. Inject pack as system context
4. After agent responds, POST /evidence
5. POST /evaluate, handle pass/fail
6. If passed, POST /experiences
```

## Testing Your Plugin

```bash
# 1. Start the daemon
nemons daemon start

# 2. Verify daemon works
nemons verify

# 3. Start your coding agent
opencode
# or: claude code
# or: codex

# 4. Type a prompt
> implement a hello world function

# 5. Check Nemons logs
tail -f ~/.nemons/logs/daemon.log

# 6. Check stored experiences
nemons experiences list
```

## Best Practices

1. **Graceful degradation** — if daemon is unreachable, plugin should no-op (don't block the agent)
2. **Async + non-blocking** — never make the user wait for Nemons operations
3. **Fail silently** — never crash the agent if Nemons fails
4. **Log to ~/.nemons/logs/** — for debugging
5. **Use bearer token** if daemon requires auth
6. **Respect filters** — skip trivial prompts (hello, what is, etc.)
7. **Cache Context Packs** — don't fetch the same pack repeatedly
