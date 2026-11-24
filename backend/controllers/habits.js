// Growth Engine: daily habits with categories, daily targets, per-day logs, streaks and a weekly tracker.
// A day counts as "completed" when logged count >= daily_target. Completion is derived from habit_logs, never stored as a flag.
const db = require('../database/db'), U = require('../utils');
const one = (s, ...a) => db.prepare(s).get(...a), all = (s, ...a) => db.prepare(s).all(...a);
const log = (uid, m) => db.prepare('INSERT INTO activity_logs(user_id,message) VALUES(?,?)').run(uid, m);
const bad = (res, error, status = 400) => res.status(status).json({ error });
const CATEGORIES = ['General', 'Health', 'Fitness', 'Study', 'Mindfulness', 'Productivity', 'Creative', 'Social', 'Other'];
const MAX_COUNT = 1000, BACKFILL_DAYS = 365;
// Target types. 'standard' is the original "times per day" habit and keeps its original limits.
// duration: target/logs are stored in MINUTES (target_unit 'minutes'|'hours' is only the display unit); count: measurable quantity with a unit label (pages, questions...);
// custom: user-defined target name (target_label) + unit + amount. All types use the same habit_logs.count column, so streaks/completion/weekly tracker are unchanged.
const TARGET_TYPES = ['standard', 'duration', 'count', 'custom'], DURATION_UNITS = ['minutes', 'hours'];
const LIMITS = { standard: { target: 100, log: MAX_COUNT }, duration: { target: 1440, log: 1440 }, count: { target: 10000, log: 100000 }, custom: { target: 10000, log: 100000 } };
const typeOf = h => (TARGET_TYPES.includes(h.target_type) ? h.target_type : 'standard');

function weekDays(today) { const s = U.weekStart(today); return Array.from({ length: 7 }, (_, i) => ({ date: U.addDays(s, i), label: U.DOW[i] })); }
function habitView(h, logs, today) {
  const target = h.daily_target || 1, byDate = new Map(logs.map(l => [l.log_date, l.count]));
  const doneDates = logs.filter(l => l.count >= target).map(l => l.log_date), st = U.streaks(doneDates, today);
  const todayCount = byDate.get(today) || 0;
  return {
    id: h.id, name: h.name, category: h.category || 'General', daily_target: target, created_at: h.created_at,
    target_type: typeOf(h), target_unit: h.target_unit || '', target_label: h.target_label || '',
    today_count: todayCount, done_today: todayCount >= target, current_streak: st.current, longest_streak: st.longest, total_completions: doneDates.length,
    week: weekDays(today).map(d => { const c = byDate.get(d.date) || 0; return { ...d, count: c, completed: c >= target, is_today: d.date === today, is_future: d.date > today }; }),
  };
}
const logsOf = uid => { const m = new Map(); for (const l of all('SELECT habit_id,log_date,count FROM habit_logs WHERE user_id=?', uid)) { (m.get(l.habit_id) || m.set(l.habit_id, []).get(l.habit_id)).push(l); } return m; };
exports.forUser = uid => { const t = U.todayStr(), m = logsOf(uid); return all('SELECT * FROM habits WHERE user_id=? ORDER BY id', uid).map(h => habitView(h, m.get(h.id) || [], t)); };
exports.summarize = (list, today = U.todayStr()) => ({
  total: list.length, doneToday: list.filter(h => h.done_today).length,
  completionToday: list.length ? Math.round(list.filter(h => h.done_today).length / list.length * 100) : 0,
  bestCurrentStreak: Math.max(0, ...list.map(h => h.current_streak)), longestStreak: Math.max(0, ...list.map(h => h.longest_streak)),
});
const one1 = (uid, id) => { const h = one('SELECT * FROM habits WHERE id=? AND user_id=?', id, uid); return h && habitView(h, all('SELECT log_date,count FROM habit_logs WHERE habit_id=?', h.id), U.todayStr()); };

