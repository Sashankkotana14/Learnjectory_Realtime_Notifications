// Contract test for Notification History: GET /api/notifications must return every stored notification (read, unread AND dismissed), only for the caller.
//   cd backend && npm run test:history
const os = require('os'), path = require('path'), fs = require('fs'), stamp = Date.now() + '_' + process.pid;
process.env.NODE_ENV = 'test'; process.env.SEED_DEMO = 'false'; process.env.DB_PATH = path.join(os.tmpdir(), `lj_nh_${stamp}.db`);
const { test, after } = require('node:test'), assert = require('node:assert/strict');
const db = require('../database/db'), NT = require('../controllers/notifications');
after(() => { try { db.close && db.close(); } catch { /* ignore */ } for (const s of ['', '-wal', '-shm']) fs.rmSync(process.env.DB_PATH + s, { force: true }); });
const mk = n => db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(n, n.toLowerCase() + '@nh.local', 'x').lastInsertRowid;
const call = (fn, uid, body = {}) => { let out; fn({ user: { id: uid }, params: {}, body, query: {} }, { json: b => { out = b; }, status() { return this; } }); return out; };
const A = mk('Ann'), B = mk('Ben');
const item = (id, at, extra = {}) => ({ id, kind: 'due', title: 'Title ' + id, body: 'Body', to: '/assignments', at, ...extra });

test('history is empty for a new user', () => { assert.deepEqual(call(NT.list, A).notifications, []); });
test('history keeps unread, read and dismissed notifications with created_at', () => {
  call(NT.sync, A, { items: [item('a', 1), item('b', 2), item('c', 3)] });
  call(NT.read, A, { ids: ['b'] }); call(NT.clear, A, { ids: ['c'] });
  const h = call(NT.list, A).notifications, by = Object.fromEntries(h.map(x => [x.id, x]));
  assert.equal(h.length, 3);
  assert.deepEqual([by.a.read, by.a.cleared], [false, false]); assert.deepEqual([by.b.read, by.b.cleared], [true, false]); assert.deepEqual([by.c.read, by.c.cleared], [true, true]);
  assert.ok(h.every(x => typeof x.created_at === 'string' && x.created_at.length >= 19));
});
test('notifications that no longer exist in live data stay in history', () => {
  call(NT.sync, A, { items: [item('d', 4)] }); // a, b, c are no longer generated
  assert.deepEqual(call(NT.list, A).notifications.map(x => x.id).sort(), ['a', 'b', 'c', 'd']);
});
test('history is private to each user', () => {
  call(NT.sync, B, { items: [item('z', 9)] });
  assert.deepEqual(call(NT.list, B).notifications.map(x => x.id), ['z']);
  assert.ok(!call(NT.list, A).notifications.some(x => x.id === 'z'));
});
