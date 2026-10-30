# QODER-02 — Dynamic Context Pack Assembly: Forensic Audit

**Status:** completed, read-only. No repository file was modified, no asset was installed, no
store was written by this investigation.
**Scope:** why the pack delivered to Qoder on 2026-10-30 (`pipeline_version 4.5.0`, id
`dynamic-mvuwbms2`) reported `unified_skills`, `knowledge_store` and `cbr_experiences` as used
while returning `skills: []`, `knowledge: []`, `experiences: []`.
**Method:** source reading plus read-only inspection of the two Nemons homes on the validation
machine. Nothing here is inferred from docs or from the pack's own self-reporting.

---

## 1. The pipeline, as actually wired

| stage | file · function | input | output | skips / empties when |
|---|---|---|---|---|
| MCP entry | `nemos/src/daemon/routes/mcp.js` · `callTool` L201-202 | `{prompt, adapter}` | delegates to core loop | — |
| config | `nemos/src/daemon/server.js` L22-29 | `NEMONS_CONFIG` else `<home>/config/daemon.yml` | `config` object | file absent → `{}` (`runtime-config.js` L24-33, `catch { return {} }`) |
| intercept gate | `core-loop.js` · `analyzePrompt` L88-105 | prompt + `config.interception.filters` | `{should_intercept:false, reason}` | **returns with no `context_pack` field at all** (L103-105) |
| pipeline | `pipeline-integrator.js` · `buildContextPack` L50 | prompt, adapter | `results` + pack | every channel below |
| persona | L67-132 | prompt | `persona`, `persona_candidate` | no adopted persona → template (L98) |
| skills | L146-168 | `persona.domain` + prompt | `results.skills` | `catch { results.skills = [] }` L166-168 |
| experiences | L173-190 | same | `results.experiences` | `catch { … = [] }` L188-190 |
| knowledge | L199-206 | same | `results.knowledge` | `catch { … = [] }` L204-206 |
| harness | L216-237 → `harness-router.js` · `route` L108-165 | prompt, `persona.role` | criteria, task_type | no harness matched → `BaseHarness` (L122-124) |
| DAG / subagents | L242-331 | prompt | `dag_plan`, `subagents`, `orchestration` | `dagPlan.node_count <= 2` → no subagents (L251) |
| pack construction | L337-361 | `results` | the pack | — |
| response | `core-loop.js` L117-126 | pack | inline `context_pack` + `suggested_pack_id` | — |

**Finding 0 — `components_used` is a static literal, not a usage report.**
`pipeline-integrator.js` L368-379 returns a hard-coded ten-item array. `stats()` L616-634
returns the identical list. Nothing in the response is conditional on whether a component
retrieved, was skipped, or threw. So "the pack reported `knowledge_store` as used" carries no
information whatsoever, and the empty arrays are not a contradiction of it — the label and the
result were never connected. **Any claim of component usage in this response is unfalsifiable
as shipped.**

**Finding 1 — three `catch` blocks erase the reason an array is empty.**
L166-168, L188-190, L204-206 bind the error and discard it. Combined with `listAll` returning
`[]` on `readdir` failure (`unified-skills.js` L223) and `KnowledgeStore.list` the same
(`knowledge-store.js` L61-63), four distinct states collapse into one indistinguishable `[]`:
store empty · store missing · store unreadable · assets present but scoring zero. Note the
inconsistency: `postRunProcessing` L543-554 collects `errors: [{stage, error}]` precisely
because "a caller saw a `false` flag with no way to learn why" — the same lesson was never
applied to the read side.

---

## 2. The four channels

### A. Persona — template used, candidate withheld (correctly), but generated from noise

- Role selection `selectPersonaRole` (L510-521) is four `String.includes` tests over
  security/devops/data/frontend vocabulary, else `senior_engineer`. The docs prompt matched
  none → `senior_engineer` → `getDomainForRole` L388-397 maps it to **`general`**, which is
  hard-coded and final.
- **No repository, project or workspace identity exists in this path.** The inputs are the
  prompt string and a static keyword table. Nothing in `buildContextPack` receives a cwd, a
  repo root, a remote URL or a project id — see §3.
