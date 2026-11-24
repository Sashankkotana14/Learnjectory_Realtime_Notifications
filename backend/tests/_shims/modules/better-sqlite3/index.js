// TEST-ONLY stand-in for better-sqlite3 built on Node's built-in node:sqlite, so the DB-backed controllers can run where `npm install` is impossible.
// It is only found when the real package is NOT installed (backend/node_modules wins), and is never used by the app itself.
const { DatabaseSync } = require('node:sqlite');
class Database {
  constructor(file) { this.d = new DatabaseSync(file); }
  exec(sql) { this.d.exec(sql); return this; }
  pragma(s) { const st = this.d.prepare('PRAGMA ' + s); return /=/.test(s) ? (this.d.exec('PRAGMA ' + s), []) : st.all(); }
  prepare(sql) {
    const st = this.d.prepare(sql), fix = a => a.map(x => (typeof x === 'boolean' ? +x : x === undefined ? null : x));
    return { get: (...a) => st.get(...fix(a)), all: (...a) => st.all(...fix(a)), run: (...a) => st.run(...fix(a)) };
  }
  transaction(fn) { return (...a) => { this.d.exec('BEGIN'); try { const r = fn(...a); this.d.exec('COMMIT'); return r; } catch (e) { this.d.exec('ROLLBACK'); throw e; } }; }
  close() { this.d.close(); }
}
module.exports = Database;
