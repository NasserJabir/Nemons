# QODER-03 — Architecture Remediation Plan

**Status:** PROPOSED — awaiting review. Nothing in this document has been implemented.
**Inputs:** `QODER-02-context-assembly-forensics.md` (confirmed findings), `QODER-01-host-capability-report.md` (host capability boundary), and the targeted source re-reads listed in §1.0.
**Scope:** architecture and planning only.

---

## 0. Constraints honoured by this document

| Constraint | How it is honoured |
|---|---|
| No code changes | Only this document was written. §11 contains proposed interfaces as text, not as files. |
| No store modifications | §12 describes migrations as *proposals*; none was executed. No record was rewritten, moved or deleted. |
| No asset adoption | §4 defines the ingestion and adoption *contract*; it adopts nothing. Every repository asset remains untouched and unadopted. |
| No silent migration | §12 requires read-old/write-new, a written report per migration run, and a retained backup. No inference is applied to existing records without a `confidence` marker. |
| No weakening of approval or governance rules | §4.2 keeps the trust axis (`provenance.kind`) and the governance axis (`CandidateStatus`) separate and requires the existing governed transition rules for any promotion. Nothing here removes a review step. |
| No claims of unimplemented capability | §15 lists what this plan explicitly does **not** claim. Every "existing behavior" statement below cites a file and line range read in this session. |
| Runtime / Coding Agent separation preserved | §5.1 and §9 D-07 keep execution state in the Coding Agent and *reported* execution state in the Runtime. The Runtime records what it was told and what it observed; it never asserts that the agent did something it did not report. |

**Reading rule.** Where the daemon and the TypeScript core disagree, this document names which one is authoritative for that item. It does not blend them into a third, undefined behaviour.

---

## 1. Baseline

### 1.0 What was re-verified for this plan

The QODER-02 audit was not repeated. Only the sources needed to make design decisions were re-read:

| File | Purpose |
|---|---|
| `docs/06-contracts/{CONTEXT_PACK,RUN,EVIDENCE,EXPERIENCE,KNOWLEDGE}.md` | The declared contract, to measure the gap against implementation. |
| `nemos-core/src/schemas/{context-pack,run,evidence,experience,knowledge,persona,skill,candidate}.ts` | What is already specified in TypeScript. |
| `nemos-core/src/core/identifiers.ts` | The existing identity model (`RepositoryIdentity`, `RepositoryInstanceId`). |
| `nemos-core/src/context/{context-resolver,context-pack-builder}.ts` | The existing resolution and pack-construction contract. |
| `nemos-core/src/persistence/persistence-contract.ts` | The existing store contract (hash-verified, quarantine-on-corrupt). |
| `nemos-core/src/p2-features.ts` | `Project`, `InMemoryProjectStore`, `buildLineage`. |
| `nemos/src/daemon/core-loop.js`, `src/utils/pipeline-integrator.js`, `unified-skills.js`, `knowledge-store.js`, `cbr.js`, `persona-evolver.js`, `harness-router.js`, `harness-feature.js`, `runtime-config.js`, `nemos-bridge.js` | What the MCP surface actually executes. |
| `personas/*.json`, `skills/*.json`, `knowledge/*.md` | Repository asset formats. |
| `nemos/tests/*.js`, `nemos-core/tests/**/*.test.ts` | Existing coverage. |

### 1.1 The single structural finding behind eleven symptoms

There are two implementations of the same product.

`nemos-core` specifies the whole object graph — Project, Run, Evidence, Evaluation, Experience, Context Pack, `RepositoryIdentity`, lifecycle, policy engine, hash-verified persistence — across 70 vitest files. The daemon, which is the only thing an MCP host can reach, implements a **parallel and unspecified** pipeline in `nemos/src/utils/pipeline-integrator.js`, and consumes exactly one core capability on that path: the `validateContextPack` validator exposed by `nemos-bridge.js` and reached through the `/core/validate/context-pack` route.

Consequences that follow from that one fact rather than from independent bugs:

- The daemon has no `Project` concept, so no asset can be project-scoped (F-05, F-12).
- The daemon has no `Run` record, so evidence and experience cannot reference one (F-04).
- The daemon never calls `DefaultContextResolver` or `DefaultContextPackBuilder`, so `exclusions[]`, `selectionReason` and `provenanceKind` never reach a caller (F-01, F-02).
- The daemon never uses `PersistentStore`, so no record is hash-verified and "corrupt" is indistinguishable from "absent" (F-02).
- `RunTaskKind` in the core has no `documentation` member, and the daemon's harness router has no documentation profile, so documentation work is routed as a generic feature (F-10).

Therefore the plan is organised around one decision — **D-01: is `nemos-core` the runtime contract, or a library?** — and is written so that Phase A work is the same under either answer. The decision shapes the *destination* of Phase B, not the correctness of Phase A.

### 1.2 Finding register

Format per finding: root cause, affected modules and contracts, existing behaviour, intended behaviour, dependencies, tests that exist today, regression tests that do not.

---

**F-01 — Component execution is declared, not reported**

- **Root cause.** `pipeline-integrator.js` returns a hard-coded ten-item `components_used` array at L368–379, byte-identical in content to the static `stats()` list at L616–634. `core-loop.js` L124 forwards it into the `analyze_prompt` result unchanged.
- **Affected.** `pipeline-integrator.js`, `core-loop.js`, MCP tool `nemons.analyze_prompt`, `docs/06-contracts/CONTEXT_PACK.md` (which has no component-status section to fail against).
- **Existing behaviour.** A pack reports `cbr_experiences`, `knowledge_store` and `unified_skills` as components used while the corresponding channels are empty. The list is emitted even when a step threw, because the catch handlers swallow the error and the literal is returned anyway.
- **Intended behaviour.** Each component reports one of `declared | configured | invoked | completed | failed | skipped`, with a machine-readable skip/fail reason and per-channel counts.
- **Depends on.** Nothing. F-01 is the cheapest and most load-bearing finding: it is what makes the other findings observable.
- **Covered today.** No test file under `nemos/tests/` references `components_used` (grep, 0 matches). The claim has never been asserted.
- **Missing.** A test that fails when a component is reported `completed` while its channel count is zero; a test that a thrown step yields `failed` with the error class, not `completed`.

---

**F-02 — Four retrieval states collapse into one `[]`**

- **Root cause.** Three `catch` blocks inside `pipeline-integrator.js` (skills step L146–168, experiences step L173–190, knowledge step L199–206) replace a failure with an empty array, and `unified-skills.js` `listAll` ends in `catch { return [] }` (L213–224). A missing directory, an unreadable directory, a schema-invalid asset, a store that does not exist, an empty store, and a genuine no-match all produce the same value.
- **Affected.** `pipeline-integrator.js`, `unified-skills.js`, `knowledge-store.js`, `cbr.js`, and the pack schema, which has no place to record an error.
- **Existing behaviour.** The pack cannot distinguish "you have no skills installed" from "your skills directory is unreadable" from "nothing matched". A user cannot tell which action to take.
- **Intended behaviour.** Ten distinct states, each with a reason code: `disabled`, `not_configured`, `store_missing`, `store_unreadable`, `empty_store`, `schema_invalid`, `no_match`, `filtered_lifecycle`, `filtered_applicability`, `filtered_capability`, plus `error`. Only `completed` with count 0 may legitimately be reported as "retrieved nothing".
- **Depends on.** F-01 (there must be a field to report the state into).
- **Covered today.** `defect-regression-tests.js` L115–131 covers *ranking* honesty (an unrelated experience does not leak; similarity is reported separately from the blended score) against a fixture store, not state distinction.
- **Missing.** One test per state, driven by a purpose-built directory (missing / unreadable / empty / invalid JSON / valid-but-non-adopted), asserting the state code rather than the array length.

---

**F-03 — Stored Experiences are mathematically unretrievable**

