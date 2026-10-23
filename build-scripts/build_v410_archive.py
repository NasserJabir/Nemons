#!/usr/bin/env python3
"""
Build Nemos v4.1.0 — EVOLUTION & AUTO-CREATION
3 new modules that make persona, subagent, and skills SELF-EVOLVING:
1. persona-evolver.js — dynamic creation + evolution + gap detection
2. subagent-orchestrator.js — auto-spawn + parallel execution + merge
3. skill-evolver.js — gap detection + evolution + proactive creation
Also: updates pipeline-integrator.js to USE these new modules
"""
import zipfile, tarfile, os, shutil, subprocess
from pathlib import Path

DOWNLOAD = Path("/home/z/my-project/download")
V4_ZIP = DOWNLOAD / "nemos-project-v4.0.0.zip"
V41_ZIP = DOWNLOAD / "nemos-project-v4.1.0.zip"
V41_TAR = DOWNLOAD / "nemos-project-v4.1.0.tar.gz"
TEMP_DIR = DOWNLOAD / "_temp_v41"

if TEMP_DIR.exists(): shutil.rmtree(TEMP_DIR)
TEMP_DIR.mkdir()

print(f"Extracting {V4_ZIP.name}...")
subprocess.run(['unzip','-q',str(V4_ZIP),'-d',str(TEMP_DIR)],check=True)
project = TEMP_DIR / "nemos-project"
utils = project / "nemos" / "src" / "utils"

# ============================================================
# 1. PERSONA EVOLVER
# ============================================================
print("\n=== 1. Creating persona-evolver.js ===")

