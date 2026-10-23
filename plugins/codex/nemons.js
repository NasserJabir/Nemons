// ============================================================
// Example Plugin: Nemons plugin for Codex CLI
// Codex CLI supports plugins via .codex/plugins/ directory
// ============================================================

const NEMONS_DAEMON = "http://127.0.0.1:3456";
const DAEMON_TIMEOUT = 5000;

async function callDaemon(path, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DAEMON_TIMEOUT);
  try {
    const res = await fetch(`${NEMONS_DAEMON}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function shouldIntercept(prompt) {
  if (!prompt || prompt.length < 20) return false;
  const skipPatterns = [/^what is/i, /^how to/i, /^explain/i, /^define/i, /^hi$/i, /^hello$/i];
  if (skipPatterns.some((p) => p.test(prompt))) return false;
  const interceptPatterns = [
    /\b(build|implement|add|create|make)\b/i,
    /\b(fix|bug|issue|broken)\b/i,
    /\b(refactor|clean|improve|optimize)\b/i,
    /\b(test|spec|coverage)\b/i,
    /\b(deploy|release|ship)\b/i,
    /\b(debug|trace|investigate)\b/i,
  ];
  return interceptPatterns.some((p) => p.test(prompt));
}

module.exports = {
  name: "nemons",
  
  // Hook called before each prompt is sent to the model
  async onPrompt(prompt, context) {
    if (!shouldIntercept(prompt)) return { augmented: false };
    
    const analysis = await callDaemon("/analyze", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        project_root: context.cwd,
        adapter: "codex",
      }),
    });
    
    if (!analysis?.should_intercept) return { augmented: false };
    
    let systemContext = "";
    if (analysis.suggested_pack_id) {
      const pack = await callDaemon(`/context-pack/${analysis.suggested_pack_id}`);
      if (pack) {
        systemContext = [
          `Persona: ${pack.persona?.role}`,
          `Skills: ${(pack.skills || []).map((s) => s.id).join(", ")}`,
          `Knowledge: ${(pack.knowledge || []).join("; ")}`,
          `Success Criteria: ${(pack.success_criteria || []).join("; ")}`,
        ].join("\n");
      }
    }
    
    return {
      augmented: true,
      system_context: systemContext,
    };
  },
  
  // Hook called after the model responds
  async onResponse(prompt, response, context) {
    if (!shouldIntercept(prompt)) return;
    
    const evidence = {
      prompt,
      response: response.content,
      git_diff: await getGitDiff(),
      git_hash: await getGitHash(),
    };
    
    const runId = `codex-${Date.now()}`;
    await callDaemon("/evidence", {
      method: "POST",
      body: JSON.stringify({ run_id: runId, evidence }),
    });
    
    const result = await callDaemon("/evaluate", {
      method: "POST",
      body: JSON.stringify({ run_id: runId, evidence }),
    });
    
    if (result?.passed) {
      console.log(`[nemons] ✓ verified (exp: ${result.experience_stored})`);
    } else if (result) {
      console.warn(`[nemons] ⚠ verification failed`);
    }
  },
};

async function getGitDiff() {
  try {
    const { execSync } = require("child_process");
    return execSync("git diff", { encoding: "utf-8" });
  } catch {
    return "";
  }
}

async function getGitHash() {
  try {
    const { execSync } = require("child_process");
    return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}
