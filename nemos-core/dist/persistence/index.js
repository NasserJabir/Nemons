/**
 * Nemons Persistence — barrel export.
 *
 * Stage E: PersistentStore, FileSystemStore, PersistentExperienceStore.
 * Stage F: PersistentCandidateStore.
 * Stage G: PersistentRunStore, PersistentEvidenceStore, CrossReferenceChecker.
 * Stage I (research): EntitySummarizer (from CorpusMap research, ADR-0009).
 */
export * from "./persistence-contract.js";
export * from "./fs-json-store.js";
export * from "./persistent-experience-store.js";
export * from "./persistent-candidate-store.js";
export * from "./persistent-run-store.js";
export * from "./persistent-evidence-store.js";
export * from "./cross-reference-checker.js";
export * from "./entity-summarizer.js";
export * from "./build-persistent-runtime.js";
export * from "./build-full-persistent-runtime.js";
//# sourceMappingURL=index.js.map