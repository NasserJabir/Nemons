# Contract: Tool

A Tool definition describes an operation exposed through an adapter or provider.

## Fields
- `tool_id`, version, provider ref, operation.
- Input/output schemas, side-effect classification, idempotency where known.
- Required capabilities/permissions, sensitivity, execution constraints.
- Timeout/retry behavior, error taxonomy, evidence/telemetry produced.

## Rules
- Tool availability is not authorization.
- Apply policy checks before invocation; validate inputs/outputs where feasible.
- Destructive/high-impact operations require explicit policy gates.
- Hard-deny cannot be bypassed by prior ordinary approval.
- Missing capability or telemetry is a limitation, not successful execution.
