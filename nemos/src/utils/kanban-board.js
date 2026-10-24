// ============================================================
// Kanban Board — Worker State Tracking
// Based on: Agent Orchestrator (OrchestratorInc)
// States: Working, Needs you, In review, Ready to merge
//
// Worker ids become filename components (one JSON file per worker),
// so every id that arrives from outside is validated by isSafeId()
// before it is interpolated into a path.
// ============================================================
const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const { isSafeId } = require("./path-guard");

const NEMONS_HOME = require("./runtime-config").nemonsHome();
const DATA_DIR = path.join(NEMONS_HOME, "kanban");

const STATES = ["working", "needs_you", "in_review", "ready_to_merge", "merged", "blocked"];

class KanbanBoard {
  async init() {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  async createWorker(worker) {
    await this.init();
    const id = worker.id || `worker-${Date.now().toString(36)}`;
    if (!isSafeId(id)) return { error: "invalid id" };
    const w = {
      id,
      ...worker,
      state: "working",
      created_at: new Date().toISOString(),
      history: [{ state: "working", timestamp: new Date().toISOString() }],
    };
    await fs.writeFile(path.join(DATA_DIR, id + ".json"), JSON.stringify(w, null, 2));
    return w;
  }

  async moveWorker(id, newState, reason) {
    await this.init();
    if (!isSafeId(id)) return { error: "invalid id" };
    try {
      const w = JSON.parse(await fs.readFile(path.join(DATA_DIR, id + ".json"), "utf8"));
      if (!STATES.includes(newState)) return { error: "invalid state" };
      w.state = newState;
      w.history.push({ state: newState, timestamp: new Date().toISOString(), reason });
      await fs.writeFile(path.join(DATA_DIR, id + ".json"), JSON.stringify(w, null, 2));
      return w;
    } catch {
      return { error: "not found" };
    }
  }

  async getBoard() {
    await this.init();
    const files = await fs.readdir(DATA_DIR);
    const board = {};
    for (const s of STATES) board[s] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const w = JSON.parse(await fs.readFile(path.join(DATA_DIR, f), "utf8"));
        if (board[w.state]) board[w.state].push(w);
      } catch {}
    }
    return board;
  }

  async stats() {
    const b = await this.getBoard();
    const stats = {};
    for (const s of STATES) stats[s] = b[s].length;
    stats.total = STATES.reduce((sum, s) => sum + stats[s], 0);
    return stats;
  }
}

module.exports = { KanbanBoard, STATES };
