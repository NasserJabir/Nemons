# Plugin Development Guide

This guide shows you how to build a Nemons plugin for any coding agent.

## Plugin Contract

An adapter is only as capable as its host lets it be. The contract below is what
a plugin does **when the host exposes prompt hooks** — several hosts do not, and
for those the same steps happen only if the model calls the MCP tools or follows
an installed skill.

1. **Prompt screening** — look at an incoming prompt
2. **Daemon client** — talk to the daemon over HTTP (`/analyze`, `/evidence`,
   `/evaluate`) or the `nemons.*` MCP tools
3. **Context injection** — add a Context Pack before the prompt reaches the
   agent, where the host allows it
4. **Evidence collection** — gather diff, tests, lint after the agent responds
5. **Result reporting** — evaluate and handle pass/fail

None of this intercepts the model call. If the host never runs the adapter and
the model never calls the daemon, no step happens.

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
      // Note: /analyze already returned the built pack in `context_pack`.
      // Only fetch again if you need the on-disk version by id.
      if (analysis.suggested_pack_id) {
        const pack = await call<{
          persona: any;
          skills: any[];
          knowledge: Array<{ id: string; title: string; score?: number }>;
        }>(`/context-pack/${analysis.suggested_pack_id}`);
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
  "description": "Nemons orchestrator adapter (reference shim)",
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

## SKILL.md (drives skill selection in hosts that support it)

A skill description is how a host decides whether to load the skill; it is not an
interceptor. Use it to tell the model *when* to call the daemon, and say explicitly
in the body that nothing happens unless the daemon is reachable.

```markdown
---
name: nemons-orchestrator
description: |
  Use for code-related prompts (build, fix, refactor, etc.) to call the Nemons
  daemon for a Context Pack, Evidence, and verification.
  Skips trivial prompts (hello, what is, define).
  Requires the daemon at http://127.0.0.1:3456 — nothing runs without it.
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

## Host integration status

`nemons plugin install --agent <name>` behaves per host, and the output says
which kind of run happened.

### Codex CLI — registered as an MCP server, verified against 0.149.1

Codex has no plugin directory; `~/.codex/plugins/` is never read. It reads
`mcp_servers` in `$CODEX_HOME/config.toml` and skills under `$CODEX_HOME/skills/`,
so install does exactly that (`nemos/src/utils/codex-host.js`):

```bash
# written by the host itself
codex mcp add nemons --url http://127.0.0.1:3456/mcp

# read back — a successful add is never taken on its exit code alone
codex mcp list --json   # transport streamable_http, enabled true, url ours
codex doctor            # mcp.config: "MCP configuration is locally consistent"
```

plus `$CODEX_HOME/skills/nemons-orchestrator/SKILL.md`, with the daemon address
rewritten to the port the installer resolved (the rewrite count is printed).
Writing the skill is verified by read-back; Codex choosing to load it is not
ours to claim.

Two behaviours that are not documented anywhere useful:

- `codex mcp add` aborts with "failed to load configuration" if `$CODEX_HOME`
  does not exist yet, so a fresh isolated home has to be created first.
- `auth_status` in `mcp list` is computed by **probing** the endpoint.
  `unsupported` means it answered and needs no auth; `unknown` means the host
  could not reach it — almost always because the daemon is not running. In that
  case `codex doctor` warns "Set the missing MCP env vars", which is misleading.
  For the same reason the installer wires `--bearer-token-env-var NEMONS_AUTH_TOKEN`
  only when the daemon's `/health` reports `auth_enabled: true`: naming a variable
  that is not set produces that warning on every doctor run.

`plugin remove` is confirmed the same way: after `codex mcp remove nemons`, the
server must be absent from the read-back.

### Every other host — files staged, not host-verified

`opencode`, `claude-code`, `kimi`, `cline`, `qoder`, `trae`: install copies files
into a plausible directory and reports `~ files staged`, and `plugin list` will
not call that "installed". Read the host's own plugin documentation before
trusting one. Of these, only OpenCode has a config entry we can write
(`plugin: ["./plugins/nemons"]` in `~/.config/opencode/opencode.json`).

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
