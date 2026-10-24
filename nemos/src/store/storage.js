// ============================================================
// Nemons Storage Layer — file-based persistence
//
// All writes go through the atomic helpers: data is written to a
// temp file in the same directory and renamed over the target, so a
// crash mid-write can never leave a truncated/corrupt record behind
// (a plain fs.writeFile can, and did for evidence/experiences).
// ============================================================

const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const { nemonsHome } = require("../utils/runtime-config");

const NEMONS_HOME = nemonsHome();

/**
 * Initialize storage directories
 */
async function initialize() {
  const dirs = [
    "config",
    "context-packs",
    "experiences",
    "evidence",
    "logs",
    "plugins",
    "run",
    "audit",
  ];
  for (const dir of dirs) {
    await fs.mkdir(path.join(NEMONS_HOME, dir), { recursive: true });
  }
}

/**
 * Atomic write: temp file + rename (same directory → same filesystem,
 * so the rename is atomic). Caller decides serialization.
 */
async function writeAtomic(fullPath, data) {
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  const tmp = `${fullPath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, fullPath);
  return fullPath;
}

/**
 * Save a JSON object to a file (atomically).
 * `filename` becomes a path component under NEMONS_HOME/<dir> — it is
 * validated so a hostile name can never traverse out of the dir.
 */
async function saveJSON(dir, filename, data) {
  const { isSafeId } = require("../utils/path-guard");
  if (!isSafeId(filename)) {
    throw new Error(`invalid storage filename: ${JSON.stringify(String(filename).slice(0, 32))}`);
  }
  const fullPath = path.join(NEMONS_HOME, dir, filename);
  return writeAtomic(fullPath, JSON.stringify(data, null, 2));
}

/**
 * Load a JSON object from a file
 */
async function loadJSON(dir, filename) {
  const fullPath = path.join(NEMONS_HOME, dir, filename);
  try {
    const raw = await fs.readFile(fullPath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * List all files in a directory
 */
async function listFiles(dir, extension = null) {
  const fullPath = path.join(NEMONS_HOME, dir);
  try {
    const files = await fs.readdir(fullPath);
    return extension
      ? files.filter((f) => f.endsWith(extension))
      : files;
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

/**
 * Delete a file
 */
async function deleteFile(dir, filename) {
  const fullPath = path.join(NEMONS_HOME, dir, filename);
  try {
    await fs.unlink(fullPath);
    return true;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

/**
 * Get stats for a directory (count, size)
 */
async function getStats(dir) {
  const fullPath = path.join(NEMONS_HOME, dir);
  const files = await listFiles(dir);
  let totalSize = 0;
  for (const file of files) {
    try {
      const stat = await fs.stat(path.join(fullPath, file));
      totalSize += stat.size;
    } catch {}
  }
  return { count: files.length, sizeBytes: totalSize, path: fullPath };
}

/**
 * Clean up files older than maxAgeMs
 */
async function cleanOlder(dir, maxAgeMs) {
  const fullPath = path.join(NEMONS_HOME, dir);
  const files = await listFiles(dir);
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  for (const file of files) {
    try {
      const filePath = path.join(fullPath, file);
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs < cutoff) {
        await fs.unlink(filePath);
        removed++;
      }
    } catch {}
  }
  return removed;
}

module.exports = {
  NEMONS_HOME,
  initialize,
  saveJSON,
  loadJSON,
  writeAtomic,
  listFiles,
  deleteFile,
  getStats,
  cleanOlder,
};
