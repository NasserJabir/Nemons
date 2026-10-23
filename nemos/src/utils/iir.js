// Typed Intermediate Representation (I-IR) — COMPLETE v2.5.0
// Based on: arXiv:2510.03902 (MACOG)
class IIRNode {
  constructor(kind, fields, provider, region, effects) {
    this.kind = kind;
    this.fields = fields || {};
    this.provider = provider || "default";
    this.region = region || "global";
    this.effects = effects || [];
  }
}

class IIREdge {
  constructor(from, to, type, metadata) {
    this.from = from;
    this.to = to;
    this.type = type;
    this.metadata = metadata || {};
  }
}

class IIRPlan {
  constructor() { this.nodes = []; this.edges = []; this.specs = []; }
  
  addNode(node) {
    if (!(node instanceof IIRNode)) {
      node = new IIRNode(node.kind, node.fields, node.provider, node.region, node.effects);
    }
    this.nodes.push(node);
    return this;
  }
  
  addEdge(edge) {
    if (!(edge instanceof IIREdge)) {
      edge = new IIREdge(edge.from, edge.to, edge.type, edge.metadata);
    }
    this.edges.push(edge);
    return this;
  }
  
  addSpec(spec) { this.specs.push(spec); return this; }
  
  // REAL acyclicity check using DFS
  isAcyclic() {
    const nodeKinds = this.nodes.map(n => n.kind);
    const adj = {};
    for (const kind of nodeKinds) adj[kind] = [];
    
    for (const edge of this.edges) {
      if (edge.type === "depends") {
        if (!adj[edge.from]) adj[edge.from] = [];
        adj[edge.from].push(edge.to);
      }
    }
    
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = {};
    for (const kind of nodeKinds) color[kind] = WHITE;
    
    let hasCycle = false;
    
    const dfs = (node) => {
      if (hasCycle) return;
      color[node] = GRAY;
      for (const neighbor of (adj[node] || [])) {
        if (color[neighbor] === GRAY) { hasCycle = true; return; }
        if (color[neighbor] === WHITE) dfs(neighbor);
      }
      color[node] = BLACK;
    };
    
    for (const kind of nodeKinds) {
      if (color[kind] === WHITE) dfs(kind);
    }
    
    return !hasCycle;
  }
  
  // REAL validation against schema
  validate(schema) {
    const errors = [];
    const s = schema || {};
    for (const node of this.nodes) {
      const nodeSchema = s[node.kind];
      if (!nodeSchema) continue;
      for (const req of (nodeSchema.required || [])) {
        if (!(req in node.fields)) {
          errors.push({ node: node.kind, error: "missing_required_field", field: req });
        }
      }
      // Check field types
      for (const [field, type] of Object.entries(nodeSchema.fields || {})) {
        if (field in node.fields) {
          const val = node.fields[field];
          const actualType = Array.isArray(val) ? "array" : typeof val;
          if (actualType !== type) {
            errors.push({ node: node.kind, error: "type_mismatch", field, expected: type, actual: actualType });
          }
        }
      }
    }
    
    // Check edge validity
    const nodeKinds = new Set(this.nodes.map(n => n.kind));
    for (const edge of this.edges) {
      if (!nodeKinds.has(edge.from)) {
        errors.push({ error: "edge_source_not_found", from: edge.from });
      }
      if (!nodeKinds.has(edge.to)) {
        errors.push({ error: "edge_target_not_found", to: edge.to });
      }
    }
    
    return { valid: errors.length === 0, errors, node_count: this.nodes.length, edge_count: this.edges.length };
  }
  
  // Topological sort (only if acyclic)
  topologicalSort() {
    if (!this.isAcyclic()) return { error: "cycle_detected" };
    const adj = {};
    for (const n of this.nodes.map(n => n.kind)) adj[n] = [];
    for (const e of this.edges) {
      if (e.type === "depends") { if (!adj[e.from]) adj[e.from] = []; adj[e.from].push(e.to); }
    }
    const visited = new Set();
    const order = [];
    const visit = (node) => {
      if (visited.has(node)) return;
      visited.add(node);
      for (const dep of (adj[node] || [])) visit(dep);
      order.push(node);
    };
    for (const n of this.nodes.map(n => n.kind)) visit(n);
    return { order: order.reverse() };
  }
  
  toJSON() {
    return {
      nodes: this.nodes, edges: this.edges, specs: this.specs,
      is_acyclic: this.isAcyclic(),
      node_count: this.nodes.length, edge_count: this.edges.length,
    };
  }
}

const Validators = {
  schema: (plan) => plan.validate({}),
  policy: (plan) => {
    const violations = [];
    for (const spec of plan.specs) {
      if (spec.type === "encrypt_at_rest" && spec.value !== true)
        violations.push({ spec: "encrypt_at_rest", violation: "not_enabled" });
      if (spec.type === "least_privilege" && spec.value !== true)
        violations.push({ spec: "least_privilege", violation: "not_enabled" });
    }
    return { pass: violations.length === 0, violations };
  },
  cost: (plan, budget) => {
    let total = 0;
    for (const n of plan.nodes) total += (n.fields.cost || 0);
    return { pass: total <= budget, cost: total, budget, over: Math.max(0, total - budget) };
  },
  deploy: (plan) => {
    const kinds = new Set(plan.nodes.map(n => n.kind));
    const unresolved = [];
    for (const e of plan.edges) {
      if (e.type === "depends" && !kinds.has(e.to))
        unresolved.push({ from: e.from, to: e.to });
    }
    return { pass: unresolved.length === 0, unresolved };
  },
};

module.exports = { IIRNode, IIREdge, IIRPlan, Validators };
