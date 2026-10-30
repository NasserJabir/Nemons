// ============================================================
// Subagent Orchestrator — Auto-spawn + Parallel + Merge
// v4.1.0: Subagents are now AUTOMATICALLY created, executed
// in parallel, results merged, and failures retried.
//
// v4.2.1: autoOrchestrate() accepts an optional `personaRole`
//         argument and uses it AT SPAWN TIME (inside createAssignments
//         + selectRole + selectMemoryMode + selectCapabilities) rather
//         than only as a post-spawn role rewrite in the caller. This
//         closes the comment/code drift that existed in v4.2.0 where
//         pipeline-integrator.js claimed to "Pass persona to orchestrator"
//         but the orchestrator signature never accepted it.
//
//         The orchestrator still works without personaRole (backward
//         compatibility with v4.1.0 callers) — when omitted, behaviour
//         is identical to v4.1.0.
// ============================================================

const fs = require("fs").promises;
const path = require("path");
const os = require("os");

const NEMONS_HOME = require("./runtime-config").nemonsHome();

// v4.2.1: persona role → domain (mirror of harness-router.ROLE_TO_DOMAIN
// to avoid a circular import; if you change one, change both).
const PERSONA_ROLE_DOMAIN = {
  security_engineer: "security",
  devops_engineer: "devops",
  data_engineer: "data-engineering",
  frontend_engineer: "frontend",
  senior_engineer: "general",
};

// v4.2.1: domain → role override map (applied at spawn time).
// Same map that pipeline-integrator used post-spawn in v4.2.0, now
// applied inside the orchestrator so spawned subagents already have
// the persona-aware role, memory_mode, and capabilities.
const DOMAIN_ROLE_OVERRIDE = {
  security: {
    executor:  { role: "security-implementer", memory_mode: "agent-agnostic",     capabilities: ["security_scan", "write_file"] },
    tester:    { role: "security-tester",       memory_mode: "agent-agnostic",     capabilities: ["security_scan", "run_tests"] },
    planner:   { role: "security-architect",   memory_mode: "inherit-partial",   capabilities: ["security_scan"] },
    reviewer:  { role: "security-auditor",      memory_mode: "agent-agnostic",    capabilities: ["security_scan"] },
    devops:    { role: "infrastructure-builder",memory_mode: "inherit-partial",   capabilities: ["deploy", "write_file"] },
  },
  devops: {
    executor:  { role: "infrastructure-builder",memory_mode: "inherit-partial",   capabilities: ["deploy", "write_file"] },
    tester:    { role: "deployment-tester",    memory_mode: "inherit-partial",   capabilities: ["run_tests", "deploy"] },
    planner:   { role: "infrastructure-architect",memory_mode:"inherit-partial",  capabilities: ["deploy"] },
  },
  "data-engineering": {
    executor:  { role: "pipeline-builder",    memory_mode: "inherit-partial",   capabilities: ["write_file", "run_tests"] },
    tester:    { role: "data-quality-tester",  memory_mode: "inherit-partial",   capabilities: ["run_tests"] },
    planner:   { role: "data-architect",      memory_mode: "inherit-partial",   capabilities: ["write_file"] },
  },
  frontend: {
    executor:  { role: "component-builder",    memory_mode: "inherit-partial",   capabilities: ["write_file"] },
    tester:    { role: "ui-tester",            memory_mode: "inherit-partial",   capabilities: ["run_tests"] },
    planner:   { role: "ux-architect",         memory_mode: "inherit-partial",   capabilities: ["write_file"] },
  },
};

class SubagentOrchestrator {
  // `executor` is optional and injected: an async function that actually runs a
  // subagent and resolves to its result. This daemon ships WITHOUT one, because
  // executing a subagent means calling a coding agent, which only the caller
  // can do. When no executor is supplied the honest outcome of a spawn is
  // "dispatched", not "succeeded" — see executeParallel.
  constructor(subagentManager, { executor = null } = {}) {
    this.subagentManager = subagentManager;
    this.executor = typeof executor === "function" ? executor : null;
    this.orchestrationHistory = [];
  }

  get executionMode() {
    return this.executor ? "executed_locally" : "delegated_to_host";
  }

