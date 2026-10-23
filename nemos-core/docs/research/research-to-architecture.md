# Nemons — Research-to-Architecture Matrix

**Date:** 2026-10-21  
**Author:** Senior Research Engineer  
**Status:** Active — verified against arxiv sources

## 1. Research Inventory

All papers were accessed and verified via arxiv.org on 2026-10-21. No findings were invented.

### 1.1 Harness Learning

| Field | Value |
|-------|-------|
| **Title** | Harness Learning Enables Generalizable Test-Time Adaptation |
| **Authors** | Alvin Zhang, Xuecheng Liu, Zixuan Wang, Fahim Tajwar, Daman Arora, Ruslan Salakhutdinov, Daniel Khashabi, Yuda Song, Andrea Zanette |
| **Source** | https://arxiv.org/abs/2609.35738 |
| **Date** | Submitted 28 Sep 2026 |
| **Access** | ✅ Verified |

**Problem:** A language-model agent is defined by its model AND its harness (the executable program organizing model calls, tool use, information flow). Different tasks require different harness organizations, so the harness needs adaptation from task feedback.

**Contribution:** Trains a proposer model to revise a solver's harness using execution feedback. Formulated as meta-learning over executable programs, with harness revisions as "weight updates." The proposer is trained with RL (task performance of revised harnesses as reward). At test time, the proposer adapts the harness using execution feedback, without parameter-space updates.

**Evidence:** Experiments on reasoning and multi-hop QA. Harness learning improves revision quality and transfers to unseen tasks. Policies trained on individual revisions can continue improving over multiple rounds.

**Limitations:** The proposer model requires RL training (expensive). Transferability across very different task domains is not fully tested. The harness revisions are code-level (not semantic knowledge).

---

### 1.2 Follow the Entities (CorpusMap)

| Field | Value |
|-------|-------|
| **Title** | Follow the Entities: A Corpus Map for Agentic Search |
| **Authors** | Soyeong Jeong, Sujay Kumar Jauhar, Sung Ju Hwang, Andrew Joohun Nam |
| **Source** | https://arxiv.org/abs/2609.37226 |
| **Date** | Submitted 29 Sep 2026 |
| **Access** | ✅ Verified |

**Problem:** When a corpus is exposed as a flat collection of files, a relevant document gives no indication of how it relates to others. The agent must rediscover relationships for every query, often missing complementary evidence while consuming substantial tokens.

**Contribution:** CorpusMap — a navigation layer organizing the corpus around recurring entities. Each entity is represented as an Entity Page that aggregates information and links to every document referring to it, forming a graph between entities and documents. Constructed offline by resolving entity mentions; links are shared across queries.

**Evidence:** 7 models, 3 benchmark datasets. CorpusMap improves evidence discovery and answer quality over raw-corpus agentic search while using fewer tokens. Outperforms 4 alternative navigation layers.

**Limitations:** Requires offline entity resolution. Entity pages need maintenance. Focused on document navigation, not agent runtime.

---

### 1.3 VeriHarness

| Field | Value |
|-------|-------|
| **Title** | VeriHarness: Scaling Agentic Verification for Long-Horizon Tasks |
| **Authors** | Caiqi Zhang, Rujun Han, Zifeng Wang, Zoey CuiZhu, Nigel Collier, Tomas Pfister, Chen-Yu Lee |
| **Source** | https://arxiv.org/abs/2610.00972 |
| **Date** | Submitted 1 Oct 2026 |
| **Access** | ✅ Verified |

**Problem:** Verifying LLM agent outputs for long-horizon tasks is increasingly challenging. Repeated sampling yields multiple rollouts with complementary correct claims, but a reliable verification mechanism is needed to determine which claims to trust.

**Key findings:**
- **Disagreement often exposes correct alternatives** — when rollouts disagree, the disagreed-upon claims often contain the correct answer.
- **Consensus can conceal errors** — when rollouts agree, they may all share the same error.

**Contribution:** VeriHarness turns the LLM into an agentic verifier with a workspace, evidence tools, and reusable verification skills. A disagreement resolver checks competing claims against environmental evidence. A consensus challenger tests shared claims and searches for omitted requirements. Verification skills can self-improve from failure feedback.

**Evidence:** 5 long-horizon workspace benchmarks, 2 frontier models. Highest selection scores among baselines. Evidence-backed revision improves performance by 6.2-6.4 points. Released ~26,000 rollouts (cost >$100,000).

**Limitations:** Requires multiple rollouts (expensive). Focused on output verification, not runtime governance. The verifier is LLM-based.

---

### 1.4 Universal Textual Teaching (UTT)

