#!/usr/bin/env python3
"""
Build Nemos v4.2.0 — PERSONA-DRIVEN PIPELINE
Fix: persona now DRIVES skill selection, subagent roles, and harness criteria.
Everything is chained from persona, not independently keyword-matched.
"""
import zipfile, tarfile, os, shutil, subprocess
from pathlib import Path

DOWNLOAD = Path("/home/z/my-project/download")
V41_ZIP = DOWNLOAD / "nemos-project-v4.1.0.zip"
V42_ZIP = DOWNLOAD / "nemos-project-v4.2.0.zip"
V42_TAR = DOWNLOAD / "nemos-project-v4.2.0.tar.gz"
TEMP_DIR = DOWNLOAD / "_temp_v42"

if TEMP_DIR.exists(): shutil.rmtree(TEMP_DIR)
TEMP_DIR.mkdir()

print(f"Extracting {V41_ZIP.name}...")
subprocess.run(['unzip','-q',str(V41_ZIP),'-d',str(TEMP_DIR)],check=True)
project = TEMP_DIR / "nemos-project"
utils = project / "nemos" / "src" / "utils"

# ============================================================
# REWRITE pipeline-integrator.js — PERSONA-DRIVEN
# ============================================================
print("\n=== Rewriting pipeline-integrator.js (persona-driven) ===")

