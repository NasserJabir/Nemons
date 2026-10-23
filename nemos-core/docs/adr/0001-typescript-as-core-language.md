# ADR-0001 — TypeScript as the Core Implementation Language

**Status:** Accepted  
**Date:** Stage 0  
**Decision Owner:** Nemons Architecture

## Context

Nemons is an independent Agent Runtime intended to operate above existing Coding Agents. The Core must:

- Encode strict domain contracts (Persona, Skill, Knowledge, Memory, Context Pack, Run, Evidence, Evaluation, Experience).
- Enforce "hard-deny" security behavior at the type level AND at runtime.
- Remain dependency-light so it can be ported or substituted without rewriting the Core.
- Provide discriminated error types so callers can switch on `code` rather than parsing message strings.
- Be inspectable and testable in isolation from any Coding Agent.

## Decision

Implement the Nemons Core in TypeScript.

## Rationale

- TypeScript's structural type system + branded types give us a way to encode "Identity is not instance" (e.g., `RunId` ≠ `EvidenceId` ≠ `PersonaId` at the type level, even though both are strings at runtime).
- `readonly` fields and `as const` assertions encode "No silent mutation" at the type level — the compiler enforces immutability.
- Discriminated unions (e.g., `ProvenanceSource`, `RunState`) enable exhaustive switch checks, so adding a new state forces updates at every match site.
- The Node.js ecosystem has zero external runtime dependencies for crypto (sha256 is built into `node:crypto`), which keeps the Core dependency-light.
- TypeScript is widely understood by the target audience (runtime engineers, agent researchers), reducing onboarding friction.

## Alternatives Considered

- **Python**: Strong ecosystem for ML/agent work, but lacks structural typing and `readonly` enforcement at the type level. Type narrows don't propagate as cleanly.
- **Rust**: Excellent type safety, but adds friction for adapter authors who need to write thin glue layers; not the natural language for the target audience.
- **Go**: Simple and dependency-light, but lacks generics expressivity and branded-type ergonomics needed for the contract surface.

## Consequences

- The Core is published as `@nemons/core` with both `.js` and `.d.ts` outputs.
- Adapter authors may use any language that can consume TypeScript definitions, but the contract surface is TypeScript-canonical.
- The Core uses `verbatimModuleSyntax=false` and `isolatedModules=true` to keep imports compatible with vitest and ts-node without ceremony.

## Compliance

- The Core's `tsconfig.json` enforces `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, and `noFallthroughCasesInSwitch`.
- `npm run typecheck` MUST pass before any release.
