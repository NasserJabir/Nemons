# ADR-0001: Nemons Runtime Boundary

- **Status:** Accepted project invariant
- **Decision:** Nemons is an Agent Runtime/meta-harness independent of Coding Agents. It coordinates operational assets and continuity across harnesses without replacing their inner agent loops.
- **Context:** Harnesses already provide model interaction, native tools, execution, and session behavior. Nemons governs cross-run knowledge and operational assets.
- **Consequences:** Adapter capabilities must be explicit. Nemons cannot claim enforcement where it has no mediation or observation. Expanding into a harness's inner loop requires evidence and a new decision.
