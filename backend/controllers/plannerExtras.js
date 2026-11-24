// Study Planner extras: (1) calendar view, (2) recurring study plans, (3) goal milestones, (4) habit reminders.
// Self-contained and purely additive: it creates its own tables (CREATE TABLE IF NOT EXISTS, safe on every start and on an existing database)
// and only READS the existing goals / habits / assignments / study tables. No existing table, column or controller is changed.
const db = require('../database/db'), U = require('../utils');
const one = (s, ...a) => db.prepare(s).get(...a), all = (s, ...a) => db.prepare(s).all(...a), run = (s, ...a) => db.prepare(s).run(...a);
const log = (uid, m) => run('INSERT INTO activity_logs(user_id,message) VALUES(?,?)', uid, m);
const bad = (res, error, status = 400) => res.status(status).json({ error });

db.exec(`CREATE TABLE IF NOT EXISTS study_recurrences(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,title TEXT NOT NULL,total_minutes INTEGER NOT NULL,subjects TEXT NOT NULL,frequency TEXT NOT NULL,interval_n INTEGER NOT NULL DEFAULT 1,interval_unit TEXT NOT NULL DEFAULT 'days',days_of_week TEXT NOT NULL DEFAULT '',start_date TEXT NOT NULL,end_date TEXT,active INTEGER NOT NULL DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS study_recurrence_plans(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,recurrence_id INTEGER NOT NULL REFERENCES study_recurrences(id) ON DELETE CASCADE,plan_id INTEGER,plan_date TEXT NOT NULL,UNIQUE(recurrence_id,plan_date));
CREATE TABLE IF NOT EXISTS goal_milestones(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,title TEXT NOT NULL,due_date TEXT,completed INTEGER NOT NULL DEFAULT 0,completed_at TEXT,position INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS habit_reminders(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,remind_time TEXT NOT NULL,days_of_week TEXT NOT NULL DEFAULT '',enabled INTEGER NOT NULL DEFAULT 1,last_fired_date TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_srec_user ON study_recurrences(user_id);CREATE INDEX IF NOT EXISTS idx_srecp_rec ON study_recurrence_plans(recurrence_id);
CREATE INDEX IF NOT EXISTS idx_gms_goal ON goal_milestones(goal_id);CREATE INDEX IF NOT EXISTS idx_gms_user ON goal_milestones(user_id,due_date);CREATE INDEX IF NOT EXISTS idx_hrem_user ON habit_reminders(user_id)`);

const MAX_TOTAL = 1440, MAX_SUBJECTS = 20, WINDOW_DAYS = 14, MAX_RANGE_DAYS = 100, MAX_MILESTONES = 50, MAX_REMINDERS_PER_HABIT = 5;
const FREQ = ['daily', 'weekly', 'custom'], UNITS = ['days', 'weeks'];
const dow = s => (new Date(s + 'T00:00:00Z').getUTCDay() + 6) % 7; // 0 = Monday ... 6 = Sunday (same as utils.DOW)
const parseDays = s => String(s || '').split(',').filter(x => x !== '').map(Number);

// ================= Recurring study plans =================
// Does the recurrence produce a plan on this date? (pure function, used for both real and "virtual" occurrences)
function occursOn(r, date) {
  if (date < r.start_date || (r.end_date && date > r.end_date)) return false;
  const n = r.interval_n, diff = U.daysBetween(r.start_date, date), days = parseDays(r.days_of_week);
  const unit = r.frequency === 'daily' ? 'days' : r.frequency === 'weekly' ? 'weeks' : r.interval_unit;
  if (unit === 'days') return diff % n === 0;
  const weeks = U.daysBetween(U.weekStart(r.start_date), U.weekStart(date)) / 7;
  return weeks % n === 0 && (days.length ? days : [dow(r.start_date)]).includes(dow(date));
}
const occurrences = (r, from, to) => { const out = []; for (let d = from < r.start_date ? r.start_date : from; d <= to; d = U.addDays(d, 1)) { if (r.end_date && d > r.end_date) break; if (occursOn(r, d)) out.push(d); } return out; };

