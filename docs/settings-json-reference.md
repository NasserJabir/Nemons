# Settings Reference (`settings.json`)

Reference for all Nemons-relevant settings in `~/.claude/settings.json` (Claude Code configuration).

> **Note:** `settings.json` is Claude Code's own configuration file. The entries documented here are those Nemons requires for operation or sets automatically via `nemons install`.

---

## mcpServers — MCP Server Registration

Registers the Nemons MCP server with Claude Code. Without this entry, no Nemons tools are available.

```json
{
  "mcpServers": {
    "nemons": {
      "command": "~/.local/bin/nemons",
      "args": ["mcp"]
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `command` | Absolute path to the nemons binary. |
| `args` | MCP mode arguments (always `["mcp"]`). |

Set automatically by `nemons install` and updated by `nemons update` via the MCP registration helpers in `internal/setup` (there is no `EnsureMCPRegistration()` function; the merge lives in the settings and opencode-settings writers).

---

## env — Environment Variables

Inherited by every Claude Code session.

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:9099",
    "CLAUDE_CODE_REPL": "true"
  }
}
```

| Variable | Value | Description |
|----------|-------|-------------|
| `ANTHROPIC_BASE_URL` | `http://localhost:9099` | Routes Claude Code through the Nemons proxy instead of directly to the Anthropic API. **Without this entry the proxy does not function.** |
| `CLAUDE_CODE_REPL` | `true` | Enables the REPL environment (required for some features). |

---

## hooks — Hook Registration

Nemons registers hooks for various Claude Code lifecycle events.

### SessionStart

