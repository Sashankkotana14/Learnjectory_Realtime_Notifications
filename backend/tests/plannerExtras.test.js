// Tests for the Study Planner additions: calendar, recurring plans, goal milestones, habit reminders.
// Handlers are called directly with a tiny req/res stub, so no HTTP server (or express) is needed.
// Run:  NODE_ENV=test node --test tests/plannerExtras.test.js        (offline: prefix NODE_PATH=tests/_shims/modules)
process.env.NODE_ENV = 'test';
process.env.DB_PATH = require('path').join(require('os').tmpdir(), `lj_test_px_${Date.now()}.db`);
process.env.SEED_DEMO = 'false';
const { test } = require('node:test'), assert = require('node:assert/strict');
const db = require('../database/db'), U = require('../utils'), PX = require('../controllers/plannerExtras'), PL = require('../controllers/planner'), G = require('../controllers/goals'), H = require('../controllers/habits');

const T = U.todayStr(), d = n => U.addDays(T, n);
const mkUser = n => db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(n, n + '@x.com', 'x').lastInsertRowid;
const A = mkUser('alice'), B = mkUser('bob');
const call = (fn, uid, { body, params, query } = {}) => { const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; fn({ user: { id: uid }, body: body || {}, params: params || {}, query: query || {} }, res); return res; };
const mkGoal = (uid, title = 'Goal', target = d(60)) => db.prepare('INSERT INTO goals(user_id,title,progress,target_date) VALUES(?,?,?,?)').run(uid, title, 0, target).lastInsertRowid;
const mkHabit = (uid, name = 'Read') => db.prepare('INSERT INTO habits(user_id,name,daily_target) VALUES(?,?,1)').run(uid, name).lastInsertRowid;
const plansOf = uid => db.prepare('SELECT * FROM study_plans WHERE user_id=? ORDER BY plan_date').all(uid);

// ---------------- recurrence rules ----------------
test('occursOn: daily, every-N-days, weekly weekdays, every-2-weeks', () => {
  const base = { interval_n: 1, interval_unit: 'days', days_of_week: '', start_date: '2026-11-23', end_date: null }; // 2026-11-23 is a Monday
  const o = PX._internal.occursOn;
  assert.ok(o({ ...base, frequency: 'daily' }, '2026-11-24')); assert.ok(!o({ ...base, frequency: 'daily' }, '2026-11-22'));
  assert.ok(o({ ...base, frequency: 'daily', interval_n: 3 }, '2026-11-26')); assert.ok(!o({ ...base, frequency: 'daily', interval_n: 3 }, '2026-11-25'));
  const wk = { ...base, frequency: 'weekly', days_of_week: '0,2' }; // Mon + Wed
  assert.ok(o(wk, '2026-11-25')); assert.ok(o(wk, '2026-11-30')); assert.ok(!o(wk, '2026-11-24'));
  const bi = { ...base, frequency: 'custom', interval_unit: 'weeks', interval_n: 2, days_of_week: '0' };
  assert.ok(o(bi, '2026-11-23')); assert.ok(!o(bi, '2026-11-30')); assert.ok(o(bi, '2026-12-07'));
  assert.ok(o({ ...base, frequency: 'custom', interval_unit: 'days', interval_n: 10 }, '2026-12-03'));
  assert.ok(!o({ ...base, frequency: 'daily', end_date: '2026-11-25' }, '2026-11-26'), 'end date respected');
});

