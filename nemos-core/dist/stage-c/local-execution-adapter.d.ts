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
import type { AdapterContract, AdapterCapabilities, AdapterInvocationResult } from "../adapter/adapter-contract.js";
import type { ContextPack } from "../schemas/context-pack.js";
import type { RunInputs } from "../schemas/run.js";
import type { RunId } from "../core/identifiers.js";
/**
 * The capabilities advertised by the LocalExecutionAdapter.
 */
export declare const LOCAL_EXEC_CAPABILITIES: ReadonlySet<string>;
/**
 * Configuration for the LocalExecutionAdapter.
 */
export interface LocalExecutionAdapterOptions {
    /**
     * The working directory for the adapter. This is where the fixture
     * lives and where shell commands are executed.
     */
    readonly workDir: string;
    /**
     * The kind identifier for this adapter. Default: "local-exec".
     */
    readonly kind?: string;
}
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
export declare class LocalExecutionAdapter implements AdapterContract {
    private readonly options;
    readonly kind: string;
    constructor(options: LocalExecutionAdapterOptions);
    getCapabilities(): AdapterCapabilities;
    invoke(input: {
        readonly runId: RunId;
        readonly contextPack: ContextPack;
        readonly runInputs: RunInputs;
    }): Promise<AdapterInvocationResult>;
    /**
     * Returns the real test output from the last invocation.
     * (Used by tests to verify the Evidence is real.)
     */
    runTest(): Promise<{
        exitCode: number;
        stdout: string;
        stderr: string;
    }>;
    /**
     * Returns the real git diff.
     */
    getGitDiff(): Promise<string>;
    /**
     * Returns the real FIXTURE_SHA (git commit hash).
     */
    getFixtureSha(): Promise<string>;
    /**
     * Resets the fixture to its initial state (git checkout -- .).
     */
    resetFixture(): Promise<void>;
}
//# sourceMappingURL=local-execution-adapter.d.ts.map