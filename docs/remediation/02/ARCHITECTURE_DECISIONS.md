# Remediation 02 — Architecture Decision Records

Continues the numbering of `docs/remediation/ARCHITECTURE_DECISIONS.md`
(AD-1..AD-8). Decisions here are numbered AD-02-*.

---

## AD-02-1: Authorization identity requires a boundary-resolved source

**Status**: accepted (WS-A1/A2)

**Context**: `ActorContext` carried one string (`ActorID`) that served four
roles — authenticated agent, attribution claim, session label, and (via the
in-process marks) the system. `actorViewer` accepted any non-empty actor id,
so a model-written `_source_agent` claim became the authorization Viewer and
could read another agent's private knowledge.

**Decision**: authorization is a property of the identity SOURCE, not the
label. `ActorContext.AuthorizationID()` returns the actor id exactly when the
identity was authenticated as `IdentitySourceResolved` — a marker only a
trusted boundary authors. A claim keeps `AttributionID()` (audit-only).
Session-only authentication authenticates the session, not an agent id, and
authorizes no private scope. The four concepts now live in four distinct
channels and `actorViewer` judges only the first.

**Consequences**: the opencode v1 plugin claim channel loses private-scope
reads (its callers must go through the identity-resolving boundary);
attribution survives in audit lines. No data migration.

## AD-02-2: No hardcoded fallback identity on agent-facing reads

**Status**: accepted (WS-B2)

**Context**: `actorViewerOrDefault` served identity-less requests under the
hardcoded `claude` identity — compatibility bought with an unproven Viewer.

**Decision**: the fallback is deleted, not replaced. Every agent-facing
knowledge read fails closed without an authorized identity; internal paths
keep the explicit in-process marks (system) and the job-surface mark
(dedicated policy).

**Consequences**: same-UID callers that read knowledge without going through
the MCP boundary must resolve an identity (set `NEMONS_SOURCE_AGENT`) or use
the HTTP service identity (AD-02-3). The refusal is uniform and discloses
nothing.

## AD-02-3: The HTTP boundary authenticates one explicit service identity

**Status**: accepted (WS-A3)

**Context**: the HTTP API forwards model-controlled params into the daemon;
localhost + bearer token authenticates the OpenClaw integration, never a
specific Coding Agent. The wire could therefore steer the viewer.

**Decision**: the single choke point (`handlerAdapter.Handle`) strips the
wire's trust markers and stamps every request as `_source_agent =
openclaw-http` with a server-authored resolved marker. The service identity
sees project and published knowledge (the transport's documented purpose) and
no agent's private rows — nothing writes as it, so it owns nothing. The
caller's `_source_agent` label is overwritten, never honored: over this
transport it can only be an impersonation attempt.

**Consequences**: per-agent private reads over HTTP are gone by design;
agents use MCP. The identity is documented, tested
(`TestIdentityMatrix_HTTPBoundaryStripsForgedIdentity`), and cannot
impersonate.

## AD-02-4: Pack authenticity = HMAC receipt + issuance record

**Status**: accepted (WS-C)

**Context**: the pack manifest carried an ordinary content hash — integrity
only. A caller who rewrote manifest and hash together passed verification.

**Decision**: the simplest design that satisfies the threat model — a hybrid:
`build_context_pack` issues a `packReceipt` (schema version, opaque receipt
id, viewer, project, task hash, manifest hash, issue/expiry, nonce) signed
with HMAC-SHA256 under a locally protected server key, and records the
issuance in `pack_receipts`. `check_pack_loss` requires the receipt for any
presented manifest and verifies: schema, issuance record, record-receipt
agreement, signature, viewer/project/task binding, expiry, and manifest-hash
coverage. Without a manifest the deterministic re-assembly stays
server-side-authentic by construction. Replay within expiry is accepted and
documented (the check is read-only); cross-use is impossible through the
binding.

**Alternatives rejected**: asymmetric signatures (no verification key
distribution problem exists locally — one process issues and verifies);
nonce-cache single-use receipts (verification is side-effect-free, so
single-use buys nothing).

**Key lifecycle**: 32 bytes, hex in `pack_receipt.key` (0600) beside the
database, created `O_EXCL`-safe (concurrent starts converge), adopted against
a key-id recorded in `governance_config`. Corruption, replacement, or loss
refuses fail-closed — no silent regeneration. `RotatePackSigningKey`
(exposed as `nemons governance pack-key rotate`) is the only sanctioned key
change; it invalidates outstanding receipts by documented contract.

## AD-02-5: Governance decisions move to the operator CLI

**Status**: accepted (WS-D)

**Context**: the operator token existed and gated `governance_decide`, but no
local surface let a human use it; the token's operational path was undefined.

**Decision**: `nemons governance` is the operator surface — `status`,
`approvals list/show/decide`, `operator rotate-token` (recovery, interactive
confirmation, audited), `pack-key rotate`. The token is read from
`NEMONS_OPERATOR_TOKEN` or stdin (never argv), never printed by status,
never logged, never returned by any daemon response. Decisions keep the
store's idempotent, transactional, audited path
(`governance_decide` remains the daemon-side gate for tooling that already
holds the token; it is not registered as an MCP tool).

**Consequences**: the approval lifecycle is operationally usable end to end;
rotation is explicit and audited; an agent can ask but never decide.

## AD-02-6: Private-scope granularity stays per resolved identity (Option B
shaped), with the claude session-id gap documented

**Status**: accepted (WS-E — decision recorded, no schema change)

**Context**: `ViewerID()` returns `ActorID`. For boundary-resolved agents the
actor id is `opencode:<session-id>`, `codex:<thread-id>`, or the raw
`CLAUDE_SESSION_ID` — instance-shaped per session for the first two, and
per-session (ephemeral across sessions) for claude. The storage model binds
private rows to `source_agent` = that id.

**Decision**: keep private ownership bound to the resolved `ActorID` (Option
B — agent instance — as realized by the boundary-resolved identity), because
it is what the shipped integrations already mint, it isolates separate
installations, and changing ownership now would either widen visibility or
orphan rows. Ephemeral session ids are never minted as agent ids by Nemons
itself; the claude path's reliance on `CLAUDE_SESSION_ID` means a claude
installation's private rows do not carry across its sessions — recorded as a
known limitation with a recommended future fix (a stable per-installation
agent id minted once into the data dir), which requires an explicit product
decision and migration, not a silent rewrite.

**Rejected**: Option A (type-level private — two installations of the same
agent would share private knowledge; rejected by the isolation guarantees
Remediation 01 tests pin). Option C (session-id private everywhere —
maximal isolation but private knowledge becomes session-transient for every
agent type; rejected as contradicting "Private Agent Intelligence" semantics).
No migration ran; E2 holds (no visibility widened).

## AD-02-7: Decision priority is earned by approval provenance

**Status**: accepted (WS-F)

**Context**: pack selection gave the decision tier by category name alone.
The `Learning` model has no approval-state field; the recorded provenance
(`Source`: user_stated / agreed_upon / claude_suggested / llm_extracted /
fork) is the only actual approval signal.

**Decision**: `contextPackPriority` judges the row's `Source`: a decision row
with `user_stated` or `agreed_upon` provenance earns the decision tier; any
other decision ranks with teaching. The category name alone never grants the
tier. Ordering stays deterministic (priority desc, newest-first within a
tier), whole-item selection and the no-pre-window rule are unchanged.

**Consequences**: pools that guarantee approval upstream would make this
redundant — audited: they do not (the eligible pool is "active recallable
rows", not "approved decisions"). If a real approval-state column lands
later, `decisionApprovalProvenance` is the single function to extend.
