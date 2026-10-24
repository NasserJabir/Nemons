// ============================================================
// Trust Factor with REAL Enforcement (v2.5.0)
// Based on: arXiv:2508.18765 (GaaS)
// v2.5.0: Trust Factor now GATES agent actions
// ============================================================

const fs = require("fs").promises;
const path = require("path");
const os = require("os");

const NEMONS_HOME = require("./runtime-config").nemonsHome();
const TRUST_FILE = path.join(NEMONS_HOME, "audit", "trust-factors.json");
const ENFORCEMENT_LOG = path.join(NEMONS_HOME, "audit", "enforcement-log.json");

const DEFAULT_HYPERPARAMS = { alpha: 0.3, beta: 0.5, gamma: 0.2, delta: 0.1 };
const THRESHOLDS = { theta_warn: 0.7, theta_critical: 0.4 };

async function loadTrustFactors() {
  try { return JSON.parse(await fs.readFile(TRUST_FILE, "utf8")); }
  catch { return {}; }
}

async function saveTrustFactors(factors) {
  await fs.mkdir(path.dirname(TRUST_FILE), { recursive: true });
  await fs.writeFile(TRUST_FILE, JSON.stringify(factors, null, 2));
}

async function logEnforcement(decision) {
  await fs.mkdir(path.dirname(ENFORCEMENT_LOG), { recursive: true });
  let log = [];
  try { log = JSON.parse(await fs.readFile(ENFORCEMENT_LOG, "utf8")); } catch {}
  log.push({ ...decision, timestamp: new Date().toISOString() });
  log = log.slice(-1000); // keep last 1000
  await fs.writeFile(ENFORCEMENT_LOG, JSON.stringify(log, null, 2));
}

function computeTF(agent) {
  const hp = DEFAULT_HYPERPARAMS;
  const N = Math.max(agent.N, 1);
  const tf = hp.alpha * (1 - agent.V_norm/N)
           + hp.beta * (1 - agent.V_coer/N)
           + hp.gamma * (1 - agent.V_mim/N)
           - hp.delta * agent.S_sum;
  return Math.max(0, Math.min(1, tf));
}

async function getTrustFactor(agentId) {
  const factors = await loadTrustFactors();
  if (!factors[agentId]) {
    factors[agentId] = {
      agent_id: agentId, V_norm: 0, V_coer: 0, V_mim: 0, N: 0, S_sum: 0,
      history: [], TF_a: 1.0, last_updated: new Date().toISOString(),
    };
    await saveTrustFactors(factors);
  }
  return factors[agentId];
}

async function recordViolation(agentId, violation) {
  const factors = await loadTrustFactors();
  if (!factors[agentId]) {
    factors[agentId] = { agent_id: agentId, V_norm: 0, V_coer: 0, V_mim: 0, N: 0, S_sum: 0, history: [], TF_a: 1.0 };
  }
  const agent = factors[agentId];
  agent.N += 1;
  switch (violation.type) {
    case "coercive": agent.V_coer += 1; break;
    case "normative": agent.V_norm += 1; break;
    case "mimetic": agent.V_mim += 1; break;
  }
  const severity = violation.severity || 0.5;
  agent.S_sum = agent.S_sum * 0.95 + severity;
  agent.history.push({
    timestamp: new Date().toISOString(), type: violation.type,
    rule_id: violation.rule_id, severity, description: violation.description,
  });
  agent.history = agent.history.slice(-100);
  agent.TF_a = computeTF(agent);
  agent.last_updated = new Date().toISOString();
  await saveTrustFactors(factors);
  return agent;
}

// v2.5.0: REAL ENFORCEMENT — gates actions based on trust
async function enforce(agentId, action) {
  const agent = await getTrustFactor(agentId);
  const tf = agent.TF_a;
  let decision;
  
  if (tf < THRESHOLDS.theta_critical) {
    // Critical trust — block everything except read-only
    if (action.type === "read" || action.type === "query") {
      decision = { action: "allow", reason: "read_only_allowed", tf, threshold: "critical" };
    } else {
      decision = { action: "block", reason: "trust_below_critical", tf, threshold: "critical",
        message: `Agent ${agentId} trust factor ${tf.toFixed(3)} below critical threshold ${THRESHOLDS.theta_critical}. Action blocked.` };
    }
  } else if (tf < THRESHOLDS.theta_warn) {
    // Warning zone — allow but warn
    if (action.type === "deploy" || action.type === "delete" || action.type === "modify_security") {
      decision = { action: "block", reason: "high_risk_action_in_warning_zone", tf, threshold: "warn",
        message: `High-risk action blocked for agent with warning-level trust.` };
    } else {
      decision = { action: "warn", reason: "trust_in_warning_zone", tf, threshold: "warn",
        message: `Agent ${agentId} trust factor ${tf.toFixed(3)} is in warning zone.` };
    }
  } else {
    // Healthy trust — allow
    decision = { action: "allow", reason: "trust_healthy", tf, threshold: "healthy" };
  }
  
  // Log the enforcement decision
  await logEnforcement({
    agent_id: agentId, action_type: action.type, action_description: action.description || "",
    decision: decision.action, reason: decision.reason, tf, ...decision,
  });
  
  return decision;
}

// Check if action is allowed (convenience method)
async function isAllowed(agentId, action) {
  const decision = await enforce(agentId, action);
  return decision.action !== "block";
}

function getEnforcementDecision(agent, violation) {
  const tf = agent.TF_a;
  if (violation.type === "coercive") {
    return tf < THRESHOLDS.theta_critical ? "human_escalation" : "block";
  }
  if (violation.type === "normative") {
    if (tf < THRESHOLDS.theta_critical) return "human_escalation";
    if (tf < THRESHOLDS.theta_warn) return "escalate";
    return "warn";
  }
  return "warn";
}

async function getTrustStats() {
  const factors = await loadTrustFactors();
  const agents = Object.values(factors);
  return {
    total_agents: agents.length,
    average_trust: agents.length > 0
      ? agents.reduce((s, a) => s + a.TF_a, 0) / agents.length : 1.0,
    critical_agents: agents.filter(a => a.TF_a < THRESHOLDS.theta_critical).length,
    warning_agents: agents.filter(a =>
      a.TF_a >= THRESHOLDS.theta_critical && a.TF_a < THRESHOLDS.theta_warn
    ).length,
    healthy_agents: agents.filter(a => a.TF_a >= THRESHOLDS.theta_warn).length,
    total_violations: agents.reduce((s, a) => s + a.V_norm + a.V_coer + a.V_mim, 0),
  };
}

// v2.5.0: Get enforcement log
async function getEnforcementLog(limit) {
  try {
    const log = JSON.parse(await fs.readFile(ENFORCEMENT_LOG, "utf8"));
    return log.slice(-(limit || 50)).reverse();
  } catch { return []; }
}

module.exports = {
  DEFAULT_HYPERPARAMS, THRESHOLDS,
  loadTrustFactors, saveTrustFactors,
  getTrustFactor, computeTF,
  recordViolation, getEnforcementDecision,
  getTrustStats,
  enforce,          // v2.5.0: NEW — real enforcement
  isAllowed,        // v2.5.0: NEW — convenience check
  getEnforcementLog, // v2.5.0: NEW — audit trail
};