function recView(r) {
  const today = U.todayStr(), next = occurrences(r, r.start_date > today ? r.start_date : today, U.addDays(today, 400))[0] || null;
  return { id: r.id, title: r.title, total_minutes: r.total_minutes, subjects: JSON.parse(r.subjects), frequency: r.frequency, interval_n: r.interval_n, interval_unit: r.frequency === 'custom' ? r.interval_unit : r.frequency === 'weekly' ? 'weeks' : 'days', days_of_week: parseDays(r.days_of_week), start_date: r.start_date, end_date: r.end_date || null, active: !!r.active, next_date: r.active ? next : null, generated: one('SELECT COUNT(*) c FROM study_recurrence_plans WHERE recurrence_id=?', r.id).c, description: describe(r) };
}
function describe(r) {
  const n = r.interval_n, days = parseDays(r.days_of_week).map(d => U.DOW[d]).join(', ');
  if (r.frequency === 'daily') return n === 1 ? 'Every day' : `Every ${n} days`;
  const unit = r.frequency === 'weekly' ? 'weeks' : r.interval_unit;
  if (unit === 'days') return `Every ${n} days`;
  return `${n === 1 ? 'Every week' : `Every ${n} weeks`}${days ? ' on ' + days : ''}`;
}

// Turn occurrences inside the rolling window into REAL study plans (so Start / Complete / progress / dashboard all work on them).
// (recurrence_id, plan_date) is UNIQUE and the mapping row is kept even if the user deletes that plan, so a deleted occurrence is never re-created.
function materialize(r, today = U.todayStr()) {
  if (!r.active) return 0;
  const to = U.addDays(today, WINDOW_DAYS - 1), subjects = JSON.parse(r.subjects);
  let made = 0;
  for (const d of occurrences(r, today, to)) {
    if (one('SELECT id FROM study_recurrence_plans WHERE recurrence_id=? AND plan_date=?', r.id, d)) continue;
    db.transaction(() => {
      const ids = subjects.map(s => { const a = one('SELECT id,subject FROM academics WHERE id=? AND user_id=?', s.id, r.user_id); return a ? { id: a.id, name: a.subject } : { id: null, name: s.name }; });
      const pid = run('INSERT INTO study_plans(user_id,title,plan_date,total_minutes) VALUES(?,?,?,?)', r.user_id, r.title, d, r.total_minutes).lastInsertRowid;
      U.distribute(r.total_minutes, ids.length).forEach((m, i) => run('INSERT INTO study_plan_items(user_id,plan_id,subject_id,subject_name,allocated_minutes,position) VALUES(?,?,?,?,?,?)', r.user_id, pid, ids[i].id, ids[i].name, m, i));
      run('INSERT INTO study_recurrence_plans(user_id,recurrence_id,plan_id,plan_date) VALUES(?,?,?,?)', r.user_id, r.id, pid, d);
      made++;
    })();
  }
  return made;
}
const syncUser = uid => all('SELECT * FROM study_recurrences WHERE user_id=? AND active=1', uid).forEach(r => materialize(r));
function syncAll() { try { all('SELECT * FROM study_recurrences WHERE active=1').forEach(r => materialize(r)); } catch (e) { console.error('recurring plan sync failed', e.message); } }
syncAll();
if (process.env.NODE_ENV !== 'test') setInterval(syncAll, 36e5).unref(); // keeps "today's" occurrence ready even if the planner page is not opened

// Remove generated plans that are still untouched (no session started/completed) from today onward, and forget their mapping rows.
function dropFuturePlans(rec, today = U.todayStr()) {
  for (const m of all('SELECT * FROM study_recurrence_plans WHERE recurrence_id=? AND plan_date>=?', rec.id, today)) {
    const touched = m.plan_id && one("SELECT id FROM study_plan_items WHERE plan_id=? AND status<>'pending'", m.plan_id);
    if (touched) continue;
    if (m.plan_id) { run('DELETE FROM study_plan_items WHERE plan_id=?', m.plan_id); run('DELETE FROM study_plans WHERE id=? AND user_id=?', m.plan_id, rec.user_id); }
    run('DELETE FROM study_recurrence_plans WHERE id=?', m.id);
  }
}

