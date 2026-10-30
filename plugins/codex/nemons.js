// ============================================================
// Example Plugin: Nemons adapter shape for Codex CLI
//
// NOT WHAT GETS INSTALLED. Codex has no plugin directory and never reads
// `~/.codex/plugins/`; the file is kept as a sketch of the `onPrompt` /
// `onResponse` contract, not as a supported integration.
//
// What `nemons plugin install --agent codex` really does, verified against
// codex-cli 0.149.1:
//   1. registers the daemon as a streamable-HTTP MCP server:
//        codex mcp add nemons --url http://127.0.0.1:<port>/mcp
//      then reads it back from `codex mcp list --json` and from
//      `codex doctor`'s own mcp.config check (see src/utils/codex-host.js);
//   2. writes $CODEX_HOME/skills/nemons-orchestrator/SKILL.md — the only
//      prompt-level channel Codex offers. Writing it is verified; the host
//      deciding to load it is not ours to claim.
//
// So the hook body below is illustrative. The equivalent of onPrompt is the
// model calling nemons.analyze_prompt; the equivalent of onResponse is it
// calling nemons.collect_evidence and nemons.evaluate_run.
// ============================================================

// Resolved rather than hardcoded: NEMONS_PORT / NEMONS_HOST move the daemon,
// and a shim pinned to 3456 would silently point the model at a port nobody
// listens on. The daemon's full precedence also reads config/daemon.yml, which
// a standalone adapter cannot parse without pulling in daemon internals — so
// `nemons plugin install` rewrites the address in the skill file it installs
// for Codex, and this env-var fallback covers the hand-copied case.
// `nemons health` prints the live address.
const DAEMON_HOST = process.env.NEMONS_HOST || "127.0.0.1";
const DAEMON_PORT = process.env.NEMONS_PORT || 3456;
const NEMONS_DAEMON = `http://${DAEMON_HOST}:${DAEMON_PORT}`;
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
          // `adopted_role` appears only when an approved persona was applied.
          `Persona: ${pack.persona?.adopted_role || pack.persona?.role || "unspecified"}`,
          `Skills: ${(pack.skills || []).map((s) => s.id).join(", ")}`,
          // `knowledge` holds records (id/title), not bare strings.
          `Knowledge: ${(pack.knowledge || []).map((k) => k.title || k).join("; ")}`,
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
