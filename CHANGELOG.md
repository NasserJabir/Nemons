# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.2.1] - 2026-10-23

### Fixed — comment/code drift in v4.2.0
The v4.2.0 release shipped with comments claiming to "pass persona role
to harness router" and "pass persona to orchestrator" but the actual
call sites still only passed `prompt`. v4.2.1 closes this drift:

- **HarnessRouter** (`src/utils/harness-router.js`):
  - `route(prompt, personaRole?)` now accepts an optional personaRole
    argument (was prompt-only). Persona is now a FIRST-CLASS routing
    input.
  - Verification criteria augmentation moved INSIDE the router
    (centralised `PERSONA_DOMAIN_CRITERIA` map). Direct callers benefit,
    not just `pipeline-integrator.js`.
  - The router response now includes `persona_role`, `persona_domain`,
    and `persona_augmented` so callers can audit WHO drove routing.
  - New exports: `PERSONA_DOMAIN_CRITERIA`, `ROLE_TO_DOMAIN`.
  - New method: `getPersonaDomainCriteria(domain)` for introspection.
- **SubagentOrchestrator** (`src/utils/subagent-orchestrator.js`):
  - `autoOrchestrate(task, dagPlan, identityId, personaRole?)` now
    accepts an optional personaRole argument (was 3-arg only).
  - Persona-driven role/memory_mode/capabilities override is now
    applied AT SPAWN TIME inside `createAssignments` (was post-hoc
    in the caller only).
  - Orchestration record now carries `persona_role`, `persona_domain`,
    `persona_driven` provenance.
  - Non-orchestrated result (simple task) still echoes persona context.
  - `stats()` now reports `persona_driven_orchestrations` count and
    `persona_domain_breakdown` map.
  - New exports: `PERSONA_ROLE_DOMAIN`, `DOMAIN_ROLE_OVERRIDE`.
- **PipelineIntegrator** (`src/utils/pipeline-integrator.js`):
  - Actually passes `persona.role` to `harnessRouter.route(prompt, persona.role)`
    (was `route(prompt)` despite the comment claiming otherwise).
  - Actually passes `persona.role` to `subagentOrchestrator.autoOrchestrate(prompt, dag, id, persona.role)`
    (was 3-arg call despite the comment claiming otherwise).
  - `augmentCriteriaForPersona(null, persona)` no longer drops persona
    criteria silently — falls back to a sane default THEN merges persona
    criteria on top (closes a real bug).
  - Subagent records now carry `orchestrator_overridden` and `base_role`
    provenance so audit trail shows whether the role was set at spawn
    time or post-spawn.
  - `pipeline_version` bumped to `4.2.1`; `stats()` description updated.

### Added
- New test file: `tests/v421-persona-tests.js` — 33 tests covering
  harness router persona-aware routing, orchestrator spawn-time persona
  override, pipeline-integrator helper functions, and end-to-end
  persona provenance.
- New npm scripts: `test:unit` (legacy), `test:v421` (new).

### Fixed (pre-existing)
- `src/utils/unified-skills.js:27` — pre-existing syntax error
  (`{ recursive: true)` missing closing brace) that prevented
  `pipeline-integrator.js` from loading.

### Backward Compatibility
- All v4.2.0 callers continue to work unchanged (personaRole is
  optional in both `route()` and `autoOrchestrate()`).
- When personaRole is omitted, behaviour is identical to v4.1.0.

## [4.2.0] - 2026-10-23

### Added — persona-driven pipeline
This release made persona the DRIVER of skill / experience / harness /
subagent selection. Previously these modules worked independently
based on prompt keywords.

- **PipelineIntegrator** (`src/utils/pipeline-integrator.js`):
  - Persona selection via `selectPersonaRole(prompt)` → 5 roles
    (security / devops / data / frontend / senior engineer).
  - Dynamic persona creation via `PersonaEvolver` when template is
    too generic (e.g. "senior_engineer" for a security task).
  - Skill retrieval by persona domain (`${persona.domain} ${prompt}`).
  - Experience retrieval by persona domain.
  - Harness verification criteria augmented by persona domain
    (4 domains: security / devops / data-engineering / frontend).
  - Subagent roles augmented post-spawn via `augmentSubagentRole`.
  - Persona provenance recorded on every component of the Context Pack.

### Known Gaps Closed in v4.2.1
- Harness router did not actually accept personaRole (comment claimed it did).
- Subagent orchestrator did not actually accept personaRole (comment claimed it did).
- `augmentCriteriaForPersona(null, persona)` silently dropped persona criteria.

## [4.1.0] - 2026-10-22

### Added — self-evolution
- PersonaEvolver: dynamic persona creation + evolution + gap detection.
- SubagentOrchestrator: auto-spawn + parallel + merge + retry.
- SkillEvolver: gap detection + evolution + proactive creation.

## [4.0.0] - 2026-10-22

### Added — pipeline integration
- `/analyze` builds dynamic Context Packs with persona + skills +
  experiences + harness + subagents + DAG.
- `/evaluate` auto-compiles experiences to skills + notifies webhooks.

## [1.0.0] - 2026-10-22

### Added
- ✅ Initial release of Nemons CLI
- ✅ Express daemon with full REST API (9 endpoints)
- ✅ Transparent prompt interception (auto-trigger on every prompt)
- ✅ Smart filtering (skips trivial prompts like "hello", "what is")
- ✅ Context Pack auto-selection based on prompt keywords
- ✅ Evidence collection (diffs, tests, lint) with auto-secret-redaction
- ✅ 3-tier verification loop (must-pass / should-pass / nice-to-have)
- ✅ Experience storage (file-based JSON in `~/.nemons/experiences/`)
- ✅ Hierarchical governance (low/medium/high impact approval)
- ✅ Monitoring with metrics + alerting
- ✅ 7 CLI commands: daemon, health, plugin, intercept, verify, install, experiences
- ✅ 10-test end-to-end verification suite
- ✅ Plugins for 7 coding agents: OpenCode, Claude Code, Codex, Kimi, Cline, Qoder, Trae
- ✅ systemd service file (Linux)
- ✅ launchd plist (macOS)
- ✅ SDK public API for embedding in Node.js apps
- ✅ Documentation: architecture, API reference, plugin development

### Security
- Daemon binds to 127.0.0.1 only (no remote access)
- Optional bearer token authentication
- Automatic secret redaction (API keys, JWTs, PEM files, AWS keys)
- Audit logs with hash chain (tamper-proof)
- RBAC tool-level permissions (planned for 1.1.0)

### Performance
- File-based storage (no DB dependency)
- In-memory context pack caching (1-hour TTL)
- Graceful degradation (plugin no-ops if daemon unreachable)
- Lazy loading of skills and experiences

### Documentation
- README.md with full installation guide
- docs/architecture.md with system overview
- docs/api-reference.md with all REST endpoints
- docs/plugin-development.md with examples
- examples/custom-context-pack.yml
- examples/sdk-usage.js

## [0.9.0] - 2026-10-21 (Pre-release)

### Added
- Initial project structure
- Skeleton daemon implementation
- Basic CLI commands

## Future Roadmap

### [1.1.0] — Q4 2026
- RBAC tool-level permissions
- Multi-tenant support
- PostgreSQL backend (optional)
- WebSocket for real-time metrics
- Web dashboard (React)

### [1.2.0] — Q1 2027
- Distributed daemon (cluster mode)
- AI-powered experience ranking
- Auto-skill derivation from successful runs
- Integration with Augment Cosmos
