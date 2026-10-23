import { describe, it, expect, beforeEach } from "vitest";
import { DefaultEvidenceCollector } from "../../src/evidence/evidence-collector.js";
import { DefaultEvidenceValidator } from "../../src/evidence/evidence-validator.js";
import type { Evidence } from "../../src/schemas/evidence.js";
import type { RunOutputs } from "../../src/schemas/run.js";
import { asRunId, sha256Hex } from "../../src/core/identifiers.js";
import { isContractValidationError } from "../../src/core/errors.js";
import type { AdapterInvocationResult } from "../../src/adapter/adapter-contract.js";

describe("evidence-collector", () => {
  let collector: DefaultEvidenceCollector;

  beforeEach(() => {
    collector = new DefaultEvidenceCollector();
  });

  describe("fromRunOutputs", () => {
    it("produces a text_assertion evidence with the run's claimed outcome", () => {
      const outputs: RunOutputs = { claimedOutcome: "succeeded", claimedSummary: "Tests passed" };
      const e = collector.fromRunOutputs(asRunId("r-1"), outputs);
      expect(e.kind).toBe("text_assertion");
      expect(e.claim).toContain("succeeded");
      expect(e.runId).toBe(asRunId("r-1"));
      expect(e.verified).toBe(false);
      expect(e.provenance.kind).toBe("observed");
      expect(e.provenance.source.kind).toBe("run");
    });

    it("computes content hash matching sha256", () => {
      const outputs: RunOutputs = { claimedOutcome: "succeeded" };
      const e = collector.fromRunOutputs(asRunId("r-1"), outputs);
      expect(e.artifact.contentHash).toBe(sha256Hex(e.artifact.inlinePayload!));
    });
  });

  describe("fromAdapterEvent", () => {
    it("produces an adapter_event evidence", () => {
      const e = collector.fromAdapterEvent(asRunId("r-1"), {
        kind: "invocation.start",
        at: "2024-01-01T00:00:00Z",
        payload: { foo: "bar" },
      });
      expect(e.kind).toBe("adapter_event");
      expect(e.claim).toContain("invocation.start");
      expect(e.verified).toBe(false);
    });
  });

  describe("fromVerificationResult", () => {
    it("produces a verification_report evidence", () => {
      const e = collector.fromVerificationResult(asRunId("r-1"), {
        kind: "verification_report",
        claim: "tests pass",
        payload: '{"passed":true}',
      });
      expect(e.kind).toBe("verification_report");
      expect(e.claim).toBe("tests pass");
    });

    it("produces an acceptance_result evidence", () => {
      const e = collector.fromVerificationResult(asRunId("r-1"), {
        kind: "acceptance_result",
        claim: "acceptance met",
        payload: "{}",
      });
      expect(e.kind).toBe("acceptance_result");
    });
  });

  describe("fromAdapterInvocation", () => {
    it("produces multiple evidence records: 1 per event + 1 for outputs", () => {
      const result: AdapterInvocationResult = {
        runId: asRunId("r-1"),
        outputs: { claimedOutcome: "succeeded", claimedSummary: "OK" },
        traceRef: "mock://trace",
        artifactRefs: ["mock://art"],
        adapterEvents: [
          { kind: "start", at: "2024-01-01T00:00:00Z", payload: { x: 1 } },
          { kind: "end", at: "2024-01-01T00:00:01Z", payload: { y: 2 } },
        ],
      };
      const list = collector.fromAdapterInvocation(asRunId("r-1"), result);
      // 1 (outputs) + 2 (events) = 3 evidence records
      expect(list).toHaveLength(3);
      expect(list[0]?.kind).toBe("text_assertion");
      expect(list[1]?.kind).toBe("adapter_event");
      expect(list[2]?.kind).toBe("adapter_event");
    });
  });
});

describe("evidence-validator", () => {
  let validator: DefaultEvidenceValidator;
  let collector: DefaultEvidenceCollector;

  beforeEach(() => {
    validator = new DefaultEvidenceValidator();
    collector = new DefaultEvidenceCollector();
  });

  it("marks inline-payload Evidence as verified=true when hash matches", () => {
    const e: Evidence = collector.fromRunOutputs(asRunId("r-1"), {
      claimedOutcome: "succeeded",
    });
    const verified = validator.verify(e);
    expect(verified.verified).toBe(true);
  });

  it("THROWS on integrity violation (hash mismatch)", () => {
    const e: Evidence = collector.fromRunOutputs(asRunId("r-1"), {
      claimedOutcome: "succeeded",
    });
    const tampered: Evidence = {
      ...e,
      artifact: { ...e.artifact, contentHash: "tampered-hash" },
    };
    expect(() => validator.verify(tampered)).toThrow();
    try {
      validator.verify(tampered);
    } catch (err) {
      expect(isContractValidationError(err)).toBe(true);
    }
  });

  it("returns URI-backed Evidence unchanged (external verification required)", () => {
    const e: Evidence = {
      id: "ev-uri" as never,
      runId: asRunId("r-1"),
      kind: "test_result",
      claim: "tests pass",
      artifact: { uri: "file://tests.xml", contentHash: "x" },
      provenance: {
        kind: "observed",
        source: { kind: "run", runId: asRunId("r-1"), at: "x" },
      },
      recordedAt: "x",
      verified: false,
    };
    const result = validator.verify(e);
    expect(result.verified).toBe(false);
  });
});
