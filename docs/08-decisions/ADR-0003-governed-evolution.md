# ADR-0003: Separate Generation, Evaluation, and Adoption

- **Status:** Accepted project invariant
- **Decision:** Candidate generation, verification/evaluation, review, and adoption are distinct steps. Generated candidates remain quarantined until the required gate.
- **Context:** Automated improvement can overfit, misattribute failures, or weaken governance if generation directly mutates assets.
- **Consequences:** Each candidate links source, rationale, evidence, target asset version, evaluation, and decision. Governance, hard-deny, identity, capability, approval-threshold, provenance/evidence, and security-boundary rules cannot be autonomously modified. Hard-deny cannot be overridden by prior ordinary approval.
