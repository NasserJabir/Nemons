// ============================================================
// BugFixHarness — Specialized for bug fixing tasks
// Based on: arXiv:2610.28380 (OO-Harness)
// Pattern: "fix|bug|broken|issue|error|crash|fail"
// ============================================================

const { BaseHarness } = require("./harness-base");

class BugFixHarness extends BaseHarness {
  constructor(config) {
    super(config);
    this.task_type = "bug_fix";
    this.persona_role = "senior_engineer";
    this.max_retries = 3;  // bugs need more retries
    
    // Specialized verification criteria for bug fixes
    this.verification_criteria = {
      must_pass: [
        "tests_pass",
        "no_syntax_errors",
        "no_security_violations",
        "no_secrets_in_diff",
        "bug_reproduced_before_fix",     // bug-specific
        "fix_addresses_root_cause",      // bug-specific
      ],
      should_pass: [
        "regression_tests_pass",         // bug-specific
        "no_new_test_failures",
        "diff_reasonable",
        "fix_is_minimal",                // bug-specific
      ],
      nice_to_have: [
        "added_test_for_bug",            // bug-specific
        "root_cause_documented",
      ],
    };
    
    // Specialized CBR retrieval
    this.cbr_retrieval_strategy = {
      filter_by: { task_type: "bug_fix" },
      weight: { similarity: 0.6, recency: 0.3, success_rate: 0.1 },
      limit: 5,  // more experiences for bugs
    };
    
    this.repair_strategy = "counterexample_guided";
  }
  
  matches(prompt) {
    const p = (prompt || "").toLowerCase();
    return /\b(fix|bug|broken|issue|error|crash|fail|wrong|incorrect|doesn't work)\b/i.test(p);
  }
  
  getPersonaRole() {
    return "senior_engineer";
  }
}

module.exports = { BugFixHarness };
