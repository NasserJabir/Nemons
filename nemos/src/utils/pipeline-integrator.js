// ============================================================
// Pipeline Integrator v4.2.0 — PERSONA-DRIVEN PIPELINE
// persona DRIVES: skills, subagents, harness, verification
// Everything is CHAINED from persona selection, not independent.
// ============================================================

const VERSION = require("../../package.json").version;

const { PersonaBuilder } = require("./persona-builder");
const { MultiPersona } = require("./multi-persona");
const { PersonaRecaster } = require("./persona-recaster");
const { UnifiedSkillSystem } = require("./unified-skills");
const { WikiSkill } = require("./wiki-skill");
const { CBRExperienceStore } = require("./cbr");
const { HarnessRouter } = require("./harness-router");
const { DAGPlanner } = require("./dag-planner");
const { SubagentManager } = require("./subagent-manager");
const { SubagentOrchestrator } = require("./subagent-orchestrator");
const { CandidateLifecycle } = require("./candidate-lifecycle");
const { WebhookManager } = require("./webhook-manager");
const { enforcer } = require("./invariant-enforcer");
const { PersonaEvolver } = require("./persona-evolver");
const { SkillEvolver } = require("./skill-evolver");
const { KnowledgeStore } = require("./knowledge-store");

class PipelineIntegrator {
  constructor() {
    this.personaBuilder = new PersonaBuilder();
    this.multiPersona = new MultiPersona();
    this.personaRecaster = new PersonaRecaster();
    this.skillSystem = new UnifiedSkillSystem();
    this.wikiSkill = new WikiSkill();
    this.cbr = new CBRExperienceStore();
    this.harnessRouter = new HarnessRouter();
    this.dagPlanner = new DAGPlanner();
    this.subagentManager = new SubagentManager();
    this.subagentOrchestrator = new SubagentOrchestrator(this.subagentManager);
    this.candidateLifecycle = new CandidateLifecycle();
    this.webhookManager = new WebhookManager();
    this.personaEvolver = new PersonaEvolver();
    this.skillEvolver = new SkillEvolver(this.skillSystem, this.candidateLifecycle);
    // Adopted knowledge is the only knowledge the pipeline may read (see
    // STEP 4b). It used to be absent from real packs entirely.
    this.knowledgeStore = new KnowledgeStore();
  }

