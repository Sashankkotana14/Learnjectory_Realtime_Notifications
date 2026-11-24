// Career Compass: learning paths (Beginner/Intermediate/Advanced), lessons + resources, completion, study-hour logs, YouTube discovery
const db = require('../database/db'), U = require('../utils'), CT = require('../models/careerTemplates');
const one = (s, ...a) => db.prepare(s).get(...a), all = (s, ...a) => db.prepare(s).all(...a);
const log = (uid, m) => db.prepare('INSERT INTO activity_logs(user_id,message) VALUES(?,?)').run(uid, m);
const bad = (res, error, status = 400) => res.status(status).json({ error });
const TYPES = ['video', 'docs', 'article', 'course', 'book', 'other'];
const ytSearch = q => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
const okUrl = s => { try { return ['http:', 'https:'].includes(new URL(s).protocol); } catch { return false; } };
// YouTube helpers: extract an 11-char video id from watch / youtu.be / shorts / embed / live links
const VID = /^[A-Za-z0-9_-]{11}$/;
function videoId(s) {
  s = String(s || '').trim(); if (VID.test(s)) return s;
  try {
    const u = new URL(s), h = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
    if (h === 'youtu.be') { const id = u.pathname.split('/')[1]; return VID.test(id || '') ? id : null; }
    if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
      const v = u.searchParams.get('v'); if (VID.test(v || '')) return v;
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/); if (m) return m[1];
    }
  } catch { /* not a URL */ }
  return null;
}
const watchUrl = id => 'https://www.youtube.com/watch?v=' + id, thumbUrl = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const lessonView = (l, pathTitle) => ({ ...l, completed: !!l.completed, youtube_url: ytSearch((l.youtube_query || `${l.title} ${pathTitle || ''}`).trim()),
  video: l.video_id ? { id: l.video_id, title: l.video_title || '', channel: l.video_channel || '', thumbnail: l.video_thumbnail || thumbUrl(l.video_id), url: watchUrl(l.video_id), embed_url: 'https://www.youtube-nocookie.com/embed/' + l.video_id } : null });

function pathView(p, today = U.todayStr(), detail = false) {
  const lessons = all('SELECT * FROM career_lessons WHERE path_id=? ORDER BY position,id', p.id).map(l => lessonView(l, p.title));
  const logs = all('SELECT * FROM career_study_logs WHERE path_id=? ORDER BY log_date DESC,id DESC', p.id);
  const wk0 = U.weekStart(today), done = lessons.filter(l => l.completed).length;
  const stages = CT.STAGES.map(stage => { const ls = lessons.filter(l => l.stage === stage), d = ls.filter(l => l.completed).length; return { stage, total: ls.length, done: d, progress: ls.length ? Math.round(d / ls.length * 100) : 0, lessons: detail ? ls : undefined }; });
  const has = p.target_date && U.isDate(p.target_date), days = has ? U.daysBetween(today, p.target_date) : null, completed = lessons.length > 0 && done === lessons.length;
  const total = logs.reduce((s, x) => s + x.minutes, 0);
  const view = { id: p.id, title: p.title, description: p.description || '', target_date: p.target_date || '', template_key: p.template_key, created_at: p.created_at,
    lessons_total: lessons.length, lessons_done: done, progress: lessons.length ? Math.round(done / lessons.length * 100) : 0, stages, days_left: days,
    status: completed ? 'completed' : days !== null && days < 0 ? 'overdue' : 'active', study_minutes: total, study_minutes_week: logs.filter(x => x.log_date >= wk0).reduce((s, x) => s + x.minutes, 0),
    current_stage: (stages.find(s => s.total && s.done < s.total) || stages.filter(s => s.total).pop() || stages[0]).stage };
  if (detail) { view.logs = logs.slice(0, 30).map(x => ({ ...x, lesson_title: lessons.find(l => l.id === x.lesson_id)?.title || null })); view.stages = stages; }
  return view;
}
const summarize = (paths, uid, today = U.todayStr()) => ({
  paths: paths.length, active: paths.filter(p => p.status === 'active').length, completed: paths.filter(p => p.status === 'completed').length,
  lessonsTotal: paths.reduce((s, p) => s + p.lessons_total, 0), lessonsDone: paths.reduce((s, p) => s + p.lessons_done, 0),
  studyMinutes: paths.reduce((s, p) => s + p.study_minutes, 0), studyMinutesWeek: paths.reduce((s, p) => s + p.study_minutes_week, 0),
});
exports.forUser = uid => { const t = U.todayStr(); return all('SELECT * FROM career_paths WHERE user_id=? ORDER BY id DESC', uid).map(p => pathView(p, t)); };
exports.summarize = summarize;
exports.dashboard = uid => {
  const paths = exports.forUser(uid), s = summarize(paths);
  const open = paths.filter(p => p.status !== 'completed').sort((a, b) => (a.target_date || '9999').localeCompare(b.target_date || '9999'))[0];
  const next = open && one('SELECT l.id,l.title,l.stage,p.title path_title FROM career_lessons l JOIN career_paths p ON p.id=l.path_id WHERE l.path_id=? AND l.completed=0 ORDER BY l.position,l.id LIMIT 1', open.id);
  return { ...s, progress: s.lessonsTotal ? Math.round(s.lessonsDone / s.lessonsTotal * 100) : 0, nextLesson: next || null, topPath: open ? { id: open.id, title: open.title, progress: open.progress, current_stage: open.current_stage } : null };
};
const getPath = (uid, id) => one('SELECT * FROM career_paths WHERE id=? AND user_id=?', Number(id), uid);

