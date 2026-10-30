# QODER-01 — Real Host Capability Report (Qoder IDE as Nemons integration target)

- **Status:** Host identified and integration mechanism verified; registration written and read back from the real user config. Host-side tool discovery **not yet observed** — see §7.
- **Target host:** Qoder IDE, `productVersion 1.37.0` (installed on the developer machine used for this validation).
- **Date of observation:** 2026-10-30 (local), single machine, single user profile.
- **Nemons under test:** `@nemons/cli` 4.5.0 daemon, MCP endpoint `http://127.0.0.1:3456/mcp`.
- **Method:** local artifact inspection + official documentation. Every claim below is either a file/tool observation (with path) or a quoted documentation statement (with URL). Speculation is labelled as such. Nothing in this report is simulated.

## 1. Host identification

| Fact | Value | Evidence |
|---|---|---|
| Product on PATH | `C:\Users\Nasser Jabir\AppData\Local\Programs\Qoder IDE\bin\qoder` (+ `.cmd`) | `where.exe qoder` |
| `qodercli` | **absent** | `where.exe qodercli` returned nothing |
| VS Code base version | `1.106.3` | `Programs\Qoder IDE\resources\app\product.json` |
| Qoder product version | `1.37.0`, commit `b371586d…`, build date `2026-10-26` | same `product.json` |
| User data folder | `.qoder` (`dataFolderName`) | same `product.json` |
| Second product present | standalone Qoder app, `.qoder-app-status.json` reports version `0.4.2` | `%USERPROFILE%\.qoder\.qoder-app-status.json` |

Because two Qoder products share the `%USERPROFILE%\.qoder` folder name space, all paths in this report are stated absolutely and were read, not inferred. Documentation for the standalone app, its CLI, or the JetBrains plugin is **not** applicable to the IDE and was excluded.

## 2. The integration mechanism that actually exists

Qoder IDE exposes **one** documented, user-owned MCP surface: the MCP configuration the IDE reads at

```
~/.qoder/mcp.json          # C:\Users\Nasser Jabir\.qoder\mcp.json
```

- Structure: top-level `mcpServers` object keyed by server name.
- Remote entry: `url` (required), optional `type` ∈ `sse` | `streamable-http` | `http` (alias) | `auto`, optional `headers`.
- Local entry: `command`, optional `args`, optional `env`; `type` may be omitted or `stdio`.

**Proof that this file is the one the runtime reads** (not an assumption): the IDE-written derived registry
`%APPDATA%\Qoder\SharedClientCache\extension\local\mcp.json` contains

```
"userConfigMD5": "cac47f791ee55a02ac0d4ea8b5e62cef"
```

and `md5(~/.qoder/mcp.json)` produced exactly that value before our write. The derived file also carries `source: "user"` per entry, mirroring the user file, and adds IDE-owned fields (`identifier`, `disabled`, `autoApprove`, `timeout`, `url: ""`). We never write to that file.

**A second, different `mcpServers` block exists in `~/.qoder/settings.json`** (holding `codebase-memory-mcp`) together with `hooks`. It is not the file whose hash the runtime caches and must not be treated as the user MCP config.

## 3. Host-side discovery: the only host-written artifact

```
%APPDATA%\Qoder\SharedClientCache\mcps\<server>\SERVER_METADATA.json   # {name, source, toolCount}
%APPDATA%\Qoder\SharedClientCache\mcps\<server>\tools\<tool>.json      # real inputSchema per published tool
%APPDATA%\Qoder\SharedClientCache\projects\<project>\mcps\…            # same content, per-project
```

Observed before any Nemons action (both locations): `browser-use`, `genui`, `TestSprite` — and nothing else. `TestSprite` shows `source: "user"`, `toolCount: 8`, with eight schema files. This is why the directory is usable as discovery evidence: it is written by the IDE for a server we did configure through the UI in the past, and it is **read-only for us** — the validation suite asserts that Nemons code never writes into it.

Per the IDE extension host log, `browser-use` and `genui` are builtin providers served by the extension itself over a named pipe (`http+npipe://…/mcp/<name>`); the session log line reads `MCP servers for session/new: 2 (builtin only, external managed by global mcpconfig)`. That is the mechanism by which "available in this conversation" differs from "present in a file".

## 4. Documented behaviour relevant to validation