  // ============================================================
  // BUILD CONTEXT PACK — PERSONA-DRIVEN
  // ============================================================
  async buildContextPack(prompt, adapter) {
    const results = {
      persona: null,
      persona_source: "template",
      persona_candidate: null,
      perspectives: [],
      skills: [],
      knowledge: [],
      experiences: [],
      harness: null,
      subagents: [],
      dag_plan: null,
    };

    // ========================================
    // STEP 1: SELECT PERSONA (the driver)
    // ========================================
    const personaRole = this.selectPersonaRole(prompt);
    const templateDomain = this.getDomainForRole(personaRole);
    let persona;

    // Invariant #4 (Use != Adopt): only an ADOPTED persona is ever applied to
    // a pack. This used to consume a `status: "candidate"` persona on the
    // same request that created it — generation and adoption collapsed into
    // one step, which is exactly what the invariant forbids.
    let adoptedPersona = null;
    try {
      adoptedPersona = await this.personaEvolver.selectAdopted(prompt, templateDomain);
    } catch (e) {
      adoptedPersona = null;
    }

    if (adoptedPersona) {
      persona = {
        id: adoptedPersona.id,
        // `role` stays the routing key the harness router and the subagent
        // orchestrator understand; the adopted persona's own title is kept
        // beside it so nothing is lost by adopting.
        role: personaRole,
        adopted_role: adoptedPersona.role,
        prompt: this.personaBuilder.build(personaRole),
        domain: adoptedPersona.domain || templateDomain,
        constraints: adoptedPersona.constraints || [],
        focus_areas: adoptedPersona.focus_areas || [],
        adopted: true,
      };
      results.persona_source = "adopted";
    } else {
      persona = { role: personaRole, prompt: this.personaBuilder.build(personaRole), domain: templateDomain };
    }

    // Nothing adopted: ask the evolver what this task would need. The result
    // stays a candidate for review and is deliberately NOT used.
    if (!adoptedPersona && personaRole === "senior_engineer") {
      try {
        const dynamicResult = await this.personaEvolver.createDynamic({ prompt, dagNodeCount: 1 });
        if (dynamicResult.persona && dynamicResult.requirements.domain !== "general") {
          results.persona_candidate = {
            id: dynamicResult.persona.id,
            role: dynamicResult.persona.role,
            domain: dynamicResult.requirements.domain,
            status: dynamicResult.persona.status,
            used: false,
            note: "Candidate persona recorded for review — approve it to make it selectable.",
          };
        }
      } catch (e) {
        results.persona_candidate = { error: e.message, used: false };
      }
    }

    // Recast persona based on complexity
    const recastContext = { task: prompt, user_level: "mid" };
    const recasted = this.personaRecaster.recast(
      { role: personaRole, experience: "5+ years" },
      recastContext
    );
    if (recasted.changed) {
      persona.recasted = true;
      persona.adjusted = recasted.recast;
    }

    results.persona = persona;

    // ========================================
    // STEP 2: MULTI-PERSONA (based on persona domain)
    // ========================================
    if (this.needsMultiPersona(prompt, persona.domain)) {
      results.perspectives = this.multiPersona.generatePerspectives(prompt);
      results.magic_circle = this.multiPersona.createMagicCircle();
    }

    // ========================================
    // STEP 3: SKILLS — DRIVEN BY PERSONA DOMAIN
    // (not just prompt keywords!)
    // ========================================
    try {
      // v4.2.0: Search by PERSONA DOMAIN + prompt
      // If persona is "security_engineer", search for security skills
      const searchQuery = persona.domain !== "general"
        ? `${persona.domain} ${prompt}`  // "security implement secure auth"
        : prompt;                          // fallback to prompt only

      const skills = await this.skillSystem.retrieve(searchQuery, 5, false);

      // v4.2.0: Also filter skills by persona domain
      results.skills = skills.map(s => ({
        id: s.id,
        name: s.name,
        // Lifecycle, not vibes: a skill that is still a candidate (or was
        // rejected/deprecated) must never be presented as usable.
        can_use: s.status ? s.status === "adopted" : true,
        status: s.status || "adopted",
        triggers: s.triggers,
        matched_by: persona.domain !== "general" ? "persona_domain" : "prompt",
      }));
    } catch (e) {
      results.skills = [];
    }

    // ========================================
    // STEP 4: EXPERIENCES — DRIVEN BY PERSONA DOMAIN
    // ========================================
    try {
      // v4.2.0: Search experiences using persona domain
      const expQuery = persona.domain !== "general"
        ? `${persona.domain} ${prompt}`
        : prompt;
      const experiences = await this.cbr.retrieve(expQuery, 3);
      results.experiences = experiences.map(e => ({
        id: e.id,
        prompt: (e.prompt || "").slice(0, 100),
        success_rate: e.success_rate || 0,
        // raw text similarity — `score` is the blended ranking value
        similarity: e.similarity || 0,
        score: e._score || 0,
        matched_by: persona.domain !== "general" ? "persona_domain" : "prompt",
      }));
    } catch (e) {
      results.experiences = [];
    }

    // ========================================
    // STEP 4b: KNOWLEDGE — ADOPTED KNOWLEDGE ONLY
    // ========================================
    // Real packs had no knowledge section at all: the field only existed in
    // the synthetic fallback. Candidates of type `knowledge` were approved
    // into nothing. The store returns records only when they overlap the
    // query, so "it exists" is never a reason to include it.
    try {
      const knowledgeQuery = persona.domain !== "general"
        ? `${persona.domain} ${prompt}`
        : prompt;
      results.knowledge = await this.knowledgeStore.retrieve(knowledgeQuery, 3);
    } catch (e) {
      results.knowledge = [];
    }

    // ========================================
    // STEP 5: HARNESS — DRIVEN BY PERSONA (not just prompt)
    // ========================================
    // v4.2.1: ACTUALLY pass persona.role to the router now (v4.2.0 had
    // a comment claiming this but the call site still only passed
    // `prompt`). The router applies persona-domain criteria inside,
    // so augmentCriteriaForPersona below is now an idempotent safety
    // net rather than the only place augmentation happens.
    const harnessResult = this.harnessRouter.route(prompt, persona.role);

    // v4.2.0/v4.2.1: post-hook augmentation stays as a safety net
    // (router already applied persona criteria; this is idempotent
    // because both use the same domain → criteria map).
    const augmentedCriteria = this.augmentCriteriaForPersona(
      harnessResult.verification_criteria,
      persona
    );

    results.harness = {
      name: harnessResult.harness,
      task_type: harnessResult.task_type,
      max_retries: harnessResult.max_retries,
      repair_strategy: harnessResult.repair_strategy,
      verification_criteria: augmentedCriteria,
      persona_role: harnessResult.persona_role,
      persona_domain: harnessResult.persona_domain,
      persona_augmented: harnessResult.persona_augmented === true || persona.domain !== "general",
      // v4.2.1: provenance — did the router itself apply the persona criteria?
      router_persona_applied: harnessResult.persona_augmented === true,
    };

    // ========================================
    // STEP 6: DAG PLANNING
    // ========================================
    const dagPlan = this.dagPlanner.plan(prompt);
    results.dag_plan = {
      nodes: dagPlan.nodes,
      execution_order: this.dagPlanner.getExecutionOrder(),
    };

    // ========================================
    // STEP 7: SUBAGENTS — DRIVEN BY PERSONA (not just DAG!)
    // ========================================
    if (dagPlan.node_count > 2) {
      try {
        // v4.2.1: ACTUALLY pass persona.role now (v4.2.0 only claimed
        // to). The orchestrator uses personaRole AT SPAWN TIME inside
        // createAssignments, so the spawned subagents already carry
        // persona-aware role / memory_mode / capabilities. The
        // augmentSubagentRole call below stays as a defensive safety
        // net but is now a no-op when the orchestrator already
        // overrode the role.
        const orchResult = await this.subagentOrchestrator.autoOrchestrate(
          prompt, dagPlan, adapter || "system", persona.role
        );

        if (orchResult.orchestrated) {
          // v4.2.0/v4.2.1: post-hook augmentation stays as a safety
          // net (idempotent — orchestrator's spawn-time override
          // produces roles that augmentSubagentRole doesn't recognise,
          // so it returns them unchanged).
          //
          // `results` is parallel to `subagents` (executeParallel maps
          // over the same array), so each entry's outcome — dispatched
          // vs actually executed — is carried through instead of being
          // dropped here.
          const outcomes = orchResult.results || [];
          results.subagents = (orchResult.subagents || []).map((s, i) => ({
            id: s.id,
            task: s.task,
            memory_mode: s.memory_mode,
            role: this.augmentSubagentRole(s.role, persona),
            persona_assigned: persona.domain !== "general",
            // v4.2.1: provenance — was this role set by the orchestrator at spawn time?
            orchestrator_overridden: s.assignment?.persona_overridden === true,
            base_role: s.assignment?.base_role || null,
            // "dispatched" means the host agent must run it; this daemon
            // has no executor of its own.
            status: outcomes[i]?.status || "dispatched",
            executed: outcomes[i]?.executed === true,
          }));

          results.orchestration = {
            execution: orchResult.orchestration?.execution || "delegated_to_host",
            spawned: orchResult.orchestration?.subagents_spawned,
            dispatched: orchResult.orchestration?.subagents_dispatched,
            executed: orchResult.orchestration?.subagents_executed,
            succeeded: orchResult.orchestration?.subagents_succeeded,
            failed: orchResult.orchestration?.subagents_failed,
            retries: orchResult.orchestration?.retries,
            // v4.2.1: surface persona provenance
            persona_role: orchResult.persona_role || persona.role,
            persona_domain: orchResult.persona_domain || persona.domain,
            persona_driven: orchResult.persona_driven === true || persona.domain !== "general",
            note: "Subagents are dispatched, not executed: this daemon has no executor. The calling agent runs them.",
          };
        } else {
          // Fallback: suggest subagents with persona-augmented roles
          const readyNodes = this.dagPlanner.getReadyNodes();
          for (const node of readyNodes.slice(0, 3)) {
            results.subagents.push({
              task: node.question,
              memory_mode: "inherit-partial",
              lifespan: "one-time",
              role: this.augmentSubagentRole("executor", persona),
              persona_assigned: persona.domain !== "general",
              status: "suggested",
              executed: false,
            });
          }
        }
      } catch (e) {
        const readyNodes = this.dagPlanner.getReadyNodes();
        for (const node of readyNodes.slice(0, 3)) {
          results.subagents.push({
            task: node.question,
            memory_mode: "inherit-partial",
            lifespan: "one-time",
            role: this.augmentSubagentRole("executor", persona),
            status: "suggested",
            executed: false,
          });
        }
      }
    }

    // ========================================
    // STEP 8: BUILD FINAL CONTEXT PACK
    // ========================================
    const contextPack = {
      id: "dynamic-" + Date.now().toString(36),
      persona: results.persona,
      persona_source: results.persona_source,
      // A candidate is surfaced for review, never applied — see STEP 1.
      persona_candidate: results.persona_candidate,
      perspectives: results.perspectives,
      skills: results.skills,
      knowledge: results.knowledge,
      experiences: results.experiences,
      harness: results.harness,
      subagents: results.subagents,
      // Who was asked to run the subagents, and what actually ran. Absent when
      // the DAG was small enough that no subagents were needed.
      orchestration: results.orchestration,
      dag_plan: results.dag_plan,
      success_criteria: results.harness.verification_criteria?.must_pass || [
        "tests_pass",
        "no_syntax_errors",
        "no_security_violations",
      ],
      built_at: new Date().toISOString(),
      pipeline_version: VERSION,
      persona_driven: true,
    };

    return {
      should_intercept: true,
      context_pack: contextPack,
      suggested_pack_id: contextPack.id,
      pipeline: "persona-driven (v4.2.1 — spawn-time persona)",
      components_used: [
        "persona_builder",
        "persona_evolver (adopted personas only)",
        "multi_persona",
        "persona_recaster",
        "unified_skills (persona-domain-driven)",
        "knowledge_store (adopted only)",
        "cbr_experiences (persona-domain-driven)",
        "harness_router (v4.2.1: persona-aware route)",
        "dag_planner",
        "subagent_orchestrator (v4.2.1: persona-aware autoOrchestrate)",
      ],
    };
  }

