// ============================================================
// Nemons adapter for Trae IDE
//
// REFERENCE SHIM — this file exists so plugins/trae/manifest.json
// ("entry": "nemons.js") resolves. It has not been installed into Trae and
// Trae's plugin API may differ. Treat it as the intended hook contract
// (`onPrompt` / `onResponse`), not a supported integration.
// See README "Integration status".
// ============================================================

const NEMONS_DAEMON = process.env.NEMONS_DAEMON_URL || "http://127.0.0.1:3456";
const DAEMON_TIMEOUT = 5000;

const SKIP_PATTERNS = [/^what is/i, /^how to/i, /^explain/i, /^define/i, /^hi$/i, /^hello$/i];
const INTERCEPT_PATTERNS = [
  /\b(build|implement|add|create|make)\b/i,
  /\b(fix|bug|issue|broken)\b/i,
  /\b(refactor|clean|improve|optimize)\b/i,
  /\b(deploy|release|ship)\b/i,
];

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
  if (SKIP_PATTERNS.some((p) => p.test(prompt))) return false;
  return INTERCEPT_PATTERNS.some((p) => p.test(prompt));
}

module.exports = {
  name: "nemons-trae",

  async onPrompt(prompt, context = {}) {
    if (!shouldIntercept(prompt)) return { augmented: false };

    const analysis = await callDaemon("/analyze", {
      method: "POST",
      body: JSON.stringify({ prompt, project_root: context.cwd, adapter: "trae" }),
    });
    if (!analysis?.should_intercept || !analysis.context_pack) return { augmented: false };

    const pack = analysis.context_pack;
    const systemContext = [
      `Persona: ${pack.persona?.adopted_role || pack.persona?.role || "unspecified"}`,
      `Skills (usable only): ${(pack.skills || []).filter((s) => s.can_use).map((s) => s.name || s.id).join(", ") || "none"}`,
      `Knowledge: ${(pack.knowledge || []).map((k) => k.title).join("; ") || "none"}`,
      `Success criteria: ${(pack.success_criteria || []).join("; ") || "none"}`,
    ].join("\n");

    return { augmented: true, system_context: systemContext, pack_id: pack.id };
  },

  async onResponse(prompt, response, context = {}) {
    if (!shouldIntercept(prompt)) return;

    const evidence = {
      prompt,
      response: typeof response === "string" ? response : response?.content || "",
      git_diff: getGitDiff(),
      git_hash_before: getGitHash(),
    };
    const runId = `trae-${Date.now()}`;

    await callDaemon("/evidence", { method: "POST", body: JSON.stringify({ run_id: runId, evidence }) });
    const result = await callDaemon("/evaluate", {
      method: "POST",
      body: JSON.stringify({ run_id: runId, evidence, prompt, adapter: "trae" }),
    });

    if (!result) return;
    console.log(result.pass ? "[nemons] verified, experience stored" : `[nemons] verification failed: ${(result.failures || []).join(", ")}`);
  },
};

function getGitDiff() {
  try {
    return require("child_process").execFileSync("git", ["diff"], { encoding: "utf-8" });
  } catch {
    return "";
  }
}

function getGitHash() {
  try {
    return require("child_process").execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}
