# Contract: Tool Provider

A Tool Provider exposes tools through a concrete integration boundary.

## Fields
- `provider_id`, version, protocol, endpoint/local binding.
- Authentication reference (never raw secrets in ordinary asset files).
- Capability discovery, tool list, schema versions, availability.
- Trust level, permission mapping, data/network boundaries, audit hooks.
- Timeout, rate-limit, and failure behavior.

## Rules
- Keep credentials outside version-controlled plain-text contracts.
- Capability claims must be tested or grounded in provider documentation.
- Never infer permission from Persona or Skill content.
- Declare provider-specific features so portability limits remain visible.