exports.templates = (req, res) => res.json(Object.entries(CT.templates).map(([key, t]) => ({ key, title: t.title, description: t.description, lessons: CT.STAGES.reduce((n, s) => n + t.stages[s].length, 0) })));
exports.list = (req, res) => { const paths = exports.forUser(req.user.id); res.json({ paths, summary: summarize(paths), today: U.todayStr(), stages: CT.STAGES, resource_types: TYPES }); };
exports.get = (req, res) => { const p = getPath(req.user.id, req.params.id); p ? res.json(pathView(p, U.todayStr(), true)) : bad(res, 'Not found', 404); };

function parsePath(body, old) {
  const out = {}, today = U.todayStr();
  if (body.title !== undefined || !old) { const t = String(body.title ?? '').trim().slice(0, 200); if (!t) return { error: 'title is required' }; out.title = t; }
  if (body.description !== undefined) out.description = String(body.description ?? '').trim().slice(0, 1000);
  if (body.target_date !== undefined) {
    const d = body.target_date === null ? '' : String(body.target_date).trim();
    if (d !== '') { if (!U.isDate(d)) return { error: 'target_date must be a valid date (YYYY-MM-DD)' }; if (d < today && (!old || d !== old.target_date)) return { error: 'target_date cannot be in the past' }; }
    out.target_date = d || null;
  }
  return { out };
}
exports.create = (req, res) => {
  const { out, error } = parsePath(req.body || {}, null); const key = req.body.template || req.body.template_key || null;
  if (error) return bad(res, error);
  if (key && !CT.templates[key]) return bad(res, 'Unknown template');
  const t = key && CT.templates[key];
  const id = db.transaction(() => {
    const id = db.prepare('INSERT INTO career_paths(user_id,title,description,target_date,template_key) VALUES(?,?,?,?,?)').run(req.user.id, out.title, out.description ?? (t ? t.description : ''), out.target_date || null, key || null).lastInsertRowid;
    if (t) CT.instantiate(db, req.user.id, id, key);
    return id;
  })();
  log(req.user.id, `Added "${out.title.slice(0, 40)}" - Career path`);
  res.status(201).json(pathView(getPath(req.user.id, id), U.todayStr(), true));
};
exports.update = (req, res) => {
  const old = getPath(req.user.id, req.params.id); if (!old) return bad(res, 'Not found', 404);
  const { out, error } = parsePath(req.body || {}, old); if (error) return bad(res, error);
  const k = Object.keys(out); if (k.length) db.prepare(`UPDATE career_paths SET ${k.map(c => c + '=?')} WHERE id=?`).run(...k.map(c => out[c]), old.id);
  log(req.user.id, `Updated "${(out.title || old.title).slice(0, 40)}" - Career path`);
  res.json(pathView(getPath(req.user.id, old.id), U.todayStr(), true));
};
exports.remove = (req, res) => {
  const p = getPath(req.user.id, req.params.id); if (!p) return bad(res, 'Not found', 404);
  db.prepare('DELETE FROM career_paths WHERE id=?').run(p.id); // lessons + study logs cascade
  log(req.user.id, `Deleted "${p.title.slice(0, 40)}" - Career path`); res.json({ ok: true });
};