- `selectAdopted` (`persona-evolver.js` L112-135) filters `status === "adopted"` and returns
  `null` when the list is empty (L114). On this machine `~/.nemons/personas-evolved/` holds
  **10 personas, every one `status=candidate`, `domain` empty, `role="Senior Software
  Engineer"`** — so `listAdopted()` yields nothing and the template is used. That part is
  Invariant #4 (`Use != Adopt`) working exactly as designed (L71-80, L101-119): the candidate
  is recorded and `used:false`.
- **`recasted: true` is a real transformation, not metadata.** L123-130 calls
  `PersonaRecaster.recast({role, experience:"5+ years"}, {task: prompt, user_level:"mid"})`
  and only sets the flag when `recasted.changed`. The emitted pack's
  `persona.adjusted = {experience:"15+ years (escalated)", focus_areas:[…], …}` is the
  recaster's output, i.e. the text "15+ years (escalated)" was fabricated from the seed string
  "5+ years" by a complexity heuristic, with `dagNodeCount: 1` as input (L105).
- **Defect: the candidate persona for a documentation task was classified
  `machine-learning`.** `detectDomain` (`persona-evolver.js` L175-193) iterates the domains
  object in insertion order and returns the first entry whose keyword satisfies
  `prompt.includes(kw)`. `"machine-learning"` is the **first** key (L177) and contains the
  keyword `"ai"`, which is a substring of `constrAInts`. Reproduced verbatim against the real
  prompt:

  ```
  FIRST MATCH DOMAIN = machine-learning | matched substrings: ["ai"]
  ```

  One unworded two-letter substring produced the role "ML Pipeline Engineer (architecture,
  testing)" and constraints about model inputs, experiment metrics, random seeds and dataset
  versioning (stored at `~/.nemons/personas-evolved/persona-dyn-mvuwbmrz.json`,
  `created_from_task: "Implement a small documentation-only change to INSTALL.md …"`).
  `persona-evolver.js` L106 gates candidate injection on `requirements.domain !== "general"`,
  so this noise-based classification is what made a candidate worth recording at all. Had it
  been adopted, the pack would have steered a docs edit by ML constraints.

### B. Skills — the store is empty on this machine, and retrieval is a substring test

`retrieve` (`unified-skills.js` L112-143) reads `<NEMONS_HOME>/skills-unified/`
(L13-14, module-load-time constant). Counts:

| home | `skills-unified` | `knowledge-adopted` | `experiences` | `context-packs` | `candidates` |
|---|---|---|---|---|---|
| `.qoder-validation/nemons-home` (this pack) | 0 | 0 | 0 | 0 | — |
| `~/.nemons` (default, installed) | **0** | **0** | 8 | 0 | **16, all `status=candidate`, all `type=skill`** |

So the empty array is **missing assets, not filtering**: there was nothing to score. The reason
no machine on this project has a skill is structural: 16 auto-compiled skills reached
`candidates` and none was ever approved+promoted. The promotion path does exist and is wired —
`daemon/approval-promotion.js` L35-51 `promoteSkill` → `services.unifiedSkills.adopt`
(`unified-skills.js` L162-170, `status:"adopted"`), called from `platform-v40.js` L65 and
`core-bridge.js` L236 — it has simply never been exercised here.

Two further properties of the channel, both independent of emptiness:

- **Scoring is substring containment, not token overlap** (L122-123): `q.includes(trigger)`.
  A multi-word trigger must appear *verbatim inside the prompt*. A skill whose `triggers` is
  empty scores 0 forever and can never be retrieved, adopted or not.
- **Auto-compiled skills get triggers from a seven-word list** —
  `extractTriggers` L172-175: `["implement","fix","refactor","test","build","deploy","debug"]`.
  A run whose prompt lacks all seven compiles to a skill with `triggers: []`, i.e. permanently
  unreachable. Combined with §2C (`prompt: ""` on stored experiences) the auto-compile path can
  produce only dead assets.
- The repo's own `skills/*.json` (23 files) cannot feed this store at all: `tdd.json` keys are
  `id, version, provenance, name, description, applicability, inputs, outputs,
  requiredCapabilities, failureConditions` — **no `status`, no `domain`, no `triggers`**, the
  three fields `retrieve` and `register` depend on (`unified-skills.js` L40-58). No installer
  references them (see §4).

