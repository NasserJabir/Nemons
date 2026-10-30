/**
 * Stage C — GT-01 fixture builder (no shell).
 *
 * Creates a real git repository containing a math module with one known bug,
 * so the Golden Task has something real to fix. Returns the fixture's commit
 * SHA.
 *
 * Why this is TypeScript and not scripts/stage-c/setup-fixture.sh: the tests
 * used to run `bash <script> <dir>`, and on Windows the path arrived mangled
 * (`C:\c\Nemons\...` → `C:cNemons...`), so three test files failed before
 * running a single assertion. `execFile` passes argv as an array, so no shell
 * ever parses a path, and the fixture definition lives in one place.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const PACKAGE_JSON = `{
  "name": "nem-gt-01-fixture",
  "version": "1.0.0",
  "description": "Nemons Golden Task 01 fixture — a controlled test scenario for Stage C.",
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
`;

const MATH_JS = `// A simple math module with an intentional bug.
// The \`add\` function incorrectly subtracts instead of adding.
// The Golden Task: fix the \`add\` function so the test passes.

export function add(a, b) {
  // BUG: should be \`a + b\`, not \`a - b\`
  return a - b;
}

export function multiply(a, b) {
  return a * b;
}

export function subtract(a, b) {
  return a - b;
}
`;

const MATH_TEST_JS = `import { test } from "node:test";
import assert from "node:assert/strict";
import { add, multiply, subtract } from "./math.js";

test("add(2, 3) returns 5", () => {
  assert.equal(add(2, 3), 5);
});

test("multiply(2, 3) returns 6", () => {
  assert.equal(multiply(2, 3), 6);
});

test("subtract(5, 3) returns 2", () => {
  assert.equal(subtract(5, 3), 2);
});
`;

const GITIGNORE = `node_modules/
dist/
*.log
`;

const COMMIT_MESSAGE = "Initial fixture: math module with a known bug in add() (GT-01)";

/** Build the fixture in `targetDir` (recreated) and return its commit SHA. */
export async function createFixture(targetDir: string): Promise<string> {
  const git = (args: string[]) =>
    run("git", args, { cwd: targetDir, windowsHide: true });

  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(path.join(targetDir, "src"), { recursive: true });

  await git(["init"]);
  await git(["config", "user.email", "nem@stage-c.fixture"]);
  await git(["config", "user.name", "Nemons Stage C Fixture"]);
  // A global gpgsign=true would make the fixture commit fail in CI.
  await git(["config", "commit.gpgsign", "false"]);

  await fs.writeFile(path.join(targetDir, "package.json"), PACKAGE_JSON);
  await fs.writeFile(path.join(targetDir, "src", "math.js"), MATH_JS);
  await fs.writeFile(path.join(targetDir, "src", "math.test.js"), MATH_TEST_JS);
  await fs.writeFile(path.join(targetDir, ".gitignore"), GITIGNORE);

  await git(["add", "-A"]);
  await git(["commit", "-m", COMMIT_MESSAGE]);

  const { stdout } = await run("git", ["rev-parse", "HEAD"], {
    cwd: targetDir,
    windowsHide: true,
  });
  return stdout.trim();
}