  // ============================================================
  // AUTO-ORCHESTRATE: Decide if subagents are needed + create + execute + merge
  // v4.2.1: personaRole is now a 4th argument, threaded through
  // createAssignments → selectRole/MemoryMode/Capabilities so the
  // persona's intent shapes the spawn itself, not just the caller's
  // post-spawn role rewrite.
  // ============================================================
  async autoOrchestrate(task, dagPlan, identityId, personaRole) {
    // v4.2.1: track whether persona drove selection
    const personaDomain = personaRole ? (PERSONA_ROLE_DOMAIN[personaRole] || "general") : "general";
    const personaDriven = personaDomain !== "general";

    // Step 1: Decide if orchestration is needed
    const decision = this.shouldOrchestrate(dagPlan);

    if (!decision.needed) {
      return {
        orchestrated: false,
        reason: decision.reason,
        message: "Task is simple enough — no subagents needed.",
        // v4.2.1: surface persona context even when no orchestration
        persona_role: personaRole || null,
        persona_domain: personaDomain,
        persona_driven: personaDriven,
      };
    }

    // Step 2: Determine subagent assignments from DAG (persona-aware)
    const assignments = this.createAssignments(
      dagPlan,
      decision.parallelizable,
      personaDomain
    );

    // Step 3: Spawn subagents
    const spawned = [];
    for (const assignment of assignments) {
      try {
        const sub = await this.subagentManager.spawn({
          identity_id: identityId,
          role: assignment.role,
          task: assignment.task,
          memory_mode: assignment.memoryMode,
          lifespan: "one-time",
          capabilities: assignment.capabilities || [],
        });
        spawned.push({ ...sub, assignment, persona_assigned: personaDriven });
      } catch (e) {
        spawned.push({ error: e.message, assignment, persona_assigned: personaDriven });
      }
    }
    
    // Step 4: Dispatch (and execute, if an executor was injected)
    const results = await this.executeParallel(spawned);
    
    // Step 5: Merge results
    const merged = this.mergeResults(results);
    
    // Step 6: Handle failures
    const failedSubagents = results.filter(r => r.status === "failed" || r.error);
    let retried = [];
    
    for (const failed of failedSubagents) {
      const retry = await this.handleFailure(failed);
      if (retry) retried.push(retry);
    }
    
    // Step 7: Record orchestration (v4.2.1: include persona context)
    const orchestration = {
      id: `orch-${Date.now().toString(36)}`,
      task: task,
      identity_id: identityId,
      // v4.2.1: record persona provenance so audit trail shows WHO drove the orchestration
      persona_role: personaRole || null,
      persona_domain: personaDomain,
      persona_driven: personaDriven,
      dag_nodes: dagPlan.nodes?.length || 0,
      // `execution` says who ran the work. "delegated_to_host" means this
      // daemon spawned the subagent records and did NOT run them, so
      // succeeded/failed count only real outcomes (spawn errors, or an
      // injected executor's results) — never a simulated coin flip.
      execution: this.executionMode,
      subagents_spawned: spawned.length,
      subagents_dispatched: results.filter(r => r.status === "dispatched").length,
      subagents_executed: results.filter(r => r.executed === true).length,
      subagents_succeeded: results.filter(r => r.status === "completed").length,
      subagents_failed: failedSubagents.length,
      retries: retried.length,
      merged_result: merged,
      timestamp: new Date().toISOString(),
    };
    
    this.orchestrationHistory.push(orchestration);
    
    return {
      orchestrated: true,
      orchestration,
      subagents: spawned,
      results,
      merged,
      retries: retried,
      // v4.2.1: surface persona provenance on the success path too
      persona_role: personaRole || null,
      persona_domain: personaDomain,
      persona_driven: personaDriven,
      message: this.executor
        ? `Orchestrated ${spawned.length} subagents (${results.filter(r => r.status === "completed").length} succeeded, ${failedSubagents.length} failed, ${retried.length} retried).`
        : `Spawned ${spawned.length} subagents and dispatched them to the calling agent ` +
          `(${failedSubagents.length} failed to spawn, ${retried.length} retried). No subagent was executed by this daemon.`,
    };
  }

  // Decide if orchestration is needed
  shouldOrchestrate(dagPlan) {
    const nodeCount = dagPlan.nodes?.length || dagPlan.node_count || 0;
    
    if (nodeCount <= 2) {
      return { needed: false, reason: "simple_task", parallelizable: [] };
    }
    
    // Find parallelizable nodes (no dependencies between them)
    const parallelizable = this.findParallelizable(dagPlan);
    
    return {
      needed: true,
      reason: `complex_task (${nodeCount} DAG nodes)`,
      parallelizable,
      recommended_count: Math.min(parallelizable.length, 4), // max 4 subagents
    };
  }

