# Contract: Coding Agent

Describes the external agent system Nemons coordinates with; it does not redefine the agent's internal architecture.

## Fields
- Agent/product/provider, version, harness version.
- Supported adapter and capability profile.
- Native session identifiers when available.
- Tool, permission, model, and execution characteristics relevant to the Run.
- Observability gaps and portability constraints.

## Boundary
The Coding Agent harness owns its inner model loop and native execution semantics. Nemons may prepare inputs, coordinate assets/state, capture supported events, and evaluate outputs through an adapter. Do not claim responsibility for controls Nemons cannot observe or enforce.
