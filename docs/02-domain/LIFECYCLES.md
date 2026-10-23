# Lifecycles

## Memory admission lifecycle

Proposed policy states: `QUARANTINED`, `ACCEPTED`, `ABSTAINED`, `REJECTED`.

- **QUARANTINED:** a candidate awaits evaluation or review; it is not retrieved as an accepted fact.
- **ACCEPTED:** admitted under the applicable policy, with source, category, scope, and status recorded. Acceptance is not eternal truth.
- **ABSTAINED:** evidence is insufficient for a reliable assertion or durable inference. Preserve the audit record; do not promote the claim.
- **REJECTED:** the candidate fails policy or is unsupported/unsafe for admission. Retain only the audit information required by policy.

These are proposed Nemons states inspired by category-aware retention principles; they are not claimed to be verbatim states from a research paper.

## Skill and Persona change lifecycle

`PROPOSED → QUARANTINED → EVALUATED → REVIEWED → ADOPTED`

A change may instead be rejected or abandoned at applicable gates. The required gates depend on change class and risk. Generation, evaluation, and adoption are separate acts. An evaluation result applies only to the tested version and scope.

## Run lifecycle

`CREATED → PREPARED → RUNNING → VERIFYING → COMPLETED | FAILED | ABORTED`

A terminal run records the outcome and available evidence. A successful process exit is not equivalent to task acceptance.

## Evidence lifecycle

Evidence is captured, integrity-checked where feasible, linked to a claim or decision, assessed for relevance, and retained according to policy. Contradictory evidence must remain visible rather than being overwritten based only on recency.

## Staleness

When a source or supporting version changes, mark affected knowledge `UNVERIFIED_STALE` until revalidated. Do not silently delete the prior record. Retrieval for a sensitive task must consider source freshness and scope.
