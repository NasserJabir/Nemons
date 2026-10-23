# Requirements Register

Status: initial requirements proposal. Priority labels are provisional until validated against the MVP task set.

| ID | Requirement | Priority | Acceptance evidence |
|---|---|---|---|
| NEM-F-001 | The runtime shall represent each Run with a stable ID, task scope, status, and asset-version references. | Must | Schema and lifecycle tests |
| NEM-F-002 | The runtime shall distinguish durable Memory from task-specific Context and derived Context Packs. | Must | Contract and retrieval tests |
| NEM-F-003 | Every admitted Memory candidate shall record category, source/provenance, scope, status, and admission rationale. | Must | Missing-field rejection tests |
| NEM-F-004 | Memory admission shall be category-conditioned and evidence-aware. | Must | Labeled admission test set |
| NEM-F-005 | Accepted records shall support staleness marking and task-sensitive revalidation. | Must | Source-change and retrieval tests |
| NEM-F-006 | Unaccepted candidates shall not be represented to consumers as accepted facts. | Must | Negative retrieval tests |
| NEM-F-007 | Every candidate Skill change shall reference its cause, evidence, target Skill version, and evaluation result. | Must | Change-schema tests |
| NEM-F-008 | Generation, verification/evaluation, and adoption shall be distinct lifecycle steps. | Must | Lifecycle transition tests |
| NEM-F-009 | Hard-deny policy shall not be overridden by Persona, Skill, model output, or prior ordinary approval. | Must | Adversarial policy tests |
| NEM-F-010 | Failure attribution shall allow MODEL, HARNESS, SKILL, KNOWLEDGE, TOOL, POLICY, ENVIRONMENT, and UNKNOWN. | Should | Attribution contract tests |
| NEM-F-011 | A Run shall be handoff-capable without requiring the next session to reuse the same harness session ID. | Must | Two-session continuity task |
| NEM-F-012 | Context selection shall be task-adaptive and record selected source/version references. | Should | Relevance and traceability evaluation |
| NEM-F-013 | Parallel Subagents, if enabled, shall share compact structured updates with provenance and verification state. | Could | Parallel conflict tests |
| NEM-F-014 | Offline Skill evaluation shall be supported when suitable logs and task labels exist. | Should | Held-out trajectory evaluation |
| NEM-NF-001 | Contracts shall be versioned and validated deterministically. | Must | Compatibility and schema tests |
| NEM-NF-002 | The system shall expose measurable overhead: latency, tokens/context size where available, tool calls, and cost where available. | Must | Evaluation report |
| NEM-NF-003 | Missing or unresolved source/version references shall not silently resolve to the latest version. | Must | Integrity tests |

## Security and governance

- **NEM-S-001:** no automatic mutation of governance rules, hard-deny controls, identity, capabilities, approval thresholds, or security boundaries.
- **NEM-S-002:** candidate assets remain quarantined until the required gate.
- **NEM-S-003:** evidence and provenance must be preserved through handoff and transformation.
- **NEM-S-004:** sensitive claims and high-impact actions require risk-appropriate verification and authorization.

## Requirement change control

Each requirement change should state its motivation, source/evidence, affected contracts, compatibility impact, and acceptance test. A research reference alone does not establish priority.