function parseLesson(body, old) {
  const out = {};
  if (body.title !== undefined || !old) { const t = String(body.title ?? '').trim().slice(0, 200); if (!t) return { error: 'title is required' }; out.title = t; }
  if (body.stage !== undefined || !old) { const s = String(body.stage ?? 'Beginner'); if (!CT.STAGES.includes(s)) return { error: `stage must be one of: ${CT.STAGES.join(', ')}` }; out.stage = s; }
  if (body.description !== undefined) out.description = String(body.description ?? '').trim().slice(0, 1000);
  if (body.youtube_query !== undefined) out.youtube_query = String(body.youtube_query ?? '').trim().slice(0, 150);
  if (body.resource_url !== undefined) { const u = String(body.resource_url ?? '').trim(); if (u && (u.length > 500 || !okUrl(u))) return { error: 'resource_url must be a valid http(s) link' }; out.resource_url = u; }
  if (body.resource_type !== undefined) { const t = String(body.resource_type || 'other'); if (!TYPES.includes(t)) return { error: `resource_type must be one of: ${TYPES.join(', ')}` }; out.resource_type = t; }
  if (body.est_minutes !== undefined) { const n = U.toInt(body.est_minutes === '' || body.est_minutes === null ? 0 : body.est_minutes); if (!Number.isInteger(n) || n < 0 || n > 6000) return { error: 'est_minutes must be a whole number between 0 and 6000' }; out.est_minutes = n; }
  return { out };
}
exports.addLesson = (req, res) => {
  const p = getPath(req.user.id, req.params.id); if (!p) return bad(res, 'Not found', 404);
  const { out, error } = parseLesson(req.body || {}, null); if (error) return bad(res, error);
  if (all('SELECT title,stage FROM career_lessons WHERE path_id=?', p.id).some(l => l.stage === out.stage && l.title.toLowerCase() === out.title.toLowerCase())) return bad(res, `"${out.title}" is already in the ${out.stage} stage`, 409);
  const pos = (one('SELECT MAX(position) m FROM career_lessons WHERE path_id=?', p.id).m ?? -1) + 1, k = Object.keys(out);
  const id = db.prepare(`INSERT INTO career_lessons(user_id,path_id,position,${k}) VALUES(?,?,?,${k.map(() => '?')})`).run(req.user.id, p.id, pos, ...k.map(c => out[c])).lastInsertRowid;
  log(req.user.id, `Added lesson "${out.title.slice(0, 40)}" - Career path`);
  res.status(201).json(lessonView(one('SELECT * FROM career_lessons WHERE id=?', id), p.title));
};
const getLesson = (uid, id) => one('SELECT l.*,p.title path_title FROM career_lessons l JOIN career_paths p ON p.id=l.path_id WHERE l.id=? AND l.user_id=?', Number(id), uid);
exports.updateLesson = (req, res) => {
  const l = getLesson(req.user.id, req.params.id); if (!l) return bad(res, 'Not found', 404);
  const { out, error } = parseLesson(req.body || {}, l); if (error) return bad(res, error);
  const k = Object.keys(out); if (k.length) db.prepare(`UPDATE career_lessons SET ${k.map(c => c + '=?')} WHERE id=?`).run(...k.map(c => out[c]), l.id);
  res.json(lessonView(one('SELECT * FROM career_lessons WHERE id=?', l.id), l.path_title));
};
exports.removeLesson = (req, res) => { const l = getLesson(req.user.id, req.params.id); if (!l) return bad(res, 'Not found', 404); db.prepare('DELETE FROM career_lessons WHERE id=?').run(l.id); res.json({ ok: true }); };
// POST /career/lessons/:id/complete {completed?: boolean (default true)}
exports.complete = (req, res) => {
  const l = getLesson(req.user.id, req.params.id); if (!l) return bad(res, 'Not found', 404);
  const want = req.body && req.body.completed === false ? 0 : 1;
  if (want !== (l.completed ? 1 : 0)) {
    db.prepare('UPDATE career_lessons SET completed=?,completed_at=? WHERE id=?').run(want, want ? U.todayStr() : null, l.id);
    log(req.user.id, `${want ? 'Completed' : 'Reopened'} lesson "${l.title.slice(0, 40)}" - Career path`);
  }
  res.json(lessonView(one('SELECT * FROM career_lessons WHERE id=?', l.id), l.path_title));
};