- **Root cause.** `cbr.js` `sim()` (L8–25) returns 0 when either side is empty; `retrieve()` (L32–45) applies a `minSimilarity` floor of `0.15` (L34) and filters on `similarity >= floor` (L42). In the audited default home, all 8 stored Experiences carry `prompt: ""`, so every similarity is 0 and every Experience is dropped. The empty prompt enters through `core-loop.js` `evaluateRun` L167–170, which forwards `prompt || ""` when the host omits `prompt`, and the retention path persists whatever prompt it was given.
- **Affected.** `cbr.js`, `core-loop.js`, `pipeline-integrator.js` L173–190, MCP tools `nemons.evaluate_run` and `nemons.retrieve_similar_experiences`.
- **Existing behaviour.** Retrieval always returns nothing against real data, while a fixture-based test proves the ranking code works. The failure is in the data shape, not the comparator.
- **Intended behaviour.** A retrieval key is a **retention-time invariant**. An Experience that cannot be matched is not retained as reusable; if a legacy record has no key, it is excluded with the explicit reason `retrieval_key_absent` rather than silently scoring zero.
- **Depends on.** F-04 (the key must be derived from a real Run's task description, which requires the Run to exist).
- **Covered today.** `defect-regression-tests.js` L123–131 asserts `similarity > 0` for a fixture with a real prompt.
- **Missing.** A retention test that refuses an Experience whose prompt is empty; a retrieval test over a store of legacy empty-prompt records asserting `retrieval_key_absent` per record rather than an empty array.

---

**F-04 — Run–Evidence–Experience is unlinked**

- **Root cause.** Four separate facts.
  1. `collectEvidence` (`core-loop.js` L142–164) requires `run_id`, validates it as an identifier, and writes the body to `evidence/<run_id>.json` (L155). The run id exists only as a *filename*; the record body contains no `run_id`, no project, no task, no timestamp.
  2. `evaluateRun` (`core-loop.js` L167+) destructures `run_id` and never references it in the body — the parameter is validated by the MCP schema and then discarded.
  3. `storeExperience` (`core-loop.js` L203–213) persists `{id, timestamp, ...data}` with no validation, so an Experience may arrive with no `runId`, no `evaluationId`, and arbitrary extra fields.
  4. No Run record is ever created or persisted anywhere in the daemon.
- **Affected.** `core-loop.js`, `docs/06-contracts/RUN.md`, `docs/06-contracts/EVIDENCE.md`, `docs/06-contracts/EXPERIENCE.md`, the core `Run`/`Evidence`/`Experience` schemas (which already require these links and are already tested in `nemos-core/tests/schemas/*`).
- **Existing behaviour.** `Project → Run → Evidence → Evaluation → Experience` cannot be traversed in either direction. A stored Evidence record cannot be attributed to the task that produced it.
- **Intended behaviour.** §3 of this plan.
- **Depends on.** F-05 (a Run needs a project to belong to, or an explicit unbound scope).
- **Covered today.** Core unit tests cover the schemas in isolation (`nemos-core/tests/schemas/{run,evidence,experience}.test.ts`) and the run manager (`tests/run/run-manager.test.ts`), but there is no test on the *daemon's* path, because the daemon path has no such objects.
- **Missing.** A four-step MCP continuity test (`analyze_prompt` → `collect_evidence` → `evaluate_run` → `store_experience`) asserting that each record's foreign keys resolve to a real record, and a test that a dangling reference is reported rather than accepted.

---

**F-05 — No project identity exists**

- **Root cause.** `ProjectId` does not appear anywhere in `nemos/src`. `nemos-core` has `Project {id, name, description, repoUrl?, createdAt, runIds[]}`, `InMemoryProjectStore` and `buildLineage` in `p2-features.ts`, but the daemon uses none of them. `runtime-config.js` L20–22 resolves a single global `NEMONS_HOME`; nothing derives or records a repository.
- **Affected.** Every store, every pack, the whole retrieval path, `docs/06-contracts/*` (which assume a Run has a repository context).
- **Existing behaviour.** Two repositories sharing one `NEMONS_HOME` share one undifferentiated pool of experiences, evidence and candidates. An experience learned in repository A is retrievable in repository B with no signal that it came from elsewhere.
- **Intended behaviour.** §2.
- **Depends on.** Nothing conceptually; but it must land before F-04 can be completed honestly, because a Run without a project is an ambiguous record.
- **Covered today.** `nemos-core/tests/p2-features.test.ts` covers `buildLineage` over an in-memory store. Nothing covers scoping.
- **Missing.** Tests for: same project across a path move; two clones of one repo; a fork; two unrelated projects in one home; an unbound run.

---

**F-06 — Dynamic pack identity is ephemeral and collides**

- **Root cause.** `pipeline-integrator.js` L338 mints `id: "dynamic-" + Date.now().toString(36)`. The pack is returned inline at L366 as `suggested_pack_id` and is **never persisted**: the audited home's `context-packs/` directory contained 0 files after the call. `getContextPack` (`core-loop.js` L217–261) reads only `<NEMONS_HOME>/context-packs/<id>.yml` (L227), so a suggested dynamic id can never resolve. The generator has no collision suffix, unlike `cbr.retain` which appends `crypto.randomBytes(3)`.
- **Affected.** `pipeline-integrator.js`, `core-loop.js`, `nemons.get_context_pack`, `docs/06-contracts/CONTEXT_PACK.md`.
- **Existing behaviour.** `analyze_prompt` returns an id that the very next tool call cannot retrieve. Two `analyze_prompt` calls in the same millisecond produce the same id.
- **Intended behaviour.** §6.
- **Depends on.** F-05 (a persisted pack needs a scope) and F-07 (the retrieval contract).
- **Covered today.** No test asserts that a returned `suggested_pack_id` is retrievable. This is precisely why the defect survived: delivery and retrieval were never tested together.
- **Missing.** The round-trip test: `analyze_prompt` → take `suggested_pack_id` verbatim → `get_context_pack` → assert `resolution == "retrieved"`, `pack_kind == "dynamic"`, and content equality with the inline body.

---

**F-07 — Synthetic content is substitutable for a requested real pack at the tool boundary**

- **Root cause.** `core-loop.js` L236–259 returns HTTP 200 with `is_synthetic: true`, `source: "synthetic_fallback"` and a `note` for any unknown id. The body is labelled — it is not *silent* at the HTTP layer — but the MCP layer (`routes/mcp.js`, which treats a 200 as success) turns it into a successful tool result, so a caller reaching Nemons over MCP cannot distinguish "here is your pack" from "your pack does not exist; here is a fabrication". The HTTP 200 is asserted as intended behaviour by `defect-regression-tests.js` L135–141.
- **Affected.** `core-loop.js`, `routes/mcp.js`, `nemons.get_context_pack`.
- **Existing behaviour.** A request for a real pack that does not exist yields a success-shaped result containing synthetic persona, synthetic knowledge and synthetic criteria.
- **Intended behaviour.** An explicit opt-in for synthetic content; otherwise a distinguishable not-found. The existing HTTP contract can be preserved while the tool contract is made honest (§6.4).
- **Depends on.** F-06 (an id only deserves a not-found after real packs are retrievable, otherwise every request becomes an error).
- **Covered today.** `defect-regression-tests.js` L135–141 pins the current HTTP shape.
- **Missing.** Tests for: unknown id without opt-in → not-found; unknown id with opt-in → synthetic *and* labelled; malformed id → invalid; unreadable store → unavailable, distinct from absent.

---

**F-08 — Repository assets are never ingested**

- **Root cause.** The installers create the home directory tree and copy exactly two configuration files (`install.sh` L45–47, mirrored in the per-OS scripts). No installer or runtime command seeds assets. Meanwhile the repository ships 18 personas, 24 skills, 2 knowledge documents, 13 subagents and 8 context packs, and two assets literally document an installation convention — `personas/backend-architect.yml` and `knowledge/project-conventions.md` both begin with a "Place at: ~/.nemons/..." line — that no code implements.
- **Affected.** `install.sh`, `scripts/{linux,macos,windows}/*`, `src/commands/*`, every store, `unified-skills.js` `SKILLS_DIR`, `knowledge-store.js` `DEFAULT_DIR`.
- **Existing behaviour.** A fresh installation has zero skills and zero adopted knowledge, so the Skills and Knowledge channels are structurally empty for every new user regardless of prompt.
- **Intended behaviour.** §4: explicit ingestion with validation, dry-run, candidate state, and no silent interpretation.
- **Depends on.** Nothing to *ingest*; depends on F-05 for scope and on the adoption path (F-09) to become useful.
- **Covered today.** No test covers ingestion, because no ingestion exists.
- **Missing.** Round-trip tests per asset type: repository file → parse → validate → store → retrieve, asserting the asset's *meaning* (every field) survives.

---

**F-09 — Adoption is unreachable from the host surface**

- **Root cause.** `approval-promotion.js` promotes a candidate only when a matching approval entry exists; it is invoked from the HTTP/MCP governance routes rather than from any of the seven MCP tools. The seven tools are `analyze_prompt`, `get_context_pack`, `collect_evidence`, `evaluate_run`, `store_experience`, `retrieve_similar_experiences`, `health_check` — no approval, no adoption, no promotion. So through the host integration, a candidate can be proposed but never promoted.
- **Affected.** `approval-promotion.js`, `routes/mcp.js` (tool list), `src/commands/plugin.js`, `docs/06-contracts/*`.
- **Existing behaviour.** 16 candidates and 10 evolved personas existed in the audited home, all in `candidate` state, and the resolver excludes non-adopted assets by design (`pipeline-integrator.js` L71–80), so the governance machinery is present and inert.
- **Intended behaviour.** §4.2: a documented, governed promotion path reachable by the host, preserving separation of duties and the existing transition rules.
- **Depends on.** F-04 (a candidate should cite the evidence that justified it) and D-08.
- **Covered today.** `nemos-core/tests/governed-evolution/*` covers the engine thoroughly; `defect-regression-tests.js` covers propose/review over HTTP. Nothing covers promotion from the MCP surface, because there is nothing to cover.
- **Missing.** A test that promotion without an approval record is refused with a reason (not an exception); and that a promotion preserves the previous version for rollback.

---

**F-10 — Classification is substring-based and has no documentation route**

- **Root cause.** Three independent defects.
  1. `persona-evolver.js` `detectDomain` (L175–193) iterates a keyword map in insertion order and uses `prompt.includes(kw)`. `"ai"` belongs to `machine-learning`, which is the first key, so any word containing the letters `ai` matches. Reproduced on the audited prompt: `FIRST MATCH DOMAIN = machine-learning | matched substrings: ["ai"]`, taken from `constrAInts`.
  2. `unified-skills.js` `retrieve` (L112–143) scores with `q.includes(trigger)` (L122–123) and then drops scores of zero (L130) — the same substring class of defect, plus no boundary handling.
  3. `harness-router.js` `route` (L108–165) selects by first regex match in a fixed order (L113–119), and `harness-feature.js` `matches` is `/\b(implement|add|create|build|develop|make|construct)\b/i` (L47–50). A documentation task phrased "Implement a small documentation-only change" matches the feature harness, whose `must_pass` list (`harness-feature.js` L18–24) includes `feature_implements_spec`. There is no documentation profile anywhere.
- **Affected.** `persona-evolver.js`, `unified-skills.js`, `harness-router.js`, `harness-feature.js`, `nemos-core/src/schemas/run.ts` (`RunTaskKind` has no `documentation` member), `docs/06-contracts/*`.
- **Existing behaviour.** A documentation task is graded against a feature rubric, and a general prompt can be assigned a machine-learning domain. Both are silent.
- **Intended behaviour.** §7. Deterministic, tokenised, testable, with the offending inputs as named regression cases.
- **Depends on.** Nothing; independent of the lineage work.
- **Covered today.** `nemos/tests/v421-persona-tests.js` covers persona evolution behaviour; but no test asserts that a prompt *without* a domain must not acquire one.
- **Missing.** Negative classification tests (`constrAInts` → general; `maintain` → general; `email` → not `ai`), positive documentation routing, and a byte-identical-criteria test proving existing harnesses are unchanged.

---

**F-11 — Declared configuration is inert**

- **Root cause.** `loadDaemonConfig` (`runtime-config.js` L24–33) returns `{}` on any read or parse failure, so a malformed config is indistinguishable from an absent one. Several declared options are never read on the analysis path — for example `harness.cbr_retrieval_strategy` is declared in `harness-feature.js` L38–42 and consumed nowhere. In the audited default home, `~/.nemons/config/daemon.yml` did not exist at all.
- **Affected.** `runtime-config.js`, `harness-feature.js`, `core-loop.js` (`criteriaFromConfig`, L110–115), `config/daemon.yml`.
- **Existing behaviour.** "Configured" is not a state the system can report, so §5's state ladder has no rung between "declared" and "invoked".
- **Intended behaviour.** Config load reports `loaded | absent | invalid(reason)`; every declared key either has a consumer or is rejected at load time as unknown.
- **Depends on.** F-01 (the state must be reportable).
- **Covered today.** No test asserts that a configured value changes behaviour, which is why decorative keys were never noticed.
- **Missing.** A test per declared key: set it, observe the effect, or fail.

---

**F-12 — Storage has no scope dimension**

- **Root cause.** `server.js` L32 creates `["context-packs", "experiences", "evidence", "logs", "audit"]` directly under `NEMONS_HOME`; `unified-skills.js`, `knowledge-store.js`, `persona-evolver.js` and `cbr.js` resolve their directories from the same global root at module load.
- **Affected.** All stores, `runtime-config.js`, `server.js`.
- **Existing behaviour.** One flat namespace for everything, shared by every repository that uses the same home.
- **Intended behaviour.** §2.4: a scope ladder with an explicit `scope` on every record, project directories under a registry, and global assets retained as a distinct tier.
- **Depends on.** F-05.
- **Covered today.** Nothing.
- **Missing.** Isolation tests: asset written in project A is not retrieved in project B; a global asset is retrievable from both.

### 1.3 Dependency summary

```
F-05 (project)  ──► F-12 (scoped storage) ──► F-04 (Run records) ──► F-03 (retrieval key)
      │                                            │
      │                                            └──► F-09 (adoption cites evidence)
      └──► F-06 (pack identity) ──► F-07 (retrieval honesty)

F-01 (component evidence) ──► F-02 (state distinction) ──► F-11 (config state)
F-10 (classification) is independent.
F-08 (ingestion) is independent of the lineage chain but useless without F-09.
```

Phase A in §8 is ordered so that every arrow is respected.

---

## 2. Project Identity and Scope

### 2.1 Why a repository path is not an identity

A path fails as identity in six ordinary situations: the checkout moves; the user clones the same repository twice; a worktree is created; the repository is forked; the default branch is checked out at a different commit; the same repository is mounted at a different path on another machine. In each case a path-keyed identity either shatters one project into several or merges two distinct ones. Since the purpose of the identity is to decide which learned assets apply, both errors are correctness failures, not cosmetic ones.

`nemos-core/data-model` already encodes the correct distinction — "Identity is not instance":

```ts
export interface RepositoryIdentity { readonly repo: string; readonly sha: string; }
export interface RepositoryInstanceId {
  readonly repoIdentity: RepositoryIdentity;
  readonly instanceId: string;
  readonly workTreePath?: string;
}
```

The plan adopts that split and adds the level above it: a **Project** is the durable thing assets belong to; a **RepositoryInstance** is one checkout of it; a **Run** happens in an instance.

### 2.2 Proposed model

```
ProjectRecord
  project_id      minted once, never derived from a path or a name
  display_name    mutable label, not identity
  identities[]    zero or more RepositoryIdentity {repo, sha?} observed for this project
  aliases[]       historical root paths, all recorded, none authoritative
  root_hint       the last observed realpath — a hint, explicitly not identity
  fork_of?        project_id of the upstream project, for forks
  created_at, last_seen_at
  scope_default   "project"
```

**Identity is minted, not computed.** `project_id` is created once by `freshId()` and thereafter only looked up. Any scheme that *derives* the id from a path, a remote URL, or a name reproduces the failure it was meant to fix, because it changes when its input changes.

### 2.3 Binding: how a request is attributed to a project

Resolution is an ordered ladder. The first step that produces an answer wins, and **which step produced it is recorded on the Run** so the attribution is auditable.

| # | Anchor | Result | Notes |
|---|---|---|---|
| 1 | Explicit `project_id` in the tool arguments | bound, `binding: "explicit"` | Highest trust. Unknown id → error, never a new project. |
| 2 | `NEMONS_PROJECT` environment variable | bound, `binding: "env"` | For CI and scripted use. |
| 3 | `.nemons/project.json` in the working tree or the nearest ancestor | bound, `binding: "manifest"` | Contains `{"project_id": "..."}` only. Committable, so a team shares one project across machines. |
| 4 | Canonicalised `repo` identity matches exactly one registered project | bound, `binding: "repo_identity"` | Survives clone and path move; fails correctly at a fork, because a fork's remote differs. |
| 5 | `root_hint` matches an existing project's `aliases` (realpath, case-normalised) | bound, `binding: "path_alias"`, and the alias is refreshed | Recovers a project whose remote is unavailable offline. |
| 6 | Nothing matched | **unbound**, `binding: "unbound"` | See §2.5. The runtime does not invent a project. |

The manifest at step 3 is the recommended anchor for interactive use: it is explicit, reviewable, shared with the team by committing it, and does not depend on being able to reach a remote.

### 2.4 Scope

Every persisted asset carries `scope ∈ {"runtime-global", "project", "run"}`.

| Scope | Meaning | Location | Retrievable from |
|---|---|---|---|
| `runtime-global` | Installed for the machine: shared personas, generic skills, house conventions. | `<home>/global/...` | Any project |
| `project` | Learned or adopted for one project. | `<home>/projects/<project_id>/...` | That project only |
| `run` | Valid for the duration of one Run (experimental inclusion, a pack snapshot). | `<home>/projects/<project_id>/runs/<run_id>/...` | That Run only |

Resolution order for every asset kind is `run → project → global`. On an id+version collision the narrower scope wins, and the shadowed asset is recorded in the pack's `exclusions[]` with `reasonKind: "scope"` rather than disappearing. A user must be able to see that a global skill was overridden.

### 2.5 Multiple projects in one `NEMONS_HOME`, and the unbound state

The home becomes a registry:

```
<home>/projects/index.json                     # project_id → {display_name, identities[], aliases[]}
<home>/projects/<project_id>/project.json
<home>/projects/<project_id>/{personas,skills,knowledge,experiences,evidence,context-packs,candidates,runs}/
<home>/global/{personas,skills,knowledge,experiences,context-packs}/
<home>/_unbound/{runs,evidence,experiences,context-packs}/
```

`_unbound` is **not a project**. It is the bucket for records whose scope is genuinely unknown, and it is the only place where a legacy record can live without a false claim attached to it. Three properties follow:

- An unbound Run is fully usable — analysis, evidence collection, evaluation and pack retrieval all work.
- Unbound assets are retrievable **only** by unbound runs. They never leak into a bound project, because a record with unknown provenance must not silently become project knowledge.
- `health_check` reports `unbound_records: N` so the obligation is visible rather than forgotten.

### 2.6 Clones, forks, worktrees

| Event | Identity outcome | Asset outcome |
|---|---|---|
| Path moves | Same project via step 3 or 4; alias appended | Unchanged |
| Second clone of the same remote | Same project, distinct `RepositoryInstanceId` | Shared, as intended: it is one codebase |
| Fork | Different remote ⇒ step 4 must **not** match. A new project, `fork_of` set | Inherited only if the user explicitly imports; never automatic |
| Worktree / temporary checkout | Same project, distinct instance | Shared |
| Detached HEAD at another sha | Same project; `sha` is recorded per Run, not per project | Unchanged |
| Two unrelated repositories in one home | Two projects, isolated | Isolated |
| Home directory moved | Registry travels with it; ids are unchanged | Unchanged |

### 2.7 Propagation

- `Run.project_id` is required; it is null-able only in the `_unbound` case, and the Run then records `binding: "unbound"`.
- `ContextPack.project_id` is copied from the Run at build time and is part of the pack's content hash. A pack therefore cannot be reinterpreted in a different project later.
- `Evidence.project_id` is copied from the Run; a mismatch between an Evidence record's `project_id` and its Run's is an integrity failure.
- `Experience.applicability.repoPatterns` (already in the core schema) is populated from the project's identities at derivation time.

### 2.8 Backward compatibility

Records written before this change carry no `project_id`. On read they are interpreted as:

```ts
{ scope: "run-independent-unknown", projectId: null, migration: { origin: "pre-project", confidence: "unknown" } }
```

They are served from their current location through a compatibility reader, they are **not** moved, and they are **not** attributed to whichever project happens to be open. `confidence: "unknown"` is the entire point: the runtime must not guess, because a guess is indistinguishable from a fact once it is on disk.

Records that can be attributed without guessing are exactly two: evidence files named `<run_id>.json` whose run is later bound, and anything referencing an explicit `id`.

---

## 3. Run–Evidence–Experience Lineage

### 3.1 The graph

```
Project 1 ──── N Run
Run     1 ──── N Evidence            (evidence.run_id required)
Run     1 ──── N Evaluation          (evaluation.run_id required)
Evaluation 1 ─ N Experience          (experience.evaluation_id required)
Run     1 ──── N Experience          (denormalised, must equal evaluation's run)
Experience N ─ M Evidence            (experience.evidence_refs[], each must resolve)
Run     1 ──── 0..1 ContextPack      (the pack used; denormalised onto the Run)
```

`Experience.evidence_refs` is many-to-many and is the join that makes "which lesson came from which observation" answerable. A denormalised `run_id` on the Experience is kept because it is the most common query and because it lets a dangling reference be detected by comparison.

### 3.2 Identifiers

| Entity | Shape | Rule |
|---|---|---|
| Project | `proj_<uuid>` | Minted once; never derived |
| Run | `run_<uuid>` | One per invocation of a coding task |
| Evidence | `ev_<uuid>` | Content-addressed companions: `contentHash` |
| Evaluation | `eval_<uuid>` | One per verification | 
| Experience | `exp_<uuid>` | One per derived lesson |
| Context Pack | `dynamic-<base36-ms>-<8 hex>` or curated slug | Must be collision-checked before write |
| Asset | caller-supplied slug + `version` | Existing repository convention preserved |

All ids are minted by `freshId()` (`nemos-core/src/core/identifiers.ts`, `crypto.randomUUID`). Note the deliberate asymmetry: the pack id keeps a human-readable prefix *and* gains a random suffix. The current `Date.now()`-only scheme is not merely collision-prone; it is guessable by adjacent callers, which is a minor enumeration concern in a loopback daemon and a real one behind a shared host.

### 3.3 Required and optional references

| Field | Required when | Optional when | On absence |
|---|---|---|---|
| `Run.project_id` | Always | — | Run is written to `_unbound` with `binding: "unbound"` |
| `Run.task_id` | Caller supplied | Caller omits | `null`; not synthesised |
| `Run.context_pack_ref` | The Run used a pack | Pre-pack analysis only | `null` |
| `Run.evidence_refs[]` | — | Always | Computed, not stored, to avoid two sources of truth |
| `Evidence.run_id` | Always | — | Rejected: 400 `missing_run_id` |
| `Evidence.project_id` | Always | — | Copied from Run |
| `Evaluation.run_id` | Always | — | Rejected |
| `Experience.run_id` | Always | — | Rejected at retention |
| `Experience.evaluation_id` | Always | — | Rejected at retention |
| `Experience.evidence_refs` | ≥ 1 | — | Rejected at retention |
| `Experience.applicability` | Always | — | Defaults to the Run's kind/tags, recorded as `derived: true` |

### 3.4 The retention gate

An Experience may be **retained** only when all of the following hold. This is a retention-time check, not a retrieve-time filter, because a record that cannot be retrieved should not have been written as if it could.

1. `run_id` resolves to a persisted Run whose state is `succeeded`, `failed` or `aborted` — never `pending` or `in_progress`.
2. `evaluation_id` resolves to an Evaluation whose `run_id` equals the Experience's `run_id`.
3. `reusability == "reusable"` implies the Evaluation verdict is `verified_succeeded`. (This is already the documented invariant in `nemos-core/src/schemas/experience.ts` L59–61; the plan makes it enforced rather than aspirational.)
4. At least one `evidence_refs` entry resolves, and its `run_id` matches.
5. `summary` is non-empty.
6. A **retrieval key** is present: the normalised task signature derived from the Run's `taskDescription`. Without it the record is retained as `not_reusable` with `exclusion: "retrieval_key_absent"`, or not retained at all if the caller asked for a reusable Experience.
7. `project_id` is set, or the Run is explicitly unbound.

### 3.5 Storing is not approving

Three separate gates, three separate records. This is the distinction the user asked to preserve, and it is the reason the current system cannot express it.

| Gate | Question | Record | Effect |
|---|---|---|---|
| **Retention** | May this lesson be written down? | `Experience` | It exists and can be listed |
| **Eligibility** | May it be offered for reuse? | `Experience.reusability` + `applicability` | It can appear in a retrieval result |
| **Inclusion** | May it enter this pack? | `ContextPackAssetRef.policyDecisionRef` | It is actually delivered |

Retention never implies eligibility; eligibility never implies inclusion. A `not_reusable` Experience is retained deliberately — a recorded failure is valuable — and must remain visible in listings while being invisible to retrieval.

### 3.6 Missing and invalid references

| Condition | Detection | Behaviour |
|---|---|---|
| Dangling reference (target absent) | Resolution on read | Record loads with `integrity: "dangling_reference"`, excluded from retrieval, retained for audit, reported by `health_check` |
| Cross-project reference | `project_id` mismatch | Integrity failure, excluded, reported |
| Corrupt record (hash mismatch) | Store's hash check | Quarantined by the store, reported, never silently dropped |
| Missing required field | Schema validation at write | Rejected with a field-level error, nothing written |
| Duplicate id | Existence check | Rejected; no overwrite (current `storeExperience` spreads `...data` over a generated id and can overwrite) |

The governing rule: **a broken link never deletes data and never invents a target.** Both alternatives — cascading delete and silent backfill — destroy the evidence that something went wrong.

### 3.7 Migration of existing records

| Source | Target | Confidence |
|---|---|---|
| `evidence/<run_id>.json` | `Run` record, `status: "unknown"`, `migrated_from: "evidence-filename"`; the filename is the only fact asserted | `inferred` |
| Evidence body | Copied verbatim into `Evidence.payload`; not interpreted | `verbatim` |
| `experiences/<id>.json` with a `prompt` | `Experience` with `retrievalKey` derived from it, `runId: null` unless resolvable | `inferred` |
| `experiences/<id>.json` with `prompt: ""` | `Experience` with `reusability: "not_reusable"`, `exclusion: "retrieval_key_absent"` | `verbatim` |
| `context-packs/*.yml` | `CuratedPack` records, `pack_kind: "curated"` | `verbatim` |
| `candidates/*` (all `type: skill`) | `CandidateRecord`, unchanged status | `verbatim` |
| `personas-evolved/*` (all candidate) | `Persona`, unchanged provenance kind | `verbatim` |

Nothing in the migration is written back over the original files. The originals stay where they are; the new records live beside them; a compatibility reader serves the old paths until the registry reports zero unread records.

---

## 4. Asset Ingestion and Retrieval

### 4.1 The repository's existing formats, and whether they can be ingested without changing meaning

| Asset | File shape | Maps to core schema? | Can be ingested losslessly? |
|---|---|---|---|
| Persona | `personas/*.json`, keys `id, version, provenance, role, responsibilities, workingApproach, constraints, applicability` | **Yes — exact 1:1** with `nemos-core/src/schemas/persona.ts` | **Yes**, verbatim. No transformation, no field defaulting beyond schema defaults. |
| Persona (YAML) | `personas/backend-architect.yml`, opens with a `Place at: ~/.nemons/personas/...` comment | Same shape, different serialisation | **Yes**, after YAML→JSON. The `Place at:` line is a comment, not data: it must not become a field. |
| Skill | `skills/*.json`, keys `id, version, provenance, name, description, applicability, inputs, outputs, requiredCapabilities, failureConditions` | **Yes — exact 1:1** with `schemas/skill.ts` | **Yes**, verbatim. |
| Knowledge | `knowledge/*.md` — heading, prose, and a `Place at:` line; no `id`, `version`, `summary` or `applicability` | **No.** `schemas/knowledge.ts` requires `id, version, provenance, title, summary, content, applicability` | **Not losslessly.** See §4.1.1. |
| Experience | not in the repository; produced at runtime | Yes | N/A |
| Context pack | `config/context-packs/*.yml` (`stripe-webhook-handler`) | Loosely; the file has no `context_pack_id` or `selection_policy_version` | Losslessly ingestible as *curated*, with missing identity fields minted and marked `derived: true`. |

**The important finding for §4.** Two of the four kinds already conform exactly to the core schemas. The reason 24 skills and 18 personas sat unread in the repository is not a format mismatch — it is that nothing ever looks at the directory. That makes persona and skill ingestion a *missing step*, not a *translation problem*, and it can therefore be delivered without any risk of semantic drift.

There is a second half to that finding, and it is the sharper one. `skills/tdd.json` is a conformant core `Skill` — `id`, `version`, `provenance.kind: "approved"`, `applicability.taskKinds: ["feature", "test-fix", "refactor"]`, `requiredCapabilities`, `failureConditions` — and it is **not** a conformant input to the daemon's `unified-skills.register()`, which expects its own `status`/`domain`/`triggers` fields. So the repository asset is not malformed; the daemon invented a second asset format and then could not read the first. Ingesting these files therefore requires no reinterpretation, and any transformation proposed to make them "fit" the daemon registry would be exactly the silent change of meaning the constraints forbid. Under D-01 the direction of fit is the core's, and the daemon's registry shape is the thing that changes.

#### 4.1.1 Knowledge is the only genuinely lossy case

A Markdown document has no identity and no machine-readable applicability. Three transformations are unavoidable, and each changes meaning unless it is recorded:

1. **Title.** Taken from the first heading. A document whose first heading is an example or a draft note will acquire a wrong title.
2. **Summary.** Taken from the first paragraph. Same class of error.
3. **Applicability.** A prose document declares no `subjectKind`, no `taskKinds`, no `repoPatterns`. Inferring them from the body is interpretation.

The rule adopted:

> A prose document is **not** ingested as `Knowledge`. It is ingested as a `KnowledgeCandidate` carrying a `derivation` block that records the exact transformation applied — the heading used, the paragraph used, the lines dropped — and the candidate stays in `candidate` state until a human promotes it.

The `derivation` block is what makes this honest rather than merely cautious: a reviewer sees precisely which text became which field, so "the summary is the second paragraph" is a decision they can inspect, not an inference they must trust. `knowledge/project-conventions.md` additionally loses its `Place at:` install instruction under this rule; that line is *about* the file, not *in* it, and dropping it is recorded.

### 4.2 Lifecycle

Two axes that already exist in the codebase, plus one that does not.

**Axis 1 — trust (`provenance.kind`)**, defined in `nemos-core/src/schemas/knowledge.ts` L12–19 and enforced by `core/lifecycle.ts`:

```
observed → proposed → reviewed → approved → deprecated
```

**Axis 2 — governance (`CandidateStatus`)**, defined in `schemas/candidate.ts` L63–68:

```
proposed → under_review → approved | rejected
approved → superseded | under_review (rollback)
```

**Axis 3 — ingestion state (new, and deliberately subordinate):**

```
discovered → validated → staged → adopted → active
                │
                └──► rejected(validation | derivation-review)
```

`adopted` means "present in a store"; `active` means "eligible for retrieval". The distinction matters because an asset can be adopted-but-inactive (a candidate awaiting review) and that state must be visible, not silently dropped from listings.

**Invariant preserved:** `discovered → adopted` is a copy, not a promotion. A file's declared `provenance.kind` is carried over unchanged. Ingesting an `observed` asset yields an `observed` asset; it never becomes `approved` by virtue of having been imported. This is the "Generation ≠ Adoption" rule applied to file import.

### 4.3 Ingestion pipeline

```
discover(paths)  →  parse(by extension)  →  validate(schema)  →  classify(conforming | derived)
      →  stage(store, status=candidate unless the file declares otherwise)  →  report
```

| Stage | Failure | Result |
|---|---|---|
| discover | path absent / unreadable | `store_unreadable` for that path; the run continues |
| parse | malformed JSON / invalid YAML | asset rejected with the parser position; no partial write |
| validate | schema violation | rejected with the offending field; `--force` does not exist |
| classify | lossy derivation required | staged as candidate with a `derivation` block |
| stage | id+version already present, different content | rejected as a conflict; never overwritten |
| stage | id+version already present, identical content | no-op, reported as `unchanged` |

Ingestion is idempotent and non-destructive, and it is a **dry-run by default**.

### 4.4 Retrieval eligibility

Retrieval answers one question per asset: *may this specific version be offered for this specific Run?* Each predicate has its own reason code so that a zero result is explainable.

| Kind | Predicates, in order | Reason codes on failure |
|---|---|---|
| Persona | scope reachable → adopted → applicability matches → (no capability requirement) | `scope_unreachable`, `not_adopted`, `inapplicable` |
| Skill | scope reachable → adopted → applicability matches → required capabilities available → no conflict with an already-selected skill | `scope_unreachable`, `not_adopted`, `inapplicable`, `capability_missing`, `conflict` |
| Knowledge | scope reachable → adopted → applicability matches (`subjectKind` included) | `scope_unreachable`, `not_adopted`, `inapplicable` |
| Experience | scope reachable → lineage valid → `reusability != not_reusable` → retrieval key present → similarity ≥ policy floor | `scope_unreachable`, `dangling_reference`, `not_reusable`, `retrieval_key_absent`, `below_floor` |

Note what is **not** in this list: `approved`. Eligibility is not approval. A candidate asset may be included in an experimental run through the policy engine — exactly the design already encoded in `DefaultContextPackBuilder.build`, which chooses `context_pack.include_candidate` versus `context_pack.select_asset` by provenance kind (`context-pack-builder.ts` L225–227). The plan keeps that behaviour and only makes it visible.

### 4.5 Matching and ranking

**The defect being replaced.** `q.includes(trigger)` (skill triggers) and `prompt.includes(kw)` (domain keywords) are substring tests over free text. They produce false positives on any word that contains the trigger (`constrAInts` → `ai`), and false negatives whenever the trigger appears with different word boundaries.

**Replacement, in three layers:**

1. **Normalisation.** Lowercase; split on non-alphanumeric runs; drop a small declared stopword list; keep an n-gram index for declared multi-word phrases. Deterministic and locale-independent.
2. **Match.** A declared trigger matches if it equals a token, or if it is a declared phrase and appears as a contiguous token sequence. Substring matching is removed, not tuned.
3. **Score.** `score = Σ (weight_t × idf_t) × 1[matched]`, where `weight_t` comes from the asset's own declaration and `idf_t` is computed over the candidate set for this query. Short tokens get no special case in the matcher; instead a *domain* rule may require co-occurrence (§7.1), because the problem with `ai` is not its length but its ambiguity.

**Ranking.** Sort by score descending, then by asset id ascending, then by version descending. The tie-break is specified so that results are reproducible across runs and machines. The full rule is published as `ranking_policy_version` in the pack, so a change to ranking is visible in the artifact rather than inferred from changed output.

**Experiences.** `score = w_sim·sim + w_outcome·outcome_prior + w_recency·decay(age)`, with declared weights and a declared floor. A record whose retrieval key is absent is excluded with `retrieval_key_absent` **before** scoring — it does not enter the ranking at 0.0.

### 4.6 Provenance

Every asset and every candidate carries:

```ts
interface AssetProvenance {
  readonly kind: "observed" | "imported" | "proposed" | "reviewed" | "approved" | "deprecated";
  readonly sourcePath?: string;        // where it was read from, as a recorded fact
  readonly sourceKind: "repository" | "install" | "runtime" | "generated" | "external";
  readonly contentHash: string;        // sha256 of the canonical serialisation
  readonly ingestedAt: string;
  readonly ingestedBy: string;         // "installer" | "cli" | "runtime" | a user id
  readonly transformation?: DerivationRecord;  // present iff the source was lossy
}
```

`provenance.kind` continues to mean *current trust*, never *origin* — the existing invariant, restated because it is the one most easily broken by an ingestion feature.

### 4.7 Failure and empty-result semantics

| Situation | Reported as | Retrieval returns | User-visible meaning |
|---|---|---|---|
| Feature off in config | component `disabled` | — | Nothing was attempted |
| Feature on, nothing configured | component `not_configured` | — | There is nothing to look in |
| Configured, directory absent | `store_missing` | `[]` + state | Installation is incomplete |
| Directory present, unreadable | `store_unreadable` + error | `[]` + state | Permissions or corruption |
| Directory present, empty | `empty_store` | `[]` + state | Healthy, nothing installed |
| Records present, all invalid | `schema_invalid` + count | `[]` + state | Data needs repair |
| Records valid, none match | `no_match` | `[]` + state | Correct result |
| Records valid, all filtered | `filtered_<predicate>` + per-record reason | `[]` + exclusions | Explainable result |
| Unexpected exception | `failed` + error class + message | `[]` + state | A defect, not a normal outcome |

The rule that matters: **`[]` is the value, never the explanation.** The explanation travels with it in a sibling field, so a caller can never again be told "no experiences" when the truth is "the store could not be read".

---

## 5. Context Assembly Evidence

### 5.1 Two state machines, not one

The audit's nine requested states are two different questions that were previously conflated.

**Component level** — did the runtime *do* the step?

```
declared → configured → invoked → completed | failed | skipped
```

**Asset level** — did a particular asset make it into the pack?

```
retrieved → selected → included | excluded(reasonKind)
```

A component can be `completed` and contribute no assets, and an asset can be `retrieved` and not `selected`. Both facts must be visible, and neither implies the other.

### 5.2 The record

```ts
type ComponentState = "declared" | "configured" | "invoked" | "completed" | "failed" | "skipped";

interface ComponentExecution {
  readonly component: ComponentName;          // "persona_baseline", "unified_skills", ...
  readonly state: ComponentState;
  readonly configured: boolean;               // a config key exists and was read
  readonly invokedAt?: string;
  readonly durationMs?: number;
  readonly counts: {
    readonly considered: number;
    readonly retrieved: number;
    readonly selected: number;
    readonly included: number;
    readonly excluded: readonly { readonly reasonKind: ExclusionReasonKind; readonly reasonCode: string; readonly count: number }[];
  };
  readonly error?: {
    readonly phase: "config" | "discovery" | "parse" | "validate" | "match" | "select" | "build";
    readonly errorClass: string;              // no message text, no stack bodies
    readonly errorCode?: string;
  };
  readonly skipReason?: "disabled" | "not_configured" | "capability" | "policy" | "dependency_failed";
}
```

### 5.3 Why a source was or was not included

The pack must answer, for each channel and each asset, one of exactly these questions:

- *It was included* → `selectionReason` (a sentence) plus `policyDecisionRef`.
- *It was retrieved and excluded* → `reasonKind` ∈ `{lifecycle, applicability, capability, policy, scope, budget, integrity}` plus a `reasonCode`.
- *It was never retrieved* → the component's `state` and `skipReason` explain it.
- *It failed* → the component's `error` explains it.

**Accounting invariant.** For every component, `considered = Σ excluded + included`, and `included = assets.length for that kind`. A pack whose accounting does not balance is not deliverable. If a stage cannot produce accurate counts, it must say so with `accountingIncomplete: true` and name the stage — it must not emit counts that merely look plausible. This is the mechanism that would have caught F-01 on the day it was written.

### 5.4 Sensitive content

Assembly evidence is **metadata only**: ids, versions, counts, reason codes, byte sizes, hashes, durations. Never the prompt, never a diff, never a knowledge body, never an experience summary.

This is not a new policy — it is the policy already applied to the access log (`nemos/src/daemon/routes/mcp.js` L166–180: "Metadata only. Bodies are never written: prompts, diffs and evidence can carry secrets"). Reusing the existing rule means one rule to audit rather than two.

Two specific consequences worth stating, because they will be tempting to violate:

- A `reasonCode` is an enum member, not a message. It cannot leak a filename, a branch name, or a token from a diff.
- A similarity score may be published; the matched tokens may not. The score explains the decision without quoting the content that produced it.

Diagnostics that need content (to debug a ranking problem) must be a separate, explicitly requested export with its own redaction, not a field in the pack.

### 5.5 Replacing `components_used`

`components_used` becomes a **derived projection** of the evidence:

```
components_used := [c.component for c in components if c.state == "completed"]
```

The field keeps its name and type, so existing consumers keep working, but it can no longer claim a component that did not complete. The static literal disappears with no client visible break, and the new evidence structure is additive.

---

## 6. Dynamic Context Pack Lifecycle

### 6.1 Two families, one contract

| | Curated | Dynamic |
|---|---|---|
| Origin | Authored YAML under `context-packs/` | Built per `analyze_prompt` call |
| Identity | File slug (`stripe-webhook-handler`) | `dynamic-<base36-ms>-<8 hex>` |
| Content | Stable until the file changes | Unique per call |
| Persistence | Already on disk | **Must be persisted** (this is F-06) |
| Mutability | Immutable per version | Immutable once written |
| Scope | `runtime-global` or `project` | Always the Run's project |

Both are described by one envelope, so a caller does not need to branch on family:

```ts
interface ContextPackEnvelope {
  readonly pack_id: string;
  readonly pack_kind: "curated" | "dynamic";
  readonly resolution: "retrieved" | "synthetic";
  readonly project_id: string | null;
  readonly run_id: string | null;
  readonly created_at: string;
  readonly expires_at?: string;
  readonly content_hash: string;
  readonly integrity: "verified" | "unverified" | "corrupt";
  readonly content: ContextPackContent;
}
```

### 6.2 Identity

`dynamic-<base36(ms)>-<8 hex>`, minted from the Run (never from the prompt, which would leak content into a retrievable key), and checked against the store before the write. Monotonic ordering is preserved as a debugging aid; uniqueness comes from the random suffix, which is what `cbr.retain` already does correctly.

### 6.3 Persistence and retention

- A dynamic pack is written once, atomically, to `<scope>/context-packs/dynamic/<pack_id>.json`, before the `analyze_prompt` response is returned. If the write fails, the response reports `pack_persistence: "failed"` and does not return a `suggested_pack_id` that cannot resolve. Returning an id is a promise that it is retrievable.
- Inline delivery is unchanged: the full pack remains in the `analyze_prompt` response, because a host that never calls `get_context_pack` must still receive its context.
- Retention: dynamic packs are retained for 30 days or 500 packs per scope, whichever is reached first; eviction is oldest-first, recorded in a retention log, and never evicts a pack referenced by a Run that is still open. Curated packs are never auto-expired.
- Immutable snapshots: the pack records the asset ids *and versions* it was built from. A later adoption of a different version does not retroactively change what a past Run saw. This is the whole reason to persist at all.

### 6.4 Retrieval semantics

| Request | Condition | HTTP | Tool result |
|---|---|---|---|
| `get_context_pack(id)` | id valid, pack exists, hash verified | 200 | success, `resolution: "retrieved"` |
| `get_context_pack(id)` | id valid, pack exists, hash mismatch | 200 | **error** `pack_corrupt`, quarantine recorded |
| `get_context_pack(id)` | id valid, pack absent, no `allow_synthetic` | 404 | **error** `pack_not_found` |
| `get_context_pack(id)` | id valid, pack absent, `allow_synthetic: true` | 200 | success, `resolution: "synthetic"`, `is_synthetic: true` |
| `get_context_pack(id)` | id malformed | 400 | error `invalid_id` |
| `get_context_pack(id)` | store unreadable | 503 | error `store_unavailable` |

The 404 row is the one requiring a decision (D-05), because `defect-regression-tests.js` L135–141 currently asserts 200-for-unknown. The recommended resolution preserves the HTTP contract and moves the honesty into the tool layer:

- HTTP `GET /context-pack/:id` keeps its current 200 + `is_synthetic` body, so the existing regression test and any HTTP consumer continue to work unchanged.
- The MCP adapter inspects `is_synthetic` and, in the absence of the caller's explicit `allow_synthetic: true`, returns a tool *error*. The host therefore never receives synthetic content shaped as a successful answer, while nothing on the HTTP side breaks.

This is the only place in the plan where one behaviour is deliberately expressed differently at two boundaries, and it is stated explicitly so a reviewer can reject it.

### 6.5 Synthetic content

Synthetic packs are permitted only when the caller asks for one. When they exist they carry `is_synthetic: true`, `source: "synthetic_fallback"`, `resolution: "synthetic"`, and a `note` naming the missing id. A synthetic pack is never cached, never referenced by a Run, and never counted as a pack in `health_check` totals.

The requirement in one sentence: **a successful retrieval may return a synthetic pack only if the caller opted into one, and then the result must say so in a field a machine can read without parsing prose.**

### 6.6 Expiration

`expires_at` is optional and advisory. An expired pack is still returned, with `expired: true`, because deleting the context that a past Run used would break lineage; the flag lets a consumer decide. Automatic deletion applies only to dynamic packs nobody referenced, per §6.3.

---

## 7. Classification and Routing

Nothing in this section changes what a harness *requires*. It changes which harness is chosen and on what evidence. That boundary is deliberate: `must_pass` is the verification contract, and redefining it would silently retro-validate or invalidate every past Evaluation.

### 7.1 Domain detection

**Current mechanism** (`persona-evolver.js` L175–193): iterate a keyword map in declaration order, return the first domain whose keyword is a substring of the prompt. Two defects compound — declaration order decides ambiguous cases, and substring matching decides whether a keyword is present at all. Reproduced: `machine-learning` assigned because `constrAInts` contains `ai`.

**Replacement.**

1. Tokenise the prompt (§4.5 layer 1).
2. Score every domain as `Σ weight(token)` over its declared keyword set, matching tokens and declared phrases only.
3. Apply a **disambiguation rule** for short or ambiguous tokens: a token of two characters (`ai`, `ml`, `ui`, `db`, `go`) counts only when it appears as a whole token *and* co-occurs with a domain-identifying companion (`model`, `train`, `tensor` for machine-learning; `interface`, `component`, `render` for frontend). Alone, it scores zero.
4. Require `score ≥ threshold` and `top1 − top2 ≥ margin`; otherwise `general`.

Rewriting the same prompt under this rule yields `general` — the correct answer, since the prompt's only domain-adjacent token was accidental. Both the scoring and the threshold are published so the decision is inspectable, and the decision is recorded on the Run as `domain: {name, score, matched: [...]}` — matched *tokens*, which are the prompt's own words and therefore must not be written into the pack (§5.4); the pack records the domain name and score only.

### 7.2 Skill trigger matching

**Current mechanism** (`unified-skills.js` L112–143): `q.includes(trigger)` (L122–123), then `filter(s => s._score > 0)` (L130).

Three problems, in decreasing severity:

1. Substring matching — `"test"` matches `"latest"`, `"testing"`, `"greatest"`.
2. Unbounded fan-out — every substring hit contributes `0.5` regardless of how incidental it is, so a generic prompt matches many skills weakly and the domain bonus (`0.2`) can outrank a genuine trigger.
3. Silent zero-drop (L130) — the distinction between "scored 0" and "filtered out" is destroyed.

**Replacement.** Token-boundary matching per §4.5; per-trigger weights; a `minScore` policy constant replacing the implicit `> 0`; and the score of every considered skill retained in the component evidence, so a near-miss is visible rather than absent.

### 7.3 Task classification

A single deterministic classifier produces the Run's `taskKind`, `taskTags` and the evidence for its decision.

```
classify(prompt, targets) → { taskKind, taskTags[], confidence, evidence[] }
```

Rules are an ordered list; the first rule whose *premises* all hold wins, and every rule that was evaluated is recorded (matched or not) so a classification can be explained.

| Order | Rule | taskKind |
|---|---|---|
| 1 | Explicit `taskKind` supplied by the caller | as supplied, `confidence: "explicit"` |
| 2 | Documentation-only targets (`*.md`, `docs/**`, `README*`) **and** a documentation verb (`document`, `documentation`, `README`, `changelog`, `guide`) | `documentation` |
| 3 | Test targets (`*.test.*`, `*_test.*`, `tests/**`, `spec/**`) **and** a fix verb (`fix`, `repair`, `make ... pass`) | `test-fix` |
| 4 | Review verb (`review`, `audit`, `critique`) with no mutation verb | `review` |
| 5 | Investigation verb (`investigate`, `trace`, `why`, `diagnose`) with no mutation verb | `investigation` |
| 6 | Refactor verb (`refactor`, `rename`, `extract`, `move`, `simplify`) with no behaviour verb | `refactor` |
| 7 | Implementation verb (`implement`, `add`, `create`, `build`) | `feature` |
| 8 | Otherwise | `other` |

Rules 2–3 are ordered before 7 specifically because rule 7's verbs are the most general and would otherwise absorb every documentation and test-fix task — which is exactly the observed defect (`Implement a small documentation-only change` → `feature`).

Note rule 2 requires **both** a documentation target and a documentation verb. "Documentation" appearing in prose without a documentation target is not enough, and a `docs/` path with an implementation verb is a feature change to docs code.

### 7.4 Documentation routing

A new `harness-documentation.js` profile, structured exactly like the existing profiles so that `route()` needs no new concept:

| Field | Value |
|---|---|
| `task_type` | `documentation` |
| `must_pass` | `no_secrets_in_diff`, `documentation_file_changed` |
| `should_pass` | `documentation_added`, `links_resolve`, `examples_valid` |
| `matches` | `taskKind === "documentation"` — **not** a regex over prose |

Three properties are required of this profile and are the acceptance criteria for it:

1. **Every `must_pass` entry has an implemented checker.** The current feature profile's `feature_implements_spec` is a criterion whose grading is not implemented as a deterministic check; adding another unimplementable criterion would deepen the honesty problem this plan exists to fix. If a checker does not exist, the criterion goes in `should_pass`.
2. **Selection is by classified kind, not by prose regex**, so the profile cannot be reached by an unrelated prompt.
3. **No existing profile's criteria change by one byte.** Proven by a snapshot test (§13, T-R2).

### 7.5 Harness selection order

**Current** (`harness-router.js` L108–165): iterate profiles, first `matches()` wins (L113–119).

**Proposed:** filter by `taskKind` compatibility, then `matches()`, then first in declared order. If nothing matches, the current generic behaviour is retained but the pack records `harness_match: "fallback"` so the fallback is visible. A permissive default harness is **not** introduced (see D-07): a default with weak `must_pass` would weaken verification for every unclassified task, which is precisely the governance failure the constraints forbid.

### 7.6 Compatibility with the existing verification architecture

The plan asserts, and the test matrix proves:

| Assertion | How it is proven |
|---|---|
| Existing harnesses' `must_pass` unchanged | Snapshot of every profile's criteria before and after; byte comparison |
| Existing harnesses' `should_pass` unchanged | Same snapshot |
| `route()` output unchanged for every non-documentation kind | Table-driven test over a corpus of prompts, comparing old and new selection |
| Config-supplied criteria still appended additively | `core-loop.js` L110–115 path exercised with a config that adds one criterion |
| `must_pass` still means "fails the run" | Evaluation test with a failing `must_pass` criterion |
| `should_pass` still means "recorded, not fatal" | Evaluation test with a failing `should_pass` criterion |

The last two matter because the plan adds a harness with a *different* criteria set. If `must_pass` semantics were also being changed, no such test could distinguish the two changes.

---

## 8. Prioritized Implementation Plan

Each phase lists affected files, contract changes, data migration, backward-compatibility requirement, regression tests, acceptance criteria, and risk with rollback. Phases are ordered so that no phase depends on a later one.

### Phase A — MVP-critical correctness and integrity

#### A1 — Project identity registry and binding (F-05)

- **Files.** `nemos/src/utils/project-registry.js` (new), `nemos/src/utils/runtime-config.js`, `nemos/src/daemon/server.js`, `nemos/src/daemon/routes/mcp.js`, `nemos-core/src/core/identifiers.ts` (reuse, no change), `nemos-core/src/schemas/project.ts` (new, promoted from `p2-features.ts`).
- **Contract changes.** Additive: `ProjectRecord`, `ProjectBinding`, `Scope`. No existing schema member changes.
- **Migration.** Create `projects/index.json` and `_unbound/` on first start. No existing file moves.
- **Backward compatibility.** All seven tools remain callable without `project_id`; the Run is written to `_unbound` with `binding: "unbound"`.
- **Regression tests.** Path move; two clones; fork; two projects in one home; unbound run; explicit unknown id → error.
- **Acceptance.** A record written under project A is not retrievable under project B; `health_check` reports `unbound_records`; no existing test changes its expectations.
- **Risk.** A wrong binding silently scopes assets. **Rollback.** The registry is a new directory; deleting it restores the current global behaviour, and no record left the flat layout.

#### A2 — Run records and `run_id` enforcement (F-04)

- **Files.** `nemos/src/daemon/core-loop.js`, `nemos/src/daemon/routes/mcp.js`, `nemos/src/store/run-store.js` (new), `nemos-core/src/schemas/run.ts` (reuse).
- **Contract changes.** `analyze_prompt` returns a `run_id`. `collect_evidence` requires a `run_id` that resolves; `evaluate_run` uses the `run_id` it already requires; `store_experience` validates instead of spreading.
- **Migration.** Synthesise `status: "unknown"` Runs from `evidence/<run_id>.json` filenames, marked `inferred`.
- **Backward compatibility.** `analyze_prompt`'s response only gains fields. `evaluate_run`'s existing callers already pass `run_id`, so nothing breaks — they were passing it into a void.
- **Regression tests.** Four-step continuity; evidence for an unknown run → 400; experience without `run_id` → 400 with a field-level error.
- **Acceptance.** Every evidence record resolves to a run; every run resolves to a project or `_unbound`; no record is written when validation fails.
- **Risk.** Enforcing previously-ignored required fields could reject a host that omitted them. **Mitigation.** `run_id` is already required by the MCP schema, so no conforming caller is affected; the enforcement is a defect fix, not a tightening.

#### A3 — Lineage gates on Experience retention (F-03)

- **Files.** `nemos/src/utils/cbr.js`, `nemos/src/daemon/core-loop.js`, `nemos-core/src/experience/experience-retriever.ts` (pattern reuse).
- **Contract changes.** Retention requires the seven conditions in §3.4. `retrievalKey` becomes a stored field. `sim()` returning 0 for an empty side becomes an explicit `retrieval_key_absent` exclusion before scoring.
- **Migration.** Legacy experiences keep their content; those with empty prompts are marked `not_reusable` with `retrieval_key_absent`. Nothing is deleted or rewritten.
- **Backward compatibility.** `retrieve_similar_experiences` keeps its response shape; results gain a `excluded: [{id, reasonCode}]` companion array.
- **Regression tests.** Retain an empty-prompt experience → refused; retrieve over legacy store → per-record `retrieval_key_absent`; retrieve a matched experience → returned with a key.
- **Acceptance.** Retrieval over the audited home returns either matches or records, never a bare `[]`.
- **Risk.** Blocking retention could reduce the stored corpus. **Decision needed:** D-08, because strict enforcement rejects all 8 existing records for reuse.

#### A4 — Component execution evidence (F-01, F-02, F-11)

- **Files.** `nemos/src/utils/pipeline-integrator.js`, `nemos/src/daemon/core-loop.js`, `nemos/src/utils/{unified-skills,knowledge-store,cbr,persona-evolver}.js`, `nemos/src/utils/runtime-config.js`.
- **Contract changes.** Additive `components: ComponentExecution[]` and `assembly: {accountingIncomplete?, rankingPolicyVersion}` to the pack. `components_used` becomes derived. Config load returns `{state: "loaded"|"absent"|"invalid", config}`.
- **Migration.** None.
- **Backward compatibility.** `components_used` keeps its name and type. Every removed `catch` is replaced by a state, never by a throw into the tool result.
- **Regression tests.** One per state in §4.7; accounting invariant per component; a config key that has no consumer fails a test.
- **Acceptance.** No component reports `completed` with an unexplained zero; every `[]` carries a state; the accounting invariant holds for a pack with all channels empty and for one with all populated.
- **Risk.** The accounting invariant could fail on a real store and block delivery. **Mitigation.** Failing accounting yields `accountingIncomplete: true` with the offending stage named — degraded honesty, not a hard outage.

#### A5 — Dynamic pack persistence, identity, retrieval (F-06, F-07)

- **Files.** `nemos/src/utils/pipeline-integrator.js`, `nemos/src/daemon/core-loop.js`, `nemos/src/daemon/routes/mcp.js`, `nemos/src/utils/pack-store.js` (new).
- **Contract changes.** `ContextPackEnvelope`; `suggested_pack_id` becomes a promise that the id resolves; `get_context_pack` gains `allow_synthetic`; retrieval returns `resolution` and `integrity`.
- **Migration.** Existing curated YAML is read as `pack_kind: "curated"` with `selection_policy_version` absent → `"unversioned"` (not invented).
- **Backward compatibility.** Inline pack delivery unchanged; HTTP `GET /context-pack/:id` unchanged including 200-for-unknown (D-05).
- **Regression tests.** Round-trip `analyze_prompt` → `get_context_pack`; two packs in one millisecond have distinct ids; unknown id without opt-in → tool error; corrupt pack → error; store unavailable → 503.
- **Acceptance.** Every returned `suggested_pack_id` resolves; no synthetic content reaches a caller that did not ask for it; a persisted pack is byte-identical to the inline one.
- **Risk.** Extra writes on the hot path. **Mitigation.** Atomic write before responding, with a measured budget; on write failure the response says `pack_persistence: "failed"` and withholds the id rather than lying.

#### A6 — Classification: domain, triggers, task kind, documentation harness (F-10)

- **Files.** `nemos/src/utils/persona-evolver.js`, `nemos/src/utils/unified-skills.js`, `nemos/src/utils/harness-router.js`, `nemos/src/utils/harness-documentation.js` (new), `nemos-core/src/schemas/run.ts` (D-06).
- **Contract changes.** `RunTaskKind` gains `documentation`; the pack records `classification: {taskKind, confidence, rules[]}`.
- **Migration.** None.
- **Backward compatibility.** Existing harness criteria byte-identical; routing unchanged for non-documentation kinds.
- **Regression tests.** `constrAInts` → general; `maintain`/`email` → general; the audited docs prompt → documentation harness; every existing kind routes as before; criteria snapshot.
- **Acceptance.** No prompt acquires a domain without a whole-token match; the audited docs prompt selects the documentation harness; the snapshot test passes.
- **Risk.** Adding an enum member touches a core schema. **Mitigation.** The member is additive; TypeScript exhaustive switches are located and updated in the same change; the core's own tests are run unchanged.

#### A7 — Scope-aware storage layout (F-12)

- **Files.** `nemos/src/daemon/server.js`, the four store modules, `nemos/src/utils/project-registry.js`.
- **Contract changes.** Every record gains `scope` and `project_id`.
- **Migration.** New directories created alongside the old; a compatibility reader serves the flat layout; no move until A1–A6 are observed stable.
- **Backward compatibility.** The flat paths remain readable indefinitely.
- **Regression tests.** Isolation between projects; global reachable from both; unbound isolation.
- **Acceptance.** No cross-project retrieval in either direction; the compatibility reader is exercised by a test with a pre-migration fixture home.
- **Risk.** Directory resolution at module load (the current pattern in all four stores) makes scope changes mid-process impossible. **Mitigation.** Resolution becomes a function call; this is a prerequisite refactor inside A7, not a separate phase.

### Phase B — Follows the MVP

| ID | Change | Why it can wait |
|---|---|---|
| B1 | `nemons assets ingest \| validate \| adopt` with dry-run, manifest and derivation report (F-08) | A1–A7 make scope and lineage real first; ingesting into an unscoped store would create records to migrate later |
| B2 | A governed promotion tool on the MCP surface (F-09) | Requires A2/A3 so a candidate can cite its evidence |
| B3 | Ranking policy versioning with idf weighting and published thresholds | A6 delivers boundary matching; weighting is a quality step |
| B4 | Lineage health check with repair modes (`--report`, never `--fix` silently) | Needs a populated lineage to be meaningful |
| B5 | Per-project metrics and per-component latency in `/metrics` | Observability over behaviour that must exist first |

### Phase C — Optional research

| ID | Experiment | Why it stays optional |
|---|---|---|
| C1 | Learned ranking for asset retrieval | No ground truth until B3 has produced comparable runs |
| C2 | Pack retention driven by measured reuse | Requires a corpus of retrievals |
| C3 | Cross-project experience transfer with explicit consent | Governance-sensitive; needs D-03 settled and a consent model |
| C4 | Harness auto-selection from outcome history | Risk of feedback loops in verification |

### 8.1 Phase ordering and gates

```
A1 → A2 → A3 → A5
      │     └→ A4 (can run parallel with A3)
      └→ A7 (needs A1; benefits from A2)
A6 is independent of A1–A5 and A7 and may land first if the smallest change is preferred.
```

Gates: A1 must be reviewed before A2 writes a single Run. A2 before A3, because the retention gate validates against a real Run. A5 after A3, because pack exclusions report lineage outcomes.

---

## 9. Required Architectural Decisions

Each decision must be approved before the phase that depends on it. "Consequences of postponing" states the concrete cost, not a general warning.

### D-01 — Is `nemos-core` the runtime contract, or a library?

- **Recommended.** Make `nemos-core` the contract for the objects the host can observe (Run, Evidence, Evaluation, Experience, ContextPack, Project), and keep `pipeline-integrator.js` as a *composition* layer that calls core schemas and utilities rather than re-deriving them. Concretely: the daemon constructs core-typed objects; the JS bridge validates them; the pack is a `ContextPack` plus additive evidence fields.
- **Alternative.** Keep the two implementations parallel and align them field by field.
- **Trade-offs.** Recommended: one contract, 70 existing tests become load-bearing on the product path, some daemon code must be deleted (which is a cost — deleted code has to be re-proven through the new path). Parallel: no refactor risk, but every future change must be made twice and every divergence is a latent defect of exactly the kind §1.1 describes.
- **If postponed.** Phase A still proceeds — its acceptance criteria are behavioural, not structural — but A-schema work will be written against the daemon's ad-hoc shapes and B1–B5 will each pay a translation cost. The decision becomes more expensive after A2 writes Run records in a daemon-specific shape.

### D-02 — Project binding anchor

- **Recommended.** The ladder in §2.3, with the committed `.nemons/project.json` as the primary interactive anchor.
- **Alternative.** Remote-URL-only binding.
- **Trade-offs.** The manifest works offline, in fresh clones and in CI, and is reviewable; it requires a file in the repository, which some users will not want. Remote-only binding is invisible but fails for repositories with no remote, for local prototypes, and across a fork/upstream rename.
- **If postponed.** A1 cannot start; project identity degrades to "whichever directory the daemon was launched from", which is the failure mode the user explicitly forbade.

### D-03 — What scope do unbound records get?

- **Recommended.** A dedicated `_unbound` bucket with `confidence: "unknown"`, isolated from all projects.
- **Alternative A.** Treat them as `runtime-global`. **Alternative B.** Refuse to read them until bound.
- **Trade-offs.** A makes every legacy record a shared fact, which is a silent claim about origin. B is honest but makes the upgrade a data loss for the user. The bucket preserves the data, keeps the claim honest, and makes the obligation countable via `health_check`.
- **If postponed.** Every migration in §12 has undefined semantics, and A7 cannot be accepted because isolation cannot be asserted.

### D-04 — Are dynamic packs persisted by default?

- **Recommended.** Yes, before responding, with a 30-day / 500-pack budget.
- **Alternative.** Opt-in per call (`persist: true`).
- **Trade-offs.** Default-on is what makes `suggested_pack_id` a truthful promise and makes Run→Pack lineage possible. It costs disk and adds a write on the hot path. Opt-in preserves current latency exactly but leaves the default path returning an id that cannot resolve — the defect this plan exists to fix.
- **If postponed.** A5 cannot be accepted; `get_context_pack` remains unable to serve anything dynamic, and the "verifiable continuity" mission item fails.

### D-05 — Unknown pack id: HTTP 404, or 200-plus-synthetic?

- **Recommended.** Preserve HTTP 200 + `is_synthetic` (so the existing regression test and any HTTP consumer are untouched), and make the **MCP tool** return an error unless the caller passes `allow_synthetic: true`.
- **Alternative.** Change HTTP to 404 for unknown ids.
- **Trade-offs.** Recommended keeps one contract stable and puts the honesty where the harm occurs (a host mistaking synthetic content for context), at the cost of one behaviour that differs by boundary. The alternative is simpler to reason about but breaks `defect-regression-tests.js` L135–141 and any external HTTP consumer, for no gain at the host boundary.
- **If postponed.** F-07 stays open; a caller can receive fabricated persona and knowledge with a success status.

### D-06 — Add `documentation` to `RunTaskKind`

- **Recommended.** Yes, additive.
- **Alternative.** Keep six kinds and encode documentation as `taskTags: ["documentation"]` on `other`.
- **Trade-offs.** A first-class kind makes applicability filtering, harness routing and experience applicability all work without special cases, and `ExperienceApplicability.taskKinds` can finally express "this lesson applies to documentation work". Tags would require every consumer to know the convention, and a tag is easy to omit.
- **If postponed.** Documentation tasks remain graded by the feature rubric; A6 cannot be completed as specified.

### D-07 — Fallback harness when nothing matches

- **Recommended.** Keep the current generic behaviour, but record `harness_match: "fallback"` in the pack so it is visible.
- **Alternative.** A minimal `default` harness with `must_pass: ["no_secrets_in_diff"]`.
- **Trade-offs.** A permissive default is a *weakening* of verification for every unclassified task — a governance change, not a routing one. Instrumenting the fallback first produces the data needed to justify a default later, if it is ever justified.
- **If postponed.** A6 can ship with the fallback merely instrumented; nothing blocks.

### D-08 — Must an Experience have a passing Evaluation to be retained?

- **Recommended.** Retention requires an Evaluation, but a *failing* Evaluation is acceptable for `not_reusable` — a recorded failure is a legitimate lesson. `reusable` requires `verified_succeeded`, which is already the core's documented invariant.
- **Alternative.** Require `verified_succeeded` for any retention.
- **Trade-offs.** Recommended preserves negative experience, which is half the value of an experience store. The alternative is simpler and would have refused all 8 legacy records outright.
- **If postponed.** A3's retention gate is unspecified and the legacy corpus is in an undefined state.

### D-09 — Storage layout: per-project directories, or one flat store with a `project_id` field?

- **Recommended.** Per-project directories under a registry, with `project_id` also on every record (belt and braces: the directory is the enforcement, the field is the audit).
- **Alternative.** Keep flat directories and filter by `project_id` at read time.
- **Trade-offs.** Directories make cross-project leakage structurally impossible rather than a filter that a future refactor can drop; the cost is more complex path resolution and a migration for existing data. A flat store is a smaller change but makes isolation a property of every query rather than of the layout.
- **If postponed.** A7 cannot deliver an isolation guarantee that survives code change, only one that survives today's queries.

---

## 10. Updated Dependency Map

### 10.1 Current state (as measured)

```
MCP host
  │  POST /mcp  (7 tools)
  ▼
routes/mcp.js ──────────────► core-loop.js ──────► pipeline-integrator.js
   │                              │                    ├─► persona-evolver.js   ─► personas-evolved/
   │                              │                    ├─► unified-skills.js    ─► skills-unified/
   │                              │                    ├─► knowledge-store.js   ─► knowledge-adopted/
   │                              │                    ├─► cbr.js               ─► experiences/
   │                              │                    ├─► harness-router.js    ─► harness-*.js
   │                              │                    └─► (builds pack inline, persists nothing)
   │                              ├─► verifier.js
   │                              ├─► routes → evidence/<run_id>.json   (run id as filename only)
   │                              └─► storeExperience → experiences/<id>.json   (unvalidated)
   │
   └─► nemos-bridge.js ──(dynamic import)──► nemos-core/dist
                                              └─ only validateContextPack is used on this path

runtime-config.js ─► NEMONS_HOME (single, global)  ◄── every store resolves at module load
```

Absent from the graph, despite being specified: `Project`, `Run`, `Evaluation` as records, `ContextResolver`, `ContextPackBuilder`, `PersistentStore`, `PolicyEngine`, `buildLineage`.

### 10.2 Target state

```
MCP host
  │
  ▼
routes/mcp.js ──► core-loop.js ──┬─► project-registry.js    ─► projects/index.json
   │                             ├─► run-store.js           ─► <scope>/runs/
   │                             ├─► classifier.js           (taskKind, domain, triggers)
   │                             ├─► pipeline-integrator.js  (composition only)
   │                             │      ├─► core: DefaultContextResolver   → ResolvedAssetCandidate[]
   │                             │      ├─► core: DefaultContextPackBuilder → ContextPack + exclusions
   │                             │      └─► assembly.js (new)  → ComponentExecution[]
   │                             ├─► pack-store.js           ─► <scope>/context-packs/dynamic/
   │                             ├─► evidence-store.js       ─► <scope>/evidence/
   │                             ├─► evaluate → evaluation.js ─► <scope>/evaluations/
   │                             └─► experience-store.js     ─► <scope>/experiences/   (gated)
   │
   └─► nemos-bridge.js ──► nemos-core/dist
                            ├─ schemas/*    (contract, validated at every write)
                            ├─ context/*    (resolution + pack construction)
                            ├─ persistence/* (hash-verified stores)
                            └─ p2-features  (Project, buildLineage)
```

### 10.3 Edge-by-edge change table

| Edge | Today | Proposed | Phase |
|---|---|---|---|
| `mcp.js → core-loop` | 7 tools, 6 thin | unchanged surface; `run_id` added to `analyze_prompt` result; `allow_synthetic` added to `get_context_pack` | A2, A5 |
| `core-loop → pipeline-integrator` | opaque, returns a literal component list | returns `{pack, components, accounting}` | A4 |
| `core-loop → bridge` | one call (`validateContextPack`) | schema validation on every write; resolver and builder on the read path | A2, A4, A5 |
| `pipeline-integrator → stores` | 4 modules, module-load paths, `catch → []` | scope-resolved paths, state reporting, no catch-and-empty | A4, A7 |
| `stores → disk` | flat, global | `<scope>/…` with a compatibility reader for the flat layout | A7 |
| `evidence → run` | filename only | `evidence.run_id` field + existence check | A2 |
| `experience → run/evaluation/evidence` | none | required FKs, validated at retention | A3 |
| `pack → run` | none | `ContextPackEnvelope.run_id`, persisted | A5 |
| `any record → project` | none | `project_id` + `scope` on every record | A1, A7 |
| `harness-router → harnesses` | prose regex, first match | classified `taskKind`, then `matches()` | A6 |

### 10.4 Modules with no inbound edge after the change

`harness-feature.js`'s `cbr_retrieval_strategy` declaration (declared, unconsumed) and the static component list are the two dead declarations the plan removes. Every other declared key either gains a consumer or fails a test (A4's "config key with no consumer" test).

