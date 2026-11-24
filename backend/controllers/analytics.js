// Analytics module: every figure is computed live from the existing tables (nothing new is stored).
// GET /api/analytics?range=week|month|overall&offset=0|-1|-2...  (offset only applies to week/month: 0 = current, -1 = previous ...)
const db = require('../database/db'), U = require('../utils');
const AS = require('./assignments'), AC = require('./academics'), G = require('./goals'), H = require('./habits'), PS = require('./projects');
const all = (s, ...a) => db.prepare(s).all(...a);
const pad = n => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MLONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const POINTS = { 'A+': 4, A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7, 'C+': 2.3, C: 2, 'C-': 1.7, D: 1, F: 0 };
const RANGES = ['week', 'month', 'overall'];
const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;
const pct = (n, d) => (d > 0 ? r1(n / d * 100) : null);
const sum = (a, f = x => x) => a.reduce((s, x) => s + f(x), 0);
const dmy = s => `${+s.slice(8)} ${MONTHS[+s.slice(5, 7) - 1]}`;
// sqlite CURRENT_TIMESTAMP ('YYYY-MM-DD HH:MM:SS', UTC) / ISO timestamps / plain dates -> local YYYY-MM-DD (same clock as the rest of the app)
const dOf = ts => {
  if (!ts) return null; const s = String(ts); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s.includes('T') ? s : s.replace(' ', 'T') + 'Z'); return isNaN(t) ? null : U.todayStr(new Date(t));
};
const inRange = (d, per) => !!d && d >= per.from && d <= per.to;
const dow = d => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7;

function period(range, offset, today) {
  if (range === 'week') {
    const from = U.addDays(U.weekStart(today), offset * 7), to = U.addDays(from, 6);
    return { range, offset, from, to, label: `${dmy(from)} – ${dmy(to)} ${to.slice(0, 4)}` };
  }
  if (range === 'month') {
    let y = +today.slice(0, 4), m = +today.slice(5, 7) - 1 + offset;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return { range, offset, from: `${y}-${pad(m + 1)}-01`, to: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10), label: `${MLONG[m]} ${y}` };
  }
  return { range, offset: 0, from: null, to: today, label: 'All time' };
}

function buckets(per, today) {
  const { from, to, range } = per, out = [];
  if (range !== 'overall') {
    for (let d = from, i = 0; d <= to; d = U.addDays(d, 1), i++) out.push({ start: d, end: d, label: range === 'week' ? U.DOW[i] : String(+d.slice(8)), title: dmy(d) });
    return out;
  }
  if (U.daysBetween(from, to) <= 182) {
    for (let s = U.weekStart(from); s <= to; s = U.addDays(s, 7)) out.push({ start: s, end: U.addDays(s, 6), label: dmy(s), title: `Week of ${dmy(s)}` });
  } else {
    let y = +from.slice(0, 4), m = +from.slice(5, 7) - 1;
    while (`${y}-${pad(m + 1)}-01` <= to) {
      out.push({ start: `${y}-${pad(m + 1)}-01`, end: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10), label: `${MONTHS[m]} ${String(y).slice(2)}`, title: `${MLONG[m]} ${y}` });
      if (++m > 11) { m = 0; y++; }
    }
  }
  return out.slice(-36);
}
const inB = (d, b) => !!d && d >= b.start && d <= b.end;

