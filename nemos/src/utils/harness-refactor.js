// ============================================================
// RefactorHarness — Specialized for refactoring tasks
// Based on: arXiv:2610.28380 (OO-Harness)
// Pattern: "refactor|clean|improve|optimize|simplify"
// ============================================================

const { BaseHarness } = require("./harness-base");

class RefactorHarness extends BaseHarness {
  constructor(config) {
    super(config);
    this.task_type = "refactor";
    this.persona_role = "senior_engineer";
    this.max_retries = 1;  // refactoring needs fewer retries
    
    // Specialized: behavior must be unchanged
    this.verification_criteria = {
      must_pass: [
        "behavior_unchanged",            // refactor-specific
        "tests_still_pass",              // all existing tests must pass
        "no_syntax_errors",
        "no_security_violations",
      ],
      should_pass: [
        "complexity_reduced",            // refactor-specific
        "duplication_reduced",           // refactor-specific
        "coverage_maintained",
        "no_new_lint_warnings",
      ],
      nice_to_have: [
        "readability_improved",
        "naming_improved",
        "smaller_diff",                  // refactor-specific
      ],
    };
    
    this.cbr_retrieval_strategy = {
      filter_by: { task_type: "refactor" },
      weight: { similarity: 0.4, recency: 0.2, success_rate: 0.4 },
      limit: 3,
    };
    
    this.repair_strategy = "minimal_edit";  // small, focused changes
  }
  
  matches(prompt) {
    const p = (prompt || "").toLowerCase();
    return /\b(refactor|clean|improve|optimize|simplify|restructure|rename|extract)\b/i.test(p);
  }
  
  getPersonaRole() {
    return "senior_engineer";
  }
}

module.exports = { RefactorHarness };