---

## 11. Proposed Data Contracts and TypeScript Interfaces

Proposed filenames follow the core's existing layout. These are **proposals**, not files: nothing below has been written to `nemos-core` in this task.

### 11.1 `nemos-core/src/schemas/project.ts` (new)

```ts
import type { RepositoryIdentity } from "../core/identifiers.js";

export type ProjectScope = "runtime-global" | "project" | "run";
export type BindingKind = "explicit" | "env" | "manifest" | "repo_identity" | "path_alias" | "unbound";

export interface ProjectIdentityRef {
  readonly repo: string;          // canonicalised remote or a declared local identity
  readonly sha?: string;          // last observed head, informational only
}

export interface ProjectRecord {
  readonly project_id: string;                 // minted once, never derived
  readonly display_name: string;
  readonly identities: readonly ProjectIdentityRef[];
  readonly aliases: readonly string[];         // historical realpaths, normalised
  readonly root_hint?: string;                 // a hint, explicitly not identity
  readonly fork_of?: string;                   // project_id of upstream
  readonly created_at: string;
  readonly last_seen_at: string;
  readonly scope_default: ProjectScope;
}

export interface ProjectBinding {
  readonly project_id: string | null;          // null iff kind === "unbound"
  readonly kind: BindingKind;
  readonly evidence: string;                   // the anchor that matched, not the content
  readonly resolved_at: string;
}

/** Scope for any persisted record. `null` project_id is legal only for "unbound". */
export interface ScopedRecord {
  readonly project_id: string | null;
  readonly scope: ProjectScope | "unbound";
}
```

