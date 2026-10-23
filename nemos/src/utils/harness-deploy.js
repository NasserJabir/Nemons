// ============================================================
// DeployHarness — Specialized for deployment tasks
// Based on: arXiv:2610.28380 (OO-Harness)
// Pattern: "deploy|release|ship|publish|rollout"
// ============================================================

const { BaseHarness } = require("./harness-base");

class DeployHarness extends BaseHarness {
  constructor(config) {
    super(config);
    this.task_type = "deploy";
    this.persona_role = "devops_engineer";
    this.max_retries = 1;  // deployments should be careful, not retried often
    
    // Specialized: deployment safety checks
    this.verification_criteria = {
      must_pass: [
        "health_check_passes",           // deploy-specific
        "no_syntax_errors",
        "no_security_violations",
        "no_secrets_in_diff",
        "infrastructure_valid",          // deploy-specific
        "rollback_plan_exists",          // deploy-specific
      ],
      should_pass: [
        "blue_green_deployment",         // deploy-specific
        "canary_release_ready",          // deploy-specific
        "monitoring_configured",
        "alerts_set_up",
      ],
      nice_to_have: [
        "zero_downtime",
        "auto_scaling_configured",
        "logs_centralized",
      ],
    };
    
    this.cbr_retrieval_strategy = {
      filter_by: { task_type: "deploy" },
      weight: { similarity: 0.3, recency: 0.5, success_rate: 0.2 },
      limit: 3,
    };
    
    this.repair_strategy = "rollback";  // rollback on failure
  }
  
  matches(prompt) {
    const p = (prompt || "").toLowerCase();
    return /\b(deploy|release|ship|publish|rollout|kubernetes|helm)\b/i.test(p);
  }
  
  getPersonaRole() {
    return "devops_engineer";
  }
}

module.exports = { DeployHarness };