Fires at session start (`startup`, `resume`, `clear`, `compact`).

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "command": "~/.local/bin/nemons briefing-hook",
        "type": "command"
      }],
      "matcher": "startup|resume|clear|compact"
    }]
  }
}
```

| Field | Description |
|-------|-------------|
| `command` | `nemons briefing-hook` — generates the session briefing and injects it into context. |
| `matcher` | Regex for event types that trigger this hook. |

### SessionEnd

Fires at session end. Registered **without a matcher** on purpose: `compact` is not one of the SessionEnd reasons, so it must not be baked into a matcher. The documented reasons are `clear`, `resume`, `logout`, `prompt_input_exit` and `other`; `RunSessionEnd` selects the ones nemons actually tracks.

```json
{
  "SessionEnd": [{
    "hooks": [{
      "command": "~/.local/bin/nemons session-end",
      "type": "command"
    }]
  }]
}
```

| Field | Description |
|-------|-------------|
| `command` | `nemons session-end` — closes the session and triggers the extraction pipeline. |

### PreToolUse

Fires before every tool call.

```json
{
  "PreToolUse": [{
    "hooks": [{
      "command": "~/.local/bin/nemons hook-check",
      "type": "command"
    }],
    "matcher": ".*"
  }]
}
```

| Field | Description |
|-------|-------------|
| `command` | `nemons hook-check` — code-navigation hook (blocks `Bash(find)`, `Bash(grep)`, `Bash(cat)` and suggests MCP code tools). |
| `matcher` | `.*` — applies to all tools. |

### PostToolUse

Fires after a successful tool call.

```json
{
  "PostToolUse": [{
    "hooks": [{
      "command": "~/.local/bin/nemons hook-resolve",
      "type": "command"
    }],
    "matcher": "Bash",
    "if": "Bash(git *)"
  }]
}
```

| Field | Description |
|-------|-------------|
| `command` | `nemons hook-resolve` — after git operations, checks if open tasks can be resolved. |
| `matcher` | `Bash` — only Bash tool calls. |
| `if` | `Bash(git *)` — additional filter, only git commands. |

### PostToolUseFailure

Fires after a failed tool call.

```json
{
  "PostToolUseFailure": [{
    "hooks": [{
      "command": "~/.local/bin/nemons hook-failure",
      "type": "command"
    }],
    "matcher": ".*"
  }]
}
```

| Field | Description |
|-------|-------------|
| `command` | `nemons hook-failure` — processes failed tool calls for learning/analysis. |

### Stop

Fires on session exit (after `/exit`).

```json
{
  "Stop": [{
    "hooks": [{
      "command": "~/.claude/hooks/notify-context.sh",
      "type": "command"
    }]
  }]
}
```

| Field | Description |
|-------|-------------|
| `command` | Notification script (optional, not Nemons-specific). |

### Notification

Fires on certain events (context warnings, etc.).

```json
{
  "Notification": [{
    "hooks": [{
      "command": "~/.claude/hooks/notify-context.sh",
      "type": "command"
    }],
    "matcher": ""
  }]
}
```

### UserPromptSubmit

Carries the idle tick that turns a prompt into a nemons usage reminder when the session has been idle:

```json
{
  "UserPromptSubmit": [{
    "hooks": [{
      "command": "~/.local/bin/nemons idle-tick",
      "type": "command"
    }]
  }]
}
```

---

## permissions — Tool Permissions

Nemons MCP tools require `allow` entries in Claude Code permissions. These are set automatically by `nemons install`.

```json
{
  "permissions": {
    "allow": [
      "mcp__nemons__search",
      "mcp__nemons__remember",
      "mcp__nemons__pin",
      "mcp__nemons__unpin",
      "mcp__nemons__get_pins",
      "mcp__nemons__send_to",
      "mcp__nemons__broadcast",
      "mcp__nemons__deep_search",
      "mcp__nemons__get_session",
      "mcp__nemons__list_projects",
      "mcp__nemons__project_summary",
      "mcp__nemons__get_learnings",
      "mcp__nemons__query_facts",
      "mcp__nemons__related_to_file",
      "mcp__nemons__get_coverage",
      "mcp__nemons__get_project_profile",
      "mcp__nemons__get_self_feedback",
      "mcp__nemons__set_persona",
      "mcp__nemons__get_persona",
      "mcp__nemons__resolve",
      "mcp__nemons__resolve_by_text",
      "mcp__nemons__quarantine_session",
      "mcp__nemons__skip_indexing",
      "mcp__nemons__set_plan",
      "mcp__nemons__update_plan",
      "mcp__nemons__get_plan",
      "mcp__nemons__complete_plan",
      "mcp__nemons__hybrid_search",
      "mcp__nemons__get_compacted_stubs",
      "mcp__nemons__expand_context",
      "mcp__nemons__set_config",
      "mcp__nemons__get_config",
      "mcp__nemons__docs_search",
      "mcp__nemons__list_docs",
      "mcp__nemons__ingest_docs",
      "mcp__nemons__remove_docs",
      "mcp__nemons__scratchpad_write",
      "mcp__nemons__scratchpad_read",
      "mcp__nemons__scratchpad_list",
      "mcp__nemons__scratchpad_delete",
      "mcp__nemons__spawn_agent",
      "mcp__nemons__relay_agent",
      "mcp__nemons__stop_agent",
      "mcp__nemons__resume_agent",
      "mcp__nemons__list_agents",
      "mcp__nemons__get_agent",
      "mcp__nemons__update_agent_status",
      "mcp__nemons__whoami",
      "mcp__nemons__stop_all_agents",
      "mcp__nemons__activate_cap",
      "mcp__nemons__deactivate_cap",
      "mcp__nemons__save_cap",
      "mcp__nemons__get_caps",
      "mcp__nemons__register_caps",
      "mcp__nemons__cap_store",
      "mcp__nemons__get_code_context",
      "mcp__nemons__get_code_snippet",
      "mcp__nemons__get_dependency_map",
      "mcp__nemons__get_file_index",
      "mcp__nemons__get_file_symbols",
      "mcp__nemons__graph_traverse",
      "mcp__nemons__search_code",
      "mcp__nemons__search_code_index",
      "mcp__nemons__dismiss_code_nav",
      "mcp__nemons__dismiss_repl_pattern",
      "mcp__nemons__schedule",
      "mcp__nemons__relate_learnings"
    ],
    "defaultMode": "auto"
  }
}
```

| Field | Description |
|-------|-------------|
| `allow` | List of all permitted Nemons MCP tools, written as `mcp__nemons__<tool>`. |
| `defaultMode` | `auto` is the **classifier** mode: Claude Code decides per tool call instead of prompting for everything. Tools not listed in `allow` are not silently permitted — they go through that decision. |

---

## statusLine — Status Line

Displays Nemons status info in the terminal status line.

```json
{
  "statusLine": {
    "command": "~/.local/bin/nemons statusline",
    "refreshInterval": 2,
    "type": "command"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `command` | string | `nemons statusline` — outputs cache TTL, token stats, collapsing savings, keepalive timeline, session ID. |
| `refreshInterval` | int | Refresh interval in seconds. |
| `type` | string | `command` — command output is displayed in the status line. |

---

## sandbox — Filesystem Permissions

Allows write access within sandbox environments (e.g. agent spawns).

```json
{
  "sandbox": {
    "filesystem": {
      "allowWrite": [
        "/tmp",
        "<your-project-path>",
        "<your-ansible-path>"
      ]
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `filesystem.allowWrite` | List of directories writable from within the sandbox. |

---

## Other Relevant Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `autoCompactEnabled` | bool | `false` | Automatic context compaction (should be `false` since the Nemons proxy manages compaction). |
| `cleanupPeriodDays` | int | `30` | Days until session data is automatically cleaned up. Set high (`99999`) when using the proxy. |
| `enabledPlugins` | object | `{}` | Enabled Claude Code plugins. Nemons needs `superpowers@claude-plugins-official: true` for plan/skill features. |
| `tui` | string | `"default"` | Terminal UI mode. |
| `includeCoAuthoredBy` | bool | `false` | Co-authored-by in commits. |
| `model` | string | — | Default model (e.g. `"opus[1m]"`). |
| `skipAutoPermissionPrompt` | bool | `false` | Skip automatic permission prompts. |

---

> **See also:** `config-reference.md` — all Nemons `config.yaml` settings.