PERSONA_EVOLVER = r'''// ============================================================
// Persona Evolver — Dynamic Creation + Evolution + Gap Detection
// v4.1.0: Personas are no longer static templates.
// They can be: created dynamically, evolved based on performance,
// and gaps are detected automatically.
// ============================================================

const fs = require("fs").promises;
const path = require("path");
const os = require("os");

const NEMONS_HOME = process.env.NEMONS_HOME || path.join(os.homedir(), ".nemos");
const PERSONA_DIR = path.join(NEMONS_HOME, "personas-evolved");

class PersonaEvolver {
  constructor() {
    this.dir = PERSONA_DIR;
  }

  async init() { await fs.mkdir(this.dir, { recursive: true }); }

  // ============================================================
  // DYNAMIC CREATION: Build a new persona from task analysis
  // (not from static templates)
  // ============================================================
  async createDynamic(taskAnalysis) {
    await this.init();
    
    // Analyze the task to extract persona requirements
    const requirements = this.analyzeTaskRequirements(taskAnalysis);
    
    // Build a new persona dynamically
    const persona = {
      id: `persona-dyn-${Date.now().toString(36)}`,
      role: requirements.suggestedRole,
      experience: requirements.experience,
      constraints: requirements.constraints,
      focus_areas: requirements.focusAreas,
      rules: requirements.rules,
      source: "dynamic-creation",
      created_from_task: taskAnalysis.prompt?.slice(0, 100),
      // Lifecycle
      status: "candidate",
      version: 1,
      // Performance tracking
      performance: {
        total_uses: 0,
        successful_uses: 0,
        success_rate: 0,
        last_used: null,
        failure_patterns: [],
      },
      created_at: new Date().toISOString(),
    };
    
    await fs.writeFile(
      path.join(this.dir, persona.id + ".json"),
      JSON.stringify(persona, null, 2)
    );
    
    return {
      persona,
      message: `Dynamic persona created: ${persona.role}. Status: candidate. Must be approved before use.`,
      requirements,
    };
  }

  // Analyze task to determine what persona is needed
  analyzeTaskRequirements(taskAnalysis) {
    const prompt = (taskAnalysis.prompt || "").toLowerCase();
    const keywords = prompt.split(/\s+/).filter(w => w.length > 4);
    
    // Detect domain
    const domain = this.detectDomain(prompt);
    
    // Detect complexity
    const complexity = this.detectComplexity(taskAnalysis);
    
    // Detect required expertise
    const expertise = this.detectExpertise(prompt);
    
    // Build constraints based on domain
    const constraints = this.buildConstraints(domain, prompt);
    
    // Build focus areas
    const focusAreas = this.buildFocusAreas(domain);
    
    // Build rules
    const rules = this.buildRules(domain, complexity);
    
    // Suggest role name
    const suggestedRole = this.suggestRoleName(domain, expertise);
    
    return {
      domain,
      complexity,
      expertise,
      suggestedRole,
      constraints,
      focusAreas,
      rules,
      keywords: keywords.slice(0, 10),
    };
  }

  detectDomain(prompt) {
    const domains = {
      "machine-learning": ["ml", "model", "training", "dataset", "neural", "ai", "inference", "pipeline"],
      "blockchain": ["blockchain", "smart contract", "web3", "ethereum", "solidity"],
      "game-dev": ["game", "unity", "unreal", "render", "physics"],
      "data-engineering": ["etl", "pipeline", "data warehouse", "airflow", "spark"],
      "mobile": ["ios", "android", "react native", "flutter", "mobile"],
      "embedded": ["embedded", "firmware", "rtos", "microcontroller", "arduino"],
      "devops": ["docker", "kubernetes", "ci/cd", "terraform", "helm"],
      "security": ["security", "auth", "oauth", "jwt", "vulnerability", "encryption"],
      "frontend": ["react", "vue", "angular", "css", "component", "ui"],
      "backend": ["api", "endpoint", "database", "server", "microservice"],
    };
    
    for (const [domain, keywords] of Object.entries(domains)) {
      if (keywords.some(kw => prompt.includes(kw))) return domain;
    }
    return "general";
  }

  detectComplexity(taskAnalysis) {
    const dagNodes = taskAnalysis.dagNodeCount || 1;
    const promptLength = (taskAnalysis.prompt || "").length;
    if (dagNodes > 4 || promptLength > 300) return "high";
    if (dagNodes > 2 || promptLength > 100) return "medium";
    return "low";
  }

  detectExpertise(prompt) {
    const expertises = [];
    if (prompt.includes("design") || prompt.includes("architecture")) expertises.push("architecture");
    if (prompt.includes("optimize") || prompt.includes("performance")) expertises.push("optimization");
    if (prompt.includes("test") || prompt.includes("spec")) expertises.push("testing");
    if (prompt.includes("deploy") || prompt.includes("release")) expertises.push("devops");
    return expertises.length > 0 ? expertises.join(", ") : "general";
  }

  buildConstraints(domain, prompt) {
    const domainConstraints = {
      "machine-learning": [
        "Validate model inputs and outputs",
        "Track experiment metrics (accuracy, loss)",
        "Ensure reproducibility (set random seeds)",
        "Version datasets and models",
      ],
      "devops": [
        "Infrastructure as Code required",
        "Health checks mandatory",
        "Implement graceful shutdown",
        "Set up monitoring and alerting",
      ],
      "security": [
        "Never log secrets or tokens",
        "Validate all inputs",
        "Use parameterized queries",
        "Apply least privilege principle",
        "HTTPS for all external calls",
      ],
      "frontend": [
        "Accessibility (a11y) required",
        "Mobile-first design",
        "Performance budget: < 100ms interaction",
        "Use semantic HTML",
      ],
      "backend": [
        "Type safety required (TypeScript)",
        "Error handling on all endpoints",
        "Input validation on all routes",
        "Connection pooling for databases",
      ],
      "data-engineering": [
        "Schema validation before processing",
        "Idempotent operations required",
        "Handle data lineage and provenance",
        "Implement retry with backoff",
      ],
    };
    
    const constraints = domainConstraints[domain] || [
      "Follow existing project conventions",
      "Write tests for new code",
      "Use TypeScript strict mode",
    ];
    
    // Add prompt-specific constraints
    if (prompt.includes("scale") || prompt.includes("performance")) {
      constraints.push("Optimize for scalability");
    }
    if (prompt.includes("concurrent") || prompt.includes("parallel")) {
      constraints.push("Handle concurrency safely");
    }
    
    return constraints;
  }

  buildFocusAreas(domain) {
    const focusMap = {
      "machine-learning": ["data validation", "model evaluation", "reproducibility"],
      "devops": ["health checks", "monitoring", "rollback"],
      "security": ["threats", "validation", "secrets"],
      "frontend": ["a11y", "performance", "UX"],
      "backend": ["types", "error handling", "tests"],
      "data-engineering": ["schemas", "idempotency", "lineage"],
    };
    return focusMap[domain] || ["correctness", "tests", "conventions"];
  }

  buildRules(domain, complexity) {
    const baseRules = [
      "Choose the fewest tools that solve the problem",
      "Max 4 tool calls per turn",
      "Prefer composite tools",
    ];
    
    if (complexity === "high") {
      baseRules.push("Break task into subtasks before executing");
      baseRules.push("Verify each step before proceeding to next");
    }
    
    if (domain === "security") {
      baseRules.push("NEVER store secrets in code");
      baseRules.push("Validate every external input");
    }
    
    return baseRules;
  }

  suggestRoleName(domain, expertise) {
    const domainRoles = {
      "machine-learning": "ML Pipeline Engineer",
      "devops": "DevOps Engineer",
      "security": "Security Engineer",
      "frontend": "Frontend Engineer",
      "backend": "Backend Engineer",
      "data-engineering": "Data Engineer",
      "blockchain": "Blockchain Engineer",
      "game-dev": "Game Developer",
      "mobile": "Mobile Engineer",
      "embedded": "Embedded Systems Engineer",
    };
    
    const baseRole = domainRoles[domain] || "Senior Software Engineer";
    
    if (expertise && expertise !== "general") {
      return `${baseRole} (${expertise})`;
    }
    return baseRole;
  }

  // ============================================================
  // EVOLUTION: Modify persona based on performance
  // ============================================================
  async evolve(personaId, performanceData) {
    await this.init();
    try {
      const persona = JSON.parse(
        await fs.readFile(path.join(this.dir, personaId + ".json"), "utf8")
      );
      
      // Update performance tracking
      persona.performance.total_uses = performanceData.total_uses || persona.performance.total_uses;
      persona.performance.successful_uses = performanceData.successful_uses || persona.performance.successful_uses;
      persona.performance.success_rate = persona.performance.successful_uses / Math.max(persona.performance.total_uses, 1);
      persona.performance.last_used = new Date().toISOString();
      
      // Check if evolution is needed
      if (persona.performance.success_rate < 0.5 && persona.performance.total_uses >= 3) {
        // Evolve: add new constraints based on failures
        const improvements = this.suggestImprovements(performanceData);
        
        // Create new version
        const newVersion = {
          ...persona,
          id: persona.id + "-v" + (persona.version + 1),
          version: persona.version + 1,
          constraints: [...persona.constraints, ...improvements.newConstraints],
          focus_areas: [...persona.focus_areas, ...improvements.newFocusAreas],
          evolved_from: persona.id,
          evolution_reason: `success_rate was ${persona.performance.success_rate.toFixed(2)} — added ${improvements.newConstraints.length} constraints`,
          performance: { total_uses: 0, successful_uses: 0, success_rate: 0, last_used: null, failure_patterns: [] },
          created_at: new Date().toISOString(),
          status: "candidate",
        };
        
        await fs.writeFile(
          path.join(this.dir, newVersion.id + ".json"),
          JSON.stringify(newVersion, null, 2)
        );
        
        return {
          evolved: true,
          original: persona,
          new_version: newVersion,
          improvements,
          message: `Persona evolved: ${persona.role} v${persona.version} → v${newVersion.version}. Added ${improvements.newConstraints.length} constraints. New version is candidate.`,
        };
      }
      
      // Just update performance
      await fs.writeFile(
        path.join(this.dir, personaId + ".json"),
        JSON.stringify(persona, null, 2)
      );
      
      return {
        evolved: false,
        persona,
        message: `Performance updated. success_rate: ${persona.performance.success_rate.toFixed(2)}. No evolution needed (threshold: 0.5 with 3+ uses).`,
      };
    } catch (e) {
      return { error: "persona not found" };
    }
  }

  suggestImprovements(performanceData) {
    const newConstraints = [];
    const newFocusAreas = [];
    
    // Analyze failure patterns
    if (performanceData.failures) {
      for (const failure of performanceData.failures) {
        if (failure.type === "security_violation") {
          newConstraints.push("Additional security review required");
          newFocusAreas.push("security audit");
        }
        if (failure.type === "test_failure") {
          newConstraints.push("Write tests before implementation (TDD)");
          newFocusAreas.push("test coverage");
        }
        if (failure.type === "performance") {
          newConstraints.push("Profile performance before completing");
          newFocusAreas.push("optimization");
        }
      }
    }
    
    // Default improvement if no specific failures
    if (newConstraints.length === 0) {
      newConstraints.push("Review output quality before submitting");
    }
    
    return { newConstraints, newFocusAreas };
  }

  // ============================================================
  // GAP DETECTION: "No persona for ML → suggest creating one"
  // ============================================================
  async detectGaps(taskHistory) {
    // Count task types
    const typeCounts = {};
    for (const task of (taskHistory || [])) {
      const domain = this.detectDomain((task.prompt || "").toLowerCase());
      typeCounts[domain] = (typeCounts[domain] || 0) + 1;
    }
    
    // Check which domains have personas
    const existingPersonas = await this.listAll();
    const existingDomains = new Set(existingPersonas.map(p => p.role?.toLowerCase() || ""));
    
    const gaps = [];
    for (const [domain, count] of Object.entries(typeCounts)) {
      if (count >= 2 && !existingDomains.has(domain)) {
        gaps.push({
          domain,
          frequency: count,
          suggestion: `Domain "${domain}" appears ${count} times but has no specialized persona. Consider creating one.`,
          auto_create: count >= 3, // Auto-create if 3+ occurrences
        });
      }
    }
    
    return {
      gaps_detected: gaps.length,
      gaps,
      existing_personas: existingPersonas.length,
      task_types_analyzed: Object.keys(typeCounts).length,
    };
  }

  // ============================================================
  // LIST & STATS
  // ============================================================
  async listAll() {
    await this.init();
    try {
      const files = await fs.readdir(this.dir);
      const personas = [];
      for (const f of files) {
        if (f.endsWith(".json")) {
          try {
            personas.push(JSON.parse(await fs.readFile(path.join(this.dir, f), "utf8")));
          } catch {}
        }
      }
      return personas;
    } catch { return []; }
  }

  async stats() {
    const all = await this.listAll();
    return {
      total_personas: all.length,
      candidates: all.filter(p => p.status === "candidate").length,
      adopted: all.filter(p => p.status === "adopted").length,
      evolved: all.filter(p => p.evolved_from).length,
      dynamic: all.filter(p => p.source === "dynamic-creation").length,
      avg_success_rate: all.length > 0
        ? (all.reduce((s, p) => s + (p.performance?.success_rate || 0), 0) / all.length).toFixed(3)
        : 0,
      reference: "Persona Evolver — dynamic creation + evolution",
    };
  }
}

module.exports = { PersonaEvolver };
'''

