const fs = require("fs").promises,
  path = require("path"),
  os = require("os");
const { nemonsHome } = require("./runtime-config");
const NEMONS_HOME = nemonsHome();
class IdentityManager {
  async init() {
    await fs.mkdir(path.join(NEMONS_HOME, "identities"), { recursive: true });
    await fs.mkdir(path.join(NEMONS_HOME, "instances"), { recursive: true });
  }
  async registerIdentity(c) {
    await this.init();
    const id = c.id || "agent-" + Date.now().toString(36);
    const identity = {
      id,
      name: c.name || id,
      type: c.type || "coding_agent",
      adapter: c.adapter || "unknown",
      capabilities: c.capabilities || [],
      trust: {
        tf: 1.0,
        violations: 0,
        sessions: 0,
        first: new Date().toISOString(),
        last: new Date().toISOString(),
      },
      status: "candidate",
      instances: [],
      registered_at: new Date().toISOString(),
    };
    await fs.writeFile(path.join(NEMONS_HOME, "identities", id + ".json"), JSON.stringify(identity, null, 2));
    return identity;
  }
  async getIdentity(id) {
    try {
      return JSON.parse(await fs.readFile(path.join(NEMONS_HOME, "identities", id + ".json"), "utf8"));
    } catch {
      return null;
    }
  }
  async createInstance(identityId, c) {
    await this.init();
    const identity = await this.getIdentity(identityId);
    if (!identity) return { error: "not found" };
    const iid = "inst-" + Date.now().toString(36);
    const inst = {
      id: iid,
      identity_id: identityId,
      session_start: new Date().toISOString(),
      status: "active",
      ephemeral_state: { task: c.task || null, pack_id: c.context_pack_id || null },
      memory: { markdown: null, derived: null, ephemeral: {}, handoff: null },
      evidence: [],
      subagents: [],
    };
    await fs.writeFile(path.join(NEMONS_HOME, "instances", iid + ".json"), JSON.stringify(inst, null, 2));
    identity.instances.push(iid);
    identity.trust.sessions += 1;
    await fs.writeFile(
      path.join(NEMONS_HOME, "identities", identityId + ".json"),
      JSON.stringify(identity, null, 2),
    );
    return inst;
  }
  async endInstance(iid, handoff) {
    try {
      const inst = JSON.parse(await fs.readFile(path.join(NEMONS_HOME, "instances", iid + ".json"), "utf8"));
      inst.session_end = new Date().toISOString();
      inst.status = "completed";
      inst.memory.handoff = handoff || { completed: inst.ephemeral_state.task };
      await fs.writeFile(path.join(NEMONS_HOME, "instances", iid + ".json"), JSON.stringify(inst, null, 2));
      return inst;
    } catch {
      return { error: "not found" };
    }
  }
  async listIdentities() {
    await this.init();
    try {
      const f = await fs.readdir(path.join(NEMONS_HOME, "identities"));
      const r = [];
      for (const fn of f)
        if (fn.endsWith(".json")) {
          try {
            r.push(JSON.parse(await fs.readFile(path.join(NEMONS_HOME, "identities", fn), "utf8")));
          } catch {}
        }
      return r;
    } catch {
      return [];
    }
  }
  async stats() {
    const ids = await this.listIdentities();
    return {
      total_identities: ids.length,
      active: ids.filter((i) => i.status === "active").length,
      total_sessions: ids.reduce((s, i) => s + i.trust.sessions, 0),
    };
  }
}
module.exports = { IdentityManager };
