# Contract: Knowledge

A Knowledge record represents a claim, relationship, constraint, or explanatory model. Storage or prior acceptance does not make it eternally true.

## Required fields
- `knowledge_id`, version, claim, category, scope.
- Admission status and linked decision.
- Source refs, evidence refs, provenance ref.
- Validity period and last verification when applicable.
- Uncertainty, limitations, contradiction refs, and justified supersession links.

## Rules
- Distinguish direct observations, externally sourced claims, preferences, hypotheses, and model inferences.
- Keep scope and time bounds attached to claims.
- Resolve conflicts using source quality, scope, version, and evidence—not recency alone.
- If evidence is insufficient, preserve uncertainty or abstain from asserting a conclusion.
- Check status and freshness before including a claim in task Context.
- Link the Knowledge record to the Memory admission decision and its supporting Evidence/Provenance; do not duplicate those mechanisms in a parallel subsystem.
