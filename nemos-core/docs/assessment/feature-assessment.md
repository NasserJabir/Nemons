# Nemons — Feature Architecture & Value Assessment

**Date:** 2026-10-21  
**Evaluator:** Principal Software Architect & Agent Runtime Engineer  
**Scope:** All 64 proposed features (F-001 through F-064)  
**Baseline Implementation:** HEAD `db2dd78`, 1169 tests, 66 source files, 16 ADRs

---

## Deliverable 1 — Executive Assessment

### Overall Coherence

The feature set is **largely coherent** and maps well to Nemons' stated purpose: cross-Run continuity, governed knowledge evolution, and evidence-based operational learning. The majority of features (approximately 50 of 64) have working implementations with passing tests. The strongest aspect is the **evidence-to-governed-adoption pipeline** (F-025 through F-044), which forms a complete chain from execution to approved knowledge.

### Strongest Aspects

1. **Evidence-before-claims enforcement** (ADR-0004, F-026/F-027/F-031): `markSucceeded` requires evidence; Evaluation distinguishes `verified_succeeded` from `claimed_succeeded_unverified`.
2. **Governed evolution** (F-040 through F-045): candidates start as `proposed`, require governed review, pass conflict detection, and only become `approved` after explicit authority checks.
3. **Provenance and lifecycle** (F-028, F-048): every asset has an immutable provenance trail; lifecycle transitions are append-only.
4. **Research-driven improvements** (ADRs 0007-0016): 10 improvements backed by verified papers, 176 new tests.

### Most Consequential Architectural Risks

1. **No Project/Task abstraction (F-001, F-002)**: Runs exist but are not grouped under Projects or Tasks. This limits multi-Run task tracking and makes cross-Run continuity ad hoc.
2. **No Loop/Retry control (F-053, F-055)**: The Run lifecycle is single-shot. There's no automatic retry decision or stop-condition enforcement. A Run either succeeds, fails, or is aborted — the system cannot decide "retry with modified context."
3. **No Budget/Stop controls (F-051)**: No cost, time, or repetition limits on Runs. This is a production-readiness gap.
4. **No CLI (F-059)**: No developer interface for inspecting Runs, assets, or governance state. This limits adoptability.
5. **Cross-agent rendering (F-019, F-020)**: Context Packs are canonical but not rendered per-agent. Semantic loss detection is absent.

### Features Most Likely to Establish Unique Value

1. **F-004 (Cross-Run Continuity)** + **F-034 (Experience Reuse)**: the ability to reuse verified Experience in a later Run is Nemons' primary differentiator.
2. **F-035 (Outcome Attribution)** + **F-010 (MAST)**: distinguishing "the Skill failed" from "the model failed" is unique value.
3. **F-046 (Policy Engine)** + **F-048 (Trust Verification)**: hard-deny security at the runtime level is not provided by Coding Agents.

### Most Important Missing Capability

**F-053/F-055 (Verification Loop + Stop Conditions)**: without a Run-level retry loop, Nemons can evaluate a Run and produce an Experience, but it cannot decide to retry with a modified Context Pack. This limits the system to single-shot execution, which doesn't demonstrate cross-Run *iterative* improvement.

### Overall Recommendation

The feature set is sound. The implementation has already demonstrated the core value proposition (Run → Evidence → Experience → Candidate → Governed Adoption). The highest-priority gap is the **retry/verification loop** (F-053, F-055), which would allow Nemons to demonstrate *iterative* improvement, not just single-shot learning. The second priority is **Project/Task management** (F-001, F-002), which would give Runs a durable context for cross-Run continuity.

---

## Deliverable 2 — Feature Assessment Matrix

### Stage A — Architectural Model

**Project purpose (restated):** Nemons is an independent runtime layer that sits above Coding Agents, managing the lifecycle of operational knowledge — from execution evidence through governed adoption — across multiple Runs and potentially different Coding Agents. Its value proposition is making operational intelligence portable, verifiable, and governed.

**Architectural boundaries:**
- **Nemons Core:** domain schemas, policy engine, context resolver, evaluation, governed evolution, persistence.
- **Agent Adapter:** the replaceable boundary that translates Nemons' canonical contracts into a specific Coding Agent's capabilities.
- **Coding Agent Harness:** owns the agent loop, model interaction, tool invocation, permissions.
- **Execution Environment:** filesystem, shell, network — owned by the Harness or adapter.