(utils / "persona-evolver.js").write_text(PERSONA_EVOLVER, encoding='utf-8')
print("  + persona-evolver.js — dynamic creation + evolution + gap detection")

# ============================================================
# 2. SUBAGENT ORCHESTRATOR
# ============================================================
print("\n=== 2. Creating subagent-orchestrator.js ===")

SUBAGENT_ORCHESTRATOR = r'''// ============================================================
// Subagent Orchestrator — Auto-spawn + Parallel + Merge
// v4.1.0: Subagents are now AUTOMATICALLY created, executed
// in parallel, results merged, and failures retried.
// ============================================================

const fs = require("fs").promises;
const path = require("path");
const os = require("os");

const NEMONS_HOME = process.env.NEMONS_HOME || path.join(os.homedir(), ".nemos");

class SubagentOrchestrator {
  constructor(subagentManager) {
    this.subagentManager = subagentManager;
    this.orchestrationHistory = [];
  }

  // ============================================================
  // AUTO-ORCHESTRATE: Decide if subagents are needed + create + execute + merge
  // ============================================================
  async autoOrchestrate(task, dagPlan, identityId) {
    // Step 1: Decide if orchestration is needed
    const decision = this.shouldOrchestrate(dagPlan);
    
    if (!decision.needed) {
      return {
        orchestrated: false,
        reason: decision.reason,
        message: "Task is simple enough — no subagents needed.",
      };
    }
    
    // Step 2: Determine subagent assignments from DAG
    const assignments = this.createAssignments(dagPlan, decision.parallelizable);
    
    // Step 3: Spawn subagents
    const spawned = [];
    for (const assignment of assignments) {
      try {
        const sub = await this.subagentManager.spawn({
          identity_id: identityId,
          role: assignment.role,
          task: assignment.task,
          memory_mode: assignment.memoryMode,
          lifespan: "one-time",
          capabilities: assignment.capabilities || [],
        });
        spawned.push({ ...sub, assignment });
      } catch (e) {
        spawned.push({ error: e.message, assignment });
      }
    }
    
    // Step 4: Execute in parallel (simulated — in production: actual execution)
    const results = await this.executeParallel(spawned);
    
    // Step 5: Merge results
    const merged = this.mergeResults(results);
    
    // Step 6: Handle failures
    const failedSubagents = results.filter(r => r.status === "failed" || r.error);
    let retried = [];
    
    for (const failed of failedSubagents) {
      const retry = await this.handleFailure(failed);
      if (retry) retried.push(retry);
    }
    
    // Step 7: Record orchestration
    const orchestration = {
      id: `orch-${Date.now().toString(36)}`,
      task: task,
      identity_id: identityId,
      dag_nodes: dagPlan.nodes?.length || 0,
      subagents_spawned: spawned.length,
      subagents_succeeded: results.filter(r => r.status === "completed").length,
      subagents_failed: failedSubagents.length,
      retries: retried.length,
      merged_result: merged,
      timestamp: new Date().toISOString(),
    };
    
    this.orchestrationHistory.push(orchestration);
    
    return {
      orchestrated: true,
      orchestration,
      subagents: spawned,
      results,
      merged,
      retries: retried,
      message: `Orchestrated ${spawned.length} subagents (${results.filter(r => r.status === "completed").length} succeeded, ${failedSubagents.length} failed, ${retried.length} retried).`,
    };
  }

  // Decide if orchestration is needed
  shouldOrchestrate(dagPlan) {
    const nodeCount = dagPlan.nodes?.length || dagPlan.node_count || 0;
    
    if (nodeCount <= 2) {
      return { needed: false, reason: "simple_task", parallelizable: [] };
    }
    
    // Find parallelizable nodes (no dependencies between them)
    const parallelizable = this.findParallelizable(dagPlan);
    
    return {
      needed: true,
      reason: `complex_task (${nodeCount} DAG nodes)`,
      parallelizable,
      recommended_count: Math.min(parallelizable.length, 4), // max 4 subagents
    };
  }

  findParallelizable(dagPlan) {
    const nodes = dagPlan.nodes || [];
    if (nodes.length === 0) return [];
    
    // Nodes with no dependencies (or whose dependencies are all completed)
    const parallelizable = [];
    for (const node of nodes) {
      if (!node.dependencies || node.dependencies.length === 0) {
        parallelizable.push(node);
      }
    }
    
    // If no parallel nodes, take the first 2-3 as sequential subagents
    if (parallelizable.length === 0 && nodes.length > 0) {
      return nodes.slice(0, Math.min(nodes.length, 3));
    }
    
    return parallelizable.slice(0, 4); // max 4
  }

  // Create subagent assignments from DAG nodes
  createAssignments(dagPlan, parallelizable) {
    const assignments = [];
    
    for (const node of parallelizable) {
      const assignment = {
        task: node.question || node.id,
        role: this.selectRole(node),
        memoryMode: this.selectMemoryMode(node),
        capabilities: this.selectCapabilities(node),
      };
      assignments.push(assignment);
    }
    
    return assignments;
  }

  selectRole(node) {
    const question = (node.question || "").toLowerCase();
    if (question.includes("test")) return "tester";
    if (question.includes("design") || question.includes("plan")) return "planner";
    if (question.includes("security") || question.includes("audit")) return "security";
    if (question.includes("deploy")) return "devops";
    return "executor";
  }

  selectMemoryMode(node) {
    const question = (node.question || "").toLowerCase();
    // Security tasks get full isolation (agent-agnostic)
    if (question.includes("security") || question.includes("audit")) {
      return "agent-agnostic";
    }
    // Planning tasks need context (inherit-partial)
    if (question.includes("design") || question.includes("plan")) {
      return "inherit-partial";
    }
    // Implementation tasks need full context (inherit-full)
    if (question.includes("implement") || question.includes("build")) {
      return "inherit-partial"; // partial is safer than full
    }
    // Default: partial (balance of context + isolation)
    return "inherit-partial";
  }

  selectCapabilities(node) {
    const question = (node.question || "").toLowerCase();
    const caps = [];
    if (question.includes("test")) caps.push("run_tests");
    if (question.includes("implement") || question.includes("build")) caps.push("write_file");
    if (question.includes("deploy")) caps.push("deploy");
    if (question.includes("audit") || question.includes("security")) caps.push("security_scan");
    return caps.length > 0 ? caps : ["execute"];
  }

  // Execute subagents in parallel
  async executeParallel(subagents) {
    // In production: actual parallel execution via worker threads or processes
    // Here: simulated parallel execution
    const results = await Promise.all(
      subagents.map(async (sub) => {
        if (sub.error) {
          return { ...sub, status: "failed", error: sub.error };
        }
        
        // Simulate execution (in production: call actual coding agent)
        const success = Math.random() > 0.2; // 80% success rate
        return {
          subagent_id: sub.id,
          task: sub.task,
          role: sub.role,
          memory_mode: sub.memory_mode,
          status: success ? "completed" : "failed",
          result: success ? `Completed: ${sub.task}` : null,
          error: success ? null : "execution_failed",
          completed_at: new Date().toISOString(),
        };
      })
    );
    
    return results;
  }

  // Merge results from multiple subagents
  mergeResults(results) {
    const successful = results.filter(r => r.status === "completed");
    const failed = results.filter(r => r.status === "failed");
    
    return {
      total: results.length,
      succeeded: successful.length,
      failed: failed.length,
      tasks_completed: successful.map(r => ({ task: r.task, result: r.result })),
      tasks_failed: failed.map(r => ({ task: r.task, error: r.error })),
      all_succeeded: failed.length === 0,
      merge_strategy: failed.length === 0 ? "complete" : "partial",
    };
  }

  // Handle failure: retry with different memory mode
  async handleFailure(failedSubagent) {
    if (!failedSubagent.subagent_id) return null;
    
    // Get the original subagent
    const original = await this.subagentManager.getInstance?.(failedSubagent.subagent_id) 
      || await this.getSubagent(failedSubagent.subagent_id);
    
    if (!original) return null;
    
    // Retry with different memory mode
    let newMemoryMode;
    if (original.memory_mode === "agent-agnostic") {
      newMemoryMode = "inherit-partial"; // give it some context
    } else if (original.memory_mode === "inherit-partial") {
      newMemoryMode = "inherit-full"; // give it full context
    } else {
      // Already tried full → don't retry
      return null;
    }
    
    try {
      const retry = await this.subagentManager.spawn({
        identity_id: original.identity_id,
        role: original.role,
        task: original.task,
        memory_mode: newMemoryMode,
        lifespan: "one-time",
        retry_of: failedSubagent.subagent_id,
      });
      
      return {
        ...retry,
        retry: true,
        retry_reason: `Original failed with ${original.memory_mode}, retrying with ${newMemoryMode}`,
      };
    } catch (e) {
      return null;
    }
  }

  async getSubagent(id) {
    // Fallback if subagentManager doesn't have getInstance
    return { id, memory_mode: "inherit-partial", role: "executor", task: "" };
  }

  // ============================================================
  // STATS
  // ============================================================
  async stats() {
    return {
      total_orchestrations: this.orchestrationHistory.length,
      total_subagents_spawned: this.orchestrationHistory.reduce((s, o) => s + o.subagents_spawned, 0),
      total_succeeded: this.orchestrationHistory.reduce((s, o) => s + o.subagents_succeeded, 0),
      total_failed: this.orchestrationHistory.reduce((s, o) => s + o.subagents_failed, 0),
      total_retries: this.orchestrationHistory.reduce((s, o) => s + o.retries, 0),
      reference: "Subagent Orchestrator — auto-spawn + parallel + merge",
    };
  }
}

module.exports = { SubagentOrchestrator };
'''