// ---------- load everything once per request ----------
function load(u, today) {
  const academics = all('SELECT * FROM academics WHERE user_id=? ORDER BY subject COLLATE NOCASE', u).map(r => ({ ...r, attendance_pct: U.attendancePct(r) }));
  const assignments = AS.forUser(u), goals = G.forUser(u).map(g => ({ ...g, created: dOf(g.created_at) }));
  const projects = all('SELECT * FROM projects WHERE user_id=?', u).map(p => ({ ...p, created: dOf(p.created_at) }));
  const habitViews = H.forUser(u), logs = new Map();
  for (const l of all('SELECT habit_id,log_date,count FROM habit_logs WHERE user_id=?', u)) (logs.get(l.habit_id) || logs.set(l.habit_id, new Map()).get(l.habit_id)).set(l.log_date, l.count);
  const habits = all('SELECT id,name,category,daily_target,created_at FROM habits WHERE user_id=? ORDER BY id', u).map(h => {
    const lg = logs.get(h.id) || new Map(), first = [...lg.keys()].sort()[0], created = dOf(h.created_at) || today;
    const v = habitViews.find(x => x.id === h.id) || {};
    return { id: h.id, name: h.name, category: h.category || 'General', target: h.daily_target || 1, since: first && first < created ? first : created, logs: lg, current: v.current_streak || 0, longest: v.longest_streak || 0 };
  });
  // study time = completed planner sessions + completed legacy study sessions + Career Compass study logs
  const study = [];
  for (const r of all("SELECT i.subject_name,i.allocated_minutes m,i.completed_at,p.plan_date FROM study_plan_items i JOIN study_plans p ON p.id=i.plan_id WHERE i.user_id=? AND i.status='done'", u))
    study.push({ date: dOf(r.completed_at) || r.plan_date, minutes: r.m, subject: r.subject_name, source: 'Study Planner' });
  for (const r of all('SELECT title,session_date,duration FROM study_sessions WHERE user_id=? AND completed=1', u)) study.push({ date: r.session_date, minutes: r.duration || 0, subject: r.title || 'Study session', source: 'Study sessions' });
  for (const r of all('SELECT l.log_date,l.minutes,p.title FROM career_study_logs l JOIN career_paths p ON p.id=l.path_id WHERE l.user_id=?', u)) study.push({ date: r.log_date, minutes: r.minutes, subject: r.title, source: 'Career Compass' });
  const plans = all('SELECT i.allocated_minutes m,i.status s,p.plan_date d FROM study_plan_items i JOIN study_plans p ON p.id=i.plan_id WHERE i.user_id=?', u);
  const lessons = all('SELECT completed,completed_at FROM career_lessons WHERE user_id=?', u);
  const skills = all('SELECT level FROM skills WHERE user_id=?', u);
  const dates = [...study.map(e => e.date), ...plans.map(p => p.d), ...goals.map(g => g.created), ...projects.map(p => p.created), ...habits.map(h => h.since), ...assignments.map(a => a.due_date || dOf(a.created_at))].filter(d => d && U.isDate(d) && d <= today);
  return { today, academics, assignments, goals, projects, habits, study, plans, lessons, skills, earliest: dates.sort()[0] || today, tech: PS.projectStats(u, projects) };
}

// ---------- sections ----------
function attendance(ctx) {
  const rows = ctx.academics.map(r => ({
    id: r.id, subject: r.subject, attended: r.classes_attended || 0, total: r.classes_total || 0, missed: Math.max(0, (r.classes_total || 0) - (r.classes_attended || 0)),
    pct: r.attendance_pct, tracked: r.classes_total > 0, status: r.classes_total > 0 ? (r.attendance_pct >= 85 ? 'good' : r.attendance_pct >= 75 ? 'watch' : 'low') : 'none',
  }));
  const tracked = rows.filter(r => r.tracked), att = sum(tracked, r => r.attended), tot = sum(tracked, r => r.total);
  return {
    hasData: tracked.length > 0, scope: 'snapshot', threshold: 75, subjects: rows, overall: pct(att, tot), attended: att, total: tot,
    low: tracked.filter(r => r.status === 'low').map(r => r.subject),
    best: tracked.length ? tracked.reduce((a, b) => (b.pct > a.pct ? b : a)).subject : null, untracked: rows.filter(r => !r.tracked).length,
  };
}

function grades(ctx) {
  const rows = ctx.academics.map(r => {
    const cur = POINTS[r.grade], tgt = POINTS[r.target_grade], both = cur !== undefined && tgt !== undefined, gap = both ? r2(tgt - cur) : null;
    return { id: r.id, subject: r.subject, grade: r.grade || '', target_grade: r.target_grade || '', current: cur ?? null, target: tgt ?? null, gap, credits: r.credits || 0, progress: r.progress || 0,
      status: !both ? 'incomplete' : gap <= 0 ? 'met' : gap <= 0.7 ? 'close' : 'behind' };
  });
  const s = AC.summarize(ctx.academics), both = rows.filter(r => r.status !== 'incomplete');
  return {
    hasData: both.length > 0, scope: 'snapshot', subjects: rows, currentGpa: s.currentGpa, targetGpa: s.targetGpa,
    gpaGap: s.currentGpa !== null && s.targetGpa !== null ? r2(s.targetGpa - s.currentGpa) : null,
    met: both.filter(r => r.status === 'met').length, close: both.filter(r => r.status === 'close').length, behind: both.filter(r => r.status === 'behind').length, missing: rows.length - both.length,
  };
}

