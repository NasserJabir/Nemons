// ============================================================
// Persona Evolver — Dynamic Creation + Evolution + Gap Detection
// v4.1.0: Personas are no longer static templates.
// They can be: created dynamically, evolved based on performance,
// and gaps are detected automatically.
// ============================================================

const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const { writeAtomic } = require("../store/storage");
const { isSafeId } = require("./path-guard");

const NEMONS_HOME = require("./runtime-config").nemonsHome();
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

  // ============================================================
  // ADOPTION (Invariant #4: Use != Adopt)
  //
  // A dynamically created persona is a `candidate` and is NOT used by the
  // pipeline. Adoption is the only path that makes one usable, and it is the
  // only thing the context-pack builder will select.
  // ============================================================
  async adopt(asset = {}, { adoptedBy = "system", candidateId = null } = {}) {
    await this.init();
    const id = asset.id || (candidateId ? `persona-${candidateId}` : `persona-${Date.now().toString(36)}`);
    if (!isSafeId(id)) throw new Error(`invalid persona id: ${JSON.stringify(String(id).slice(0, 32))}`);

    const record = {
      id,
      role: asset.role || asset.name || "Adopted persona",
      experience: asset.experience || "5+ years",
      constraints: asset.constraints || [],
      focus_areas: asset.focus_areas || asset.focusAreas || [],
      rules: asset.rules || [],
      domain: asset.domain || "general",
      triggers: asset.triggers || asset.keywords || [],
      source: "adopted-candidate",
      candidate_id: candidateId,
      status: "adopted",
      adopted_by: adoptedBy,
      adopted_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    await writeAtomic(path.join(this.dir, `${id}.json`), JSON.stringify(record, null, 2));
    return record;
  }

  async listAdopted() {
    return (await this.listAll()).filter((p) => p.status === "adopted");
  }

  /**
   * Best adopted persona for a prompt/domain, or null. Deterministic keyword
   * overlap — no adoption means no match means the caller falls back to a
   * template persona.
   */
  async selectAdopted(prompt, domain) {
    const adopted = await this.listAdopted();
    if (adopted.length === 0) return null;
    const words = new Set(String(prompt || "").toLowerCase().split(/\W+/).filter((w) => w.length > 3));

    let best = null;
    let bestScore = 0;
    for (const persona of adopted) {
      const terms = [...(persona.triggers || []), persona.domain, persona.role]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3);
      let score = 0;
      for (const term of terms) if (words.has(term)) score += 1;
      if (domain && persona.domain === domain) score += 1;
      if (score > bestScore) {
        bestScore = score;
        best = persona;
      }
    }
    return bestScore > 0 ? best : null;
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
