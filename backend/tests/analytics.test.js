// Analytics module tests: real controller + real SQLite (temp DB), mock req/res. Needs only Node (uses tests/_shims when better-sqlite3 is missing).
//   cd backend && npm run test:analytics
const os = require('os'), path = require('path'), fs = require('fs'), stamp = Date.now() + '_' + process.pid;
process.env.NODE_ENV = 'test'; process.env.SEED_DEMO = 'false'; process.env.DB_PATH = path.join(os.tmpdir(), `lj_analytics_${stamp}.db`);
const { test, after } = require('node:test'), assert = require('node:assert/strict');
const db = require('../database/db'), U = require('../utils'), AN = require('../controllers/analytics');
after(() => { try { db.close && db.close(); } catch { /* ignore */ } for (const s of ['', '-wal', '-shm']) fs.rmSync(process.env.DB_PATH + s, { force: true }); });

const user = n => db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(n, n.toLowerCase() + '@an.local', 'x').lastInsertRowid;
const A = user('Alice'), B = user('Bob');
const T = U.todayStr(), WS = U.weekStart(T), d = n => U.addDays(T, n), w = n => U.addDays(WS, n);
const get = (uid, query = {}) => { let out; AN.analytics({ user: { id: uid }, query }, { status(c) { this.c = c; return this; }, json(b) { out = { status: this.c || 200, body: b }; } }); return out; };
const ok = (uid, q) => { const r = get(uid, q); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };
const ins = (t, uid, o) => { const k = Object.keys(o); return db.prepare(`INSERT INTO ${t}(user_id,${k}) VALUES(?,${k.map(() => '?')})`).run(uid, ...Object.values(o)).lastInsertRowid; };

// ---------- seed user A (every module Analytics reads) ----------
ins('academics', A, { subject: 'Mathematics', progress: 80, grade: 'A-', target_grade: 'A', credits: 4, classes_attended: 34, classes_total: 38 });
ins('academics', A, { subject: 'Physics', progress: 60, grade: 'B+', target_grade: 'A-', credits: 4, classes_attended: 20, classes_total: 34 });
ins('academics', A, { subject: 'English', progress: 40, grade: 'B', target_grade: '', credits: 2, classes_attended: 0, classes_total: 0 });
ins('academics', A, { subject: 'Chemistry', progress: 90, grade: 'A', target_grade: 'A-', credits: 3 });
const plan = db.prepare('INSERT INTO study_plans(user_id,title,plan_date,total_minutes) VALUES(?,?,?,?)').run(A, 'Plan', T, 120).lastInsertRowid;
db.prepare('INSERT INTO study_plan_items(user_id,plan_id,subject_name,allocated_minutes,status,completed_at,position) VALUES(?,?,?,?,?,?,0)').run(A, plan, 'Mathematics', 60, 'done', new Date().toISOString());
db.prepare("INSERT INTO study_plan_items(user_id,plan_id,subject_name,allocated_minutes,status,position) VALUES(?,?,?,?,'pending',1)").run(A, plan, 'Physics', 60);
ins('study_sessions', A, { title: 'Revision', session_date: w(0), duration: 30, completed: 1 });
ins('study_sessions', A, { title: 'Not done', session_date: w(0), duration: 500, completed: 0 }); // must NOT count
const path1 = db.prepare('INSERT INTO career_paths(user_id,title) VALUES(?,?)').run(A, 'Web path').lastInsertRowid;
db.prepare('INSERT INTO career_study_logs(user_id,path_id,log_date,minutes) VALUES(?,?,?,?)').run(A, path1, w(-1), 45);
db.prepare("INSERT INTO career_lessons(user_id,path_id,stage,title,completed,completed_at) VALUES(?,?,'Beginner','L1',1,?)").run(A, path1, T);
db.prepare("INSERT INTO career_lessons(user_id,path_id,stage,title,completed) VALUES(?,?,'Beginner','L2',0)").run(A, path1);
const h1 = ins('habits', A, { name: 'Read', category: 'Study' }), h2 = ins('habits', A, { name: 'Workout', category: 'Fitness' });
for (const [h, date] of [[h1, w(-1)], [h1, w(0)], [h2, w(0)]]) db.prepare('INSERT INTO habit_logs(user_id,habit_id,log_date,count) VALUES(?,?,?,1)').run(A, h, date);
ins('goals', A, { title: 'Done goal', progress: 100, completed_at: T, target_date: d(10) });
ins('goals', A, { title: 'On track', progress: 40, target_date: d(30) });
ins('goals', A, { title: 'Late goal', progress: 10, target_date: d(-5) });
ins('assignments', A, { title: 'a1', subject: 'Physics', due_date: w(-2), status: 'pending' });
ins('assignments', A, { title: 'a2', subject: 'Physics', due_date: w(-10), status: 'in_progress' });
ins('assignments', A, { title: 'a3', subject: 'Mathematics', due_date: d(2), status: 'pending' });
ins('assignments', A, { title: 'a4', subject: 'Mathematics', due_date: w(-1), status: 'done', completed_at: T }); // finished late
ins('assignments', A, { title: 'a5', subject: 'English', due_date: T, status: 'done', completed_at: T }); // on time
ins('projects', A, { title: 'Done project', status: 'completed', technologies: 'React, Node', completed_at: T });
ins('projects', A, { title: 'Active project', status: 'active', technologies: 'react' });
ins('skills', A, { name: 'JS', level: 80 });