function studyHours(ctx, per, bk) {
  const today = ctx.today, ev = ctx.study.filter(e => inRange(e.date, per) && e.minutes > 0), total = sum(ev, e => e.minutes);
  const days = new Map(); for (const e of ev) days.set(e.date, (days.get(e.date) || 0) + e.minutes);
  const group = key => { const m = new Map(); for (const e of ev) m.set(e[key], (m.get(e[key]) || 0) + e.minutes); return [...m].map(([name, minutes]) => ({ name, minutes, hours: r2(minutes / 60), share: pct(minutes, total) })).sort((a, b) => b.minutes - a.minutes); };
  const last = per.to < today ? per.to : today, elapsed = Math.max(1, U.daysBetween(per.from, last) + 1);
  const best = [...days].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];
  const planned = ctx.plans.filter(p => inRange(p.d, per)), pm = sum(planned, p => p.m), dm = sum(planned.filter(p => p.s === 'done'), p => p.m);
  return {
    hasData: total > 0, totalMinutes: total, totalHours: r2(total / 60), avgMinutesPerDay: Math.round(total / elapsed), activeDays: days.size, elapsedDays: elapsed,
    bestDay: best ? { date: best[0], minutes: best[1] } : null, plannedMinutes: pm, plannedDoneMinutes: dm, adherence: pct(dm, pm),
    series: bk.map(b => { const m = sum(ev.filter(e => inB(e.date, b)), e => e.minutes); const fut = b.start > today; return { label: b.label, title: b.title, minutes: fut ? null : m, hours: fut ? null : r2(m / 60) }; }),
    bySubject: group('subject').slice(0, 8), bySource: group('source'),
  };
}

function habitSections(ctx, per, bk) {
  const today = ctx.today, last = per.to < today ? per.to : today, perDay = new Map();
  const hs = ctx.habits.map(h => ({ ...h, done: 0, elig: 0, cells: Array.from({ length: 7 }, () => ({ done: 0, eligible: 0 })), dates: {} }));
  let totalDone = 0, totalElig = 0, active = 0, perfect = 0;
  const wd = Array.from({ length: 7 }, () => ({ done: 0, eligible: 0 }));
  for (let d = per.from; d <= last; d = U.addDays(d, 1)) {
    const w = dow(d); let done = 0, elig = 0;
    for (const h of hs) {
      if (h.since > d) continue;
      const ok = (h.logs.get(d) || 0) >= h.target; elig++; h.elig++; h.cells[w].eligible++; wd[w].eligible++;
      if (ok) { done++; h.done++; h.cells[w].done++; wd[w].done++; }
      if (per.range === 'week') h.dates[d] = ok ? 1 : 0;
    }
    perDay.set(d, { done, elig }); totalDone += done; totalElig += elig; if (done) active++; if (elig && done === elig) perfect++;
  }
  const trend = bk.map(b => {
    if (b.start > today) return { label: b.label, title: b.title, rate: null, done: null, eligible: null };
    let done = 0, elig = 0; for (let d = b.start < per.from ? per.from : b.start; d <= (b.end < last ? b.end : last); d = U.addDays(d, 1)) { const x = perDay.get(d); if (x) { done += x.done; elig += x.elig; } }
    return { label: b.label, title: b.title, rate: pct(done, elig), done, eligible: elig };
  });
  const rates = trend.filter(t => t.rate !== null);
  const hasData = ctx.habits.length > 0 && totalElig > 0;
  const habitStats = hs.map(h => ({ id: h.id, name: h.name, category: h.category, completedDays: h.done, eligibleDays: h.elig, rate: pct(h.done, h.elig), currentStreak: h.current, longestStreak: h.longest }));
  const trends = {
    hasData, habitCount: ctx.habits.length, completionRate: pct(totalDone, totalElig), completions: totalDone, possible: totalElig, activeDays: active, perfectDays: perfect,
    bestStreak: Math.max(0, ...ctx.habits.map(h => h.current)), longestStreak: Math.max(0, ...ctx.habits.map(h => h.longest)),
    bestPeriod: rates.length ? rates.reduce((a, b) => (b.rate > a.rate ? b : a)).title : null, series: trend, habits: habitStats.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1)),
  };
  const weekly = {
    hasData, perDate: per.range === 'week', days: U.DOW.map((l, i) => ({ label: l, date: per.range === 'week' ? U.addDays(per.from, i) : null, done: wd[i].done, eligible: wd[i].eligible, rate: pct(wd[i].done, wd[i].eligible) })),
    habits: hs.map(h => ({ id: h.id, name: h.name, category: h.category, cells: h.cells.map((c, i) => ({ label: U.DOW[i], done: c.done, eligible: c.eligible, date: per.range === 'week' ? U.addDays(per.from, i) : null })) })),
    bestDay: wd.some(x => x.done) ? U.DOW[wd.reduce((bi, x, i, a) => (pct(x.done, x.eligible) > pct(a[bi].done, a[bi].eligible) ? i : bi), 0)] : null,
  };
  return { trends, weekly };
}

