/**
 * Stage C — Real Golden Task (GT-01)
 *
 * This is the REAL Golden Task: a controlled execution cycle against
 * the LocalExecutionAdapter, producing REAL Evidence (test output,
 * git diff). The full chain is validated with real artifacts:
 *
 *   Run A → LocalExecutionAdapter → real Evidence (test output)
 *   → verified Evaluation (verified_succeeded)
 *   → Experience derivation
 *
 * Architectural invariants verified:
 *   - The adapter produces REAL Evidence (not synthetic events).
 *   - The Evaluation is verified_succeeded (backed by real test output).
 *   - The FIXTURE_SHA is stable across runs.
 *   - The fix is deterministic (the test passes after the fix).
 *
 * Authorized by ADR-0006.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { LocalExecutionAdapter } from "../../src/stage-c/local-execution-adapter.js";
import { buildRuntime } from "../../src/runtime.js";
import {
  InMemoryPolicyRuleRegistry,
} from "../../src/policy/policy-contracts.js";
import { DefaultPolicyEngine } from "../../src/policy/policy-engine.js";
import { BUILTIN_POLICY_RULES } from "../../src/policy/builtin-rules.js";
import type { PolicyRule } from "../../src/policy/policy-contracts.js";
import { InMemoryRunManager } from "../../src/run/run-manager.js";
import {
  asContextPackId,
  asRunId,
} from "../../src/core/identifiers.js";
import type { RunInputs } from "../../src/schemas/run.js";

const execAsync = promisify(execCb);

const allowAllRule: PolicyRule = {
  ruleId: "test.stage-c.allow-all",
  description: "Allow all run operations (Stage C test only)",
  appliesTo: ["run.start", "run.transition_state", "run.record_evidence"],
  evaluate: () => ({
    ruleId: "test.stage-c.allow-all",
    ruleDescription: "Allow all run operations",
    outcome: "allow" as const,
    reason: "stage-c test",
  }),
};

let fixtureDir: string;
let fixtureSha: string;
let adapter: LocalExecutionAdapter;

beforeAll(async () => {
  fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "nem-stage-c-gt-"));
  const scriptPath = path.join(process.cwd(), "scripts", "stage-c", "setup-fixture.sh");
  const { stdout } = await execAsync(`bash ${scriptPath} ${fixtureDir}`);
  const lines = stdout.trim().split("\n");
  fixtureSha = lines[lines.length - 1]!;
  adapter = new LocalExecutionAdapter({ workDir: fixtureDir });
});

afterAll(async () => {
  await fs.rm(fixtureDir, { recursive: true, force: true });
});

describe("Stage C — Real Golden Task (GT-01)", () => {
  it("exercises the full chain with REAL Evidence (test output + git diff)", async () => {
    // ─── Setup: the wired runtime ───
    const registry = new InMemoryPolicyRuleRegistry();
    for (const rule of BUILTIN_POLICY_RULES) registry.register(rule);
    registry.register(allowAllRule);
    const engine = new DefaultPolicyEngine(registry);
    const runManager = new InMemoryRunManager(engine);
    const runtime = buildRuntime({ registerMockAdapter: false });

    // ─── Verify the fixture is in the broken state ───
    await adapter.resetFixture();
    const preTest = await adapter.runTest();
    expect(preTest.exitCode).not.toBe(0); // the test fails before the fix

    // ─── Run A: invoke the LocalExecutionAdapter ───
    const runInputs: RunInputs = {
      taskDescription: "Fix the failing test in src/math.js (the add() function subtracts instead of adding).",
      taskKind: "test-fix",
      taskTags: ["vitest", "node-test"],
      repoInstance: {
        repoIdentity: {
          repo: `file://${fixtureDir}`,
          sha: fixtureSha,
        },
        instanceId: "gt-01-inst-1",
      },
    };

    const run = runManager.createRun({
      runInputs,
      contextPackId: asContextPackId("cp-gt-01"),
      provenance: {
        kind: "observed",
        source: {
          kind: "human",
          actor: "stage-c-tester",
          at: new Date().toISOString(),
        },
      },
    });
    runManager.startRun(run.id);

    // ─── Invoke the REAL adapter ───
    const contextPack = {
      id: asContextPackId("cp-gt-01"),
      runId: run.id,
      assets: [],
      exclusions: [],
      constraints: { maxAssets: 10, maxContentBytes: 100_000 },
      actualBytes: 0,
      createdAt: new Date().toISOString(),
    };

    const invocation = await adapter.invoke({
      runId: run.id,
      contextPack,
      runInputs,
    });

    // CRITICAL: the claimed outcome should be "succeeded" (the fix worked)
    expect(invocation.outputs.claimedOutcome).toBe("succeeded");

    // Record the outputs
    runManager.recordOutputs(run.id, invocation.outputs);

    // ─── Collect REAL Evidence from the adapter invocation ───
    const collectedEvidence = runtime.evidenceCollector.fromAdapterInvocation(
      run.id,
      invocation,
    );
    expect(collectedEvidence.length).toBeGreaterThan(0);

    // Verify each Evidence record has REAL content (not synthetic)
    for (const e of collectedEvidence) {
      expect(e.artifact.inlinePayload).toBeDefined();
      expect(e.artifact.contentHash).toBeDefined();
      expect(e.artifact.inlinePayload!.length).toBeGreaterThan(0);
    }

    // Verify each Evidence's content hash
    const verifiedEvidence = collectedEvidence.map((e) =>
      runtime.evidenceValidator.verify(e),
    );
    for (const e of verifiedEvidence) {
      expect(e.verified).toBe(true);
      runManager.recordEvidence(run.id, e.id);
    }

    // ─── Add an explicit verification_report Evidence from the REAL test output ───
    // Re-run the test after the fix to capture the real passing output
    const postTest = await adapter.runTest();
    expect(postTest.exitCode).toBe(0); // the test now passes

    const verificationEvidence = runtime.evidenceCollector.fromVerificationResult(
      run.id,
      {
        kind: "verification_report",
        claim: "All tests pass after the fix (add() now returns a + b).",
        payload: JSON.stringify({
          exitCode: postTest.exitCode,
          stdout: postTest.stdout,
          stderr: postTest.stderr,
          fixtureSha,
          testCount: 3,
          passingCount: 3,
          failingCount: 0,
        }),
      },
    );
    const verifiedVerification = runtime.evidenceValidator.verify(verificationEvidence);
    expect(verifiedVerification.verified).toBe(true);
    runManager.recordEvidence(run.id, verifiedVerification.id);

    // ─── Evaluate the Run ───
    const evaluation = runtime.evaluationEngine.evaluate({
      run: runManager.getRun(run.id)!,
      criteria: [
        {
          id: "tests-pass",
          description: "All targeted tests pass after the fix.",
          requiredEvidenceKinds: ["verification_report"],
          required: true,
        },
      ],
      evidence: [...verifiedEvidence, verifiedVerification],
      evaluator: "stage-c-gt-01-evaluator",
    });

    // CRITICAL: the evaluation is verified_succeeded (backed by REAL test output)
    expect(evaluation.overallResult).toBe("verified_succeeded");

    // Record the evaluation + mark succeeded
    runManager.recordEvaluation(run.id, evaluation.id);
    const succeeded = runManager.markSucceeded(run.id);
    expect(succeeded.state).toBe("succeeded");
    expect(succeeded.evidenceRefs?.length).toBeGreaterThan(0);
    expect(succeeded.evaluationRef).toBe(evaluation.id);

    // ─── Derive an Experience from the verified Run ───
    const experience = runtime.experienceDeriver.derive({
      run: runManager.getRun(run.id)!,
      evaluation,
      evidence: [...verifiedEvidence, verifiedVerification],
      summary:
        "When the add() function subtracts instead of adding, change `a - b` to `a + b`. " +
        "Always run the test suite after the fix to verify.",
    });
    expect(experience.provenance.kind).toBe("observed");

    // ─── Verify the FIXTURE_SHA is stable ───
    const finalSha = await adapter.getFixtureSha();
    expect(finalSha).toBe(fixtureSha);
  });

  it("the FIXTURE_SHA is stable across multiple Golden Task runs", async () => {
    // Reset the fixture
    await adapter.resetFixture();

    // Read the SHA before
    const shaBefore = await adapter.getFixtureSha();

    // Run the adapter (which modifies the working tree but doesn't commit)
    await adapter.invoke({
      runId: asRunId("r-stability-test"),
      contextPack: {
        id: asContextPackId("cp-stability"),
        runId: asRunId("r-stability-test"),
        assets: [],
        exclusions: [],
        constraints: { maxAssets: 10, maxContentBytes: 100_000 },
        actualBytes: 0,
        createdAt: new Date().toISOString(),
      },
      runInputs: {
        taskDescription: "Fix the failing test.",
        taskKind: "test-fix",
        repoInstance: {
          repoIdentity: { repo: `file://${fixtureDir}`, sha: fixtureSha },
          instanceId: "stability-inst",
        },
      },
    });

    // Reset again
    await adapter.resetFixture();

    // Read the SHA after — it should be the same (the adapter didn't commit)
    const shaAfter = await adapter.getFixtureSha();
    expect(shaAfter).toBe(shaBefore);
    expect(shaAfter).toBe(fixtureSha);
  });

  it("the REAL git diff shows the fix (a - b → a + b)", async () => {
    // Reset to clean state
    await adapter.resetFixture();

    // Invoke the adapter (applies the fix)
    await adapter.invoke({
      runId: asRunId("r-diff-test"),
      contextPack: {
        id: asContextPackId("cp-diff"),
        runId: asRunId("r-diff-test"),
        assets: [],
        exclusions: [],
        constraints: { maxAssets: 10, maxContentBytes: 100_000 },
        actualBytes: 0,
        createdAt: new Date().toISOString(),
      },
      runInputs: {
        taskDescription: "Fix the failing test.",
        taskKind: "test-fix",
        repoInstance: {
          repoIdentity: { repo: `file://${fixtureDir}`, sha: fixtureSha },
          instanceId: "diff-inst",
        },
      },
    });

    // Get the real git diff
    const diff = await adapter.getGitDiff();
    expect(diff).toContain("a + b"); // the fix
    expect(diff).toContain("a - b"); // the old (buggy) version

    // Reset for cleanup
    await adapter.resetFixture();
  });
});
