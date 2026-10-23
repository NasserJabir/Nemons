// DAG Planner — Decomposes a task into a DAG of sub-tasks.
//
// v4.2.1-fix: previously returned `{nodes, count}`, but every
// caller (pipeline-integrator.js, subagent-orchestrator.js, the
// unit test) checks `node_count`. The mismatch meant:
//   - the unit test failed with "falsy value"
//   - pipeline-integrator's `if (dagPlan.node_count > 2)` was
//     ALWAYS false (undefined > 2), so subagents were NEVER
//     orchestrated through the pipeline
//
// Fix: rename `count` → `node_count` to match all callers.
// No architectural change — the property name was always meant
// to be `node_count`.
class DAG {
  constructor() { this.n = new Map(); }

  plan(q) {
    this.n.clear();
    const subs = this.decompose(q);
    for (const s of subs) this.n.set(s.id, { ...s, status: "pending" });
    return {
      nodes: Array.from(this.n.values()),
      node_count: this.n.size,   // v4.2.1-fix: was `count`
      // Backward-compat alias for any older caller.
      count: this.n.size,
    };
  }

  decompose(q) {
    const ql = (q || "").toLowerCase();
    if (ql.includes("implement") || ql.includes("build")) {
      return [
        { id: "design",   question: "Design",   dependencies: [] },
        { id: "implement",question: "Implement",dependencies: ["design"] },
        { id: "test",     question: "Test",     dependencies: ["design"] },
        { id: "verify",   question: "Verify",   dependencies: ["implement", "test"] },
      ];
    }
    if (ql.includes("fix") || ql.includes("bug")) {
      return [
        { id: "diagnose",question: "Diagnose",dependencies: [] },
        { id: "fix",     question: "Fix",     dependencies: ["diagnose"] },
        { id: "verify",  question: "Verify",  dependencies: ["fix"] },
      ];
    }
    return [{ id: "execute", question: q, dependencies: [] }];
  }

  getExecutionOrder() {
    const v = new Set(), o = [];
    const visit = (id) => {
      if (v.has(id)) return;
      v.add(id);
      const n = this.n.get(id);
      if (n) for (const d of (n.dependencies || [])) visit(d);
      o.push(id);
    };
    for (const id of this.n.keys()) visit(id);
    return o;
  }

  getReadyNodes() {
    return Array.from(this.n.values()).filter(n =>
      n.status === "pending" &&
      (n.dependencies || []).every(d => {
        const dep = this.n.get(d);
        return dep && dep.status === "completed";
      })
    );
  }

  getStatus() {
    const t = this.n.size;
    const c = Array.from(this.n.values()).filter(n => n.status === "completed").length;
    return {
      total: t,
      completed: c,
      pending: t - c,
      progress: t ? (c / t).toFixed(2) : 0,
    };
  }
}

module.exports = { DAGPlanner: DAG };