exports.list = (req, res) => {
  const today = U.todayStr(), habits = exports.forUser(req.user.id);
  const weekly = weekDays(today).map(d => ({ ...d, is_today: d.date === today, is_future: d.date > today, completed: habits.filter(h => h.week.find(w => w.date === d.date).completed).length, total: habits.length }));
  res.json({ habits, summary: exports.summarize(habits, today), weekly, categories: CATEGORIES, today });
};

function parse(b, old) {
  const out = {};
  if (b.name !== undefined || !old) { const n = String(b.name ?? '').trim().slice(0, 120); if (!n) return { error: 'name is required' }; out.name = n; }
  if (b.category !== undefined) { const c = String(b.category || 'General').trim(); const hit = CATEGORIES.find(x => x.toLowerCase() === c.toLowerCase()); if (!hit) return { error: `category must be one of: ${CATEGORIES.join(', ')}` }; out.category = hit; }
  const type = old ? typeOf(old) : (b.target_type === undefined || b.target_type === '' || b.target_type === null ? 'standard' : String(b.target_type).trim().toLowerCase());
  if (!TARGET_TYPES.includes(type)) return { error: `target_type must be one of: ${TARGET_TYPES.join(', ')}` };
  if (old && b.target_type !== undefined && b.target_type !== null && b.target_type !== '' && String(b.target_type).trim().toLowerCase() !== type) return { error: 'target_type cannot be changed after the habit is created' };
  if (!old) out.target_type = type;
  if (b.daily_target !== undefined) {
    const t = U.toInt(b.daily_target), max = LIMITS[type].target;
    if (!Number.isInteger(t) || t < 1 || t > max) return { error: type === 'duration' ? `daily_target must be a whole number of minutes between 1 and ${max}` : `daily_target must be a whole number between 1 and ${max}` };
    out.daily_target = t;
  }
  if (type === 'duration') {
    if (b.target_unit !== undefined || !old) { const u = String(b.target_unit ?? 'minutes').trim().toLowerCase(); if (!DURATION_UNITS.includes(u)) return { error: `target_unit must be one of: ${DURATION_UNITS.join(', ')}` }; out.target_unit = u; }
  } else if (type === 'count' || type === 'custom') {
    if (b.target_unit !== undefined || !old) { const u = String(b.target_unit ?? '').trim().slice(0, 30) || (type === 'count' ? 'items' : 'units'); out.target_unit = u; }
    if (type === 'custom' && (b.target_label !== undefined || !old)) { const l = String(b.target_label ?? '').trim().slice(0, 80); if (!l) return { error: 'target_label is required for a custom target' }; out.target_label = l; }
  }
  return { data: out };
}
exports.create = (req, res) => {
  const { data, error } = parse(req.body || {}, null); if (error) return bad(res, error);
  const row = { category: 'General', daily_target: 1, ...data }, k = Object.keys(row);
  const id = db.prepare(`INSERT INTO habits(user_id,${k}) VALUES(?,${k.map(() => '?')})`).run(req.user.id, ...k.map(c => row[c])).lastInsertRowid;
  log(req.user.id, `Added "${row.name.slice(0, 40)}" - Habit`);
  res.status(201).json(one1(req.user.id, id));
};
exports.update = (req, res) => {
  const id = Number(req.params.id), old = one('SELECT * FROM habits WHERE id=? AND user_id=?', id, req.user.id);
  if (!old) return bad(res, 'Not found', 404);
  const { data, error } = parse(req.body || {}, old); if (error) return bad(res, error);
  const k = Object.keys(data);
  if (k.length) db.prepare(`UPDATE habits SET ${k.map(c => c + '=?')} WHERE id=?`).run(...k.map(c => data[c]), id);
  log(req.user.id, `Updated "${(data.name || old.name).slice(0, 40)}" - Habit`);
  res.json(one1(req.user.id, id));
};
exports.remove = (req, res) => {
  const old = one('SELECT * FROM habits WHERE id=? AND user_id=?', Number(req.params.id), req.user.id);
  if (!old) return bad(res, 'Not found', 404);
  db.transaction(() => { db.prepare('DELETE FROM habit_logs WHERE habit_id=?').run(old.id); db.prepare('DELETE FROM habits WHERE id=?').run(old.id); })();
  log(req.user.id, `Deleted "${old.name.slice(0, 40)}" - Habit`);
  res.json({ ok: true });
};