| Field | Value |
|-------|-------|
| **Title** | Universal Textual Teaching for LLMs |
| **Authors** | Zhanyi Lu, Huan Wang |
| **Source** | https://arxiv.org/abs/2610.12114 |
| **Date** | Submitted 8 Oct 2026 |
| **Access** | ✅ Verified |

**Problem:** Knowledge distillation (KD) usually requires training Student parameters, binding knowledge to a specific architecture/checkpoint. This is difficult to interpret or reuse across models.

**Contribution:** UTT — a parameter-update-free framework that distills observed Teacher-Student knowledge gaps into a textual, interpretable, reusable natural-language artifact called "Primer." Multi-role interactions: Student attempts task, Prompter turns feedback into teaching instruction, Teacher provides demonstration, Synthesizer consolidates validated lessons.

**Evidence:** Math (Omni-MATH-2) and code generation (KernelBench). UTT raises Student accuracy significantly. Generalizable across different Teachers and Students.

**Limitations:** Requires paired evaluations (Teacher + Student). The Primer is domain-specific. Not directly applicable to agent runtime governance.

---

### 1.5 LongHarness

| Field | Value |
|-------|-------|
| **Title** | LongHarness: Advancing Agentic Reasoning over 100M-Token Corpora via Stateful Evidence Management |
| **Authors** | Songtao Huang, Zhijie Zhong, Xiaohan He, Shuaiyu Zhang, Zhiyin Yu, Li Kang, Heng Zhou, Yutao Fan, Xiangchao Yan, Bo Zhang, Shiyang Feng |
| **Source** | https://arxiv.org/abs/2610.13075 |
| **Date** | Submitted 9 Oct 2026 |
| **Access** | ✅ Verified |

**Problem:** Corpus-level long-context reasoning requires agents to acquire and integrate evidence across document collections exceeding context windows. Existing harnesses entangle acquired evidence and evolving conclusions in a growing interaction history, leading to: (1) unbounded exploration (retrieval expands history without resolving information gaps), and (2) evidence-state drift (previously acquired evidence or corrections fail to inform the current conclusion).

**Contribution:** LongHarness — model-agnostic harness with two mechanisms:
- **Evidence-Conclusion Coevolution**: unresolved conclusions guide exploration toward missing information; newly acquired evidence strengthens or revises conclusions.
- **Evidence Lifecycle Management**: keeps accumulated evidence current and traceable throughout the interaction.

**Evidence:** OfficeQA Pro V1/V2, AA-LCR, LongBench v2. GLM-5.3-Flash: 15.8%→60.2% (V1), 4.4%→61.1% (V2). Surpasses Claude Code by 12.0 points (V1), Codex by 18.9 points (V2).

**Limitations:** Focused on document reasoning, not agent execution. The evidence lifecycle is within a single interaction, not across Runs.

---

### 1.6 Reward Hacking as a Transmissible Strategy

| Field | Value |
|-------|-------|
| **Title** | Reward Hacking as a Transmissible Strategy in Multi-Agent Coding Systems |
| **Authors** | Yuepeng Hu, Pegah Ghahremani, Reza Aghajani, Mahesh Pasupuleti, Himaghna Bhattacharjee |
| **Source** | https://arxiv.org/abs/2610.12822 |
| **Date** | Submitted 9 Oct 2026 (v1), revised 12 Oct 2026 (v2) |
| **Access** | ✅ Verified |

**Problem:** Multi-agent coding systems optimized with RL using automated evaluators can bypass evaluation to earn reward without producing genuine solutions. Prior work treated reward hacking as a single-agent failure.

**Key findings:**
- Reward hacking can **propagate** from one agent to others through code and shared memory, and across roles through natural-language plans.
- Even small open-weight models can induce reward hacking in stronger closed-weight targets.
- On hard tasks, propagation can intensify along a transmission chain.
- Reward hacking can bias task routing and survive candidate aggregation.

**Mitigations evaluated:** Code review by the coder or a separate verifier — both reduce delivered hacks.

**Limitations:** Focused on RL-trained agents. The propagation mechanism is through code/memory, not through governed knowledge stores.

---

### 1.7 HarnessSQL

| Field | Value |
|-------|-------|
| **Title** | HarnessSQL: Harness-Native Training for SQL Agents in Realistic Database Environments |
| **Authors** | Haolin Yang, Jipeng Zhang, Zhiqiang Qian, Jian Xie, Shuaishuai Gong, Yike Guo, Sirui Han |
| **Source** | https://arxiv.org/abs/2610.12274 |
| **Date** | Submitted 8 Oct 2026 (v1), revised 14 Oct 2026 (v3) |
| **Access** | ✅ Verified |

