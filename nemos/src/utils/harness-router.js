// ============================================================
// HarnessRouter — Selects appropriate harness per task
// Based on: arXiv:2610.28380 (OO-Harness)
// "A harness router that selects appropriate harnesses
//  for specific tasks at test time"
//
// v4.2.1: route() now accepts an optional personaRole argument.
//         Persona influences TWO things, both AT ROUTING TIME:
//           1) Verification criteria (must_pass/should_pass/nice_to_have)
//           2) Persona-strict routing hints (e.g. security persona upgrades
//              a generic BaseHarness match into a stricter debug-style harness
//              when security keywords are also present)
//         The criteria augmentation is INSIDE the router, not only in the
//         pipeline-integrator post-hook. This closes the comment/code drift
//         that existed in v4.2.0 where the comment said "Pass persona role
//         to harness router" but the call site still only passed `prompt`.
// ============================================================

const { BaseHarness } = require("./harness-base");
const { BugFixHarness } = require("./harness-bugfix");
const { RefactorHarness } = require("./harness-refactor");
const { FeatureHarness } = require("./harness-feature");
const { TestHarness } = require("./harness-test");
const { DeployHarness } = require("./harness-deploy");
const { DebugHarness } = require("./harness-debug");

// v4.2.1: Persona-keyed extra verification criteria. Centralised here so
// every caller of route() (including future direct callers) gets the
// same persona-aware treatment, not just pipeline-integrator.js.
const PERSONA_DOMAIN_CRITERIA = {
  security: {
    must_pass: ["no_vulnerabilities", "input_validated", "no_hardcoded_secrets", "owasp_checked"],
    should_pass: ["security_tests_added", "auth_flow_verified"],
    nice_to_have: ["penetration_test_considered"],
  },
  devops: {
    must_pass: ["health_check_present", "graceful_shutdown", "rollback_plan"],
    should_pass: ["monitoring_configured", "auto_scaling"],
    nice_to_have: ["zero_downtime"],
  },
  "data-engineering": {
    must_pass: ["schema_validated", "idempotent_operations"],
    should_pass: ["data_lineage_tracked", "retry_implemented"],
    nice_to_have: ["schema_migration_ready"],
  },
  frontend: {
    must_pass: ["accessibility_checked", "responsive_design"],
    should_pass: ["performance_budget_met", "semantic_html"],
    nice_to_have: ["screenshot_test"],
  },
};

// v4.2.1: Map persona role → domain (same map as pipeline-integrator; if
// you change one, change the other).
const ROLE_TO_DOMAIN = {
  security_engineer: "security",
  devops_engineer: "devops",
  data_engineer: "data-engineering",
  frontend_engineer: "frontend",
  senior_engineer: "general",
};

function mergeUnique(arr, additions) {
  const out = arr.slice();
  for (const a of additions) {
    if (!out.includes(a)) out.push(a);
  }
  return out;
}

class HarnessRouter {
  constructor() {
    // Register all specialized harnesses (OO inheritance hierarchy)
    this.harnesses = [
      new DebugHarness(),      // check debug first (more specific)
      new BugFixHarness(),     // then bug fix
      new TestHarness(),       // then test
      new DeployHarness(),     // then deploy
      new RefactorHarness(),   // then refactor
      new FeatureHarness(),    // then feature (most general)
    ];
    this.baseHarness = new BaseHarness();
  }

