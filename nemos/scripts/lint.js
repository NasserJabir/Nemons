// ============================================================
// Cross-platform syntax lint: `node --check` on every daemon JS
// file. Replaces the bash for-loop in package.json that failed on
// Windows ("f was unexpected at this time").
// ============================================================
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, out);
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

const files = [
  ...collect(path.join(ROOT, "src")),
  ...collect(path.join(ROOT, "bin")),
  ...collect(path.join(ROOT, "tests")),
  path.join(ROOT, "scripts", "lint.js"),
];

let failures = 0;
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (r.status !== 0) {
    failures++;
    console.error(`✗ ${rel}`);
    if (r.stderr) console.error(r.stderr.trim());
  }
}

// ---------- Readability guard ----------
// Minified output (one-letter names, whole modules on one line) is
// unmaintainable — this repo shipped 15 such files once. Any file
// averaging over 200 chars/line fails lint. All previously grandfathered
// modules have been rewritten readable; the allowlist is kept (empty)
// as the documented escape hatch if a future generated artifact ever
// needs one.
const MINIFIED_ALLOWLIST = new Set([]);

const AVG_LINE_LIMIT = 200;
for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (MINIFIED_ALLOWLIST.has(rel)) continue;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const avg = lines.reduce((s, l) => s + l.length, 0) / lines.length;
  if (avg > AVG_LINE_LIMIT) {
    failures++;
    console.error(`✗ ${rel}: average line length ${Math.round(avg)} exceeds ${AVG_LINE_LIMIT} — minified output is unmaintainable; rewrite it readable`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log(`✓ ${files.length} files passed syntax check`);
console.log("✓ readability guard passed (no minified modules; allowlist empty)");
