# Contract: Agent Adapter

An Agent Adapter connects Nemons contracts to a specific Coding Agent harness.

## Fields
- Adapter ID/version and supported harness versions.
- Capability matrix: context injection, run initiation, tool mediation, events, interruption, handoff, evidence capture.
- Contract mappings, configuration, limitations, failure modes.
- Security boundary and which checks are performed by adapter versus harness.
- Compatibility test results and version pinning.

## Rules
- Declare unsupported capabilities; do not simulate them silently.
- Preserve asset/source references through mapping where possible.
- Do not claim enforcement where the adapter cannot mediate or verify the boundary.
- Harness-native session state is optional input, not the sole continuity source.
