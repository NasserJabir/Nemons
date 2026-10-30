// ============================================================
// Candidate kinds → adoption destinations
//
// The single source of truth for "what can actually happen to an approved
// candidate". `/candidate/register` used to accept any string as a type, so
// `rule`, `tool`, `adapter`, `context_pack`, `experience`, and `memory`
// candidates could all reach status `adopted` while no store consumed them —
// the Use != Adopt invariant held only for skills (and now personas and
// knowledge).
//
// Two distinct gaps, kept distinct here because they need different fixes:
//   no_destination      — a real asset kind with no store that serves it yet
//   not_promotable      — not a consumable asset at all in this daemon
// ============================================================

const DESTINATIONS = {
  skill: {
    store: "unifiedSkills",
    adopted_prefix: "skill",
    status: "live",
  },
  persona: {
    store: "personaEvolver",
    adopted_prefix: "persona",
    status: "live",
  },
  knowledge: {
    store: "knowledgeStore",
    adopted_prefix: "knowledge",
    status: "live",
  },
  memory: {
    store: null,
    status: "no_destination",
    reason: "no_store_reads_memory",
    detail: "Context packs carry persona, skills, knowledge, and experiences — there is no memory section, so an adopted memory would be unreadable.",
  },
  experience: {
    store: null,
    status: "no_destination",
    reason: "experiences_arrive_through_verification",
    detail: "Experiences enter the CBR store from runs that passed verification (post-run processing), not by approving a candidate.",
  },
  rule: {
    store: null,
    status: "not_promotable",
    reason: "rules_are_loaded_from_config",
    detail: "Governance rules are read from governance/governance-rules.yml at boot; nothing promotes a candidate into them.",
  },
  tool: {
    store: null,
    status: "not_promotable",
    reason: "tool_contracts_are_registered_directly",
    detail: "Tool contracts are registered through their own contract API, not through candidate approval.",
  },
  adapter: {
    store: null,
    status: "not_promotable",
    reason: "adapter_contracts_are_registered_directly",
    detail: "Adapter contracts are registered through their own contract API, not through candidate approval.",
  },
  context_pack: {
    store: null,
    status: "not_promotable",
    reason: "context_packs_are_built_not_adopted",
    detail: "Context packs are built per request from adopted assets; there is no pack store for approval to write into.",
  },
};

const KNOWN_KINDS = Object.keys(DESTINATIONS);
const PROMOTABLE_KINDS = KNOWN_KINDS.filter((kind) => DESTINATIONS[kind].status === "live");

class UnsupportedCandidateKindError extends Error {
  constructor(kind, source = "candidate") {
    const shown = typeof kind === "string" && kind.length ? JSON.stringify(kind) : String(kind);
    super(`candidate kind ${shown} cannot be adopted: nothing consumes it after approval`);
    this.name = "UnsupportedCandidateKindError";
    this.code = "unsupported_candidate_kind";
    this.kind = kind;
    this.source = source;
    this.supported_kinds = supportedKinds();
  }
}

function isKnownKind(kind) {
  return typeof kind === "string" && Object.prototype.hasOwnProperty.call(DESTINATIONS, kind);
}

function isPromotable(kind) {
  return isKnownKind(kind) && DESTINATIONS[kind].status === "live";
}

function destinationFor(kind) {
  return isPromotable(kind) ? DESTINATIONS[kind] : null;
}

function supportedKinds() {
  return [...PROMOTABLE_KINDS];
}

// Why a kind cannot be promoted — used in API responses so a caller learns the
// reason instead of inferring that a missing store is a bug.
function refusalFor(kind) {
  if (!isKnownKind(kind)) {
    return { reason: "unknown_candidate_kind", kind, supported_kinds: supportedKinds() };
  }
  const entry = DESTINATIONS[kind];
  if (entry.status === "live") return null;
  return {
    reason: entry.reason,
    detail: entry.detail,
    kind,
    status: entry.status,
    supported_kinds: supportedKinds(),
  };
}

// Every kind the daemon recognises, with its adoption status — for docs and
// introspection endpoints.
function kindTable() {
  return KNOWN_KINDS.map((kind) => ({
    kind,
    status: DESTINATIONS[kind].status,
    store: DESTINATIONS[kind].store,
    reason: DESTINATIONS[kind].reason || null,
  }));
}

module.exports = {
  DESTINATIONS,
  KNOWN_KINDS,
  PROMOTABLE_KINDS,
  UnsupportedCandidateKindError,
  isKnownKind,
  isPromotable,
  destinationFor,
  supportedKinds,
  refusalFor,
  kindTable,
};