// ---------------- recurring study plans ----------------
test('daily recurring plan creates real plans for the rolling window with exact minute split', () => {
  const r = call(PX.createRecurrence, A, { body: { title: 'Daily revision', frequency: 'daily', hours: 1, minutes: 40, start_date: T, subjects: ['Maths', 'Physics', 'Chem'] } });
  assert.equal(r.code, 201); assert.equal(r.body.description, 'Every day'); assert.equal(r.body.generated, 14);
  const plans = plansOf(A); assert.equal(plans.length, 14); assert.equal(plans[0].plan_date, T);
  const items = db.prepare('SELECT allocated_minutes m FROM study_plan_items WHERE plan_id=? ORDER BY position').all(plans[0].id).map(x => x.m);
  assert.deepEqual(items, [34, 33, 33]); // 100 / 3, remainder to the first subject - same rule as normal plans
  // they behave like normal plans: visible through the existing planner list and startable
  assert.equal(call(PL.list, A).body.plans.length, 14);
  PX._internal.syncUser(A); assert.equal(plansOf(A).length, 14, 'sync is idempotent (no duplicates)');
});
test('weekly recurring plan only lands on the chosen weekdays; custom every-3-days works', () => {
  const w = call(PX.createRecurrence, B, { body: { title: 'Mon/Wed', frequency: 'weekly', days_of_week: [0, 2], total_minutes: 60, subjects: ['Bio'] } });
  assert.equal(w.code, 201); assert.match(w.body.description, /Every week on Mon, Wed/);
  const dates = plansOf(B).map(p => p.plan_date); assert.ok(dates.length >= 2 && dates.every(x => [0, 2].includes((new Date(x + 'T00:00:00Z').getUTCDay() + 6) % 7)));
  const c = call(PX.createRecurrence, B, { body: { title: 'Every 3', frequency: 'custom', interval_n: 3, interval_unit: 'days', total_minutes: 30, subjects: ['Art'] } });
  assert.equal(c.code, 201); assert.equal(c.body.interval_unit, 'days'); assert.equal(c.body.generated, 5); // days 0,3,6,9,12 inside the 14-day window
});
test('recurrence validation', () => {
  const bad = (b, re) => { const r = call(PX.createRecurrence, A, { body: { frequency: 'daily', total_minutes: 30, subjects: ['X'], ...b } }); assert.equal(r.code, 400); assert.match(r.body.error, re); };
  bad({ frequency: 'monthly' }, /frequency/); bad({ start_date: d(-1) }, /past/); bad({ end_date: d(-1), start_date: T }, /before start/);
  bad({ days_of_week: [9], frequency: 'weekly' }, /days_of_week/); bad({ interval_n: 0 }, /interval_n/); bad({ total_minutes: 0 }, /at least 1/); bad({ total_minutes: 2000 }, /24 hours/);
  bad({ subjects: [] }, /at least one subject/); bad({ total_minutes: 1, subjects: ['a', 'b'] }, /cannot be shared/); bad({ start_date: '2026-02-30' }, /valid date/);
});
test('deleted occurrence is not re-created; update rebuilds untouched plans but keeps started ones; delete cleans up', () => {
  const uid = mkUser('carol');
  const rec = call(PX.createRecurrence, uid, { body: { title: 'R', frequency: 'daily', total_minutes: 60, subjects: ['S1'] } }).body;
  const ps = plansOf(uid); assert.equal(ps.length, 14);
  call(PL.remove, uid, { params: { id: ps[3].id } }); PX._internal.syncUser(uid); assert.equal(plansOf(uid).length, 13, 'user-deleted occurrence stays deleted');
  const item = db.prepare('SELECT id FROM study_plan_items WHERE plan_id=?').get(ps[0].id);
  call(PL.session('start'), uid, { params: { id: ps[0].id, itemId: item.id } });
  const u = call(PX.updateRecurrence, uid, { params: { id: rec.id }, body: { total_minutes: 90, title: 'R2', frequency: 'daily', interval_n: 2 } });
  assert.equal(u.code, 200); assert.equal(u.body.title, 'R2');
  const after = plansOf(uid); assert.ok(after.some(p => p.id === ps[0].id && p.title === 'R' && p.total_minutes === 60), 'started plan kept as it was');
  assert.ok(after.filter(p => p.title === 'R2').every(p => p.total_minutes === 90)); assert.equal(after.filter(p => p.title === 'R2').length, 6); // every 2 days = days 0,2,..,12 (7); day 0 is the started plan and is kept, so 6 are rebuilt
  const del = call(PX.removeRecurrence, uid, { params: { id: rec.id } }); assert.equal(del.code, 200);
  assert.deepEqual(plansOf(uid).map(p => p.id), [ps[0].id], 'only the started plan survives');
  assert.equal(call(PX.removeRecurrence, uid, { params: { id: rec.id } }).code, 404);
});
test('recurrences are private per user', () => {
  const mine = call(PX.listRecurrences, A).body.recurrences, theirs = call(PX.listRecurrences, B).body.recurrences;
  assert.ok(mine.length && theirs.length && !mine.some(r => theirs.find(t => t.id === r.id)));
  assert.equal(call(PX.updateRecurrence, B, { params: { id: mine[0].id }, body: { title: 'hack' } }).code, 404);
  assert.equal(call(PX.removeRecurrence, B, { params: { id: mine[0].id } }).code, 404);
});

