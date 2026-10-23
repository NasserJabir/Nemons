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
import type { AdapterContract, AdapterCapabilities, AdapterInvocationResult } from "./adapter-contract.js";
import type { RunId } from "../core/identifiers.js";
/**
 * The capabilities advertised by the MockAdapter. These are intended
 * to satisfy the most common Skill capability requirements in tests.
 */
export declare const MOCK_ADAPTER_CAPABILITIES: ReadonlySet<string>;
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
export declare class MockAdapter implements AdapterContract {
    readonly kind: "mock";
    getCapabilities(): AdapterCapabilities;
    invoke(input: {
        readonly runId: RunId;
        readonly contextPack: import("../schemas/context-pack.js").ContextPack;
        readonly runInputs: import("../schemas/run.js").RunInputs;
    }): Promise<AdapterInvocationResult>;
}
//# sourceMappingURL=mock-adapter.d.ts.map