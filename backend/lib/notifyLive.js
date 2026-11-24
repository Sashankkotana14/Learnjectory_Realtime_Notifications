// Decides WHO should be told to refresh their notifications after a successful write request, and tells them through notifyHub.
// It only reads (to find a post / comment owner) and never writes to the database or changes any response.
//   - the person who made the change: their other open tabs/browsers update at once (goals, habits, assignments, achievements unlocked by the change, ...)
//   - the owner of a community post / comment that someone else just liked, commented on, answered or accepted: their bell updates at once
const db = require('../database/db'), hub = require('./notifyHub');

const one = (sql, ...a) => { try { return db.prepare(sql).get(...a); } catch { return undefined; } };
// Owners (other than the actor) whose notifications may have changed because of this request.
function affectedOwners(method, path, actor) {
  const p = String(path || '').split('?')[0], out = new Set();
  let m;
  if ((m = /^\/community\/posts\/(\d+)\/(like|comments|solve|collab)$/.exec(p))) {
    const post = one('SELECT user_id FROM community_posts WHERE id=?', Number(m[1])); if (post) out.add(post.user_id);
    if (m[2] === 'solve' && method === 'POST') { // accepting an answer notifies that answer's author, which can be anyone
      for (const r of (() => { try { return db.prepare('SELECT DISTINCT user_id FROM community_comments WHERE post_id=?').all(Number(m[1])); } catch { return []; } })()) out.add(r.user_id);
    }
  } else if ((m = /^\/community\/comments\/(\d+)(\/like)?$/.exec(p))) {
    const c = one('SELECT user_id, post_id FROM community_comments WHERE id=?', Number(m[1]));
    if (c) { out.add(c.user_id); const post = one('SELECT user_id FROM community_posts WHERE id=?', c.post_id); if (post) out.add(post.user_id); }
  }
  out.delete(actor); return [...out];
}

// Called once per finished request. `ok` = the request succeeded. Never throws.
function afterWrite(req, statusCode) {
  try {
    if (!req.user || req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS' || statusCode >= 400) return;
    const path = (req.originalUrl || req.url || '').replace(/^\/api/, '');
    if (/^\/notifications(\/|$)/.test(path)) return; // notification state changes publish themselves (see controllers/notifications.js)
    hub.publish(req.user.id, 'refresh', { reason: 'write' });
    for (const uid of affectedOwners(req.method, path, req.user.id)) hub.publish(uid, 'refresh', { reason: 'community' });
  } catch (e) { console.error('live notify failed', e.message); }
}
module.exports = { afterWrite, affectedOwners };