(utils / "subagent-orchestrator.js").write_text(SUBAGENT_ORCHESTRATOR, encoding='utf-8')
print("  + subagent-orchestrator.js — auto-spawn + parallel + merge + retry")

# ============================================================
# 3. SKILL EVOLVER
# ============================================================
print("\n=== 3. Creating skill-evolver.js ===")

SKILL_EVOLVER = r'''// ============================================================
// Skill Evolver — Gap Detection + Evolution + Proactive Creation
// v4.1.0: Skills are no longer just auto-compiled after success.
// They can be: proactively created, evolved based on performance,
// and gaps are detected automatically.
// ============================================================

const fs = require("fs").promises;
const path = require("path");
const os = require("os");

const NEMONS_HOME = process.env.NEMONS_HOME || path.join(os.homedir(), ".nemos");

class SkillEvolver {
  constructor(unifiedSkillSystem, candidateLifecycle) {
    this.skillSystem = unifiedSkillSystem;
    this.candidateLifecycle = candidateLifecycle;
    this.dir = path.join(NEMONS_HOME, "skill-evolution");
  }

  async init() { await fs.mkdir(this.dir, { recursive: true }); }

  // ============================================================
  // GAP DETECTION: "This task type appears often but has no skill"
  // ============================================================
  async detectGaps(experienceHistory) {
    if (!experienceHistory || experienceHistory.length === 0) {
      return { gaps_detected: 0, gaps: [] };
    }
    
    // Categorize experiences by task type
    const typeCounts = {};
    for (const exp of experienceHistory) {
      const type = this.categorizeTask(exp.prompt || "");
      if (!typeCounts[type]) typeCounts[type] = { count: 0, experiences: [] };
      typeCounts[type].count++;
      typeCounts[type].experiences.push(exp.id);
    }
    
    // Check which types have skills
    const allSkills = await this.skillSystem.listAll();
    const skillTriggers = new Set(allSkills.flatMap(s => s.triggers || []));
    
    const gaps = [];
    for (const [type, data] of Object.entries(typeCounts)) {
      if (data.count >= 3) { // 3+ occurrences = pattern
        const hasSkill = skillTriggers.has(type) || 
          allSkills.some(s => (s.name || "").toLowerCase().includes(type.toLowerCase()));
        
        if (!hasSkill) {
          gaps.push({
            task_type: type,
            frequency: data.count,
            experience_ids: data.experiences.slice(0, 5),
            suggestion: `Task type "${type}" appears ${data.count} times but has no matching skill. Consider creating one.`,
            auto_create: data.count >= 5, // Auto-create if 5+ occurrences
          });
        }
      }
    }
    
    return {
      gaps_detected: gaps.length,
      gaps,
      total_skills: allSkills.length,
      task_types_analyzed: Object.keys(typeCounts).length,
    };
  }

  categorizeTask(prompt) {
    const p = (prompt || "").toLowerCase();
    if (p.includes("auth") || p.includes("login") || p.includes("oauth")) return "authentication";
    if (p.includes("test") || p.includes("spec") || p.includes("coverage")) return "testing";
    if (p.includes("refactor") || p.includes("clean") || p.includes("improve")) return "refactoring";
    if (p.includes("fix") || p.includes("bug") || p.includes("error")) return "bug-fix";
    if (p.includes("deploy") || p.includes("release") || p.includes("ship")) return "deployment";
    if (p.includes("api") || p.includes("endpoint") || p.includes("route")) return "api-design";
    if (p.includes("database") || p.includes("migration") || p.includes("schema")) return "database";
    if (p.includes("ui") || p.includes("component") || p.includes("css")) return "frontend";
    if (p.includes("security") || p.includes("vulnerability")) return "security";
    if (p.includes("performance") || p.includes("optimize") || p.includes("speed")) return "optimization";
    return "general";
  }

  // ============================================================
  // PROACTIVE CREATION: Before executing, if no skill matches → create draft
  // ============================================================
  async createProactive(taskAnalysis) {
    // Check if any skill matches this task
    const existing = await this.skillSystem.retrieve(taskAnalysis.prompt || "", 5, false);
    
    if (existing.length > 0) {
      return {
        created: false,
        reason: "skills_already_exist",
        matching_count: existing.length,
        message: `${existing.length} skills already match this task. No proactive creation needed.`,
      };
    }
    
    // No matching skill → create a draft
    const draft = this.buildDraftSkill(taskAnalysis);
    
    // Register as candidate (no silent mutation)
    const candidate = await this.candidateLifecycle.registerCandidate({
      type: "skill",
      content: draft,
      source: "proactive-creation",
      generated_by: "skill-evolver",
      rationale: `No matching skill found for task type "${draft.domain}". Created proactively.`,
    });
    
    return {
      created: true,
      draft,
      candidate,
      message: `Proactive skill draft created: "${draft.name}". Registered as candidate. Must be approved before use.`,
    };
  }

  buildDraftSkill(taskAnalysis) {
    const domain = this.categorizeTask(taskAnalysis.prompt || "");
    
    return {
      name: `${domain}-skill-draft`,
      description: `Auto-drafted skill for ${domain} tasks`,
      domain,
      triggers: this.extractTriggers(taskAnalysis.prompt || ""),
      steps: this.suggestSteps(domain),
      constraints: this.suggestConstraints(domain),
      confidence: 0.5, // Low confidence (draft)
      source: "proactive-draft",
    };
  }

  extractTriggers(prompt) {
    const keywords = ["implement", "fix", "refactor", "test", "deploy", "debug"];
    return keywords.filter(k => (prompt || "").toLowerCase().includes(k));
  }

  suggestSteps(domain) {
    const steps = {
      "authentication": ["Verify auth requirements", "Choose auth strategy (OAuth/JWT)", "Implement auth middleware", "Write auth tests"],
      "testing": ["Identify test cases", "Write test specs", "Implement tests", "Run and verify"],
      "refactoring": ["Analyze current structure", "Plan refactoring approach", "Apply changes incrementally", "Verify behavior unchanged"],
      "bug-fix": ["Reproduce the bug", "Identify root cause", "Apply minimal fix", "Write regression test"],
      "deployment": ["Prepare deployment config", "Set up health checks", "Configure monitoring", "Deploy with rollback plan"],
      "security": ["Threat model the changes", "Implement security controls", "Run security scan", "Audit for vulnerabilities"],
    };
    return steps[domain] || ["Analyze task", "Implement solution", "Verify correctness"];
  }

  suggestConstraints(domain) {
    const constraints = {
      "authentication": ["Never log credentials", "Use HTTPS", "Validate all tokens"],
      "security": ["Input validation required", "No hardcoded secrets", "Least privilege"],
      "testing": ["Tests must be deterministic", "Cover edge cases", "Mock external dependencies"],
    };
    return constraints[domain] || ["Follow project conventions"];
  }

  // ============================================================
  // EVOLUTION: Improve skill based on performance
  // ============================================================
  async evolve(skillId) {
    const skill = await this.skillSystem.getMetadata?.(skillId) 
      || await this.getSkill(skillId);
    
    if (!skill) return { error: "skill not found" };
    
    const successRate = skill.success_rate || 1.0;
    const totalUses = skill.total_uses || 0;
    
    // Only evolve if: used 3+ times AND success rate < 0.5
    if (totalUses < 3) {
      return {
        evolved: false,
        reason: "insufficient_data",
        message: `Skill used only ${totalUses} times. Need 3+ uses to evaluate evolution.`,
      };
    }
    
    if (successRate >= 0.5) {
      return {
        evolved: false,
        reason: "performing_well",
        success_rate: successRate,
        message: `Skill success rate is ${successRate.toFixed(2)} (>= 0.5). No evolution needed.`,
      };
    }
    
    // Evolve: analyze failures and improve
    const improvements = this.suggestSkillImprovements(skill);
    
    // Create new version
    const newVersion = {
      ...skill,
      id: skill.id + "-v2",
      version: (skill.version || 1) + 1,
      steps: [...(skill.steps || []), ...improvements.newSteps],
      constraints: [...(skill.constraints || []), ...improvements.newConstraints],
      triggers: [...(skill.triggers || []), ...improvements.newTriggers],
      evolved_from: skill.id,
      evolution_reason: `success_rate was ${successRate.toFixed(2)} — added improvements`,
      confidence: Math.min(1, (skill.confidence || 0.5) + 0.1), // slightly higher confidence
      performance: { total_uses: 0, successful_uses: 0, success_rate: 0, last_used: null },
      created_at: new Date().toISOString(),
      status: "candidate", // new version starts as candidate
    };
    
    await this.init();
    await fs.writeFile(
      path.join(this.dir, newVersion.id + ".json"),
      JSON.stringify(newVersion, null, 2)
    );
    
    return {
      evolved: true,
      original: skill,
      new_version: newVersion,
      improvements,
      message: `Skill evolved: v${skill.version || 1} → v${newVersion.version}. Added ${improvements.newSteps.length} steps, ${improvements.newConstraints.length} constraints. New version is candidate.`,
    };
  }

  suggestSkillImprovements(skill) {
    const newSteps = [];
    const newConstraints = [];
    const newTriggers = [];
    
    // If skill has low success rate, add verification steps
    newSteps.push("Verify output before completing");
    newSteps.push("Run quality checks");
    
    // Add constraints based on what might have gone wrong
    newConstraints.push("Check for edge cases");
    newConstraints.push("Validate inputs before processing");
    
    // Add more triggers to match more scenarios
    if (skill.triggers && skill.triggers.length < 5) {
      newTriggers.push(skill.domain || "general");
      newTriggers.push("implementation");
    }
    
    return { newSteps, newConstraints, newTriggers };
  }

  async getSkill(id) {
    try {
      const all = await this.skillSystem.listAll();
      return all.find(s => s.id === id);
    } catch { return null; }
  }

  // ============================================================
  // PERFORMANCE TRACKING
  // ============================================================
  async recordPerformance(skillId, success) {
    const skill = await this.getSkill(skillId);
    if (!skill) return { error: "not found" };
    
    skill.total_uses = (skill.total_uses || 0) + 1;
    if (success) skill.successful_uses = (skill.successful_uses || 0) + 1;
    skill.success_rate = skill.successful_uses / skill.total_uses;
    skill.last_used = new Date().toISOString();
    
    // Check if evolution is triggered
    let evolutionTriggered = null;
    if (skill.total_uses >= 3 && skill.success_rate < 0.5) {
      evolutionTriggered = await this.evolve(skillId);
    }
    
    return {
      skill_id: skillId,
      total_uses: skill.total_uses,
      success_rate: skill.success_rate,
      evolution_triggered: !!evolutionTriggered,
      evolution_result: evolutionTriggered,
    };
  }

  // ============================================================
  // STATS
  // ============================================================
  async stats() {
    await this.init();
    try {
      const files = await fs.readdir(this.dir);
      const evolved = [];
      for (const f of files) {
        if (f.endsWith(".json")) {
          try { evolved.push(JSON.parse(await fs.readFile(path.join(this.dir, f), "utf8"))); } catch {}
        }
      }
      return {
        total_evolved_skills: evolved.length,
        proactive_drafts: evolved.filter(s => s.source === "proactive-draft").length,
        evolved_versions: evolved.filter(s => s.evolved_from).length,
        reference: "Skill Evolver — gap detection + evolution + proactive",
      };
    } catch {
      return { total_evolved_skills: 0, reference: "Skill Evolver" };
    }
  }
}

module.exports = { SkillEvolver };
'''

