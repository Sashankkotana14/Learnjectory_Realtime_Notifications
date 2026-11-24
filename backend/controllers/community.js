// Community: posts (discussion / question / collaboration / resource / showcase / announcement), comments & answers, likes, solved questions, collaboration requests.
// Posts are readable by every signed-in student; only the author may edit/delete a post, only a comment's author may edit/delete it,
// only a question's author may mark an answer as accepted, and only a collaboration post's author may accept/decline join requests.
const db = require('../database/db');
const one = (s, ...a) => db.prepare(s).get(...a), all = (s, ...a) => db.prepare(s).all(...a);
const log = (uid, m) => db.prepare('INSERT INTO activity_logs(user_id,message) VALUES(?,?)').run(uid, m);
const bad = (res, error, status = 400) => res.status(status).json({ error });
const CATEGORIES = ['General', 'Study Help', 'Career', 'Projects', 'Resources', 'Opportunities', 'Tech'], KINDS = ['discussion', 'question', 'collaboration', 'resource', 'showcase', 'announcement'], COLLAB = ['pending', 'accepted', 'declined'];
const tagList = s => String(s || '').split(',').map(t => t.trim()).filter(Boolean);
function cleanTags(v, max, len) {
  const seen = new Set(), out = [];
  for (const t of Array.isArray(v) ? v.map(String) : tagList(v)) { const x = t.trim(); if (!x) continue; if (x.length > len) return { error: `each item must be ${len} characters or less` }; if (!seen.has(x.toLowerCase())) { seen.add(x.toLowerCase()); out.push(x); } }
  return out.length > max ? { error: `at most ${max} items allowed` } : { list: out };
}
const Q = { // per-viewer decorated post row
  sql: `SELECT p.*, u.name AS author_name,
    (SELECT COUNT(*) FROM community_likes l WHERE l.target_type='post' AND l.target_id=p.id) AS like_count,
    (SELECT COUNT(*) FROM community_likes l WHERE l.target_type='post' AND l.target_id=p.id AND l.user_id=?) AS liked,
    (SELECT COUNT(*) FROM community_comments c WHERE c.post_id=p.id) AS comment_count,
    (SELECT COUNT(*) FROM community_collab k WHERE k.post_id=p.id AND k.status='accepted') AS members_count,
    (SELECT status FROM community_collab k WHERE k.post_id=p.id AND k.user_id=?) AS my_request
   FROM community_posts p LEFT JOIN users u ON u.id=p.user_id`,
};
const postView = (p, uid) => ({ id: p.id, title: p.title || '', content: p.content, category: p.category || 'General', kind: p.kind || 'discussion', tags_list: tagList(p.tags), skills_needed_list: tagList(p.skills_needed),
  created_at: p.created_at, updated_at: p.updated_at, author: { id: p.user_id, name: p.author_name || 'Student' }, is_mine: p.user_id === uid, like_count: p.like_count, liked: !!p.liked, comment_count: p.comment_count,
  link_url: p.link_url || '', solved: !!p.solved, accepted_comment_id: p.accepted_comment_id, collab_open: !!p.collab_open, max_members: p.max_members, members_count: p.members_count, my_request: p.my_request || null });
const getPost = (id, uid) => one(Q.sql + ' WHERE p.id=?', uid, uid, id);

