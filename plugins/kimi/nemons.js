// ============================================================
// Nemons Plugin for Kimi Code CLI
// Kimi supports plugins via ~/.kimi/plugins/
//
// REFERENCE SHIM — not installed or exercised against a current Kimi
// release. See README "Integration status".
// ============================================================

const NEMONS_DAEMON = "http://127.0.0.1:3456";

async function callDaemon(path, init) {
  try {
    const res = await fetch(`${NEMONS_DAEMON}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function shouldIntercept(prompt) {
  if (!prompt || prompt.length < 20) return false;
  if (/^(what is|how to|explain|define)/i.test(prompt)) return false;
  if (/^(hi|hello|test)$/i.test(prompt)) return false;
  return /\b(build|implement|fix|refactor|test|deploy|debug|create)\b/i.test(prompt);
}

module.exports = {
  name: "nemons-kimi",
  
  async onPrompt(prompt, context) {
    if (!shouldIntercept(prompt)) return;
    
    const analysis = await callDaemon("/analyze", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        project_root: context.cwd || process.cwd(),
        adapter: "kimi",
      }),
    });
    
    if (!analysis?.should_intercept) return;
    
    // Kimi's plugin API supports returning additional context
    if (analysis.suggested_pack_id) {
      const pack = await callDaemon(`/context-pack/${analysis.suggested_pack_id}`);
      if (pack) {
        return {
          augment_prompt: true,
          additional_context: JSON.stringify({
            persona: pack.persona,
            knowledge: pack.knowledge,
            success_criteria: pack.success_criteria,
          }),
        };
      }
    }
  },
  
  async onResponse(prompt, response, context) {
    if (!shouldIntercept(prompt)) return;
    
    const { execSync } = require("child_process");
    let diff = "";
    let hash = "";
    try {
      diff = execSync("git diff", { encoding: "utf-8" });
      hash = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
    } catch {}
    
    const evidence = { prompt, diff, git_hash: hash };
    const runId = `kimi-${Date.now()}`;
    
    await callDaemon("/evidence", {
      method: "POST",
      body: JSON.stringify({ run_id: runId, evidence }),
    });
    
    const result = await callDaemon("/evaluate", {
      method: "POST",
      body: JSON.stringify({ run_id: runId, evidence }),
    });
    
    if (result?.passed) {
      console.log(`[nemons] ✓ verified, experience stored`);
    }
  },
};
