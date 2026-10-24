// ============================================================
// Path containment guard — the single choke point for every
// filesystem-touching endpoint. A hostile id ("../../x", "..%2f..%2fx",
// absolute paths, embedded separators) must never be able to make
// the daemon read or write outside NEMONS_HOME.
//
// Two layers, applied together at every call site:
//   1. isSafeId()       — reject anything that isn't a plain
//                          filename-safe token (fail fast, 400).
//   2. resolveWithin()  — defense in depth: even if a caller skips
//                          layer 1, the resolved path is verified to
//                          stay inside the base directory.
// ============================================================
const path = require("path");

// Ids become filename components, so they must be boring: letters,
// digits, dot, underscore, dash. No separators, no null bytes, and no
// leading dot (blocks "." / ".." and hidden-file tricks).
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function isSafeId(id) {
  return typeof id === "string" && SAFE_ID_RE.test(id);
}

// Resolve `segments` under `base` and return the absolute path,
// or null if the result escapes `base`.
function resolveWithin(base, ...segments) {
  const resolvedBase = path.resolve(base);
  const target = path.resolve(resolvedBase, ...segments.map(String));
  const rel = path.relative(resolvedBase, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return target;
}

module.exports = { isSafeId, resolveWithin, SAFE_ID_RE };