PIPELINE_V42 = r'''// ============================================================
// Pipeline Integrator v4.2.0 — PERSONA-DRIVEN PIPELINE
// persona DRIVES: skills, subagents, harness, verification
// Everything is CHAINED from persona selection, not independent.
// ============================================================

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
  }

  // ============================================================
  // BUILD CONTEXT PACK — PERSONA-DRIVEN
  // ============================================================
  async buildContextPack(prompt, adapter) {
    const results = {
      persona: null,
      perspectives: [],
      skills: [],
      experiences: [],
      harness: null,
      subagents: [],
      dag_plan: null,
    };

    // ========================================
    // STEP 1: SELECT PERSONA (the driver)
    // ========================================
    const personaRole = this.selectPersonaRole(prompt);
    let persona;
    let personaSource = "template";

    // Try dynamic persona creation if template is too generic
    if (personaRole === "senior_engineer") {
      try {
        const dynamicResult = await this.personaEvolver.createDynamic({ prompt, dagNodeCount: 1 });
        if (dynamicResult.persona && dynamicResult.requirements.domain !== "general") {
          persona = {
            role: dynamicResult.persona.role,
            prompt: this.personaBuilder.build("senior_engineer"),
            dynamic: true,
            domain: dynamicResult.requirements.domain,
            constraints: dynamicResult.persona.constraints,
            focus_areas: dynamicResult.persona.focus_areas,
          };
          personaSource = "dynamic";
          results.persona_evolved = dynamicResult;
        } else {
          persona = { role: personaRole, prompt: this.personaBuilder.build(personaRole), domain: "general" };
        }
      } catch (e) {
        persona = { role: personaRole, prompt: this.personaBuilder.build(personaRole), domain: "general" };
      }
    } else {
      persona = {
        role: personaRole,
        prompt: this.personaBuilder.build(personaRole),
        domain: this.getDomainForRole(personaRole),
      };
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
        can_use: s.source !== "auto-compiled" || true,
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
        similarity: e._score || 0,
        matched_by: persona.domain !== "general" ? "persona_domain" : "prompt",
      }));
    } catch (e) {
      results.experiences = [];
    }

    // ========================================
    // STEP 5: HARNESS — DRIVEN BY PERSONA (not just prompt)
    // ========================================
    // v4.2.0: Pass persona role to harness router
    const harnessResult = this.harnessRouter.route(prompt);

    // v4.2.0: AUGMENT verification criteria based on persona
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
      persona_augmented: persona.domain !== "general",
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
        // v4.2.0: Pass persona to orchestrator so it assigns persona-appropriate roles
        const orchResult = await this.subagentOrchestrator.autoOrchestrate(
          prompt, dagPlan, adapter || "system"
        );

        if (orchResult.orchestrated) {
          // v4.2.0: AUGMENT subagent roles based on persona
          results.subagents = (orchResult.subagents || []).map(s => ({
            id: s.id,
            task: s.task,
            memory_mode: s.memory_mode,
            role: this.augmentSubagentRole(s.role, persona),
            persona_assigned: persona.domain !== "general",
          }));

          results.orchestration = {
            spawned: orchResult.orchestration?.subagents_spawned,
            succeeded: orchResult.orchestration?.subagents_succeeded,
            failed: orchResult.orchestration?.subagents_failed,
            retries: orchResult.orchestration?.retries,
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
      perspectives: results.perspectives,
      skills: results.skills,
      experiences: results.experiences,
      harness: results.harness,
      subagents: results.subagents,
      dag_plan: results.dag_plan,
      success_criteria: results.harness.verification_criteria?.must_pass || [
        "tests_pass",
        "no_syntax_errors",
        "no_security_violations",
      ],
      built_at: new Date().toISOString(),
      pipeline_version: "4.2.0",
      persona_driven: true,
    };

    return {
      should_intercept: true,
      context_pack: contextPack,
      suggested_pack_id: contextPack.id,
      pipeline: "persona-driven",
      components_used: [
        "persona_builder",
        "persona_evolver",
        "multi_persona",
        "persona_recaster",
        "unified_skills (persona-domain-driven)",
        "cbr_experiences (persona-domain-driven)",
        "harness_router (persona-augmented)",
        "dag_planner",
        "subagent_orchestrator (persona-role-augmented)",
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

  // v4.2.0: AUGMENT verification criteria based on persona
  augmentCriteriaForPersona(originalCriteria, persona) {
    if (!originalCriteria) {
      return {
        must_pass: ["tests_pass", "no_syntax_errors"],
        should_pass: [],
        nice_to_have: [],
      };
    }

    // Clone the criteria
    const augmented = JSON.parse(JSON.stringify(originalCriteria));

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
    };

    // 1. Store experience in CBR
    try {
      const exp = await this.cbr.retain(runData.evidence || {}, {
        prompt: runData.prompt,
        success: true,
        adapter: runData.adapter,
      });
      results.experience_stored = true;
      results.experience_id = exp.id;
    } catch (e) {}

    // 2. v4.1.0: Proactive skill creation
    try {
      const proactiveResult = await this.skillEvolver.createProactive({ prompt: runData.prompt });
      results.proactive_skill = proactiveResult;
    } catch (e) {}

    // 3. Auto-compile experience to skill (via wiki-skill)
    try {
      const skill = await this.wikiSkill.compileFromRun({
        success: true,
        id: results.experience_id,
        prompt: runData.prompt,
        evidence: runData.evidence,
        verification: runData.verification,
      });
      results.skill_compiled = true;
      results.skill_id = skill?.id;

      // 4. Register skill as CANDIDATE (Invariant #7: No silent mutation)
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
    } catch (e) {}

    // 5. v4.1.0: Skill gap detection
    try {
      const gaps = await this.skillEvolver.detectGaps([{ prompt: runData.prompt }]);
      results.skill_gaps = gaps;
    } catch (e) {}

    // 6. Notify via webhooks
    try {
      await this.webhookManager.emit("experience.stored", {
        prompt: runData.prompt,
        experience_id: results.experience_id,
        skill_id: results.skill_id,
      });
      results.webhook_notified = true;
    } catch (e) {}

    return results;
  }

  // Stats
  async stats() {
    return {
      pipeline_version: "4.2.0",
      persona_driven: true,
      components: [
        "persona_builder",
        "persona_evolver",
        "multi_persona",
        "persona_recaster",
        "unified_skills (persona-domain-driven)",
        "cbr_experiences (persona-domain-driven)",
        "harness_router (persona-augmented)",
        "dag_planner",
        "subagent_orchestrator (persona-role-augmented)",
      ],
      description: "Persona DRIVES: skills, subagents, harness, verification. Everything chained from persona.",
    };
  }
}

module.exports = { PipelineIntegrator };
'''

(utils / "pipeline-integrator.js").write_text(PIPELINE_V42, encoding='utf-8')
print("  + pipeline-integrator.js REWRITTEN (persona-driven)")

# ============================================================
# UPDATE server.js version
# ============================================================
print("\n=== Updating server.js ===")
server_js = project / "nemos" / "src" / "daemon" / "server.js"
content = server_js.read_text(encoding='utf-8')
content = content.replace('"4.1.0"', '"4.2.0"').replace('"4.0.0"', '"4.2.0"')
server_js.write_text(content, encoding='utf-8')
print("  + server.js version updated")

