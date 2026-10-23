// ============================================================
// FeatureHarness — Specialized for feature implementation
// Based on: arXiv:2610.28380 (OO-Harness)
// Pattern: "implement|add|create|build|develop"
// ============================================================

const { BaseHarness } = require("./harness-base");

class FeatureHarness extends BaseHarness {
  constructor(config) {
    super(config);
    this.task_type = "feature";
    this.persona_role = "senior_engineer";
    this.max_retries = 2;
    
    // Specialized: feature must meet spec
    this.verification_criteria = {
      must_pass: [
        "tests_pass",
        "no_syntax_errors",
        "no_security_violations",
        "no_secrets_in_diff",
        "feature_implements_spec",       // feature-specific
      ],
      should_pass: [
        "edge_cases_covered",            // feature-specific
        "documentation_added",
        "tests_added",                   // feature-specific
        "coverage_maintained",
      ],
      nice_to_have: [
        "follows_existing_patterns",
        "api_documented",
        "uses_types",
      ],
    };
    
    this.cbr_retrieval_strategy = {
      filter_by: { task_type: "feature" },
      weight: { similarity: 0.5, recency: 0.3, success_rate: 0.2 },
      limit: 4,
    };
    
    this.repair_strategy = "spec_driven";  // fix guided by spec
  }
  
  matches(prompt) {
    const p = (prompt || "").toLowerCase();
    return /\b(implement|add|create|build|develop|make|construct)\b/i.test(p);
  }
  
  getPersonaRole() {
    return "senior_engineer";
  }
}

module.exports = { FeatureHarness };
