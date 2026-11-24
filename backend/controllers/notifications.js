// Permanent notification storage. Notifications (and whether each one is read / dismissed) live in the `notifications` table, per user,
// so they survive page refresh, logout and switching browsers. The header bell builds notifications from live data as before and
// syncs them here; this controller only stores and returns them. It never touches any other table.
//   GET  /api/notifications         -> { notifications: [...] }  every stored notification for me (newest first)
//   POST /api/notifications/sync    -> body { items:[{id,kind,title,body,to,at,tag}], read?:[ids], cleared?:[ids] }  upsert; returns the stored list.
//                                     Existing rows keep their read/cleared state (only the text is refreshed). `read` / `cleared` (optional)
//                                     are applied once, so state saved in the browser by older versions is carried into the database.
//   PUT  /api/notifications/read    -> body { ids:[...] } or { all:true }   mark read
//   PUT  /api/notifications/clear   -> body { ids:[...] }                   dismiss (kept in the database, never shown again)
//   GET  /api/notifications/stream  -> Server-Sent Events (real time). Sends `ready` on connect, `refresh` the moment something may have changed
//                                     (another tab synced / read / cleared, a write happened, someone liked or commented on my post) and a `ping` heartbeat.
//                                     The client reloads its notifications on `refresh`. Auth uses the normal Authorization header (the token is never put in a URL).
const db = require('../database/db'), hub = require('../lib/notifyHub');
const HEARTBEAT_MS = 25000;
const MAX_ITEMS = 300, MAX_IDS = 500, KEEP_DAYS = 90;
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const ids = v => (Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string' && x && x.length <= 200))].slice(0, MAX_IDS) : []);
const shape = r => ({ id: r.notif_id, kind: r.kind, title: r.title, body: r.body, to: r.link, tag: r.tag || undefined, at: r.notif_at, read: !!r.is_read, cleared: !!r.is_cleared, created_at: r.created_at });
const list = uid => db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY notif_at DESC, id DESC LIMIT 1000').all(uid).map(shape);

exports.list = (req, res) => res.json({ notifications: list(req.user.id) });

exports.sync = (req, res) => {
  const uid = req.user.id, b = req.body || {}, items = Array.isArray(b.items) ? b.items.slice(0, MAX_ITEMS) : [];
  const up = db.prepare(`INSERT INTO notifications(user_id,notif_id,kind,title,body,link,tag,notif_at) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,notif_id) DO UPDATE SET kind=excluded.kind,title=excluded.title,body=excluded.body,link=excluded.link,tag=excluded.tag,notif_at=excluded.notif_at,updated_at=CURRENT_TIMESTAMP`);
  db.transaction(() => {
    for (const i of items) {
      if (!i || typeof i.id !== 'string' || !i.id || i.id.length > 200) continue;
      const at = Number(i.at); up.run(uid, i.id, str(i.kind, 40), str(i.title, 300), str(i.body, 500), str(i.to, 200), str(i.tag, 40), Number.isFinite(at) ? Math.round(at) : 0);
    }
    // one-time import of read / cleared state that older versions kept in the browser
    const mark = (col, list) => { for (const id of list) db.prepare(`UPDATE notifications SET ${col}=1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND notif_id=?`).run(uid, id); };
    mark('is_read', ids(b.read)); mark('is_cleared', ids(b.cleared));
    // housekeeping: dismissed notifications older than KEEP_DAYS are dropped; nothing else is ever deleted
    db.prepare("DELETE FROM notifications WHERE user_id=? AND is_cleared=1 AND updated_at<datetime('now',?)").run(uid, `-${KEEP_DAYS} days`);
  })();
  hub.publish(uid, 'refresh', { reason: 'sync' }); // other open tabs / browsers of this user pick up the stored list at once
  res.json({ notifications: list(uid) });
};

const flag = col => (req, res) => {
  const uid = req.user.id, b = req.body || {};
  if (col === 'is_read' && b.all === true) db.prepare('UPDATE notifications SET is_read=1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND is_cleared=0').run(uid);
  else {
    const l = ids(b.ids); if (!l.length) return res.status(400).json({ error: 'ids required' });
    const st = db.prepare(`UPDATE notifications SET ${col}=1${col === 'is_cleared' ? ',is_read=1' : ''},updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND notif_id=?`);
    db.transaction(() => { for (const id of l) st.run(uid, id); })();
  }
  hub.publish(uid, 'refresh', { reason: col === 'is_read' ? 'read' : 'clear' });
  res.json({ notifications: list(uid) });
};
exports.read = flag('is_read'); exports.clear = flag('is_cleared');

// Real-time stream. One long-lived response per open tab; works behind Vite's dev proxy and nginx (X-Accel-Buffering: no).
exports.stream = (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  if (req.socket && req.socket.setTimeout) { req.socket.setTimeout(0); req.socket.setNoDelay(true); }
  res.write('retry: 3000\n\n' + hub.frame('ready', { at: Date.now() }));
  const off = hub.subscribe(req.user.id, res);
  const beat = setInterval(() => { if (!hub.safeWrite(res, hub.frame('ping', { at: Date.now() }))) done(); }, HEARTBEAT_MS);
  let closed = false; const done = () => { if (closed) return; closed = true; clearInterval(beat); off(); try { res.end(); } catch { /* ignore */ } };
  req.on('close', done); res.on('close', done); res.on('error', done);
};