### C. Knowledge — no repository identity, so no repository awareness is possible

`KnowledgeStore` (`knowledge-store.js`) is scoped purely by `NEMONS_HOME`:
L18 `DEFAULT_DIR = path.join(nemonsHome(), "knowledge-adopted")`. Adoption writes
`{id,title,content,domain,triggers,source:"adopted-candidate",status:"adopted"}` (L33-54);
`list()` keeps only `status === "adopted"` (L72); `retrieve` (L80-105) scores **token overlap**
— words of length > 3 from `triggers + domain + title + content` intersected with the query,
filtering `score > 0`.

**The pipeline cannot distinguish one repository from another.** There is no project, repo,
workspace or scope field in the record schema (L38-50), no such argument in `retrieve`, and no
project identity anywhere in `buildContextPack`. Two projects sharing a Nemons home share one
undifferentiated knowledge pool; a per-project home is the *only* isolation mechanism, and it
is an operator choice rather than a modelled concept. Directly answering the question posed:
no, the pipeline does not have enough information to tell one repository from another.

Consequently `knowledge: []` here is again missing assets: `knowledge-adopted` is empty in both
homes, and the repo's curated `knowledge/auth-domain.md` and `knowledge/project-conventions.md`
have **no code path that reads them** — no runtime module references the top-level `knowledge/`
directory at all.

### D. Experiences — declared integration, retrieval currently dead

`CBRExperienceStore` (`cbr.js`): `EXPERIENCES_DIR = <NEMONS_HOME>/experiences` (L6-7,
module-load constant); `retrieve` (L32-45) computes word-overlap `sim` (L8-25, tokens of
length > 3), scores `0.7*similarity + 0.3*success_rate`, and **drops everything below
`minSimilarity = 0.15`** (L34, L42). The pipeline calls it as `this.cbr.retrieve(expQuery, 3)`
(`pipeline-integrator.js` L178) — three positional args, no options object, so the 0.15 floor
is always in force. `sim` returns 0 when either side has no tokens (L21).

**Admission and reuse rules:** there is no persona/domain/task-type filter and no run association
in the retrieval path. The stored record is `{id, timestamp, prompt, solution, success_rate,
adapter}` (L51-58) — no `run_id`, no `task_type`, no `domain`. `harness.cbr_retrieval_strategy`
declares `filter_by: {task_type:"feature"}` (`harness-feature.js` L38-42) and a weighted
`{similarity 0.5, recency 0.3, success_rate 0.2}` ranking; `cbr.retrieve` implements
`0.7*similarity + 0.3*success_rate` and **ignores both fields entirely**. The declared strategy
is decorative.

**Run association does not exist.** `evaluateRun` destructures `run_id` (`core-loop.js` L167) and
never uses it — the only occurrences of `run_id` in the whole file are inside `collectEvidence`
(L142-163). It is required by the MCP schema (`routes/mcp.js` L105), accepted, and then dropped:
the `postRunProcessing` call at L187-192 passes `{prompt, evidence, verification, adapter}` with
no run, and evidence is addressed by filename only (`evidence/<run_id>.json`) — all 11 records in
the installed home have no `run_id` and no `prompt` field inside the JSON body, and no experience
carries a run. Experience → Evidence → Run cannot currently be joined in either direction.

**Defect, verified on disk:** all eight experiences in the installed home have an empty prompt:

```
exp-mvpro8on.json  "prompt": ""  success_rate=1  adapter="unknown"
  solution: {tests_pass, no_syntax_errors, no_security_violations, no_secrets_in_diff}
```

`sim(query, "")` → 0 → `similarity >= 0.15` fails → filtered. **Every stored experience is
permanently unretrievable**, in any home, for any query. `nemons.store_experience` declares
`inputSchema: {type:"object", additionalProperties:true}` with **no required fields at all**
(`routes/mcp.js` L112) and `storeExperience` spreads caller data over the record
(`core-loop.js` L206-211), so `{"prompt":""}` is accepted verbatim. The `solution` shape above is
`runData.evidence` (`pipeline-integrator.js` L558), i.e. the record came through the
`evaluate_run` path, whose `prompt` parameter also defaults to `""` (L167, L188) — the same hole
reached by a route that does not validate what the client sent.