function parseRec(b, old) {
  const o = old ? { ...old } : {}, today = U.todayStr();
  if (!old || b.title !== undefined) o.title = String(b.title || '').trim().slice(0, 150) || 'Study plan';
  if (!old || b.frequency !== undefined) { const f = String(b.frequency || '').toLowerCase(); if (!FREQ.includes(f)) return { error: `frequency must be one of: ${FREQ.join(', ')}` }; o.frequency = f; }
  if (!old || b.interval_n !== undefined) { const n = b.interval_n === undefined ? 1 : U.toInt(b.interval_n); if (!Number.isInteger(n) || n < 1 || n > 365) return { error: 'interval_n must be a whole number between 1 and 365' }; o.interval_n = n; }
  if (!old || b.interval_unit !== undefined) { const u = String(b.interval_unit || 'days').toLowerCase(); if (!UNITS.includes(u)) return { error: `interval_unit must be one of: ${UNITS.join(', ')}` }; o.interval_unit = u; }
  if (!old || b.days_of_week !== undefined) {
    const raw = b.days_of_week === undefined || b.days_of_week === null ? [] : b.days_of_week;
    if (!Array.isArray(raw)) return { error: 'days_of_week must be a list of weekday numbers (0 = Mon ... 6 = Sun)' };
    const d = [...new Set(raw.map(x => U.toInt(x)))].sort((a, c) => a - c);
    if (d.some(x => !Number.isInteger(x) || x < 0 || x > 6)) return { error: 'days_of_week must contain numbers 0 (Mon) to 6 (Sun)' };
    o.days_of_week = d.join(',');
  }
  if (!old || b.start_date !== undefined) { const s = b.start_date === undefined || b.start_date === '' ? today : b.start_date; if (!U.isDate(s)) return { error: 'start_date must be a valid date (YYYY-MM-DD)' }; if (s < today && (!old || s !== old.start_date)) return { error: 'start_date cannot be in the past' }; o.start_date = s; }
  if (!old || b.end_date !== undefined) { const e = b.end_date === undefined || b.end_date === null || b.end_date === '' ? null : b.end_date; if (e !== null && !U.isDate(e)) return { error: 'end_date must be a valid date (YYYY-MM-DD)' }; o.end_date = e; }
  if (o.end_date && o.end_date < o.start_date) return { error: 'end_date cannot be before start_date' };
  if (old && b.active !== undefined) o.active = b.active ? 1 : 0;
  if (!old || b.hours !== undefined || b.minutes !== undefined || b.total_minutes !== undefined) {
    let t;
    if (b.total_minutes !== undefined) t = U.toInt(b.total_minutes);
    else { const h = b.hours === undefined || b.hours === '' ? 0 : U.toInt(b.hours), m = b.minutes === undefined || b.minutes === '' ? 0 : U.toInt(b.minutes); if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) return { error: 'hours and minutes must be whole numbers (minutes 0-59)' }; t = h * 60 + m; }
    if (!Number.isInteger(t) || t < 1) return { error: 'Total study time must be at least 1 minute' };
    if (t > MAX_TOTAL) return { error: 'Total study time cannot exceed 24 hours' };
    o.total_minutes = t;
  }
  if (o.frequency === 'weekly' || (o.frequency === 'custom' && o.interval_unit === 'weeks')) { if (!o.days_of_week) o.days_of_week = String(dow(o.start_date)); } else o.days_of_week = '';
  return { data: o };
}
function resolveSubjects(uid, list) {
  if (!Array.isArray(list) || !list.length) return { error: 'Select at least one subject' };
  if (list.length > MAX_SUBJECTS) return { error: `Select at most ${MAX_SUBJECTS} subjects` };
  const out = [], seen = new Set();
  for (const raw of list) {
    let row;
    const id = typeof raw === 'object' && raw ? raw.id : typeof raw === 'number' ? raw : undefined, name = typeof raw === 'string' ? raw : raw && typeof raw === 'object' ? raw.name : undefined;
    if (id !== undefined && id !== null) { row = one('SELECT id,subject FROM academics WHERE id=? AND user_id=?', Number(id), uid); if (!row) return { error: 'Unknown subject' }; }
    else {
      const n = String(name || '').trim().slice(0, 100); if (!n) return { error: 'Subject name cannot be empty' };
      row = one('SELECT id,subject FROM academics WHERE user_id=? AND LOWER(subject)=LOWER(?)', uid, n);
      if (!row) { const nid = run('INSERT INTO academics(user_id,subject) VALUES(?,?)', uid, n).lastInsertRowid; row = { id: nid, subject: n }; log(uid, `Added "${n}" - Subject`); }
    }
    if (!seen.has(row.id)) { seen.add(row.id); out.push({ id: row.id, name: row.subject }); }
  }
  return { subjects: out };
}
const getRec = (uid, id) => one('SELECT * FROM study_recurrences WHERE id=? AND user_id=?', id, uid);