  findParallelizable(dagPlan) {
    const nodes = dagPlan.nodes || [];
    if (nodes.length === 0) return [];
    
    // Nodes with no dependencies (or whose dependencies are all completed)
    const parallelizable = [];
    for (const node of nodes) {
      if (!node.dependencies || node.dependencies.length === 0) {
        parallelizable.push(node);
      }
    }
    
    // If no parallel nodes, take the first 2-3 as sequential subagents
    if (parallelizable.length === 0 && nodes.length > 0) {
      return nodes.slice(0, Math.min(nodes.length, 3));
    }
    
    return parallelizable.slice(0, 4); // max 4
  }

  // v4.2.1: Create subagent assignments from DAG nodes.
  // When personaDomain is provided (non-"general"), the override map
  // is applied AT ASSIGNMENT TIME — meaning the spawned subagent's
  // role/memory_mode/capabilities are already persona-aware before
  // the caller's post-spawn rewrite runs (which is now a no-op for
  // already-overridden assignments, but stays as a safety net).
  createAssignments(dagPlan, parallelizable, personaDomain) {
    const assignments = [];
    const domain = personaDomain || "general";
    const overrideMap = DOMAIN_ROLE_OVERRIDE[domain];

    for (const node of parallelizable) {
      const baseRole = this.selectRole(node);
      let role = baseRole;
      let memoryMode = this.selectMemoryMode(node);
      let capabilities = this.selectCapabilities(node);

      if (overrideMap && overrideMap[baseRole]) {
        const o = overrideMap[baseRole];
        role = o.role;
        memoryMode = o.memory_mode;
        capabilities = o.capabilities;
      }

      assignments.push({
        task: node.question || node.id,
        role,
        memoryMode,
        capabilities,
        // v4.2.1: provenance for tests + audit trail
        base_role: baseRole,
        persona_overridden: !!(overrideMap && overrideMap[baseRole]),
      });
    }

    return assignments;
  }

  selectRole(node) {
    const question = (node.question || "").toLowerCase();
    if (question.includes("test")) return "tester";
    if (question.includes("design") || question.includes("plan")) return "planner";
    if (question.includes("security") || question.includes("audit")) return "security";
    if (question.includes("deploy")) return "devops";
    return "executor";
  }

  selectMemoryMode(node) {
    const question = (node.question || "").toLowerCase();
    // Security tasks get full isolation (agent-agnostic)
    if (question.includes("security") || question.includes("audit")) {
      return "agent-agnostic";
    }
    // Planning tasks need context (inherit-partial)
    if (question.includes("design") || question.includes("plan")) {
      return "inherit-partial";
    }
    // Implementation tasks need full context (inherit-full)
    if (question.includes("implement") || question.includes("build")) {
      return "inherit-partial"; // partial is safer than full
    }
    // Default: partial (balance of context + isolation)
    return "inherit-partial";
  }

  selectCapabilities(node) {
    const question = (node.question || "").toLowerCase();
    const caps = [];
    if (question.includes("test")) caps.push("run_tests");
    if (question.includes("implement") || question.includes("build")) caps.push("write_file");
    if (question.includes("deploy")) caps.push("deploy");
    if (question.includes("audit") || question.includes("security")) caps.push("security_scan");
    return caps.length > 0 ? caps : ["execute"];
  }

  // Execute subagents — but only an injected executor can actually run one.
  //
  // This used to be `const success = Math.random() > 0.2;` and report
  // "completed" / "failed" accordingly, so `POST /subagent/orchestrate`
  // returned invented successes and failures for work that never ran. Without
  // an executor the result is a dispatch record: the subagent exists, the
  // calling agent is responsible for running it, and nothing here claims an
  // outcome.
  async executeParallel(subagents) {
    return Promise.all(
      subagents.map(async (sub) => {
        const base = {
          subagent_id: sub.id,
          task: sub.task,
          role: sub.role,
          memory_mode: sub.memory_mode,
        };

        if (sub.error) {
          // spawn() threw: a real failure, reported as one
          return { ...base, status: "failed", executed: false, execution: "none", result: null, error: sub.error, completed_at: null };
        }

        if (!this.executor) {
          return { ...base, status: "dispatched", executed: false, execution: "delegated_to_host", result: null, error: null, completed_at: null };
        }

        try {
          const result = await this.executor(sub);
          return { ...base, status: "completed", executed: true, execution: "executed_locally", result: result === undefined ? null : result, error: null, completed_at: new Date().toISOString() };
        } catch (e) {
          return { ...base, status: "failed", executed: true, execution: "executed_locally", result: null, error: e.message || "execution_failed", completed_at: new Date().toISOString() };
        }
      })
    );
  }

