// ============================================================
// Approval → Adoption promotion
//
// Invariant #4 (Use != Adopt) is only satisfied if an approved candidate
// reaches the store that actually serves packs. Two candidate stores
// exist in the daemon — the v4.0 lifecycle store (`/candidate/*`) and the
// @nemons/core governed store (`/core/governed/*`) — and both used to
// report "adopted"/"approved" while nothing downstream could retrieve the
// asset. This module is the one place that knows, per asset kind, which
// store consumes it. Personas and knowledge had no destination at all
// before it existed, so approving them changed a status and nothing else.
// ============================================================

const { destinationFor, refusalFor, PROMOTABLE_KINDS } = require("../utils/asset-kinds");

// Both stores describe a candidate, with different spellings:
//   lifecycle: { id, type, asset }                  type ∈ skill|persona|...
//   governed:  { id, assetKind, assetId, content }
// Normalise to the three things promotion needs.
function readCandidate(candidate = {}) {
  return {
    id: candidate.id,
    kind: candidate.type || candidate.assetKind || null,
    content: candidate.asset || candidate.content || {},
  };
}

// A candidate's content is free-form JSON. Prose assets may arrive as a
// bare string; everything below assumes an object.
function asAsset(content) {
  if (content && typeof content === "object" && !Array.isArray(content)) return content;
  return { content: typeof content === "string" ? content : JSON.stringify(content ?? null) };
}

async function promoteSkill(services, { id, content }, adoptedBy) {
  const asset = asAsset(content);
  const adopted = await services.unifiedSkills.adopt(
    {
      id: `skill-${id}`,
      name: asset.name || `Adopted skill ${id}`,
      description: asset.description || "",
      domain: asset.domain || "general",
      triggers: asset.triggers || [],
      steps: asset.steps || [],
      constraints: asset.constraints || [],
      candidate_id: id,
    },
    adoptedBy,
  );
  return { store: "unified_skills", adopted };
}

async function promotePersona(services, { id, content }, adoptedBy) {
  const asset = asAsset(content);
  const adopted = await services.personaEvolver.adopt(
    { ...asset, id: asset.id || `persona-${id}` },
    { adoptedBy, candidateId: id },
  );
  return { store: "personas_evolved", adopted };
}

async function promoteKnowledge(services, { id, content }, adoptedBy) {
  const asset = asAsset(content);
  const adopted = await services.knowledgeStore.adopt(
    { ...asset, id: asset.id || `knowledge-${id}` },
    { adoptedBy, candidateId: id },
  );
  return { store: "knowledge_adopted", adopted };
}

const PROMOTERS = {
  skill: promoteSkill,
  persona: promotePersona,
  knowledge: promoteKnowledge,
};

/**
 * Adopt an already-approved candidate into the store that serves it.
 * Never throws: approval has already happened, so the caller needs the
 * outcome (and the reason it did not reach a store) rather than a 500.
 */
async function promoteApproved(services, candidate, { adoptedBy = "system" } = {}) {
  const record = readCandidate(candidate);
  if (!record.id) return { promoted: false, reason: "candidate_has_no_id" };

  // Kinds with no destination (and kinds that are not consumable assets at
  // all) report which and why, instead of letting a bare "approved" imply
  // the asset is live. See utils/asset-kinds.js for the table.
  const refusal = refusalFor(record.kind);
  if (refusal) return { promoted: false, ...refusal };

  const destination = destinationFor(record.kind);
  if (!services || !services[destination.store]) {
    return { promoted: false, reason: "store_not_registered", kind: record.kind, store: destination.store };
  }

  try {
    const { store, adopted } = await PROMOTERS[record.kind](services, record, adoptedBy);
    return {
      promoted: true,
      kind: record.kind,
      store,
      adopted_into: { id: adopted.id, status: adopted.status || "adopted" },
    };
  } catch (e) {
    return { promoted: false, reason: "adoption_failed", kind: record.kind, store: destination.store, error: e.message };
  }
}

module.exports = { promoteApproved, PROMOTABLE_KINDS };
