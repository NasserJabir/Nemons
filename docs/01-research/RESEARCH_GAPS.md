# Research Gaps

This is an initial register of unresolved evidence and product questions. October 2026 paper reviews are preliminary; verify full papers and experimental details before treating claims as implementation evidence.

| Gap | Why it matters | Evidence / experiment needed | Status |
|---|---|---|---|
| Exact primary-source metadata for recent research | Avoid basing decisions on incomplete citations or summaries | Verify authors, title, version/date, methods, baselines, limitations | Open |
| Cross-harness Context portability | A common format may lose harness-specific meaning | Same Golden Tasks across at least two distinct Coding Agents/Harnesses | Open |
| Memory admission thresholds by category | One threshold may over-retain inference or under-retain decisions | Labeled examples, held-out review, risk-tiered evaluation | Open |
| Staleness policy by information type | Facts, preferences, and execution observations age differently | Time-based and source-change-triggered validation tests | Open |
| Retrieval overhead vs benefit | More retrieval can increase noise and latency | Paired tasks with/without retrieval; quality, latency, and cost metrics | Open |
| Skill change attribution | Failures may arise from model, Harness, Tool, policy, environment, or knowledge rather than the Skill | Repeated traces, controlled fault injection, explicit attribution labels | Open |
| Offline Skill refinement from traces | Failure clusters may suggest edits but can be noisy or misleading | Provenance-linked candidates, held-out regression tasks, human adoption review | Candidate experiment |
| Temporary editable Context Pack | Context curation may help, but may silently remove constraints | Compare fixed vs curated packs; check required-constraint retention and task outcomes | Candidate experiment |
| Run-to-run noise and Harness cost | A single run can overstate gains and hide token/cost differences | Paired repeated runs with pinned model/Harness versions and cost accounting | Priority |
| Action-verification feasibility at Adapter boundary | Some Coding Agents may not expose interceptable actions; verifier can add cost or false blocks | Adapter capability survey and bounded tests of false positives/negatives, latency, cost | Deferred experiment |
| User-simulator fidelity | Simulated users may not represent real ambiguity or behavior | Compare simulated scenarios with human-authored/observed scenarios | Deferred; validate need first |
| CMM-style learned memory relevance | Neural memory architecture may not solve Nemons' actual cross-session continuity problem | Demonstrate a measurable failure of current governed file-based Memory first | Not planned |
| Shared context under parallel Subagents | Concurrent updates may conflict or duplicate work | Parallel tasks with versioned updates, conflict cases, and deterministic resolution | Open |
| Evidence sufficiency for adoption | No universal threshold is established | Risk-tiered review, independent acceptance criteria, regression outcomes | Open |
| Governance authority and separation of duties | Approval policy must be explicit and auditable | Decision record defining roles and change classes | Open |

## Guardrails for interpreting results

- A successful test run is not proof that the task result is correct.
- An LLM judge is not a source of truth; judge-based scoring needs independent criteria and calibration.
- A single failed trajectory is not sufficient evidence to modify a Skill.
- Token savings reported by a paper do not automatically imply lower wall-clock time, total compute, or total cost.
- Research-derived proposals remain candidates until evaluated against Nemons' own Golden Tasks and governance requirements.
- No experiment may override deterministic hard-deny rules, authorization boundaries, or required provenance/evidence.

No numeric thresholds should be treated as accepted until supported by experiments and a decision record.
