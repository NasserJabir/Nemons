// ============================================================
// BaseHarness — Abstract base class for all harnesses
// Based on: arXiv:2610.28380 (Object-Oriented Harness, 2026)
// Provides shared utilities + abstract methods for specialization
// ============================================================

class BaseHarness {
  constructor(config) {
    this.config = config || {};
    this.name = this.constructor.name;
    this.task_type = "generic";
    
    // Shared utilities (inherited by all)
    this.verification_criteria = {
      must_pass: [
        "tests_pass",
        "no_syntax_errors",
        "no_security_violations",
        "no_secrets_in_diff",
      ],
      should_pass: [
        "coverage_maintained",
        "no_new_lint_warnings",
        "diff_reasonable",
      ],
      nice_to_have: [
        "includes_tests",
        "has_documentation",
        "uses_existing_patterns",
      ],
    };
    
    this.cbr_retrieval_strategy = {
      filter_by: {},
      weight: { similarity: 0.5, recency: 0.3, success_rate: 0.2 },
      limit: 3,
    };
    
    this.repair_strategy = "counterexample_guided";
    this.max_retries = 2;
    this.persona_role = "senior_engineer";
  }
  
  // ---------- Abstract methods (to be overridden) ----------
  
  /**
   * Get specialized verification criteria
   * Override in subclasses
   */
  getVerificationCriteria() {
    return this.verification_criteria;
  }
  
  /**
   * Get CBR retrieval strategy
   * Override in subclasses
   */
  getCBRStrategy() {
    return this.cbr_retrieval_strategy;
  }
  
  /**
   * Get repair strategy
   * Override in subclasses
   */
  getRepairStrategy() {
    return this.repair_strategy;
  }
  
  /**
   * Get persona role for this harness
   * Override in subclasses
   */
  getPersonaRole() {
    return this.persona_role;
  }
  
  /**
   * Get max retries for this harness type
   * Override in subclasses
   */
  getMaxRetries() {
    return this.max_retries;
  }
  
  /**
   * Check if prompt matches this harness
   * Override in subclasses
   */
  matches(prompt) {
    return false;  // base class never matches
  }
  
  /**
   * Get harness metadata
   */
  getMetadata() {
    return {
      name: this.name,
      task_type: this.task_type,
      verification_criteria: this.getVerificationCriteria(),
      cbr_strategy: this.getCBRStrategy(),
      repair_strategy: this.getRepairStrategy(),
      max_retries: this.getMaxRetries(),
      persona_role: this.getPersonaRole(),
    };
  }
  
  /**
   * Execute the harness pipeline (template method pattern)
   * This is the shared execution flow; subclasses customize via overrides
   */
  async execute(input) {
    const { prompt, project_root, adapter } = input;
    
    // 1. Analyze prompt
    const analysis = await this.analyzePrompt(prompt);
    
    // 2. Retrieve relevant experiences (specialized)
    const experiences = await this.retrieveExperiences(prompt);
    
    // 3. Build context pack (specialized)
    const context_pack = await this.buildContextPack(prompt, experiences);
    
    // 4. Execute via adapter (shared)
    const agent_response = await this.executeAdapter(input, context_pack);
    
    // 5. Collect evidence (shared utility)
    const evidence = await this.collectEvidence(agent_response, project_root);
    
    // 6. Verify (specialized criteria)
    const verification = await this.verify(agent_response, evidence, context_pack);
    
    // 7. Handle result
    let result;
    if (verification.pass) {
      result = await this.onSuccess(prompt, evidence, verification);
    } else {
      result = await this.onFailure(prompt, evidence, verification);
    }
    
    return {
      harness: this.name,
      task_type: this.task_type,
      analysis,
      experiences_count: experiences.length,
      verification,
      result,
    };
  }
  
  // ---------- Shared utilities (used by all subclasses) ----------
  
  async analyzePrompt(prompt) {
    const keywords = (prompt || "").toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4);
    return {
      keywords,
      length: (prompt || "").length,
      estimated_complexity: this.estimateComplexity(prompt),
    };
  }
  
  estimateComplexity(prompt) {
    const len = (prompt || "").length;
    if (len < 50) return "simple";
    if (len < 200) return "medium";
    return "complex";
  }
  
  async retrieveExperiences(prompt) {
    // In production: call CBR store with specialized strategy
    return [];
  }
  
  async buildContextPack(prompt, experiences) {
    return {
      persona_role: this.getPersonaRole(),
      experiences: experiences.slice(0, 3),
      criteria: this.getVerificationCriteria(),
    };
  }
  
  async executeAdapter(input, contextPack) {
    // In production: call the coding agent via adapter
    return { response: "agent executed", context_used: contextPack };
  }
  
  async collectEvidence(response, projectRoot) {
    return {
      response,
      collected_at: new Date().toISOString(),
    };
  }
  
  async verify(response, evidence, contextPack) {
    // Apply specialized criteria
    const criteria = this.getVerificationCriteria();
    const results = [];
    
    for (const check of criteria.must_pass) {
      results.push({
        check,
        pass: this.runCheck(check, evidence),
        severity: "must",
      });
    }
    
    for (const check of criteria.should_pass) {
      results.push({
        check,
        pass: this.runCheck(check, evidence),
        severity: "should",
      });
    }
    
    const allMustPass = results
      .filter(r => r.severity === "must")
      .every(r => r.pass);
    
    return {
      pass: allMustPass,
      results,
      harness: this.name,
    };
  }
  
  runCheck(checkName, evidence) {
    // Heuristic: assume pass unless explicitly failed
    if (evidence[checkName] === false) return false;
    return true;
  }
  
  async onSuccess(prompt, evidence, verification) {
    return {
      status: "success",
      verification,
      action: "store_experience",
    };
  }
  
  async onFailure(prompt, evidence, verification) {
    const repairStrategy = this.getRepairStrategy();
    const maxRetries = this.getMaxRetries();
    
    return {
      status: "failure",
      verification,
      repair_strategy: repairStrategy,
      max_retries: maxRetries,
      action: "repair_and_retry",
    };
  }
}

module.exports = { BaseHarness };