Answer to the question posed: **experience retrieval is a declared integration without proven
retrieval.** It is not merely empty here — with the store's actual contents it cannot return
anything.

---

## 3. Task classification and harness routing

- Classification is `harness.matches(prompt)` in registration order
  (`harness-router.js` L74-81, L113-119): Debug, BugFix, Test, Deploy, Refactor, Feature;
  `BaseHarness.matches` returns `false` by design (`harness-base.js` L90).
- The six patterns, verbatim: debug `/\b(debug|trace|investigate|diagnose|why|…)\b/i`
  (L44), bugfix `/\b(fix|bug|broken|issue|error|crash|fail|…)\b/i` (L48), test
  `/\b(test|spec|coverage|assert|mock|tdd|unit test)\b/i` (L46), deploy
  `/\b(deploy|release|ship|publish|rollout|kubernetes|helm)\b/i` (L48), refactor
  `/\b(refactor|clean|improve|optimize|simplify|restructure|rename|extract)\b/i` (L46),
  feature `/\b(implement|add|create|build|develop|make|construct)\b/i` (`harness-feature.js`
  L49).
- **There is no documentation category.** Six specialized harnesses plus base; nothing in any
  pattern mentions `doc`, `docs`, `markdown` or `readme`. "documentation-only" matches none of
  them — the `\b(implement|…)\b` of `implement` at the start of the prompt is what routed it,
  and it wins on order because Debug/BugFix/Test/Deploy/Refactor did not match first. Routing
  is therefore **a single first-regex-wins keyword test with no notion of task substance.**
- Effect on criteria: `FeatureHarness` contributes
  `must_pass: [tests_pass, no_syntax_errors, no_security_violations, no_secrets_in_diff,
  feature_implements_spec]` and `should_pass: […, documentation_added, tests_added, …]`
  (L17-36). `documentation_added` sits in **should_pass** because for a feature harness
  documentation is a desirable side effect of shipping code; the must-pass set is about the
  code being correct and safe. Promoting it per-task-type would be a semantic change to the
  verification contract and this audit does not recommend it — the intended reading is that
  `must_pass` selects deterministic verifier checks (`core-loop.js` L27-34
  `CONSTRAINT_FLAGS`: `tests_pass→check_tests`, `no_secrets_in_diff→check_secrets`, …), and
  `documentation_added` has no deterministic check to map to. For a documentation-only task the
  real defect is upstream: the task was routed to a harness that assumes code.
- `augmented:false` and `router_persona_applied:false` are **expected and correct.** Domain is
  `general` (persona is the template `senior_engineer`), `personaAugmented = domain !==
  "general"` (router L128), and `PERSONA_DOMAIN_CRITERIA` (L30-51) has no `general` key, so the
  router takes the `else` branch (L144-150) stamping `augmented:false`;
  `router_persona_applied = persona_augmented === true` (integrator L236). The pack is honestly
  reporting "no persona-specific criteria were added", which is true.
- One genuine cross-channel effect: because the pack's domain came out `general` while the
  *candidate* persona's domain came out `machine-learning`, the two subsystems disagree about
  the same prompt. `matched_by` in skills/experiences/knowledge is set from
  `persona.domain !== "general"` (L164, L186), so all three channels queried on the bare prompt
  and reported `matched_by:"prompt"` — the persona-domain path was skipped, correctly, given
  `general`.

---

## 4. Dynamic pack identity

- **Mint point:** `pipeline-integrator.js` L337-338, `id: "dynamic-" + Date.now().toString(36)`
  — inside STEP 8, after all retrieval. Copied to the response as `suggested_pack_id` (L366) and
  surfaced again by `core-loop.js` L121.
