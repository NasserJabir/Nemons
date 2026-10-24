const fs = require("fs").promises,
  path = require("path"),
  os = require("os");
const { nemonsHome } = require("./runtime-config");
const NEMONS_HOME = nemonsHome();
class StateManager {
  async init() {
    await fs.mkdir(path.join(NEMONS_HOME, "state"), { recursive: true });
  }
  async snapshot(instanceId, state) {
    await this.init();
    const id = "state-" + Date.now().toString(36);
    const snap = {
      id,
      instance_id: instanceId,
      timestamp: new Date().toISOString(),
      task: { prompt: state.prompt || null, status: state.task_status || "in_progress" },
      context: { pack_id: state.context_pack_id || null },
      memory: { experiences: state.experiences_retrieved || [] },
      evidence: state.evidence || {},
    };
    await fs.writeFile(path.join(NEMONS_HOME, "state", id + ".json"), JSON.stringify(snap, null, 2));
    return snap;
  }
  async restore(id) {
    try {
      const snap = JSON.parse(await fs.readFile(path.join(NEMONS_HOME, "state", id + ".json"), "utf8"));
      return { restored: true, snapshot: snap };
    } catch {
      return { restored: false, error: "not found" };
    }
  }
  async createHandoff(instanceId, summary) {
    await this.init();
    const id = "handoff-" + Date.now().toString(36);
    const h = {
      id,
      instance_id: instanceId,
      created_at: new Date().toISOString(),
      completed_tasks: summary.completed_tasks || [],
      pending_tasks: summary.pending_tasks || [],
      decisions: summary.decisions || [],
      memory_to_carry: { facts: summary.facts || [], skills: summary.skills || [] },
    };
    await fs.writeFile(path.join(NEMONS_HOME, "state", id + ".json"), JSON.stringify(h, null, 2));
    return h;
  }
  async stats() {
    await this.init();
    try {
      const f = await fs.readdir(path.join(NEMONS_HOME, "state"));
      return {
        snapshots: f.filter((x) => x.startsWith("state-")).length,
        handoffs: f.filter((x) => x.startsWith("handoff-")).length,
      };
    } catch {
      return { snapshots: 0, handoffs: 0 };
    }
  }
}
module.exports = { StateManager };