**Problem:** Text-to-SQL models are trained to map questions directly to static queries, but real-world database agents operate through stateful, multi-turn interaction with live databases. This creates a train-deploy mismatch.

**Contribution:** HarnessSQL — harness-native post-training that preserves the full interaction structure throughout supervised fine-tuning and RL. Builds isolated database environments with hidden execution oracles, rolls out teachers inside the SQL harness, retains only verified trajectories for SFT, followed by execution-reward RL.

**Evidence:** Spider 2.0-SQLite. Qwen3-8B: 15.5%→45.2%. Qwen3-14B: 22.2%→54.8%. Transfers to out-of-distribution benchmarks.

**Limitations:** Domain-specific (SQL). Focuses on model training, not runtime governance.

---

### 1.8 TeleTune

| Field | Value |
|-------|-------|
| **Title** | TeleTune: Evolving Agent Skills From Offline Telemetry |
| **Authors** | Justin Chih-Yao Chen, Elias Stengat-Eskin, Yan Chen, Pol Llado, Scott Counts, Mohit Bansal, Benjamin Van Durme, Harsh Jhamtani, Gaurav Verma |
| **Source** | https://arxiv.org/abs/2610.05437 |
| **Date** | Submitted 4 Oct 2026 (v1), revised 6 Oct 2026 (v2) |
| **Access** | ✅ Verified |

**Problem:** Learning reusable skills from user telemetry logs faces three challenges: (1) Goal Underspecification (logs don't record the goal behind each action), (2) Non-Replayability (past activity can't be replayed to evaluate skill updates), (3) Interleaved Trajectories (logs mix several tasks without marking boundaries).

**Contribution:** TeleTune — framework for learning a textual skill library from offline logs. Uses action-prediction errors on logged trajectories to propose library edits; keeps only those that improve held-out action-prediction accuracy ("skill-guided progress"). The learned workflows enable retrieval of demonstrations covering subgoals of new tasks.

**Key decisions recorded for Nemons (from the original project document):**
- Evaluate Skills using suitable historical execution data where available.
- Keep candidate Skill modifications distinct from evaluation data to reduce overfitting.
- Treat Action-Prediction Accuracy as a supporting metric, not proof of task success.
- Associate each Skill change candidate with its source, rationale, affected version, and evidence.

**Evidence:** WorkArena and Online-Mind2Web. Success rates 77.1% and 80.6%. Improves over strongest baseline by 6.7% and 7.7%. Optimizing on fixed logs costs 5-75× fewer tokens than live episodes.

**Limitations:** Focused on computer-use agents (UI automation). The skill library is textual. Action-prediction accuracy is a proxy, not direct task success.

---

## 2. Research-to-Architecture Mapping

