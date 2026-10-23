// ============================================================
// Filter utility — smart prompt interception logic
// ============================================================

const DEFAULT_CONFIG = {
  min_prompt_length: 20,
  skip_patterns: [
    "^what is",
    "^how to",
    "^explain",
    "^define",
    "^hi$",
    "^hello$",
    "^test$",
    "thank you",
  ],
  intercept_patterns: [
    "build|implement|add|create|make",
    "fix|bug|issue|broken",
    "refactor|clean|improve|optimize",
    "test|spec|coverage",
    "deploy|release|ship",
    "debug|trace|investigate",
  ],
  code_keywords: [
    "function",
    "class",
    "component",
    "api",
    "route",
    "test",
    "file",
    "import",
    "export",
  ],
};

/**
 * Decide whether a prompt should be intercepted
 * @param {string} prompt - The user's prompt
 * @param {Object} config - Filter config (defaults to DEFAULT_CONFIG)
 * @returns {{ should_intercept: boolean, reason: string, pattern?: string }}
 */
function shouldIntercept(prompt, config = DEFAULT_CONFIG) {
  if (!prompt || typeof prompt !== "string") {
    return { should_intercept: false, reason: "invalid_prompt" };
  }

  // Skip if too short
  if (prompt.length < config.min_prompt_length) {
    return { should_intercept: false, reason: "prompt_too_short" };
  }

  // Skip if matches skip pattern
  for (const pattern of config.skip_patterns || []) {
    try {
      const regex = new RegExp(pattern, "i");
      if (regex.test(prompt)) {
        return { should_intercept: false, reason: "skip_pattern_matched", pattern };
      }
    } catch {
      // Skip invalid patterns
    }
  }

  // Intercept if matches intercept pattern
  for (const pattern of config.intercept_patterns || []) {
    try {
      const regex = new RegExp(pattern, "i");
      if (regex.test(prompt)) {
        return { should_intercept: true, reason: "intercept_pattern_matched", pattern };
      }
    } catch {}
  }

  // Default: intercept if it has code-related keywords
  const codeRegex = new RegExp(
    `\\b(${(config.code_keywords || []).join("|")})\\b`,
    "i"
  );
  if (codeRegex.test(prompt)) {
    return { should_intercept: true, reason: "code_intent_detected" };
  }

  return { should_intercept: false, reason: "no_code_intent" };
}

/**
 * Find a relevant context pack based on prompt keywords
 */
function findRelevantPack(prompt, availablePacks = []) {
  const promptLower = (prompt || "").toLowerCase();
  for (const pack of availablePacks) {
    if (promptLower.includes(pack.toLowerCase())) {
      return pack;
    }
  }
  return "default";
}

/**
 * Calculate word overlap between two prompts
 */
function calculateOverlap(a, b) {
  const wordsA = new Set(
    (a || "")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
  const wordsB = new Set(
    (b || "")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
  if (wordsA.size === 0) return 0;
  let common = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) common++;
  }
  return common / wordsA.size;
}

module.exports = {
  DEFAULT_CONFIG,
  shouldIntercept,
  findRelevantPack,
  calculateOverlap,
};
