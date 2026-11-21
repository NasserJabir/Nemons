# The Nemons Governance Operator Guide

Remediation 02 WS-D. This is the human operator's manual: how to inspect
pending governance asks, decide them, and recover from a lost operator token —
without the token ever reaching a Coding Agent or the model.

## Who this is for

The operator is the human running the Nemons daemon on this machine. Agents
(MCP clients) can trigger governed operations, which creates **asks**; only
the operator **decides** them. The decision authority is the operator token,
generated once at first daemon start and stored inside the database under the
OS file-permission boundary.

## Commands

```
nemons governance status
nemons governance approvals list
nemons governance approvals show <key>
nemons governance approvals decide <key> --decision allow|deny
nemons governance operator rotate-token
nemons governance pack-key rotate
```

### status

Pending-ask count and queue, plus whether the operator token is configured —
presence only. The token value is never printed by any status output.

### approvals list / show

The queue of open asks, and the full record of one ask (method, caller,
surface, requested, expiry). Decided and expired asks are history, shown only
in the audit trail (`GovernanceSnapshot`), not as pending work.

### approvals decide

```
nemons governance approvals decide gate.remember:/w/probe --decision allow
operator token: (pasted invisibly, or piped)
```

- The token is read from **stdin** or the `NEMONS_OPERATOR_TOKEN`
  environment variable — never a command-line argument (argv is visible in
  process listings).
- A wrong token records nothing and the refusal never names the right one.
- A decision lands in one transaction with its `approval.decided` audit
  event; a decided ask cannot be decided again (`governance approval is not
  open`).
- `allow` does not re-run the call: the agent that triggered the ask resends
  it and the gate folds open for the standing grant.

### operator rotate-token — recovery and rotation

For a **lost or corrupted token** (or scheduled rotation):

```
nemons governance operator rotate-token
this invalidates the current operator token immediately. type `rotate` to confirm:
rotate
operator token rotated. the new token follows; store it in the operator's secret store now:
<64 hex chars>
```

- Requires the interactive confirmation (or `--yes` for scripted runs by an
  operator who knows what they are doing).
- The old token stops working immediately; the new one is printed **once**,
  on this terminal.
- The rotation writes a `governance.operator_token_rotated` audit event.
- No daemon surface can rotate the token: an agent cannot become the
  operator.

### pack-key rotate

Rotates the Context Pack receipt signing key (see
`docs/remediation/02/ARCHITECTURE_DECISIONS.md` AD-02-4). Every outstanding
pack receipt becomes unverifiable — packs must be rebuilt to re-issue them.
Run this if the key file was lost or after a suspected exposure; do not run
it casually.

## The token's boundaries (what makes it operator-only)

1. The token is generated at first store open, persisted in the database,
   compared in constant time.
2. The CLI reads it from stdin/env; argv is never used for secrets.
3. No status, list, show, or decide output contains it; the audit trail and
   pending list never carry it; MCP responses never include it.
4. `governance_decide` exists only on the daemon socket surface for operator
   tooling — it is **not** registered as an MCP tool, so a model cannot even
   reach it.
5. A model can create asks (that is the governed flow); it can never see the
   queue in detail, never decide, and never recover the token.

## Restore-after-crash notes

- The token lives in the database (`governance_config`); restoring a database
  backup restores its token. If the backup is stale and the token is unknown,
  use `operator rotate-token`.
- Restoring a database backup that carries an older pack signing key-id will
  make the pack key file mismatch the record: packs are refused until the key
  is rotated explicitly — exactly the fail-closed behavior of AD-02-4.
- Both rotations are operator actions on the local machine; nothing about
  them is reachable from the daemon's agent-facing methods.