### 11.2 `nemos-core/src/schemas/run-record.ts` (new; wraps the existing `Run`)

```ts
import type { RunState, RunTaskKind, RunInputs, RunOutputs } from "./run.js";
import type { RepositoryInstanceId } from "../core/identifiers.js";
import type { ProjectBinding } from "./project.js";

export interface ClassificationRecord {
  readonly taskKind: RunTaskKind;
  readonly confidence: "explicit" | "high" | "low";
  readonly rulesEvaluated: readonly { readonly rule: string; readonly matched: boolean }[];
  readonly domain?: { readonly name: string; readonly score: number };
}

export interface RunRecord {
  readonly run_id: string;
  readonly project_id: string | null;
  readonly binding: ProjectBinding;
  readonly repo_instance: RepositoryInstanceId;
  readonly inputs: RunInputs;
  readonly classification: ClassificationRecord;
  readonly state: RunState;
  readonly context_pack_id?: string;           // the pack this Run used
  readonly evaluation_ids?: readonly string[];
  readonly evidence_ids?: readonly string[];
  readonly outputs?: RunOutputs;               // claims only; never verification
  readonly created_at: string;
  readonly updated_at: string;
  readonly migration?: { readonly origin: string; readonly confidence: "inferred" | "verbatim" | "unknown" };
}
```