  // ============================================================
  // PERSONA-DRIVEN HELPER METHODS
  // ============================================================

  // Map persona role to domain
  getDomainForRole(role) {
    const roleDomainMap = {
      "security_engineer": "security",
      "devops_engineer": "devops",
      "data_engineer": "data-engineering",
      "frontend_engineer": "frontend",
      "senior_engineer": "general",
    };
    return roleDomainMap[role] || "general";
  }

  // v4.2.0/v4.2.1: AUGMENT verification criteria based on persona.
  // When originalCriteria is null/undefined, fall back to a sane default
  // AND STILL apply persona-domain criteria (v4.2.1 fix — v4.2.0 silently
  // dropped persona criteria when caller passed null).
  augmentCriteriaForPersona(originalCriteria, persona) {
    let augmented;
    if (!originalCriteria) {
      // v4.2.1: start from a default base, then persona criteria will
      // still be merged in below.
      augmented = {
        must_pass: ["tests_pass", "no_syntax_errors"],
        should_pass: [],
        nice_to_have: [],
      };
    } else {
      // Clone the criteria
      augmented = JSON.parse(JSON.stringify(originalCriteria));
    }

    // Add persona-specific criteria based on domain
    const domainCriteria = {
      "security": {
        must_pass: ["no_vulnerabilities", "input_validated", "no_hardcoded_secrets", "owasp_checked"],
        should_pass: ["security_tests_added", "auth_flow_verified"],
        nice_to_have: ["penetration_test_considered"],
      },
      "devops": {
        must_pass: ["health_check_present", "graceful_shutdown", "rollback_plan"],
        should_pass: ["monitoring_configured", "auto_scaling"],
        nice_to_have: ["zero_downtime"],
      },
      "data-engineering": {
        must_pass: ["schema_validated", "idempotent_operations"],
        should_pass: ["data_lineage_tracked", "retry_implemented"],
        nice_to_have: ["schema_migration_ready"],
      },
      "frontend": {
        must_pass: ["accessibility_checked", "responsive_design"],
        should_pass: ["performance_budget_met", "semantic_html"],
        nice_to_have: ["screenshot_test"],
      },
    };

    const domainSpecific = domainCriteria[persona.domain];
    if (domainSpecific) {
      // Add domain-specific must_pass criteria
      for (const criterion of domainSpecific.must_pass) {
        if (!augmented.must_pass.includes(criterion)) {
          augmented.must_pass.push(criterion);
        }
      }
      // Add should_pass
      if (!augmented.should_pass) augmented.should_pass = [];
      for (const criterion of domainSpecific.should_pass) {
        if (!augmented.should_pass.includes(criterion)) {
          augmented.should_pass.push(criterion);
        }
      }
      // Add nice_to_have
      if (!augmented.nice_to_have) augmented.nice_to_have = [];
      for (const criterion of domainSpecific.nice_to_have) {
        if (!augmented.nice_to_have.includes(criterion)) {
          augmented.nice_to_have.push(criterion);
        }
      }
    }

    augmented.persona_domain = persona.domain;
    augmented.augmented = persona.domain !== "general";

    return augmented;
  }

