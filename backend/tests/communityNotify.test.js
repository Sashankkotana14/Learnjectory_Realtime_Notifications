// Contract test for Community like/comment notifications (GET /api/community/notifications).   cd backend && npm run test:commnotify
const os = require('os'), path = require('path'), fs = require('fs'), stamp = Date.now() + '_' + process.pid;
process.env.NODE_ENV = 'test'; process.env.SEED_DEMO = 'false'; process.env.DB_PATH = path.join(os.tmpdir(), `lj_cn_${stamp}.db`);
const { test, after } = require('node:test'), assert = require('node:assert/strict');
const db = require('../database/db'), CM = require('../controllers/community'), CN = require('../controllers/communityNotify');
after(() => { try { db.close && db.close(); } catch { /* ignore */ } for (const s of ['', '-wal', '-shm']) fs.rmSync(process.env.DB_PATH + s, { force: true }); });
const mk = n => db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(n, n.toLowerCase() + '@cn.local', 'x').lastInsertRowid;
const call = (fn, uid, params = {}, body = {}) => { let out, code = 200; fn({ user: { id: uid }, params, body, query: {} }, { json: b => { out = b; }, status(c) { code = c; return this; } }); return { out, code }; };
const feed = uid => call(CN.list, uid).out.notifications;
const A = mk('Alice'), B = mk('Bob'), C = mk('Carol');
const post = call(CM.create, A, {}, { kind: 'question', title: 'How do I center a div?', content: 'Please help' }).out.id;

test('a fresh user has no community notifications', () => { assert.deepEqual(feed(A), []); });
test('a like on my post notifies me, with who and which post', () => {
  call(CM.likePost, B, { id: post });
  const n = feed(A); assert.equal(n.length, 1);
  assert.equal(n[0].type, 'like'); assert.equal(n[0].target, 'post'); assert.equal(n[0].actor, 'Bob'); assert.equal(n[0].post_id, post); assert.equal(n[0].post_title, 'How do I center a div?');
});
test('un-liking removes the notification (it follows real activity)', () => { call(CM.likePost, B, { id: post }); assert.equal(feed(A).length, 0); });
test('a comment/answer on my post notifies me', () => {
  const cid = call(CM.addComment, B, { id: post }, { body: 'Use flexbox: display:flex; justify-content:center' }).out.id;
  const n = feed(A); assert.equal(n.length, 1); assert.equal(n[0].type, 'comment'); assert.equal(n[0].actor, 'Bob'); assert.match(n[0].text, /flexbox/); assert.equal(n[0].id, 'cc:' + cid);
});
test('a like on my comment notifies the comment author, not the post author', () => {
  const cid = call(CM.addComment, C, { id: post }, { body: 'Try grid' }).out.id;
  call(CM.likeComment, A, { id: cid });
  const n = feed(C); assert.equal(n.length, 1); assert.equal(n[0].type, 'like'); assert.equal(n[0].target, 'comment'); assert.equal(n[0].actor, 'Alice'); assert.equal(n[0].text, 'Try grid');
  assert.equal(feed(A).filter(x => x.type === 'like').length, 0);
});
test('my own likes and comments never notify me', () => {
  call(CM.likePost, A, { id: post }); call(CM.addComment, A, { id: post }, { body: 'thanks all' });
  assert.equal(feed(A).filter(x => x.actor === 'Alice').length, 0);
});
test('users only see activity on their own content; deleting a comment removes its notification', () => {
  assert.equal(feed(B).length, 0);
  const cid = Number(feed(A).find(x => x.type === 'comment' && x.actor === 'Carol').id.split(':')[1]);
  call(CM.removeComment, C, { id: cid }); assert.ok(!feed(A).some(x => x.id === 'cc:' + cid));
});
test('activity older than 14 days is not listed', () => {
  db.prepare("UPDATE community_comments SET created_at=datetime('now','-20 days') WHERE user_id=?").run(B);
  assert.equal(feed(A).filter(x => x.type === 'comment').length, 0);
});