Quoted or closely paraphrased from [MCP — Qoder IDE](https://docs.qoder.com/user-guide/chat/model-context-protocol.md) (accessed 2026-10-30):

- Transports: STDIO and SSE are the "two standard transport types"; SSE section adds "Also supports Streamable HTTP", and the note says *"for Streamable HTTP, configure the endpoint the same way as SSE and Qoder IDE will automatically detect and use it"*. → Our `streamable-http` endpoint is supported **without** an explicit `type`, but we write `type: "streamable-http"` because the field is accepted and it makes the intent explicit.
- Connection state: *"Once saved, the link icon confirms the server is ready. Expand the details to see the tools list."* → the documented readiness signal is **in the UI**, not in a file or a command.
- Tool invocation: *"Before Qoder IDE calls an MCP tool, you are prompted with a confirmation… Press ⌘ ⏎ (macOS) or Ctrl Enter (Windows) to execute."* → model-driven invocation is interactive by default; an automated run must expect a confirmation step.
- Modes: the documented workflow is **Agent mode**; Ask mode does not invoke MCP tools.
- Per-server **Request Timeout** dropdown exists; if a request exceeds it, "Qoder IDE stops the call and shows a timeout message in the chat".
- Recovery path: [MCP common issues](https://docs.qoder.com/troubleshooting/mcp-common-issue) — use the Retry control in **Qoder IDE Settings → MCP**, and restart the IDE if the tools list stays stale.
- From [release notes](https://docs.qoder.com/release-notes/desktop.md): 1.37.0 (2026-10-27) ships the built-in `qoder-ide-helper` Skill — the same version installed here; 1.34.0 removed the Quest Window; subagents can call MCP; the maximum MCP connection limit was removed.

## 5. Capability matrix against the previously validated host (Codex CLI 0.149.1)

| Capability | Codex CLI | Qoder IDE 1.37.0 | Consequence for Nemons |
|---|---|---|---|
| Programmatic add | `codex mcp add` | no CLI; file `~/.qoder/mcp.json` or UI | Nemons writes the file itself, with merge + read-back |
| Programmatic read-back | `codex mcp list --json`, `codex mcp get` | **none documented** | adapter splits "saved" (our read-back) from "discovered" (host cache) |
| Connection state query | `codex mcp doctor` | UI link icon only | cannot prove "connected" from Nemons code |
| Streamable HTTP | yes | yes (auto-detected) | no adapter change to the endpoint needed |
| Bearer/token header on the MCP entry | env-based | `headers` accepted by our parser but **not documented**; env-var substitution undocumented | install **refuses** to write a token instead of inventing an unsupported credential path |
| Hook/plugin entry point (`onPrompt`/`onResponse`) | n/a | **does not exist** | the previous `plugins/qoder` shim was a reference shim for a contract no product exposes; it is not the install path |
| Reload command (`/mcp reload`) | n/a | not applicable to the IDE | reload requires window reload or Settings → MCP Retry |
| Skill delivery channel | file drop | `~/.qoder/skills/<name>/SKILL.md`, watched | usable; existence ≠ loaded in current session |

The two structural gaps (no CLI read-back, no reload command) are the reason the Qoder driver reports two evidence levels rather than reusing Codex's single "host-confirmed" claim.

## 6. What has been proven live in this validation

1. **Registration written to the real user config** (explicit user approval; backup of the prior file kept at `.qoder-validation/mcp.json.before`). `nemons plugin install --agent qoder --no-doctor` output:

```
  QODER_HOME: C:\Users\Nasser Jabir\.qoder
  Host app:   Qoder IDE 1.37.0
  MCP url:    http://127.0.0.1:3456/mcp
  Auth:       daemon is open (NEMONS_AUTH_TOKEN unset) — no credential registered; re-run install if you enable auth
    · read-existing: ok
    · merge: ok
    · config-readback: ok
  ✓ Registered mcpServers.nemons → http://127.0.0.1:3456/mcp
    transport=streamable-http auth=none (read back from mcp.json)
    untouched alongside it: TestSprite
  ✓ Skill written and re-read: C:\Users\Nasser Jabir\.qoder\skills\nemons-orchestrator\SKILL.md (6 endpoint reference(s) pointed at 127.0.0.1:3456)
  · IDE tool cache does NOT list "nemons" yet (cache read, no entry) — that is expected: a written config is state 1, not a connection.
  ✓ Host-confirmed registrations: 1 / ~ Files staged, host not asked: 0 / ✗ Failed: 0
```

2. **Byte-level non-destructiveness** (`.qoder-validation/verify-live-registration.js`, read-only): file grew 328 → 426 bytes, 2-space indent preserved, server key order `["TestSprite"] → ["TestSprite","nemons"]`, `TestSprite` structurally identical including a 139-character `API_KEY` of unchanged length, and `nemons` is exactly `{"url":"http://127.0.0.1:3456/mcp","type":"streamable-http"}`.
3. **Daemon reachability** on the registered URL: `GET /health` → `{"status":"healthy","version":"4.5.0","home":"c:\\c\\Nemons\\.qoder-validation\\nemons-home","auth_enabled":false,"core_loaded":true}` from an isolated `NEMONS_HOME` inside the workspace.
4. **Suite:** `nemos/tests/host-integration-tests.js` — **45 checks, 0 failed** (Codex portion unchanged at 22). Qoder gates cover merge onto a foreign server, refusal to mutate a malformed config ("NOTHING WRITTEN"), isolated-home CLI install that must **not** claim connection, the auth-refusal path, the Nemons-side retry/duplicate behaviour of the MCP endpoint, and the two provenance gates below.

## 6a. Provenance mechanism added for this validation

Until now the daemon answered `/mcp` without recording anything, so "the host invoked the tool" and "our test script invoked the tool" were indistinguishable after the fact. `nemos/src/daemon/routes/mcp.js` now appends one JSONL line per JSON-RPC message to `<NEMONS_HOME>/logs/mcp-access.log`:

```json
{"ts":"2026-10-30T10:46:55.887Z","duration_ms":0,"source_ip":"127.0.0.1","user_agent":"nemons-side-probe","method":"tools/list","request_id":"42","tool":null,"outcome":"ok"}
```

Metadata only — the request body is never written (it carries prompts, diffs and evidence), and the trail rotates at 1 MiB. Two gates hold it: a probe call with a distinct `User-Agent` must appear exactly once with `outcome: "ok"` and must not leak its body; an unknown tool must appear with `outcome: "rpc_error"` and `rpc_error_code: -32602`. The write is fire-and-forget on the response path but warns once on failure instead of failing silently.

## 7. Not proven, and exactly why

| Objective | State | Blocking fact |
|---|---|---|
| 4 — host-side tool discovery | **not observed** | Four signals, in decreasing order of reliability: (a) **the runtime tool manifest of this very conversation** — `%APPDATA%\Qoder\SharedClientCache\projects\c--c-Nemons\mcps\` contains `browser-use`, `genui`, `TestSprite` and no `nemons`, and that directory is what the agent harness reads to expose `CallMcpTool`, so it is the host's live state rather than a stale cache; (b) the daemon received **zero** `POST /mcp` messages between the 13:29 restart and an explicit `tools/list` probe at 13:46 local (`2026-10-30T10:46:55.887Z` in the log; the machine runs UTC+3:00 and the log stores UTC) — a connecting IDE must send `initialize` + `tools/list` first, so nothing reached it; (c) the IDE-derived registry still reports `userConfigMD5: cac47f…` while the live file hashes to `dbcede2c…`, i.e. the running session has not re-read the config; (d) no `SharedClientCache/**/mcps/nemons` entry. (d) is corroborating rather than decisive: those directories were last written 2026-10-16 even though this window session started 2026-10-30, so the cache is refreshed at most on load, not per conversation. No Nemons-side command can force any of them. |
| 5 — real model-driven invocation | **not attempted** | depends on 4; the harness in this conversation publishes only `browser-use`, `genui`, `TestSprite` schemas. Simulating the call is prohibited. |
| 6 — Context Pack delivery vs consumption | delivery proven (config + read-back); consumption not measurable until 5 | — |
| 7 — two-Run continuity through the host | not attempted (same dependency) | Nemons-side continuity is exercised in tests, but must not be presented as host-observed |
| 8 — Evidence ↔ Run association through host calls | not attempted | same dependency |
| 9 — connection/auth/retry/duplicate | Nemons-side proven; **host-side retry and timeout behaviour unverified** because the host never connected | Qoder-side retry lives behind the Settings → MCP Retry control |

To unblock objectives 4–8, one of these must happen inside the IDE (user action, no equivalent automation exists): restart the IDE, reload the window, or open **Qoder IDE Settings → MCP** and confirm/retry the `nemons` entry. Until then the honest statement is: *registered and read back; not discovered by the host; no model invocation performed.*

### Conflicting observation, recorded rather than resolved by assumption

During this validation the developer reported that **Qoder IDE Settings → MCP** shows a `nemons` entry with the link icon and an expandable tools list. The daemon-side record contradicts a live connection at that moment: the only `POST /mcp` message received since the 13:29 daemon restart was the 13:46 probe from `nemons-side-probe`, and `%APPDATA%\Qoder\logs\20261030T090003\**` contains no MCP activity for `nemons`. Two explanations remain open and neither has been adopted:

1. The UI rendered a tool list cached from an earlier connection — plausible, because the daemon instance running 13:21–13:29 predates the access log, so any traffic then is unrecoverable evidence.
2. The entry seen was a different server, or the icon was read as denoting more than "config present".

The test that settles it without ambiguity: a **new Agent-mode chat** (Ask mode does not call MCP tools) prompted to call `nemons.health_check`. A real host invocation must appear in `mcp-access.log` with the IDE's own `User-Agent`, which this agent cannot produce. The exact tool names shown under `nemons` in the settings UI are the second required input.

Against explanation 2 the runtime manifest is now direct evidence rather than inference: the same conversation in which the entry was reported as connected exposes only `browser-use`, `genui`, `TestSprite` through `CallMcpTool`. That does not close the conflict — the settings panel and the conversation's tool surface are two different views of the host, and only the developer can say which one was misread — but it means the claim of discovery has an opposing record from inside the session, not just from the daemon's side.

## 8. Reproducible commands

```powershell
# 0) Isolated Nemons home (keeps the developer's real Nemons state untouched)
$env:NEMONS_HOME = "c:\c\Nemons\.qoder-validation\nemons-home"
Remove-Item Env:NEMONS_AUTH_TOKEN -ErrorAction SilentlyContinue

# 1) Daemon
nemons daemon start
Invoke-RestMethod http://127.0.0.1:3456/health | ConvertTo-Json -Compress

# 2) Register into the real ~/.qoder/mcp.json (prompts nothing; approve explicitly)
nemons plugin install --agent qoder --no-doctor

# 3) Read-only verification: config read-back + host cache, prints no secret values
node .qoder-validation\verify-live-registration.js

# 4) Full host suite (45 checks; Qoder-only gates skip when Qoder is absent)
cd nemos; node tests/host-integration-tests.js

# 5) Poll the three host-side signals: config re-read, tool cache, real /mcp traffic
node .qoder-validation\poll-host.js

# 6) The conversation's own runtime tool manifest (read-only; no nemons entry == not discovered)
Get-ChildItem "$env:APPDATA\Qoder\SharedClientCache\projects\c--c-Nemons\mcps" -Directory | Select-Object -ExpandProperty Name

# 7) Remove the registration the same way it was added
nemons plugin remove --agent qoder
```

Retained raw evidence, all in `.qoder-validation/`: `mcp.json.before` (the 328-byte config as it
was before the approved write), `nohosts-before-fix.log` (the host-less run that exposed defect 2,
still showing `Failed: 1`), `final-test-all.log` (the last full run of this task: 35 + 33 + 22 + 21
+ 26 + 38 + 45 = **220 passed, 0 failed**), and `nemons-home/logs/mcp-access.log` (every `/mcp`
message the validation daemon received — one line, from our own probe).

## 9. Sources

- https://docs.qoder.com/user-guide/chat/model-context-protocol.md — transports, Streamable HTTP note, UI add flow, link icon, tools list, Request Timeout, tool confirmation, Agent-mode workflow (accessed 2026-10-30).
- https://docs.qoder.com/troubleshooting/mcp-common-issue — Retry/restart recovery path (accessed 2026-10-30).
- https://docs.qoder.com/release-notes/desktop.md — 1.37.0 dated 2026-10-27, built-in qoder-ide-helper Skill, subagent MCP calls, connection-limit removal (accessed 2026-10-30).
- Local: `Programs\Qoder IDE\resources\app\product.json`; `%USERPROFILE%\.qoder\mcp.json` + `.qoder-app-status.json` + `settings.json`; `%APPDATA%\Qoder\SharedClientCache\extension\local\mcp.json`; `%APPDATA%\Qoder\SharedClientCache\mcps\**`; `%APPDATA%\Qoder\SharedClientCache\projects\c--c-Nemons\mcps\**` (the runtime manifest this agent actually sees); `%APPDATA%\Qoder\logs\20261030T090003\window*\exthost\output_logging_*\1-Qoder.log`; `.qoder-validation\nemons-home\logs\mcp-access.log`.
- Repository: `nemos/src/utils/qoder-host.js`, `nemos/src/commands/plugin.js`, `nemos/tests/host-integration-tests.js`, `plugins/qoder/manifest.json` (audited, reference shim only).
