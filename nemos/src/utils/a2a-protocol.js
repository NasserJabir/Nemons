// ============================================================
// A2A Protocol — Agent-to-Agent Communication
// Based on: Google A2A Protocol
// Agent Cards for capability discovery
//
// Agent ids become filename components (one JSON card per agent),
// so every id that arrives from outside is validated by isSafeId()
// before it is interpolated into a path.
// ============================================================
const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const { isSafeId } = require("./path-guard");

const NEMONS_HOME = require("./runtime-config").nemonsHome();
const DATA_DIR = path.join(NEMONS_HOME, "a2a");

class A2AProtocol {
  async init() {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  // Register an agent with its Agent Card
  async registerAgent(agentCard) {
    await this.init();
    const id = agentCard.id || `agent-${Date.now().toString(36)}`;
    if (!isSafeId(id)) return { error: "invalid id" };
    const card = {
      id,
      name: agentCard.name || id,
      capabilities: agentCard.capabilities || [],
      endpoint: agentCard.endpoint || "",
      version: agentCard.version || "1.0.0",
      registered_at: new Date().toISOString(),
    };
    await fs.writeFile(path.join(DATA_DIR, id + ".json"), JSON.stringify(card, null, 2));
    return card;
  }

  // Discover agents by capability
  async discover(capability) {
    await this.init();
    const files = await fs.readdir(DATA_DIR);
    const matches = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const card = JSON.parse(await fs.readFile(path.join(DATA_DIR, f), "utf8"));
        if (!capability || card.capabilities?.includes(capability)) matches.push(card);
      } catch {}
    }
    return matches;
  }

  // Send task to another agent
  async sendTask(targetAgentId, task) {
    const target = await this.getAgent(targetAgentId);
    if (!target) return { error: "agent not found" };
    return {
      from: "self",
      to: targetAgentId,
      task,
      task_id: `task-${Date.now().toString(36)}`,
      sent_at: new Date().toISOString(),
      status: "sent",
    };
  }

  async getAgent(id) {
    if (!isSafeId(id)) return null;
    try {
      return JSON.parse(await fs.readFile(path.join(DATA_DIR, id + ".json"), "utf8"));
    } catch {
      return null;
    }
  }

  async listAgents() {
    await this.init();
    const files = await fs.readdir(DATA_DIR);
    const agents = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        agents.push(JSON.parse(await fs.readFile(path.join(DATA_DIR, f), "utf8")));
      } catch {}
    }
    return agents;
  }

  async stats() {
    const agents = await this.listAgents();
    return {
      total_agents: agents.length,
      capabilities: [...new Set(agents.flatMap(a => a.capabilities || []))],
    };
  }
}

module.exports = { A2AProtocol };
