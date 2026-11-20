# Nemons Remediation — Architecture Decisions

Decision records for the choices that shaped the remediation, with the
alternatives that were rejected and the compatibility implications accepted.

## AD-1 — Identity wins at the MCP boundary, session stays caller-first

**Decision:** the server-resolved agent **type** (`claude`/`opencode`/`codex`)
always overwrites the payload; the **session id** keeps caller-supplied-first
with the env marker deleted unless the boundary authored it.

**Why:** under opencode v2 the `nemons mcp` children belong to the shared
`opencode serve --service` process, so the server's env may name the
last-created session — trusting it would misattribute every concurrent caller
(YM-328). The agent type, by contrast, is shared by that process and is safe to
resolve authoritatively.

**Rejected:** overwriting the session id too (breaks the plugin v1 channel and
misattributes v2 callers — proven by `TestBuildProxyParamsCallerSessionIsNotMarkedEnv`);
trusting claims (the original vulnerability).

**Compatibility:** a caller the boundary cannot identify is claude-attributed
instead of carrying a self-declared label. The breaking change is documented;
the plugin channel keeps working.

## AD-2 — Least-privileged default instead of refusal for inherited reads

**Decision:** identity-less agent-facing **reads** are served under the shared
`claude` identity (`actorViewerOrDefault`); the pack build/verify surface keeps
the strict refusal (`actorViewer`).

**Why:** after WS-A the MCP boundary authenticates every client, so
identity-less reads arrive only from same-UID operational callers. Refusing
them would break tooling without adding security: the `claude` default sees
project/public rows and its own private rows only — the system view stays
exclusive to the in-process marks. The security property (no system-wide read,
no cross-agent read) is identical; only the refusal *form* differs.

**Rejected:** refusing all identity-less reads (would have broken ~40 upstream
tests and real same-UID tooling for no additional guarantee); keeping the
system read (the actual vulnerability).

## AD-3 — The decision authority stands outside the gate

**Decision:** `governance_decide` leaves the governed registry; the decide
surface requires the operator token (generated once at first store open,
persisted idempotently, compared constant-time).

**Why:** a packet-keyed gate judging its own decision op creates an infinite
regress — the first decide packet would need an approval for its own key. The
token separates *what is governed* from *who decides*, and gives the bootstrap
path without manual DB edits.

**Rejected:** exempting only the first-ever decide packet (implicit privilege,
hard to reason about); a manual operator file edit (exactly what the mission
forbids).

**Security accounting:** strictly stronger than the status quo, where nobody
could decide anything from any external surface. The token never appears in
agent-facing responses. Not a gate weakening — the registry for *governed
operations* (bind, persona) is unchanged.

**Compatibility:** existing tests that exercised the old "decide asks first"
contract were rewritten to the new contract (ask → operator decides with the
token → resend proceeds); the operator must learn one new parameter
(`operator_token`) which CLI/operator tooling can read from the store.

## AD-4 — SQL-level scope enforcement, post-filter only for the vector index

**Decision:** the viewer clause rides the `learnings` queries (filter, facts,
BM25 metadata, chain via a per-row scope read); the embedding store — which has
no scope column — is filtered through `VisibleLearningIDs` after retrieval.

**Rejected:** pushing scope into the vector store (schema change with no
upstream migration story for `vector_search`); fetching everything and
filtering in Go for the SQL paths (the mission prefers in-query enforcement).

**Residual:** a private row can consume a vector-lane slot before being
dropped (top-k). Documented, not a correctness hole.

## AD-5 — The manifest travels with the pack; verification falls back to
deterministic re-assembly

**Decision:** the build response carries the manifest; `check_pack_loss`
verifies against a presented manifest (after re-hashing its fingerprint) or, if
none was carried through, against the deterministic re-assembly of the same
request.

**Why:** the audit never stores content, so the manifest must live with the
caller. The re-assembly fallback keeps `check_pack_loss` usable for callers
that never carried the manifest while eliminating the false-loss class of
results (same request ⇒ same selection).

**Rejected:** server-side manifest storage (violates the "audit never stores
content" line); trusting the caller's claimed fingerprint without
re-computation (tamper window).

## AD-6 — Canonical scopes migrate in place; the legacy value stays readable

**Decision:** `public`→`global` rewrite at open (single transaction,
idempotent); the SQL clauses accept both values so databases touched by older
binaries stay readable; new writes store the canonical value.

**Rejected:** a version-gated schema migration (heavier machinery for a
one-column value rewrite); renaming the column (no benefit).

**Guarantee:** nothing becomes more accessible — the semantics of `public` and
`global` are identical ("published to every viewer"); ownership and lifecycle
are untouched.

## AD-7 — No generic adapter interface was added

**Decision:** WS-G's smallest justified boundary is the one WS-A already built
(`ActorContext` as the integration seam) plus the capability matrix; no
`AgentAdapter` interface was introduced.

**Why:** the existing integrations share one param-building path and differ in
env resolution, not in rendering or execution; forcing an interface now would
be abstraction without a second implementation to design against. Revisit when
a third distinct integration surface appears (documented trigger).

**Rejected:** the full four-method adapter contract from the mission sketch
(premature; unsupported capabilities would be stubs).

## AD-8 — Operator token persisted in the governance config table

**Decision:** the token lives in `governance_config` inside the store (created
at first open) rather than a 0600 sidecar file.

**Why:** `:memory:` stores (tests, ephemeral runs) must bootstrap the same way;
the store's directory permissions are already the local credential boundary
(0700 data dir, same as the bearer token's store). The file variant remains a
reasonable hardening step and is noted as future work, not a residual gap: the
token's threat exposure is identical to the deployment's other local
credentials.