### 11.3 `nemos-core/src/schemas/evidence-record.ts` (new; complements the existing `Evidence`)

```ts
export interface EvidenceRecord {
  readonly evidence_id: string;
  readonly run_id: string;                    // REQUIRED — currently only a filename
  readonly project_id: string | null;
  readonly kind: string;                      // superset of the daemon's free-form evidence
  readonly payload: unknown;                  // redacted at write, verbatim thereafter
  readonly content_hash: string;
  readonly collected_at: string;
  readonly attributed_component?: { componentKind: string; componentId?: string; componentVersion?: string };
}
```

### 11.4 `nemos-core/src/schemas/evaluation-record.ts` (new)

```ts
export type EvaluationVerdict = "verified_succeeded" | "failed" | "inconclusive";

export interface EvaluationRecord {
  readonly evaluation_id: string;
  readonly run_id: string;
  readonly project_id: string | null;
  readonly verdict: EvaluationVerdict;
  readonly criteria: {
    readonly must_pass: readonly { readonly id: string; readonly passed: boolean }[];
    readonly should_pass: readonly { readonly id: string; readonly passed: boolean }[];
  };
  readonly evidence_refs: readonly string[];  // >= 1 for a non-inconclusive verdict
  readonly harness: { readonly id: string; readonly match: "classified" | "fallback" };
  readonly evaluated_at: string;
}
```

