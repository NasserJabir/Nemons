/**
 * Stage F — review-decision DURABILITY tests.
 *
 * Background: the governed engine used to track recorded review
 * decisions in an in-memory Map, and an approval whose rules were not
 * yet satisfied was built but never stored (a dead write). Both flaws
 * meant approval state could silently vanish on restart — contradicting
 * the project invariant that governance records survive the process.
 *
 * Now decisions live IN the persisted review trail (`provenance.
 * reviewTrail` entries carrying a `decision` field). These tests prove
 * the three links of that chain:
 *
 *   D1: a denied approval is PERSISTED in the store (dead write fixed).
 *   D2: a fresh engine over a store holding a persisted approval
 *       derives it from the trail and completes the approval — the
 *       restart-equivalence proof.
 *   D3: PersistentCandidateStore.appendReviewTrail writes to disk and
 *       the entry survives a backend reload from the same directory.
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DefaultGovernedEvolutionEngine,
} from "../../src/governed-evolution/governed-evolution-engine.js";
import type { GovernedRules } from "../../src/governed-evolution/governed-evolution-engine.js";
import { InMemoryCandidateStore } from "../../src/governed-evolution/candidate-store.js";
import { FileSystemStore } from "../../src/persistence/fs-json-store.js";
import { PersistentCandidateStore } from "../../src/persistence/persistent-candidate-store.js";
import {
  validateCandidateRecord,
} from "../../src/schemas/candidate.js";
import type { CandidateRecord } from "../../src/schemas/candidate.js";

const TWO_REVIEWERS: GovernedRules = {
  minimumReviewers: 2,
  requireSeparationOfDuties: true,
};

function seedUnderReviewCandidate(
  store: InMemoryCandidateStore,
  engine: DefaultGovernedEvolutionEngine,
) {
  const candidate = engine.propose({
    assetKind: "skill",
    assetId: "skill-durability",
    proposedVersion: "1.0.0",
    changeKind: "create",
    content: { name: "run-tests" },
    proposedBy: "alice",
    rationale: "Initial creation",
    evidenceRefs: ["ev-1"],
  });
  engine.requestReview(candidate.id, "alice", "please review");
  return candidate.id;
}

describe("Stage F — review decision durability (D1–D3)", () => {
  it("D1: a denied approval is persisted in the STORE's review trail (dead write fixed)", () => {
    const store = new InMemoryCandidateStore();
    const engine = new DefaultGovernedEvolutionEngine(store, TWO_REVIEWERS);
    const id = seedUnderReviewCandidate(store, engine);

    // First approval — denied (needs 2 reviewers)
    const result = engine.recordReview(id, {
      reviewer: "bob",
      decision: "approve",
      comment: "looks good",
      at: new Date().toISOString(),
    });
    expect(result.approvalResult?.kind).toBe("denied");

    // The DECISIVE assertion: the STORE (not just the returned record)
    // now carries the structured decision on its trail.
    const stored = store.get(id)!;
    const decisions = (stored.provenance.reviewTrail ?? []).filter(
      (e) => e.decision !== undefined,
    );
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      actor: "bob",
      decision: "approve",
      comment: "looks good",
    });
  });

  it("D2: a fresh engine derives the persisted approval from the trail (restart equivalence)", () => {
    const store = new InMemoryCandidateStore();
    const engine = new DefaultGovernedEvolutionEngine(store, TWO_REVIEWERS);
    const id = seedUnderReviewCandidate(store, engine);

    // First approval — denied, but PERSISTED (D1).
    engine.recordReview(id, {
      reviewer: "bob",
      decision: "approve",
      comment: "looks good",
      at: new Date().toISOString(),
    });

    // "Restart": brand-new engine over a brand-new store holding the
    // records as persisted (deep-cloned through JSON like a real
    // store reload would produce).
    const persisted = JSON.parse(JSON.stringify(store.get(id))) as CandidateRecord;
    validateCandidateRecord(persisted);
    const reloadedStore = new InMemoryCandidateStore();
    (reloadedStore as unknown as {
      records: Map<string, CandidateRecord>;
      insertionOrder: string[];
    }).records.set(persisted.id, persisted);
    (reloadedStore as unknown as { insertionOrder: string[] }).insertionOrder.push(persisted.id);

    const restartedEngine = new DefaultGovernedEvolutionEngine(
      reloadedStore,
      TWO_REVIEWERS,
    );

    // Second approval survives the restart — the first one counted.
    const result = restartedEngine.recordReview(id, {
      reviewer: "carol",
      decision: "approve",
      comment: "second reviewer",
      at: new Date().toISOString(),
    });
    expect(result.approvalResult?.kind).toBe("approved");
    expect(reloadedStore.get(id)?.status).toBe("approved");
  });

  it("D3: PersistentCandidateStore.appendReviewTrail survives a backend reload", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nemons-durability-"));
    try {
      const makeBackend = () =>
        new FileSystemStore<CandidateRecord & { id: string }>({
          rootDir: join(dir, "candidates"),
          validator: validateCandidateRecord as unknown as (
            c: unknown,
          ) => asserts c is CandidateRecord & { id: string },
          healthCheckOnStartup: false,
        });

      const backend1 = makeBackend();
      const persistent1 = new PersistentCandidateStore(backend1);
      await persistent1.initialize();

      const record: CandidateRecord = {
        id: "cand-durability-1" as CandidateRecord["id"],
        assetKind: "skill",
        assetId: "skill-durability",
        proposedVersion: "1.0.0",
        changeKind: "create",
        content: { name: "run-tests" },
        provenance: {
          kind: "proposed",
          origin: "generated",
          createdAt: new Date().toISOString(),
          reviewTrail: [],
        },
        status: "proposed",
        proposedBy: "alice",
        proposedAt: new Date().toISOString(),
        rationale: "durability probe",
        reviewTrail: [],
      };
      await persistent1.add(record);
      await persistent1.transition(record.id, "under_review", {
        at: new Date().toISOString(),
        actor: "alice",
        reason: "please review",
      });

      const updated = await persistent1.appendReviewTrail(record.id, {
        at: new Date().toISOString(),
        actor: "bob",
        reason: "Approval recorded but rules not yet satisfied",
        decision: "approve",
        comment: "looks good",
      });
      expect(updated.status).toBe("under_review");
      expect((updated.provenance.reviewTrail ?? []).filter((e) => e.decision !== undefined)).toHaveLength(1);

      // "Restart": new backend over the SAME directory.
      const persistent2 = new PersistentCandidateStore(makeBackend());
      await persistent2.initialize();
      const reloaded = await persistent2.get(record.id);
      expect(reloaded).toBeDefined();
      const decisions = (reloaded!.provenance.reviewTrail ?? []).filter(
        (e) => e.decision !== undefined,
      );
      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toMatchObject({ actor: "bob", decision: "approve" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
