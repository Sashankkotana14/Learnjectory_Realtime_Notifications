// Contract test for permanent notification storage (/api/notifications).   cd backend && npm run test:notifstore
const os = require('os'), path = require('path'), fs = require('fs'), stamp = Date.now() + '_' + process.pid;
process.env.NODE_ENV = 'test'; process.env.SEED_DEMO = 'false'; process.env.DB_PATH = path.join(os.tmpdir(), `lj_ns_${stamp}.db`);
const { test, after } = require('node:test'), assert = require('node:assert/strict');
const db = require('../database/db'), NT = require('../controllers/notifications');
after(() => { try { db.close && db.close(); } catch { /* ignore */ } for (const s of ['', '-wal', '-shm']) fs.rmSync(process.env.DB_PATH + s, { force: true }); });
const mk = n => db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(n, n.toLowerCase() + '@ns.local', 'x').lastInsertRowid;
const call = (fn, uid, body = {}) => { let out, code = 200; fn({ user: { id: uid }, params: {}, body, query: {} }, { json: b => { out = b; }, status(c) { code = c; return this; } }); return { out, code }; };
const A = mk('Alice'), B = mk('Bob');
const n1 = { id: 'as:1:overdue', kind: 'overdue', title: 'Essay is overdue', body: 'Was due 2 days ago', to: '/assignments', at: 1000 };
const n2 = { id: 'goal:2:2026-12-01', kind: 'goal-due', title: 'Goal due tomorrow: Ship', body: '40% done', to: '/goals', at: 2000, tag: 'Tomorrow' };
const get = (uid, id) => call(NT.list, uid).out.notifications.find(x => x.id === id);

test('table exists and starts empty', () => { assert.deepEqual(call(NT.list, A).out.notifications, []); });
test('sync stores notifications in the database', () => {
  const r = call(NT.sync, A, { items: [n1, n2] }).out.notifications; assert.equal(r.length, 2);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=?').get(A).c, 2);
  assert.equal(get(A, n1.id).title, 'Essay is overdue'); assert.equal(get(A, n2.id).tag, 'Tomorrow'); assert.equal(get(A, n1.id).read, false);
});
test('syncing again does not duplicate and refreshes text only', () => {
  call(NT.sync, A, { items: [{ ...n1, title: 'Essay is overdue (3d)' }, n2] });
  assert.equal(call(NT.list, A).out.notifications.length, 2); assert.equal(get(A, n1.id).title, 'Essay is overdue (3d)');
});
test('mark read persists and survives later syncs ("refresh")', () => {
  call(NT.read, A, { ids: [n1.id] }); assert.equal(get(A, n1.id).read, true); assert.equal(get(A, n2.id).read, false);
  call(NT.sync, A, { items: [n1, n2] }); assert.equal(get(A, n1.id).read, true);
});
test('dismiss persists, also marks read, and survives later syncs', () => {
  call(NT.clear, A, { ids: [n2.id] }); const x = get(A, n2.id); assert.equal(x.cleared, true); assert.equal(x.read, true);
  call(NT.sync, A, { items: [n1, n2] }); assert.equal(get(A, n2.id).cleared, true);
});
test('state is per user and still there after "logout/login" (data lives in the database, not the session)', () => {
  call(NT.sync, B, { items: [n1] }); assert.equal(get(B, n1.id).read, false); assert.equal(get(A, n1.id).read, true);
  assert.equal(call(NT.list, A).out.notifications.length, 2);
});
test('mark all read', () => { call(NT.sync, B, { items: [n1, n2] }); call(NT.read, B, { all: true }); assert.ok(call(NT.list, B).out.notifications.every(x => x.read)); });
test('one-time import of state saved in the browser by older versions', () => {
  call(NT.sync, B, { items: [{ ...n1, id: 'x:1' }, { ...n1, id: 'x:2' }], read: ['x:1'], cleared: ['x:2', 'unknown'] });
  assert.equal(get(B, 'x:1').read, true); assert.equal(get(B, 'x:1').cleared, false); assert.equal(get(B, 'x:2').cleared, true);
});
test('bad input is rejected or ignored safely', () => {
  assert.equal(call(NT.clear, A, {}).code, 400); assert.equal(call(NT.read, A, { ids: [] }).code, 400);
  const before = call(NT.list, A).out.notifications.length; call(NT.sync, A, { items: [null, { id: 5 }, { title: 'no id' }, 'x'] }); assert.equal(call(NT.list, A).out.notifications.length, before);
});
test('cleared notifications older than 90 days are purged; unread ones are kept', () => {
  db.prepare("UPDATE notifications SET updated_at=datetime('now','-100 days') WHERE user_id=? AND notif_id=?").run(A, n2.id);
  call(NT.sync, A, { items: [] }); assert.equal(get(A, n2.id), undefined); assert.ok(get(A, n1.id));
});
test('deleting the account removes its notifications (ON DELETE CASCADE)', () => {
  db.prepare('DELETE FROM users WHERE id=?').run(B); assert.equal(db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=?').get(B).c, 0);
});
