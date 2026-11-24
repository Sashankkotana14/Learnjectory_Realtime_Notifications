// Community notifications (read-only): likes and comments other students leave on MY posts / comments.
// Built straight from the real rows in community_likes / community_comments, so nothing is stored or invented:
// un-liking or deleting a comment removes its notification, and your own activity never notifies you.
// Used only by GET /api/community/notifications (consumed by the header bell). Never writes to the database.
const db = require('../database/db');
const all = (s, ...a) => db.prepare(s).all(...a);
const DAYS = 14, LIMIT = 50;
const label = p => String(p.title || p.content || '').replace(/\s+/g, ' ').trim().slice(0, 60);
const snippet = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 80);

exports.list = (req, res) => {
  const me = req.user.id, since = `-${DAYS} days`, out = [];
  // 1) someone liked my post
  for (const r of all(`SELECT l.id, l.created_at, u.name AS actor, p.id AS post_id, p.title, p.content, p.kind
      FROM community_likes l JOIN community_posts p ON l.target_type='post' AND p.id=l.target_id LEFT JOIN users u ON u.id=l.user_id
      WHERE p.user_id=? AND l.user_id<>? AND l.created_at>=datetime('now',?) ORDER BY l.id DESC LIMIT ?`, me, me, since, LIMIT))
    out.push({ id: `cl:p:${r.id}`, type: 'like', target: 'post', actor: r.actor || 'Someone', post_id: r.post_id, post_title: label(r), kind: r.kind || 'discussion', text: '', created_at: r.created_at });
  // 2) someone liked my comment / answer
  for (const r of all(`SELECT l.id, l.created_at, u.name AS actor, c.body, p.id AS post_id, p.title, p.content, p.kind
      FROM community_likes l JOIN community_comments c ON l.target_type='comment' AND c.id=l.target_id JOIN community_posts p ON p.id=c.post_id LEFT JOIN users u ON u.id=l.user_id
      WHERE c.user_id=? AND l.user_id<>? AND l.created_at>=datetime('now',?) ORDER BY l.id DESC LIMIT ?`, me, me, since, LIMIT))
    out.push({ id: `cl:c:${r.id}`, type: 'like', target: 'comment', actor: r.actor || 'Someone', post_id: r.post_id, post_title: label(r), kind: r.kind || 'discussion', text: snippet(r.body), created_at: r.created_at });
  // 3) someone commented on (or answered) my post
  for (const r of all(`SELECT c.id, c.created_at, c.body, u.name AS actor, p.id AS post_id, p.title, p.content, p.kind
      FROM community_comments c JOIN community_posts p ON p.id=c.post_id LEFT JOIN users u ON u.id=c.user_id
      WHERE p.user_id=? AND c.user_id<>? AND c.created_at>=datetime('now',?) ORDER BY c.id DESC LIMIT ?`, me, me, since, LIMIT))
    out.push({ id: `cc:${r.id}`, type: 'comment', target: 'post', actor: r.actor || 'Someone', post_id: r.post_id, post_title: label(r), kind: r.kind || 'discussion', text: snippet(r.body), created_at: r.created_at });
  out.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  res.json({ notifications: out.slice(0, LIMIT) });
};