**Core entities and relationships:**
```
Run → produces → Evidence → supports → Evaluation → justifies → Experience
Experience → retrieved for → Context Pack → delivered to → Adapter → produces → Run (next)
Candidate → supersedes → Candidate (version chain)
Candidate → generated from → Experience
Memory ← derived from → Experience (via bridge)
```

**Fundamental Run lifecycle:**
```
pending → in_progress → (succeeded | failed | aborted)
- succeeded requires evidenceRefs (ADR-0004)
- failed may have failureAttribution (ADR-0010)
- all terminal states are immutable
```

**Data categories:**
- Durable source: Persona, Skill, Knowledge, Memory records, Candidate records, Experience records
- Derived indexes: Context Pack (Run-specific), Evaluation (Run-specific)
- Ephemeral runtime: Run state (pending/in_progress), adapter invocation
- Handoff: Context Pack (delivered to adapter), Experience (delivered to later Run's Context Pack)

**Unvalidated assumptions:**
- That Coding Agent adapters can provide structured execution events (not all can).
- That cross-agent continuity is practically achievable (no real external adapter tested yet).
- That the 13% noise band (from "What Does a Harness Buy?") applies to Nemons' use cases.

---

### Feature Assessment (F-001 through F-064)

| ID | Name | Purpose | Ownership | Necessity | Recommendation | Confidence |
|---|---|---|---|---|---|---|
| F-001 | Project Management | Group Runs, assets, and policies under projects | Nemons core | Conditional — needed for multi-project, not for MVP | **Defer** to P2 | Medium — adds organizational structure but not core value |
| F-002 | Task Management | Define task goals, acceptance criteria, associated Runs | Nemons core | Conditional — Run inputs partially serve this role | **Refine** — Run.inputs already has taskDescription/taskKind; add acceptance criteria to Run | Medium |
| F-003 | Run Lifecycle Management | Create, track, record outcomes | Nemons core | **Essential** | **Keep** (P0) — implemented, 17 tests | High |
| F-004 | Cross-Run Continuity | Transfer knowledge between Runs | Nemons core | **Essential** | **Keep** (P0) — implemented via Experience chain | High |
| F-005 | Persona Management | Operational identity, constraints | Nemons core | **Essential** | **Keep** (P0) — implemented, schema + validators | High |
| F-006 | Skill Management | Create, version, scope Skills | Nemons core | **Essential** | **Keep** (P0) — implemented, full lifecycle | High |
| F-007 | Knowledge Management | Store eligible information with provenance | Nemons core | **Essential** | **Keep** (P0) — implemented with lifecycle | High |
| F-008 | Memory Management | Retain info across Runs | Nemons core | **Essential** | **Keep** (P0) — implemented, includes category-conditioned retention (ADR-0014) | High |
| F-009 | Subagent Composition | Assemble Persona+Skills+Context+Policies | Nemons core | Conditional — the formula exists conceptually | **Defer** to P2 — the Context Pack Builder already composes assets; explicit Subagent assembly is premature | Medium |
| F-010 | Tool Registry | Register tool capabilities | Nemons core | Optional — Skills carry requiredCapabilities; adapter advertises capabilities | **Merge** into F-006 (Skill) + F-017 (Adapter) — no standalone Tool registry needed | Medium |
| F-011 | Asset Versioning | Versions, lineage, supersession, rollback | Nemons core | **Essential** | **Keep** (P0) — implemented via lifecycle + candidate store | High |
| F-012 | Asset Applicability & Retrieval | Select relevant assets | Nemons core | **Essential** | **Keep** (P0) — implemented via context-resolver | High |
| F-013 | Context Assembly | Retrieve, filter, curate | Nemons core | **Essential** | **Keep** (P0) — implemented | High |
| F-014 | Canonical Context Pack | Standardized Run-specific artifact | Nemons core | **Essential** | **Keep** (P0) — implemented | High |
| F-015 | Context Budget & Optimization | Manage size, cost, prevent silent removal | Nemons core | Conditional — maxAssets/maxContentBytes exist; no active optimization | **Refine** — add active budget tracking in P2 | Medium |
| F-016 | Context Validation | Detect conflicts, untrusted, stale | Nemons core | **Essential** | **Keep** (P0) — implemented + evidence consistency (ADR-0007) + temporal (ADR-0008) | High |
| F-017 | Agent Adapter Registry | Register adapters | Nemons core | **Essential** | **Keep** (P0) — implemented | High |
| F-018 | Agent Capability Discovery | Identify execution/observation capabilities | Adapter | **Essential** | **Keep** (P0) — implemented via getCapabilities() | High |
| F-019 | Context Rendering | Render to each Agent's format | Adapter | Conditional — canonical pack exists; per-agent rendering deferred | **Defer** to P2 — needs real adapters to justify | Medium |
| F-020 | Semantic Loss Detection | Detect meaning loss across Agents | Adapter | Optional — premature without real cross-agent experience | **Defer** to P3 | Low |
| F-021 | Execution Delegation | Prepare and delegate via adapter | Nemons core | **Essential** | **Keep** (P0) — implemented via invoke() | High |
| F-022 | Execution Observation | Normalize events, outputs | Adapter | **Essential** | **Keep** (P0) — implemented via adapter events + evidence collector | High |
| F-023 | Environment Integration | Local, isolated, remote | Adapter | Conditional — LocalExecutionAdapter covers local | **Defer** remote to P2; keep local in P0 | Medium |
| F-024 | Permission & Policy Enforcement | Enforce via trusted boundaries | Nemons core | **Essential** | **Keep** (P0) — policy engine + action interception (ADR-0016) | High |
| F-025 | Trace & Run Log | Record events, sequence | Nemons core | **Essential** | **Keep** (P0) — adapter events + Run records | High |
| F-026 | Evidence Management | Verifiable evidence (tests, diffs) | Nemons core | **Essential** | **Keep** (P0) — full evidence lifecycle | High |
| F-027 | Claims & Evidence Linking | Link claims to supporting/contradicting evidence | Nemons core | **Essential** | **Keep** (P0) — Run.evidenceRefs + Evaluation | High |
| F-028 | Provenance & Lineage | Track origin, derivation | Nemons core | **Essential** | **Keep** (P0) — provenance + reviewTrail | High |
| F-029 | Audit History | Record changes, decisions, approvals | Nemons core | **Essential** | **Keep** (P0) — DecisionLog | High |
| F-030 | Historical Reconstruction | Reconstruct Run inputs/state | Nemons core | Conditional — persistent stores + entity summarizer partially cover | **Refine** in P2 — add Run reconstruction query | Medium |
| F-031 | Run Evaluation | Evaluate against criteria | Nemons core | **Essential** | **Keep** (P0) — full evaluation engine + consistency checks | High |
| F-032 | Experience Extraction | Propose reusable Experience | Nemons core | **Essential** | **Keep** (P0) — experience deriver | High |
| F-033 | Experience Validation | Validate before adoption | Nemons core | **Essential** | **Keep** (P0) — governed lifecycle (observed→reviewed→approved) | High |
| F-034 | Experience Reuse | Retrieve applicable Experience | Nemons core | **Essential** | **Keep** (P0) — retriever + memory bridge | High |
| F-035 | Outcome Attribution | Relate outcomes to assets/versions | Nemons core | **Essential** | **Keep** (P1) — failure attribution (ADR-0010) + component attribution (ADR-0012) | High |
| F-036 | Baseline Comparison | Compare agent-only vs Nemons-assisted | Nemons core | **Essential** for validation | **Keep** (P1) — paired evaluator (ADR-0013) | High |
| F-037 | Ablation Testing | Disable components to isolate contributions | Nemons core | Conditional — paired evaluator supports comparison but not systematic ablation | **Defer** to P2 | Medium |
| F-038 | Golden Task Evaluation | Stable benchmark tasks | Nemons core | **Essential** for validation | **Keep** (P1) — GT-01 fixture (Stage C) | High |
| F-039 | Operational Metrics | Measure acceptance, reuse, cost | Nemons core | **Essential** | **Keep** (P1) — run metrics (ADR-0011) | High |
| F-040 | Evolution Proposal Generation | Propose asset changes | Nemons core | **Essential** | **Keep** (P1) — candidate generator + governed evolution | High |
| F-041 | Change Validation | Test candidates before adoption | Nemons core | **Essential** | **Keep** (P1) — offline skill evaluator (ADR-0015) | High |
| F-042 | Approval Workflow | Require explicit approval | Nemons core | **Essential** | **Keep** (P1) — policy-enforced engine (ADR-0011 Stage I) | High |
| F-043 | Controlled Promotion | Promote after gates pass | Nemons core | **Essential** | **Keep** (P1) — candidate store + transition | High |
| F-044 | Rollback & Supersession | Restore/supersede without erasing | Nemons core | **Essential** | **Keep** (P1) — candidate store + conflict resolution | High |
| F-045 | Regression Detection | Detect harm to previously successful tasks | Nemons core | Conditional — offline evaluator + paired evaluator partially cover | **Refine** in P2 | Medium |
| F-046 | Policy Engine | ALLOW/DENY/REQUIRE_APPROVAL | Nemons core | **Essential** | **Keep** (P0) — full policy engine + 5 built-in rules | High |
| F-047 | Approval Management | Record approver, scope, rationale | Nemons core | **Essential** | **Keep** (P1) — DecisionLog + approval policy | High |
| F-048 | Trust & Source Verification | Distinguish imported/generated/reviewed/approved | Nemons core | **Essential** | **Keep** (P0) — provenance lifecycle | High |
| F-049 | Untrusted Content Isolation | Treat imports as adversarial | Nemons core | **Essential** | **Keep** (P0) — hard-deny + quarantine | High |
| F-050 | Least-Privilege Execution | Minimum permissions | Nemons core/Adapter | Conditional — policy can deny; no fine-grained permission scoping | **Defer** to P2 | Medium |
| F-051 | Budget & Stop Controls | Cost, time, repetition limits | Nemons core | Conditional — not implemented | **Defer** to P2 — production readiness gap | Medium |
| F-052 | Failure & Incident Recording | Record failures, violations, corrections | Nemons core | **Essential** | **Keep** (P0) — failure attribution + DecisionLog | High |
| F-053 | Run-Level Verification Loop | Evaluate and decide retry | Nemons core | **Essential for iterative improvement** | **Keep** (P1) — NOT YET IMPLEMENTED, highest priority gap | High |
| F-054 | Cross-Run Learning Loop | Reuse Experience and measure effect | Nemons core | **Essential** | **Keep** (P1) — implemented via Experience chain | High |
| F-055 | Loop Stop Conditions | Stop on success/budget/limits | Nemons core | **Essential for safety** | **Keep** (P1) — NOT YET IMPLEMENTED, paired with F-053 | High |
| F-056 | Typed Lineage Relationships | derived_from, supports, supersedes | Nemons core | Conditional — entity summarizer partially covers | **Refine** in P2 | Medium |
| F-057 | Dependency Invalidation | Re-evaluate when evidence invalidated | Nemons core | Conditional — cross-reference checker detects orphans; no automatic trigger | **Defer** to P3 | Low |
| F-058 | Explicit Context Visibility | Define per-agent access | Nemons core | Optional — premature without multi-agent | **Defer** to P3 | Low |
| F-059 | CLI / Developer Interface | Developer interface for inspection | Nemons core | **Essential for adoption** | **Keep** (P1) — NOT YET IMPLEMENTED | High |
| F-060 | Run Inspection | Inspect context, evidence, evaluation | Nemons core | **Essential for debugging** | **Keep** (P1) — entity summarizer partially covers | High |
| F-061 | Asset Inspection | Inspect versions, provenance, approval | Nemons core | **Essential for governance** | **Keep** (P1) — entity summarizer partially covers | High |
| F-062 | Configuration & Provider Management | Configure adapters, policies | Nemons core | Conditional | **Defer** to P2 | Medium |
| F-063 | Import / Export | Transfer assets with metadata | Nemons core | Optional | **Defer** to P3 | Low |
| F-064 | Diagnostics & Health Checks | Detect failures, missing data | Nemons core | **Essential for operations** | **Keep** (P1) — healthCheck + cross-reference checker | High |

---

## Deliverable 3 — Duplication and Boundary Analysis

### Confirmed Overlaps

1. **F-010 (Tool Registry) overlaps F-006 (Skill) + F-017 (Adapter Registry):** Skills carry `requiredCapabilities`; the adapter advertises capabilities via `getCapabilities()`. A standalone Tool registry duplicates this. **Correction: merge F-010 into F-006 + F-017.**

2. **F-009 (Subagent Composition) overlaps F-013 (Context Assembly) + F-014 (Context Pack):** The Context Pack Builder already assembles Persona + Skills + Knowledge + Memory into a Context Pack. F-009's "Subagent = Persona + Skills + Knowledge + Memory + Context Pack + Task + Policies + Constraints" is the same composition. **Correction: F-009 is the conceptual formula; F-013/F-014 is the implementation. Keep F-009 as documentation, not as a separate component.**

3. **F-056 (Typed Lineage) overlaps F-028 (Provenance) + F-029 (Audit History):** Provenance tracks origin; the review trail tracks transitions; the entity summarizer aggregates references. F-056's "derived_from, supports, supersedes" are already represented as `provenance.derivedFrom`, `ContextPackAssetRef.selectionReason`, and `candidate.supersedesCandidateId`. **Correction: F-056 is a query view over existing data, not a new data model.**

### Boundary Violations

4. **F-023 (Environment Integration) risks boundary violation:** remote environment integration (sandboxes, containers) is the Harness's responsibility. The LocalExecutionAdapter runs local commands within the adapter boundary, which is acceptable. Remote/isolated environments should remain in the Harness. **Correction: F-023's scope is limited to "what the adapter can reasonably expose" — do not build a sandbox in Nemons.**

5. **F-020 (Semantic Loss Detection) risks overreach:** detecting semantic meaning loss across agents requires NLU capabilities that belong in the model or an external service. Deterministic checks (hash comparison, schema validation) are in Nemons' scope; semantic analysis is not. **Correction: F-020 is P3/experimental; deterministic checks only.**

### Premature Abstractions

6. **F-009 (Subagent Composition) is premature:** without multiple real adapters and multi-agent execution, a Subagent assembler has no concrete use case. The Context Pack Builder already serves the single-agent case. **Correction: defer F-009 to P2.**

7. **F-057 (Dependency Invalidation) is premature:** automatic re-evaluation triggers require a reactive/event system that doesn't exist. The cross-reference checker provides manual detection. **Correction: defer F-057 to P3.**

---

## Deliverable 4 — Dependency Model

### Foundational Features (P0)

| Feature | Depends On | Required By |
|---------|-----------|-------------|
| F-003 (Run Lifecycle) | — | F-004, F-021, F-025, F-031 |
| F-005 (Persona) | — | F-009, F-013, F-024 |
| F-006 (Skill) | — | F-013, F-040 |
| F-007 (Knowledge) | — | F-013 |
| F-008 (Memory) | — | F-013, F-034 |
| F-011 (Versioning) | F-005, F-006, F-007 | F-040, F-044 |
| F-012 (Applicability) | F-005, F-006, F-007, F-008 | F-013 |
| F-013 (Context Assembly) | F-012 | F-014 |
| F-014 (Context Pack) | F-013 | F-021 |
| F-017 (Adapter Registry) | — | F-018, F-021 |
| F-021 (Execution) | F-014, F-017 | F-022, F-025 |
| F-025 (Trace) | F-021 | F-026 |
| F-026 (Evidence) | F-003, F-025 | F-027, F-031 |
| F-028 (Provenance) | — | F-048 |
| F-031 (Evaluation) | F-026 | F-032 |
| F-046 (Policy Engine) | — | F-024, F-042 |

### Value Validation Features (P1)

| Feature | Depends On |
|---------|-----------|
| F-004 (Cross-Run Continuity) | F-003, F-034 |
| F-032 (Experience Extraction) | F-031 |
| F-033 (Experience Validation) | F-032, F-046 |
| F-034 (Experience Reuse) | F-033, F-013 |
| F-035 (Attribution) | F-026, F-031 |
| F-036 (Baseline Comparison) | F-003, F-039 |
| F-038 (Golden Task) | F-003, F-021, F-026 |
| F-039 (Metrics) | F-003 |
| F-040 (Evolution Proposal) | F-032 |
| F-041 (Change Validation) | F-040 |
| F-042 (Approval Workflow) | F-046 |
| F-043 (Promotion) | F-042, F-011 |
| F-044 (Rollback) | F-011 |
| F-053 (Verification Loop) | F-031 — **NOT IMPLEMENTED** |
| F-054 (Learning Loop) | F-034, F-053 |
| F-055 (Stop Conditions) | F-053 — **NOT IMPLEMENTED** |
| F-059 (CLI) | F-060, F-061 |
| F-060 (Run Inspection) | F-003, F-025, F-026 |
| F-061 (Asset Inspection) | F-005, F-006, F-028 |
| F-064 (Health Checks) | F-017, persistent stores |

---

## Deliverable 5 — Operational Learning and Evaluation Design

### Recommended Learning Pipeline

```
1. Run executes (F-003, F-021, F-022)
2. Trace + Evidence captured (F-025, F-026)
3. Evaluation: verified_succeeded? (F-031)
   - Evidence consistency check (ADR-0007)
   - Temporal consistency check (ADR-0008)
4. If verified_succeeded:
   a. Experience extracted (F-032)
   b. Experience starts as 'observed' (NOT approved)
   c. Governed promotion: observed → reviewed → approved (F-033, F-042, F-043)
5. If failed:
   a. Failure attribution: model/harness/skill/knowledge/tool/policy/environment/unknown (ADR-0010)
   b. Evidence-to-component attribution: which Skill/Knowledge? (ADR-0012)
   c. Offline skill evaluation on historical data (ADR-0015)
   d. Candidate generation from approved Experience (F-040)
   e. Candidate validation on held-out data (F-041)
   f. Governed adoption: propose → review → approve (F-042, F-043)
6. In a later Run:
   a. Approved Experience retrieved (F-034)
   b. Included in Context Pack (F-013, F-014)
   c. Run executes with the Experience
   d. Outcome measured: did reuse help? (F-036, F-039)
7. Regression check: did the new version harm previously successful tasks? (F-045)
```

### Key Distinctions Enforced

| Distinction | How Enforced |
|-------------|-------------|
| Observation vs inference | Evidence `verified` flag; only verified counts toward Evaluation |
| Evidence vs claims | `claimed_succeeded_unverified` ≠ `verified_succeeded` |
| Correlation vs causation | Failure attribution is per-category, not causal claim |
| Candidate vs approved | Lifecycle: observed → reviewed → approved (never skipped) |
| Generation vs adoption | Candidate generation ≠ adoption; governed review required |
| Temporary context vs durable Memory | Context Pack is Run-specific; Memory is cross-Run with lifecycle |
| Model vs Skill failure | FailureAttributionCategory distinguishes (ADR-0010) |

### Evaluation Baselines

1. **Coding Agent alone** — Run with empty Context Pack (no Persona, no Skills, no Memory).
2. **Agent + repository instructions** — Run with AGENTS.md or equivalent, but no Nemons orchestration.
3. **Agent + shared Memory** — Run with persistent Memory but no Experience chain or governed evolution.
4. **Agent + Nemons full** — Run with Context Pack, Experience reuse, governed evolution.

### Metrics (from ADR-0011 + ADR-0013)

- Task correctness (acceptance criteria met?)
- Cost (tokens, USD)
- Latency (ms)
- Tool calls (count)
- Steps (count)
- Run-to-run variance (13% noise band)
- Experience reuse rate
- Regression rate

---

## Deliverable 6 — Prioritized Roadmap

### P0 — Minimum Architectural Foundation (IMPLEMENTED)

**Exit criterion:** A single Run can execute, produce Evidence, be Evaluated, and produce an Experience.

| IDs | Status |
|-----|--------|
| F-003, F-005, F-006, F-007, F-008, F-011, F-012, F-013, F-014, F-016, F-017, F-018, F-021, F-022, F-024, F-025, F-026, F-027, F-028, F-031, F-046, F-048, F-049, F-052 | ✅ Implemented |

### P1 — Core Value Validation

**Exit criterion:** Nemons demonstrates measurable cross-Run improvement over baseline.

| IDs | Status |
|-----|--------|
| F-004, F-032, F-033, F-034, F-035, F-036, F-038, F-039, F-040, F-041, F-042, F-043, F-044, F-047, F-054, F-059, F-060, F-061, F-064 | ✅ Most implemented; F-059 (CLI) is the gap |
| **F-053, F-055** | ❌ **NOT IMPLEMENTED — highest priority** |

### P2 — Operational Expansion

**Exit criterion:** Production-ready with multi-project support and budget controls.

| IDs | Status |
|-----|--------|
| F-001, F-002, F-009, F-015, F-019, F-023 (remote), F-030, F-037, F-045, F-050, F-051, F-056, F-062 | Not yet implemented |

### P3 — Advanced Experiments

| IDs | Status |
|-----|--------|
| F-020, F-057, F-058, F-063 | Not implemented; require evidence of need |

### Remove / Merge

| IDs | Action |
|-----|--------|
| F-010 | **Merge** into F-006 (Skill) + F-017 (Adapter) — no standalone Tool registry |
| F-009 | **Merge** into F-013/F-014 — Context Pack Builder is the implementation |

---

## Deliverable 7 — Minimum Defensible Nemons

### User-Visible Workflow

1. Developer defines a Persona + Skill + Knowledge for a task type.
2. Developer creates a Run with a task description.
3. Nemons assembles a Context Pack from approved assets.
4. The adapter invokes the Coding Agent with the Context Pack.
5. The agent executes; the adapter captures events and outputs.
6. Nemons collects Evidence (test results, git diff, verification).
7. Nemons evaluates the Run (verified_succeeded?).
8. If verified: Nemons extracts an Experience (starts as `observed`).
9. Developer reviews the Experience; if approved, it becomes `approved`.
10. In a later Run on a similar task, Nemons retrieves the approved Experience and includes it in the Context Pack.
11. Nemons measures whether the Run with Experience outperforms the baseline.

### Essential Entities

- Run (with FailureAttribution, RunMetrics)
- Evidence (with AttributedComponent)
- Evaluation (with consistency + temporal checks)
- Experience (with governed lifecycle)
- Candidate (with version chain + conflict detection)
- ContextPack (with resource constraints)
- Persona, Skill, Knowledge, Memory (with provenance + lifecycle)

### Minimum Adapter Capabilities

- `invoke()` — single-shot execution
- `getCapabilities()` — advertise available tools
- `supportsActionInterception?` — optional (ADR-0016)
- Adapter events — invocation.start, invocation.end, test.run, git.diff

### What Happens When...

- **Evidence missing:** `markSucceeded` throws `InsufficientEvidenceError`; Run stays `in_progress`.
- **Adapter can't provide events:** Evidence is limited to `text_assertion` (insufficient for verified_succeeded).
- **Run interrupted:** `markAborted` transitions to terminal `aborted`.
- **Candidate fails regression:** Offline evaluator reports; candidate stays `proposed` (not promoted).

### Explicitly Out of Scope (MVP)

- F-001/F-002 (Project/Task management)
- F-019/F-020 (Per-agent rendering, semantic loss)
- F-037 (Systematic ablation)
- F-050/F-051 (Least-privilege, budget controls)
- F-057/F-058 (Dependency invalidation, context visibility)
- F-063 (Import/Export)
- LLM-based probabilistic verification
- Multi-agent orchestration

---

## Deliverable 8 — Decisions Required from the Project Owner

### Decision 1: Implement F-053/F-055 (Verification Loop + Stop Conditions)?

**Question:** Should Nemons implement a Run-level retry loop that evaluates a Run and decides whether to retry with a modified Context Pack?

**Options:**
- A) Implement now (P1) — enables iterative improvement demonstration.
- B) Defer to P2 — single-shot evaluation is sufficient for MVP.