  // v4.2.0: AUGMENT subagent role based on persona
  augmentSubagentRole(originalRole, persona) {
    if (persona.domain === "general") return originalRole;

    // Map persona domain to subagent specialization
    const domainRoleMap = {
      "security": {
        "executor": "security-implementer",
        "tester": "security-tester",
        "planner": "security-architect",
        "reviewer": "security-auditor",
      },
      "devops": {
        "executor": "infrastructure-builder",
        "tester": "deployment-tester",
        "planner": "infrastructure-architect",
      },
      "data-engineering": {
        "executor": "pipeline-builder",
        "tester": "data-quality-tester",
        "planner": "data-architect",
      },
      "frontend": {
        "executor": "component-builder",
        "tester": "ui-tester",
        "planner": "ux-architect",
      },
    };

    const roleMap = domainRoleMap[persona.domain];
    if (roleMap && roleMap[originalRole]) {
      return roleMap[originalRole];
    }

    return originalRole;
  }

  // Select persona role based on prompt keywords
  selectPersonaRole(prompt) {
    const p = (prompt || "").toLowerCase();
    if (p.includes("security") || p.includes("auth") || p.includes("vulnerability") || p.includes("encrypt"))
      return "security_engineer";
    if (p.includes("deploy") || p.includes("docker") || p.includes("kubernetes") || p.includes("infra"))
      return "devops_engineer";
    if (p.includes("database") || p.includes("migration") || p.includes("schema") || p.includes("etl"))
      return "data_engineer";
    if (p.includes("component") || p.includes("ui") || p.includes("css") || p.includes("react"))
      return "frontend_engineer";
    return "senior_engineer";
  }

