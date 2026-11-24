// Study Planner: plans -> sessions (one per subject). Time is always whole minutes; the sum of allocations can never exceed the plan total.
const db = require('../database/db'), U = require('../utils');
const one = (s, ...a) => db.prepare(s).get(...a), all = (s, ...a) => db.prepare(s).all(...a);
const log = (uid, m) => db.prepare('INSERT INTO activity_logs(user_id,message) VALUES(?,?)').run(uid, m);
const bad = (res, error, status = 400) => res.status(status).json({ error });
const MAX_TOTAL = 1440, MAX_SUBJECTS = 20;

function view(p) {
  const items = all('SELECT id,subject_id,subject_name,allocated_minutes,status,started_at,completed_at FROM study_plan_items WHERE plan_id=? ORDER BY position,id', p.id);
  const allocated = items.reduce((s, i) => s + i.allocated_minutes, 0), done = items.filter(i => i.status === 'done');
  const completed = done.reduce((s, i) => s + i.allocated_minutes, 0);
  const status = items.length && done.length === items.length ? 'completed' : done.length || items.some(i => i.status === 'active') ? 'in_progress' : 'planned';
  return {
    id: p.id, title: p.title, plan_date: p.plan_date, total_minutes: p.total_minutes, items, status,
    allocated_minutes: allocated, unallocated_minutes: p.total_minutes - allocated, completed_minutes: completed,
    progress_pct: allocated ? Math.round(completed / allocated * 100) : 0, items_total: items.length, items_done: done.length,
  };
}
const getPlan = (uid, id) => one('SELECT * FROM study_plans WHERE id=? AND user_id=?', id, uid);
const forUser = uid => all('SELECT * FROM study_plans WHERE user_id=? ORDER BY plan_date DESC,id DESC', uid).map(view);
exports.forUser = forUser;

function parseTotal(b) {
  if (b.total_minutes !== undefined) { const t = U.toInt(b.total_minutes); return Number.isInteger(t) ? { total: t } : { error: 'total_minutes must be a whole number' }; }
  if (b.hours === undefined && b.minutes === undefined) return { total: undefined };
  const h = b.hours === undefined || b.hours === '' ? 0 : U.toInt(b.hours), m = b.minutes === undefined || b.minutes === '' ? 0 : U.toInt(b.minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0) return { error: 'hours and minutes must be whole, non-negative numbers' };
  if (m > 59) return { error: 'minutes must be between 0 and 59' };
  return { total: h * 60 + m };
}
const checkTotal = t => (!Number.isInteger(t) || t < 1 ? 'Total study time must be at least 1 minute' : t > MAX_TOTAL ? 'Total study time cannot exceed 24 hours' : null);

// Resolve subject selections (existing id, or a name -> existing subject or a newly created one). Returns [{id,name}] without duplicates.
function resolveSubjects(uid, list) {
  if (!Array.isArray(list) || !list.length) return { error: 'Select at least one subject' };
  if (list.length > MAX_SUBJECTS) return { error: `Select at most ${MAX_SUBJECTS} subjects` };
  const out = [], seen = new Set();
  for (const raw of list) {
    let row;
    const id = typeof raw === 'object' && raw ? raw.id : typeof raw === 'number' ? raw : undefined;
    const name = typeof raw === 'string' ? raw : raw && typeof raw === 'object' ? raw.name : undefined;
    if (id !== undefined && id !== null) {
      row = one('SELECT id,subject FROM academics WHERE id=? AND user_id=?', Number(id), uid);
      if (!row) return { error: 'Unknown subject' };
    } else {
      const n = String(name || '').trim().slice(0, 100);
      if (!n) return { error: 'Subject name cannot be empty' };
      row = one('SELECT id,subject FROM academics WHERE user_id=? AND LOWER(subject)=LOWER(?)', uid, n);
      if (!row) { const nid = db.prepare('INSERT INTO academics(user_id,subject) VALUES(?,?)').run(uid, n).lastInsertRowid; row = { id: nid, subject: n }; log(uid, `Added "${n}" - Subject`); }
    }
    if (!seen.has(row.id)) { seen.add(row.id); out.push({ id: row.id, name: row.subject }); }
  }
  return { subjects: out };
}

