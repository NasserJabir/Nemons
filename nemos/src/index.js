// ============================================================
// Nemons SDK — Public API
// Use this module to embed Nemons in your own applications
// ============================================================

const Daemon = require("./daemon/server");
const { version } = require("../package.json");

/**
 * Create a Nemons daemon instance
 * @param {Object} opts - Configuration options
 * @param {string} [opts.configPath] - Path to daemon.yml
 * @param {number} [opts.port] - Port to listen on (default: 3456)
 * @param {string} [opts.host] - Host to bind to (default: 127.0.0.1)
 * @returns {import("express").Express} Express app
 */
function createDaemon(opts = {}) {
  if (opts.port) process.env.NEMONS_PORT = String(opts.port);
  if (opts.configPath) process.env.NEMONS_CONFIG = opts.configPath;
  return Daemon.app;
}

/**
 * Get the Nemons version
 */
function getVersion() {
  return version;
}

/**
 * Health check — verify daemon is running
 */
async function healthCheck(url = "http://127.0.0.1:3456") {
  try {
    const res = await fetch(`${url}/health`);
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, ...(await res.json()) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Analyze a prompt to decide if it should be intercepted
 */
async function analyzePrompt(prompt, projectRoot, adapter, url = "http://127.0.0.1:3456") {
  const res = await fetch(`${url}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, project_root: projectRoot, adapter }),
  });
  return res.json();
}

/**
 * Get a context pack by ID
 */
async function getContextPack(packId, url = "http://127.0.0.1:3456") {
  const res = await fetch(`${url}/context-pack/${packId}`);
  return res.json();
}

/**
 * Submit evidence for a run (with automatic secret redaction)
 */
async function submitEvidence(runId, evidence, url = "http://127.0.0.1:3456") {
  const res = await fetch(`${url}/evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId, evidence }),
  });
  return res.json();
}

/**
 * Evaluate a run — runs the verification loop
 */
async function evaluateRun(runId, evidence, url = "http://127.0.0.1:3456") {
  const res = await fetch(`${url}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId, evidence }),
  });
  return res.json();
}

/**
 * Retrieve similar past experiences for context enrichment
 */
async function retrieveSimilarExperiences(prompt, limit = 3, url = "http://127.0.0.1:3456") {
  const res = await fetch(`${url}/experiences?limit=${limit}&prompt=${encodeURIComponent(prompt)}`);
  return res.json();
}

module.exports = {
  createDaemon,
  getVersion,
  healthCheck,
  analyzePrompt,
  getContextPack,
  submitEvidence,
  evaluateRun,
  retrieveSimilarExperiences,
};