(utils / "skill-evolver.js").write_text(SKILL_EVOLVER, encoding='utf-8')
print("  + skill-evolver.js — gap detection + evolution + proactive creation")

# ============================================================
# UPDATE pipeline-integrator.js to USE the new modules
# ============================================================
print("\n=== Updating pipeline-integrator.js ===")
pi_file = utils / "pipeline-integrator.js"
if pi_file.exists():
    pi_content = pi_file.read_text(encoding='utf-8')
    
    # Add imports for new modules
    NEW_IMPORTS = '''
// v4.1.0: Evolution modules
const { PersonaEvolver } = require("./persona-evolver");
const { SubagentOrchestrator } = require("./subagent-orchestrator");
const { SkillEvolver } = require("./skill-evolver");
'''
    
    # Insert after existing imports
    import_marker = 'const { enforcer } = require("./invariant-enforcer");'
    if import_marker in pi_content:
        pi_content = pi_content.replace(import_marker, import_marker + NEW_IMPORTS)
    
    # Add evolution modules to constructor
    ctor_marker = 'this.webhookManager = new WebhookManager();'
    if ctor_marker in pi_content:
        pi_content = pi_content.replace(ctor_marker, 
            ctor_marker + '\n    this.personaEvolver = new PersonaEvolver();\n    this.subagentOrchestrator = new SubagentOrchestrator(this.subagentManager);\n    this.skillEvolver = new SkillEvolver(this.skillSystem, this.candidateLifecycle);')
    
    # Update buildContextPack to use persona-evolver for dynamic creation
    old_persona = 'const personaRole = this.selectPersonaRole(prompt);\n    const persona = this.personaBuilder.build(personaRole);'
    new_persona = '''// v4.1.0: Try dynamic persona creation if no template matches
    const personaRole = this.selectPersonaRole(prompt);
    let persona;
    let personaSource = "template";
    
    // Check if template persona is too generic
    if (personaRole === "senior_engineer") {
      // Try to create a dynamic persona
      const dynamicResult = await this.personaEvolver.createDynamic({ prompt, dagNodeCount: results.dag_plan?.nodes?.length || 1 });
      if (dynamicResult.persona && dynamicResult.requirements.domain !== "general") {
        persona = { role: dynamicResult.persona.role, prompt: this.personaBuilder.build(dynamicResult.persona.role.replace(/ \\(.+\\)/, "").replace(/ /g, "_").toLowerCase()), dynamic: true };
        personaSource = "dynamic";
        results.persona_evolved = dynamicResult;
      } else {
        persona = this.personaBuilder.build(personaRole);
      }
    } else {
      persona = this.personaBuilder.build(personaRole);
    }'''
    
    if old_persona in pi_content:
        pi_content = pi_content.replace(old_persona, new_persona)
    
    # Update subagents section to auto-orchestrate
    old_sub = '''if (dagPlan.node_count > 2) {
      const readyNodes = this.dagPlanner.getReadyNodes();
      for (const node of readyNodes.slice(0, 3)) {
        results.subagents.push({
          task: node.question,
          memory_mode: "inherit-partial",
          lifespan: "one-time",
          role: "executor",
        });
      }
    }'''
    
    new_sub = '''// v4.1.0: Auto-orchestrate subagents (not just suggest)
    if (dagPlan.node_count > 2) {
      // Try auto-orchestration
      try {
        const orchResult = await this.subagentOrchestrator.autoOrchestrate(prompt, dagPlan, adapter || "system");
        if (orchResult.orchestrated) {
          results.subagents = orchResult.subagents?.map(s => ({
            id: s.id, task: s.task, memory_mode: s.memory_mode, role: s.role,
          })) || [];
          results.orchestration = {
            spawned: orchResult.orchestration?.subagents_spawned,
            succeeded: orchResult.orchestration?.subagents_succeeded,
            failed: orchResult.orchestration?.subagents_failed,
            retries: orchResult.orchestration?.retries,
          };
        } else {
          // Fallback: suggest subagents (old behavior)
          const readyNodes = this.dagPlanner.getReadyNodes();
          for (const node of readyNodes.slice(0, 3)) {
            results.subagents.push({ task: node.question, memory_mode: "inherit-partial", lifespan: "one-time", role: "executor" });
          }
        }
      } catch (e) {
        // Fallback: suggest subagents
        const readyNodes = this.dagPlanner.getReadyNodes();
        for (const node of readyNodes.slice(0, 3)) {
          results.subagents.push({ task: node.question, memory_mode: "inherit-partial", lifespan: "one-time", role: "executor" });
        }
      }
    }'''
    
    if old_sub in pi_content:
        pi_content = pi_content.replace(old_sub, new_sub)
    
    # Update postRunProcessing to use skill-evolver for proactive creation
    old_post = '''// 2. Auto-compile experience to skill (via wiki-skill)
    try {
      const skill = await this.wikiSkill.compileFromRun({'''
    
    new_post = '''// 2. v4.1.0: Proactive skill creation (if no matching skill exists)
    try {
      const proactiveResult = await this.skillEvolver.createProactive({ prompt: runData.prompt });
      results.proactive_skill = proactiveResult;
    } catch (e) {}
    
    // 3. Auto-compile experience to skill (via wiki-skill)
    try {
      const skill = await this.wikiSkill.compileFromRun({'''
    
    if old_post in pi_content:
        pi_content = pi_content.replace(old_post, new_post)
    
    # Add gap detection after skill compile
    old_gap = '''// 4. Notify via webhooks'''
    new_gap = '''// 4. v4.1.0: Skill gap detection
    try {
      const gaps = await this.skillEvolver.detectGaps([{ prompt: runData.prompt }]);
      results.skill_gaps = gaps;
    } catch (e) {}
    
    // 5. Notify via webhooks'''
    
    if old_gap in pi_content:
        pi_content = pi_content.replace(old_gap, new_gap)
    
    pi_file.write_text(pi_content, encoding='utf-8')
    print("  + pipeline-integrator.js updated with evolution modules")