exports.list = (req, res) => {
  const u = req.user.id, today = U.todayStr();
  let plans = forUser(u);
  if (req.query.status) plans = plans.filter(p => p.status === req.query.status);
  if (req.query.date) plans = plans.filter(p => p.plan_date === req.query.date);
  const every = forUser(u), items = every.flatMap(p => p.items);
  res.json({
    plans, today,
    subjects: all('SELECT id,subject FROM academics WHERE user_id=? ORDER BY subject COLLATE NOCASE', u),
    summary: {
      plans: every.length, sessions: items.length, sessionsDone: items.filter(i => i.status === 'done').length,
      plannedMinutes: items.reduce((s, i) => s + i.allocated_minutes, 0), completedMinutes: every.reduce((s, p) => s + p.completed_minutes, 0),
      progress_pct: (() => { const a = items.reduce((s, i) => s + i.allocated_minutes, 0); return a ? Math.round(every.reduce((s, p) => s + p.completed_minutes, 0) / a * 100) : 0; })(),
      active: items.find(i => i.status === 'active') || null,
    },
  });
};
exports.get = (req, res) => { const p = getPlan(req.user.id, Number(req.params.id)); p ? res.json(view(p)) : bad(res, 'Not found', 404); };

exports.create = (req, res) => {
  const u = req.user.id, b = req.body || {};
  const title = String(b.title || '').trim().slice(0, 150) || 'Study plan';
  const date = b.plan_date === undefined || b.plan_date === '' ? U.todayStr() : b.plan_date;
  if (!U.isDate(date)) return bad(res, 'plan_date must be a valid date (YYYY-MM-DD)');
  const t = parseTotal(b); if (t.error) return bad(res, t.error);
  const terr = checkTotal(t.total); if (terr) return bad(res, terr);
  let planId;
  try {
    db.transaction(() => {
      const r = resolveSubjects(u, b.subjects); if (r.error) throw { msg: r.error };
      if (t.total < r.subjects.length) throw { msg: `${t.total} minute(s) cannot be shared between ${r.subjects.length} subjects (1 minute minimum each)` };
      planId = db.prepare('INSERT INTO study_plans(user_id,title,plan_date,total_minutes) VALUES(?,?,?,?)').run(u, title, date, t.total).lastInsertRowid;
      const parts = U.distribute(t.total, r.subjects.length);
      r.subjects.forEach((s, i) => db.prepare('INSERT INTO study_plan_items(user_id,plan_id,subject_id,subject_name,allocated_minutes,position) VALUES(?,?,?,?,?,?)').run(u, planId, s.id, s.name, parts[i], i));
    })();
  } catch (e) { if (e && e.msg) return bad(res, e.msg); throw e; }
  log(u, `Added "${title.slice(0, 40)}" - Study plan`);
  res.status(201).json(view(getPlan(u, planId)));
};

exports.update = (req, res) => {
  const u = req.user.id, b = req.body || {}, p = getPlan(u, Number(req.params.id));
  if (!p) return bad(res, 'Not found', 404);
  const items = all('SELECT * FROM study_plan_items WHERE plan_id=? ORDER BY position,id', p.id);
  let title = p.title, date = p.plan_date, total = p.total_minutes;
  if (b.title !== undefined) { title = String(b.title).trim().slice(0, 150); if (!title) return bad(res, 'title is required'); }
  if (b.plan_date !== undefined) { if (!U.isDate(b.plan_date)) return bad(res, 'plan_date must be a valid date (YYYY-MM-DD)'); date = b.plan_date; }
  const t = parseTotal(b); if (t.error) return bad(res, t.error);
  if (t.total !== undefined) { const e = checkTotal(t.total); if (e) return bad(res, e); total = t.total; }
  const alloc = new Map(items.map(i => [i.id, i.allocated_minutes]));
  if (b.allocations !== undefined) {
    if (!Array.isArray(b.allocations)) return bad(res, 'allocations must be a list');
    for (const a of b.allocations) {
      const it = items.find(i => i.id === Number(a && a.id));
      if (!it) return bad(res, 'Unknown session in allocations');
      if (it.status === 'done') return bad(res, `"${it.subject_name}" is completed and its time is locked`);
      const m = U.toInt(a.minutes);
      if (!Number.isInteger(m) || m < 1) return bad(res, 'Each allocation must be a whole number of minutes (at least 1)');
      alloc.set(it.id, m);
    }
  }
  if (b.redistribute) {
    const open = items.filter(i => i.status !== 'done'), locked = items.filter(i => i.status === 'done').reduce((s, i) => s + i.allocated_minutes, 0);
    if (open.length) {
      const room = total - locked;
      if (room < open.length) return bad(res, 'Not enough time left to share between the remaining sessions');
      U.distribute(room, open.length).forEach((m, i) => alloc.set(open[i].id, m));
    }
  }
  const sum = [...alloc.values()].reduce((s, x) => s + x, 0);
  if (sum > total) return bad(res, `Allocated time (${sum} min) exceeds the plan total (${total} min)`);
  db.transaction(() => {
    db.prepare('UPDATE study_plans SET title=?,plan_date=?,total_minutes=? WHERE id=?').run(title, date, total, p.id);
    for (const [id, m] of alloc) db.prepare('UPDATE study_plan_items SET allocated_minutes=? WHERE id=?').run(m, id);
  })();
  log(u, `Updated "${title.slice(0, 40)}" - Study plan`);
  res.json(view(getPlan(u, p.id)));
};