- **Never persisted.** `getContextPack` (`core-loop.js` L227) resolves exactly
  `<NEMONS_HOME>/context-packs/<id>.yml` and nothing else. Verified after the real call: that
  directory in `.qoder-validation/nemons-home/context-packs/` still contains **0 files**, while
  the response carried `suggested_pack_id: "dynamic-mvuwbms2"`. An unknown id returns
  **HTTP 200 with a synthetic pack** (L237-259, `is_synthetic:true`,
  `source:"synthetic_fallback"`) — a successful-looking response containing no project context,
  distinguishable only by that marker.
- **Consequence for any host that follows the documented sequence.** `analyze_prompt` hands the
  client an id, `get_context_pack` accepts it, and the answer is the fallback. A client that
  trusts id-and-200 is silently downgraded. Only the inline `context_pack` is real delivery.
- **The name promises reuse and the system provides none.** `store/context/storage.js` L22-26
  and `commands/daemon.js` L36 create `context-packs/` at boot; `server.js` L32 creates it too.
  No code path ever writes a dynamic pack there, so the directory is permanently empty unless a
  human drops a YAML file in it. The curated `config/context-packs/stripe-webhook-handler.yml`
  is not installed by any script either: `install.sh` L45-47 and `scripts/{windows,linux,macos}`
  copy **only `daemon.yml` and `governance-rules.yml`**.
- Collision and id shape: base36 `Date.now()` is a second-granularity-ish value, not a unique
  key. Compare `cbr.retain` L46-49, which adds `crypto.randomBytes(3)` explicitly because
  "Date.now() alone collides when two runs finish in the same millisecond and the second
  silently overwrote the first". The pack id has no such suffix, and the id doubles as the
  filename (`${id}.yml`).
- Timestamps inside one response are three separate `Date.now()` calls, which is why the ids
  are mutually inconsistent: pack `dynamic-mvuwbms2` (L338), candidate persona
  `persona-dyn-mvuwbmrz` (`persona-evolver.js` L36, 43 ms earlier), subagent
  `sub-mvuwbms1-34ee92` (`subagent-manager` via L260-262, 1 ms earlier). They are one build, and
  they do not look like it.

---

## 5. Config is never honoured on this machine

`server.js` L23: `CONFIG_PATH = process.env.NEMONS_CONFIG || <home>/config/daemon.yml`;
L29 `config = loadDaemonConfig(CONFIG_PATH)`; `runtime-config.js` L28-32 `catch { return {} }`.
`Test-Path $HOME\.nemons\config\daemon.yml` → **False**, and `~/.nemons/config/` is empty, so the
installed daemon runs on code defaults. Effects, all three traceable to the shipped
`config/daemon.yml`:

- `interception.filters` (repo L37-42) is decorative → `activeFilters = DEFAULT_CONFIG`
  (`core-loop.js` L93-101), so the `no_code_intent` refusal in the prior test came from the
  built-in table, not from the curated config.
- `verification.evaluation_criteria.must_pass` (repo L146-151) never reaches the verifier →
  `constraintsFromConfig({})` returns `constraints: undefined` (L52-56), i.e. "all
  deterministic checks on" rather than the curated list.
- `should_pass`/`nice_to_have` never reach the pack → `criteriaFromConfig({})` is `[]`, so the
  L111-114 merge was skipped and the delivered `success_criteria` is purely the harness's
  must_pass list. `success_criteria_source` is absent from the response for the same reason —
  which is the correct report, but only by accident.

The root cause is not the config file. **The two stores that hold project identity are keyed by
`NEMONS_HOME`, and `NEMONS_HOME` is resolved at module load, not per request**
(`unified-skills.js` L13, `cbr.js` L6-7, `knowledge-store.js` L18, `persona-evolver.js` L14).
`services.js` L71 also instantiates `new PipelineIntegrator()`, which constructs its *own*
`UnifiedSkillSystem`/`KnowledgeStore`/`CBR` (L31, L33, L44) rather than using
`services.unifiedSkills`/`services.knowledgeStore`/`services.cbr`. Same directories, so no state
diverges today — but it means there is no injection seam to point a request at a different
project, which is exactly what repository-aware retrieval would need.

---

## 6. Does Nemons perform project-aware context retrieval and assembly?

**Assembly: yes, and it is real.** Persona selection, recasting, multi-persona perspectives,
harness routing, DAG planning and subagent dispatch all ran for this prompt and produced a
coherent pack in 6 ms (`duration_ms:6` in the daemon access log).

