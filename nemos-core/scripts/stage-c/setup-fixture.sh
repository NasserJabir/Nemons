#!/bin/bash
# Stage C — Golden Task Fixture Setup
#
# Creates a real git repository with a known failing test.
# The repository is the "fixture" for GT-01 (Golden Task 1).
#
# The fixture:
#   - Is a real git repository (git init + git commit)
#   - Has a pinned FIXTURE_SHA (the commit hash)
#   - Contains a simple test suite with one failing test
#   - The Golden Task: "fix the failing test"
#
# Usage:
#   ./scripts/stage-c/setup-fixture.sh <target-dir>
#
# Output:
#   - <target-dir>/.git/ (a real git repository)
#   - <target-dir>/package.json
#   - <target-dir>/src/math.js (a math module with a bug)
#   - <target-dir>/src/math.test.js (a test that fails due to the bug)
#   - FIXTURE_SHA is printed to stdout

set -euo pipefail

TARGET_DIR="${1:-/tmp/nemons-gt-01-fixture}"

# Clean and create the target directory
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

# Initialize a real git repository
git init
git config user.email "nem@stage-c.fixture"
git config user.name "Nemons Stage C Fixture"
git config commit.gpgsign false

# Create package.json
cat > package.json << 'PKGJSON'
{
  "name": "nem-gt-01-fixture",
  "version": "1.0.0",
  "description": "Nemons Golden Task 01 fixture — a controlled test scenario for Stage C.",
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
PKGJSON

# Create the math module with a BUG (the fixture's known failing test)
mkdir -p src
cat > src/math.js << 'MATH'
// A simple math module with an intentional bug.
// The `add` function incorrectly subtracts instead of adding.
// The Golden Task: fix the `add` function so the test passes.

export function add(a, b) {
  // BUG: should be `a + b`, not `a - b`
  return a - b;
}

export function multiply(a, b) {
  return a * b;
}

export function subtract(a, b) {
  return a - b;
}
MATH

# Create the test that will FAIL (due to the bug in add())
cat > src/math.test.js << 'TEST'
import { test } from "node:test";
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
TEST

# Create a .gitignore
cat > .gitignore << 'GITIGNORE'
node_modules/
dist/
*.log
GITIGNORE

# Commit the fixture (this creates the FIXTURE_SHA)
git add -A
git commit -m "Initial fixture: math module with a known bug in add() (GT-01)"

# Get the FIXTURE_SHA (the real git commit hash)
FIXTURE_SHA=$(git rev-parse HEAD)

# Print the FIXTURE_SHA to stdout (the caller captures it)
echo "$FIXTURE_SHA"
