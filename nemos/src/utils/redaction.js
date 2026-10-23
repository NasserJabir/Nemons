// ============================================================
// Redaction utility — strips secrets from strings and objects
// ============================================================

const DEFAULT_PATTERNS = [
  { name: "API_KEY", regex: /API_KEY_\w+/g },
  { name: "Bearer", regex: /Bearer \w+/g },
  { name: "OpenAI key", regex: /sk-(?!ant-)[a-zA-Z0-9]{20,}/g },
  { name: "Anthropic key", regex: /sk-ant-\w+/g },
  { name: "AWS key", regex: /AKIA[0-9A-Z]{16}/g },
  { name: "PEM private key", regex: /-----BEGIN[\s\S]*?PRIVATE KEY-----/g },
  { name: "JWT", regex: /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g },
  { name: "Generic password", regex: /password\s*=\s*['"]\w+['"]/gi },
];

/**
 * Redact secrets from a string
 * @param {string} text
 * @param {Array} patterns - Custom patterns to override defaults
 * @param {string} replacement
 * @returns {string}
 */
function redactString(text, patterns = DEFAULT_PATTERNS, replacement = "[REDACTED]") {
  let result = text;
  for (const { regex } of patterns) {
    result = result.replace(regex, replacement);
  }
  return result;
}

/**
 * Recursively redact secrets from an object
 * @param {any} obj
 * @param {Array} patterns
 * @param {string} replacement
 * @returns {any}
 */
function redactObject(obj, patterns = DEFAULT_PATTERNS, replacement = "[REDACTED]") {
  if (typeof obj === "string") {
    return redactString(obj, patterns, replacement);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, patterns, replacement));
  }
  if (obj && typeof obj === "object") {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      // Also redact known sensitive keys entirely
      if (/password|secret|token|key|credential/i.test(key) && typeof value === "string") {
        result[key] = replacement;
      } else {
        result[key] = redactObject(value, patterns, replacement);
      }
    }
    return result;
  }
  return obj;
}

/**
 * Detect if a string contains any known secret patterns
 */
function containsSecrets(text, patterns = DEFAULT_PATTERNS) {
  return patterns.some(({ regex }) => regex.test(text));
}

module.exports = {
  DEFAULT_PATTERNS,
  redactString,
  redactObject,
  containsSecrets,
};
