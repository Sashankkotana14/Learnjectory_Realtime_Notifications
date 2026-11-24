// Contract test for real-time notifications (Server-Sent Events).   cd backend && npm run test:live
// Runs the real stream controller over a real HTTP server (no Express needed) and checks that events arrive instantly.
const os = require('os'), path = require('path'), fs = require('fs'), http = require('http'), stamp = Date.now() + '_' + process.pid;
process.env.NODE_ENV = 'test'; process.env.SEED_DEMO = 'false'; process.env.DB_PATH = path.join(os.tmpdir(), `lj_live_${stamp}.db`);
const { test, after } = require('node:test'), assert = require('node:assert/strict');
const db = require('../database/db'), NT = require('../controllers/notifications'), hub = require('../lib/notifyHub'), live = require('../lib/notifyLive');
const mk = n => db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(n, n.toLowerCase() + '@lv.local', 'x').lastInsertRowid;
const A = mk('Alice'), B = mk('Bob'), C = mk('Cara');

// tiny server: "Bearer <uid>" is the token; /stream -> NT.stream, POST /write?path=... -> simulates a finished write request
const server = http.createServer((req, res) => {
  const uid = Number((req.headers.authorization || '').replace('Bearer ', '')); if (!uid) { res.writeHead(401); return res.end('{}'); }
  req.user = { id: uid };
  if (req.url === '/api/notifications/stream') return NT.stream(req, res);
  const u = new URL(req.url, 'http://x'); res.writeHead(200); res.end('{}');
  live.afterWrite({ user: req.user, method: req.method, originalUrl: u.searchParams.get('path') || req.url }, 200);
});
let port; const ready = new Promise(r => server.listen(0, '127.0.0.1', () => { port = server.address().port; r(); }));
after(() => { hub.reset(); server.closeAllConnections && server.closeAllConnections(); server.close(); try { db.close && db.close(); } catch { /* ignore */ } for (const s of ['', '-wal', '-shm']) fs.rmSync(process.env.DB_PATH + s, { force: true }); });

