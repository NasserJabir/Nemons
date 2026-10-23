/**
 * Nemons Experience — to Memory bridge.
 *
 * The Context Pack schema supports four assetKinds: persona, skill,
 * knowledge, memory. Experience records are NOT directly an assetKind.
 *
 * The architecturally aligned way to include an Experience in a Context
 * Pack is to materialize it as a MemoryRecord of kind "experience".
 * The MemoryRecord schema already has a `derivedFromExperienceId`
 * field for this purpose.
 *
 * Architectural principles enforced here:
 *   - "Retrieved is not approved": the bridge preserves the Experience's
 *     provenance kind. An observed Experience becomes an observed
 *     MemoryRecord; an approved Experience becomes an approved
 *     MemoryRecord. The bridge does NOT silently upgrade.
 *   - "No silent mutation": the bridge produces a NEW MemoryRecord;
 *     it does NOT modify the source Experience.
 *   - The MemoryRecord references the source Experience via
 *     `derivedFromExperienceId` (preserves traceability).
 */
import type { Experience } from "../schemas/experience.js";
import type { MemoryRecord } from "../schemas/memory.js";
/**
 * Converts an Experience to a MemoryRecord of kind "experience".
 *
 * The MemoryRecord:
 *   - id: fresh unique id (different from the source Experience id)
 *   - kind: "experience"
 *   - provenance: same kind + source as the source Experience (preserved)
 *   - applicability: copied from the source Experience's applicability
 *     (MemoryApplicability is a structural subset of ExperienceApplicability)
 *   - derivedFromRunId: copied from the source Experience's runId
 *   - derivedFromExperienceId: the source Experience's id
 *   - content: the Experience's summary as a structured payload
 *   - createdAt/updatedAt: ISO timestamp of the conversion
 *
 * The bridge does NOT mutate the source Experience.
 */
export declare function experienceToMemoryRecord(experience: Experience): MemoryRecord;
/**
 * Batch conversion: converts a list of Experiences to MemoryRecords.
 *
 * Skips deprecated Experiences (they cannot be converted); includes
 * all others (observed, reviewed, approved). The caller is responsible
 * for filtering by inclusion/exclusion criteria before conversion.
 */
export declare function experiencesToMemoryRecords(experiences: readonly Experience[]): readonly MemoryRecord[];
/**
 * Predicate: is the MemoryRecord derived from an Experience?
 */
export declare function isExperienceMemoryRecord(m: MemoryRecord): boolean;
//# sourceMappingURL=experience-memory-bridge.d.ts.map