function goalsSection(ctx, per, bk) {
  const today = ctx.today, asOf = per.to < today ? per.to : today, rangeFrom = per.from || '0000-00-00';
  const completed = ctx.goals.filter(g => g.completed && (per.range === 'overall' || (g.completed_at >= rangeFrom && g.completed_at <= per.to)));
  // ongoing = already created by the end of the period and not yet completed at that moment
  const ongoing = ctx.goals.filter(g => (g.created || '0') <= per.to && (!g.completed || (g.completed_at || '') > per.to));
  const overdue = ongoing.filter(g => g.target_date && U.isDate(g.target_date) && g.target_date < asOf);
  const item = (g, st) => ({ id: g.id, title: g.title, progress: g.progress, target_date: g.target_date || null, completed_at: g.completed_at || null, days_left: g.target_date && U.isDate(g.target_date) ? U.daysBetween(today, g.target_date) : null, state: st });
  const items = [...ongoing.map(g => item(g, overdue.includes(g) ? 'overdue' : 'ongoing')), ...completed.map(g => item(g, 'completed'))];
  const total = completed.length + ongoing.length, onTrack = ongoing.length - overdue.length;
  return {
    hasData: total > 0, completed: completed.length, ongoing: ongoing.length, onTrack, overdue: overdue.length, total, completionRate: pct(completed.length, total),
    avgOngoingProgress: ongoing.length ? Math.round(sum(ongoing, g => g.progress) / ongoing.length) : null,
    chart: [{ name: 'Completed', value: completed.length }, { name: 'Ongoing', value: onTrack }, { name: 'Overdue', value: overdue.length }].filter(x => x.value > 0),
    series: bk.map(b => ({ label: b.label, title: b.title, completed: b.start > today ? null : completed.filter(g => inB(g.completed_at, b)).length })),
    items: items.sort((a, b) => ({ overdue: 0, ongoing: 1, completed: 2 }[a.state] - { overdue: 0, ongoing: 1, completed: 2 }[b.state]) || (a.target_date || '9999').localeCompare(b.target_date || '9999')),
  };
}

