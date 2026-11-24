// Contract test for achievement notifications: the data the frontend toast/bell reads (GET /achievements) comes from real unlocks only.   cd backend && npm run test:achnotify
const os = require('os'), path = require('path'), fs = require('fs'), stamp = Date.now() + '_' + process.pid;
process.env.NODE_ENV = 'test'; process.env.SEED_DEMO = 'false'; process.env.DB_PATH = path.join(os.tmpdir(), `lj_achn_${stamp}.db`);
const { test, after } = require('node:test'), assert = require('node:assert/strict');
const db = require('../database/db'), AM = require('../controllers/achievements');
after(() => { try { db.close && db.close(); } catch { /* ignore */ } for (const s of ['', '-wal', '-shm']) fs.rmSync(process.env.DB_PATH + s, { force: true }); });
const mk = n => db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(n, n.toLowerCase() + '@achn.local', 'x').lastInsertRowid;
const list = uid => { let out; AM.list({ user: { id: uid }, query: {} }, { json: b => { out = b; } }); return out; };
const A = mk('Alice'), B = mk('Bob');

test('nothing unlocked, nothing to notify for a fresh user', () => {
  assert.equal(list(A).achievements.filter(a => a.unlocked).length, 0);
});
test('a real goal creates a real unlock that carries everything the toast shows', () => {
  db.prepare('INSERT INTO goals(user_id,title) VALUES(?,?)').run(A, 'Learn HTML');
  const fresh = AM.evaluate(A); assert.deepEqual(fresh.map(f => f.key), ['goal_set']);
  const a = list(A).achievements.find(x => x.key === 'goal_set');
  assert.equal(a.unlocked, true); assert.ok(a.title && a.description && a.category && a.unlocked_at);
});
test('unlocks never repeat and never leak to another user', () => {
  assert.deepEqual(AM.evaluate(A), []); // second evaluation: nothing new, so nothing to announce again
  assert.equal(list(B).achievements.filter(a => a.unlocked).length, 0);
});
