# Contract: Persona

A Persona is a versioned operational asset that guides interaction style, priorities, and working conventions. It is not an identity credential, policy authority, or permission grant.

## Fields

- `persona_id`, `version`, `status`.
- `purpose`, `behavioral_guidance`, `scope`, `limitations`.
- `source_refs`, `provenance`, `created_at`, `updated_at`.
- `change_history` and any linked Experience/Evidence.
- `governance_class` and required adoption gate.

## Invariants

- Persona instructions cannot override system security policy, hard-deny rules, or tool authorization.
- Stable identity and each running instance are distinct.
- Learned experience may propose a Persona change but cannot silently mutate an adopted version.
- Version snapshots used by a Run must remain traceable.