exports.remove = (req, res) => {
  const p = getPlan(req.user.id, Number(req.params.id));
  if (!p) return bad(res, 'Not found', 404);
  db.transaction(() => { db.prepare('DELETE FROM study_plan_items WHERE plan_id=?').run(p.id); db.prepare('DELETE FROM study_plans WHERE id=?').run(p.id); })();
  log(req.user.id, `Deleted "${p.title.slice(0, 40)}" - Study plan`);
  res.json({ ok: true });
};

// POST /study-plans/:id/items/:itemId/(start|complete|reset)
exports.session = action => (req, res) => {
  const u = req.user.id, p = getPlan(u, Number(req.params.id));
  const it = p && one('SELECT * FROM study_plan_items WHERE id=? AND plan_id=?', Number(req.params.itemId), p.id);
  if (!it) return bad(res, 'Not found', 404);
  const now = new Date().toISOString();
  if (action === 'start') {
    if (it.status === 'done') return bad(res, 'This session is already completed', 409);
    if (it.status === 'active') return bad(res, 'This session is already in progress', 409);
    if (one("SELECT id FROM study_plan_items WHERE user_id=? AND status='active'", u)) return bad(res, 'Another session is already in progress - complete it first', 409);
    db.prepare("UPDATE study_plan_items SET status='active',started_at=?,completed_at=NULL WHERE id=?").run(now, it.id);
    log(u, `Started "${it.subject_name}" - Study session`);
  } else if (action === 'complete') {
    if (it.status === 'done') return bad(res, 'This session is already completed', 409);
    db.prepare("UPDATE study_plan_items SET status='done',started_at=COALESCE(started_at,?),completed_at=? WHERE id=?").run(now, now, it.id);
    log(u, `Completed "${it.subject_name}" - Study session`);
  } else {
    if (it.status === 'pending') return bad(res, 'This session has not been started', 409);
    db.prepare("UPDATE study_plan_items SET status='pending',started_at=NULL,completed_at=NULL WHERE id=?").run(it.id);
  }
  res.json(view(p));
};

// ---- dashboard helpers ----
exports.weekStats = (uid, from, to) => {
  const items = all('SELECT i.allocated_minutes m,i.status s FROM study_plan_items i JOIN study_plans p ON p.id=i.plan_id WHERE i.user_id=? AND p.plan_date>=? AND p.plan_date<=?', uid, from, to);
  const legacy = all('SELECT duration,completed FROM study_sessions WHERE user_id=? AND session_date>=? AND session_date<=?', uid, from, to);
  const done = items.filter(i => i.s === 'done'), ld = legacy.filter(x => x.completed);
  return { weekSessions: items.length + legacy.length, weekCompleted: done.length + ld.length, weekMinutes: items.reduce((s, x) => s + x.m, 0) + legacy.reduce((s, x) => s + x.duration, 0), weekMinutesDone: done.reduce((s, x) => s + x.m, 0) + ld.reduce((s, x) => s + x.duration, 0) };
};
exports.focus = (uid, today) => {
  const q = `SELECT i.id item_id,i.plan_id,i.subject_name,i.allocated_minutes,i.status,i.started_at,p.title plan_title,p.plan_date FROM study_plan_items i JOIN study_plans p ON p.id=i.plan_id WHERE i.user_id=? AND `;
  const r = one(q + "i.status='active' ORDER BY i.started_at LIMIT 1", uid) || one(q + "i.status='pending' AND p.plan_date>=? ORDER BY p.plan_date,p.id,i.position LIMIT 1", uid, today);
  if (r) return { title: r.subject_name, session_date: r.plan_date, duration: r.allocated_minutes, status: r.status, plan_id: r.plan_id, plan_title: r.plan_title, item_id: r.item_id, started_at: r.started_at };
  return one('SELECT * FROM study_sessions WHERE user_id=? AND session_date>=? AND completed=0 ORDER BY session_date,id LIMIT 1', uid, today) || null;
};
