const fs = require("fs").promises,
  path = require("path"),
  os = require("os");
const NEMONS_HOME = require("./runtime-config").nemonsHome();
const APPROVALS_DIR = path.join(NEMONS_HOME, "audit", "approvals");
class AW {
  async init() {
    await fs.mkdir(APPROVALS_DIR, { recursive: true });
  }
  determineLevel(c) {
    if (c.diff_size < 10 && !c.touches_security) return { level: "L1", auto_approve: true };
    if (c.diff_size < 100) return { level: "L2", auto_approve: false };
    return { level: "L3", auto_approve: false };
  }
  async create(c) {
    await this.init();
    const lv = this.determineLevel(c);
    const id = `req-${Date.now().toString(36)}`;
    const r = {
      id,
      timestamp: new Date().toISOString(),
      change: c,
      approval: { ...lv, status: lv.auto_approve ? "auto_approved" : "pending" },
    };
    await fs.writeFile(path.join(APPROVALS_DIR, id + ".json"), JSON.stringify(r, null, 2));
    return r;
  }
  async approve(id, by, comment) {
    await this.init();
    try {
      const r = JSON.parse(await fs.readFile(path.join(APPROVALS_DIR, id + ".json"), "utf8"));
      r.approval = {
        status: "approved",
        approved_by: by,
        approved_at: new Date().toISOString(),
        comment,
      };
      await fs.writeFile(path.join(APPROVALS_DIR, id + ".json"), JSON.stringify(r, null, 2));
      return r;
    } catch {
      return { error: "not found" };
    }
  }
  async listPending(lv) {
    await this.init();
    const f = await fs.readdir(APPROVALS_DIR);
    const r = [];
    for (const fn of f)
      if (fn.endsWith(".json")) {
        try {
          const req = JSON.parse(await fs.readFile(path.join(APPROVALS_DIR, fn), "utf8"));
          if (req.approval.status === "pending" && (!lv || req.approval.level === lv)) r.push(req);
        } catch {}
      }
    return r;
  }
  async stats() {
    await this.init();
    const f = await fs.readdir(APPROVALS_DIR);
    let t = 0;
    const by_s = {};
    for (const fn of f)
      if (fn.endsWith(".json")) {
        try {
          const r = JSON.parse(await fs.readFile(path.join(APPROVALS_DIR, fn), "utf8"));
          t++;
          by_s[r.approval.status] = (by_s[r.approval.status] || 0) + 1;
        } catch {}
      }
    return { total: t, by_status: by_s };
  }
}
module.exports = { ApprovalWorkflow: AW };
