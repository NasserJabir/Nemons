# ADR-0009 — Entity Summary (from CorpusMap research)

**Status:** Accepted  
**Date:** 2026-10-21  
**Decision Owner:** Senior Research Engineer  
**Research Source:** Follow the Entities / CorpusMap (https://arxiv.org/abs/2609.37226)

## Context

CorpusMap (Jeong et al., Sep 2026) studied agentic search over large document collections. Its key contribution:

> "CorpusMap represents each recurring entity as an Entity Page that aggregates information about it and links to every document that refers to it, forming a graph between entities and documents."

The paper shows that organizing information around stable entities improves evidence discovery and answer quality while using fewer tokens.

Nemons' current CrossReferenceChecker (Stage G) detects orphaned records (records whose references point to missing entities). But it does NOT provide a queryable "Entity Page" — a summary that aggregates ALL records referencing a given entity, showing both incoming and outgoing references.

**Gap:** When auditing a Run, an Experience, or a Candidate, there's no single query that shows:
- What Evidence was collected for this Run?
- What Experiences were derived from this Run?
- What Candidates were generated from this Experience?
- What is the version chain for this Candidate?
- What DecisionLog entries reference this Candidate?

The Entity Summary fills this gap.

## Decision

Add an **EntitySummarizer** component that provides queryable "Entity Pages" for Nemons entities (Run, Evidence, Experience, Candidate). Each summary aggregates:
- The entity itself (if found)
- **Incoming references**: records that reference this entity
- **Outgoing references**: records this entity references
- **Cross-reference status**: healthy / orphaned / partial
- **Human-readable summary**: for audit output

### Entity Types and Their References

**Run:**
- Incoming: Evidence records (via `evidence.runId`), Experience records (via `experience.runId`)
- Outgoing: Context Pack (via `run.contextPackId`), Repository identity (via `run.inputs.repoInstance`)

**Experience:**
- Incoming: Candidates (via `candidate.evidenceRefs` containing the Experience id), Memory records (via `memory.derivedFromExperienceId`)
- Outgoing: Source Run (via `experience.runId`), Source Evaluation (via `experience.evaluationId`)

**Candidate:**
- Incoming: DecisionLog entries, other Candidates that supersede this one
- Outgoing: The Candidate this one supersedes (via `supersedesCandidateId`), the asset it targets (via `assetId`)

### What This Does NOT Do

- Does NOT require offline entity resolution (Nemons entities are already stable IDs with branded types).
- Does NOT modify any state (read-only query layer).
- Does NOT require network access or external services.
- Does NOT introduce a new store (uses existing persistent stores as data sources).
- Does NOT change any existing API.

## Rationale

1. **Research-backed**: CorpusMap's Entity Pages are well-evidenced (7 models, 3 benchmarks, outperforms 4 alternative navigation layers).
2. **Architecturally aligned**: complements the CrossReferenceChecker (Stage G) — the checker detects orphans; the summarizer provides the full audit view.
3. **Low risk**: read-only component, no state mutation, no schema changes.
4. **Fits authorization**: within Stage C scope (ADR-0006). No external services, no LLM, no network.
5. **Clear acceptance criteria**: given an entity id, the summarizer returns all referencing records with their relationship types.

## Compliance

- All existing tests continue to pass (the summarizer is additive — no existing component is modified).
- New tests verify the summarizer's behavior.
- The summarizer is a read-only query layer (no mutations).
- The architectural invariants are preserved.