### 11.5 `nemos-core/src/schemas/experience.ts` — additions only

The existing interface is unchanged; four fields are added, all optional so existing records remain valid.

```ts
export interface Experience {
  readonly id: ExperienceId;
  readonly runId: RunId;
  readonly evaluationId: EvaluationId;
  readonly provenance: Provenance;
  readonly applicability: ExperienceApplicability;
  readonly reusability: ExperienceReusability;
  readonly reuseConditions?: readonly string[];
  readonly summary: string;
  readonly learnedAt: string;

  // --- proposed additions ---
  readonly projectId?: string | null;
  readonly evidenceRefs?: readonly EvidenceId[];   // >= 1 for a retained Experience
  readonly retrievalKey?: string;                  // normalised task signature
  readonly retrievalKeyState?: "present" | "absent";
  readonly integrity?: "ok" | "dangling_reference";
}
```

`retrievalKeyState` exists so a legacy record can be distinguished from a record that was written correctly and then damaged.

### 11.6 `nemos-core/src/schemas/context-pack.ts` — additions only

```ts
export interface ContextPackEnvelope {
  readonly pack_id: string;
  readonly pack_kind: "curated" | "dynamic";
  readonly resolution: "retrieved" | "synthetic";
  readonly project_id: string | null;
  readonly run_id: string | null;
  readonly created_at: string;
  readonly expires_at?: string;
  readonly expired?: boolean;
  readonly content_hash: string;
  readonly integrity: "verified" | "unverified" | "corrupt";
  readonly content: ContextPackContent;
}

export interface ContextPackContent {
  readonly id: string;
  readonly run_id?: string;
  readonly project_id?: string | null;
  readonly persona?: unknown;
  readonly skills: readonly unknown[];
  readonly knowledge: readonly unknown[];
  readonly experiences: readonly unknown[];
  readonly harness?: unknown;
  readonly success_criteria?: readonly string[];
  readonly policy_version: string;
  readonly ranking_policy_version: string;
  readonly pipeline_version: string;
  readonly components: readonly ComponentExecution[];
  readonly assembly: {
    readonly accountingIncomplete: boolean;
    readonly incompleteStages?: readonly string[];
  };
  readonly exclusions: readonly ContextPackExclusion[];
}
```

