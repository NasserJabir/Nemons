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
import { validateMemoryRecord } from "../schemas/memory.js";
import { asMemoryRecordId, freshId, } from "../core/identifiers.js";
import { ContractValidationError } from "../core/errors.js";
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
export function experienceToMemoryRecord(experience) {
    // Defensive: re-validate the source Experience at the boundary
    // (the source might come from an untrusted store)
    if (experience.provenance.kind === "deprecated") {
        throw new ContractValidationError("Cannot convert a deprecated Experience to a MemoryRecord. " +
            "Deprecated records MUST NOT be retrieved for inclusion in a Context Pack.", {
            details: {
                experienceId: experience.id,
                provenanceKind: experience.provenance.kind,
            },
        });
    }
    const nowIso = new Date().toISOString();
    const record = {
        id: asMemoryRecordId(freshId()),
        kind: "experience",
        // Preserve provenance (kind + source + review trail)
        provenance: experience.provenance,
        // Copy applicability (MemoryApplicability is a subset of
        // ExperienceApplicability, both have taskKinds/taskTags/repoPatterns)
        applicability: {
            taskKinds: experience.applicability.taskKinds,
            taskTags: experience.applicability.taskTags,
            repoPatterns: experience.applicability.repoPatterns,
            // MemoryApplicability.expiresAt is omitted — the MemoryRecord does
            // not expire independently of the source Experience.
        },
        derivedFromRunId: experience.runId,
        derivedFromExperienceId: experience.id,
        content: {
            summary: experience.summary,
            reusability: experience.reusability,
            reuseConditions: experience.reuseConditions ?? [],
            adapterKinds: experience.applicability.adapterKinds ?? [],
            learnedAt: experience.learnedAt,
        },
        createdAt: nowIso,
        updatedAt: nowIso,
    };
    validateMemoryRecord(record);
    return record;
}
/**
 * Batch conversion: converts a list of Experiences to MemoryRecords.
 *
 * Skips deprecated Experiences (they cannot be converted); includes
 * all others (observed, reviewed, approved). The caller is responsible
 * for filtering by inclusion/exclusion criteria before conversion.
 */
export function experiencesToMemoryRecords(experiences) {
    const records = [];
    for (const exp of experiences) {
        if (exp.provenance.kind === "deprecated") {
            // Skip silently — the caller already decided not to include
            // deprecated records (the retriever excludes them).
            continue;
        }
        records.push(experienceToMemoryRecord(exp));
    }
    return records;
}
/**
 * Predicate: is the MemoryRecord derived from an Experience?
 */
export function isExperienceMemoryRecord(m) {
    return m.kind === "experience" && m.derivedFromExperienceId !== undefined;
}
//# sourceMappingURL=experience-memory-bridge.js.map