# Nemons — Architecture Decision Records

This directory documents the architectural decisions governing the Nemons Core.

## Index

| # | Title | Status |
|---|-------|--------|
| 0001 | [TypeScript as the Core Implementation Language](./0001-typescript-as-core-language.md) | Accepted |
| 0002 | [Core Independence from External Runtimes (Strategy C)](./0002-core-independence-strategy-c.md) | Accepted |
| 0003 | [Hard-Deny Security and Default-Deny Baseline](./0003-hard-deny-security.md) | Accepted |
| 0004 | [Evidence Before Claims (Verified Execution)](./0004-evidence-before-claims.md) | Accepted |
| 0005 | [Lifecycle as the Approval Surface (No "Approved" Boolean Field)](./0005-lifecycle-as-approval-surface.md) | Accepted |
| 0006 | [Stage C Authorization (Approved Harness Boundary)](./0006-stage-c-authorization.md) | Accepted |
| 0007 | [Evidence Consistency Check (from VeriHarness research)](./0007-evidence-consistency-check.md) | Accepted |
| 0008 | [Evidence Temporal Consistency Check (from LongHarness research)](./0008-evidence-temporal-consistency.md) | Accepted |
| 0009 | [Entity Summary (from CorpusMap research)](./0009-entity-summary.md) | Accepted |
| 0010 | [Failure Attribution (from MAST research)](./0010-failure-attribution.md) | Accepted |
| 0011 | [Run Metrics (from "What Does a Harness Buy?" research)](./0011-run-metrics.md) | Accepted |
| 0012 | [Evidence-to-Component Attribution (from HERMES research)](./0012-evidence-to-component-attribution.md) | Accepted |
| 0013 | [Paired Baseline Evaluation (from VERA + "What Does a Harness Buy?" research)](./0013-paired-baseline-evaluation.md) | Accepted |
| 0014 | [Category-Conditioned Memory Retention (from Category-Conditioned Memory research)](./0014-category-conditioned-memory-retention.md) | Accepted |
| 0015 | [Offline Skill Evaluation (from TeleTune research)](./0015-offline-skill-evaluation.md) | Accepted |
| 0016 | [Action Interception (from Mid-Harness research)](./0016-action-interception.md) | Accepted |

## Decision Process

Decisions are accepted by the project owner. A new ADR may be added when:
1. A new architectural question arises that is not covered by an existing ADR.
2. An existing ADR is being challenged with new evidence.

To challenge an existing ADR, present:
- The concrete new evidence motivating the challenge.
- A clear reason the existing decision is no longer appropriate.
- The proposed replacement and its consequences.

Do NOT reopen an accepted decision without meeting both criteria.