function overdueSection(ctx, per, bk) {
  const today = ctx.today, valid = a => a.due_date && U.isDate(a.due_date);
  const list = per.range === 'overall' ? ctx.assignments : ctx.assignments.filter(a => valid(a) && inRange(a.due_date, per));
  const isOver = a => a.status !== 'done' && valid(a) && a.due_date < today, isLate = a => a.status === 'done' && valid(a) && a.completed_at && a.completed_at > a.due_date;
  const over = list.filter(isOver), late = list.filter(isLate), done = list.filter(a => a.status === 'done');
  const pending = list.filter(a => a.status !== 'done' && !isOver(a)), days = a => U.daysBetween(a.due_date, today);
  const bucket = (lo, hi) => over.filter(a => days(a) >= lo && days(a) <= hi).length;
  const subj = new Map(); for (const a of list) { const k = a.subject || 'No subject', e = subj.get(k) || { subject: k, overdue: 0, total: 0 }; e.total++; if (isOver(a)) e.overdue++; subj.set(k, e); }
  return {
    hasData: list.length > 0, total: list.length, completed: done.length, completedOnTime: done.length - late.length, completedLate: late.length, overdue: over.length, pending: pending.length,
    overdueRate: pct(over.length, list.length), onTimeRate: pct(done.length - late.length, done.length), completionRate: pct(done.length, list.length),
    ageing: [{ name: '1–2 days', value: bucket(1, 2) }, { name: '3–7 days', value: bucket(3, 7) }, { name: '8–14 days', value: bucket(8, 14) }, { name: '15+ days', value: bucket(15, 1e6) }],
    bySubject: [...subj.values()].filter(s => s.overdue > 0).sort((a, b) => b.overdue - a.overdue),
    series: bk.map(b => { const x = list.filter(a => inB(a.due_date, b)); return { label: b.label, title: b.title, onTime: x.filter(a => a.status === 'done' && !isLate(a)).length, late: x.filter(isLate).length, overdue: x.filter(isOver).length, pending: x.filter(a => a.status !== 'done' && !isOver(a)).length }; }),
    items: over.sort((a, b) => days(b) - days(a)).slice(0, 10).map(a => ({ id: a.id, title: a.title, subject: a.subject || '', due_date: a.due_date, days_overdue: days(a) })),
  };
}

function projectSection(ctx, per, bk) {
  const today = ctx.today, rangeFrom = per.from || '0000-00-00';
  const upTo = ctx.projects.filter(p => (p.created || '0') <= per.to), created = upTo.filter(p => (p.created || '') >= rangeFrom);
  const doneNow = ctx.projects.filter(p => p.status === 'completed' && (per.range === 'overall' || (p.completed_at >= rangeFrom && p.completed_at <= per.to)));
  const by = s => upTo.filter(p => p.status === s).length, withDur = ctx.projects.filter(p => p.status === 'completed' && p.completed_at && p.created);
  const techs = new Map(); for (const p of upTo) for (const t of String(p.technologies || '').split(',').map(x => x.trim()).filter(Boolean)) { const k = t.toLowerCase(), e = techs.get(k) || { name: t, count: 0 }; e.count++; techs.set(k, e); }
  return {
    hasData: upTo.length > 0, scope: 'status-snapshot', total: upTo.length, planning: by('planning'), active: by('active'), onHold: by('on_hold'), completed: by('completed'),
    completionRate: pct(by('completed'), upTo.length), createdInPeriod: created.length, completedInPeriod: doneNow.length,
    avgDaysToComplete: withDur.length ? Math.round(sum(withDur, p => Math.max(0, U.daysBetween(p.created, p.completed_at))) / withDur.length) : null,
    chart: [{ name: 'Planning', value: by('planning') }, { name: 'Active', value: by('active') }, { name: 'On hold', value: by('on_hold') }, { name: 'Completed', value: by('completed') }].filter(x => x.value > 0),
    technologies: [...techs.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 8),
    series: bk.map(b => ({ label: b.label, title: b.title, started: b.start > today ? null : ctx.projects.filter(p => inB(p.created, b)).length, completed: b.start > today ? null : ctx.projects.filter(p => p.status === 'completed' && inB(p.completed_at, b)).length })),
    items: upTo.sort((a, b) => b.id - a.id).slice(0, 12).map(p => ({ id: p.id, title: p.title, status: p.status, technologies: String(p.technologies || '').split(',').map(x => x.trim()).filter(Boolean), created: p.created, completed_at: p.completed_at || null, repo_url: p.repo_url || '' })),
  };
}

