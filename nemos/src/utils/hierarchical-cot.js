// Hierarchical Chain-of-Thought
// Based on: arXiv:2604.00130
// Multi-level reasoning instead of linear chain
//
// v4.2.1-fix: the original buildTree() had infinite recursion
// because the recursive call passed `level` unchanged (only
// `depth` was decremented). Since the initial call also didn't
// pass `level` at all (so it was `undefined`, never === 0),
// every call recursed forever, eventually throwing
// "Maximum call stack size exceeded".
//
// Fix:
//   - On the initial call, default `level` to `depth`.
//   - On each recursive call, decrement `level` by 1.
//   - The `level === 0` base case now triggers correctly after
//     `depth` levels of recursion, producing the intended finite
//     tree (depth+1 levels including leaves).
//
// No architectural change — the function was always supposed to
// build a finite tree of depth `depth`. The bug just meant it
// never did.
class HierarchicalCoT {
  reason(problem, depth) {
    depth = depth || 3;
    const tree = this.buildTree(problem, depth);
    return {
      problem,
      tree,
      levels: depth,
      nodes: this.countNodes(tree),
    };
  }

  buildTree(problem, depth, level) {
    // v4.2.1-fix: default level to depth on the initial call.
    if (level === undefined || level === null) level = depth;
    if (level === 0) return { leaf: true, problem };
    const sub = this.decompose(problem);
    return {
      problem,
      level: depth - level,
      // v4.2.1-fix: decrement level on the recursive call (was unchanged).
      children: sub.map(s => this.buildTree(s, depth, level - 1)),
    };
  }

  decompose(problem) {
    const p = (problem || "").toLowerCase();
    const parts = [];
    if (p.includes("and")) {
      // v4.2.1-fix (rev 3): CodeQL flagged the original regex
      // `/\s+and\s+/i` as a potential ReDoS risk because the
      // `\s+` quantifier on a user-controlled string could cause
      // quadratic backtracking on inputs with many whitespace
      // characters in a row.
      //
      // Fix: normalize whitespace first (replace runs of whitespace
      // with a single space), then split on the literal " and "
      // (lowercase, since we already lowercased). This avoids the
      // regex engine entirely and is both faster and safe.
      const normalized = p.replace(/\s+/g, " ").trim();
      const split = normalized.split(" and ");
      for (const s of split) {
        const trimmed = s.trim();
        if (trimmed) parts.push(trimmed);
      }
    }
    if (parts.length === 0) {
      parts.push("analyze requirements", "design solution", "implement code", "verify correctness");
    }
    return parts.slice(0, 4);
  }

  countNodes(tree) {
    if (!tree) return 0;
    if (tree.leaf) return 1;
    let count = 1;
    for (const c of (tree.children || [])) count += this.countNodes(c);
    return count;
  }

  // Trace: get reasoning path from root to a leaf
  trace(tree, targetLeaf) {
    const path = [];
    const find = (node, target) => {
      path.push(node.problem || "");
      if (node.leaf && path.length >= 2) return true;
      for (const c of (node.children || [])) {
        if (find(c, target)) return true;
      }
      path.pop();
      return false;
    };
    find(tree, targetLeaf);
    return path;
  }

  stats() {
    return { type: "hierarchical", default_depth: 3, reference: "arXiv:2604.00130" };
  }
}
module.exports = { HierarchicalCoT };
