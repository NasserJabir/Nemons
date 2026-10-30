const fs = require("fs").promises,
  path = require("path"),
  crypto = require("crypto"),
  os = require("os");
const { writeAtomic } = require("../store/storage");
const NEMONS_HOME = require("./runtime-config").nemonsHome();
const EXPERIENCES_DIR = path.join(NEMONS_HOME, "experiences");
function sim(a, b) {
  const wa = new Set(
    (a || "")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
  const wb = new Set(
    (b || "")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
  if (!wa.size || !wb.size) return 0;
  let c = 0;
  for (const w of wa) if (wb.has(w)) c++;
  return c / Math.max(wa.size, wb.size);
}
class CBR {
  // Relevance floor. Before this, score = 0.5*sim + 0.3*success meant an
  // experience with ZERO prompt overlap still scored 0.3 and was always
  // injected — an unrelated past run polluted every context pack. Now
  // the raw text similarity is reported honestly (as `similarity`) and
  // anything below the floor is dropped.
  async retrieve(q, l, options = {}) {
    l = l || 3;
    const minSimilarity = options.minSimilarity ?? 0.15;
    const all = await this.list();
    if (!all.length) return [];
    return all
      .map((e) => {
        const similarity = sim(q, e.prompt || "");
        return { ...e, similarity, _score: 0.7 * similarity + 0.3 * (e.success_rate || 0) };
      })
      .filter((e) => e.similarity >= minSimilarity)
      .sort((a, b) => b._score - a._score)
      .slice(0, l);
  }
  async retain(sol, meta) {
    // random suffix: Date.now() alone collides when two runs finish in
    // the same millisecond and the second silently overwrote the first.
    const id = `exp-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
    const p = path.join(EXPERIENCES_DIR, id + ".json");
    const e = {
      id,
      timestamp: new Date().toISOString(),
      prompt: meta.prompt,
      solution: sol,
      success_rate: meta.success ? 1 : 0,
      adapter: meta.adapter || "unknown",
    };
    await fs.mkdir(EXPERIENCES_DIR, { recursive: true });
    await writeAtomic(p, JSON.stringify(e, null, 2));
    return e;
  }
  async list() {
    try {
      const f = await fs.readdir(EXPERIENCES_DIR);
      const r = [];
      for (const fn of f)
        if (fn.endsWith(".json")) {
          try {
            r.push(JSON.parse(await fs.readFile(path.join(EXPERIENCES_DIR, fn), "utf8")));
          } catch {}
        }
      return r;
    } catch {
      return [];
    }
  }
  async stats() {
    const all = await this.list();
    return {
      total: all.length,
      success_rate: all.length ? all.filter((e) => e.success_rate > 0.5).length / all.length : 0,
    };
  }
}
module.exports = { CBRExperienceStore: CBR };