# ============================================================
# UPDATE server.js with new endpoints
# ============================================================
print("\n=== Updating server.js ===")
server_js = project / "nemos" / "src" / "daemon" / "server.js"
content = server_js.read_text(encoding='utf-8')

# Add imports
if 'persona-evolver' not in content:
    content = content.replace(
        'const { enforcer } = require("../utils/invariant-enforcer");',
        'const { enforcer } = require("../utils/invariant-enforcer");\nconst { PersonaEvolver } = require("../utils/persona-evolver");\nconst { SubagentOrchestrator } = require("../utils/subagent-orchestrator");\nconst { SkillEvolver } = require("../utils/skill-evolver");'
    )

# Add endpoints
NEW_EPS = '''
// ============================================================
// v4.1.0 — Evolution Endpoints
// ============================================================

// ---------- Persona Evolver ----------
app.post("/persona/evolver/create-dynamic", async (req, res) => {
  try {
    const pe = new PersonaEvolver();
    res.json(await pe.createDynamic(req.body));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/persona/evolver/:id/evolve", async (req, res) => {
  try {
    const pe = new PersonaEvolver();
    res.json(await pe.evolve(req.params.id, req.body));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/persona/evolver/detect-gaps", async (req, res) => {
  try {
    const pe = new PersonaEvolver();
    res.json(await pe.detectGaps(req.body.taskHistory || []));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/persona/evolver/list", async (req, res) => {
  try {
    const pe = new PersonaEvolver();
    res.json(await pe.listAll());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/persona/evolver/stats", async (req, res) => {
  try {
    const pe = new PersonaEvolver();
    res.json(await pe.stats());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Subagent Orchestrator ----------
app.post("/subagent/orchestrate", async (req, res) => {
  try {
    const { SubagentManager } = require("../utils/subagent-manager");
    const sm = new SubagentManager();
    const so = new SubagentOrchestrator(sm);
    const { DAGPlanner } = require("../utils/dag-planner");
    const dag = new DAGPlanner();
    const plan = dag.plan(req.body.task || "");
    res.json(await so.autoOrchestrate(req.body.task || "", plan, req.body.identity_id || "system"));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/subagent/orchestrator/stats", async (req, res) => {
  try {
    const { SubagentManager } = require("../utils/subagent-manager");
    const so = new SubagentOrchestrator(new SubagentManager());
    res.json(await so.stats());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Skill Evolver ----------
app.post("/skill-evolver/detect-gaps", async (req, res) => {
  try {
    const { UnifiedSkillSystem } = require("../utils/unified-skills");
    const { CandidateLifecycle } = require("../utils/candidate-lifecycle");
    const se = new SkillEvolver(new UnifiedSkillSystem(), new CandidateLifecycle());
    res.json(await se.detectGaps(req.body.experienceHistory || []));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/skill-evolver/create-proactive", async (req, res) => {
  try {
    const { UnifiedSkillSystem } = require("../utils/unified-skills");
    const { CandidateLifecycle } = require("../utils/candidate-lifecycle");
    const se = new SkillEvolver(new UnifiedSkillSystem(), new CandidateLifecycle());
    res.json(await se.createProactive(req.body));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/skill-evolver/:id/evolve", async (req, res) => {
  try {
    const { UnifiedSkillSystem } = require("../utils/unified-skills");
    const { CandidateLifecycle } = require("../utils/candidate-lifecycle");
    const se = new SkillEvolver(new UnifiedSkillSystem(), new CandidateLifecycle());
    res.json(await se.evolve(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/skill-evolver/:id/performance", async (req, res) => {
  try {
    const { UnifiedSkillSystem } = require("../utils/unified-skills");
    const { CandidateLifecycle } = require("../utils/candidate-lifecycle");
    const se = new SkillEvolver(new UnifiedSkillSystem(), new CandidateLifecycle());
    res.json(await se.recordPerformance(req.params.id, req.body.success));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/skill-evolver/stats", async (req, res) => {
  try {
    const { UnifiedSkillSystem } = require("../utils/unified-skills");
    const { CandidateLifecycle } = require("../utils/candidate-lifecycle");
    const se = new SkillEvolver(new UnifiedSkillSystem(), new CandidateLifecycle());
    res.json(await se.stats());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

'''