exports.listRecurrences = (req, res) => { syncUser(req.user.id); res.json({ recurrences: all('SELECT * FROM study_recurrences WHERE user_id=? ORDER BY id DESC', req.user.id).map(recView), window_days: WINDOW_DAYS, today: U.todayStr() }); };
exports.createRecurrence = (req, res) => {
  const u = req.user.id, b = req.body || {}, { data, error } = parseRec(b, null); if (error) return bad(res, error);
  let id;
  try {
    db.transaction(() => {
      const r = resolveSubjects(u, b.subjects); if (r.error) throw { msg: r.error };
      if (data.total_minutes < r.subjects.length) throw { msg: `${data.total_minutes} minute(s) cannot be shared between ${r.subjects.length} subjects (1 minute minimum each)` };
      id = run('INSERT INTO study_recurrences(user_id,title,total_minutes,subjects,frequency,interval_n,interval_unit,days_of_week,start_date,end_date) VALUES(?,?,?,?,?,?,?,?,?,?)', u, data.title, data.total_minutes, JSON.stringify(r.subjects), data.frequency, data.interval_n, data.interval_unit, data.days_of_week, data.start_date, data.end_date).lastInsertRowid;
    })();
  } catch (e) { if (e && e.msg) return bad(res, e.msg); throw e; }
  materialize(getRec(u, id));
  log(u, `Added "${data.title.slice(0, 40)}" - Recurring plan`);
  res.status(201).json(recView(getRec(u, id)));
};
exports.updateRecurrence = (req, res) => {
  const u = req.user.id, b = req.body || {}, old = getRec(u, Number(req.params.id)); if (!old) return bad(res, 'Not found', 404);
  const { data, error } = parseRec(b, old); if (error) return bad(res, error);
  let subjects = old.subjects;
  if (b.subjects !== undefined) { const r = resolveSubjects(u, b.subjects); if (r.error) return bad(res, r.error); subjects = JSON.stringify(r.subjects); }
  if (data.total_minutes < JSON.parse(subjects).length) return bad(res, 'Not enough time to share between that many subjects (1 minute minimum each)');
  db.transaction(() => {
    dropFuturePlans(old); // untouched upcoming plans are rebuilt from the new rule; started/completed ones are kept
    run('UPDATE study_recurrences SET title=?,total_minutes=?,subjects=?,frequency=?,interval_n=?,interval_unit=?,days_of_week=?,start_date=?,end_date=?,active=? WHERE id=?', data.title, data.total_minutes, subjects, data.frequency, data.interval_n, data.interval_unit, data.days_of_week, data.start_date, data.end_date, data.active, old.id);
  })();
  materialize(getRec(u, old.id));
  log(u, `Updated "${data.title.slice(0, 40)}" - Recurring plan`);
  res.json(recView(getRec(u, old.id)));
};
exports.removeRecurrence = (req, res) => {
  const u = req.user.id, r = getRec(u, Number(req.params.id)); if (!r) return bad(res, 'Not found', 404);
  db.transaction(() => { dropFuturePlans(r); run('DELETE FROM study_recurrence_plans WHERE recurrence_id=?', r.id); run('DELETE FROM study_recurrences WHERE id=?', r.id); })();
  log(u, `Deleted "${r.title.slice(0, 40)}" - Recurring plan`);
  res.json({ ok: true });
};

