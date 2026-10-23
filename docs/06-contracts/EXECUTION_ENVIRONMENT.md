# Contract: Execution Environment

Describes the environment in which a Run executes.

## Fields
- Environment ID, OS/runtime/image versions where available.
- Repository/workspace identity and revision.
- Toolchain and relevant dependency versions.
- Network, filesystem, process, and secret-access constraints.
- Sandbox/isolation profile, resource limits, known limitations.
- Environment evidence and reproducibility notes.

## Rules
- Pin environment details when they materially affect reproducibility.
- Do not assume comparability when relevant environment details differ.
- Record unavailable telemetry explicitly.
- Learned assets cannot relax environment restrictions or security boundaries.
