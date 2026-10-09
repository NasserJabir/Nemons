# Product Requirements Document (Initial)

## Product

Nemons — Agent Runtime independent of Coding Agents.

## Problem

Coding-agent work loses continuity across sessions and harnesses, while unverified statements and procedures can be reused without sufficient provenance, freshness checks, or governance.

## Primary users

- Developers and technical teams working across multiple Coding Agents.
- Maintainers who need traceable, reusable procedures and decisions.
- Reviewers responsible for validating asset changes and high-impact actions.

These are initial target groups and should be validated through user/task research.

## Product outcomes

1. Resume work across sessions and compatible harnesses with less repeated discovery.
2. Deliver bounded, task-adaptive Context Packs with explicit source/version/status.
3. Keep Skills, Personas, Memory, and Knowledge versioned and governed.
4. Link execution outcomes and candidate changes to evidence and failure attribution.
5. Evaluate continuity, correctness, overhead, and regression on repeatable tasks.

## MVP hypothesis

The first useful vertical slice should support a bounded task across two sessions, create a portable handoff, reconstruct the required Context Pack, preserve asset/source versions, record verification evidence, and refuse to promote unverified candidate knowledge. The exact adapter and task set must be chosen in a decision record.

## Scope candidates

- Contract schemas and validation.
- Run and handoff state.
- Retrieval and curation from the existing Markdown Source of Truth.
- Category-conditioned memory admission and staleness checks.
- Evidence/provenance linking.
- One or more thin Coding Agent adapters.
- Golden Tasks and paired baselines.

## Out of scope for initial MVP

Training model weights; autonomous governance changes; automatic trusted-memory promotion; broad multi-agent scheduling without an evidenced use case; provider lock-in; unsupported claims of general autonomy.

## Product risks

- Overhead exceeds continuity benefits.
- Context selection introduces stale or irrelevant claims.
- Adapter differences make the portable format lossy.
- Evaluation is biased by task selection or shared data leakage.
- Excessive abstraction delays a measurable end-to-end test.

## Release gate

Do not declare the MVP successful until Golden Tasks, baseline comparisons, failure attribution, overhead metrics, and security/governance negative tests are documented and reproducible.