// ================= Calendar view =================
// GET /planner/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD  (max 100 days). Everything is read-only here and grouped by date.
exports.calendar = (req, res) => {
  const u = req.user.id, today = U.todayStr();
  const from = req.query.from || U.weekStart(today.slice(0, 8) + '01'), to = req.query.to || U.addDays(from, 41);
  if (!U.isDate(from) || !U.isDate(to)) return bad(res, 'from and to must be valid dates (YYYY-MM-DD)');
  if (to < from) return bad(res, 'to cannot be before from');
  if (U.daysBetween(from, to) > MAX_RANGE_DAYS) return bad(res, `The date range cannot exceed ${MAX_RANGE_DAYS} days`);
  syncUser(u);
  const days = {}, put = (d, k, v) => { (days[d] || (days[d] = { plans: [], upcoming: [], tasks: [], milestones: [] }))[k].push(v); };
  const recOf = new Map(all('SELECT plan_id,recurrence_id FROM study_recurrence_plans WHERE user_id=?', u).map(m => [m.plan_id, m.recurrence_id]));
  for (const p of all('SELECT * FROM study_plans WHERE user_id=? AND plan_date>=? AND plan_date<=? ORDER BY plan_date,id', u, from, to)) {
    const items = all('SELECT id,subject_name,allocated_minutes,status FROM study_plan_items WHERE plan_id=? ORDER BY position,id', p.id), done = items.filter(i => i.status === 'done');
    const status = items.length && done.length === items.length ? 'completed' : done.length || items.some(i => i.status === 'active') ? 'in_progress' : 'planned';
    put(p.plan_date, 'plans', { id: p.id, title: p.title, total_minutes: p.total_minutes, status, items_done: done.length, items_total: items.length, subjects: items.map(i => i.subject_name), recurring: recOf.has(p.id) });
  }
  // occurrences beyond the generated window are shown as "upcoming" (they become real plans automatically as their date approaches)
  const windowEnd = U.addDays(today, WINDOW_DAYS - 1);
  for (const r of all('SELECT * FROM study_recurrences WHERE user_id=? AND active=1', u)) {
    const lo = from > windowEnd ? from : U.addDays(windowEnd, 1);
    if (lo > to) continue;
    for (const d of occurrences(r, lo, to)) if (d >= today && !one('SELECT id FROM study_recurrence_plans WHERE recurrence_id=? AND plan_date=?', r.id, d)) put(d, 'upcoming', { recurrence_id: r.id, title: r.title, total_minutes: r.total_minutes, subjects: JSON.parse(r.subjects).map(s => s.name) });
  }
  for (const a of all('SELECT id,title,subject,due_date,status FROM assignments WHERE user_id=? AND due_date>=? AND due_date<=? ORDER BY due_date,id', u, from, to)) put(a.due_date, 'tasks', { id: a.id, kind: 'assignment', title: a.title, subject: a.subject || '', done: a.status === 'done' });
  for (const s of all('SELECT id,title,session_date,duration,completed FROM study_sessions WHERE user_id=? AND session_date>=? AND session_date<=? ORDER BY session_date,id', u, from, to)) put(s.session_date, 'tasks', { id: s.id, kind: 'session', title: s.title, minutes: s.duration, done: !!s.completed });
  for (const m of all('SELECT m.id,m.title,m.due_date,m.completed,g.title goal_title FROM goal_milestones m JOIN goals g ON g.id=m.goal_id WHERE m.user_id=? AND m.due_date>=? AND m.due_date<=? ORDER BY m.due_date,m.id', u, from, to)) put(m.due_date, 'milestones', { id: m.id, title: m.title, goal_title: m.goal_title, done: !!m.completed });
  res.json({ from, to, today, days });
};

