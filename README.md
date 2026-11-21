# Nemons

[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go)](https://go.dev)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-45%20packages%20green-brightgreen)](#development)

**A governance-first memory layer for AI coding agents.**

Nemons gives Claude Code, OpenCode, Codex and other agents a project memory they can *trust*: every read passes a server-side enforcement gate, every claim carries its evidence, and nothing the agent "remembers" exists without provenance. It is built on [YesMem](https://github.com/carsteneu/yesmem) (Apache-2.0) and extended by a documented chain of patches.

## Why Nemons

AI coding agents are powerful inside one session and strangely amnesic across sessions. The usual fixes — a raw memory dump, or a RAG layer over chat logs — share one flaw: they treat *remembering* and *context* as the same thing, and they treat *private* as an agreement between agents instead of a property of the system.

Nemons enforces the distinction:

- **Memory is not context.** Memory accumulates knowledge across sessions; context is what one task receives, built through the gate, under a declared budget, with a source anchor for every element.
- **Privacy is server-side, not contractual.** Three scopes (`project` / `private` / `shared`) are resolved in the storage layer itself. A row marked private for agent A never crosses a read by agent B — because the *view* filters it, not the prompt.
- **Evidence before claims.** Experience is recorded with a proof and a digest; relying on a claim requires a recorded experiment; and `check_pack_loss` verifies that what the agent *actually received* matches what the gate *actually built* — missing, altered, or injected, per claim.
- **Evolution is proposed, not automatic.** Knowledge moves through a governed path (proposed → approved → documented) with reconciliation of the top-level commitments.

## Architecture

| Pillar | What it does | Where |
|---|---|---|
| Governance tables | Knowledge scopes and approvals in storage | `internal/storage` |
| Enforcement gate | A pure read decision: what each agent sees on every call | `internal/storage` |
| Event ledger | Audit that counts, never stores content — counters and truncated descriptions only | `internal/daemon` |
| Evidence chain | Proof + digest per experiment; claims without anchors are rejected | `internal/daemon` |
| Context pack | Task context assembled through the gate with declared priority | `internal/daemon/context_engineering.go` |
| Declared budget | `budget_chars`: whole elements are kept or dropped, never truncated mid-claim; approved decisions survive last | `internal/daemon/context_budget_test.go` |
| Semantic loss detection | `check_pack_loss` compares the delivered pack against the governed source claim-by-claim: `missing` / `altered` / `injected`, with a coverage ratio | `internal/daemon/context_loss_test.go` |
| Caps registry | Upgrade, pinning and rollback for bundled capabilities, with body-digest provenance | `caps/`, `internal/setup` |
| Optional MCP tools | Governed operations exposed as agent tools via `NEMONS_FEATURE_TOOLS=1` | `internal/mcp/server.go` |

## Quick start

Requirements: Go 1.25.

```bash
git clone https://github.com/NasserJabir/Nemons.git
cd Nemons
make build          # produces ./nemons
./nemons version
```

Install the binary and the daemon integration for your machine:

```bash
make install        # installs to ~/.local/bin/nemons
./nemons install
./nemons status
```

Start the daemon:

```bash
./nemons daemon
```

On first run Nemons creates its data directory at `~/.claude/nemons` (mode `0700`) and generates a bearer token at `~/.claude/nemons/auth_token` (mode `0600`). The HTTP surface authenticates with `Authorization: Bearer <token>`; the token never travels through an environment variable.

Enable the optional MCP tools for coding agents:

```bash
NEMONS_FEATURE_TOOLS=1 ./nemons daemon
```

Then, from any MCP client: `build_context_pack` assembles a task pack through the gate, and `check_pack_loss` verifies what actually arrived.

## Testing your governance locally

No server needed:

```bash
go test ./internal/daemon/ -run 'TestContextPack|TestPackLoss' -v -count=1
```

These tests cover: an approved decision surviving budget pressure, the prohibition on mid-claim truncation (half a claim is a false claim), detection of dropped and altered claims, and scope preservation — another agent's private row shows up as an injection signal, never as knowledge.

### Security regression commands

The remediation added four adversarial matrices; each maps to one enforcement
layer:

```bash
# Trusted identity: the boundary overwrites model-written identity fields
go test ./internal/mcp/ ./internal/models/ -run 'BuildProxyParams|Actor' -v -count=1

# Scope isolation: one matrix over every agent-facing read path
go test ./internal/daemon/ -run 'TestScopeMatrix' -v -count=1

# Pack manifest integrity: fingerprint covers content, verification is exact
go test ./internal/daemon/ -run 'TestManifest' -v -count=1

# Governance bootstrap: empty database -> ask -> operator decides -> audit
go test ./internal/daemon/ ./internal/storage/ -run 'TestGate|TestGovernance|TestOperatorToken' -v -count=1
```

The full regression is `go test ./... -count=1`; race coverage is
`go test -race -timeout 40m ./internal/daemon ./internal/storage
./internal/httpapi ./internal/mcp`. The security acceptance checklist with
per-guarantee test references lives in `docs/remediation/SECURITY_ACCEPTANCE.md`.

### Trusted identity and sharing scopes (remediation)

Agent identity is established by the trusted integration boundary — the MCP
server resolves the agent type from its own environment and overwrites anything
the model wrote (`_source_agent_source=resolved`); session identity stays
caller-first because the shared-service env may name the last-created session.
Only a boundary-resolved identity authorizes: a caller claim (`_source_agent`
without the resolved marker) is attribution for audit lines and never becomes
the scope-deciding viewer, and an identity-less request is refused rather than
served under a hardcoded default (remediation 02). The HTTP boundary
authenticates the OpenClaw integration as one explicit service identity
(`openclaw-http`) — it cannot select an agent's viewer from request arguments,
and no agent's private rows cross it.
Sharing scopes are canonical (`global` / `project` / `private`); the legacy
`public` value migrates to `global` at open time without widening access, and
global writes require the operator's `memory.public_write` standing grant.
The pack build returns a manifest whose fingerprint covers the delivered
content (item ids, content hashes, positions) together with a **server-signed
receipt** (HMAC-SHA256 under a locally protected key, bound to viewer, project
and task, with an expiry) — `check_pack_loss` verifies the receipt before
trusting any presented manifest, so a rewritten manifest with a recomputed
hash is refused; against the manifest or the deterministic re-assembly, budget
exclusions are never reported as loss. Pack selection earns the decision tier
from the row's recorded approval provenance (`user_stated` / `agreed_upon`),
never from the category name. Governance decisions are authenticated by the
operator token (first-run bootstrap, constant-time comparison) — the decision
authority stands outside the gate it operates, and the human surface is the
operator CLI (`nemons governance …`; see
`docs/remediation/02/OPERATOR_GUIDE.md`).

## Configuration

All environment variables are prefixed `NEMONS_`. The most common:

| Variable | Purpose |
|---|---|
| `NEMONS_FEATURE_TOOLS` | `1` exposes the governed operations as MCP tools |
| `NEMONS_JOB_DIR` | Working directory for sandboxed jobs |
| `NEMONS_SOCK` | Daemon socket path |
| `NEMONS_SESSION_ID` / `NEMONS_SOURCE_AGENT` | Session and agent identity for scoped reads |
| `NEMONS_PROJECT` | Project scope identifier |
| `NEMONS_SKILL_ROOTS` | Roots scanned for bundled skills |
| `NEMONS_GUARD_URL` / `NEMONS_GUARD_KEY` / `NEMONS_GUARD_MODEL` | Guard endpoint for controlled generation |
| `NEMONS_LOG_FILE` | Daemon log destination |

## Development

```bash
go test ./...       # 45 packages — the full suite is green on every pushed commit
```

Every change lands as a numbered patch over the upstream base with its own tests; `git format-patch d0bba3f4..HEAD` exports the complete chain.

## Provenance & licensing

- Base: [YesMem](https://github.com/carsteneu/yesmem) at `d0bba3f4` — Apache-2.0, with thanks to its author.
- The Nemons layer (patches 1–25) is built on it under the same Apache-2.0 license. The full history is preserved in git; the [SECURITY policy](SECURITY.md) documents the security model as enforced in code.
- Status: internal release `v0.1.0-internal`.