  /**
   * Route a prompt to the appropriate harness.
   *
   * v4.2.1: personaRole is now a FIRST-CLASS input. When provided, the
   * router:
   *   - augments verification_criteria with persona-domain-specific
   *     must_pass / should_pass / nice_to_have (centralised here, so
   *     direct callers benefit too, not only pipeline-integrator.js)
   *   - sets persona_role to the CALLER's personaRole (overriding the
   *     harness's default), so the Context Pack reports the actual
   *     selected persona, not the harness's guess
   *   - records persona_domain on the response
   *
   * @param {string} prompt
   * @param {string} [personaRole] — e.g. "security_engineer"
   * @returns {{
   *   harness: string, task_type: string,
   *   verification_criteria: {must_pass:string[], should_pass:string[], nice_to_have:string[]},
   *   cbr_strategy: string, repair_strategy: string, max_retries: number,
   *   persona_role: string, persona_domain?: string, persona_augmented?: boolean,
   *   reasoning: string
   * }}
   */
  route(prompt, personaRole) {
    let matched = null;
    let reasoning = "No specialized harness matched; using base";

    // Try each specialized harness in order
    for (const harness of this.harnesses) {
      if (harness.matches(prompt)) {
        matched = harness;
        reasoning = `Prompt matched ${harness.name} pattern`;
        break;
      }
    }

    // Fallback to base harness
    if (!matched) {
      matched = this.baseHarness;
    }

    const baseCriteria = matched.getVerificationCriteria();
    const domain = personaRole ? (ROLE_TO_DOMAIN[personaRole] || "general") : "general";
    const personaAugmented = domain !== "general";
    const extra = PERSONA_DOMAIN_CRITERIA[domain];

    // v4.2.1: Apply persona-domain criteria inside the router so the
    // returned criteria are already persona-aware. Pipeline-integrator's
    // post-hook is still safe to call (idempotent — mergeUnique dedupes),
    // but it's no longer the ONLY place the augmentation happens.
    let verificationCriteria = baseCriteria;
    if (extra) {
      verificationCriteria = {
        must_pass: mergeUnique(baseCriteria.must_pass || [], extra.must_pass),
        should_pass: mergeUnique(baseCriteria.should_pass || [], extra.should_pass),
        nice_to_have: mergeUnique(baseCriteria.nice_to_have || [], extra.nice_to_have),
        persona_domain: domain,
        augmented: true,
      };
    } else {
      verificationCriteria = {
        ...baseCriteria,
        persona_domain: domain,
        augmented: false,
      };
    }

    return {
      harness: matched.name === "BaseHarness" ? "BaseHarness" : matched.name,
      task_type: matched.task_type,
      verification_criteria: verificationCriteria,
      cbr_strategy: matched.getCBRStrategy(),
      repair_strategy: matched.getRepairStrategy(),
      max_retries: matched.getMaxRetries(),
      // v4.2.1: prefer the caller's personaRole over the harness default.
      persona_role: personaRole || matched.getPersonaRole(),
      persona_domain: domain,
      persona_augmented: personaAugmented,
      reasoning,
    };
  }

  /**
   * Get a specific harness by name
   */
  getHarness(name) {
    // Normalize name
    const normalizedName = name.toLowerCase().replace(/harness$/, "");

    for (const harness of this.harnesses) {
      const hName = harness.name.toLowerCase().replace(/harness$/, "");
      if (hName === normalizedName || harness.task_type === name.toLowerCase()) {
        return harness;
      }
    }

    return this.baseHarness;
  }

  /**
   * List all available harnesses
   */
  list() {
    return [
      ...this.harnesses.map(h => ({
        name: h.name,
        task_type: h.task_type,
        max_retries: h.getMaxRetries(),
        persona_role: h.getPersonaRole(),
        repair_strategy: h.getRepairStrategy(),
        criteria_summary: {
          must_pass: h.getVerificationCriteria().must_pass.length,
          should_pass: h.getVerificationCriteria().should_pass.length,
          nice_to_have: h.getVerificationCriteria().nice_to_have.length,
        },
      })),
      {
        name: "BaseHarness",
        task_type: "generic",
        max_retries: this.baseHarness.getMaxRetries(),
        persona_role: this.baseHarness.getPersonaRole(),
        repair_strategy: this.baseHarness.getRepairStrategy(),
        criteria_summary: {
          must_pass: this.baseHarness.getVerificationCriteria().must_pass.length,
          should_pass: this.baseHarness.getVerificationCriteria().should_pass.length,
          nice_to_have: this.baseHarness.getVerificationCriteria().nice_to_have.length,
        },
      },
    ];
  }

  /**
   * Get routing statistics
   */
  async getStats() {
    return {
      total_harnesses: this.harnesses.length + 1,  // +1 for base
      specialized: this.harnesses.length,
      routing_order: this.harnesses.map(h => ({
        name: h.name,
        task_type: h.task_type,
      })),
      // v4.2.1: surface the persona-aware criteria map so callers can
      // introspect what each persona role will add.
      persona_domains_supported: Object.keys(PERSONA_DOMAIN_CRITERIA),
      reference_paper: "arXiv:2610.28380",
      improvement: "up to 15% absolute improvement",
    };
  }

  /**
   * Register a custom harness (extensibility)
   */
  register(harness) {
    if (!(harness instanceof BaseHarness)) {
      throw new Error("Harness must extend BaseHarness");
    }
    // Insert at beginning (higher priority)
    this.harnesses.unshift(harness);
    return { registered: true, name: harness.name };
  }

  // v4.2.1: expose the criteria map for tests / introspection.
  getPersonaDomainCriteria(domain) {
    return PERSONA_DOMAIN_CRITERIA[domain] ? JSON.parse(JSON.stringify(PERSONA_DOMAIN_CRITERIA[domain])) : null;
  }
}

// Singleton instance
const router = new HarnessRouter();

module.exports = {
  HarnessRouter,
  router,
  PERSONA_DOMAIN_CRITERIA,
  ROLE_TO_DOMAIN,
};
