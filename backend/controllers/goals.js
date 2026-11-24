// My Goals: CRUD, no past target dates, days remaining, progress + completion
const db = require('../database/db'), U = require('../utils');
const one = (s, ...a) => db.prepare(s).get(...a);
const log = (uid, m) => db.prepare('INSERT INTO activity_logs(user_id,message) VALUES(?,?)').run(uid, m);
const bad = (res, error, status = 400) => res.status(status).json({ error });

const view = (g, today = U.todayStr()) => {
  const has = g.target_date && U.isDate(g.target_date), days = has ? U.daysBetween(today, g.target_date) : null;
  const completed = g.progress >= 100;
  return { ...g, completed, days_left: days, status: completed ? 'completed' : days !== null && days < 0 ? 'overdue' : 'active' };
};
const summarize = list => ({
  total: list.length, completed: list.filter(g => g.completed).length, active: list.filter(g => !g.completed).length,
  overdue: list.filter(g => g.status === 'overdue').length, dueSoon: list.filter(g => g.status === 'active' && g.days_left !== null && g.days_left <= 7).length,
  avgProgress: list.length ? Math.round(list.reduce((s, g) => s + g.progress, 0) / list.length) : 0,
});
exports.forUser = uid => { const t = U.todayStr(); return db.prepare('SELECT * FROM goals WHERE user_id=?').all(uid).map(g => view(g, t)); };
exports.summarize = summarize;

// GET /api/goals?status=active|completed|overdue&q=
exports.list = (req, res) => {
  const all = exports.forUser(req.user.id);
  let rows = all.slice();
  if (req.query.status) rows = rows.filter(g => g.status === req.query.status);
  if (req.query.q) rows = rows.filter(g => g.title.toLowerCase().includes(String(req.query.q).toLowerCase()));
  // open goals first (soonest deadline first, undated last), completed goals at the bottom
  rows.sort((a, b) => (a.completed - b.completed) || (a.target_date || '9999').localeCompare(b.target_date || '9999') || b.id - a.id);
  res.json({ goals: rows, summary: summarize(all), today: U.todayStr() });
};

function parse(body, old) {
  const out = {}, today = U.todayStr();
  if (body.title !== undefined || !old) { const t = String(body.title ?? '').trim().slice(0, 200); if (!t) return { error: 'title is required' }; out.title = t; }
  if (body.description !== undefined) out.description = String(body.description ?? '').trim().slice(0, 1000);
  if (body.target_date !== undefined) {
    const d = body.target_date === null ? '' : String(body.target_date).trim();
    if (d !== '') {
      if (!U.isDate(d)) return { error: 'target_date must be a valid date (YYYY-MM-DD)' };
      // past dates are rejected for new goals and whenever the date is changed (an unchanged old deadline may stay)
      if (d < today && (!old || d !== old.target_date)) return { error: 'target_date cannot be in the past' };
    }
    out.target_date = d;
  }
  if (body.progress !== undefined) {
    const p = U.toInt(body.progress);
    if (!Number.isInteger(p) || p < 0 || p > 100) return { error: 'progress must be a whole number between 0 and 100' };
    out.progress = p;
  }
  if (body.completed !== undefined) out.progress = body.completed ? 100 : Math.min(out.progress ?? (old ? old.progress : 0), 99);
  const prog = out.progress ?? (old ? old.progress : 0);
  if (prog >= 100) out.progress = 100;
  if (out.progress !== undefined || !old) out.completed_at = prog >= 100 ? (old && old.completed_at) || today : null;
  return { data: out };
}

exports.create = (req, res) => {
  const { data, error } = parse(req.body || {}, null);
  if (error) return bad(res, error);
  const k = Object.keys(data);
  const id = db.prepare(`INSERT INTO goals(user_id,${k}) VALUES(?,${k.map(() => '?')})`).run(req.user.id, ...k.map(c => data[c])).lastInsertRowid;
  log(req.user.id, `Added "${data.title.slice(0, 40)}" - Goal`);
  res.status(201).json(view(one('SELECT * FROM goals WHERE id=?', id)));
};
exports.update = (req, res) => {
  const id = Number(req.params.id), old = one('SELECT * FROM goals WHERE id=? AND user_id=?', id, req.user.id);
  if (!old) return bad(res, 'Not found', 404);
  const { data, error } = parse(req.body || {}, old);
  if (error) return bad(res, error);
  const k = Object.keys(data);
  if (k.length) db.prepare(`UPDATE goals SET ${k.map(c => c + '=?')} WHERE id=? AND user_id=?`).run(...k.map(c => data[c]), id, req.user.id);
  const row = one('SELECT * FROM goals WHERE id=?', id);
  log(req.user.id, `${old.progress < 100 && row.progress >= 100 ? 'Completed' : 'Updated'} "${row.title.slice(0, 40)}" - Goal`);
  res.json(view(row));
};
exports.remove = (req, res) => {
  const row = one('SELECT * FROM goals WHERE id=? AND user_id=?', Number(req.params.id), req.user.id);
  if (!row) return bad(res, 'Not found', 404);
  db.prepare('DELETE FROM goals WHERE id=? AND user_id=?').run(row.id, req.user.id);
  log(req.user.id, `Deleted "${row.title.slice(0, 40)}" - Goal`);
  res.json({ ok: true });
};
