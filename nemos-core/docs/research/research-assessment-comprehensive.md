# Nemons — Research Assessment and Gap Analysis (Comprehensive)

**Date:** 2026-10-21  
**Author:** Senior Research Engineer  
**Baseline:** HEAD = `ea85e9be`, 1045 tests, 64 source files, 9 ADRs

## 1. Papers Studied

### Previously Studied (Task ID 11-13)

| Paper | Source | Disposition |
|-------|--------|-------------|
| Harness Learning | 2609.35738 | ADOPT PRINCIPLE (already implemented via Experience chain) |
| CorpusMap | 2609.37226 | ADOPT PRINCIPLE (EntitySummarizer implemented, ADR-0009) |
| VeriHarness | 2610.00972 | ADAPT (Evidence Consistency Check implemented, ADR-0007) |
| LongHarness | 2610.13075 | ADAPT (Evidence Temporal Consistency implemented, ADR-0008) |
| TeleTune | 2610.05437 | INVESTIGATE (offline skill evaluation — future) |
| Reward Hacking | 2610.12822 | ADOPT PRINCIPLE (separation of duties already implemented) |
| UTT | 2610.12114 | ADOPT PRINCIPLE (Experience records already textual Primers) |
| HarnessSQL | 2610.12274 | REJECT (domain-specific to SQL) |

### Newly Studied

#### MAST: Why Do Multi-Agent LLM Systems Fail?

| Field | Value |
|-------|-------|
| **Title** | Why Do Multi-Agent LLM Systems Fail? |
| **Authors** | Mert Cemri, Melissa Z. Pan, et al. |
| **Source** | https://arxiv.org/abs/2503.13657 |
| **Date** | 17 Mar 2025 (v1), revised 26 Oct 2025 (v3) |
| **Access** | ✅ Verified |

**Research question:** Why do Multi-Agent LLM Systems (MAS) fail?

**Method:** Analyzed 150 traces with expert human annotators (kappa=0.88). Built MAST-Data: 1600+ annotated traces across 7 MAS frameworks.

**Key findings:** 14 unique failure modes in 3 categories: (i) system design issues, (ii) inter-agent misalignment, (iii) task verification.

**Nemons relevance:** Nemons is single-agent (not MAS), but MAST's taxonomy inspires a **failure attribution** dimension for Runs. When a Run fails, the failure should be attributed to a specific cause: model, harness, skill, knowledge, tool, policy, environment, or unknown. This is critical for offline skill refinement: "a failure is not automatically a Skill failure."

**Disposition:** **ADAPT** — adapt MAST's taxonomy for single-agent scenarios. Implement structured failure attribution.

**Gap:** Nemons' `markFailed(runId, reason)` takes a free-text reason. No structured attribution exists.

---

#### What Does a Harness Buy? Tokens, Mostly

| Field | Value |
|-------|-------|
| **Title** | What Does a Harness Buy? Tokens, Mostly |
| **Authors** | Yangze Liu, Zhongyi Han |
| **Source** | https://arxiv.org/abs/2610.04433 |
| **Date** | 3 Oct 2026 |
| **Access** | ✅ Verified |

**Research question:** How much does the harness itself move the score when the model is held fixed?

**Key findings:**
- Cost per task differs by up to **3x** across harnesses with the same model and tasks.
- Run-to-run variation: swapping harnesses flips as many tasks as rerunning the same harness (**13%** in both cases).
- Performance differences are minimal (within 5 points on 447 tasks).
- Cost is driven by the preamble of system prompts and tool schemas, scaled by the number of steps.

**Nemons relevance:** Nemons' RunOutputs lacks cost/latency/token/tool-call metrics. These are essential for:
- Paired baseline comparisons (measure cost, not just correctness).
- Run-to-run variance measurement.
- Reproducibility (pinned model, harness, skill, and environment versions).

**Disposition:** **ADOPT PRINCIPLE** — add optional cost/latency/token fields to RunOutputs.

**Gap:** RunOutputs has `claimedOutcome`, `claimedSummary`, `artifactRefs`, `traceRef` — but NO cost, latency, token count, or tool call count.

---

#### VERA: Scaling Verifiable Environments for Agentic co-Evolution

| Field | Value |
|-------|-------|
| **Title** | VERA: Scaling Verifiable Environments for Agentic co-Evolution |
| **Authors** | Junqi Liu, Yongyang Pan, et al. |
| **Source** | https://arxiv.org/abs/2610.05923 |
| **Date** | 5 Oct 2026 |
| **Access** | ✅ Verified |

**Research question:** How to build precise, verifiable environments for agentic co-evolution?

