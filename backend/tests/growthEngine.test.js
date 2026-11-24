// Growth Engine: goal milestones + habit reminders must work AND must never alter habit logs, completion logic or streaks.
// Run:  NODE_ENV=test node --test tests/growthEngine.test.js        (offline: prefix NODE_PATH=tests/_shims/modules)
process.env.NODE_ENV = 'test';
process.env.DB_PATH = require('path').join(require('os').tmpdir(), `lj_test_ge_${Date.now()}.db`);
process.env.SEED_DEMO = 'false';
const { test } = require('node:test'), assert = require('node:assert/strict');
const db = require('../database/db'), U = require('../utils'), PX = require('../controllers/plannerExtras'), H = require('../controllers/habits'), G = require('../controllers/goals');
const T = U.todayStr(), d = n => U.addDays(T, n);
const uid = db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run('ge', 'ge@x.com', 'x').lastInsertRowid;
const call = (fn, { body, params, query } = {}) => { const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; fn({ user: { id: uid }, body: body || {}, params: params || {}, query: query || {} }, res); return res; };
const hid = db.prepare('INSERT INTO habits(user_id,name,daily_target) VALUES(?,?,1)').run(uid, 'Read').lastInsertRowid;
// 5-day streak ending today + an older 3-day run (longest 5) + one gap day
[0, 1, 2, 3, 4, 7, 8, 9].forEach(n => db.prepare('INSERT INTO habit_logs(user_id,habit_id,log_date,count) VALUES(?,?,?,1)').run(uid, hid, d(-n)));
const snapshot = () => ({ logs: db.prepare('SELECT habit_id,log_date,count,created_at FROM habit_logs ORDER BY id').all(), habit: db.prepare('SELECT * FROM habits WHERE id=?').get(hid), view: call(H.list).body.habits[0] });

test('baseline streaks are computed from history', () => {
  const v = snapshot().view; assert.equal(v.current_streak, 5); assert.equal(v.longest_streak, 5); assert.equal(v.total_completions, 8);
});

test('milestones + reminders leave habit logs, habit row and streaks byte-for-byte unchanged', () => {
  const before = snapshot();
  const g = db.prepare('INSERT INTO goals(user_id,title,progress,target_date) VALUES(?,?,?,?)').run(uid, 'Ship app', 10, d(60)).lastInsertRowid;
  const m = call(PX.addMilestone, { params: { goalId: g }, body: { title: 'Design', due_date: d(10) } }); assert.equal(m.code, 201);
  const id = m.body.milestones[0].id;
  assert.equal(call(PX.updateMilestone, { params: { id }, body: { title: 'Design v2', due_date: d(12) } }).body.milestones[0].title, 'Design v2');
  const done = call(PX.updateMilestone, { params: { id }, body: { completed: true } }).body; assert.equal(done.milestones_done, 1); assert.equal(done.milestone_pct, 100);
  assert.equal(call(G.list).body.goals[0].progress, 10, 'goal progress untouched');
  const r = call(PX.createReminder, { body: { habit_id: hid, remind_time: '07:30', days_of_week: [0, 2, 4] } }); assert.equal(r.code, 201);
  assert.equal(call(PX.updateReminder, { params: { id: r.body.id }, body: { remind_time: '08:00', days_of_week: [1], enabled: false } }).body.enabled, false);
  assert.equal(call(PX.updateReminder, { params: { id: r.body.id }, body: { enabled: true } }).body.enabled, true);
  call(PX.dueReminders, { query: { date: T, time: '23:59' } }); call(PX.ackReminder, { params: { id: r.body.id }, body: { date: T } });
  assert.deepEqual(snapshot(), before, 'habit data identical after milestone/reminder use');
  call(PX.removeReminder, { params: { id: r.body.id } }); call(PX.removeMilestone, { params: { id } });
  assert.deepEqual(snapshot(), before, 'still identical after deleting them');
});

test('deleting a reminder or milestone never removes completion history; completion logic still works', () => {
  const before = db.prepare('SELECT COUNT(*) c FROM habit_logs').get().c;
  assert.equal(before, 8);
  const res = call(H.logDay, { params: { id: hid }, body: { date: d(-5) } }); assert.equal(res.code, 201);
  const v = call(H.list).body.habits[0];   assert.equal(v.current_streak, 6); assert.equal(v.longest_streak, 6);
  assert.equal(call(H.clearDay, { params: { id: hid, date: d(-5) } }).body.current_streak, 5);
});

test('reminder for a completed habit is not due today; habit delete cascades only its reminders', () => {
  const r = call(PX.createReminder, { body: { habit_id: hid, remind_time: '06:00' } }).body;
  assert.deepEqual(call(PX.dueReminders, { query: { date: T, time: '23:00' } }).body.due, [], 'habit already done today');
  const h2 = db.prepare('INSERT INTO habits(user_id,name,daily_target) VALUES(?,?,1)').run(uid, 'Other').lastInsertRowid;
  const r2 = call(PX.createReminder, { body: { habit_id: h2, remind_time: '06:00' } }).body;
  assert.equal(call(PX.dueReminders, { query: { date: T, time: '23:00' } }).body.due.map(x => x.id).join(), String(r2.id));
  call(H.remove, { params: { id: h2 } }); assert.equal(call(PX.listReminders).body.reminders.map(x => x.id).join(), String(r.id));
});