// Study hours: one row per study session; a day can never exceed 24h in total
exports.addStudy = (req, res) => {
  const p = getPath(req.user.id, req.params.id); if (!p) return bad(res, 'Not found', 404);
  const b = req.body || {}, today = U.todayStr(), minutes = U.toInt(b.minutes), date = b.date ? String(b.date) : today;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return bad(res, 'minutes must be a whole number between 1 and 1440');
  if (!U.isDate(date)) return bad(res, 'date must be a valid date (YYYY-MM-DD)');
  if (date > today) return bad(res, 'Study time cannot be logged for a future date');
  let lessonId = null;
  if (b.lesson_id !== undefined && b.lesson_id !== null && b.lesson_id !== '') { const l = one('SELECT id FROM career_lessons WHERE id=? AND path_id=?', Number(b.lesson_id), p.id); if (!l) return bad(res, 'lesson_id does not belong to this path'); lessonId = l.id; }
  const day = one('SELECT COALESCE(SUM(minutes),0) m FROM career_study_logs WHERE user_id=? AND log_date=?', req.user.id, date).m;
  if (day + minutes > 1440) return bad(res, 'That would exceed 24 hours of study on one day');
  const id = db.prepare('INSERT INTO career_study_logs(user_id,path_id,lesson_id,log_date,minutes,note) VALUES(?,?,?,?,?,?)').run(req.user.id, p.id, lessonId, date, minutes, String(b.note || '').trim().slice(0, 300)).lastInsertRowid;
  log(req.user.id, `Logged ${minutes} min of study - Career path`);
  res.status(201).json(one('SELECT * FROM career_study_logs WHERE id=?', id));
};
exports.removeStudy = (req, res) => { const r = db.prepare('DELETE FROM career_study_logs WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id); r.changes ? res.json({ ok: true }) : bad(res, 'Not found', 404); };

// GET /career/youtube?q=&pageToken= : real YouTube Data API v3 results when YOUTUBE_API_KEY is configured, otherwise a working youtube.com search link.
// A pasted YouTube link is resolved to that single video (no API key needed).
const mapVideo = i => ({ id: i.id.videoId, title: i.snippet.title, channel: i.snippet.channelTitle, thumbnail: i.snippet.thumbnails && (i.snippet.thumbnails.medium || i.snippet.thumbnails.default || {}).url || '', url: watchUrl(i.id.videoId) });
async function oembed(id) {
  try {
    const r = await fetch('https://www.youtube.com/oembed?' + new URLSearchParams({ url: watchUrl(id), format: 'json' }), { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null; const d = await r.json();
    return { id, title: String(d.title || '').slice(0, 200), channel: String(d.author_name || '').slice(0, 120), thumbnail: d.thumbnail_url || thumbUrl(id), url: watchUrl(id), verified: true };
  } catch { return null; }
}
async function resolveVideo(raw) {
  const id = videoId(raw); if (!id) return null;
  return (await oembed(id)) || { id, title: '', channel: '', thumbnail: thumbUrl(id), url: watchUrl(id), verified: false };
}
exports.youtube = async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q.length < 2) return bad(res, 'q must be at least 2 characters');
  const base = { query: q, search_url: ytSearch(q) }, key = process.env.YOUTUBE_API_KEY;
  const direct = videoId(q);
  if (direct) { const v = await resolveVideo(q); return res.json({ ...base, source: 'video-link', videos: [v], next_page_token: null, note: v.verified ? '' : 'Video details could not be loaded, but the link is valid and can be added.' }); }
  if (!key) return res.json({ ...base, source: 'search-link', videos: [], next_page_token: null, note: 'Add YOUTUBE_API_KEY to backend/.env to show video results here. You can still paste any YouTube link into the search box to add that video, or use the search link below.' });
  const pt = String(req.query.pageToken || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  try {
    const r = await fetch('https://www.googleapis.com/youtube/v3/search?' + new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '8', safeSearch: 'strict', q, key, ...(pt ? { pageToken: pt } : {}) }), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('status ' + r.status);
    const d = await r.json();
    res.json({ ...base, source: 'youtube-api', videos: (d.items || []).filter(i => i.id && i.id.videoId).map(mapVideo), next_page_token: d.nextPageToken || null });
  } catch { res.json({ ...base, source: 'search-link', videos: [], next_page_token: null, note: 'YouTube is unreachable right now - use the search link instead.' }); }
};
// GET /career/youtube/resolve?url= : validate a pasted YouTube link and return its details
exports.youtubeResolve = async (req, res) => {
  const v = await resolveVideo(req.query.url);
  v ? res.json(v) : bad(res, 'That is not a valid YouTube video link');
};
// PUT /career/lessons/:id/video {url} or {id,title?,channel?,thumbnail?} : attach one YouTube video to a lesson (replaces any previous one)
exports.setVideo = async (req, res) => {
  const l = getLesson(req.user.id, req.params.id); if (!l) return bad(res, 'Not found', 404);
  const b = req.body || {}, id = videoId(b.url || b.id || b.video_id);
  if (!id) return bad(res, 'A valid YouTube video link or id is required');
  let v = { id, title: String(b.title || '').trim().slice(0, 200), channel: String(b.channel || '').trim().slice(0, 120), thumbnail: String(b.thumbnail || '').slice(0, 500) };
  if (!v.title) { const r = await resolveVideo(id); if (r) v = { ...v, title: r.title, channel: r.channel, thumbnail: r.thumbnail }; }
  if (v.thumbnail && !okUrl(v.thumbnail)) v.thumbnail = '';
  db.prepare('UPDATE career_lessons SET video_id=?,video_title=?,video_channel=?,video_thumbnail=? WHERE id=?').run(v.id, v.title, v.channel, v.thumbnail || thumbUrl(v.id), l.id);
  log(req.user.id, `Attached a video to lesson \"${l.title.slice(0, 40)}\" - Career path`);
  res.json(lessonView(one('SELECT * FROM career_lessons WHERE id=?', l.id), l.path_title));
};
exports.clearVideo = (req, res) => {
  const l = getLesson(req.user.id, req.params.id); if (!l) return bad(res, 'Not found', 404);
  db.prepare("UPDATE career_lessons SET video_id='',video_title='',video_channel='',video_thumbnail='' WHERE id=?").run(l.id);
  res.json(lessonView(one('SELECT * FROM career_lessons WHERE id=?', l.id), l.path_title));
};
exports._videoId = videoId;

// ---------- Lesson reordering ----------
// Reorders lessons INSIDE one stage only: the new order reuses the exact set of position values the stage already had,
// so lessons of the other stages, their progress, completion state and ids are untouched.
function applyOrder(pathId, ids) {
  const rows = ids.map(id => one('SELECT id,position FROM career_lessons WHERE id=?', id)), slots = rows.map(r => r.position).sort((a, b) => a - b);
  // legacy rows could share a position: make the slots strictly increasing so the new order is always stable
  for (let i = 1; i < slots.length; i++) if (slots[i] <= slots[i - 1]) slots[i] = slots[i - 1] + 1;
  const upd = db.prepare('UPDATE career_lessons SET position=? WHERE id=?'); ids.forEach((id, i) => upd.run(slots[i], id));
}
// PUT /career/paths/:id/lessons/reorder {stage, order:[lessonId,...]}  (order must contain every lesson of that stage exactly once)
exports.reorderLessons = (req, res) => {
  const p = getPath(req.user.id, req.params.id); if (!p) return bad(res, 'Not found', 404);
  const b = req.body || {}, stage = String(b.stage || '');
  if (!CT.STAGES.includes(stage)) return bad(res, `stage must be one of: ${CT.STAGES.join(', ')}`);
  if (!Array.isArray(b.order) || b.order.some(x => !Number.isInteger(Number(x)))) return bad(res, 'order must be an array of lesson ids');
  const order = b.order.map(Number), cur = all('SELECT id FROM career_lessons WHERE path_id=? AND stage=? ORDER BY position,id', p.id, stage).map(r => r.id);
  if (new Set(order).size !== order.length || order.length !== cur.length || order.some(id => !cur.includes(id))) return bad(res, 'order must list every lesson of this stage exactly once');
  db.transaction(() => applyOrder(p.id, order))();
  log(req.user.id, `Reordered ${stage} lessons - Career path`);
  res.json(pathView(getPath(req.user.id, p.id), U.todayStr(), true));
};
// POST /career/lessons/:id/move {direction:'up'|'down'} : swap a lesson with its neighbour in the same stage
exports.moveLesson = (req, res) => {
  const l = getLesson(req.user.id, req.params.id); if (!l) return bad(res, 'Not found', 404);
  const dir = req.body && req.body.direction; if (dir !== 'up' && dir !== 'down') return bad(res, "direction must be 'up' or 'down'");
  const ids = all('SELECT id FROM career_lessons WHERE path_id=? AND stage=? ORDER BY position,id', l.path_id, l.stage).map(r => r.id), i = ids.indexOf(l.id), j = dir === 'up' ? i - 1 : i + 1;
  if (j >= 0 && j < ids.length) { [ids[i], ids[j]] = [ids[j], ids[i]]; db.transaction(() => applyOrder(l.path_id, ids))(); }
  res.json(pathView(getPath(req.user.id, l.path_id), U.todayStr(), true));
};

// ---------- Study log management ----------
// GET /career/paths/:id/study?from=&to=&lesson_id=&q=&limit=&offset= : filtered, paged study logs + totals for the filtered set
exports.listStudy = (req, res) => {
  const p = getPath(req.user.id, req.params.id); if (!p) return bad(res, 'Not found', 404);
  const q = req.query || {}, w = ['s.path_id=?', 's.user_id=?'], a = [p.id, req.user.id];
  if (q.from) { if (!U.isDate(String(q.from))) return bad(res, 'from must be a valid date (YYYY-MM-DD)'); w.push('s.log_date>=?'); a.push(String(q.from)); }
  if (q.to) { if (!U.isDate(String(q.to))) return bad(res, 'to must be a valid date (YYYY-MM-DD)'); w.push('s.log_date<=?'); a.push(String(q.to)); }
  if (q.from && q.to && q.from > q.to) return bad(res, 'from cannot be after to');
  if (q.lesson_id === 'none') w.push('s.lesson_id IS NULL'); else if (q.lesson_id) { const n = Number(q.lesson_id); if (!Number.isInteger(n)) return bad(res, 'lesson_id is invalid'); w.push('s.lesson_id=?'); a.push(n); }
  const term = String(q.q || '').trim().slice(0, 60); if (term) { w.push("s.note LIKE ? ESCAPE '\\'"); a.push('%' + term.replace(/[\\%_]/g, c => '\\' + c) + '%'); }
  const limit = Math.min(100, Math.max(1, U.toInt(q.limit) || 20)), offset = Math.max(0, U.toInt(q.offset) || 0), where = w.join(' AND ');
  const tot = one(`SELECT COUNT(*) n, COALESCE(SUM(s.minutes),0) m FROM career_study_logs s WHERE ${where}`, ...a);
  const logs = all(`SELECT s.*, l.title lesson_title FROM career_study_logs s LEFT JOIN career_lessons l ON l.id=s.lesson_id WHERE ${where} ORDER BY s.log_date DESC, s.id DESC LIMIT ? OFFSET ?`, ...a, limit, offset);
  res.json({ logs, total: tot.n, total_minutes: tot.m, limit, offset, has_more: offset + logs.length < tot.n });
};
// PUT /career/study/:id {minutes?, date?, lesson_id?, note?} : edit a log with the same rules as creating one (no future dates, max 24h per day)
exports.updateStudy = (req, res) => {
  const old = one('SELECT * FROM career_study_logs WHERE id=? AND user_id=?', Number(req.params.id), req.user.id); if (!old) return bad(res, 'Not found', 404);
  const b = req.body || {}, today = U.todayStr(), minutes = b.minutes !== undefined ? U.toInt(b.minutes) : old.minutes, date = b.date !== undefined ? String(b.date) : old.log_date;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return bad(res, 'minutes must be a whole number between 1 and 1440');
  if (!U.isDate(date)) return bad(res, 'date must be a valid date (YYYY-MM-DD)');
  if (date > today && date !== old.log_date) return bad(res, 'Study time cannot be logged for a future date');
  let lessonId = old.lesson_id;
  if (b.lesson_id !== undefined) { if (b.lesson_id === null || b.lesson_id === '') lessonId = null; else { const l = one('SELECT id FROM career_lessons WHERE id=? AND path_id=?', Number(b.lesson_id), old.path_id); if (!l) return bad(res, 'lesson_id does not belong to this path'); lessonId = l.id; } }
  const day = one('SELECT COALESCE(SUM(minutes),0) m FROM career_study_logs WHERE user_id=? AND log_date=? AND id<>?', req.user.id, date, old.id).m;
  if (day + minutes > 1440) return bad(res, 'That would exceed 24 hours of study on one day');
  const note = b.note !== undefined ? String(b.note || '').trim().slice(0, 300) : old.note;
  db.prepare("UPDATE career_study_logs SET minutes=?,log_date=?,lesson_id=?,note=?,updated_at=datetime('now') WHERE id=?").run(minutes, date, lessonId, note, old.id);
  log(req.user.id, `Edited a study log - Career path`);
  res.json(one('SELECT s.*, l.title lesson_title FROM career_study_logs s LEFT JOIN career_lessons l ON l.id=s.lesson_id WHERE s.id=?', old.id));
};