**Trade-offs:** A enables the most compelling demonstration of cross-Run learning but adds a control loop. B is simpler but limits the value proposition to single-shot learning.

**Recommendation:** **A — implement now.** Without a retry loop, Nemons can learn but cannot *act* on what it learned within the same task. This is the difference between "I recorded what happened" and "I tried again and did better."

**Evidence that would change this:** If the baseline comparison (F-036) shows that single-shot Experience reuse already provides measurable improvement, the retry loop could be deferred.

### Decision 2: Implement F-059 (CLI) before or after F-053?

**Question:** Should the developer CLI be built before the retry loop?

**Options:**
- A) CLI first — developers need to inspect Runs/Evidence/Experience.
- B) Retry loop first — the value proposition is more compelling.

**Recommendation:** **B — retry loop first.** The CLI is essential for adoption but the retry loop is essential for the value proposition. The entity summarizer already provides programmatic inspection.

### Decision 3: Should F-002 (Task Management) add acceptance criteria to Run inputs?

**Question:** Should `Run.inputs` gain an optional `acceptanceCriteria` field?

**Options:**
- A) Yes — enables automated evaluation against task-specific criteria.
- B) No — Evaluation criteria are defined separately and are more flexible.

**Recommendation:** **A — yes.** Acceptance criteria on the Run input would allow the Evaluation engine to check against task-specific requirements, not just evidence-kind-based criteria.

**Evidence that would change this:** If the current Evaluation criteria mechanism proves sufficient in practice.