### 11.7 `nemos-core/src/context/assembly-evidence.ts` (new)

```ts
export type ComponentName =
  | "persona_baseline" | "persona_candidates" | "unified_skills" | "knowledge_store"
  | "cbr_experiences" | "harness_routing" | "dag_plan" | "subagent_dispatch"
  | "perspective_synthesis" | "pack_assembly";

export type ComponentState = "declared" | "configured" | "invoked" | "completed" | "failed" | "skipped";

export type ExclusionReasonKind =
  | "lifecycle" | "applicability" | "capability" | "policy"
  | "scope" | "budget" | "integrity" | "retrieval_key_absent" | "below_floor";

export type ReasonCode =
  | "disabled" | "not_configured" | "store_missing" | "store_unreadable" | "empty_store"
  | "schema_invalid" | "no_match" | "filtered_lifecycle" | "filtered_applicability"
  | "filtered_capability" | "dangling_reference" | "budget_exceeded" | "error";

export interface ComponentExecution {
  readonly component: ComponentName;
  readonly state: ComponentState;
  readonly configured: boolean;
  readonly invokedAt?: string;
  readonly durationMs?: number;
  readonly counts: {
    readonly considered: number;
    readonly retrieved: number;
    readonly selected: number;
    readonly included: number;
    readonly excluded: readonly { readonly reasonKind: ExclusionReasonKind; readonly reasonCode: ReasonCode; readonly count: number }[];
  };
  readonly reasonCode?: ReasonCode;
  readonly error?: { readonly phase: string; readonly errorClass: string; readonly errorCode?: string };
  readonly skipReason?: "disabled" | "not_configured" | "capability" | "policy" | "dependency_failed";
}
```

Deliberately absent: any free-text prompt fragment, filename, diff hunk or asset body. The type is the enforcement of §5.4.

### 11.8 `nemos-core/src/schemas/asset-ingestion.ts` (new)

```ts
export type IngestionState = "discovered" | "validated" | "staged" | "adopted" | "active" | "rejected";

export interface DerivationRecord {
  readonly lossy: true;
  readonly rules: readonly {
    readonly targetField: string;      // "title", "summary", "content", "applicability"
    readonly from: string;             // "first_h1" | "first_paragraph" | "whole_body"
    readonly note?: string;            // e.g. "dropped install-instruction line"
  }[];
}

export interface IngestedAsset {
  readonly assetKind: "persona" | "skill" | "knowledge";
  readonly assetId: string;
  readonly version: string;
  readonly scope: "runtime-global" | "project";
  readonly projectId?: string | null;
  readonly ingestionState: IngestionState;
  readonly provenance: AssetProvenance;             // §4.6
  readonly candidateStatus?: "proposed" | "under_review" | "approved" | "rejected" | "superseded";
  readonly derivation?: DerivationRecord;           // present iff information was lost
}

export interface IngestionReport {
  readonly startedAt: string;
  readonly dryRun: boolean;
  readonly perSource: readonly {
    readonly path: string;
    readonly outcome: "staged" | "unchanged" | "rejected" | "skipped";
    readonly reasonCode?: ReasonCode;
    readonly detail?: string;
  }[];
  readonly totals: { readonly staged: number; readonly unchanged: number; readonly rejected: number };
}
```

### 11.9 Retrieval result (replaces bare arrays)

```ts
export interface RetrievalResult<T> {
  readonly items: readonly T[];
  readonly state: ReasonCode | "completed";
  readonly excluded: readonly { readonly id: string; readonly reasonKind: ExclusionReasonKind; readonly reasonCode: ReasonCode }[];
  readonly rankingPolicyVersion: string;
}
```

`items: []` with `state: "empty_store"` and `items: []` with `state: "no_match"` are the same array and different facts. Making the state a sibling field is what prevents F-02 from recurring.

---

## 12. Migration Strategy

### 12.1 Principles

1. **Additive only.** No field is renamed or removed in this plan.
2. **Read old, write new.** Existing files stay where they are; new records are written in the new layout; a compatibility reader serves the old paths.
3. **No silent inference.** Anything derived is marked `confidence: "inferred"`; anything unknown is marked `"unknown"`.
4. **Every run is reported.** A migration run produces a machine-readable report and a human-readable summary, and is a no-op the second time.
5. **Reversible by copy.** Before any write, the affected directory is copied to `<home>/migrations/<timestamp>/`. Reversal is a directory restore, not an inverse migration.

### 12.2 Steps

| # | Step | Writes | Reads | Reversible by |
|---|---|---|---|---|
| M1 | Create `projects/index.json`, `_unbound/`, `<scope>` directories | New dirs and an empty index | — | deleting the created dirs |
| M2 | Synthesise Run records from `evidence/<run_id>.json` | `<home>/_unbound/runs/` | Filenames only | deleting `<home>/_unbound/runs` |
| M3 | Wrap evidence bodies as `EvidenceRecord` with `run_id` taken from the filename | `<home>/_unbound/evidence/` | `evidence/*.json` | deleting the new dir; originals untouched |
| M4 | Wrap experiences; compute `retrievalKey` where a prompt exists | `<home>/_unbound/experiences/` | `experiences/*.json` | same |
| M5 | Register curated packs as `CuratedPack` metadata | `<home>/_unbound/context-packs/_meta/` | `context-packs/*.yml` | same |
| M6 | Enable the compatibility reader for all flat paths | none | both layouts | a config flag |
| M7 | Report: counts per outcome, unbound total, records with `retrievalKeyState: "absent"` | report only | everything | n/a |