// ---------------- goal milestones ----------------
test('milestones: add / validate / complete / reopen / delete, goal progress untouched', () => {
  const g = mkGoal(A, 'Finish course', d(30));
  const add = (b) => call(PX.addMilestone, A, { params: { goalId: g }, body: b });
  const r1 = add({ title: 'Module 1', due_date: d(10) }); assert.equal(r1.code, 201); assert.equal(r1.body.milestones_total, 1);
  assert.equal(add({ title: '' }).code, 400); assert.match(add({ title: 'x', due_date: d(-1) }).body.error, /past/); assert.match(add({ title: 'x', due_date: d(31) }).body.error, /after the goal/);
  assert.match(add({ title: 'x', due_date: 'nope' }).body.error, /valid date/);
  const r2 = add({ title: 'Module 2' }); assert.equal(r2.body.milestones_total, 2);
  const id = r1.body.milestones[0].id;
  const done = call(PX.updateMilestone, A, { params: { id }, body: { completed: true } }); assert.equal(done.body.milestones_done, 1); assert.equal(done.body.milestone_pct, 50); assert.equal(done.body.milestones[0].completed_at, T);
  assert.equal(call(G.list, A).body.goals.find(x => x.id === g).progress, 0, 'goal progress is not changed by milestones');
  assert.equal(call(PX.updateMilestone, A, { params: { id }, body: { completed: false } }).body.milestones_done, 0);
  assert.equal(call(PX.updateMilestone, A, { params: { id }, body: { title: 'Renamed', due_date: d(12) } }).body.milestones[0].title, 'Renamed');
  assert.equal(call(PX.removeMilestone, A, { params: { id } }).body.milestones_total, 1);
  const ov = call(PX.goals, A).body; assert.ok(ov.goals.find(x => x.id === g) && ov.summary.milestones >= 1);
});
test('milestones: isolation, limit, cascade on goal delete, activity log', () => {
  const g = mkGoal(A, 'Other'), m = call(PX.addMilestone, A, { params: { goalId: g }, body: { title: 'M' } }).body.milestones[0];
  assert.equal(call(PX.addMilestone, B, { params: { goalId: g }, body: { title: 'x' } }).code, 404);
  assert.equal(call(PX.updateMilestone, B, { params: { id: m.id }, body: { completed: true } }).code, 404);
  assert.equal(call(PX.removeMilestone, B, { params: { id: m.id } }).code, 404);
  assert.ok(!call(PX.goals, B).body.goals.some(x => x.id === g));
  for (let i = 0; i < 49; i++) call(PX.addMilestone, A, { params: { goalId: g }, body: { title: 'm' + i } });
  assert.match(call(PX.addMilestone, A, { params: { goalId: g }, body: { title: 'one too many' } }).body.error, /at most 50/);
  assert.ok(db.prepare("SELECT id FROM activity_logs WHERE user_id=? AND message LIKE '%- Milestone'").get(A));
  call(G.remove, A, { params: { id: g } });
  assert.equal(db.prepare('SELECT COUNT(*) c FROM goal_milestones WHERE goal_id=?').get(g).c, 0, 'milestones removed with their goal');
});

// ---------------- habit reminders ----------------
test('reminders: create / validate / duplicate / update / delete / isolation', () => {
  const h = mkHabit(A);
  const mk = b => call(PX.createReminder, A, { body: { habit_id: h, ...b } });
  const r = mk({ remind_time: '07:30', days_of_week: [0, 1, 2] }); assert.equal(r.code, 201); assert.deepEqual(r.body.days_of_week, [0, 1, 2]); assert.equal(r.body.enabled, true);
  assert.equal(mk({ remind_time: '7:30' }).code, 400); assert.equal(mk({ remind_time: '25:00' }).code, 400); assert.equal(mk({ remind_time: '08:00', days_of_week: [8] }).code, 400);
  assert.equal(mk({ remind_time: '07:30', days_of_week: [0, 1, 2] }).code, 409);
  assert.equal(call(PX.createReminder, A, { body: { habit_id: 99999, remind_time: '08:00' } }).code, 404);
  assert.equal(call(PX.createReminder, B, { body: { habit_id: h, remind_time: '08:00' } }).code, 404, "cannot remind for someone else's habit");
  assert.deepEqual(mk({ remind_time: '09:00', days_of_week: [0, 1, 2, 3, 4, 5, 6] }).body.days_of_week, [], 'all 7 days = every day');
  const u = call(PX.updateReminder, A, { params: { id: r.body.id }, body: { remind_time: '06:15', enabled: false } }); assert.equal(u.body.remind_time, '06:15'); assert.equal(u.body.enabled, false);
  assert.equal(call(PX.updateReminder, B, { params: { id: r.body.id }, body: { enabled: true } }).code, 404);
  assert.equal(call(PX.removeReminder, B, { params: { id: r.body.id } }).code, 404);
  assert.equal(call(PX.removeReminder, A, { params: { id: r.body.id } }).code, 200);
  for (let i = 0; i < 4; i++) mk({ remind_time: `1${i}:00` }); assert.match(mk({ remind_time: '20:00' }).body.error, /at most 5/);
});
test('reminders: due logic (time, weekday, enabled, already done, acknowledged) and cascade on habit delete', () => {
  const uid = mkUser('dave'), h = mkHabit(uid, 'Run'), date = '2026-11-24'; // Tuesday (dow 1)
  const mk = b => call(PX.createReminder, uid, { body: { habit_id: h, ...b } }).body;
  const a = mk({ remind_time: '08:00' }), onlyMon = mk({ remind_time: '08:05', days_of_week: [0] }), later = mk({ remind_time: '21:00' }), off = mk({ remind_time: '07:00', enabled: false });
  const due = (time) => call(PX.dueReminders, uid, { query: { date, time } }).body.due.map(x => x.id);
  assert.deepEqual(due('07:59'), []); assert.deepEqual(due('08:10'), [a.id]); assert.deepEqual(due('21:30').sort(), [a.id, later.id].sort());
  assert.ok(!due('23:00').includes(onlyMon.id) && !due('23:00').includes(off.id));
  call(PX.ackReminder, uid, { params: { id: a.id }, body: { date } }); assert.ok(!due('08:10').includes(a.id), 'acknowledged reminders do not repeat the same day');
  assert.ok(call(PX.dueReminders, uid, { query: { date: '2026-11-25', time: '08:10' } }).body.due.some(x => x.id === a.id), 'fires again the next day');
  db.prepare('INSERT INTO habit_logs(user_id,habit_id,log_date,count) VALUES(?,?,?,1)').run(uid, h, date);
  assert.deepEqual(due('23:00'), [], 'no reminder for a habit that is already done');
  assert.equal(call(PX.dueReminders, uid, { query: { date: 'bad', time: '08:00' } }).code, 400); assert.equal(call(PX.dueReminders, uid, { query: { date, time: '8am' } }).code, 400);
  call(H.remove, uid, { params: { id: h } });
  assert.equal(call(PX.listReminders, uid).body.reminders.length, 0, 'reminders removed with their habit');
});

