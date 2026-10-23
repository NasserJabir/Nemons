/**
 * Nemons Adapter — Mock Adapter
 *
 * A MockAdapter that satisfies the AdapterContract for testing and
 * fixture-based validation. This is the ONLY adapter shipped with
 * the Core, and it is explicitly marked as NON-PRODUCTION.
 *
 * Architectural principle enforced here:
 *   - A successful local mock or fixture test is NOT evidence of
 *     real-harness compatibility. The mock adapter MUST NOT be
 *     registered as a real adapter in any production runtime.
 *
 * The mock adapter:
 *   - advertises a small, fixed capability set
 *   - returns deterministic outputs based on the Run inputs
 *   - emits synthetic adapter events for evidence-collection tests
 */
/**
 * The capabilities advertised by the MockAdapter. These are intended
 * to satisfy the most common Skill capability requirements in tests.
 */
export const MOCK_ADAPTER_CAPABILITIES = new Set([
    "tool.file.read",
    "tool.file.write",
    "tool.shell.exec",
    "tool.git.diff",
    "tool.git.commit",
    "event.trace.full",
]);
/**
 * The MockAdapter. NOT FOR PRODUCTION USE.
 *
 * The mock produces a deterministic `RunOutputs` based on the Run
 * inputs:
 *   - If `runInputs.taskDescription` starts with "FAIL:" → claimedOutcome=failed
 *   - Else → claimedOutcome=succeeded
 *
 * This lets tests exercise the full Run → Evidence → Evaluation
 * → Experience pipeline WITHOUT an external Coding Agent, while
 * preserving the architectural rule that a mock test is NOT proof of
 * real-harness compatibility.
 */
export class MockAdapter {
    kind = "mock";
    getCapabilities() {
        return {
            capabilities: MOCK_ADAPTER_CAPABILITIES,
            summary: "MockAdapter — fixture/testing only. NOT for production. Advertises the standard mock capability set.",
        };
    }
    async invoke(input) {
        const { runId, runInputs } = input;
        const failed = runInputs.taskDescription.startsWith("FAIL:");
        const startTimeMs = Date.now();
        const outputs = {
            claimedOutcome: failed ? "failed" : "succeeded",
            claimedSummary: failed
                ? "Mock adapter simulated a failure."
                : "Mock adapter simulated success.",
            artifactRefs: [`mock://runs/${runId}/artifacts/summary.txt`],
            traceRef: `mock://runs/${runId}/trace.jsonl`,
            // ADR-0011: simulated metrics for testing
            metrics: {
                latencyMs: Date.now() - startTimeMs,
                toolCallCount: 3, // simulated: 3 tool calls
                stepCount: 2, // simulated: 2 steps (start + end)
                harnessVersion: "mock-v1",
                // tokenCount and costUsd are simulated in real adapters only
            },
        };
        const events = [
            {
                kind: "invocation.start",
                at: new Date().toISOString(),
                payload: { runId, taskKind: runInputs.taskKind },
            },
            {
                kind: "invocation.end",
                at: new Date().toISOString(),
                payload: { runId, claimedOutcome: outputs.claimedOutcome },
            },
        ];
        return {
            runId,
            outputs,
            traceRef: outputs.traceRef,
            artifactRefs: outputs.artifactRefs,
            adapterEvents: events,
        };
    }
}
//# sourceMappingURL=mock-adapter.js.map