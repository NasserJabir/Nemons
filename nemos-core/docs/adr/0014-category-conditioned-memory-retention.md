# ADR-0014 — Category-Conditioned Memory Retention (from Category-Conditioned Memory research)

**Status:** Accepted  
**Date:** 2026-10-21  
**Decision Owner:** Senior Research Engineer  
**Research Source:** When to Remember, When to Abstain: Category-Conditioned Retention for Reliable Agent Memory (https://arxiv.org/abs/2610.07100)

## Context

The Category-Conditioned Memory Retention paper (Owolabi et al., Oct 2026) studied whether memory retention decisions should be governed by a confidence threshold conditioned on the **semantic category** of the assertion, rather than a single global threshold.

**Key findings:**
- Only **77.9%** of value/belief assertions are supported by their source (vs. **96.2%** for other categories).
- A global confidence threshold **cannot** effectively separate these categories.
- Category-conditioned thresholds **reduce unsupported retentions from 6.2% to 4.0%** (≈36% relative reduction) while preserving **13 percentage points more coverage** than a global threshold.

**Current gap:** Nemons' Memory records have `provenance.kind` (observed → approved → deprecated) but no semantic category field. The retention decision is based purely on the lifecycle status, not on what kind of information is being retained. This means:
- A factual observation and a speculative belief are treated identically for retention.
- The existing `MemoryRecordKind` (experience/fact/decision/observation) is an operational classification, not a semantic category for retention policy.

The paper's insight: "an assertion weakly supported by its source can be stored and later reused as established fact." Nemons should distinguish between different semantic categories to prevent weakly-supported beliefs from being retained as if they were well-evidenced facts.

## Decision

Add a **`MemoryCategory`** field to the Memory schema and a **`CategoryRetentionPolicy`** that conditions retention decisions on the category.

### MemoryCategory

| Category | Description | Default Retention |
|----------|-------------|-------------------|
| `fact` | Verifiable factual information (e.g., "the test runner uses vitest") | Lenient — facts are usually well-evidenced |
| `procedure` | How-to knowledge (e.g., "rebuild before running tests") | Lenient — procedures are typically observed |
| `decision` | An explicit decision record (e.g., "we chose vitest over jest") | Lenient — decisions are authored |
| `value` | Values, beliefs, preferences (e.g., "vitest is better than jest") | **Strict** — values/beliefs are often unsupported (77.9% per the paper) |
| `prediction` | Predictions or hypotheses (e.g., "this approach will scale") | **Strict** — predictions are unverified by definition |
| `uncategorized` | No category specified (backward-compatible default) | Moderate — use the existing lifecycle as before |

### CategoryRetentionPolicy

The `CategoryRetentionPolicy` interface defines per-category retention rules:
- `strictCategories`: categories that require stronger evidence before retention (default: `["value", "prediction"]`).
- `lenientCategories`: categories that can be retained with standard evidence (default: `["fact", "procedure", "decision"]`).
- `strictProvenanceMinimum`: the minimum `ProvenanceKind` required for strict categories (default: `"reviewed"` — must be at least reviewed, not just observed).
- `lenientProvenanceMinimum`: the minimum for lenient categories (default: `"observed"` — can be retained as observed).

### What This Does NOT Do

- Does NOT import numerical confidence thresholds from the paper (the paper uses calibrated probabilities; Nemons uses lifecycle status instead).
- Does NOT automatically classify memory records into categories (the caller provides the category).
- Does NOT modify the existing `MemoryRecordKind` (which is an operational classification, not a semantic category).
- Does NOT change the memory store's data model (the category is an optional additive field).
- Does NOT require an LLM for classification.
- Does NOT weaken any existing test or authorization boundary.

### Paper Alignment

The paper's key insight: "retention decisions should be governed by a confidence bar conditioned on the semantic category of the assertion rather than by a single global threshold." Nemons adapts this by using lifecycle status (observed/reviewed/approved) as the "confidence bar" and conditioning it on the semantic category.

The paper's finding that values/beliefs have 77.9% support rate (vs. 96.2% for others) directly justifies the `strictCategories` default: values and predictions require at least `reviewed` status before retention, while facts/procedures/decisions can be retained as `observed`.

## Rationale

1. **Research-backed**: the paper evaluated 4,715 candidate assertions with consistent results.
2. **Fills a gap**: no category-based retention exists in Nemons.
3. **Low risk**: additive, optional field. Doesn't change existing behavior when `category` is absent.
4. **Fits authorization**: within Stage C scope (ADR-0006).
5. **Clear acceptance criteria**: when a strict-category memory record has provenance `observed`, the retention check flags it as needing stronger evidence.

## Compliance

- All existing tests continue to pass (the field is optional and additive).
- New tests verify the category-conditioned retention behavior.
- The architectural invariants are preserved (the check STRENGTHENS memory governance, not weakens it).
