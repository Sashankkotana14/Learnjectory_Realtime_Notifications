process.env.NODE_ENV = 'test';
process.env.DB_PATH = require('path').join(require('os').tmpdir(), `lj_test_1b_${Date.now()}.db`);
process.env.JWT_SECRET = 'test_secret_' + 'y'.repeat(40);
process.env.SEED_DEMO = 'true';
const { test, before, after } = require('node:test'), assert = require('node:assert/strict');
const app = require('../server'), U = require('../utils'), db = require('../database/db');
let server, base, A, B;
before(() => new Promise(r => { server = app.listen(0, () => { base = 'http://localhost:' + server.address().port + '/api'; r(); }); }));
after(() => server.close());
const call = async (path, method = 'GET', body, token = A) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const T = U.todayStr(), d = n => U.addDays(T, n);
const sum = a => a.reduce((s, x) => s + x, 0);

test('setup users', async () => {
  A = (await call('/auth/register', 'POST', { name: 'Alice', email: 'a1b@x.com', password: 'password1' }, null)).body.token;
  B = (await call('/auth/register', 'POST', { name: 'Bob', email: 'b1b@x.com', password: 'password2' }, null)).body.token;
  assert.ok(A && B);
});

// ---------- pure logic / date handling ----------
test('date helpers: addDays, weekStart (Monday), month/year/leap boundaries', () => {
  assert.equal(U.addDays('2026-12-31', 1), '2027-01-01'); assert.equal(U.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(U.addDays('2027-02-28', 1), '2027-03-01'); assert.equal(U.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(U.weekStart('2026-11-22'), '2026-11-16'); // a Sunday -> previous Monday
  assert.equal(U.weekStart('2026-11-16'), '2026-11-16'); assert.equal(U.weekStart('2026-11-18'), '2026-11-16');
  assert.equal(U.weekStart('2027-01-01'), '2026-12-28');
  assert.equal(U.daysBetween('2026-03-28', '2026-03-30'), 2); // across a DST change in many zones
  assert.equal(U.isDate('2026-02-30'), false); assert.equal(U.isDate('2028-02-29'), true);
});
test('distribute: parts always sum to total, remainder goes one minute at a time to the first sessions', () => {
  assert.deepEqual(U.distribute(60, 3), [20, 20, 20]); assert.deepEqual(U.distribute(100, 3), [34, 33, 33]);
  assert.deepEqual(U.distribute(10, 3), [4, 3, 3]); assert.deepEqual(U.distribute(5, 5), [1, 1, 1, 1, 1]); assert.deepEqual(U.distribute(7, 1), [7]);
  for (let total = 1; total <= 300; total += 7) for (let n = 1; n <= Math.min(total, 12); n++) {
    const p = U.distribute(total, n); assert.equal(sum(p), total); assert.ok(Math.max(...p) - Math.min(...p) <= 1);
  }
});
test('streaks: current (alive until end of today), longest, gaps, duplicates', () => {
  const t = '2026-11-22';
  assert.deepEqual(U.streaks([], t), { current: 0, longest: 0 });
  assert.deepEqual(U.streaks(['2026-11-22', '2026-11-21', '2026-11-20'], t), { current: 3, longest: 3 });
  assert.deepEqual(U.streaks(['2026-11-21', '2026-11-20'], t), { current: 2, longest: 2 });      // today not done yet -> streak still alive
  assert.deepEqual(U.streaks(['2026-11-20'], t), { current: 0, longest: 1 });                    // missed yesterday -> broken
  assert.deepEqual(U.streaks(['2026-11-22', '2026-11-20', '2026-11-19', '2026-11-18', '2026-11-17'], t), { current: 1, longest: 4 });
  assert.deepEqual(U.streaks(['2026-12-30', '2026-12-31', '2027-01-01'], '2027-01-01'), { current: 3, longest: 3 }); // year boundary
  assert.deepEqual(U.streaks(['2026-11-22', '2026-11-22'], t), { current: 1, longest: 1 });
});

// ---------- study planner ----------
test('planner: auth required, validation', async () => {
  assert.equal((await call('/study-plans', 'GET', null, null)).status, 401);
  const bad = async (b, re) => { const r = await call('/study-plans', 'POST', b); assert.equal(r.status, 400, JSON.stringify(b)); if (re) assert.match(r.body.error, re); };
  await bad({ hours: 1, minutes: 0, subjects: [] }, /subject/i);
  await bad({ hours: 1, minutes: 0 }, /subject/i);
  await bad({ hours: 0, minutes: 0, subjects: ['Math'] }, /at least 1 minute/);
  await bad({ hours: 25, minutes: 0, subjects: ['Math'] }, /24 hours/);
  await bad({ hours: 1, minutes: 60, subjects: ['Math'] }, /0 and 59/);
  await bad({ hours: -1, minutes: 0, subjects: ['Math'] }, /non-negative/);
  await bad({ hours: 1.5, minutes: 0, subjects: ['Math'] }, /whole/);
  await bad({ hours: 0, minutes: 2, subjects: ['A', 'B', 'C'] }, /cannot be shared/);
  await bad({ hours: 1, subjects: [{ id: 99999 }] }, /Unknown subject/);
  await bad({ hours: 1, subjects: ['  '] }, /empty/);
  await bad({ hours: 1, plan_date: '2026-13-40', subjects: ['Math'] }, /plan_date/);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM study_plans WHERE user_id=(SELECT id FROM users WHERE email=?)').get('a1b@x.com').c, 0);
});
test('planner: equal distribution, remainder handling, creating subjects, dedupe, rollback', async () => {
  // 1h40m = 100 min over 3 subjects -> 34/33/33 (sum exactly 100)
  const r = await call('/study-plans', 'POST', { title: 'Evening', plan_date: d(0), hours: 1, minutes: 40, subjects: ['Maths', 'physics', 'maths', { name: 'History' }] });
  assert.equal(r.status, 201);
  const p = r.body;
  assert.equal(p.total_minutes, 100); assert.equal(p.items.length, 3); // "maths" duplicate collapsed
  assert.deepEqual(p.items.map(i => i.allocated_minutes), [34, 33, 33]);
  assert.equal(p.allocated_minutes, 100); assert.equal(p.unallocated_minutes, 0); assert.equal(p.status, 'planned'); assert.equal(p.progress_pct, 0);
  // subjects were created in Academics (the real subjects table) and are reused case-insensitively
  const subs = (await call('/academics')).body.subjects.map(s => s.subject).sort();
  assert.deepEqual(subs, ['History', 'Maths', 'physics']);
  const again = await call('/study-plans', 'POST', { hours: 0, minutes: 45, subjects: ['MATHS', { id: p.items[1].subject_id }] });
  assert.equal(again.status, 201); assert.deepEqual(again.body.items.map(i => i.allocated_minutes), [23, 22]);
  assert.equal((await call('/academics')).body.subjects.length, 3);
  assert.equal(again.body.title, 'Study plan'); assert.equal(again.body.plan_date, T);
  // failed plan creation must not leave a half-created subject behind
  assert.equal((await call('/study-plans', 'POST', { hours: 0, minutes: 1, subjects: ['Brand New', 'Another'] })).status, 400);
  assert.equal((await call('/academics')).body.subjects.some(s => s.subject === 'Brand New'), false);
  // other formats: total_minutes
  const tm = await call('/study-plans', 'POST', { total_minutes: 90, subjects: ['Maths', 'physics', 'History'] }); assert.deepEqual(tm.body.items.map(i => i.allocated_minutes), [30, 30, 30]);
  assert.equal((await call('/study-plans', 'POST', { hours: 2, subjects: ['Maths'] })).body.total_minutes, 120); // minutes omitted = 0
});
test('planner: edit allocations never exceed total; locked/invalid cases; redistribute; total change', async () => {
  const p = (await call('/study-plans', 'POST', { title: 'Edit me', plan_date: d(1), hours: 1, minutes: 0, subjects: ['Maths', 'physics', 'History'] })).body;
  const [a, b, c] = p.items, put = body => call('/study-plans/' + p.id, 'PUT', body);
  let r = await put({ allocations: [{ id: a.id, minutes: 40 }, { id: b.id, minutes: 15 }, { id: c.id, minutes: 5 }] });
  assert.equal(r.status, 200); assert.deepEqual(r.body.items.map(i => i.allocated_minutes), [40, 15, 5]); assert.equal(r.body.unallocated_minutes, 0);
  r = await put({ allocations: [{ id: a.id, minutes: 41 }] }); assert.equal(r.status, 400); assert.match(r.body.error, /exceeds the plan total/);
  assert.equal((await call('/study-plans/' + p.id)).body.items[0].allocated_minutes, 40); // rejected edit changed nothing
  r = await put({ allocations: [{ id: a.id, minutes: 30 }] }); assert.equal(r.status, 200); assert.equal(r.body.unallocated_minutes, 10); // under-allocating is allowed
  for (const bad of [{ id: a.id, minutes: 0 }, { id: a.id, minutes: -5 }, { id: a.id, minutes: 2.5 }, { id: a.id, minutes: 'x' }, { id: 99999, minutes: 5 }]) assert.equal((await put({ allocations: [bad] })).status, 400, JSON.stringify(bad));
  assert.equal((await put({ total_minutes: 40 })).status, 400);                    // total below allocated (50)
  r = await put({ total_minutes: 50 }); assert.equal(r.status, 200); assert.equal(r.body.unallocated_minutes, 0);
  assert.equal((await put({ total_minutes: 2000 })).status, 400);
  r = await put({ total_minutes: 100, redistribute: true }); assert.deepEqual(r.body.items.map(i => i.allocated_minutes), [34, 33, 33]);
  r = await put({ title: 'Renamed', plan_date: d(3) }); assert.equal(r.body.title, 'Renamed'); assert.equal(r.body.plan_date, d(3));
  assert.equal((await put({ title: '  ' })).status, 400); assert.equal((await put({ plan_date: 'nope' })).status, 400);
  // completed sessions are locked; redistribution only shares the remaining time between open sessions
  await call(`/study-plans/${p.id}/items/${a.id}/complete`, 'POST');
  assert.equal((await put({ allocations: [{ id: a.id, minutes: 10 }] })).status, 400);
  r = await put({ total_minutes: 101, redistribute: true }); assert.deepEqual(r.body.items.map(i => i.allocated_minutes), [34, 34, 33]); // 101-34=67 -> 34+33
  assert.equal(sum(r.body.items.map(i => i.allocated_minutes)), 101);
  assert.equal((await put({ total_minutes: 35, redistribute: true })).status, 400);  // 35-34=1 minute cannot be shared by 2 open sessions
  r = await put({ total_minutes: 36, redistribute: true }); assert.equal(r.status, 200); assert.deepEqual(r.body.items.map(i => i.allocated_minutes), [34, 1, 1]); // 2 minutes -> 1+1
});
test('planner: start / complete / reset sessions and progress tracking', async () => {
  const p = (await call('/study-plans', 'POST', { title: 'Run', plan_date: d(0), total_minutes: 100, subjects: ['Maths', 'physics', 'History'] })).body;
  const [a, b, c] = p.items, act = (it, x, id = p.id) => call(`/study-plans/${id}/items/${it.id}/${x}`, 'POST');
  let r = await act(a, 'start'); assert.equal(r.status, 200); assert.equal(r.body.items[0].status, 'active'); assert.ok(r.body.items[0].started_at); assert.equal(r.body.status, 'in_progress');
  assert.equal((await act(a, 'start')).status, 409); assert.equal((await act(b, 'start')).status, 409); // only one active session at a time
  r = await act(a, 'complete'); assert.equal(r.body.items[0].status, 'done'); assert.ok(r.body.items[0].completed_at);
  assert.equal(r.body.completed_minutes, 34); assert.equal(r.body.progress_pct, 34); assert.equal(r.body.items_done, 1);
  assert.equal((await act(a, 'complete')).status, 409); assert.equal((await act(a, 'start')).status, 409);
  await act(b, 'start'); r = await act(b, 'complete'); assert.equal(r.body.progress_pct, 67);
  r = await act(c, 'complete'); // completing without starting is allowed
  assert.equal(r.body.status, 'completed'); assert.equal(r.body.progress_pct, 100); assert.equal(r.body.completed_minutes, 100);
  r = await act(c, 'reset'); assert.equal(r.body.items[2].status, 'pending'); assert.equal(r.body.items[2].completed_at, null); assert.equal(r.body.status, 'in_progress'); assert.equal(r.body.progress_pct, 67);
  assert.equal((await act(c, 'reset')).status, 409); assert.equal((await act(c, 'start', 99999)).status, 404);
  const list = (await call('/study-plans')).body;
  assert.ok(list.summary.sessionsDone >= 2); assert.ok(list.summary.plannedMinutes > 0); assert.ok(Array.isArray(list.subjects));
  assert.equal((await call('/study-plans?status=in_progress')).body.plans.every(x => x.status === 'in_progress'), true);
  assert.equal((await call('/study-plans?date=' + d(0))).body.plans.every(x => x.plan_date === d(0)), true);
});
test('planner: dashboard focus + weekly study stats come from the database', async () => {
  const u = (await call('/auth/register', 'POST', { name: 'Dash', email: 'dash@x.com', password: 'password3' }, null)).body.token;
  assert.equal((await call('/dashboard', 'GET', null, u)).body.focus, null);
  const p = (await call('/study-plans', 'POST', { title: 'Today', plan_date: T, total_minutes: 60, subjects: ['Algebra', 'Biology'] }, u)).body;
  let dash = (await call('/dashboard', 'GET', null, u)).body;
  assert.equal(dash.focus.title, 'Algebra'); assert.equal(dash.focus.duration, 30); assert.equal(dash.focus.status, 'pending');
  assert.equal(dash.study.weekSessions, 2); assert.equal(dash.study.weekMinutes, 60); assert.equal(dash.study.weekMinutesDone, 0);
  await call(`/study-plans/${p.id}/items/${p.items[1].id}/start`, 'POST', null, u);
  dash = (await call('/dashboard', 'GET', null, u)).body; assert.equal(dash.focus.title, 'Biology'); assert.equal(dash.focus.status, 'active');
  await call(`/study-plans/${p.id}/items/${p.items[1].id}/complete`, 'POST', null, u);
  dash = (await call('/dashboard', 'GET', null, u)).body; assert.equal(dash.focus.title, 'Algebra'); assert.equal(dash.study.weekCompleted, 1); assert.equal(dash.study.weekMinutesDone, 30);
  assert.ok(dash.activity.some(a => /Completed "Biology" - Study session/.test(a.message)));
  await call('/study-plans/' + p.id, 'DELETE', null, u);
  dash = (await call('/dashboard', 'GET', null, u)).body; assert.equal(dash.focus, null); assert.equal(dash.study.weekSessions, 0);
});
test('planner: delete cascades sessions, isolation between users', async () => {
  const p = (await call('/study-plans', 'POST', { total_minutes: 30, subjects: ['Maths'] })).body;
  assert.equal((await call('/study-plans/' + p.id, 'GET', null, B)).status, 404);
  assert.equal((await call('/study-plans/' + p.id, 'PUT', { title: 'x' }, B)).status, 404);
  assert.equal((await call('/study-plans/' + p.id, 'DELETE', null, B)).status, 404);
  assert.equal((await call(`/study-plans/${p.id}/items/${p.items[0].id}/start`, 'POST', null, B)).status, 404);
  assert.equal((await call('/study-plans', 'GET', null, B)).body.plans.length, 0);
  assert.equal((await call('/study-plans', 'POST', { total_minutes: 30, subjects: [{ id: p.items[0].subject_id }] }, B)).status, 400); // cannot use someone else's subject
  assert.equal((await call('/study-plans/' + p.id, 'DELETE')).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM study_plan_items WHERE plan_id=?').get(p.id).c, 0);
  assert.equal((await call('/study-plans/' + p.id)).status, 404);
});

// ---------- goals ----------
test('goals: create/edit/delete, past dates rejected, days remaining, progress + completion', async () => {
  assert.equal((await call('/goals', 'GET', null, null)).status, 401);
  for (const b of [{ title: '' }, { title: 'x', target_date: d(-1) }, { title: 'x', target_date: '2026-02-30' }, { title: 'x', target_date: '12/12/2030' }, { title: 'x', progress: 101 }, { title: 'x', progress: -1 }, { title: 'x', progress: 2.5 }])
    assert.equal((await call('/goals', 'POST', b)).status, 400, JSON.stringify(b));
  const today = await call('/goals', 'POST', { title: 'Due today', target_date: T }); assert.equal(today.status, 201); assert.equal(today.body.days_left, 0); assert.equal(today.body.status, 'active');
  const g = (await call('/goals', 'POST', { title: 'Learn HTML', description: 'basics', target_date: d(10), progress: 20 })).body;
  assert.equal(g.days_left, 10); assert.equal(g.progress, 20); assert.equal(g.completed, false); assert.equal(g.completed_at, null);
  assert.equal((await call('/goals', 'POST', { title: 'No date' })).body.days_left, null);
  // edit
  let r = await call('/goals/' + g.id, 'PUT', { title: 'Learn HTML+CSS', target_date: d(5), progress: 60 }); assert.equal(r.body.days_left, 5); assert.equal(r.body.title, 'Learn HTML+CSS'); assert.equal(r.body.description, 'basics');
  assert.equal((await call('/goals/' + g.id, 'PUT', { target_date: d(-3) })).status, 400);
  assert.equal((await call('/goals/' + g.id, 'PUT', { progress: 140 })).status, 400);
  assert.equal((await call('/goals/' + g.id, 'PUT', { title: '' })).status, 400);
  // completion + reopen
  r = await call('/goals/' + g.id, 'PUT', { progress: 100 }); assert.equal(r.body.completed, true); assert.equal(r.body.status, 'completed'); assert.equal(r.body.completed_at, T);
  r = await call('/goals/' + g.id, 'PUT', { progress: 80 }); assert.equal(r.body.completed, false); assert.equal(r.body.completed_at, null);
  r = await call('/goals/' + g.id, 'PUT', { completed: true }); assert.equal(r.body.progress, 100);
  r = await call('/goals/' + g.id, 'PUT', { completed: false }); assert.equal(r.body.progress, 99);
  // a goal whose deadline passed can still be updated (unchanged date) and shows as overdue
  db.prepare('UPDATE goals SET target_date=? WHERE id=?').run(d(-2), g.id);
  r = await call('/goals/' + g.id, 'PUT', { progress: 90 }); assert.equal(r.status, 200); assert.equal(r.body.status, 'overdue'); assert.equal(r.body.days_left, -2);
  assert.equal((await call('/goals/' + g.id, 'PUT', { target_date: d(-1) })).status, 400);
  const list = (await call('/goals')).body;
  assert.equal(list.summary.total, 3); assert.equal(list.summary.overdue, 1); assert.equal(list.summary.completed, 0); assert.equal(list.summary.active, 3);
  assert.equal((await call('/goals?status=overdue')).body.goals.length, 1); assert.equal((await call('/goals?q=today')).body.goals.length, 1);
  assert.equal(list.goals[0].title, 'Learn HTML+CSS'); // earliest deadline first
  assert.equal((await call('/goals/' + g.id, 'DELETE')).status, 200); assert.equal((await call('/goals/' + g.id, 'DELETE')).status, 404);
  assert.equal((await call('/goals')).body.goals.length, 2);
});
test('goals: isolation + dashboard', async () => {
  const mine = (await call('/goals')).body.goals[0];
  assert.equal((await call('/goals', 'GET', null, B)).body.goals.length, 0);
  assert.equal((await call('/goals/' + mine.id, 'PUT', { title: 'hack' }, B)).status, 404); assert.equal((await call('/goals/' + mine.id, 'DELETE', null, B)).status, 404);
  const done = (await call('/goals', 'POST', { title: 'Finished', progress: 100 })).body; assert.equal(done.completed_at, T);
  const dash = (await call('/dashboard')).body;
  assert.equal(dash.activeGoals, 2); assert.equal(dash.goalSummary.completed, 1); assert.ok(dash.goals.every(g => !g.completed && 'days_left' in g));
  assert.ok(dash.activity.some(a => /Completed|Added "Finished" - Goal/.test(a.message)));
});

// ---------- habits ----------
test('habits: CRUD, categories, daily target validation', async () => {
  assert.equal((await call('/habits', 'GET', null, null)).status, 401);
  for (const b of [{ name: '' }, { name: 'x', category: 'Nope' }, { name: 'x', daily_target: 0 }, { name: 'x', daily_target: 101 }, { name: 'x', daily_target: 1.5 }])
    assert.equal((await call('/habits', 'POST', b)).status, 400, JSON.stringify(b));
  const h = await call('/habits', 'POST', { name: 'Drink water', category: 'health', daily_target: 8 });
  assert.equal(h.status, 201); assert.equal(h.body.category, 'Health'); assert.equal(h.body.daily_target, 8); assert.equal(h.body.current_streak, 0); assert.equal(h.body.week.length, 7);
  const d1 = (await call('/habits', 'POST', { name: 'Read' })).body; assert.equal(d1.category, 'General'); assert.equal(d1.daily_target, 1);
  let r = await call('/habits/' + h.body.id, 'PUT', { name: 'Water', category: 'Fitness', daily_target: 6 }); assert.equal(r.body.name, 'Water'); assert.equal(r.body.category, 'Fitness'); assert.equal(r.body.daily_target, 6);
  assert.equal((await call('/habits/' + h.body.id, 'PUT', { name: ' ' })).status, 400); assert.equal((await call('/habits/9999', 'PUT', { name: 'x' })).status, 404);
  const list = (await call('/habits')).body; assert.equal(list.habits.length, 2); assert.ok(list.categories.includes('Study')); assert.equal(list.weekly.length, 7); assert.equal(list.summary.total, 2);
});
test('habits: daily completion, no duplicate records for a date, targets, undo', async () => {
  const h = (await call('/habits', 'POST', { name: 'Meditate', category: 'Mindfulness' })).body, rows = () => db.prepare('SELECT * FROM habit_logs WHERE habit_id=?').all(h.id);
  let r = await call(`/habits/${h.id}/logs`, 'POST', {}); assert.equal(r.status, 201); assert.equal(r.body.done_today, true); assert.equal(r.body.current_streak, 1); assert.equal(r.body.total_completions, 1);
  for (let i = 0; i < 4; i++) { r = await call(`/habits/${h.id}/logs`, 'POST', { date: T }); assert.equal(r.status, 200); }
  assert.equal(rows().length, 1); assert.equal(r.body.total_completions, 1);              // repeated completion for the same date never duplicates
  assert.throws(() => db.prepare('INSERT INTO habit_logs(user_id,habit_id,log_date,count) VALUES(1,?,?,1)').run(h.id, T), /UNIQUE/); // DB-level guarantee too
  // concurrent requests still yield one row
  await Promise.all([1, 2, 3, 4, 5].map(() => call(`/habits/${h.id}/logs`, 'POST', { date: d(-1) }))); assert.equal(rows().length, 2);
  // undo
  r = await call(`/habits/${h.id}/logs/${T}`, 'DELETE'); assert.equal(r.body.done_today, false); assert.equal(r.body.today_count, 0); assert.equal(rows().length, 1);
  assert.equal((await call(`/habits/${h.id}/logs/${T}`, 'DELETE')).status, 200); // idempotent
  assert.equal((await call(`/habits/${h.id}/logs/garbage`, 'DELETE')).status, 400);
  // date rules
  for (const date of [d(1), '2026-02-30', 'x', d(-400)]) assert.equal((await call(`/habits/${h.id}/logs`, 'POST', { date })).status, 400, date);
  // numeric targets with increments
  const w = (await call('/habits', 'POST', { name: 'Glasses', daily_target: 3 })).body;
  r = await call(`/habits/${w.id}/logs`, 'POST', { increment: 1 }); assert.equal(r.body.today_count, 1); assert.equal(r.body.done_today, false); assert.equal(r.body.current_streak, 0);
  r = await call(`/habits/${w.id}/logs`, 'POST', { increment: 2 }); assert.equal(r.body.today_count, 3); assert.equal(r.body.done_today, true); assert.equal(r.body.current_streak, 1);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM habit_logs WHERE habit_id=?').get(w.id).c, 1);
  for (const b of [{ count: 0 }, { count: -1 }, { count: 1.5 }, { count: 5000 }, { increment: 0 }, { count: 'abc' }]) assert.equal((await call(`/habits/${w.id}/logs`, 'POST', b)).status, 400, JSON.stringify(b));
  r = await call(`/habits/${w.id}/logs`, 'POST', { count: 2 }); assert.equal(r.body.done_today, false); // set explicitly below target
  r = await call(`/habits/${w.id}`, 'PUT', { daily_target: 2 }); assert.equal(r.body.done_today, true); // completion is derived from the target
});
test('habits: current + longest streaks, history, weekly tracker', async () => {
  const h = (await call('/habits', 'POST', { name: 'Code', category: 'Study' })).body, log = date => call(`/habits/${h.id}/logs`, 'POST', { date });
  for (const n of [-1, -2, -3]) await log(d(n));
  let v = (await call('/habits')).body.habits.find(x => x.id === h.id); assert.equal(v.current_streak, 3); assert.equal(v.longest_streak, 3); assert.equal(v.done_today, false);
  await log(d(0)); v = (await call('/habits')).body.habits.find(x => x.id === h.id); assert.equal(v.current_streak, 4);
  for (const n of [-5, -6]) await log(d(n)); // gap on -4
  v = (await call('/habits')).body.habits.find(x => x.id === h.id); assert.equal(v.current_streak, 4); assert.equal(v.longest_streak, 4);
  await log(d(-4)); v = (await call('/habits')).body.habits.find(x => x.id === h.id); assert.equal(v.current_streak, 7); assert.equal(v.longest_streak, 7); assert.equal(v.total_completions, 7);
  await call(`/habits/${h.id}/logs/${d(-2)}`, 'DELETE'); v = (await call('/habits')).body.habits.find(x => x.id === h.id); assert.equal(v.current_streak, 2); assert.equal(v.longest_streak, 4);
  // history
  const hist = (await call(`/habits/${h.id}/history?days=10`)).body.history; assert.equal(hist.length, 10); assert.equal(hist[9].date, T); assert.equal(hist[9].completed, true); assert.equal(hist.find(x => x.date === d(-2)).completed, false);
  assert.equal((await call(`/habits/${h.id}/history?days=0`)).status, 400); assert.equal((await call(`/habits/${h.id}/history?days=999`)).status, 400); assert.equal((await call('/habits/9999/history')).status, 404);
  // weekly tracker: Monday..Sunday of the current week, today flagged, future days flagged
  const wk = (await call('/habits')).body; assert.equal(wk.weekly.length, 7); assert.equal(wk.weekly[0].label, 'Mon'); assert.equal(wk.weekly[0].date, U.weekStart(T));
  assert.equal(wk.weekly.filter(x => x.is_today).length, 1); assert.equal(wk.weekly.find(x => x.is_today).date, T); assert.ok(wk.weekly.every(x => x.is_future === (x.date > T)));
  const hw = wk.habits.find(x => x.id === h.id).week; assert.equal(hw.length, 7); assert.equal(hw.find(x => x.date === T).completed, true);
  assert.equal(wk.weekly.find(x => x.date === T).completed >= 1, true); assert.equal(wk.weekly.find(x => x.date === T).total, wk.habits.length);
});
test('habits: dashboard, delete cascades logs, isolation', async () => {
  const dash = (await call('/dashboard')).body, hs = (await call('/habits')).body.summary;
  assert.equal(dash.habitsDone, hs.doneToday); assert.equal(dash.habitsTotal, hs.total); assert.ok(dash.habitsDone >= 1); assert.equal(dash.habitStats.bestCurrentStreak, hs.bestCurrentStreak);
  const habits = (await call('/habits')).body.habits, h = habits[0];
  assert.equal((await call('/habits', 'GET', null, B)).body.habits.length, 0);
  assert.equal((await call('/habits/' + h.id, 'PUT', { name: 'hack' }, B)).status, 404); assert.equal((await call('/habits/' + h.id, 'DELETE', null, B)).status, 404);
  assert.equal((await call(`/habits/${h.id}/logs`, 'POST', {}, B)).status, 404); assert.equal((await call(`/habits/${h.id}/history`, 'GET', null, B)).status, 404);
  assert.ok(db.prepare('SELECT COUNT(*) c FROM habit_logs WHERE habit_id=?').get(h.id).c >= 0);
  const n = db.prepare('SELECT COUNT(*) c FROM habit_logs').get().c, own = db.prepare('SELECT COUNT(*) c FROM habit_logs WHERE habit_id=?').get(h.id).c;
  assert.equal((await call('/habits/' + h.id, 'DELETE')).status, 200); assert.equal(db.prepare('SELECT COUNT(*) c FROM habit_logs').get().c, n - own);
  assert.equal((await call('/habits/' + h.id, 'DELETE')).status, 404);
});
test('persistence: data survives a fresh connection to the same database file', async () => {
  const Database = require('better-sqlite3'), d2 = new Database(process.env.DB_PATH);
  assert.ok(d2.prepare('SELECT COUNT(*) c FROM study_plans').get().c >= 3); assert.ok(d2.prepare('SELECT COUNT(*) c FROM goals').get().c >= 2); assert.ok(d2.prepare('SELECT COUNT(*) c FROM habit_logs').get().c >= 5);
});
test('demo account: seeded plan, goals and habit streaks are real data', async () => {
  const l = (await call('/auth/login', 'POST', { email: 'demo@learnjectory.com', password: 'demo1234' }, null)).body.token;
  const hb = (await call('/habits', 'GET', null, l)).body.habits, by = n => hb.find(h => h.name === n);
  assert.equal(by('Read 20 minutes').current_streak, 5); assert.equal(by('Read 20 minutes').done_today, true);
  assert.equal(by('Workout').current_streak, 3); assert.equal(by('Workout').done_today, false); assert.equal(by('Practice coding').current_streak, 9);
  const pl = (await call('/study-plans', 'GET', null, l)).body.plans; assert.equal(pl.length, 1); assert.equal(sum(pl[0].items.map(i => i.allocated_minutes)), 150);
  const dash = (await call('/dashboard', 'GET', null, l)).body; assert.equal(dash.habitsDone, 2); assert.equal(dash.focus.title, 'Mathematics'); assert.equal(dash.goals.length, 3);
});