function checkDate(d, today) {
  if (!U.isDate(d)) return 'date must be a valid date (YYYY-MM-DD)';
  if (d > today) return 'date cannot be in the future';
  if (U.daysBetween(d, today) > BACKFILL_DAYS) return `date cannot be more than ${BACKFILL_DAYS} days in the past`;
  return null;
}
// POST /habits/:id/logs  {date?, count?, increment?}  -> upsert: one row per habit per date (UNIQUE constraint), so repeats update instead of duplicating
exports.logDay = (req, res) => {
  const u = req.user.id, h = one('SELECT * FROM habits WHERE id=? AND user_id=?', Number(req.params.id), u), b = req.body || {}, today = U.todayStr();
  if (!h) return bad(res, 'Not found', 404);
  const date = b.date === undefined || b.date === '' ? today : b.date, e = checkDate(date, today); if (e) return bad(res, e);
  const existing = one('SELECT count FROM habit_logs WHERE habit_id=? AND log_date=?', h.id, date);
  let count;
  if (b.increment !== undefined) { const i = U.toInt(b.increment); if (!Number.isInteger(i) || i < 1) return bad(res, 'increment must be a whole number of at least 1'); count = (existing ? existing.count : 0) + i; }
  else if (b.count !== undefined) { count = U.toInt(b.count); if (!Number.isInteger(count) || count < 1) return bad(res, 'count must be a whole number of at least 1 (use DELETE to clear a day)'); }
  else count = h.daily_target || 1;
  const maxLog = LIMITS[typeOf(h)].log;
  if (count > maxLog) return bad(res, typeOf(h) === 'duration' ? `a day cannot exceed ${maxLog} minutes` : `count cannot exceed ${maxLog}`);
  db.prepare('INSERT INTO habit_logs(user_id,habit_id,log_date,count) VALUES(?,?,?,?) ON CONFLICT(habit_id,log_date) DO UPDATE SET count=excluded.count').run(u, h.id, date, count);
  const v = one1(u, h.id), wasDone = existing && existing.count >= (h.daily_target || 1);
  if (count >= (h.daily_target || 1) && !wasDone) log(u, `Completed "${h.name.slice(0, 40)}" - Habit`);
  res.status(existing ? 200 : 201).json(v);
};
exports.clearDay = (req, res) => {
  const u = req.user.id, h = one('SELECT * FROM habits WHERE id=? AND user_id=?', Number(req.params.id), u);
  if (!h) return bad(res, 'Not found', 404);
  if (!U.isDate(req.params.date)) return bad(res, 'date must be a valid date (YYYY-MM-DD)');
  db.prepare('DELETE FROM habit_logs WHERE habit_id=? AND log_date=?').run(h.id, req.params.date);
  res.json(one1(u, h.id));
};
// GET /habits/:id/history?days=30 -> daily completion history (oldest first), including empty days
exports.history = (req, res) => {
  const h = one('SELECT * FROM habits WHERE id=? AND user_id=?', Number(req.params.id), req.user.id);
  if (!h) return bad(res, 'Not found', 404);
  let days = req.query.days === undefined ? 30 : U.toInt(req.query.days);
  if (!Number.isInteger(days) || days < 1 || days > BACKFILL_DAYS) return bad(res, `days must be between 1 and ${BACKFILL_DAYS}`);
  const today = U.todayStr(), from = U.addDays(today, -(days - 1)), target = h.daily_target || 1;
  const m = new Map(all('SELECT log_date,count FROM habit_logs WHERE habit_id=? AND log_date>=?', h.id, from).map(l => [l.log_date, l.count]));
  res.json({ habit_id: h.id, daily_target: target, target_type: typeOf(h), target_unit: h.target_unit || '', target_label: h.target_label || '', history: Array.from({ length: days }, (_, i) => { const date = U.addDays(from, i), c = m.get(date) || 0; return { date, count: c, completed: c >= target }; }) });
};