test('validation: bad range / offset are rejected, defaults to overall', () => {
  assert.equal(get(A, { range: 'year' }).status, 400); assert.equal(get(A, { range: 'week', offset: '1' }).status, 400);
  assert.equal(get(A, { range: 'week', offset: 'x' }).status, 400); assert.equal(get(A, { range: 'week', offset: '-9999' }).status, 400);
  assert.equal(ok(A, {}).range, 'overall');
});

test('periods: week = Mon-Sun, month = calendar month (incl. previous month across a year boundary), overall ends today', () => {
  const wk = ok(A, { range: 'week' }); assert.equal(wk.period.from, WS); assert.equal(wk.period.to, U.addDays(WS, 6)); assert.equal(wk.studyHours.series.length, 7);
  assert.deepEqual(wk.studyHours.series.map(s => s.label), U.DOW);
  const mo = ok(A, { range: 'month' }), y = +T.slice(0, 4), m = +T.slice(5, 7);
  assert.equal(mo.period.from, `${y}-${String(m).padStart(2, '0')}-01`); assert.equal(mo.studyHours.series.length, new Date(Date.UTC(y, m, 0)).getUTCDate());
  const pm = ok(A, { range: 'month', offset: '-1' }), py = m === 1 ? y - 1 : y, pmm = m === 1 ? 12 : m - 1;
  assert.equal(pm.period.from, `${py}-${String(pmm).padStart(2, '0')}-01`); assert.equal(pm.period.to, new Date(Date.UTC(py, pmm, 0)).toISOString().slice(0, 10));
  assert.equal(ok(A, { range: 'overall' }).period.to, T); assert.equal(wk.period.isCurrent, true); assert.equal(ok(A, { range: 'week', offset: '-1' }).period.isCurrent, false);
});

test('attendance by subject: real percentages, low-attendance flag, untracked subjects', () => {
  const a = ok(A, { range: 'week' }).attendance, m = a.subjects.find(s => s.subject === 'Mathematics'), p = a.subjects.find(s => s.subject === 'Physics');
  assert.equal(m.pct, 89.5); assert.equal(m.status, 'good'); assert.equal(p.pct, 58.8); assert.equal(p.status, 'low'); assert.equal(p.missed, 14);
  assert.equal(a.attended, 54); assert.equal(a.total, 72); assert.equal(a.overall, 75); assert.deepEqual(a.low, ['Physics']); assert.equal(a.untracked, 2); assert.equal(a.best, 'Mathematics');
  assert.equal(ok(A, { range: 'overall' }).attendance.overall, 75); // attendance is a snapshot: not changed by the filter
});

test('grade comparison: points, gaps, status, GPA; subjects without both grades are reported as incomplete', () => {
  const g = ok(A, { range: 'month' }).grades, by = n => g.subjects.find(s => s.subject === n);
  assert.equal(by('Mathematics').gap, 0.3); assert.equal(by('Mathematics').status, 'close'); assert.equal(by('Physics').gap, 0.4);
  assert.equal(by('Chemistry').gap, -0.3); assert.equal(by('Chemistry').status, 'met'); assert.equal(by('English').status, 'incomplete');
  assert.equal(g.met, 1); assert.equal(g.close, 2); assert.equal(g.behind, 0); assert.equal(g.missing, 1); assert.ok(g.currentGpa > 0 && g.targetGpa > 0);
});

test('weekly study hours: completed planner + legacy + career logs only, per period, with breakdowns and comparison', () => {
  const wk = ok(A, { range: 'week' }), s = wk.studyHours;
  assert.equal(s.totalMinutes, 90); assert.equal(s.totalHours, 1.5); // 60 planner + 30 legacy (pending 500 min and pending planner item are ignored)
  assert.equal(s.series.reduce((x, p) => x + (p.minutes || 0), 0), 90); assert.equal(s.bySource.length, 2); assert.equal(s.bySubject[0].name, 'Mathematics');
  assert.equal(s.plannedMinutes, 120); assert.equal(s.plannedDoneMinutes, 60); assert.equal(s.adherence, 50);
  assert.equal(wk.comparison.studyMinutes, 45); assert.equal(wk.comparison.label, 'previous week');
  const prev = ok(A, { range: 'week', offset: '-1' }).studyHours; assert.equal(prev.totalMinutes, 45); assert.equal(prev.bySource[0].name, 'Career Compass');
  assert.equal(ok(A, { range: 'overall' }).studyHours.totalMinutes, 135);
  if (T < U.addDays(WS, 6)) assert.equal(s.series[6].minutes, null); // future days are gaps, not zeros
});