// open a stream; collects parsed events; wait(name) resolves when an event of that name arrives
function open(uid) {
  const events = [], waiters = []; let buf = '', req, res0;
  const p = new Promise((resolve, reject) => {
    req = http.request({ host: '127.0.0.1', port, path: '/api/notifications/stream', headers: { Authorization: 'Bearer ' + uid } }, res => {
      res0 = res; res.setEncoding('utf8');
      res.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const raw = buf.slice(0, i); buf = buf.slice(i + 2); const ev = /^event: (.+)$/m.exec(raw), da = /^data: (.+)$/m.exec(raw); if (ev) { const e = { event: ev[1], data: da ? JSON.parse(da[1]) : {} }; events.push(e); waiters.slice().forEach(w => w(e)); } } });
      resolve();
    }); req.on('error', reject); req.end();
  });
  const wait = (name, ms = 1500) => new Promise((ok, no) => { const have = events.find(e => e.event === name && !e.seen); if (have) { have.seen = true; return ok(have); } const t = setTimeout(() => no(new Error('timeout waiting for ' + name)), ms); const w = e => { if (e.event === name) { e.seen = true; clearTimeout(t); waiters.splice(waiters.indexOf(w), 1); ok(e); } }; waiters.push(w); });
  const silent = async ms => { await new Promise(r => setTimeout(r, ms)); return events.filter(e => e.event === 'refresh' && !e.seen).length === 0; };
  return p.then(() => ({ events, wait, silent, close: () => { req.destroy(); } , status: () => res0.statusCode, headers: () => res0.headers }));
}
const post = (uid, p) => new Promise((ok, no) => { const r = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/x?path=' + encodeURIComponent(p), headers: { Authorization: 'Bearer ' + uid } }, res => { res.resume(); res.on('end', ok); }); r.on('error', no); r.end(); });
const tick = ms => new Promise(r => setTimeout(r, ms));

test('stream requires login', async () => { await ready; await new Promise(ok => http.get({ host: '127.0.0.1', port, path: '/api/notifications/stream' }, res => { assert.equal(res.statusCode, 401); res.resume(); ok(); })); });
test('stream opens as text/event-stream and sends `ready` immediately', async () => {
  const s = await open(A); assert.equal(s.status(), 200); assert.match(s.headers()['content-type'], /text\/event-stream/); assert.match(s.headers()['cache-control'], /no-cache/);
  assert.equal((await s.wait('ready')).event, 'ready'); assert.equal(hub.stats().connections, 1); s.close(); await tick(80); assert.equal(hub.stats().connections, 0);
});
test('hub.publish reaches every open tab of that user, and only that user', async () => {
  const a1 = await open(A), a2 = await open(A), b = await open(B); await a1.wait('ready'); await a2.wait('ready'); await b.wait('ready');
  assert.equal(hub.publish(A, 'refresh', { reason: 't' }), 2);
  assert.equal((await a1.wait('refresh')).data.reason, 't'); await a2.wait('refresh'); assert.ok(await b.silent(100));
  [a1, a2, b].forEach(x => x.close()); await tick(80);
});
test('a successful write by Alice refreshes her other tabs instantly (no polling)', async () => {
  const a = await open(A); await a.wait('ready'); const t0 = Date.now(); await post(A, '/api/goals'); const e = await a.wait('refresh'); assert.equal(e.data.reason, 'write'); assert.ok(Date.now() - t0 < 500); a.close(); await tick(50);
});
test('reads (GET) and the notification endpoints themselves do not echo', async () => {
  const a = await open(A); await a.wait('ready');
  live.afterWrite({ user: { id: A }, method: 'GET', originalUrl: '/api/goals' }, 200);
  live.afterWrite({ user: { id: A }, method: 'POST', originalUrl: '/api/notifications/sync' }, 200);
  live.afterWrite({ user: { id: A }, method: 'POST', originalUrl: '/api/goals' }, 500);
  assert.ok(await a.silent(120)); a.close(); await tick(50);
});
test('sync / read / clear publish to the user\'s other tabs', async () => {
  const a = await open(A); await a.wait('ready'); const res = { json() {}, status() { return this; } };
  NT.sync({ user: { id: A }, body: { items: [{ id: 'g:1', kind: 'goal-due', title: 'T', body: 'b', to: '/goals', at: 1 }] } }, res); assert.equal((await a.wait('refresh')).data.reason, 'sync');
  NT.read({ user: { id: A }, body: { ids: ['g:1'] } }, res); assert.equal((await a.wait('refresh')).data.reason, 'read');
  NT.clear({ user: { id: A }, body: { ids: ['g:1'] } }, res); assert.equal((await a.wait('refresh')).data.reason, 'clear'); a.close(); await tick(50);
});
test('a like / comment on Alice\'s post instantly notifies Alice (not the actor Bob)', async () => {
  const post_id = db.prepare("INSERT INTO community_posts(user_id,content,title) VALUES(?,?,?)").run(A, 'hello', 'My post').lastInsertRowid;
  const a = await open(A), b = await open(B); await a.wait('ready'); await b.wait('ready');
  await post(B, `/api/community/posts/${post_id}/like`); assert.equal((await a.wait('refresh')).data.reason, 'community');
  await post(B, `/api/community/posts/${post_id}/comments`); await a.wait('refresh'); a.events.length = 0;
  const seenByB = b.events.filter(e => e.event === 'refresh'); assert.equal(seenByB.filter(e => e.data.reason === 'community').length, 0, 'actor is not notified about own activity');
  [a, b].forEach(x => x.close()); await tick(50);
});
test('liking a comment notifies the comment author and the post owner', async () => {
  const pid = db.prepare("INSERT INTO community_posts(user_id,content,title) VALUES(?,?,?)").run(A, 'q', 'Q').lastInsertRowid;
  const cid = db.prepare('INSERT INTO community_comments(post_id,user_id,body) VALUES(?,?,?)').run(pid, C, 'answer').lastInsertRowid;
  assert.deepEqual(live.affectedOwners('POST', `/community/comments/${cid}/like`, B).sort(), [A, C].sort());
  assert.deepEqual(live.affectedOwners('POST', `/community/comments/${cid}/like`, C), [A]);
  assert.deepEqual(live.affectedOwners('POST', `/community/posts/${pid}/solve`, A), [C]);
  assert.deepEqual(live.affectedOwners('POST', '/community/posts/999999/like', B), []);
});
test('closing a tab removes it from the hub; dead connections never throw', async () => {
  const a = await open(A); await a.wait('ready'); a.close(); await tick(80); assert.equal(hub.stats().connections, 0); assert.equal(hub.publish(A, 'refresh', {}), 0);
});
test('per-user connection cap closes the oldest tab', async () => {
  const tabs = []; for (let i = 0; i < hub.MAX_PER_USER + 2; i++) { const t = await open(C); await t.wait('ready'); tabs.push(t); }
  await tick(80); assert.ok(hub.stats().connections <= hub.MAX_PER_USER); tabs.forEach(t => t.close()); await tick(80);
});
test('heartbeat `ping` keeps the connection alive', async () => {
  const frame = hub.frame('ping', { at: 1 }); assert.match(frame, /^event: ping\ndata: \{"at":1\}\n\n$/);
});
