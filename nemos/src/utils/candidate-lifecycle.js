const fs = require("fs").promises,
  path = require("path"),
  os = require("os");
const { nemonsHome } = require("./runtime-config");
const { writeAtomic } = require("../store/storage");
const { timeId } = require("./ids");
const { isPromotable, UnsupportedCandidateKindError } = require("./asset-kinds");
const NEMONS_HOME = nemonsHome();
class CandidateLifecycle {
  async init() {
    await fs.mkdir(path.join(NEMONS_HOME, "candidates"), { recursive: true });
  }
  async registerCandidate(a) {
    await this.init();
    const id = a.id || timeId("cand");
    const type = a.type || "skill";
    // A candidate whose kind has no adoption destination is a silent trap:
    // approving it would set `status: "adopted"` and nothing would consume it.
    // Refuse it here, where the caller can still change course.
    if (!isPromotable(type)) throw new UnsupportedCandidateKindError(type);
    // Every promotable kind passes the review gate — approval is the only
    // path to adoption.
    const gate = "review";
    const c = {
      id,
      type,
      asset: a.content || a,
      status: "candidate",
      gate,
      provenance: {
        generated_at: new Date().toISOString(),
        generated_by: a.generated_by || "system",
        source: a.source || "auto",
      },
      reviews: [],
      approvals: [],
      adopted_at: null,
      rejected_at: null,
    };
    await writeAtomic(path.join(NEMONS_HOME, "candidates", id + ".json"), JSON.stringify(c, null, 2));
    return {
      candidate: c,
      message: "Registered as CANDIDATE. Gate: " + gate + ". Must be approved before use.",
    };
  }
  async approve(id, approver, comment) {
    try {
      const c = JSON.parse(await fs.readFile(path.join(NEMONS_HOME, "candidates", id + ".json"), "utf8"));
      c.approvals.push({ approver, timestamp: new Date().toISOString(), comment });
      c.status = "adopted";
      c.adopted_at = new Date().toISOString();
      c.adopted_by = approver;
      await writeAtomic(path.join(NEMONS_HOME, "candidates", id + ".json"), JSON.stringify(c, null, 2));
      return { candidate: c, promoted: true, message: "ADOPTED" };
    } catch {
      return { error: "not found" };
    }
  }
  async reject(id, rejector, reason) {
    try {
      const c = JSON.parse(await fs.readFile(path.join(NEMONS_HOME, "candidates", id + ".json"), "utf8"));
      c.status = "rejected";
      c.rejected_at = new Date().toISOString();
      c.rejection_reason = reason;
      await writeAtomic(path.join(NEMONS_HOME, "candidates", id + ".json"), JSON.stringify(c, null, 2));
      return { candidate: c, message: "REJECTED" };
    } catch {
      return { error: "not found" };
    }
  }
  async canUse(id) {
    try {
      const c = JSON.parse(await fs.readFile(path.join(NEMONS_HOME, "candidates", id + ".json"), "utf8"));
      return { can_use: c.status === "adopted", status: c.status, invariant: "#4: Use != Adopt" };
    } catch {
      return { can_use: false, error: "not found" };
    }
  }
  async listByStatus(status) {
    await this.init();
    try {
      const f = await fs.readdir(path.join(NEMONS_HOME, "candidates"));
      const r = [];
      for (const fn of f)
        if (fn.endsWith(".json")) {
          try {
            const c = JSON.parse(await fs.readFile(path.join(NEMONS_HOME, "candidates", fn), "utf8"));
            if (!status || c.status === status) r.push(c);
          } catch {}
        }
      return r;
    } catch {
      return [];
    }
  }
  async stats() {
    const all = await this.listByStatus();
    return {
      total: all.length,
      candidate: all.filter((c) => c.status === "candidate").length,
      adopted: all.filter((c) => c.status === "adopted").length,
      rejected: all.filter((c) => c.status === "rejected").length,
    };
  }
}
module.exports = { CandidateLifecycle };
