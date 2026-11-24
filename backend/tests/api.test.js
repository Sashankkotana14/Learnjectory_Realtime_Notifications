process.env.NODE_ENV = 'test';
process.env.DB_PATH = require('path').join(require('os').tmpdir(), `lj_test_${Date.now()}.db`);
process.env.JWT_SECRET = 'test_secret_' + 'x'.repeat(40);
process.env.SEED_DEMO = 'true';
const { test, before, after } = require('node:test'), assert = require('node:assert/strict');
const app = require('../server'), U = require('../utils');
let server, base;
before(() => new Promise(r => { server = app.listen(0, () => { base = 'http://localhost:' + server.address().port + '/api'; r(); }); }));
after(() => server.close());
const call = async (path, method = 'GET', body, token) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const d = n => U.todayStr(new Date(Date.now() + n * 864e5));
let A, B;

test('priority rules (unit)', () => {
  const t = '2026-11-22', p = (due, status = 'pending') => U.priority({ due_date: due, status }, t).priority;
  assert.equal(p('2026-11-22'), 'High'); assert.equal(p('2026-11-24'), 'High');
  assert.equal(p('2026-11-25'), 'Medium'); assert.equal(p('2026-11-27'), 'Medium');
  assert.equal(p('2026-11-28'), 'Low'); assert.equal(p('2026-11-21'), 'Overdue');
  assert.equal(p('2026-11-21', 'done'), 'Completed'); assert.equal(p(''), 'Low');
});
test('health + unauthenticated access blocked', async () => {
  assert.equal((await call('/health')).status, 200);
  for (const p of ['/dashboard', '/assignments', '/academics', '/goals', '/settings']) assert.equal((await call(p)).status, 401, p);
  assert.equal((await call('/dashboard', 'GET', null, 'garbage')).status, 401);
});
test('register validation, duplicate, login', async () => {
  assert.equal((await call('/auth/register', 'POST', { name: 'A', email: 'bad', password: '12345678' })).status, 400);
  assert.equal((await call('/auth/register', 'POST', { name: 'A', email: 'a@x.com', password: 'short' })).status, 400);
  const r = await call('/auth/register', 'POST', { name: 'Alice', email: 'Alice@X.com', password: 'password1' });
  assert.equal(r.status, 200); A = r.body.token; assert.equal(r.body.user.email, 'alice@x.com');
  assert.equal((await call('/auth/register', 'POST', { name: 'Al', email: 'alice@x.com', password: 'password1' })).status, 409);
  assert.equal((await call('/auth/login', 'POST', { email: 'alice@x.com', password: 'wrong' })).status, 401);
  const l = await call('/auth/login', 'POST', { email: 'ALICE@x.com', password: 'password1' });
  assert.equal(l.status, 200); assert.ok(l.body.token);
  B = (await call('/auth/register', 'POST', { name: 'Bob', email: 'bob@x.com', password: 'password2' })).body.token;
  assert.equal((await call('/auth/me', 'GET', null, A)).body.name, 'Alice');
});
test('new user starts with an empty, real-data dashboard', async () => {
  const { body } = await call('/dashboard', 'GET', null, A);
  assert.equal(body.user.name, 'Alice'); assert.equal(body.academics, 0); assert.equal(body.activeGoals, 0);
  assert.equal(body.pendingAssignments, 0); assert.equal(body.nextAssignment, null);
});
test('academics CRUD, validation, summary', async () => {
  assert.equal((await call('/academics', 'POST', { subject: '' }, A)).status, 400);
  assert.equal((await call('/academics', 'POST', { subject: 'X', grade: 'Z' }, A)).status, 400);
  assert.equal((await call('/academics', 'POST', { subject: 'X', progress: 150 }, A)).status, 400);
  assert.equal((await call('/academics', 'POST', { subject: 'X', classes_attended: 9, classes_total: 5 }, A)).status, 400);
  const c = await call('/academics', 'POST', { subject: 'Math', grade: 'a', target_grade: 'A+', credits: 4, progress: 60, classes_attended: 18, classes_total: 20 }, A);
  assert.equal(c.status, 201); assert.equal(c.body.grade, 'A');
  await call('/academics', 'POST', { subject: 'Art', grade: 'B', target_grade: 'A', credits: 2, progress: 40, classes_attended: 6, classes_total: 10 }, A);
  let l = (await call('/academics', 'GET', null, A)).body;
  assert.equal(l.subjects.length, 2); assert.equal(l.summary.totalCredits, 6); assert.equal(l.summary.avgProgress, 50);
  assert.equal(l.summary.attendance, 80); assert.deepEqual(l.summary.lowAttendance, ['Art']);
  assert.equal(l.summary.currentGpa, 3.67); assert.equal(l.subjects.find(s => s.subject === 'Math').attendance_pct, 90);
  const u = await call('/academics/' + c.body.id, 'PUT', { progress: 90, credits: 3 }, A);
  assert.equal(u.status, 200); assert.equal(u.body.progress, 90); assert.equal(u.body.subject, 'Math');
  assert.equal((await call('/academics/' + c.body.id, 'DELETE', null, A)).status, 200);
  assert.equal((await call('/academics', 'GET', null, A)).body.subjects.length, 1);
});
test('assignments CRUD + automatic priority + filters/sorting/summary', async () => {
  assert.equal((await call('/assignments', 'POST', { title: 'x', due_date: '31-12-2026' }, A)).status, 400);
  assert.equal((await call('/assignments', 'POST', { title: 'x', status: 'weird' }, A)).status, 400);
  const mk = (title, n, extra = {}) => call('/assignments', 'POST', { title, subject: 'Math', due_date: d(n), ...extra }, A);
  const over = (await mk('Over', -1)).body, hi = (await mk('Hi', 0)).body, hi2 = (await mk('Hi2', 2)).body, med = (await mk('Med', 3)).body, med2 = (await mk('Med2', 5)).body, lo = (await mk('Lo', 6)).body, done = (await mk('Done', -4, { status: 'done' })).body;
  assert.equal(done.completed_at, U.todayStr());
  const { body } = await call('/assignments', 'GET', null, A);
  const pr = Object.fromEntries(body.assignments.map(a => [a.title, a.priority]));
  assert.deepEqual(pr, { Over: 'Overdue', Hi: 'High', Hi2: 'High', Med: 'Medium', Med2: 'Medium', Lo: 'Low', Done: 'Completed' });
  assert.deepEqual(body.summary, { total: 7, pending: 6, completed: 1, overdue: 1, high: 2, medium: 2, low: 1, dueToday: 1 });
  assert.equal((await call('/assignments?priority=high', 'GET', null, A)).body.assignments.length, 2);
  assert.equal((await call('/assignments?status=done', 'GET', null, A)).body.assignments.length, 1);
  assert.equal((await call('/assignments?q=med', 'GET', null, A)).body.assignments.length, 2);
  assert.equal((await call('/assignments?sort=priority', 'GET', null, A)).body.assignments[0].title, 'Over');
  assert.equal((await call('/assignments?sort=due&dir=desc', 'GET', null, A)).body.assignments[0].title, 'Lo');
  assert.equal((await call('/assignments?sort=title', 'GET', null, A)).body.assignments[0].title, 'Done');
  // edit due date -> priority recalculates; mark done -> Completed; reopen
  assert.equal((await call('/assignments/' + lo.id, 'PUT', { due_date: d(1) }, A)).status, 200);
  assert.equal((await call('/assignments?q=Lo', 'GET', null, A)).body.assignments[0].priority, 'High');
  await call('/assignments/' + over.id, 'PUT', { status: 'done' }, A);
  let o = (await call('/assignments?q=Over', 'GET', null, A)).body.assignments[0]; assert.equal(o.priority, 'Completed'); assert.ok(o.completed_at);
  await call('/assignments/' + over.id, 'PUT', { status: 'pending' }, A);
  o = (await call('/assignments?q=Over', 'GET', null, A)).body.assignments[0]; assert.equal(o.priority, 'Overdue'); assert.equal(o.completed_at, null);
  assert.equal((await call('/assignments/' + med2.id, 'DELETE', null, A)).status, 200);
  assert.equal((await call('/assignments/999999', 'PUT', { title: 'n' }, A)).status, 404);
  const dash = (await call('/dashboard', 'GET', null, A)).body;
  assert.equal(dash.assignmentSummary.overdue, 1); assert.equal(dash.dueToday, 1); assert.equal(dash.nextAssignment.title, 'Over');
  assert.ok(dash.activity.some(a => /Completed "Over"/.test(a.message)));
});
test('user data isolation', async () => {
  const mine = (await call('/assignments', 'GET', null, A)).body.assignments[0];
  assert.equal((await call('/assignments', 'GET', null, B)).body.assignments.length, 0);
  assert.equal((await call('/academics', 'GET', null, B)).body.subjects.length, 0);
  assert.equal((await call('/assignments/' + mine.id, 'PUT', { title: 'hacked' }, B)).status, 404);
  assert.equal((await call('/assignments/' + mine.id, 'DELETE', null, B)).status, 404);
  assert.equal((await call('/assignments', 'GET', null, A)).body.assignments.find(a => a.id === mine.id).title, mine.title);
  assert.equal((await call('/dashboard', 'GET', null, B)).body.pendingAssignments, 0);
  assert.equal((await call('/search?q=Hi', 'GET', null, B)).body.length, 0);
});
test('unknown / prototype resource names rejected', async () => {
  for (const p of ['/users', '/constructor', '/__proto__', '/toString']) assert.equal((await call(p, 'GET', null, A)).status, 404, p);
});
test('generic CRUD still works (goals, habits, planner)', async () => {
  const g = await call('/goals', 'POST', { title: 'Learn', progress: 10 }, A); assert.equal(g.status, 201);
  assert.equal((await call('/goals/' + g.body.id, 'PUT', { progress: 50 }, A)).body.progress, 50);
  const s = await call('/study_sessions', 'POST', { title: 'Read', session_date: d(0), duration: 40 }, A);
  await call('/study_sessions/' + s.body.id, 'PUT', { completed: 1 }, A);
  const dash = (await call('/dashboard', 'GET', null, A)).body;
  assert.equal(dash.activeGoals, 1); assert.equal(dash.study.weekMinutesDone, 40);
});
test('settings, password change, logout invalidates token', async () => {
  assert.equal((await call('/settings', 'PUT', { name: 'Alice 2' }, A)).body.name, 'Alice 2');
  assert.equal((await call('/auth/password', 'PUT', { currentPassword: 'nope', newPassword: 'password9' }, A)).status, 401);
  const old = (await call('/auth/login', 'POST', { email: 'bob@x.com', password: 'password2' })).body.token;
  assert.equal((await call('/auth/logout', 'POST', null, old)).status, 200);
  assert.equal((await call('/auth/me', 'GET', null, old)).status, 401);
  assert.equal((await call('/auth/me', 'GET', null, B)).status, 401); // logout revokes all of the user's sessions
  const re = await call('/auth/login', 'POST', { email: 'bob@x.com', password: 'password2' });
  assert.equal(re.status, 200); assert.equal((await call('/auth/me', 'GET', null, re.body.token)).status, 200);
});
test('demo account has seeded real rows', async () => {
  const l = await call('/auth/login', 'POST', { email: 'demo@learnjectory.com', password: 'demo1234' });
  assert.equal(l.status, 200);
  const d2 = (await call('/dashboard', 'GET', null, l.body.token)).body;
  assert.ok(d2.academicStats.subjects >= 4); assert.ok(d2.assignmentSummary.total >= 4);
});