test('habit completion trends + weekly activity', () => {
  const wk = ok(A, { range: 'week' }), t = wk.habitTrends, wa = wk.weeklyHabits;
  assert.equal(t.series.length, 7); assert.equal(t.series[0].rate, 100); assert.equal(t.series[0].done, 2); assert.equal(t.habitCount, 2);
  assert.equal(wa.perDate, true); assert.equal(wa.days[0].date, WS); assert.equal(wa.days[0].done, 2); assert.equal(wa.habits.length, 2);
  assert.equal(wa.habits[0].cells[0].done, 1); assert.equal(wa.habits[0].cells[0].date, WS);
  assert.equal(wk.comparison.habitRate, 100); // previous Sunday: only "Read" existed and was done
  const ov = ok(A, { range: 'overall' }); assert.equal(ov.weeklyHabits.perDate, false); assert.ok(ov.habitTrends.completionRate > 0 && ov.habitTrends.completionRate <= 100);
  assert.ok(t.habits.every(h => h.eligibleDays >= h.completedDays));
});

test('goals completed vs ongoing: period filter, overdue subset, historical periods', () => {
  const g = ok(A, { range: 'month' }).goals;
  assert.equal(g.completed, 1); assert.equal(g.ongoing, 2); assert.equal(g.overdue, 1); assert.equal(g.onTrack, 1); assert.equal(g.total, 3); assert.equal(g.completionRate, 33.3);
  assert.deepEqual(g.chart.map(x => x.name), ['Completed', 'Ongoing', 'Overdue']); assert.equal(g.items[0].state, 'overdue'); assert.equal(g.avgOngoingProgress, 25);
  const prev = ok(A, { range: 'week', offset: '-1' }).goals; assert.equal(prev.hasData, false); assert.equal(prev.total, 0); // goals did not exist last week
  assert.equal(ok(A, { range: 'overall' }).goals.completed, 1);
});

test('overdue assignments: overall, period filter, late vs on-time, ageing, per subject', () => {
  const o = ok(A, { range: 'overall' }).overdueAssignments;
  assert.equal(o.total, 5); assert.equal(o.overdue, 2); assert.equal(o.completed, 2); assert.equal(o.completedLate, 1); assert.equal(o.completedOnTime, 1); assert.equal(o.pending, 1);
  assert.equal(o.overdueRate, 40); assert.equal(o.onTimeRate, 50); assert.deepEqual(o.bySubject, [{ subject: 'Physics', overdue: 2, total: 2 }]);
  assert.equal(o.ageing.reduce((s, x) => s + x.value, 0), 2); assert.equal(o.items[0].title, 'a2'); assert.ok(o.items[0].days_overdue > o.items[1].days_overdue);
  const p = ok(A, { range: 'week', offset: '-1' }).overdueAssignments; assert.equal(p.total, 2); assert.equal(p.overdue, 1); assert.equal(p.completedLate, 1);
});

test('project performance', () => {
  const p = ok(A, { range: 'overall' }).projects;
  assert.equal(p.total, 2); assert.equal(p.completed, 1); assert.equal(p.active, 1); assert.equal(p.completionRate, 50); assert.equal(p.completedInPeriod, 1);
  assert.equal(p.technologies[0].name, 'React'); assert.equal(p.technologies[0].count, 2); assert.ok(p.avgDaysToComplete >= 0); assert.equal(p.items.length, 2);
  assert.equal(ok(A, { range: 'week', offset: '-1' }).projects.hasData, false);
});

test('overall learning progress: composite of available components, 0-100, trend input', () => {
  const l = ok(A, { range: 'month' }).learning, keys = l.components.map(c => c.key);
  assert.ok(l.hasData && l.score >= 0 && l.score <= 100); for (const k of ['academics', 'assignments', 'goals', 'habits', 'study', 'career', 'projects']) assert.ok(keys.includes(k), k);
  assert.equal(l.components.find(c => c.key === 'career').value, 50); assert.equal(l.components.find(c => c.key === 'academics').value, 68);
  assert.equal(l.score, Math.round(l.components.reduce((s, c) => s + c.value, 0) / l.components.length)); assert.equal(l.skills.count, 1);
  assert.equal(typeof ok(A, { range: 'week' }).comparison.score, 'number');
});

test('empty states + data isolation: a new user sees no data and none of user A\'s', () => {
  for (const range of ['week', 'month', 'overall']) {
    const b = ok(B, { range });
    for (const k of ['attendance', 'grades', 'studyHours', 'habitTrends', 'weeklyHabits', 'goals', 'overdueAssignments', 'projects', 'learning']) assert.equal(b[k].hasData, false, `${range}/${k}`);
    assert.equal(b.learning.score, null); assert.equal(b.studyHours.totalMinutes, 0); assert.equal(b.subjects.length, 0);
  }
});

test('legacy chart data is still returned unchanged for the original charts', () => {
  const r = ok(A, { range: 'week' });
  assert.equal(r.subjects.length, 4); assert.equal(JSON.stringify(r.skills), JSON.stringify([{ name: 'JS', value: 80 }])); assert.ok(Array.isArray(r.assignments) && Array.isArray(r.study));
  assert.equal(JSON.stringify(r.study), JSON.stringify([{ name: w(0), value: 530 }])); // legacy chart semantics (all legacy study_sessions rows) are preserved exactly
});
