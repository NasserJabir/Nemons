// ============================================================
// Nemons Plugin for OpenCode
// File: .opencode/plugins/nemons.ts
//
// REFERENCE SHIM — not installed or exercised against a current OpenCode
// release; the plugin hooks below follow the documented shape but are
// unverified. See README "Integration status".
// ============================================================

import type { Plugin } from "@opencode-ai/plugin";

const NEMONS_DAEMON = process.env.NEMONS_DAEMON_URL || "http://127.0.0.1:3456";
const NEMONS_DAEMON_TIMEOUT_MS = 5000;

interface NemonsAnalysis {
  should_intercept: boolean;
  suggested_pack_id?: string;
  similar_experiences?: Array<{ id: string; relevance: number }>;
}

interface KnowledgeItem {
  id: string;
  title?: string;
  content?: string;
}

interface ContextPack {
  persona: { role: string; adopted_role?: string; constraints?: string[] };
  skills: Array<{ id: string; reference?: string }>;
  knowledge: KnowledgeItem[];
  success_criteria: string[];
}

// Patterns that should always skip interception
const SKIP_PATTERNS = [
  /^what is/i,
  /^how to/i,
  /^explain/i,
  /^define/i,
  /^hi$/i,
  /^hello$/i,
  /^test$/i,
  /thank you/i,
];

// Patterns that should always intercept
const INTERCEPT_PATTERNS = [
  /\b(build|implement|add|create|make)\b/i,
  /\b(fix|bug|issue|broken)\b/i,
  /\b(refactor|clean|improve|optimize)\b/i,
  /\b(test|spec|coverage)\b/i,
  /\b(deploy|release|ship)\b/i,
  /\b(debug|trace|investigate)\b/i,
];

async function callDaemon<T>(path: string, init?: RequestInit): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NEMONS_DAEMON_TIMEOUT_MS);
  try {
    const response = await fetch(`${NEMONS_DAEMON}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    // Graceful degradation — daemon unreachable, no-op
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function shouldIntercept(prompt: string): boolean {
  if (prompt.length < 20) return false;
  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(prompt)) return false;
  }
  for (const pattern of INTERCEPT_PATTERNS) {
    if (pattern.test(prompt)) return true;
  }
  // Default: intercept longer code-related prompts
  return /\b(function|class|component|api|route|test|file)\b/i.test(prompt);
}

function renderContextPack(pack: ContextPack): string {
  const lines: string[] = [];
  lines.push("--- NEMONS CONTEXT PACK ---");
  // `adopted_role` is only present when an approved persona was applied.
  lines.push(`Persona: ${pack.persona.adopted_role || pack.persona.role}`);
  const constraints = pack.persona.constraints || [];
  if (constraints.length > 0) {
    lines.push(`Constraints: ${constraints.join("; ")}`);
  }
  const skills = pack.skills || [];
  if (skills.length > 0) {
    lines.push(`Skills: ${skills.map((s) => s.id).join(", ")}`);
  }
  const knowledge = pack.knowledge || [];
  if (knowledge.length > 0) {
    lines.push("Knowledge:");
    knowledge.forEach((k) => lines.push(`  - ${k.title || k.id}`));
  }
  if (pack.success_criteria.length > 0) {
    lines.push("Success Criteria:");
    pack.success_criteria.forEach((c) => lines.push(`  ✓ ${c}`));
  }
  lines.push("--- END CONTEXT PACK ---\n");
  return lines.join("\n");
}

async function collectEvidence(): Promise<unknown> {
  // Called after the agent responds — collect what's measurable
  const evidence: Record<string, unknown> = {
    collected_at: new Date().toISOString(),
  };

  // Git diff and hashes are always collectable
  try {
    const { execSync } = await import("node:child_process");
    evidence.git_diff = execSync("git diff", { encoding: "utf-8" });
    evidence.git_hash_before = execSync("git rev-parse HEAD", {
      encoding: "utf-8",
    }).trim();
  } catch {
    // Not a git repo, or git unavailable
  }

  return evidence;
}

export const NemonsPlugin: Plugin = async ({ project, directory }) => {
  console.log("[Nemons] Plugin initialized for project:", project?.name);

  return {
    // Intercept prompts BEFORE they reach the model
    "tool.execute.before": async (input, output) => {
      const userPrompt = input?.text || "";

      if (!shouldIntercept(userPrompt)) {
        return output;
      }

      // Step 1: Analyze
      const analysis = await callDaemon<NemonsAnalysis>("/analyze", {
        method: "POST",
        body: JSON.stringify({
          prompt: userPrompt,
          project_root: directory,
          adapter: "opencode",
        }),
      });

      if (!analysis || !analysis.should_intercept) {
        return output;
      }

      // Step 2: Load Context Pack
      if (analysis.suggested_pack_id) {
        const pack = await callDaemon<ContextPack>(
          `/context-pack/${analysis.suggested_pack_id}`,
        );
        if (pack) {
          // Inject pack into the prompt context
          const packText = renderContextPack(pack);
          output.args = output.args || {};
          output.args.system_context = packText;
        }
      }

      return output;
    },

    // Collect evidence AFTER the agent responds
    "tool.execute.after": async (input, output) => {
      const userPrompt = input?.text || "";
      if (!shouldIntercept(userPrompt)) return output;

      // Step 4: Collect evidence
      const evidence = await collectEvidence();

      // Step 5: Evaluate
      const evaluation = await callDaemon<{ passed: boolean; failures: string[] }>(
        "/evaluate",
        {
          method: "POST",
          body: JSON.stringify({
            run_id: `run-${Date.now()}`,
            evidence,
          }),
        },
      );

      // Step 6: Handle result
      if (evaluation) {
        if (evaluation.passed) {
          // Step 7: Store experience
          await callDaemon("/experiences", {
            method: "POST",
            body: JSON.stringify({
              prompt: userPrompt,
              evidence,
              adapter: "opencode",
              derived_skills: [],
            }),
          });
        } else {
          console.warn(
            `[Nemons] Verification failed: ${evaluation.failures.join("; ")}`,
          );
        }
      }

      return output;
    },

    // Log session events for Nemons observability
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await callDaemon("/sessions/end", {
          method: "POST",
          body: JSON.stringify({ session_id: event.properties?.session_id }),
        });
      }
    },
  };
};

export default NemonsPlugin;