// ================= Goal milestones =================
const msView = (m, today = U.todayStr()) => ({ id: m.id, goal_id: m.goal_id, title: m.title, due_date: m.due_date || null, completed: !!m.completed, completed_at: m.completed_at || null, position: m.position, overdue: !m.completed && !!m.due_date && m.due_date < today });
function goalWithMs(g, today = U.todayStr()) {
  const ms = all('SELECT * FROM goal_milestones WHERE goal_id=? AND user_id=? ORDER BY position,id', g.id, g.user_id).map(m => msView(m, today)), done = ms.filter(m => m.completed).length;
  const nextDue = ms.filter(m => !m.completed).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))[0] || null;
  return { id: g.id, title: g.title, target_date: g.target_date || null, progress: g.progress, milestones: ms, milestones_total: ms.length, milestones_done: done, milestone_pct: ms.length ? Math.round(done / ms.length * 100) : 0, next_milestone: nextDue };
}
// GET /planner/goals -> every goal of the user with its milestones and milestone progress
exports.goals = (req, res) => {
  const u = req.user.id, today = U.todayStr(), list = all('SELECT * FROM goals WHERE user_id=? ORDER BY (progress>=100),COALESCE(NULLIF(target_date,\'\'),\'9999\'),id', u).map(g => goalWithMs(g, today));
  res.json({ goals: list, today, summary: { goals: list.length, milestones: list.reduce((s, g) => s + g.milestones_total, 0), done: list.reduce((s, g) => s + g.milestones_done, 0), overdue: list.reduce((s, g) => s + g.milestones.filter(m => m.overdue).length, 0) } });
};
function parseMs(b, goal, old) {
  const o = {}, today = U.todayStr();
  if (!old || b.title !== undefined) { const t = String(b.title ?? '').trim().slice(0, 200); if (!t) return { error: 'title is required' }; o.title = t; }
  if (b.due_date !== undefined) {
    const d = b.due_date === null ? '' : String(b.due_date).trim();
    if (d !== '') {
      if (!U.isDate(d)) return { error: 'due_date must be a valid date (YYYY-MM-DD)' };
      if (d < today && (!old || d !== old.due_date)) return { error: 'due_date cannot be in the past' };
      if (goal.target_date && U.isDate(goal.target_date) && d > goal.target_date) return { error: `due_date cannot be after the goal's target date (${goal.target_date})` };
    }
    o.due_date = d === '' ? null : d;
  }
  return { data: o };
}
exports.addMilestone = (req, res) => {
  const u = req.user.id, g = one('SELECT * FROM goals WHERE id=? AND user_id=?', Number(req.params.goalId), u); if (!g) return bad(res, 'Goal not found', 404);
  const { data, error } = parseMs(req.body || {}, g, null); if (error) return bad(res, error);
  if (one('SELECT COUNT(*) c FROM goal_milestones WHERE goal_id=?', g.id).c >= MAX_MILESTONES) return bad(res, `A goal can have at most ${MAX_MILESTONES} milestones`);
  const pos = (one('SELECT MAX(position) m FROM goal_milestones WHERE goal_id=?', g.id).m ?? -1) + 1;
  const id = run('INSERT INTO goal_milestones(user_id,goal_id,title,due_date,position) VALUES(?,?,?,?,?)', u, g.id, data.title, data.due_date ?? null, pos).lastInsertRowid;
  log(u, `Added "${data.title.slice(0, 40)}" - Milestone`);
  res.status(201).json(goalWithMs(one('SELECT * FROM goals WHERE id=?', g.id)));
  void id;
};
exports.updateMilestone = (req, res) => {
  const u = req.user.id, m = one('SELECT * FROM goal_milestones WHERE id=? AND user_id=?', Number(req.params.id), u); if (!m) return bad(res, 'Not found', 404);
  const g = one('SELECT * FROM goals WHERE id=?', m.goal_id), b = req.body || {}, { data, error } = parseMs(b, g, m); if (error) return bad(res, error);
  if (b.completed !== undefined) { data.completed = b.completed ? 1 : 0; data.completed_at = b.completed ? (m.completed ? m.completed_at : U.todayStr()) : null; }
  const k = Object.keys(data);
  if (k.length) run(`UPDATE goal_milestones SET ${k.map(c => c + '=?')} WHERE id=?`, ...k.map(c => data[c]), m.id);
  if (b.completed !== undefined && !!b.completed !== !!m.completed) log(u, `${b.completed ? 'Completed' : 'Reopened'} "${m.title.slice(0, 40)}" - Milestone`);
  res.json(goalWithMs(g));
};
exports.removeMilestone = (req, res) => {
  const u = req.user.id, m = one('SELECT * FROM goal_milestones WHERE id=? AND user_id=?', Number(req.params.id), u); if (!m) return bad(res, 'Not found', 404);
  run('DELETE FROM goal_milestones WHERE id=?', m.id);
  log(u, `Deleted "${m.title.slice(0, 40)}" - Milestone`);
  res.json(goalWithMs(one('SELECT * FROM goals WHERE id=?', m.goal_id)));
};

