// ============================================================
// Nemons Plugin for Cline (VS Code extension)
// Cline supports custom tools via @cline/sdk
// ============================================================

const { execSync } = require("child_process");
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

class NemonsClinePlugin {
  constructor() {
    this.name = "nemons-cline";
  }
  
  async beforeToolExecute(tool, args) {
    if (tool !== "write_to_file" && tool !== "replace_in_file") {
      return args;
    }
    
    const prompt = args?.task || "";
    if (!shouldIntercept(prompt)) return args;
    
    const analysis = await callDaemon("/analyze", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        project_root: process.cwd(),
        adapter: "cline",
      }),
    });
    
    if (!analysis?.should_intercept) return args;
    
    if (analysis.suggested_pack_id) {
      const pack = await callDaemon(`/context-pack/${analysis.suggested_pack_id}`);
      if (pack) {
        args.system_context = `Persona: ${pack.persona?.role}\nKnowledge: ${pack.knowledge?.join("; ")}`;
      }
    }
    
    return args;
  }
  
  async afterToolExecute(tool, args, result) {
    const prompt = args?.task || "";
    if (!shouldIntercept(prompt)) return;
    
    const evidence = {
      prompt,
      diff: this.getGitDiff(),
      git_hash: this.getGitHash(),
      tool,
      result,
    };
    
    const runId = `cline-${Date.now()}`;
    await callDaemon("/evidence", {
      method: "POST",
      body: JSON.stringify({ run_id: runId, evidence }),
    });
    
    const evalResult = await callDaemon("/evaluate", {
      method: "POST",
      body: JSON.stringify({ run_id: runId, evidence }),
    });
    
    if (evalResult?.passed) {
      console.log("[nemons] ✓ verified, experience stored");
    } else if (evalResult) {
      console.warn("[nemons] ⚠ verification failed");
    }
  }
  
  getGitDiff() {
    try {
      return execSync("git diff", { encoding: "utf-8" });
    } catch {
      return "";
    }
  }
  
  getGitHash() {
    try {
      return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
    } catch {
      return "";
    }
  }
}

module.exports = new NemonsClinePlugin();
