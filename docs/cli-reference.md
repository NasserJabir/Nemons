# Nemons CLI Reference

All commands. Data directory defaults to `~/.claude/nemons` (overridable via `NEMONS_DATA_DIR`).

## Core Services

| Command | Flags/Args | Description |
|---------|------------|-------------|
| `nemons daemon` | `--replace`, `-r` — force restart; `--http` — enable HTTP API | Run background indexer with file watching |
| `nemons mcp` | *(none)* | Start MCP server on stdio |
| `nemons proxy` | `--port N` — listen port; `--threshold N` — token threshold; `--target URL` — upstream API; `--openai-target URL` — OpenAI upstream; `--keep-recent N` — messages to always keep; `--reset-cache` — clear persisted frozen stubs | Start infinite-thread context-collapse proxy |
| `nemons stop` | `[daemon\|proxy\|all]` (default: all) | Stop running nemons processes |
| `nemons restart` | *(none)* | Stop all processes, clean stale sockets, start daemon fresh |
| `nemons worker` | *(none)* | Start long-lived worker process (stdin/stdout JSON-RPC: `store`, `extract`, `json_cli`, `ping` ops) |

## Setup & Status

| Command | Flags/Args | Description |
|---------|------------|-------------|
| `nemons install` / `nemons setup` | `-i`, `--interactive` | Interactive install wizard (model → provider → confirm) |
| `nemons uninstall` | *(none)* | Remove all Nemons registrations, restore pre-install auth state |
| `nemons status` | *(none)* | Show index and daemon status |
| `nemons version` | *(none)* | Show version |
| `nemons statusline` | *(none)* | Claude Code status bar (reads JSON from stdin, auto-refresh) |

## Update & Migration

| Command | Flags/Args | Description |
|---------|------------|-------------|
| `nemons check-update` | *(none)* | Check if a newer version is available on GitHub Releases |
| `nemons update` | *(none)* | Download, verify, install latest version, restart services |
| `nemons migrate` | *(none)* | Post-update migration: DB schema, directories, config merge, hooks, skills, caps, plugin |
| `nemons migrate-project` | `<from> <to>`; `--no-backup`; `--dry-run`; `--to-path PATH` | Rename project across all tables (sessions, learnings, profiles, etc.) |
| `nemons migrate-messages` | *(none)* | Move messages from nemons.db to separate messages.db + FTS5 index |

## Backup

| Command | Flags/Args | Description |
|---------|------------|-------------|
| `nemons backup` | `[path]` — output directory (default: `~/.claude/nemons/backups/`) | VACUUM INTO timestamped backup of nemons.db and runtime.db |

## Briefing & Persona

| Command | Flags/Args | Description |
|---------|------------|-------------|
| `nemons briefing` | `--project P`; `--recover SESSION_ID`; `--source clear\|compact` | Generate session briefing as JSON for hooks |
| `nemons bootstrap-persona` | `--force`, `-f`; `--reset`; `--limit N`, `-l N`; `--all` | Extract persona traits from learnings + LLM signal extraction |
| `nemons synthesize-persona` | *(none)* | Force re-synthesis of persona directive (uses quality/Opus model) |
| `nemons regenerate-narratives` | *(none)* | Re-generate all session narratives with immersive prompt |

## Extraction & Maintenance

| Command | Flags/Args | Description |
|---------|------------|-------------|
| `nemons quickstart` | `--last N`, `-l N` | Fast extraction of last N sessions (7-phase bootstrap) |
| `nemons reextract` | `--project P`, `-p P`; `--last N`, `-l N`; `--dry-run`, `-n` | Re-run extraction on existing sessions, superseding old learnings |
| `nemons embed-learnings` | `--force`, `-f`; `--all`, `-a`; `--batch-size N`, `-b N`; `--throttle DUR`; `--no-throttle` | Bulk-embed learnings into vector store via configured provider |
| `nemons resolve-stale` | `--dry-run`, `-n` | List/resolve stale unfinished items (>30 days old) |
| `nemons resolve-check` | `<commit-message>` | Check commit message against open tasks (for git hooks) |
| `nemons backfill-flavor` | `--last N`, `-l N`; `--dry-run`, `-n`; `--force` | Backfill session_flavor and emotional_intensity via LLM |
| `nemons consolidate` | `--rule-based`; `--rounds=N` | Iterative knowledge consolidation (rule-based + optional LLM dedup) |
| `nemons gap-review` | `--project P`, `-p P`; `--dry-run`, `-n`; `--limit N` | LLM-based review of knowledge gaps (keep/noise/resolved) |
| `nemons trait-cleanup` | `--dry-run`, `-n`; `--threshold F`, `-t F` | Deduplicate persona traits via embedding cosine similarity |