**Project-aware retrieval: no.** Across all four channels there is no repository, workspace or
project identity of any kind — not in the store schemas, not in the retrieval signatures, not in
the pipeline inputs. What the pipeline retrieves is *host-global*: whatever happens to be
adopted under the one `NEMONS_HOME` the process resolved at require time. For this prompt the
result was three empty arrays because (a) skills and knowledge stores are empty everywhere on
this machine, with 16 skills and 10 personas stuck at `candidate`, and (b) the eight experiences
that do exist have `prompt:""` and therefore cannot pass the similarity floor.

Three claims follow, and three do not:

- Established: the delivered pack contained no project-specific context; `components_used` is a
  static list; the dynamic id is not retrievable; a docs task has no harness category; the
  curated config and the curated asset tree are not installed or not read.
- **Not established:** that the empty channels are ever caused by *filtering* on this machine —
  there was nothing to filter. That the `machine-learning` misclassification reached a pack
  (it did not; the candidate was withheld). That retrieval would work if assets were present —
  the substring-trigger scoring and the empty-prompt experience records both fail independently
  of presence.
- Not attempted: any fix, any asset installation, any write to either home.

---

## 7. Ranked findings

| # | Finding | Locus | Severity |
|---|---|---|---|
| 1 | Stored experiences carry `prompt:""`, so CBR retrieval can never return them | `routes/mcp.js` L112 (`additionalProperties`, nothing required), `core-loop.js` L167/L188/L206-211, `cbr.js` L21/L34/L42 | High — a declared core channel is dead |
| 1b | `run_id` is required by `evaluate_run` and then never used; no Experience↔Evidence↔Run join exists | `core-loop.js` L167 vs L142-163, `routes/mcp.js` L105 | High — objective 8 (Evidence→Run association) is unreachable by schema design |
| 2 | `components_used` is a hard-coded literal, so the pack claims usage it did not measure | `pipeline-integrator.js` L368-379 | High — attribution without evidence |
| 3 | No project/repository identity in any store schema or retrieval path | `knowledge-store.js` L18/L38-50, `cbr.js` L6-7/L51-58, `pipeline-integrator.js` L50 | High — project-awareness impossible by construction |
| 4 | `suggested_pack_id` is never persisted; retrieving it yields a synthetic 200 | `pipeline-integrator.js` L337-366 vs `core-loop.js` L227-259 | High — silent downgrade of any compliant client |
| 5 | `detectDomain` first-keyword substring match misroutes docs prompts to `machine-learning` via `"ai"` in `constraints` | `persona-evolver.js` L175-193 | Medium-High — noise-driven persona generation |
| 6 | Three `catch` blocks collapse empty/missing/unreadable/zero-score into `[]` | `pipeline-integrator.js` L166-168, L188-190, L204-206 | Medium — undiagnosable by design |
| 7 | Skill triggers are matched by `query.includes(trigger)`; auto-compiled triggers come from a 7-word list | `unified-skills.js` L122-123, L172-175 | Medium — adopted skills can still be unreachable |
| 8 | `harness.cbr_retrieval_strategy` (`filter_by`, weights) is declared and never used | `harness-feature.js` L38-42 vs `cbr.js` L40 | Medium |
| 9 | No documentation task category; first regex wins, docs route to `feature` | `harness-router.js` L74-81, L113-119 | Medium |
| 10 | Repo asset tree (`skills/`, `personas/`, `knowledge/`, `config/`) has no install or seed path; installers copy only 2 YAML files | `install.sh` L45-47, `scripts/*/install*` | Medium — curated assets invisible to runtime |
| 11 | `<home>/config/daemon.yml` absent here, so interception/verification/redaction config is inert | `server.js` L23-29, `runtime-config.js` L28-32 | Medium (environment-specific) |
| 12 | `PipelineIntegrator` builds private stores instead of using `services.*`; ids minted from three unsynchronised `Date.now()` calls; pack id lacks the collision suffix CBR added | `services.js` L71, `pipeline-integrator.js` L31/L33/L44, L338 | Low — latent, not currently divergent |

---

## 8. Reproducing these observations read-only