function parsePost(b, old) {
  const out = {};
  const kind = old ? old.kind || 'discussion' : String(b.kind || 'discussion');
  if (!old && !KINDS.includes(kind)) return { error: `kind must be one of: ${KINDS.join(', ')}` };
  if (old && b.kind !== undefined && b.kind !== kind) return { error: 'The type of a post cannot be changed after it is created' };
  if (!old) out.kind = kind;
  if (b.title !== undefined || !old) { const t = String(b.title ?? '').trim().replace(/\s+/g, ' ').slice(0, 150); if (kind !== 'discussion' && !t) return { error: kind === 'resource' || kind === 'showcase' || kind === 'announcement' ? `A title is required for ${kind} posts` : 'A title is required for questions and collaboration posts' }; out.title = t; }
  if (b.content !== undefined || !old) { const c = String(b.content ?? '').trim(); if (!c) return { error: 'content is required' }; if (c.length > 5000) return { error: 'content must be 5000 characters or less' }; out.content = c; }
  if (b.category !== undefined || !old) { const c = String(b.category ?? 'General'); if (!CATEGORIES.includes(c)) return { error: `category must be one of: ${CATEGORIES.join(', ')}` }; out.category = c; }
  if (b.tags !== undefined) { const t = cleanTags(b.tags, 5, 30); if (t.error) return { error: 'tags: ' + t.error }; out.tags = t.list.join(','); }
  if (kind === 'resource' || kind === 'showcase') { // link: required for a shared resource, optional (repo / live demo) for a project showcase
    if (b.link_url !== undefined || (!old && kind === 'resource')) {
      const u = String(b.link_url ?? '').trim();
      if (!u) { if (kind === 'resource') return { error: 'A link is required for resource posts' }; out.link_url = ''; }
      else { let ok = false; try { const x = new URL(u); ok = x.protocol === 'http:' || x.protocol === 'https:'; } catch (e) { /* invalid */ } if (!ok || u.length > 500) return { error: 'link_url must be a valid http(s) link (500 characters or less)' }; out.link_url = u; }
    }
  }
  if (kind === 'collaboration') {
    if (b.skills_needed !== undefined) { const t = cleanTags(b.skills_needed, 10, 40); if (t.error) return { error: 'skills_needed: ' + t.error }; out.skills_needed = t.list.join(','); }
    if (b.max_members !== undefined && b.max_members !== null && b.max_members !== '') { const n = Number(b.max_members); if (!Number.isInteger(n) || n < 2 || n > 20) return { error: 'max_members must be a whole number between 2 and 20' }; out.max_members = n; } else if (b.max_members !== undefined) out.max_members = null;
    if (b.collab_open !== undefined) out.collab_open = b.collab_open ? 1 : 0;
  }
  return { out };
}
exports.meta = (req, res) => res.json({ categories: CATEGORIES, kinds: KINDS });