function learning(ctx, per, parts) {
  const { goals, overdue, projects, trends, studyHours: sh } = parts, today = ctx.today, c = [];
  const add = (key, label, value, detail) => { if (value !== null && value !== undefined) c.push({ key, label, value: Math.round(value), detail }); };
  const ac = ctx.academics;
  add('academics', 'Academic progress', ac.length ? sum(ac, r => r.progress || 0) / ac.length : null, `${ac.length} subject${ac.length === 1 ? '' : 's'}, average progress`);
  add('assignments', 'Assignments completed', overdue.completionRate, `${overdue.completed} of ${overdue.total} assignments`);
  const inPlay = ctx.goals.filter(g => (g.completed && (per.range === 'overall' || inRange(g.completed_at, per))) || (!g.completed && (g.created || '0') <= per.to));
  add('goals', 'Goal progress', inPlay.length ? sum(inPlay, g => g.progress) / inPlay.length : null, `${inPlay.length} goal${inPlay.length === 1 ? '' : 's'}, average progress`);
  add('habits', 'Habit consistency', trends.hasData ? trends.completionRate : null, `${trends.completions} of ${trends.possible} habit-days`);
  add('study', 'Study plan adherence', sh.adherence, `${sh.plannedDoneMinutes} of ${sh.plannedMinutes} planned minutes`);
  add('career', 'Career lessons', ctx.lessons.length ? sum(ctx.lessons, l => (l.completed ? 1 : 0)) / ctx.lessons.length * 100 : null, `${sum(ctx.lessons, l => (l.completed ? 1 : 0))} of ${ctx.lessons.length} lessons`);
  add('projects', 'Project completion', projects.hasData ? projects.completionRate : null, `${projects.completed} of ${projects.total} projects`);
  const score = c.length ? Math.round(sum(c, x => x.value) / c.length) : null;
  return {
    hasData: c.length > 0, score, level: score === null ? null : score >= 75 ? 'Excellent' : score >= 50 ? 'Strong progress' : score >= 25 ? 'Building momentum' : 'Getting started',
    components: c, skills: { count: ctx.skills.length, avgLevel: ctx.skills.length ? Math.round(sum(ctx.skills, s => s.level || 0) / ctx.skills.length) : null },
  };
}

function compute(ctx, per) {
  const bk = buckets(per, ctx.today), hb = habitSections(ctx, per, bk);
  const parts = { studyHours: studyHours(ctx, per, bk), trends: hb.trends, weekly: hb.weekly, goals: goalsSection(ctx, per, bk), overdue: overdueSection(ctx, per, bk), projects: projectSection(ctx, per, bk) };
  return { ...parts, learning: learning(ctx, per, parts) };
}

exports.analytics = (req, res) => {
  const u = req.user.id, today = U.todayStr(), range = req.query.range === undefined ? 'overall' : String(req.query.range);
  if (!RANGES.includes(range)) return res.status(400).json({ error: 'range must be week, month or overall' });
  const offset = req.query.offset === undefined || range === 'overall' ? 0 : U.toInt(req.query.offset);
  if (!Number.isInteger(offset) || offset > 0 || offset < -240) return res.status(400).json({ error: 'offset must be a whole number between -240 and 0' });
  const ctx = load(u, today), per = period(range, offset, today);
  if (range === 'overall') per.from = ctx.earliest;
  const cur = compute(ctx, per);
  let comparison = null;
  if (range !== 'overall') {
    const prev = compute(ctx, period(range, offset - 1, today));
    comparison = { label: range === 'week' ? 'previous week' : 'previous month', studyMinutes: prev.studyHours.totalMinutes, habitRate: prev.trends.completionRate, score: prev.learning.score, completedGoals: prev.goals.completed, overdue: prev.overdue.overdue };
  }
  res.json({
    range, offset, today, period: { from: per.from, to: per.to, label: per.label, isCurrent: offset === 0 }, comparison,
    attendance: attendance(ctx), grades: grades(ctx), studyHours: cur.studyHours, habitTrends: cur.trends, weeklyHabits: cur.weekly,
    goals: cur.goals, overdueAssignments: cur.overdue, projects: cur.projects, learning: cur.learning,
    // legacy keys (unchanged shape, all-time) so the original charts keep working
    subjects: all('SELECT subject name,progress value FROM academics WHERE user_id=?', u),
    assignments: all('SELECT status name,COUNT(*) value FROM assignments WHERE user_id=? GROUP BY status', u),
    study: all('SELECT session_date name,SUM(duration) value FROM study_sessions WHERE user_id=? GROUP BY session_date ORDER BY session_date', u),
    skills: all('SELECT name,level value FROM skills WHERE user_id=?', u),
  });
};