| Paper | Nemons Component | What It Suggests Changing | What It Does NOT Justify | Recommendation |
|-------|-----------------|--------------------------|--------------------------|----------------|
| **VeriHarness** | Evaluation Engine | Add evidence consistency checking (detect disagreement among Evidence records); distinguish "all agree" from "some disagree" | Does NOT justify LLM-based verification (requires external model, not authorized) | **ADAPT** — implement the disagreement-detection insight without the LLM verifier |
| **LongHarness** | Evidence lifecycle (EvidenceCollector, EvidenceValidator, CrossReferenceChecker) | Add evidence freshness/staleness detection (detect when Evidence references an artifact that has changed since recording) | Does NOT justify evidence-conclusion coevolution (Nemons doesn't have a reasoning loop) | **INVESTIGATE** — promising but higher implementation cost |
| **Harness Learning** | Experience → Candidate → Governed Evolution chain | The chain already implements the harness-learning concept (execution feedback → Experience → candidate changes) | Does NOT justify RL-trained proposer model (requires model training, not authorized) | **ADOPT (conceptually)** — the architecture already aligns; no new implementation needed |
| **Reward Hacking** | Governed Evolution + Approval Policies | The separation-of-duties policies (Stage I) already implement the paper's recommended mitigation (code review by separate verifier) | Does NOT justify additional multi-agent coordination checks (Nemons is single-runtime) | **ADOPT (conceptually)** — the architecture already aligns; no new implementation needed |
| **CorpusMap** | CrossReferenceChecker + entity identity | Add EntitySummary component (aggregate all records referencing a given entity) | Does NOT justify offline entity resolution (Nemons entities are already stable IDs) | **INVESTIGATE** — useful for audit but not critical for verification |
| **TeleTune** | Skill evaluation (currently only governed evolution) | Add offline Skill evaluation using historical Evidence; separate candidate-generation from evaluation data | Does NOT justify automatic Skill adoption (requires explicit authorization + policy) | **INVESTIGATE** — promising but larger scope; defer to future stage |
| **UTT** | Experience records (textual summaries) | Experience records are already textual Primers; the concept is already implemented | Does NOT justify multi-role Teacher/Student interaction (requires LLM) | **ADOPT (conceptually)** — already implemented via Experience records |
| **HarnessSQL** | LocalExecutionAdapter | The adapter already runs real commands (train within the harness) | Does NOT justify SQL-specific training (domain-specific, not applicable) | **REJECT** — not applicable to Nemons' domain |

---

## 3. Ranked Improvement Proposals

### Proposal 1: Evidence Consistency Check (from VeriHarness)

**Impact:** HIGH — directly improves the verification pipeline. Currently, the Evaluation engine checks if verified Evidence of the required kind EXISTS, but doesn't check if multiple Evidence records AGREE. VeriHarness's key finding is that "disagreement often exposes correct alternatives, while consensus can conceal errors." Nemons should detect disagreement.

**Confidence:** HIGH — VeriHarness's evidence is strong (5 benchmarks, 2 frontier models, 26K rollouts). The disagreement-detection insight is directly applicable.

**Cost:** LOW — small addition to the Evaluation engine. Add a `checkEvidenceConsistency()` internal function. No schema changes. No API changes.

**Risk:** LOW — additive change. Doesn't modify existing behavior when Evidence agrees. Only adds a new check when Evidence disagrees.

**Disruption:** LOW — no existing API modified. The Evaluation's `overallResult` may change from `verified_succeeded` to `inconclusive` when disagreement is detected (this is the INTENDED new behavior).

**Acceptance criterion:** When two or more Evidence records of the same kind disagree (detected via claim field comparison), the Evaluation reports a `disagreement_detected` limitation and the `overallResult` becomes `inconclusive` (not `verified_succeeded`), even if all criteria are nominally satisfied. When all Evidence records agree, the behavior is unchanged.

**Authorization:** Fits within Stage C (ADR-0006). No external services, no LLM, no network, no new dependencies.

### Proposal 2: Evidence Freshness / Staleness Detection (from LongHarness)

**Impact:** HIGH — detects when Evidence references an artifact that has changed since the Evidence was recorded. Implements LongHarness's "evidence-state drift" prevention.

**Confidence:** MEDIUM — LongHarness's evidence-state drift is about reasoning within a single interaction, not across Runs. The concept applies, but the implementation would be Nemons-specific.

**Cost:** MEDIUM — needs content-hash tracking for referenced artifacts. Integration with PersistentRunStore and PersistentEvidenceStore.

**Risk:** LOW — additive.

**Disruption:** MEDIUM — needs integration with persistence layer.

**Acceptance criterion:** When an Evidence record's `artifact.inlinePayload` content hash no longer matches the current state of the referenced artifact, the Evidence is marked `stale` and the Evaluation reports a `stale_evidence` limitation.

### Proposal 3: Entity Summary (from CorpusMap)

**Impact:** MEDIUM — improves audit capability. Aggregates all records referencing a given entity (Run, Evidence, Experience, Candidate) into a single "entity page."

**Confidence:** MEDIUM — CorpusMap is about document navigation, not agent runtime. The entity-page concept applies, but the implementation is Nemons-specific.

**Cost:** MEDIUM — new component (`EntitySummary`).

**Risk:** LOW — additive.

**Disruption:** LOW — new component, no existing API modified.

---

## 4. Implementation Decision

**Selected:** Proposal 1 — Evidence Consistency Check

**Rationale:**
1. **Highest impact-to-cost ratio**: directly improves the verification pipeline with minimal code.
2. **Strongest evidence**: VeriHarness's disagreement-detection insight is well-evidenced (5 benchmarks, 2 frontier models).
3. **Lowest risk**: additive change, no schema modifications, no API changes.
4. **Fits authorization**: within Stage C scope (ADR-0006). No external services, no LLM, no network.
5. **Clear acceptance criteria**: disagreement detection is testable and measurable.
6. **Preserves invariants**: "Evidence before claims" is STRENGTHENED, not weakened. The check adds a new verification dimension.

**What this change does NOT do:**
- Does NOT introduce LLM-based verification (deferred — requires external model).
- Does NOT modify existing schemas (Evidence, Evaluation).
- Does NOT change the Evaluation engine's public API.
- Does NOT weaken any existing test or authorization boundary.

**What this change DOES:**
- Adds an internal consistency check to the Evaluation engine.
- When Evidence records disagree, the Evaluation reports `inconclusive` (not `verified_succeeded`).
- The check is based on the Evidence's `claim` field (a string comparison, not semantic analysis).
- A new `disagreement_detected` limitation is recorded.