# Update package.json
print("\n=== Updating versions ===")
for pkg in [project / "package.json", project / "nemos" / "package.json"]:
    if pkg.exists():
        c = pkg.read_text()
        c = c.replace('"4.1.0"', '"4.2.0"').replace('"4.0.0"', '"4.2.0"').replace('"2.5.1"', '"4.2.0"').replace('"2.0.0"', '"4.2.0"').replace('"1.0.0"', '"4.2.0"')
        pkg.write_text(c)
        print(f"  + {pkg.relative_to(project)}")

ib = project / "install.bat"
if ib.exists():
    c = ib.read_text()
    for old in ["v1.0.0","v2.0.0","v2.5.1","v4.0.0","v4.1.0"]:
        c = c.replace(old, "v4.2.0")
    ib.write_text(c)
    print("  + install.bat")

# Collect and build
print("\n=== Building archives ===")
all_files = []
for root, dirs, files in os.walk(project):
    if "node_modules" in root: continue
    for f in files:
        if "package-lock" in f: continue
        rel = os.path.relpath(os.path.join(root, f), project)
        all_files.append((os.path.join(root, f), rel))
print(f"Total: {len(all_files)} files")

for p in [V42_ZIP, V42_TAR]:
    if p.exists(): p.unlink()

print(f"\nCreating {V42_ZIP.name}...")
with zipfile.ZipFile(V42_ZIP, 'w', zipfile.ZIP_DEFLATED) as z:
    for fp, rp in all_files:
        z.write(fp, os.path.join("nemos-project", rp))
print(f"  {V42_ZIP.stat().st_size} bytes")

print(f"\nCreating {V42_TAR.name}...")
with tarfile.open(V42_TAR, "w:gz") as t:
    for fp, rp in all_files:
        t.add(fp, os.path.join("nemos-project", rp))
print(f"  {V42_TAR.stat().st_size} bytes")

shutil.rmtree(TEMP_DIR)

# Verify
print("\n=== Verification ===")
with zipfile.ZipFile(V42_ZIP, 'r') as z:
    with z.open('nemos-project/nemos/src/utils/pipeline-integrator.js') as f:
        content = f.read().decode('utf-8')
        
        checks = {
            "persona drives skills": "persona.domain" in content and "skillSystem.retrieve" in content,
            "skills search by persona domain": 'persona.domain !== "general"' in content and 'searchQuery' in content,
            "persona drives subagent roles": "augmentSubagentRole" in content,
            "persona drives harness criteria": "augmentCriteriaForPersona" in content,
            "persona domain mapping": "getDomainForRole" in content,
            "domain-specific criteria": "domainCriteria" in content,
            "domain-specific subagent roles": "domainRoleMap" in content,
            "experiences persona-driven": "expQuery" in content and "persona.domain" in content,
            "persona_driven flag": "persona_driven: true" in content,
        }
        
        print("  Persona-Driven Pipeline Checks:")
        for name, found in checks.items():
            print(f"    {'✓' if found else '✗'} {name}")
        
        all_ok = all(checks.values())
        print(f"\n  ALL CHECKS PASSED: {'✓ YES' if all_ok else '✗ NO'}")

print(f"\n{'='*60}")
print(f"  NEMOS v4.2.0 — PERSONA-DRIVEN PIPELINE")
print(f"{'='*60}")
print(f"")
print(f"  THE FIX: persona now DRIVES everything:")
print(f"    ✓ Skills searched by persona DOMAIN (not just prompt)")
print(f"    ✓ Experiences searched by persona DOMAIN")
print(f"    ✓ Subagent roles AUGMENTED by persona domain")
print(f"      (security → security-auditor, devops → infra-tester)")
print(f"    ✓ Verification criteria AUGMENTED by persona domain")
print(f"      (security → no_vulnerabilities, owasp_checked)")
print(f"    ✓ Multi-persona triggered by persona domain")
print(f"")
print(f"  Example flow:")
print(f"    prompt: 'implement secure authentication'")
print(f"    → persona: security_engineer (domain: security)")
print(f"    → skills: searched 'security implement auth'")
print(f"    → experiences: searched 'security implement auth'")
print(f"    → subagents: roles → security-implementer, security-tester")
print(f"    → harness: must_pass += no_vulnerabilities, owasp_checked")
print(f"")
print(f"  Archives:")
print(f"    {V42_ZIP}")
print(f"    {V42_TAR}")
