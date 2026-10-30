// ============================================================
// Adopted Knowledge Store
//
// Knowledge used to be absent from context packs entirely (the field only
// existed in the synthetic fallback) and candidates of type `knowledge`
// had nowhere to be adopted into — approving one flipped a status and
// nothing consumed it. This store is that destination: only records with
// status `adopted` are ever returned, and adoption is written atomically
// under NEMONS_HOME/knowledge-adopted.
// ============================================================

const path = require("path");
const fs = require("fs").promises;
const { nemonsHome } = require("./runtime-config");
const { writeAtomic } = require("../store/storage");
const { isSafeId } = require("./path-guard");

const DEFAULT_DIR = path.join(nemonsHome(), "knowledge-adopted");

function words(text) {
  return new Set(String(text || "").toLowerCase().split(/\W+/).filter((w) => w.length > 3));
}

class KnowledgeStore {
  constructor(dir = DEFAULT_DIR) {
    this.dir = dir;
  }

  async init() {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async adopt(asset = {}, { adoptedBy = "system", candidateId = null } = {}) {
    await this.init();
    const id = asset.id || (candidateId ? `knowledge-${candidateId}` : `knowledge-${Date.now().toString(36)}`);
    if (!isSafeId(id)) throw new Error(`invalid knowledge id: ${JSON.stringify(String(id).slice(0, 32))}`);

    const record = {
      id,
      title: asset.title || asset.name || id,
      content: asset.content || asset.summary || asset.text || "",
      domain: asset.domain || "general",
      triggers: asset.triggers || asset.keywords || [],
      source: "adopted-candidate",
      candidate_id: candidateId,
      status: "adopted",
      adopted_by: adoptedBy,
      adopted_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    await writeAtomic(path.join(this.dir, `${id}.json`), JSON.stringify(record, null, 2));
    return record;
  }

  async list() {
    await this.init();
    let files = [];
    try {
      files = (await fs.readdir(this.dir)).filter((f) => f.endsWith(".json"));
    } catch {
      return [];
    }
    const records = [];
    for (const file of files) {
      try {
        records.push(JSON.parse(await fs.readFile(path.join(this.dir, file), "utf8")));
      } catch {
        // A corrupt record must not take the pack down; it is simply skipped.
      }
    }
    return records.filter((r) => r && r.status === "adopted");
  }

  /**
   * Records matching the query by keyword overlap (at least one hit), best
   * first. No overlap means nothing is returned — knowledge is not "always
   * relevant just because it exists".
   */
  async retrieve(query, limit = 3) {
    const all = await this.list();
    if (all.length === 0) return [];
    const queryWords = words(query);

    return all
      .map((record) => {
        const terms = [...(record.triggers || []), record.domain, record.title, record.content]
          .filter(Boolean)
          .join(" ");
        let hits = 0;
        for (const term of words(terms)) if (queryWords.has(term)) hits += 1;
        return { ...record, score: hits };
      })
      .filter((record) => record.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((record) => ({
        id: record.id,
        title: record.title,
        domain: record.domain,
        excerpt: String(record.content || "").slice(0, 200),
        score: record.score,
        status: record.status,
      }));
  }

  async stats() {
    const all = await this.list();
    return { total: all.length, dir: this.dir };
  }
}

module.exports = { KnowledgeStore };
