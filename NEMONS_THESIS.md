# Nemons Thesis

## Thesis

Nemons is an Agent Runtime independent of Coding Agents. It manages Context, Personas, Skills, Subagents, Tools, Memory, and Evidence across execution cycles so knowledge and experience remain continuous when work moves between Coding Agents, and prior execution results can become reusable, verifiable, governed operational knowledge.

Nemons is a meta-harness above existing Coding Agent harnesses. It does not replace their internal model loop or execution environment; it coordinates the operational assets and continuity that must survive across agents, sessions, and tasks.

## Problem statement

Coding-agent work often accumulates decisions, task state, reusable procedures, tool constraints, and evidence inside transient conversations or harness-specific conventions. When a task changes session or agent, relevant knowledge may be lost, duplicated, stale, or copied without provenance. Simply storing more text does not solve this: retrieved context can be irrelevant, outdated, untrusted, or mistaken for authorization.

## Central hypothesis

A separate runtime can improve cross-agent continuity and controlled reuse if it:
1. represents operational assets through explicit, versioned contracts;
2. separates durable Memory from task-specific Context;
3. retrieves and curates information according to task needs, source quality, status, and staleness;
4. attaches provenance and evidence to claims and changes;
5. gates adoption separately from generation and evaluation;
6. measures outcomes against repeatable tasks and baselines.

This is a hypothesis to evaluate, not a claim of demonstrated performance.

## Governing principle

**Generation may be free; adoption is always guarded.** Models and automation may propose candidates. They cannot silently promote candidates into trusted knowledge or rewrite governance and security boundaries.

## What would falsify or weaken the thesis?

- A substantially simpler arrangement within existing harnesses provides equal cross-agent continuity and governance at lower cost.
- The added coordination overhead exceeds measurable gains in task quality, reproducibility, or recovery.
- Portable contracts fail to preserve meaning across adapters.
- Provenance and lifecycle controls create more friction than the risk they reduce.
- Evaluation results do not generalize beyond a narrow hand-picked task set.

## Evidence standard

Claims about benefit require reproducible evaluation, explicit baselines, task-level acceptance criteria, and separate reporting of failures and overhead. A passing test alone does not establish task correctness; an LLM judge alone does not establish truth.