exports.list = (req, res) => {
  const uid = req.user.id, q = req.query, where = [], args = [uid, uid];
  if (q.category && CATEGORIES.includes(q.category)) { where.push('p.category=?'); args.push(q.category); }
  if (q.kind && KINDS.includes(q.kind)) { where.push('p.kind=?'); args.push(q.kind); }
  if (q.mine === 'true' || q.mine === '1') { where.push('p.user_id=?'); args.push(uid); }
  if (q.solved === '1' || q.solved === 'true') where.push('p.solved=1'); else if (q.solved === '0' || q.solved === 'false') { where.push("p.kind='question' AND p.solved=0"); }
  if (q.q) { const like = `%${String(q.q).slice(0, 100).replace(/[%_\\]/g, m => '\\' + m)}%`; where.push("(p.title LIKE ? ESCAPE '\\' OR p.content LIKE ? ESCAPE '\\' OR p.tags LIKE ? ESCAPE '\\')"); args.push(like, like, like); }
  const order = q.sort === 'popular' ? 'like_count + comment_count DESC, p.id DESC' : q.sort === 'unanswered' ? 'p.id DESC' : 'p.id DESC';
  if (q.sort === 'unanswered') where.push("p.kind='question' AND (SELECT COUNT(*) FROM community_comments c WHERE c.post_id=p.id)=0");
  const limit = Math.min(50, Math.max(1, parseInt(q.limit, 10) || 20)), page = Math.max(1, parseInt(q.page, 10) || 1), w = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const total = one(`SELECT COUNT(*) n FROM community_posts p${w}`, ...args.slice(2)).n;
  const rows = all(`${Q.sql}${w} ORDER BY ${order} LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
  res.json({ posts: rows.map(p => postView(p, uid)), total, page, pages: Math.ceil(total / limit) || 1 });
};
exports.get = (req, res) => {
  const uid = req.user.id, p = getPost(Number(req.params.id), uid); if (!p) return bad(res, 'Post not found', 404);
  const comments = all(`SELECT c.*, u.name AS author_name,
      (SELECT COUNT(*) FROM community_likes l WHERE l.target_type='comment' AND l.target_id=c.id) AS like_count,
      (SELECT COUNT(*) FROM community_likes l WHERE l.target_type='comment' AND l.target_id=c.id AND l.user_id=?) AS liked
    FROM community_comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.post_id=? ORDER BY c.id`, uid, p.id)
    .map(c => ({ id: c.id, body: c.body, created_at: c.created_at, updated_at: c.updated_at, author: { id: c.user_id, name: c.author_name || 'Student' }, is_mine: c.user_id === uid, like_count: c.like_count, liked: !!c.liked, accepted: p.accepted_comment_id === c.id }))
    .sort((a, b) => (b.accepted ? 1 : 0) - (a.accepted ? 1 : 0));
  const out = { ...postView(p, uid), comments };
  if (p.kind === 'collaboration') {
    const reqs = all('SELECT k.*, u.name AS user_name FROM community_collab k LEFT JOIN users u ON u.id=k.user_id WHERE k.post_id=? ORDER BY k.id', p.id);
    out.members = reqs.filter(r => r.status === 'accepted').map(r => ({ id: r.user_id, name: r.user_name }));
    // request details (messages) are private: the post's author sees all of them, everyone else only their own
    out.requests = reqs.filter(r => p.user_id === uid || r.user_id === uid).map(r => ({ id: r.id, user: { id: r.user_id, name: r.user_name }, message: r.message, status: r.status, created_at: r.created_at, is_mine: r.user_id === uid }));
  }
  res.json(out);
};
exports.create = (req, res) => {
  const { out, error } = parsePost(req.body || {}, null); if (error) return bad(res, error);
  const k = Object.keys(out), id = db.prepare(`INSERT INTO community_posts(user_id,${k}) VALUES(?,${k.map(() => '?')})`).run(req.user.id, ...k.map(c => out[c])).lastInsertRowid;
  log(req.user.id, `Posted "${(out.title || out.content).slice(0, 40)}" - Community`);
  res.status(201).json(postView(getPost(id, req.user.id), req.user.id));
};
exports.update = (req, res) => {
  const id = Number(req.params.id), old = one('SELECT * FROM community_posts WHERE id=?', id); if (!old) return bad(res, 'Post not found', 404);
  if (old.user_id !== req.user.id) return bad(res, 'You can only edit your own posts', 403);
  const { out, error } = parsePost(req.body || {}, old); if (error) return bad(res, error);
  const k = Object.keys(out); if (k.length) db.prepare(`UPDATE community_posts SET ${k.map(c => c + '=?')},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...k.map(c => out[c]), id);
  res.json(postView(getPost(id, req.user.id), req.user.id));
};
exports.remove = (req, res) => {
  const id = Number(req.params.id), p = one('SELECT * FROM community_posts WHERE id=?', id); if (!p) return bad(res, 'Post not found', 404);
  if (p.user_id !== req.user.id) return bad(res, 'You can only delete your own posts', 403);
  db.exec('BEGIN');
  try {
    db.prepare("DELETE FROM community_likes WHERE target_type='comment' AND target_id IN (SELECT id FROM community_comments WHERE post_id=?)").run(id);
    db.prepare("DELETE FROM community_likes WHERE target_type='post' AND target_id=?").run(id);
    db.prepare('DELETE FROM community_comments WHERE post_id=?').run(id); db.prepare('DELETE FROM community_collab WHERE post_id=?').run(id); db.prepare('DELETE FROM community_posts WHERE id=?').run(id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  log(req.user.id, `Deleted post "${(p.title || p.content).slice(0, 40)}" - Community`);
  res.json({ ok: true });
};

// ---------- likes (toggle) ----------
function toggleLike(type, table) {
  return (req, res) => {
    const id = Number(req.params.id), row = one(`SELECT id FROM ${table} WHERE id=?`, id); if (!row) return bad(res, 'Not found', 404);
    const had = one('SELECT id FROM community_likes WHERE user_id=? AND target_type=? AND target_id=?', req.user.id, type, id);
    if (had) db.prepare('DELETE FROM community_likes WHERE id=?').run(had.id); else db.prepare('INSERT OR IGNORE INTO community_likes(user_id,target_type,target_id) VALUES(?,?,?)').run(req.user.id, type, id);
    res.json({ liked: !had, like_count: one('SELECT COUNT(*) n FROM community_likes WHERE target_type=? AND target_id=?', type, id).n });
  };
}
exports.likePost = toggleLike('post', 'community_posts'); exports.likeComment = toggleLike('comment', 'community_comments');

// ---------- comments / answers ----------
exports.addComment = (req, res) => {
  const p = one('SELECT * FROM community_posts WHERE id=?', Number(req.params.id)); if (!p) return bad(res, 'Post not found', 404);
  const body = String((req.body || {}).body ?? '').trim(); if (!body) return bad(res, 'Comment cannot be empty'); if (body.length > 2000) return bad(res, 'Comment must be 2000 characters or less');
  const id = db.prepare('INSERT INTO community_comments(post_id,user_id,body) VALUES(?,?,?)').run(p.id, req.user.id, body).lastInsertRowid;
  if (p.user_id !== req.user.id) log(p.user_id, `New ${p.kind === 'question' ? 'answer' : 'comment'} on "${(p.title || p.content).slice(0, 40)}" - Community`);
  res.status(201).json({ id, body, created_at: one('SELECT created_at FROM community_comments WHERE id=?', id).created_at, is_mine: true });
};
exports.updateComment = (req, res) => {
  const c = one('SELECT * FROM community_comments WHERE id=?', Number(req.params.id)); if (!c) return bad(res, 'Comment not found', 404);
  if (c.user_id !== req.user.id) return bad(res, 'You can only edit your own comments', 403);
  const body = String((req.body || {}).body ?? '').trim(); if (!body) return bad(res, 'Comment cannot be empty'); if (body.length > 2000) return bad(res, 'Comment must be 2000 characters or less');
  db.prepare('UPDATE community_comments SET body=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(body, c.id); res.json({ id: c.id, body });
};
exports.removeComment = (req, res) => {
  const c = one('SELECT c.*, p.user_id AS post_owner FROM community_comments c JOIN community_posts p ON p.id=c.post_id WHERE c.id=?', Number(req.params.id)); if (!c) return bad(res, 'Comment not found', 404);
  if (c.user_id !== req.user.id) return bad(res, 'You can only delete your own comments', 403);
  db.prepare("DELETE FROM community_likes WHERE target_type='comment' AND target_id=?").run(c.id); db.prepare('DELETE FROM community_comments WHERE id=?').run(c.id);
  db.prepare('UPDATE community_posts SET solved=0,accepted_comment_id=NULL WHERE id=? AND accepted_comment_id=?').run(c.post_id, c.id); // deleting the accepted answer re-opens the question
  res.json({ ok: true });
};

// ---------- questions: mark solved / re-open ----------
exports.solve = (req, res) => {
  const p = one('SELECT * FROM community_posts WHERE id=?', Number(req.params.id)); if (!p) return bad(res, 'Post not found', 404);
  if (p.user_id !== req.user.id) return bad(res, 'Only the author of a question can mark it as solved', 403);
  if (p.kind !== 'question') return bad(res, 'Only questions can be marked as solved');
  const cid = Number((req.body || {}).comment_id); if (!cid || !one('SELECT id FROM community_comments WHERE id=? AND post_id=?', cid, p.id)) return bad(res, 'Choose one of the answers on this question');
  db.prepare('UPDATE community_posts SET solved=1,accepted_comment_id=? WHERE id=?').run(cid, p.id);
  const c = one('SELECT user_id FROM community_comments WHERE id=?', cid); if (c.user_id !== req.user.id) log(c.user_id, `Your answer was accepted on "${(p.title || p.content).slice(0, 40)}" - Community`);
  res.json(postView(getPost(p.id, req.user.id), req.user.id));
};
exports.reopen = (req, res) => {
  const p = one('SELECT * FROM community_posts WHERE id=?', Number(req.params.id)); if (!p) return bad(res, 'Post not found', 404);
  if (p.user_id !== req.user.id) return bad(res, 'Only the author of a question can re-open it', 403);
  db.prepare('UPDATE community_posts SET solved=0,accepted_comment_id=NULL WHERE id=?').run(p.id); res.json(postView(getPost(p.id, req.user.id), req.user.id));
};

// ---------- collaboration ----------
exports.requestJoin = (req, res) => {
  const p = one('SELECT * FROM community_posts WHERE id=?', Number(req.params.id)); if (!p) return bad(res, 'Post not found', 404);
  if (p.kind !== 'collaboration') return bad(res, 'This post is not a collaboration request');
  if (p.user_id === req.user.id) return bad(res, 'You cannot request to join your own post');
  if (!p.collab_open) return bad(res, 'This collaboration is closed', 409);
  if (one('SELECT id FROM community_collab WHERE post_id=? AND user_id=?', p.id, req.user.id)) return bad(res, 'You already sent a request for this post', 409);
  const msg = String((req.body || {}).message ?? '').trim().slice(0, 500);
  const id = db.prepare('INSERT INTO community_collab(post_id,user_id,message) VALUES(?,?,?)').run(p.id, req.user.id, msg).lastInsertRowid;
  log(p.user_id, `New collaboration request on "${(p.title || p.content).slice(0, 40)}" - Community`);
  res.status(201).json({ id, status: 'pending' });
};
exports.decide = (req, res) => {
  const k = one('SELECT k.*, p.user_id AS owner, p.max_members, p.title, p.content FROM community_collab k JOIN community_posts p ON p.id=k.post_id WHERE k.id=?', Number(req.params.id)); if (!k) return bad(res, 'Request not found', 404);
  if (k.owner !== req.user.id) return bad(res, 'Only the author of the post can accept or decline requests', 403);
  const status = String((req.body || {}).status || ''); if (!COLLAB.includes(status) || status === 'pending') return bad(res, 'status must be accepted or declined');
  if (status === 'accepted' && k.max_members && one("SELECT COUNT(*) n FROM community_collab WHERE post_id=? AND status='accepted'", k.post_id).n + 1 >= k.max_members && k.status !== 'accepted') return bad(res, 'The team is already full', 409);
  db.prepare('UPDATE community_collab SET status=?,decided_at=CURRENT_TIMESTAMP WHERE id=?').run(status, k.id);
  log(k.user_id, `Your request to join "${(k.title || k.content).slice(0, 40)}" was ${status} - Community`);
  res.json({ id: k.id, status });
};
exports.withdraw = (req, res) => { // the requester withdraws, or the post's author removes someone
  const k = one('SELECT k.*, p.user_id AS owner FROM community_collab k JOIN community_posts p ON p.id=k.post_id WHERE k.id=?', Number(req.params.id)); if (!k) return bad(res, 'Request not found', 404);
  if (k.user_id !== req.user.id && k.owner !== req.user.id) return bad(res, 'Not allowed', 403);
  db.prepare('DELETE FROM community_collab WHERE id=?').run(k.id); res.json({ ok: true });
};