  // Determine if multi-persona is needed (based on persona domain too)
  needsMultiPersona(prompt, personaDomain) {
    const p = (prompt || "").toLowerCase();
    return (
      p.includes("security") || p.includes("auth") ||
      p.includes("deploy") || p.includes("architecture") ||
      p.includes("design") ||
      personaDomain === "security" || personaDomain === "devops"
    );
  }

  // ============================================================
  // POST-RUN PROCESSING
  // ============================================================
  async postRunProcessing(runData) {
    const results = {
      experience_stored: false,
      skill_compiled: false,
      candidate_registered: false,
      webhook_notified: false,
      // Each stage used to sit in its own `catch (e) {}`, so a caller saw a
      // `false` flag with no way to learn why it was false. Failures are
      // collected here instead of disappearing.
      errors: [],
    };
    const stage = async (name, fn) => {
      try {
        await fn();
      } catch (e) {
        results.errors.push({ stage: name, error: e.message });
      }
    };

    // 1. Store experience in CBR
    await stage("experience", async () => {
      const exp = await this.cbr.retain(runData.evidence || {}, {
        prompt: runData.prompt,
        success: true,
        adapter: runData.adapter,
      });
      results.experience_stored = true;
      results.experience_id = exp.id;
    });

    // 2. v4.1.0: Proactive skill creation
    await stage("proactive_skill", async () => {
      results.proactive_skill = await this.skillEvolver.createProactive({ prompt: runData.prompt });
    });

    // 3. Auto-compile experience to skill (via wiki-skill)
    // 4. Register skill as CANDIDATE (Invariant #7: No silent mutation)
    await stage("compile_and_register", async () => {
      const skill = await this.wikiSkill.compileFromRun({
        success: true,
        id: results.experience_id,
        prompt: runData.prompt,
        evidence: runData.evidence,
        verification: runData.verification,
      });
      results.skill_compiled = true;
      results.skill_id = skill?.id;

      if (skill && skill.id) {
        const candidate = await this.candidateLifecycle.registerCandidate({
          type: "skill",
          content: skill,
          source: "auto-compiled",
          generated_by: runData.adapter || "system",
        });
        results.candidate_registered = true;
        results.candidate_id = candidate?.candidate?.id || candidate?.id;
      }
    });

    // 5. v4.1.0: Skill gap detection
    await stage("skill_gaps", async () => {
      results.skill_gaps = await this.skillEvolver.detectGaps([{ prompt: runData.prompt }]);
    });

    // 6. Notify via webhooks
    await stage("webhook", async () => {
      await this.webhookManager.emit("experience.stored", {
        prompt: runData.prompt,
        experience_id: results.experience_id,
        skill_id: results.skill_id,
      });
      results.webhook_notified = true;
    });

    return results;
  }

  // Stats
  async stats() {
    return {
      pipeline_version: VERSION,
      persona_driven: true,
      components: [
        "persona_builder",
        "persona_evolver (adopted personas only)",
        "multi_persona",
        "persona_recaster",
        "unified_skills (persona-domain-driven)",
        "knowledge_store (adopted only)",
        "cbr_experiences (persona-domain-driven)",
        "harness_router (v4.2.1: persona-aware route)",
        "dag_planner",
        "subagent_orchestrator (v4.2.1: persona-aware autoOrchestrate)",
      ],
      description: "Persona DRIVES: skills, subagents, harness, verification. Everything chained from persona at SPAWN TIME (v4.2.1).",
    };
  }
}

module.exports = { PipelineIntegrator };