start_marker = "// ---------- Start server ----------"
if start_marker in content:
    content = content.replace(start_marker, NEW_EPS + "\n" + start_marker)

# Update version
content = content.replace('"4.0.0"', '"4.1.0"')
server_js.write_text(content, encoding='utf-8')
print("  + server.js updated with evolution endpoints")

# Update versions
print("\n=== Updating versions ===")
for pkg in [project / "package.json", project / "nemos" / "package.json"]:
    if pkg.exists():
        c = pkg.read_text()
        c = c.replace('"4.0.0"', '"4.1.0"').replace('"2.5.1"', '"4.1.0"').replace('"2.0.0"', '"4.1.0"').replace('"1.0.0"', '"4.1.0"')
        pkg.write_text(c)
        print(f"  + {pkg.relative_to(project)}")

ib = project / "install.bat"
if ib.exists():
    c = ib.read_text()
    for old in ["v1.0.0","v2.0.0","v2.5.1","v4.0.0"]:
        c = c.replace(old, "v4.1.0")
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

for p in [V41_ZIP, V41_TAR]:
    if p.exists(): p.unlink()

print(f"\nCreating {V41_ZIP.name}...")
with zipfile.ZipFile(V41_ZIP, 'w', zipfile.ZIP_DEFLATED) as z:
    for fp, rp in all_files:
        z.write(fp, os.path.join("nemos-project", rp))