```powershell
cd c:\c\Nemons
$env:NEMONS_HOME = "c:\c\Nemons\.qoder-validation\nemons-home"   # or omit for the installed home

# 1) the pack, through the host (or the equivalent HTTP call for a scripted run)
#    analyze_prompt with a code-intent prompt -> inspect skills/knowledge/experiences

# 2) store emptiness (Finding 3, 10)
Get-ChildItem "$env:USERPROFILE\.nemons\skills-unified","$env:USERPROFILE\.nemons\knowledge-adopted" -Force | Measure-Object

# 3) experiences with empty prompts (Finding 1)
Get-ChildItem "$env:USERPROFILE\.nemons\experiences\*.json" | ForEach-Object {
  (Get-Content $_ -Raw | ConvertFrom-Json).prompt.Length }

# 4) candidates never promoted (Finding 3)
Get-ChildItem "$env:USERPROFILE\.nemons\candidates\*.json" | ForEach-Object {
  (Get-Content $_ -Raw | ConvertFrom-Json).status } | Group-Object

# 5) detectDomain substring misroute (Finding 5) — 'ai' inside 'constraints'
node -e "const p='operational constraints'.toLowerCase();
console.log(['ml','model','pipeline'].some(kw=>p.includes(kw)))"   # -> true

# 6) config inert (Finding 11)
Test-Path "$env:USERPROFILE\.nemons\config\daemon.yml"             # -> False

# 7) dynamic id not persisted (Finding 4)
Get-ChildItem "$env:NEMONS_HOME\context-packs" -Force | Measure-Object   # -> 0
```

## 9. Sources

- Code read for this audit: `nemos/src/daemon/core-loop.js` (L27-85, L88-137, L139-213,
  L215-261), `nemos/src/daemon/routes/mcp.js` (L199-220), `nemos/src/daemon/server.js`
  (L20-32, L196-264, L390-399), `nemos/src/daemon/services.js` (L67-129),
  `nemos/src/daemon/approval-promotion.js` (whole), `nemos/src/daemon/routes/platform-v40.js`
  (L65), `nemos/src/daemon/core-bridge.js` (L236),
  `nemos/src/utils/pipeline-integrator.js` (whole), `nemos/src/utils/unified-skills.js`
  (L13-14, L40-58, L112-175, L213-224), `nemos/src/utils/knowledge-store.js` (whole),
  `nemos/src/utils/cbr.js` (whole), `nemos/src/utils/persona-evolver.js` (L14-15, L28-60,
  L112-135, L175-201), `nemos/src/utils/harness-router.js` (L30-81, L108-165),
  `nemos/src/utils/harness-feature.js` (whole), `nemos/src/utils/harness-base.js` (L90),
  `nemos/src/utils/runtime-config.js` (L20-59), `nemos/src/store/storage.js` (L22-26),
  `nemos/src/commands/daemon.js` (L35-38), `nemos/src/commands/experiences.js` (L8-9).
- Data inspected: `c:\c\Nemons\.qoder-validation\nemons-home\**` (personas-evolved 2, evidence 1,
  all other stores 0), `%USERPROFILE%\.nemons\**` (experiences 8, personas-evolved 10,
  candidates 16, evidence 11, skills-unified 0, knowledge-adopted 0, context-packs 0,
  config 0 files), `c:\c\Nemons\skills\tdd.json`, `c:\c\Nemons\knowledge\`,
  `c:\c\Nemons\config\daemon.yml`, `c:\c\Nemons\config\context-packs\`, `c:\c\Nemons\install.sh`,
  `c:\c\Nemons\scripts\{install.sh,windows\install.bat,windows\install.ps1,linux\install.sh,macos\install.command}`.
- Runtime evidence: `.qoder-validation/nemons-home/logs/mcp-access.log` — request `58`
  `tools/call nemons.analyze_prompt outcome=ok duration_ms=6` at `2026-10-30T11:35:38.259Z`,
  `user_agent=Go-http-client/1.1`.
- Related: `docs/07-evaluation/experiments/QODER-01-host-capability-report.md` (host
  integration and the four-state rule), `docs/07-evaluation/experiments/GT-01-cross-session-continuation.md`.
