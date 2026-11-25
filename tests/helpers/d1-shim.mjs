// A small stand-in for Cloudflare D1 built on Node's own SQLite (node:sqlite), so the
// Worker can be tested in plain Node without a network or a Cloudflare account.
// Only the parts of the D1 API that src/worker.js uses are implemented.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// D1 turns booleans into 0/1 and refuses undefined; node:sqlite throws on both
function toSqlite(v) {
  if (v === undefined) throw new Error('D1_TYPE_ERROR: undefined is not a supported bind value');
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    return new Statement(this.db, this.sql, params.map(toSqlite));
  }
  _stmt() {
    return this.db.prepare(this.sql);
  }
  async first(column) {
    const row = this._stmt().get(...this.params);
    if (!row) return null;
    const plain = { ...row };
    return column ? plain[column] : plain;
  }
  async all() {
    return { results: this._stmt().all(...this.params).map((r) => ({ ...r })), success: true, meta: {} };
  }
  async run() {
    const info = this._stmt().run(...this.params);
    return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }
  _runSync() {
    const s = this._stmt();
    if (/^\s*(SELECT|WITH)/i.test(this.sql)) return { results: s.all(...this.params).map((r) => ({ ...r })), meta: {} };
    const info = s.run(...this.params);
    return { results: [], meta: { changes: Number(info.changes) } };
  }
}

export class D1Shim {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec(readFileSync(path.join(root, 'database', 'schema.sql'), 'utf8'));
  }
  prepare(sql) {
    return new Statement(this.db, sql);
  }
  // D1 runs a batch as one transaction: all statements or none
  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const out = statements.map((s) => s._runSync());
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  async exec(sql) {
    this.db.exec(sql);
    return { count: 1 };
  }
}