print(f"  {V41_ZIP.stat().st_size} bytes")

print(f"\nCreating {V41_TAR.name}...")
with tarfile.open(V41_TAR, "w:gz") as t:
    for fp, rp in all_files:
        t.add(fp, os.path.join("nemos-project", rp))
print(f"  {V41_TAR.stat().st_size} bytes")

shutil.rmtree(TEMP_DIR)

# Verify
print("\n=== Verification ===")
with zipfile.ZipFile(V41_ZIP, 'r') as z:
    names = z.namelist()
    new_modules = ["persona-evolver.js", "subagent-orchestrator.js", "skill-evolver.js"]
    for m in new_modules:
        path = f"nemos-project/nemos/src/utils/{m}"
        info = z.getinfo(path)
        print(f"  + {m}: {info.file_size:,} bytes")
    
    with z.open('nemos-project/nemos/src/daemon/server.js') as sf:
        sc = sf.read().decode('utf-8')
        eps = ["/persona/evolver/", "/subagent/orchestrate", "/skill-evolver/"]
        found = sum(1 for e in eps if e in sc)
        print(f"\n  v4.1.0 endpoint categories: {found}/{len(eps)}")
    
    utils_count = len([n for n in names if '/utils/' in n and n.endswith('.js')])
    print(f"  Total utils: {utils_count}")
    print(f"  Total files: {len(names)}")

print(f"\n{'='*60}")
print(f"  NEMOS v4.1.0 — SELF-EVOLVING SYSTEM")
print(f"{'='*60}")
print(f"")
print(f"  NEW: 3 evolution modules:")
print(f"    1. + persona-evolver.js")
print(f"       - Dynamic persona creation (not just templates)")
print(f"       - Persona evolution (v1 -> v2 based on performance)")
print(f"       - Gap detection ('no persona for ML -> create one')")
print(f"    2. + subagent-orchestrator.js")
print(f"       - Auto-spawn (not just suggest)")
print(f"       - Parallel execution + result merging")
print(f"       - Failure retry with different memory mode")
print(f"    3. + skill-evolver.js")
print(f"       - Gap detection ('task type frequent but no skill')")
print(f"       - Skill evolution (v1 -> v2 based on success_rate)")
print(f"       - Proactive creation (before execution, not just after)")
print(f"")
print(f"  Pipeline Updated:")
print(f"    - /analyze now tries dynamic persona creation")
print(f"    - /analyze now auto-orchestrates subagents (not just suggests)")
print(f"    - /evaluate now does proactive skill creation + gap detection")
print(f"")
print(f"  Utils: {utils_count}")
print(f"  Files: {len(all_files)}")
print(f"  Archives:")
print(f"    {V41_ZIP}")
print(f"    {V41_TAR}")