**Key findings:** VERA builds environments that are "resumable at any stage and evolve from observable evidence." Alternates between training the model and editing harness skills, with a verifier that gates changes using development-set acceptance criteria.

**Nemons relevance:** Nemons' Evaluation engine evaluates final outcomes but doesn't support stage-level verification or paired evaluation (baseline vs. change). VERA's "gating with acceptance criteria" aligns with Nemons' governed evolution, but VERA's infrastructure (model training, rubric generation) is beyond Nemons' scope.

**Disposition:** **DEFER** — paired evaluation is promising but requires more infrastructure than the current authorization allows.

**Gap:** No paired baseline comparison mechanism exists.

---

#### Category-Conditioned Memory Retention

| Field | Value |
|-------|-------|
| **Title** | When to Remember, When to Abstain: Category-Conditioned Retention for Reliable Agent Memory |
| **Authors** | Olukunle Owolabi, Pulkit Gupta, Fei Wang |
| **Source** | https://arxiv.org/abs/2610.07100 |
| **Date** | 5 Oct 2026 |
| **Access** | ✅ Verified |

**Research question:** Should retention decisions be governed by a confidence bar conditioned on semantic category?

**Key findings:** Only 77.9% of value/belief assertions are supported by their source (vs. 96.2% for other categories). A global threshold can't separate these. Category-conditioned thresholds reduce unsupported retentions by ~36% while preserving 13pp more coverage.

**Nemons relevance:** Nemons' Memory records have `provenance.kind` (observed → approved → deprecated) but no semantic category. The paper suggests retention should vary by category.

**Disposition:** **EXPERIMENT** — add a `category` field to MemoryRecord and condition retention on it. Low cost but not the highest priority.

**Gap:** No category-based retention policy exists.

---

#### Mid-Harness: Scaling Actions Between Model and Harness

| Field | Value |
|-------|-------|
| **Title** | Mid-Harness: Scaling Actions Between Model and Harness for Terminal Agents |
| **Authors** | Minki Kang, Ryo Hachiuma, et al. |
| **Source** | https://arxiv.org/abs/2609.39982 |
| **Date** | 30 Sep 2026 |
| **Access** | ✅ Verified |

**Research question:** Can allocating test-time compute at the model-harness boundary improve action reliability?

**Key findings:** Pre-execution action verification raises Pass@1 from 50% to 68% with 8 sampled actions. A capable verifier can exploit useful alternatives.

**Nemons relevance:** Nemons' Adapter Contract's `invoke()` is a single call. No mechanism to intercept, verify, or block proposed actions before execution. The paper's approach requires action-level interception, which the current adapter boundary doesn't support.

**Disposition:** **DEFER** — the current adapter boundary doesn't support action-level interception. Would require Adapter Contract redesign.

**Gap:** No action interception mechanism exists.

---

#### DeLM: Decentralized Multi-Agent Systems with Shared Context

| Field | Value |
|-------|-------|
| **Title** | Decentralized Multi-Agent Systems with Shared Context |
| **Authors** | Yuzhen Mao, Jerry Gu, et al. |
| **Source** | https://arxiv.org/abs/2606.10662 |
| **Date** | 9 Jun 2026 (v1), revised 4 Oct 2026 (v3) |
| **Access** | ✅ Verified |

**Research question:** How to eliminate bubbles (waiting, redoing work) in multi-agent systems?

**Key findings:** Replaces the main agent with a shared context and task queue. Agents asynchronously claim tasks, publish findings, and build on each other's progress.

**Nemons relevance:** Nemons is single-agent (not multi-agent). DeLM's shared context concept is related to Nemons' Context Pack, but the multi-agent coordination is not applicable.

**Disposition:** **REJECT** — multi-agent coordination is not in Nemons' scope.

---

#### HERMES: Harness Engineering via Modular Executable Dev-Primitives

| Field | Value |
|-------|-------|
| **Title** | Harness Engineering for Software Engineering via Modular Executable Dev-Primitives |
| **Authors** | Haibo Jin, Xinjie Li, et al. |
| **Source** | https://arxiv.org/abs/2610.07832 |
| **Date** | 6 Oct 2026 |
| **Access** | ✅ Verified |

**Research question:** How to address context explosion and semantic drift in long-horizon software engineering tasks?

**Key findings:** Dev-Primitives pair repository artifacts with resident LLMs. HERMES uses dependency-aware dynamic activation and a bug diagnosis mechanism that maps execution evidence back to components.

**Nemons relevance:** HERMES's "evidence-to-component attribution" (mapping execution evidence to the components that must be revised) is relevant to Nemons' offline skill refinement. However, Dev-Primitives (LLM-resident artifacts) require infrastructure Nemons doesn't have.

