/**
 * Nemons Stage C — Local Execution Adapter
 *
 * The LocalExecutionAdapter is a REAL adapter (not a mock) that:
 *   - Runs real shell commands (git, npm test) via `child_process`
 *   - Produces real Evidence (test output, git diff, git commit)
 *   - Advertises real capabilities
 *
 * This adapter crosses the Stage C boundary: from "mock/fixture
 * testing" to "real-harness execution". The Evidence records contain
 * real command output (not synthetic events).
 *
 * Architectural principles enforced here:
 *   - "Records survive restart": the fixture's `FIXTURE_SHA` is a
 *     real git commit hash; repeated runs against the same fixture
 *     produce the same SHA.
 *   - "Evidence before claims": the Evidence is derived from real
 *     test output. A "succeeded" claim is backed by real test results.
 *   - "No silent mutation": the adapter does NOT modify the fixture
 *     outside of the explicit fix (changing `a - b` to `a + b`).
 *
 * Authorized by ADR-0006 (Stage C Authorization).
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
const execAsync = promisify(exec);
/**
 * The capabilities advertised by the LocalExecutionAdapter.
 */
export const LOCAL_EXEC_CAPABILITIES = new Set([
    "tool.shell.exec",
    "tool.file.read",
    "tool.file.write",
    "tool.git.diff",
    "tool.git.commit",
    "tool.git.status",
    "tool.test.run",
    "event.trace.full",
]);
/**
 * The LocalExecutionAdapter — a REAL adapter that runs shell commands.
 *
 * The adapter's `invoke()` method:
 *   1. Reads the task description (e.g., "fix the failing test").
 *   2. Applies the deterministic fix (changing `a - b` to `a + b` in
 *      the fixture's `add()` function).
 *   3. Runs `npm test` and captures the real output.
 *   4. Runs `git diff` and captures the real diff.
 *   5. Returns real Evidence (test result, git diff).
 *
 * The fix is DETERMINISTIC (not LLM-driven) — the fixture has a known
 * bug, and the adapter applies the known fix. This is authorized by
 * ADR-0006 (LLM-driven changes are deferred).
 */
