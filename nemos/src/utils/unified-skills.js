// ============================================================
// Unified Skill System (v2.5.0)
// Merges: skill-library + skill-compiler + skill-directory + wiki-skill
// into ONE coherent system with backward-compatible wrappers
// ============================================================

const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const { writeAtomic } = require("../store/storage");
const { timeId } = require("./ids");

const NEMONS_HOME = process.env.NEMONS_HOME || path.join(os.homedir(), ".nemons");
const SKILLS_DIR = path.join(NEMONS_HOME, "skills-unified");

class UnifiedSkillSystem {
  constructor() {
    this.dir = SKILLS_DIR;
  }
  
  async init() { await fs.mkdir(this.dir, { recursive: true }); }
  
  // ===== REGISTER (from skill-library) =====
  async register(skill) {
    await this.init();
    const id = skill.id || timeId("skill");
    const dir = path.join(this.dir, id);
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "scripts"), { recursive: true });
    
    // Write instruction.md (from skill-directory pattern)
    const instruction = this.formatInstruction(skill);
    await fs.writeFile(path.join(dir, "instruction.md"), instruction);
    
    // Write skill contract (from Anything2Skill pattern)
    const contract = this.createContract(id, skill);
    await fs.writeFile(path.join(dir, "contract.json"), JSON.stringify(contract, null, 2));
    
    // Write metadata (progressive disclosure)
    const metadata = {
      id, name: skill.name || id, version: skill.version || "1.0.0",
      domain: skill.domain || "general", area: skill.area || "general",
      // Invariant #4 (Use != Adopt): retrieval only serves `adopted`.
      // Explicit registrations (human/route) default to adopted; the
      // auto-compile path passes `candidate` so a machine-written skill
      // can never be used before review.
      status: skill.status || "adopted",
      candidate_id: skill.candidate_id || null,
      triggers: skill.triggers || [],
      description: skill.description || "",
      description_tokens: Math.ceil((skill.description || "").length / 4),
      instruction_tokens: Math.ceil(instruction.length / 4),
      success_rate: 1.0, total_uses: 0, successful_uses: 0,
      last_used: null, created_at: new Date().toISOString(),
      source: skill.source || "manual",
      // Wiki-style versioning
      revisions: [],
    };
    await writeAtomic(path.join(dir, "metadata.json"), JSON.stringify(metadata, null, 2));

    // Optional scripts
    if (skill.scripts) {
      for (const [name, content] of Object.entries(skill.scripts)) {
        await fs.writeFile(path.join(dir, "scripts", name), content);
      }
    }
    
    return { ...metadata, contract };
  }
  
  formatInstruction(skill) {
    const lines = [];
    lines.push(`# ${skill.name || "Skill"}\n`);
    lines.push(`**Version**: ${skill.version || "1.0.0"}`);
    lines.push(`**Domain**: ${skill.domain || "general"}\n`);
    lines.push(`## Description\n${skill.description || "N/A"}\n`);
    if (skill.triggers?.length > 0) {
      lines.push("## Triggers");
      skill.triggers.forEach(t => lines.push(`- "${t}"`));
      lines.push("");
    }
    if (skill.steps?.length > 0) {
      lines.push("## Procedure");
      skill.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
      lines.push("");
    }
    if (skill.constraints?.length > 0) {
      lines.push("## Constraints");
      skill.constraints.forEach(c => lines.push(`- ${c}`));
    }
    return lines.join("\n");
  }
  
  createContract(id, skill) {
    return {
      id, name: skill.name || id,
      description: skill.description || "",
      taxonomy: { domain: skill.domain || "general", family: skill.family || "default", task_type: skill.task_type || "implementation", stage: skill.stage || "execution" },
      invocation_conditions: skill.triggers || [],
      contraindications: skill.contraindications || [],
      action_moves: skill.steps || ["execute"],
      workflow_steps: skill.workflow || skill.steps || [],
      constraints: skill.constraints || [],
      output_contract: skill.output || { result: "string" },
      evidence: skill.evidence || [],
      confidence: skill.confidence || 0.8,
      compiled_at: new Date().toISOString(),
    };
  }
  
  // ===== RETRIEVE (progressive disclosure) =====
  async retrieve(query, limit, full) {
    limit = limit || 5;
    await this.init();
    // Lifecycle gate: a candidate (or rejected/deprecated) skill is never
    // served. Skills written before `status` existed are treated as adopted.
    const all = (await this.listAll()).filter((s) => (s.status ? s.status === "adopted" : true));
    const q = (query || "").toLowerCase();
    
    const scored = all.map(skill => {
      let score = 0;
      for (const trigger of (skill.triggers || [])) {
        if (q.includes(trigger.toLowerCase())) score += 0.5;
      }
      if (skill.domain && q.includes(skill.domain.toLowerCase())) score += 0.2;
      score *= (0.5 + 0.5 * (skill.success_rate || 1.0));
      return { ...skill, _score: score };
    });
    
    const results = scored.filter(s => s._score > 0).sort((a, b) => b._score - a._score).slice(0, limit);
    
    // Progressive disclosure: load full content only if requested
    if (full) {
      for (const r of results) {
        try {
          r.instruction = await fs.readFile(path.join(this.dir, r.id, "instruction.md"), "utf8");
          r.contract = JSON.parse(await fs.readFile(path.join(this.dir, r.id, "contract.json"), "utf8"));
        } catch {}
      }
    }
    
    return results;
  }
  
  // ===== COMPILE FROM RUN (from WikiSkill) =====
  async compileFromRun(run) {
    if (!run.success) return { error: "only successful runs can be compiled" };
    return await this.register({
      name: `Auto: ${run.prompt?.slice(0, 50) || "skill"}`,
      description: run.prompt || "",
      domain: run.domain || "general",
      triggers: this.extractTriggers(run.prompt),
      steps: this.extractSteps(run),
      source: "auto-compiled",
      // machine-written: usable only after a human approves the candidate
      status: "candidate",
      confidence: 0.85,
    });
  }

  // ===== ADOPT (the only sanctioned route from candidate to retrieval) =====
  async adopt(skill, adoptedBy) {
    return await this.register({
      ...skill,
      status: "adopted",
      source: skill.source || "adopted-candidate",
      adopted_by: adoptedBy || "system",
      adopted_at: new Date().toISOString(),
    });
  }
  
  extractTriggers(prompt) {
    const keywords = ["implement", "fix", "refactor", "test", "build", "deploy", "debug"];
    return keywords.filter(k => (prompt || "").toLowerCase().includes(k));
  }
  
  extractSteps(run) {
    const steps = [];
    if (run.evidence?.diff) steps.push("Apply the code changes");
    if (run.evidence?.test_results) steps.push("Run tests to verify");
    if (run.verification?.pass) steps.push("Confirm verification passed");
    return steps;
  }
  
  // ===== RECORD EXECUTION (success tracking) =====
  async recordExecution(skillId, success) {
    const meta = await this.getMetadata(skillId);
    if (!meta) return { error: "not found" };
    meta.total_uses += 1;
    if (success) meta.successful_uses += 1;
    meta.success_rate = meta.successful_uses / meta.total_uses;
    meta.last_used = new Date().toISOString();
    await writeAtomic(path.join(this.dir, skillId, "metadata.json"), JSON.stringify(meta, null, 2));
    return meta;
  }
  
  // ===== REVISE (wiki-style) =====
  async revise(skillId, changes, author) {
    const meta = await this.getMetadata(skillId);
    if (!meta) return { error: "not found" };
    meta.revisions.push({ version: meta.version, author: author || "system", timestamp: new Date().toISOString(), changes: Object.keys(changes) });
    meta.version += 1;
    if (changes.description) meta.description = changes.description;
    await writeAtomic(path.join(this.dir, skillId, "metadata.json"), JSON.stringify(meta, null, 2));
    return meta;
  }
  
  async getMetadata(id) {
    try { return JSON.parse(await fs.readFile(path.join(this.dir, id, "metadata.json"), "utf8")); }
    catch { return null; }
  }
  
  async listAll() {
    await this.init();
    try {
      const dirs = await fs.readdir(this.dir);
      const skills = [];
      for (const dir of dirs) {
        const meta = await this.getMetadata(dir);
        if (meta) skills.push(meta);
      }
      return skills;
    } catch { return []; }
  }
  
  // ===== TOKEN BUDGET (from Scientific Agent Skills) =====
  async tokenBudget() {
    const all = await this.listAll();
    const descTokens = all.reduce((s, x) => s + (x.description_tokens || 0), 0);
    const fullTokens = all.reduce((s, x) => s + (x.instruction_tokens || 0), 0);
    return {
      total_skills: all.length,
      description_tokens: descTokens,
      description_percent: (descTokens / 200000 * 100).toFixed(1) + "%",
      full_tokens: fullTokens,
      full_percent: (fullTokens / 200000 * 100).toFixed(1) + "%",
    };
  }
  
  async stats() {
    const all = await this.listAll();
    return {
      total_skills: all.length,
      auto_derived: all.filter(s => s.source === "auto-compiled").length,
      avg_success_rate: all.length ? (all.reduce((s, x) => s + (x.success_rate || 0), 0) / all.length).toFixed(3) : 0,
      total_uses: all.reduce((s, x) => s + (x.total_uses || 0), 0),
      by_domain: all.reduce((a, x) => { const d = x.domain || "unknown"; a[d] = (a[d] || 0) + 1; return a; }, {}),
    };
  }
}

module.exports = { UnifiedSkillSystem };