// ---------------- calendar ----------------
test('calendar: plans, recurring flag, upcoming occurrences, assignments, sessions, milestones, range checks', () => {
  const uid = mkUser('erin');
  db.prepare('INSERT INTO study_plans(user_id,title,plan_date,total_minutes) VALUES(?,?,?,?)').run(uid, 'One-off', d(2), 60);
  db.prepare("INSERT INTO study_plan_items(user_id,plan_id,subject_name,allocated_minutes) VALUES(?,(SELECT MAX(id) FROM study_plans),'Maths',60)").run(uid);
  db.prepare('INSERT INTO assignments(user_id,title,subject,due_date,status) VALUES(?,?,?,?,?)').run(uid, 'Essay', 'English', d(3), 'pending');
  db.prepare('INSERT INTO study_sessions(user_id,title,session_date,duration) VALUES(?,?,?,?)').run(uid, 'Old session', d(4), 45);
  const g = mkGoal(uid, 'G', d(40)); call(PX.addMilestone, uid, { params: { goalId: g }, body: { title: 'MS', due_date: d(5) } });
  call(PX.createRecurrence, uid, { body: { title: 'Daily', frequency: 'daily', total_minutes: 30, subjects: ['Maths'] } });
  const cal = call(PX.calendar, uid, { query: { from: T, to: d(30) } }).body;
  assert.equal(cal.days[d(2)].plans.length, 2); assert.ok(cal.days[d(2)].plans.some(p => p.recurring) && cal.days[d(2)].plans.some(p => !p.recurring && p.title === 'One-off'));
  assert.equal(cal.days[d(3)].tasks[0].title, 'Essay'); assert.equal(cal.days[d(4)].tasks.find(t => t.kind === 'session').minutes, 45);
  assert.equal(cal.days[d(5)].milestones[0].goal_title, 'G');
  assert.equal(cal.days[d(20)].plans.length, 0); assert.equal(cal.days[d(20)].upcoming.length, 1, 'beyond the generated window it shows as upcoming');
  assert.equal(plansOf(uid).filter(p => p.plan_date === d(20)).length, 0, 'viewing the calendar does not create far-future plans');
  assert.equal(call(PX.calendar, uid, { query: { from: T, to: d(200) } }).code, 400); assert.equal(call(PX.calendar, uid, { query: { from: 'x', to: T } }).code, 400); assert.equal(call(PX.calendar, uid, { query: { from: T, to: d(-1) } }).code, 400);
  assert.equal(call(PX.calendar, uid).code, 200, 'defaults to the current month grid');
  const other = call(PX.calendar, B, { query: { from: T, to: d(30) } }).body; assert.ok(!JSON.stringify(other).includes('Essay') && !JSON.stringify(other).includes('One-off'));
});