## Documentation

| Command | Flags/Args | Description |
|---------|------------|-------------|
| `nemons add-docs` | `--name N` (required); `--path P` / `--file F` / `--url URL`; `--project P`; `--version V`; `--domain D`; `--dry-run`; `--destill` | Ingest documentation into knowledge base (with optional git clone + LLM destillation) |
| `nemons sync-docs` | `--name N` / `--project P` / `--all` | Re-sync registered doc sources (git pull + re-index changed files) |
| `nemons list-docs` | `--project P` | List registered documentation sources with chunk counts |
| `nemons remove-docs` | `--name N` (required); `--project P` | Remove a doc source, its chunks, and linked learnings |

## Export / Import & Cost

| Command | Flags/Args | Description |
|---------|------------|-------------|
| `nemons export` | `[path]` — output file (default: `nemons-export.json`) | Export learnings + persona to JSON |
| `nemons import` | `<file>` — JSON export file | Import learnings from JSON export file |
| `nemons cost` | `[days]` — number of days (default: 7) | Show API cost summary per day (extract + quality) |

## Stats & Benchmark

| Command | Flags/Args | Description |
|---------|------------|-------------|
| `nemons stats` | `--project P`, `-p P`; `--since DATE`; `--before DATE`; `--json` | Learning statistics: counts, precision, noise, persona, coverage, decay |
| `nemons benchmark` | `--project P`, `-p P`; `--since DATE`; `--before DATE`; `--json` | Comprehensive benchmark: effectiveness, per-category precision, evolution, coverage, persona convergence, API cost, cross-session recall |

## LoCoMo Benchmark

| Command | Flags/Args | Description |
|---------|------------|-------------|
| `nemons locomo-bench run` | `--data PATH` (required); `--db PATH`; `--runs N`; `--eval-llm MODEL`; `--judge-llm MODEL`; `--skip-extract`; `--messages`; `--full-context`; `--hybrid`; `--tiered`; `--agentic`; `--agentic-eval`; `--gold`; `--gen-aq N`; `--gen-aq-llm MODEL`; `--concurrency N`; `--top-k N`; `--dry-run`; `--sample-pct N`; `--json`; `--dump-results PATH`; `--extract-llm MODEL` | Run full LoCoMo benchmark pipeline (ingest → extract → query → judge → report) |
| `nemons locomo-bench ingest` | `--data PATH` (required); `--db PATH` | Ingest LoCoMo JSON dataset into benchmark database |

## CLAUDE.md Generation

| Command | Flags/Args | Description |
|---------|------------|-------------|
| `nemons claudemd` | `--project NAME` + `--dir PATH` [+ `--setup`] | Generate `.claude/OPS.md` for a single project |
| `nemons claudemd` | `--all` [`--dry-run`] | Regenerate OPS files for all known projects |

## Wiki Render

| Command | Flags/Args | Description |
|---------|------------|-------------|
| `nemons wiki-render` | `--project NAME` (required); `--out DIR`; `--quiet`; `--json`; `--scan` | Render wiki pages from learnings to `~/.claude/nemons/wiki/<project>/` |

## Agent Management

