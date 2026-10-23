import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { FileSystemStore } from "../src/persistence/fs-json-store.js";
import { PersistentRunStore, runValidator } from "../src/persistence/persistent-run-store.js";
import type { Run } from "../src/schemas/run.js";
import { asRunId, asContextPackId } from "../src/core/identifiers.js";

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nem-debug-"));
try {
  const backend = new FileSystemStore<Run & { id: string }>({
    rootDir: dir,
    validator: runValidator as unknown as (r: unknown) => asserts r is Run & { id: string },
  });
  const store = new PersistentRunStore(backend);
  await store.initialize();

  const run: Run = {
    id: asRunId("r-tamper"),
    state: "pending",
    inputs: {
      taskDescription: "Fix the failing test",
      taskKind: "test-fix",
      repoInstance: {
        repoIdentity: { repo: "https://example.com/repo.git", sha: "abc123" },
        instanceId: "inst-1",
      },
    },
    contextPackId: asContextPackId("cp-1"),
    provenance: {
      kind: "observed",
      source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
    },
  };

  await store.add(run);

  // Read the file and show what's in it
  const recordPath = path.join(dir, "records", "r-tamper.json");
  const raw = await fs.readFile(recordPath, "utf8");
  console.log("Original file content:");
  console.log(raw.substring(0, 500) + "...");

  const envelope = JSON.parse(raw);
  console.log("\nOriginal record.inputs.taskDescription:", envelope.record.inputs.taskDescription);
  console.log("Original contentHash:", envelope.contentHash);

  // Tamper
  envelope.record.inputs.taskDescription = "TAMPERED";
  await fs.writeFile(recordPath, JSON.stringify(envelope, null, 2), "utf8");

  // Read the tampered file
  const tamperedRaw = await fs.readFile(recordPath, "utf8");
  const tamperedEnvelope = JSON.parse(tamperedRaw);
  console.log("\nTampered record.inputs.taskDescription:", tamperedEnvelope.record.inputs.taskDescription);
  console.log("Stored contentHash (still original):", tamperedEnvelope.contentHash);

  // Recompute hash the same way FileSystemStore does
  const canonical = JSON.stringify(
    tamperedEnvelope.record,
    Object.keys(tamperedEnvelope.record).sort(),
  );
  console.log("\nCanonical (tampered):", canonical.substring(0, 300));
  const recomputed = crypto.createHash("sha256").update(canonical).digest("hex");
  console.log("Recomputed hash:", recomputed);
  console.log("Hash match?", recomputed === tamperedEnvelope.contentHash);

  // Also compute the canonical for the ORIGINAL (un-tampered) record
  const originalRecord = JSON.parse(raw).record;
  const canonicalOriginal = JSON.stringify(
    originalRecord,
    Object.keys(originalRecord).sort(),
  );
  console.log("\nCanonical (original):", canonicalOriginal.substring(0, 300));
  const hashOriginal = crypto.createHash("sha256").update(canonicalOriginal).digest("hex");
  console.log("Hash (original):", hashOriginal);

  // Now try to get
  const status = await store.getWithStatus(run.id);
  console.log("\ngetWithStatus result:", status);
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
