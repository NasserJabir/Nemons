// ============================================================
// TestHarness — Specialized for writing tests
// Based on: arXiv:2610.28380 (OO-Harness)
// Pattern: "test|spec|coverage|assert|mock"
// ============================================================

const { BaseHarness } = require("./harness-base");

class TestHarness extends BaseHarness {
  constructor(config) {
    super(config);
    this.task_type = "test";
    this.persona_role = "senior_engineer";
    this.max_retries = 2;
    
    // Specialized: tests must pass and cover scenarios
    this.verification_criteria = {
      must_pass: [
        "tests_pass",
        "no_syntax_errors",
        "tests_are_deterministic",       // test-specific
        "tests_cover_happy_path",        // test-specific
      ],
      should_pass: [
        "tests_cover_edge_cases",        // test-specific
        "tests_cover_error_cases",       // test-specific
        "tests_use_proper_assertions",
        "no_flaky_tests",                // test-specific
      ],
      nice_to_have: [
        "tests_use_descriptive_names",
        "tests_are_isolated",
        "test_data_uses_fixtures",
      ],
    };
    
    this.cbr_retrieval_strategy = {
      filter_by: { task_type: "test" },
      weight: { similarity: 0.5, recency: 0.2, success_rate: 0.3 },
      limit: 3,
    };
    
    this.repair_strategy = "test_first";  // TDD approach
  }
  
  matches(prompt) {
    const p = (prompt || "").toLowerCase();
    return /\b(test|spec|coverage|assert|mock|tdd|unit test)\b/i.test(p);
  }
  
  getPersonaRole() {
    return "senior_engineer";
  }
}

module.exports = { TestHarness };
