# ADR-0004: Category-Conditioned Memory Admission

- **Status:** Accepted architectural principle; thresholds open
- **Decision:** Admission and retention consider category plus source, evidence, scope, sensitivity, time validity, contradiction, and reuse value. Evolve the existing Memory policy rather than creating a separate memory system or layer.
- **Context:** Information types differ in risk and decay. One confidence score or universal threshold is insufficient.
- **Consequences:** Proposed Nemons states are QUARANTINED, ACCEPTED, ABSTAINED, and REJECTED; these are project-specific choices, not claimed as verbatim paper states. Numerical thresholds, taxonomy, and risk calibration require evaluation. Acceptance is not a permanent truth guarantee.