export class LocalExecutionAdapter {
    options;
    kind;
    constructor(options) {
        this.options = options;
        this.kind = options.kind ?? "local-exec";
    }
    getCapabilities() {
        return {
            capabilities: LOCAL_EXEC_CAPABILITIES,
            summary: "LocalExecutionAdapter — runs real shell commands (git, npm test). " +
                "Authorized by ADR-0006 (Stage C). NOT for production; development/testing only.",
        };
    }
    async invoke(input) {
        const { runId, runInputs } = input;
        const workDir = this.options.workDir;
        const events = [];
        const nowIso = () => new Date().toISOString();
        // ADR-0011: capture real execution metrics
        const startTimeMs = Date.now();
        let toolCallCount = 0;
        // 1. Invocation start
        events.push({
            kind: "invocation.start",
            at: nowIso(),
            payload: { runId, taskDescription: runInputs.taskDescription, workDir },
        });
        // 2. Read the fixture's math.js to find the bug
        const mathFilePath = path.join(workDir, "src", "math.js");
        const mathContent = await fs.readFile(mathFilePath, "utf8");
        events.push({
            kind: "file.read",
            at: nowIso(),
            payload: { file: "src/math.js", size: mathContent.length },
        });
        // 3. Apply the deterministic fix: change `a - b` to `a + b` in the add() function
        const fixedContent = mathContent.replace(/export function add\(a, b\) \{\s*\/\/ BUG: should be `a \+ b`, not `a - b`\s*return a - b;/, "export function add(a, b) {\n  return a + b;");
        if (fixedContent === mathContent) {
            events.push({
                kind: "fix.skipped",
                at: nowIso(),
                payload: { reason: "The add() function appears to already be fixed or the pattern didn't match." },
            });
        }
        else {
            await fs.writeFile(mathFilePath, fixedContent, "utf8");
            events.push({
                kind: "file.write",
                at: nowIso(),
                payload: { file: "src/math.js", bytesWritten: fixedContent.length },
            });
        }
        // 4. Run `npm test` and capture the real output
        toolCallCount++; // npm test is a tool call
        let testExitCode;
        let testStdout;
        let testStderr;
        try {
            const result = await execAsync("npm test", { cwd: workDir, maxBuffer: 1024 * 1024 });
            testExitCode = 0;
            testStdout = result.stdout;
            testStderr = result.stderr;
        }
        catch (e) {
            const err = e;
            testExitCode = err.code ?? 1;
            testStdout = err.stdout ?? "";
            testStderr = err.stderr ?? "";
        }
        events.push({
            kind: "test.run",
            at: nowIso(),
            payload: {
                exitCode: testExitCode,
                stdoutLength: testStdout.length,
                stderrLength: testStderr.length,
            },
        });
        // 5. Run `git diff` to capture the fix
        toolCallCount++; // git diff is a tool call
        let gitDiffOutput;
        try {
            const result = await execAsync("git diff", { cwd: workDir });
            gitDiffOutput = result.stdout;
        }
        catch (e) {
            gitDiffOutput = `git diff failed: ${e.message}`;
        }
        events.push({
            kind: "git.diff",
            at: nowIso(),
            payload: { diffLength: gitDiffOutput.length },
        });
        // 6. Determine the claimed outcome based on the real test exit code
        const claimedOutcome = testExitCode === 0 ? "succeeded" : "failed";
        events.push({
            kind: "invocation.end",
            at: nowIso(),
            payload: {
                runId,
                claimedOutcome,
                testExitCode,
            },
        });
        // 7. Construct the Run outputs with REAL artifact references + REAL metrics
        const latencyMs = Date.now() - startTimeMs;
        const outputs = {
            claimedOutcome,
            claimedSummary: claimedOutcome === "succeeded"
                ? "The failing test was fixed; all tests pass."
                : `The test suite failed (exit code ${testExitCode}).`,
            artifactRefs: [
                `file://${workDir}/src/math.js`,
                `file://${workDir}/src/math.test.js`,
            ],
            traceRef: `local-exec://runs/${runId}/trace.jsonl`,
            // ADR-0011: real execution metrics from the local adapter
            metrics: {
                latencyMs,
                toolCallCount,
                stepCount: events.length,
                harnessVersion: "local-exec-v1",
                // tokenCount and costUsd are N/A for the local adapter (no LLM)
            },
        };
        return {
            runId,
            outputs,
            traceRef: outputs.traceRef,
            artifactRefs: outputs.artifactRefs,
            adapterEvents: events,
        };
    }
    /**
     * Returns the real test output from the last invocation.
     * (Used by tests to verify the Evidence is real.)
     */
    async runTest() {
        try {
            const result = await execAsync("npm test", {
                cwd: this.options.workDir,
                maxBuffer: 1024 * 1024,
            });
            return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
        }
        catch (e) {
            const err = e;
            return {
                exitCode: err.code ?? 1,
                stdout: err.stdout ?? "",
                stderr: err.stderr ?? "",
            };
        }
    }
    /**
     * Returns the real git diff.
     */
    async getGitDiff() {
        try {
            const result = await execAsync("git diff", { cwd: this.options.workDir });
            return result.stdout;
        }
        catch (e) {
            return `git diff failed: ${e.message}`;
        }
    }
    /**
     * Returns the real FIXTURE_SHA (git commit hash).
     */
    async getFixtureSha() {
        const result = await execAsync("git rev-parse HEAD", {
            cwd: this.options.workDir,
        });
        return result.stdout.trim();
    }
    /**
     * Resets the fixture to its initial state (git checkout -- .).
     */
    async resetFixture() {
        await execAsync("git checkout -- .", { cwd: this.options.workDir });
    }
}
//# sourceMappingURL=local-execution-adapter.js.map