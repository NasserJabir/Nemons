// ============================================================
// DebugHarness — Specialized for debugging/investigation
// Based on: arXiv:2610.28380 (OO-Harness)
// Pattern: "debug|trace|investigate|diagnose|why"
// ============================================================

const { BaseHarness } = require("./harness-base");

class DebugHarness extends BaseHarness {
  constructor(config) {
    super(config);
    this.task_type = "debug";
    this.persona_role = "senior_engineer";
    this.max_retries = 3;
    
    // Specialized: root cause analysis
    this.verification_criteria = {
      must_pass: [
        "root_cause_identified",         // debug-specific
        "reproduction_steps_documented", // debug-specific
        "no_syntax_errors",
      ],
      should_pass: [
        "fix_addresses_root_cause",
        "tests_reproduce_issue",         // debug-specific
        "similar_issues_checked",        // debug-specific
      ],
      nice_to_have: [
        "debug_logging_added",
        "monitoring_enhanced",
        "postmortem_documented",
      ],
    };
    
    this.cbr_retrieval_strategy = {
      filter_by: { task_type: "debug" },
      weight: { similarity: 0.6, recency: 0.2, success_rate: 0.2 },
      limit: 5,  // more context for debugging
    };
    
    this.repair_strategy = "root_cause_first";  // understand before fixing
  }
  
  matches(prompt) {
    const p = (prompt || "").toLowerCase();
    return /\b(debug|trace|investigate|diagnose|why|why does|why is|what's wrong|what's causing)\b/i.test(p);
  }
  
  getPersonaRole() {
    return "senior_engineer";
  }
}

module.exports = { DebugHarness };