**Disposition:** **EXPERIMENT** — the evidence-to-component attribution principle is useful, but the Dev-Primitives infrastructure is not applicable.

**Gap:** Evidence records don't attribute to specific components (Skills, Knowledge items).

---

#### Papers Not Individually Fetched (Recorded Limitation)

The following papers from the user's list were not individually fetched in this session due to scope constraints. Their dispositions are based on the user's guidance and prior research context:

| Paper | Disposition | Rationale |
|-------|-------------|-----------|
| CMM (2610.07907) | INSUFFICIENT EVIDENCE | Not fetched; neural memory architecture likely not applicable without evidence of a Nemons-specific gap |
| CLM (2609.37725) | EXPERIMENT | Task-adaptive context management is promising; deferred to Priority 3 |
| CoALA (2309.02427) | ADOPT PRINCIPLE | Conceptual reference; Nemons' architecture already aligns with its memory/action organization |
| Mem0 | REJECT (infrastructure) | Don't adopt infrastructure; comparative reference only |
| SkillRefiner | INVESTIGATE | alphaxiv link may not resolve; offline refinement workflow is Priority 2 |
| Darwin Gödel Machine (2505.22954) | DEFER | Self-improvement safeguards; don't interpret as justification for autonomous governance changes |
| Before They Can Solve | INSUFFICIENT EVIDENCE | alphaxiv link; base model probes not applicable without LLM infrastructure |
| Coco (2610.02376) | ADOPT PRINCIPLE | Typed Tool APIs and normalized execution records — principles already in Nemons' Tool/Evidence contracts |
| MIMESIS (2610.09484) | DEFER | User simulation requires demonstrated evaluation gap |
| AGENTS.md | ADOPT PRINCIPLE | Repository instruction conventions; don't confuse with runtime enforcement |
| Awesome Self-Evolving Agents | Discovery index only | Verify each source independently |

---

## 2. Gap Analysis (Ranked by Priority)

### Priority 1 — Evaluation Reliability

| Gap | Source | Current State | Expected Benefit | Cost | Risk |
|-----|--------|---------------|-----------------|------|------|
| **No failure attribution** | MAST | `markFailed(reason)` — free-text only | Correct failure categorization for offline refinement | LOW | LOW |
| **No cost/latency/token tracking** | What Does a Harness Buy | RunOutputs lacks these fields | Paired evaluation with cost awareness | LOW | LOW |
| No paired evaluation | VERA | Each Run evaluated independently | Baseline vs. change comparison | MEDIUM | LOW |

### Priority 2 — Offline Skill Refinement

| Gap | Source | Current State | Expected Benefit | Cost | Risk |
|-----|--------|---------------|-----------------|------|------|
| No evidence-to-component attribution | HERMES | Evidence has no component attribution | Targeted skill refinement | MEDIUM | LOW |
| No offline skill evaluation | TeleTune | No offline evaluation workflow | Evaluate Skills on historical data | HIGH | MEDIUM |

### Priority 3 — Context Curation

| Gap | Source | Current State | Expected Benefit | Cost | Risk |
|-----|--------|---------------|-----------------|------|------|
| No category-conditioned retention | Category-Conditioned Memory | Retention by provenance kind only | Reduces unsupported retentions | LOW-MEDIUM | LOW |

### Priority 4 — Action Verification

| Gap | Source | Current State | Expected Benefit | Cost | Risk |
|-----|--------|---------------|-----------------|------|------|
| No action interception | Mid-Harness | `invoke()` is a single call | Pre-execution verification | HIGH | MEDIUM |

---

## 3. Selected Improvement: Failure Attribution (from MAST)

**Rationale:**
1. **Highest impact-to-cost ratio**: fills a clear gap with minimal code.
2. **Strong evidence**: MAST analyzed 1600+ traces with kappa=0.88.
3. **Enables Priority 2**: correct failure attribution is a prerequisite for offline skill refinement ("a failure is not automatically a Skill failure").
4. **Low risk**: additive, optional field. Doesn't change existing behavior.
5. **Fits authorization**: within Stage C scope (ADR-0006).

**Implementation:** Add a `FailureAttribution` type to the Run schema, with categories adapted from MAST for single-agent scenarios:
- `model` — the model produced an incorrect/suboptimal output
- `harness` — the adapter/harness misconfigured or failed
- `skill` — the selected Skill was wrong or poorly designed
- `knowledge` — the retrieved knowledge was wrong or incomplete
- `tool` — a tool call failed or returned wrong results
- `policy` — the policy denied or allowed incorrectly
- `environment` — the execution environment failed
- `unknown` — the cause couldn't be determined