M1–M5 write **only** into new directories. No step rewrites an existing file. That is what makes §12.1.5 true by construction rather than by care.

### 12.3 What each legacy record becomes

| Legacy | Becomes | Referenced by | Retrievable |
|---|---|---|---|
| `evidence/<run>.json` | `EvidenceRecord` + inferred `RunRecord` | each other | yes, by run |
| `experiences/<id>.json` with prompt | `Experience`, `retrievalKeyState: "present"`, `runId: null` unless M2 resolved it | — | yes, if lineage allows |
| `experiences/<id>.json` with `prompt: ""` | `Experience`, `reusability: "not_reusable"`, `retrievalKeyState: "absent"` | — | **no**, with the reason recorded |
| `candidates/*.json` | unchanged `CandidateRecord` | — | not until promoted |
| `personas-evolved/*.json` (candidate) | unchanged `Persona`, `provenance.kind: "proposed"` | — | experimental runs only |
| `context-packs/*.yml` | `CuratedPack`, `selection_policy_version: "unversioned"` | — | yes, by slug |

The last column is the honest part. A legacy experience with no prompt is not "repaired" by inventing a key from its summary; it is marked ineligible and stays visible.

### 12.4 Backward compatibility matrix

| Surface | Change | Compatibility |
|---|---|---|
| `GET /context-pack/:id` | none | byte-identical, including 200-for-unknown |
| `POST /analyze` | response gains `run_id`, `components`, `assembly`, `exclusions` | additive |
| `POST /evidence` | `run_id` must now resolve | already required by the MCP schema; HTTP callers passing it are unaffected |
| `POST /evaluate` | `run_id` is now used | behaviour change, was a no-op |
| `POST /experiences` | validated | **breaking for malformed callers** — decision D-08 |
| `GET /experiences` | adds `retrievalKeyState`, `integrity` | additive |
| `GET /health` | adds `unbound_records`, `projects`, `core_loaded` unchanged | additive |
| `GET /metrics` | adds per-project, per-component | additive |
| MCP `get_context_pack` | errors for unknown id without opt-in | **breaking at the tool boundary only** — decision D-05 |
| On-disk layout | new dirs beside old | both readable |

Two entries are marked breaking and both are decisions, not implementation details. That is deliberate: a plan that claimed full compatibility while changing these two behaviours would be inaccurate.

---

## 13. Test and Acceptance Matrix

Seed defects are named `T-R*` so each finding has at least one test that would have caught it.

| ID | Level | Phase | Test | Asserts |
|---|---|---|---|---|
| T-R1 | unit | A4 | Component truthfulness | No `completed` component reports `included > 0` with `considered == 0`; the static list cannot be produced |
| T-R2 | unit | A6 | Harness criteria snapshot | Every pre-existing profile's `must_pass`/`should_pass` is byte-identical before and after |
| T-R3 | unit | A6 | Domain negative cases | `constrAInts`, `maintain`, `email` → `general`; `train a model` → `machine-learning` |
| T-R4 | unit | A6 | Documentation routing | The audited docs prompt selects the documentation harness; `implement a payment flow` does not |
| T-R5 | unit | A3 | Empty-prompt retention refused | An Experience with an empty retrieval key is not retained as reusable |
| T-R6 | integration | A3 | Legacy retrieval | Retrieval over a fixture of empty-prompt records returns `retrieval_key_absent` per record, not `[]` |
| T-R7 | integration | A2 | Four-step continuity | `analyze_prompt` → `collect_evidence` → `evaluate_run` → `store_experience`, every FK resolves |
| T-R8 | integration | A2 | Dangling reference reported | An Evidence record for an unknown run → 400, nothing written |
| T-R9 | integration | A5 | Pack round-trip | `suggested_pack_id` from `analyze_prompt` retrieves an identical pack; `resolution == "retrieved"` |
| T-R10 | unit | A5 | Pack id uniqueness | 1 000 packs minted in one millisecond are unique |
| T-R11 | integration | A5 | No synthetic substitution | Unknown id without `allow_synthetic` → tool error; with it → `resolution: "synthetic"` |
| T-R12 | unit | A4 | State distinction | Eleven fixture stores (missing, unreadable, empty, invalid, all-filtered ×3, no-match, ok, disabled, not-configured) yield eleven distinct states |
| T-R13 | unit | A4 | Accounting invariant | `considered == Σ excluded + included` for every component, over a fully empty and a fully populated pack |
| T-R14 | unit | A4 | Config has a consumer | Every declared config key either changes behaviour or fails the test |
| T-R15 | integration | A1 | Path move | A project reopens with the same id after its directory is renamed |
| T-R16 | integration | A1 | Clone | Two clones of one remote share a project, distinct instance ids |
| T-R17 | integration | A1 | Fork | A fork does not inherit the upstream project |
| T-R18 | integration | A1 | Two projects, one home | A record from project A is absent from project B's retrieval, and present in `global` retrieval if global |
| T-R19 | integration | A1 | Unbound isolation | An unbound record is retrievable by an unbound run and by no bound project |
| T-R20 | integration | A7 | Compatibility reader | A pre-migration fixture home is fully readable after upgrade |
| T-R21 | unit | B1 | Lossless persona/skill ingest | Every field of `skills/tdd.json` and `personas/backend-api-engineer.json` survives the round trip |
| T-R22 | unit | B1 | Lossy knowledge ingest | `knowledge/project-conventions.md` becomes a *candidate* with a `derivation` record naming every dropped line |
| T-R23 | unit | B1 | Ingestion idempotence | Running ingest twice yields `unchanged` for every source, and zero duplicate records |
| T-R24 | unit | B2 | Promotion needs approval | Promotion without an approval record is refused with a reason, not an exception |
| T-R25 | unit | B2 | Rollback preserved | A promotion leaves the previous version retrievable |
| T-R26 | schema | A2 | Write validation | `store_experience` with a missing `runId` or `evaluationId` returns a field-level error and writes nothing |
| T-R27 | security | A5 | Corrupt pack | A tampered pack file is reported `corrupt` and never served as verified |
| T-R28 | security | A4 | No content in diagnostics | Pack `components[]` contains no substring of the prompt, the diff, or any asset body |
| T-R29 | host | A5 | Real MCP round trip | Through the host: `analyze_prompt` → `get_context_pack` with the returned id, over the real `/mcp` transport |
| T-R30 | regression | all | Full suite | `npm run test:all` at 220 passing, unchanged, plus the new tests |

### 13.1 Acceptance criteria per mission item

| Mission item | Accepted when |
|---|---|
| Project-aware context assembly | T-R15–T-R19 pass; `health_check` reports `unbound_records`; no cross-project retrieval in either direction |
| Correct Skill/Knowledge/Experience retrieval | T-R3, T-R5, T-R6, T-R12, T-R21, T-R22 pass; every empty result carries a state |
| Verifiable Run–Evidence–Experience continuity | T-R7, T-R8, T-R26 pass; every FK resolves or is reported |
| Honest component execution reporting | T-R1, T-R12, T-R13, T-R14, T-R28 pass; the static literal is gone |
| Reliable Dynamic Context Pack identity | T-R9, T-R10, T-R11, T-R27, T-R29 pass |
| Governed asset ingestion and adoption | B1/B2 accepted: T-R21–T-R25 pass; no asset becomes `approved` without a review record |

---

## 14. MVP Implementation Sequence

Sequenced for the smallest interval in which the product stops lying, not the smallest diff.

| Step | Work | Gate to proceed |
|---|---|---|
| 1 | Approve D-01, D-02, D-03, D-05, D-08 | Decisions are written into `docs/08-decisions/` as ADR-0006… |
| 2 | A6 (classification + documentation harness) — independent, smallest, immediately observable | T-R2, T-R3, T-R4 green; criteria snapshot unchanged |
| 3 | A1 (project registry + binding, no storage move) | T-R15–T-R19 green |
| 4 | A2 (Run records, `run_id` enforcement) | T-R7, T-R8, T-R26 green |
| 5 | A4 (component evidence, state distinction) | T-R1, T-R12, T-R13, T-R14, T-R28 green |
| 6 | A3 (retention gates, retrieval key) | T-R5, T-R6 green; legacy corpus inspected and reported |
| 7 | A5 (pack persistence, identity, retrieval semantics) | T-R9, T-R10, T-R11, T-R27, T-R29 green |
| 8 | A7 (scoped layout + compatibility reader) | T-R20 green; T-R18, T-R19 re-run under the new layout |
| 9 | Full suite + host round trip | T-R30 at 220 + new tests; one real host session recorded |
| 10 | MVP review | All six mission items accepted per §13.1 |
| 11+ | B1 → B2 → B3 → B4 → B5 | Phase B begins only after step 10 |
| later | C1–C4 | Each requires its own decision |

Steps 2–3 may proceed in parallel with steps 4–5 after D-01…D-03 are approved, since A6 touches no shared state. Steps 4, 5 and 6 must not be parallelised: A3 validates against Runs that A2 creates, and A4 is what makes A3's refusals visible.

**Why step 2 comes before the lineage work.** A6 is the only phase that is fully independent, and it produces the first visible improvement to a real host session: a documentation task stops being graded as a feature. It also proves the harness-compatibility argument (T-R2) early, before any schema work depends on it.

---

## 15. What this plan does not claim

1. It does not claim the current system retrieves skills, knowledge or experiences. It does not, and the plan says why.
2. It does not claim `components_used` is currently honest. It is a literal.
3. It does not claim the 8 stored experiences can be repaired. They cannot: their retrieval key was never recorded, and deriving one now would be an invention.
4. It does not claim `nemos-core`'s implementations are used by the product. One validator is.
5. It does not claim any phase is complete, tested or measured. Nothing has been implemented.
6. It does not claim full backward compatibility. §12.4 names the two breaking behaviours and routes them through decisions.
7. It does not claim that a documentation harness improves outcomes. It claims the harness is selected correctly and that the selection is visible; whether documentation runs score better is a Phase C question.
8. It does not claim that persisting packs is free. It adds a write to the analyse path; the cost is to be measured in step 7, not assumed.

---

## Appendix A — How each claim in this document can be re-checked

Read-only. No command below writes to `NEMONS_HOME` or the repository.

| Claim | Check |
|---|---|
| Component list is a literal | Read `nemos/src/utils/pipeline-integrator.js` around L368–379 and L616–634; compare |
| Failures collapse to `[]` | Read the `catch` blocks in the skills/experiences/knowledge steps of the same file; read `unified-skills.js` `listAll` |
| Experiences are unretrievable | Read `cbr.js` `sim` and `retrieve`; list `experiences/*.json` and inspect `prompt` |
| `run_id` unused by `evaluate_run` | Read `core-loop.js` L167–200 |
| Pack id never persisted | Read `core-loop.js` L217–261; list `context-packs/` after an `analyze_prompt` |
| Synthetic fallback labelled but 200 | Read `core-loop.js` L236–259; read `nemos/tests/defect-regression-tests.js` L135–141 |
| `ai` substring defect | Read `persona-evolver.js` `detectDomain`; call `analyze_prompt` with a prompt containing `constraints` and read the domain |
| Installers seed no assets | Read the asset-copy section of `install.sh` and the per-OS scripts |
| No documentation harness | List `nemos/src/utils/harness-*.js` |
| Core specifies what the daemon lacks | Read `nemos-core/src/schemas/{project,run,evidence,experience,context-pack}.ts` and `nemos-core/src/context/*.ts` |

---

## Appendix B — Decision index

| ID | Decision | Blocks | Recommended |
|---|---|---|---|
| D-01 | Core as contract vs parallel | Phase B shape | Core is the contract |
| D-02 | Project binding anchor | A1 | Ladder with `.nemons/project.json` primary |
| D-03 | Scope of unbound records | A7, §12 | `_unbound` bucket, `confidence: unknown` |
| D-04 | Persist dynamic packs by default | A5 | Yes, 30 days / 500 packs |
| D-05 | Unknown pack id at the tool boundary | A5 | HTTP unchanged, MCP errors without opt-in |
| D-06 | Add `documentation` to `RunTaskKind` | A6 | Yes, additive |
| D-07 | Fallback harness policy | A6 (soft) | Instrument only; no permissive default |
| D-08 | Retention requires a passing Evaluation | A3 | Evaluation required; failure allowed for `not_reusable` |
| D-09 | Layout: per-project dirs vs flat + field | A7 | Per-project dirs, `project_id` also on records |

**Nothing in this document is implemented. Implementation begins only after the plan and D-01…D-09 are reviewed.**