| Command | Flags/Args | Description |
|---------|------------|-------------|
| `nemons spawn-agents` | `--project NAME` (required); `--count N` (1-10); `--tasks SECTIONS` (comma-separated); `--caller-session ID` | Spawn agent processes with terminal windows, PTY bridges, and scratchpad coordination |
| `nemons agent-tty` | `--sock PATH` (required) | Agent terminal bridge — connects stdin/stdout to a Unix socket for PTY forwarding |
| `nemons relay` | `--to ID` (required); exactly one of: `--content TEXT` / `--stop` / `--resume`; `--project NAME` | Send message to, stop, or resume an agent via daemon RPC |

## Query & Data Store (CLI)

| Command | Flags/Args | Description |
|---------|------------|-------------|
| `nemons query` | `'<sql>'`; `--args '<json-array>'`; `--format json\|objects\|tsv` | Read-only SQL query against nemons.db (SELECT/WITH only) |
| `nemons json` | `'<expr>'`; `-r`/`--raw-output`; `-n`/`--null-input`; `-R`/`--raw-input`; `-s`/`--slurp`; `-e`/`--exit-status`; `-c`/`--compact-output`; `--indent N`; `--arg NAME VALUE`; `--argjson NAME VALUE` | jq-style JSON filter on stdin (powered by gojq) |
| `nemons store` | `'<json>'` — `{"capability":"...","action":"...","table":"...",...}` | Cap store RPC relay via daemon (create_table, upsert, query, delete, list_tables) |
| `nemons cap-store` | `<capability> <action> <table> [where] [args_json]` (actions: `query`, `upsert`, `delete`) | Capability store direct CLI access |
| `nemons cap-blob-put` | `--cap NAME` (required); `--key KEY` (required) | Store stdin as chunked blob in the named cap's blobs table |
| `nemons cap-blob-get` | `--cap NAME` (required); `--key KEY` (required) | Retrieve a previously stored blob to stdout |
| `nemons llm-complete` | `'<json>'` — `{"system":"...","user":"...","model":"..."}` | LLM completion via daemon RPC |

## Scratchpad

| Command | Flags/Args | Description |
|---------|------------|-------------|
| `nemons scratchpad write` | `--project NAME` (required); `--section SEC` (required); `--content TEXT` (`-` for stdin) | Write a scratchpad section |
| `nemons scratchpad read` | `--project NAME` (required); `--section SEC` | Read scratchpad section(s) — all sections if `--section` omitted |
| `nemons scratchpad list` | `--project NAME` | List scratchpad sections for a project |
| `nemons scratchpad delete` | `--project NAME` (required); `--section SEC` | Delete scratchpad section(s) — all sections if `--section` omitted |

## Hooks

Called by Claude Code/OpenCode, not directly. Listed for reference.

| Command | Hook Event | Description |
|---------|-----------|-------------|
| `nemons briefing-hook` | SessionStart | Generate and inject brief summary + register session PID |
| `nemons codemap-hook` | SessionStart | Generate code map only (split from briefing for preview visibility) |
| `nemons micro-reminder` | UserPromptSubmit | Inject nemons usage reminder |
| `nemons idle-tick` | Periodic | Dynamic nemons-usage reminder (replaces micro-reminder) |
| `nemons hook-check` | PreToolUse | Warn about known gotchas |
| `nemons hook-failure` | PostToolUseFailure | Learn gotcha + deep search (combined) |
| `nemons hook-learn` | PostToolUseFailure | Auto-learn gotchas *(legacy, use hook-failure)* |
| `nemons hook-assist` | PostToolUseFailure | Deep search on Bash failures *(legacy, use hook-failure)* |
| `nemons hook-resolve` | PostToolUse | Auto-resolve tasks on commit |
| `nemons hook-think` | UserPromptSubmit / PreToolUse | Inner voice reminder to search memory |
| `nemons session-end` | Stop | Session cleanup and extraction trigger |

## Global

No global CLI flags. Data directory defaults to `~/.claude/nemons`. Override via environment variable `NEMONS_DATA_DIR`.

### Status & Maintenance
| Command | Description |
|---------|-------------|
| `nemons status` | Show daemon/proxy status, recent activity, and health metrics |
| `nemons uninstall` | Remove all Nemons registrations: opencode plugin, MCP config, symlinks, and runtime files |