  // Merge results from multiple subagents
  mergeResults(results) {
    const successful = results.filter(r => r.status === "completed");
    const failed = results.filter(r => r.status === "failed");
    const dispatched = results.filter(r => r.status === "dispatched");
    
    return {
      total: results.length,
      succeeded: successful.length,
      failed: failed.length,
      // Dispatched but not run here — neither success nor failure.
      not_executed: dispatched.length,
      tasks_completed: successful.map(r => ({ task: r.task, result: r.result })),
      tasks_failed: failed.map(r => ({ task: r.task, error: r.error })),
      tasks_dispatched: dispatched.map(r => ({ task: r.task, role: r.role })),
      all_succeeded: results.length > 0 && successful.length === results.length,
      // "not_executed" instead of "complete": a pack with dispatch-only
      // subagents must not look like finished work.
      merge_strategy: dispatched.length > 0 ? "not_executed" : (failed.length === 0 ? "complete" : "partial"),
    };
  }

  // Handle failure: retry with different memory mode
  async handleFailure(failedSubagent) {
    if (!failedSubagent.subagent_id) return null;
    
    // Get the original subagent
    const original = await this.subagentManager.getInstance?.(failedSubagent.subagent_id) 
      || await this.getSubagent(failedSubagent.subagent_id);
    
    if (!original) return null;
    
    // Retry with different memory mode
    let newMemoryMode;
    if (original.memory_mode === "agent-agnostic") {
      newMemoryMode = "inherit-partial"; // give it some context
    } else if (original.memory_mode === "inherit-partial") {
      newMemoryMode = "inherit-full"; // give it full context
    } else {
      // Already tried full → don't retry
      return null;
    }
    
    try {
      const retry = await this.subagentManager.spawn({
        identity_id: original.identity_id,
        role: original.role,
        task: original.task,
        memory_mode: newMemoryMode,
        lifespan: "one-time",
        retry_of: failedSubagent.subagent_id,
      });
      
      return {
        ...retry,
        retry: true,
        retry_reason: `Original failed with ${original.memory_mode}, retrying with ${newMemoryMode}`,
      };
    } catch (e) {
      return null;
    }
  }

  async getSubagent(id) {
    // Fallback if subagentManager doesn't have getInstance
    return { id, memory_mode: "inherit-partial", role: "executor", task: "" };
  }

  // ============================================================
  // STATS
  // ============================================================
  async stats() {
    return {
      total_orchestrations: this.orchestrationHistory.length,
      execution_mode: this.executionMode,
      total_subagents_spawned: this.orchestrationHistory.reduce((s, o) => s + o.subagents_spawned, 0),
      total_dispatched: this.orchestrationHistory.reduce((s, o) => s + (o.subagents_dispatched || 0), 0),
      total_executed: this.orchestrationHistory.reduce((s, o) => s + (o.subagents_executed || 0), 0),
      // 0 here means "nothing was executed by this daemon", not "everything
      // failed" — read execution_mode before interpreting these.
      total_succeeded: this.orchestrationHistory.reduce((s, o) => s + o.subagents_succeeded, 0),
      total_failed: this.orchestrationHistory.reduce((s, o) => s + o.subagents_failed, 0),
      total_retries: this.orchestrationHistory.reduce((s, o) => s + o.retries, 0),
      // v4.2.1: surface persona-driven orchestration counts
      persona_driven_orchestrations: this.orchestrationHistory.filter(o => o.persona_driven).length,
      persona_domain_breakdown: this.orchestrationHistory.reduce((m, o) => {
        if (o.persona_domain) m[o.persona_domain] = (m[o.persona_domain] || 0) + 1;
        return m;
      }, {}),
      reference: "Subagent Orchestrator — spawn + dispatch (execution delegated to the calling agent unless an executor is injected)",
    };
  }
}

module.exports = {
  SubagentOrchestrator,
  // v4.2.1: export the maps for tests + introspection
  PERSONA_ROLE_DOMAIN,
  DOMAIN_ROLE_OVERRIDE,
};
