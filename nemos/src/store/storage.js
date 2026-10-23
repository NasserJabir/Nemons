// ============================================================
// Nemons Storage Layer — file-based persistence
// ============================================================

const fs = require("fs").promises;
const path = require("path");
const os = require("os");

const NEMONS_HOME = process.env.NEMONS_HOME || path.join(os.homedir(), ".nemons");

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
 * Save a JSON object to a file
 */
async function saveJSON(dir, filename, data) {
  const fullPath = path.join(NEMONS_HOME, dir, filename);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, JSON.stringify(data, null, 2));
  return fullPath;
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
  listFiles,
  deleteFile,
  getStats,
  cleanOlder,
};
