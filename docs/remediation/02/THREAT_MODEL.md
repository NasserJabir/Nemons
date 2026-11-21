# Remediation 02 — Threat Model

Scope: trust boundaries that Remediation 01 left open. The adversary is the
model (the Coding Agent's LLM) and any code it runs, plus any same-UID local
process that reaches the daemon. The host OS boundary and a compromised Nemons
process remain out of scope, as before.

## Assets

1. **Private Agent Knowledge** — learnings rows with `sharing_scope='private'`
   owned by one agent identity.
2. **Project Knowledge** — learnings scoped to a project; readable by any
   authenticated viewer of that project's reads.
3. **Global Knowledge** — governed published rows.
4. **The Operator Token** — the governance decision authority's secret.
5. **The pack signing key** (new, WS-C) — the secret that authenticates
   Context Pack receipts.
6. **The knowledge-content oracle** — confirmation that a row with a given id
   or content exists (independent of reading it).

## Actors and trust boundaries

| Boundary | Authenticates | Never authenticates |
|---|---|---|
| MCP server (`internal/mcp/server.go`) | the agent type + session its **environment** names (`resolveClientSessionID`) — boundary-authored markers | nothing model-controlled |
| HTTP API (`internal/httpapi/server.go`) | the OpenClaw integration (localhost + bearer token) | a specific Coding Agent |
| Unix socket peer guards | the local process peer | — |
| In-process marks (`internalCallMark`, `jobSurfaceMark`) | the daemon's own audited paths and the sandboxed job surface | any external payload |

## Threats and the answers this remediation implements

### T1 — claim escalation (WS-A)
The model writes `_source_agent: "other-agent"`; the daemon resolved it as the
authorization Viewer; private rows of another agent are read.
**Answer**: an authorization identity exists only when a trusted boundary
authenticated it (`AuthorizationID()`); claims are attribution-only and never
scope-bearing. HTTP strips trust markers from the wire and acts as one
explicit service identity it resolved itself.

### T2 — identity-less reads (WS-B)
A request with no identity reads under the hardcoded `claude` default (or any
hardcoded replacement), gaining a Viewer it did not prove.
**Answer**: the fallback is removed; agent-facing reads fail closed. Internal
paths keep the explicit in-process marks; the HTTP boundary carries its own
explicit service identity.

### T3 — unscoped SQL reads (WS-B)
`get_learnings_since` / `get_pulse_learnings_since` / by-id reads
(`verify_citation`, `propose_from_experience`) touch the learnings table
without the viewer clause — private rows leak or their existence is confirmed.
**Answer**: every agent-facing path that returns or confirms knowledge content
resolves the same trusted identity and passes a viewer (or the internal marks)
to storage; storage read helpers used by those paths take the viewer and
enforce the identical scope SQL.

### T4 — pack forgery (WS-C)
The caller rewrites the manifest and recomputes the ordinary fingerprint; the
tampered pack passes `check_pack_loss` as "intact".
**Answer**: `build_context_pack` issues a **server-signed receipt**
(HMAC-SHA256 under a locally protected key no agent holds) binding the exact
manifest hash to viewer/project/task/issue/expiry/nonce. `check_pack_loss`
verifies the receipt before trusting any presented manifest. An ordinary hash
continues to protect against accidental damage; it never substitutes for
authenticity.

### T5 — signing-key theft or misuse (WS-C)
The key sits where agents may have file access.
**Answer**: the key file lives under the daemon data dir with `0600` and is
created `O_EXCL`-safe; the threat model explicitly does **not** claim
protection against a compromised daemon process or host (an agent with host
read access can read any local credential of this deployment, exactly as it
could the DB itself). Corruption refuses fail-closed; rotation is an explicit
operator action that invalidates prior receipts by design.

### T6 — token exposure to the model (WS-D)
`governance_decide` requires the operator token, so the pressure point is the
token's handling: if it is printed, logged, embedded in argv, or returned by
any model-facing surface, the model can operate the gate.
**Answer**: a local CLI (`nemons governance …`) is the operator's surface; the
token is never printed in normal output (status shows presence only), is read
from stdin/environment rather than argv, is never logged, and never appears in
MCP responses. Recovery/rotation require an explicit interactive operator
action and are audited; no agent can trigger them.

### T7 — receipt replay / cross-use (WS-C)
A receipt captured for one task is replayed for another, or for another
viewer/project.
**Answer**: the receipt binds Viewer, Project and TaskHash and carries an
expiry. Replay *of the same verification* within expiry is accepted and
documented (verification is read-only and side-effect free); any different
viewer/project/task is rejected. This is the chosen policy, not an omission.

## Explicit non-claims

- No protection against a compromised Nemons daemon, host, or the operator
  themselves.
- No confidentiality of pack content in transit beyond what the local OS
  already provides (sockets are local; HTTP is localhost + bearer).
- The ordinary manifest fingerprint remains an integrity check only; every
  authenticity statement in the docs refers to the receipt (WS-C).
