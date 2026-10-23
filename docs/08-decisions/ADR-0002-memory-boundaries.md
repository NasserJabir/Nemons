# ADR-0002: Preserve the Four Memory-Related Layers

- **Status:** Accepted project invariant
- **Decision:** Preserve exactly four logical layers: (1) Markdown Source of Truth, (2) derived rebuildable index, (3) ephemeral runtime state, and (4) handoff/delivery artifact.
- **Context:** Durable records, searchable derivatives, active execution state, and portable handoff have different lifecycles.
- **Consequences:** Context Packs are task-derived artifacts, not a fifth permanent memory layer. New storage technologies must map to these boundaries rather than multiply them.
