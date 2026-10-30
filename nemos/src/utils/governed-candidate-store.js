// ============================================================
// Governed Evolution — file-backed CandidateStore
//
// The engine is synchronous; core's PersistentCandidateStore is
// async, so the daemon kept every candidate in RAM: propose →
// approve worked inside one process, and a restart silently
// dropped pending and approved candidates (including the "active
// version" that rollback needs).
//
// Core's InMemoryCandidateStore stays authoritative: it owns
// record validation and the candidate state machine, and
// re-implementing either here would be the exact drift this
// project forbids. This module only mirrors each mutated record
// to disk and rehydrates the memory map at construction.
//
// Writes are atomic (temp file + rename in the same directory), so
// a crash mid-write cannot leave a truncated candidate behind.
// ============================================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { isSafeId } = require("./path-guard");

function atomicWriteSync(fullPath, data) {
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const tmp = `${fullPath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, fullPath);
  return fullPath;
}

/**
 * Build a CandidateStore that behaves exactly like `BaseStore`
 * (validation + transitions) but keeps one JSON file per candidate
 * under `dir`, so state survives a daemon restart.
 *
 * @param {Function} BaseStore core's InMemoryCandidateStore constructor
 * @param {string} dir absolute directory for the candidate records
 */
function createFileBackedCandidateStore(BaseStore, dir) {
  if (typeof BaseStore !== "function") {
    throw new TypeError("createFileBackedCandidateStore requires a CandidateStore constructor");
  }
  if (typeof dir !== "string" || dir.length === 0) {
    throw new TypeError("createFileBackedCandidateStore requires a directory");
  }
  const storeDir = path.resolve(dir);

  return new (class FileBackedCandidateStore extends BaseStore {
    constructor() {
      super();
      this.dir = storeDir;
      this.persistedCount = 0;
      this.errors = [];
      this._rehydrate();
    }

    _fileFor(id) {
      return path.join(this.dir, `${id}.json`);
    }

    _persist(record) {
      if (!record || !isSafeId(record.id)) {
        this.errors.push({ id: record?.id, error: "refused to persist record with unsafe id" });
        return;
      }
      try {
        atomicWriteSync(this._fileFor(record.id), JSON.stringify(record, null, 2));
      } catch (err) {
        this.errors.push({ id: record.id, error: err.message });
      }
    }

    _rehydrate() {
      let files = [];
      try {
        files = fs.readdirSync(this.dir).filter((f) => f.endsWith(".json"));
      } catch (err) {
        // A fresh home has no directory yet — not an error.
        if (err.code !== "ENOENT") this.errors.push({ error: err.message });
        return;
      }

      const records = [];
      for (const file of files) {
        try {
          records.push(JSON.parse(fs.readFileSync(path.join(this.dir, file), "utf8")));
        } catch (err) {
          this.errors.push({ file, error: err.message });
        }
      }

      // Deterministic: insertion order is the proposal order the engine
      // and getVersionChain rely on.
      records.sort((a, b) => {
        const byTime = String(a?.proposedAt || "").localeCompare(String(b?.proposedAt || ""));
        return byTime !== 0 ? byTime : String(a?.id).localeCompare(String(b?.id));
      });

      const canSeed = typeof this.records?.set === "function" && Array.isArray(this.insertionOrder);
      if (!canSeed) {
        this.errors.push({ error: "store internals unavailable; persistence disabled for this process" });
        return;
      }

      for (const record of records) {
        if (!record || !isSafeId(record.id)) continue;
        // Deliberately bypasses add(): add() rejects any record whose
        // status is not `proposed`, which is precisely what we need to
        // resume past. The record already passed validation before it
        // was written.
        this.records.set(record.id, record);
        this.insertionOrder.push(record.id);
        this.persistedCount++;
      }
    }

    add(candidate) {
      const record = super.add(candidate);
      this._persist(record);
      return record;
    }

    transition(id, toStatus, reviewEntry) {
      const record = super.transition(id, toStatus, reviewEntry);
      this._persist(record);
      return record;
    }

    appendReviewTrail(id, reviewEntry) {
      const record = super.appendReviewTrail(id, reviewEntry);
      this._persist(record);
      return record;
    }

    /** Diagnostic surface for GET /core/status. */
    describe() {
      return {
        kind: "file-backed",
        dir: this.dir,
        candidates: this.size(),
        loaded_from_disk: this.persistedCount,
        errors: this.errors.slice(0, 5),
        error_count: this.errors.length,
      };
    }
  })();
}

module.exports = { createFileBackedCandidateStore };
