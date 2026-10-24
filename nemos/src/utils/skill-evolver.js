// ============================================================
// Skill Evolver — Gap Detection + Evolution + Proactive Creation
// v4.1.0: Skills are no longer just auto-compiled after success.
// They can be: proactively created, evolved based on performance,
// and gaps are detected automatically.
// ============================================================

const fs = require("fs").promises;
const path = require("path");
const os = require("os");

const NEMONS_HOME = require("./runtime-config").nemonsHome();

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
