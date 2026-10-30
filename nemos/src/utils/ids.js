// ============================================================
// Id generation for file-backed records.
//
// `Date.now().toString(36)` was used as the whole id in several
// stores (experiences, candidates, subagents, skills). Two records
// created in the same millisecond therefore got the same id, and
// the second write replaced the first with no error — silent data
// loss under concurrency, which is exactly when it matters.
// ============================================================
const crypto = require("crypto");

function randomSuffix(bytes = 3) {
  return crypto.randomBytes(bytes).toString("hex");
}

function timeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${randomSuffix()}`;
}

module.exports = { randomSuffix, timeId };
