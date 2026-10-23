/**
 * Stage C — Conformance suite for the LocalExecutionAdapter.
 *
 * This is the canonical conformance suite (`describeAdapter`) applied
 * to the LocalExecutionAdapter. The adapter must pass the same
 * conformance checks as the MockAdapter (Stage 0), proving it
 * satisfies the AdapterContract.
 *
 * Additionally, the fixture is set up once (before all tests) and
 * the FIXTURE_SHA is captured and verified for stability.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { LocalExecutionAdapter } from "../../src/stage-c/local-execution-adapter.js";
import { describeAdapter } from "../conformance/adapter-conformance.test.js";

const execAsync = promisify(execCb);

let fixtureDir: string;
let fixtureSha: string;
let adapter: LocalExecutionAdapter;

beforeAll(async () => {
  // Create a unique temp directory for the fixture
  fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "nem-stage-c-conf-"));

  // Run the fixture setup script
  const scriptPath = path.join(process.cwd(), "scripts", "stage-c", "setup-fixture.sh");
  const { stdout } = await execAsync(`bash ${scriptPath} ${fixtureDir}`);
  // The script prints the FIXTURE_SHA as the last line of stdout
  const lines = stdout.trim().split("\n");
  fixtureSha = lines[lines.length - 1]!;

  adapter = new LocalExecutionAdapter({ workDir: fixtureDir });
});

afterAll(async () => {
  await fs.rm(fixtureDir, { recursive: true, force: true });
});

describe("Stage C — Fixture identity", () => {
  it("the fixture has a valid FIXTURE_SHA (40-char hex)", () => {
    expect(fixtureSha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("the FIXTURE_SHA is stable (re-reading gives the same SHA)", async () => {
    const reReadSha = await adapter.getFixtureSha();
    expect(reReadSha).toBe(fixtureSha);
  });

  it("the fixture contains the expected files", async () => {
    const files = await fs.readdir(fixtureDir);
    expect(files).toContain("package.json");
    expect(files).toContain("src");
    const srcFiles = await fs.readdir(path.join(fixtureDir, "src"));
    expect(srcFiles).toContain("math.js");
    expect(srcFiles).toContain("math.test.js");
  });

  it("the fixture's test fails BEFORE the fix (the known bug)", async () => {
    // Reset to ensure clean state
    await adapter.resetFixture();
    const result = await adapter.runTest();
    expect(result.exitCode).not.toBe(0); // the test fails due to the bug
  });
});

// Run the standard conformance suite for the LocalExecutionAdapter.
// This proves the adapter satisfies the AdapterContract — the same
// contract as the MockAdapter, but with real execution.
describeAdapter("LocalExecutionAdapter", () => new LocalExecutionAdapter({ workDir: fixtureDir }));
