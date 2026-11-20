# Nemons Threat Model

Scope: the Nemons daemon + MCP server + storage as shipped on HEAD `54fe432`,
one host, one data directory (`~/.claude/nemons`, mode 0700), one shared
bearer token, multiple coding agents on the same machine.

## Actors

| Actor | Channel | Trust |
|---|---|---|
| Coding agent (Claude Code plain) | `nemons mcp` stdio → daemon HTTP/socket | same-UID local process; identity from env/PID only |
| Coding agent (opencode + plugin) | plugin hook → `nemons mcp` → daemon | plugin injects authoritative `_session_id` via tool args (YM-271); channel indistinguishable from model args |
| Coding agent (codex) | `nemons mcp` → daemon | env-resolved identity where the daemon spawned it |
| The model inside an agent | writes tool-call JSON | **adversarial**: controls every ordinary tool argument, including `_source_agent` |
| Operator (human) | CLI + `governance_decide` surface | authorized to decide approvals, bind agents, write global scope |
| Internal system ops | in-process marks (`_internal_call`, job surface) | not decodable from any external payload (private types) |
| Same-UID local process | direct DB / env access | out of scope by the local threat model (documented residual — the 0700 data dir is the boundary) |
| Remote caller | HTTP surface | bearer token required; read-only surface; token is shared per-host |

## Trust boundaries

1. Model → tool arguments (fully adversarial; every field is attacker data).
2. MCP server → daemon payload (the boundary where server-resolved identity
   must win over model-written fields).
3. Daemon handler → storage query (the boundary where visibility must be
   enforced, ideally in SQL).
4. Job surface / internal marks → handler dispatch (in-process private types;
   not forgeable from JSON).
5. Governance gate → governed methods (packet-keyed approvals; decision
   authority must sit outside the gate).

## Assets

- Knowledge rows and their sharing scopes (private rows are the crown jewels).
- Context packs and the claims they carry (integrity of what was delivered).
- Approval rows and audit history (integrity of the governance state).
- The bearer token and the operator token (authentication material).

## Threat scenarios (mapped to findings in REMEDIATION_PLAN.md)

| # | Scenario | Finding | Mitigation |
|---|---|---|---|
| T1 | Agent B sends `_source_agent=A` (or `admin`) inside a normal tool call and reads A's private rows or writes rows attributed to A | F-1 | server-resolved identity overwrites model fields; daemon resolves an ActorContext with an explicit identity source; unauthenticated claims cannot act as another actor |
| T2 | Agent B reads A's private row by ID, by history chain, via `query_facts`, `hybrid_search` or `vector_search` | F-2 | one authorization-aware read boundary; every agent-facing read passes the viewer; vector lane post-filtered by visible IDs |
| T3 | Request without any identity reads as the system and sees everything | F-3 | empty identity fails closed on agent-facing reads; system reads require the explicit internal identity |
| T4 | Two different packs share one fingerprint, hiding substitution in transit | F-4 | manifest fingerprints canonical item content (id, content hash, position) |
| T5 | Budget-limited delivery reported as loss (false alarm) or substitution reported as lossless | F-5 | verification compares against the exact build manifest, or against the deterministic re-assembly when no manifest is presented |
| T6 | Governance cannot be operated (decide blocked by decide) → operator is pushed to manual DB edits | F-6 | decision authority separated from the gate; operator token authenticates decisions; audit intact |
| T7 | Model calls `governance_decide` itself, approving its own packet | F-6 | decide requires the operator token (constant-time compare); model never holds it |
| T8 | Agent writes a row with global scope and leaks it to every project | F-8 | global-scope writes require operator authorization; unknown scope values fail closed |
| T9 | Legacy migration makes previously restricted rows readable | F-8 | migration maps scope values without touching ownership or lifecycle; restrictions preserved; tests pin the access matrix |
| T10 | One agent's context pack is replayed into another agent's session | T1+T2 | packs are assembled per actor; manifest binds actor+project; verification re-checks under the verifying actor |

## Residual risks (explicit, not hidden)

1. **Same-UID local processes** can read the DB directly or impersonate env
   channels. Mitigation is the OS boundary (0700 data dir). This is the
   documented upstream position (YM-271) and stays true after remediation;
   what remediation removes is *model-level* spoofing.
2. The bearer token is shared per host; HTTP identity is not per-agent. The
   read-only HTTP surface plus the scope gate bound the damage.
3. `check_pack_loss` without a presented manifest re-assembles deterministically;
   if the source mutated between build and check, the re-assembly differs from
   the original build (reported as altered, not silently accepted).
4. Vector-store post-filtering filters after retrieval (top-k), so a
   private row can consume vector-lane slots before being dropped; BM25 and
   SQL lanes enforce scope inside the query. Documented limitation, not a
   correctness hole.