// ================= Habit reminders =================
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const remView = r => ({ id: r.id, habit_id: r.habit_id, habit_name: r.habit_name, remind_time: r.remind_time, days_of_week: parseDays(r.days_of_week), enabled: !!r.enabled, last_fired_date: r.last_fired_date || null });
const remRows = (uid, extra = '', ...a) => all(`SELECT r.*,h.name habit_name FROM habit_reminders r JOIN habits h ON h.id=r.habit_id WHERE r.user_id=? ${extra} ORDER BY r.remind_time,r.id`, uid, ...a);
function parseDaysOfWeek(v) {
  if (v === undefined) return { value: undefined };
  if (v === null) return { value: '' };
  if (!Array.isArray(v)) return { error: 'days_of_week must be a list of weekday numbers (0 = Mon ... 6 = Sun); an empty list means every day' };
  const d = [...new Set(v.map(x => U.toInt(x)))].sort((a, c) => a - c);
  if (d.some(x => !Number.isInteger(x) || x < 0 || x > 6)) return { error: 'days_of_week must contain numbers 0 (Mon) to 6 (Sun)' };
  return { value: d.length === 7 ? '' : d.join(',') };
}
exports.listReminders = (req, res) => {
  const u = req.user.id;
  res.json({ reminders: remRows(u).map(remView), habits: all('SELECT id,name FROM habits WHERE user_id=? ORDER BY id', u), today: U.todayStr() });
};
exports.createReminder = (req, res) => {
  const u = req.user.id, b = req.body || {}, h = one('SELECT * FROM habits WHERE id=? AND user_id=?', Number(b.habit_id), u); if (!h) return bad(res, 'Habit not found', 404);
  const t = String(b.remind_time || '').trim(); if (!TIME.test(t)) return bad(res, 'remind_time must be a time in 24-hour HH:MM format');
  const d = parseDaysOfWeek(b.days_of_week); if (d.error) return bad(res, d.error);
  if (one('SELECT COUNT(*) c FROM habit_reminders WHERE habit_id=?', h.id).c >= MAX_REMINDERS_PER_HABIT) return bad(res, `A habit can have at most ${MAX_REMINDERS_PER_HABIT} reminders`);
  if (one('SELECT id FROM habit_reminders WHERE habit_id=? AND remind_time=? AND days_of_week=?', h.id, t, d.value ?? '')) return bad(res, 'That reminder already exists', 409);
  const id = run('INSERT INTO habit_reminders(user_id,habit_id,remind_time,days_of_week,enabled) VALUES(?,?,?,?,?)', u, h.id, t, d.value ?? '', b.enabled === false ? 0 : 1).lastInsertRowid;
  log(u, `Set reminder for "${h.name.slice(0, 40)}" - Habit`);
  res.status(201).json(remView(remRows(u, 'AND r.id=?', id)[0]));
};
exports.updateReminder = (req, res) => {
  const u = req.user.id, r = one('SELECT * FROM habit_reminders WHERE id=? AND user_id=?', Number(req.params.id), u); if (!r) return bad(res, 'Not found', 404);
  const b = req.body || {}, o = {};
  if (b.remind_time !== undefined) { const t = String(b.remind_time).trim(); if (!TIME.test(t)) return bad(res, 'remind_time must be a time in 24-hour HH:MM format'); o.remind_time = t; }
  const d = parseDaysOfWeek(b.days_of_week); if (d.error) return bad(res, d.error); if (d.value !== undefined) o.days_of_week = d.value;
  if (b.enabled !== undefined) o.enabled = b.enabled ? 1 : 0;
  if (o.remind_time !== undefined || o.days_of_week !== undefined) o.last_fired_date = null; // a changed schedule may fire again today
  const dup = one('SELECT id FROM habit_reminders WHERE habit_id=? AND remind_time=? AND days_of_week=? AND id<>?', r.habit_id, o.remind_time ?? r.remind_time, o.days_of_week ?? r.days_of_week, r.id);
  if (dup) return bad(res, 'That reminder already exists', 409);
  const k = Object.keys(o);
  if (k.length) run(`UPDATE habit_reminders SET ${k.map(c => c + '=?')} WHERE id=?`, ...k.map(c => o[c]), r.id);
  res.json(remView(remRows(u, 'AND r.id=?', r.id)[0]));
};
exports.removeReminder = (req, res) => {
  const u = req.user.id, r = one('SELECT * FROM habit_reminders WHERE id=? AND user_id=?', Number(req.params.id), u); if (!r) return bad(res, 'Not found', 404);
  run('DELETE FROM habit_reminders WHERE id=?', r.id);
  res.json({ ok: true });
};
// GET /planner/reminders/due?date=YYYY-MM-DD&time=HH:MM -> enabled reminders whose time has passed today, that did not fire yet today, on a scheduled weekday,
// for habits that are not already completed today. (date/time default to the server clock; the browser sends its own local clock.)
exports.dueReminders = (req, res) => {
  const u = req.user.id, now = new Date(), pad = n => String(n).padStart(2, '0');
  const date = req.query.date || U.todayStr(), time = req.query.time || `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (!U.isDate(date)) return bad(res, 'date must be a valid date (YYYY-MM-DD)');
  if (!TIME.test(String(time))) return bad(res, 'time must be in HH:MM format');
  const logged = new Map(all('SELECT habit_id,count FROM habit_logs WHERE user_id=? AND log_date=?', u, date).map(l => [l.habit_id, l.count]));
  const due = remRows(u, 'AND r.enabled=1 AND r.remind_time<=? AND (r.last_fired_date IS NULL OR r.last_fired_date<>?)', time, date).filter(r => {
    const days = parseDays(r.days_of_week); if (days.length && !days.includes(dow(date))) return false;
    const h = one('SELECT daily_target FROM habits WHERE id=?', r.habit_id);
    return (logged.get(r.habit_id) || 0) < (h.daily_target || 1);
  });
  res.json({ due: due.map(remView), date, time });
};
exports.ackReminder = (req, res) => {
  const u = req.user.id, r = one('SELECT * FROM habit_reminders WHERE id=? AND user_id=?', Number(req.params.id), u); if (!r) return bad(res, 'Not found', 404);
  const date = (req.body && req.body.date) || U.todayStr(); if (!U.isDate(date)) return bad(res, 'date must be a valid date (YYYY-MM-DD)');
  run('UPDATE habit_reminders SET last_fired_date=? WHERE id=?', date, r.id);
  res.json(remView(remRows(u, 'AND r.id=?', r.id)[0]));
};

exports._internal = { occursOn, occurrences, materialize, syncUser };
