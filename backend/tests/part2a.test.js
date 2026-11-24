process.env.NODE_ENV = 'test';
process.env.DB_PATH = require('path').join(require('os').tmpdir(), `lj_test_2a_${Date.now()}.db`);
process.env.JWT_SECRET = 'test_secret_' + 'z'.repeat(40);
process.env.SEED_DEMO = 'true';
delete process.env.YOUTUBE_API_KEY;
const { test, before, after } = require('node:test'), assert = require('node:assert/strict');
const app = require('../server'), U = require('../utils'), db = require('../database/db'), Database = require('better-sqlite3');
let server, base, A, B;
before(() => new Promise(r => { server = app.listen(0, () => { base = 'http://localhost:' + server.address().port + '/api'; r(); }); }));
after(() => server.close());
const realFetch = global.fetch;
const call = async (path, method = 'GET', body, token = A) => {
  const r = await realFetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const T = U.todayStr(), d = n => U.addDays(T, n), tick = () => new Promise(r => setTimeout(r, 40));
const ach = async (t = A) => (await call('/achievements', 'GET', null, t)).body;
const unlocked = async t => (await ach(t)).achievements.filter(a => a.unlocked).map(a => a.key);
const rows = (sql, ...a) => db.prepare(sql).all(...a);

test('setup users', async () => {
  A = (await call('/auth/register', 'POST', { name: 'Alice', email: 'a2a@x.com', password: 'password1' }, null)).body.token;
  B = (await call('/auth/register', 'POST', { name: 'Bob', email: 'b2a@x.com', password: 'password2' }, null)).body.token;
  assert.ok(A && B);
});

// ---------------- Career Compass ----------------
test('career: auth required, templates available', async () => {
  assert.equal((await call('/career/paths', 'GET', null, null)).status, 401);
  const t = await call('/career/templates'); assert.equal(t.status, 200); assert.ok(t.body.length >= 4); assert.ok(t.body.every(x => x.lessons === 12));
});
let P, lessonIds;
test('career: create path from template -> 3 stages x 4 lessons, target date rules', async () => {
  assert.equal((await call('/career/paths', 'POST', { title: 'x', target_date: d(-1) })).status, 400);
  assert.equal((await call('/career/paths', 'POST', { title: '' })).status, 400);
  assert.equal((await call('/career/paths', 'POST', { title: 'x', template: 'nope' })).status, 400);
  const r = await call('/career/paths', 'POST', { title: 'My web career', template: 'web', target_date: d(90) });
  assert.equal(r.status, 201); P = r.body;
  assert.equal(P.lessons_total, 12); assert.equal(P.progress, 0); assert.equal(P.days_left, 90); assert.equal(P.status, 'active');
  assert.deepEqual(P.stages.map(s => [s.stage, s.total, s.done]), [['Beginner', 4, 0], ['Intermediate', 4, 0], ['Advanced', 4, 0]]);
  assert.equal(P.current_stage, 'Beginner');
  lessonIds = P.stages[0].lessons.map(l => l.id);
  assert.ok(P.stages[0].lessons.every(l => l.youtube_url.startsWith('https://www.youtube.com/results?search_query=')));
});
test('career: lesson completion drives stage + overall progress, reopen works, dates set', async () => {
  const c = await call(`/career/lessons/${lessonIds[0]}/complete`, 'POST', {}); assert.equal(c.status, 200); assert.equal(c.body.completed, true); assert.equal(c.body.completed_at, T);
  await call(`/career/lessons/${lessonIds[0]}/complete`, 'POST', {}); // idempotent
  for (const id of lessonIds.slice(1)) await call(`/career/lessons/${id}/complete`, 'POST', {});
  let p = (await call('/career/paths/' + P.id)).body;
  assert.equal(p.lessons_done, 4); assert.equal(p.progress, 33); assert.equal(p.stages[0].progress, 100); assert.equal(p.current_stage, 'Intermediate');
  const re = await call(`/career/lessons/${lessonIds[3]}/complete`, 'POST', { completed: false }); assert.equal(re.body.completed, false); assert.equal(re.body.completed_at, null);
  assert.equal((await call('/career/paths/' + P.id)).body.lessons_done, 3);
  assert.equal((await call('/career/lessons/999999/complete', 'POST', {})).status, 404);
});
test('career: custom lessons, validation, duplicates, resources', async () => {
  const mk = b => call(`/career/paths/${P.id}/lessons`, 'POST', b);
  const ok = await mk({ title: 'Docker basics', stage: 'Advanced', resource_url: 'https://docs.docker.com/get-started/', resource_type: 'docs', youtube_query: 'docker tutorial', est_minutes: 60 });
  assert.equal(ok.status, 201); assert.equal(ok.body.youtube_url, 'https://www.youtube.com/results?search_query=docker%20tutorial');
  assert.equal((await mk({ title: 'docker BASICS', stage: 'Advanced' })).status, 409);
  assert.equal((await mk({ title: 'Same title other stage', stage: 'Beginner' })).status, 201);
  assert.equal((await mk({ title: 'Bad stage', stage: 'Expert' })).status, 400);
  assert.equal((await mk({ title: 'Bad url', resource_url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await mk({ title: 'Bad type', resource_type: 'zzz' })).status, 400);
  assert.equal((await mk({ title: 'Bad mins', est_minutes: -5 })).status, 400);
  const u = await call('/career/lessons/' + ok.body.id, 'PUT', { title: 'Docker deep dive', est_minutes: 90 }); assert.equal(u.body.title, 'Docker deep dive'); assert.equal(u.body.est_minutes, 90);
  assert.equal((await call('/career/lessons/' + ok.body.id, 'DELETE')).status, 200);
  assert.equal((await call('/career/paths/' + P.id)).body.lessons_total, 13);
});
test('career: study hours tracking + validation', async () => {
  const log = b => call(`/career/paths/${P.id}/study`, 'POST', b);
  assert.equal((await log({ minutes: 0 })).status, 400); assert.equal((await log({ minutes: 1.5 })).status, 400); assert.equal((await log({ minutes: 'abc' })).status, 400);
  assert.equal((await log({ minutes: 30, date: d(1) })).status, 400); assert.equal((await log({ minutes: 30, date: '2026-02-30' })).status, 400);
  assert.equal((await log({ minutes: 1441 })).status, 400); assert.equal((await log({ minutes: 30, lesson_id: 999999 })).status, 400);
  const a = await log({ minutes: 45, lesson_id: lessonIds[0], note: 'HTML tags' }); assert.equal(a.status, 201); assert.equal(a.body.log_date, T);
  await log({ minutes: 75, date: d(-1) });
  assert.equal((await log({ minutes: 1400, date: d(-1) })).status, 400); // would exceed 24h that day
  const p = (await call('/career/paths/' + P.id)).body;
  assert.equal(p.study_minutes, 120); assert.ok(p.logs.length === 2); assert.equal(p.logs.find(l => l.minutes === 45).lesson_title, 'HTML fundamentals');
  const s = (await call('/career/paths')).body.summary; assert.equal(s.studyMinutes, 120); assert.ok(s.studyMinutesWeek >= 45);
  assert.equal((await call('/career/study/' + a.body.id, 'DELETE')).status, 200); assert.equal((await call('/career/paths/' + P.id)).body.study_minutes, 75);
});
test('career: path edit/delete, completion status, cascade', async () => {
  const u = await call('/career/paths/' + P.id, 'PUT', { title: 'Renamed path', target_date: d(200) }); assert.equal(u.body.title, 'Renamed path'); assert.equal(u.body.days_left, 200);
  assert.equal((await call('/career/paths/' + P.id, 'PUT', { target_date: d(-3) })).status, 400);
  const q = (await call('/career/paths', 'POST', { title: 'Tiny' })).body; assert.equal(q.lessons_total, 0); assert.equal(q.progress, 0);
  const l = (await call(`/career/paths/${q.id}/lessons`, 'POST', { title: 'Only lesson' })).body;
  await call(`/career/lessons/${l.id}/complete`, 'POST', {}); assert.equal((await call('/career/paths/' + q.id)).body.status, 'completed');
  await call(`/career/paths/${q.id}/study`, 'POST', { minutes: 10 });
  assert.equal((await call('/career/paths/' + q.id, 'DELETE')).status, 200);
  assert.equal((await call('/career/paths/' + q.id)).status, 404);
  assert.equal(rows('SELECT id FROM career_lessons WHERE path_id=?', q.id).length, 0); assert.equal(rows('SELECT id FROM career_study_logs WHERE path_id=?', q.id).length, 0);
});
test('career: YouTube discovery returns a working search link without a key, and real video data with a key', async () => {
  const bad = await call('/career/youtube?q=a'); assert.equal(bad.status, 400);
  const r = await call('/career/youtube?q=' + encodeURIComponent('react tutorial')); assert.equal(r.body.source, 'search-link'); assert.equal(r.body.search_url, 'https://www.youtube.com/results?search_query=react%20tutorial'); assert.deepEqual(r.body.videos, []);
  process.env.YOUTUBE_API_KEY = 'fake-key';
  let seen = '';
  global.fetch = async (url, o) => { if (String(url).includes('googleapis.com/youtube/v3/search')) { seen = String(url); return { ok: true, json: async () => ({ items: [{ id: { videoId: 'abc123' }, snippet: { title: 'React in 1 hour', channelTitle: 'Chan', thumbnails: { medium: { url: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg' } } } }, { id: { channelId: 'skipme' }, snippet: {} }] }) }; } return realFetch(url, o); };
  const v = await call('/career/youtube?q=react'); assert.equal(v.body.source, 'youtube-api'); assert.equal(v.body.videos.length, 1);
  assert.deepEqual(v.body.videos[0], { id: 'abc123', title: 'React in 1 hour', channel: 'Chan', thumbnail: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg', url: 'https://www.youtube.com/watch?v=abc123' });
  assert.ok(seen.includes('key=fake-key') && !JSON.stringify(v.body).includes('fake-key')); // key is used server-side only
  global.fetch = async (url, o) => { if (String(url).includes('googleapis.com')) throw new Error('offline'); return realFetch(url, o); };
  const f = await call('/career/youtube?q=react'); assert.equal(f.body.source, 'search-link'); assert.ok(f.body.search_url);
  global.fetch = realFetch; delete process.env.YOUTUBE_API_KEY;
});

// ---------------- Projects & Skills ----------------
let proj;
test('projects: add/edit/delete, validation, technologies, status', async () => {
  assert.equal((await call('/projects', 'POST', { title: '' })).status, 400);
  assert.equal((await call('/projects', 'POST', { title: 'x', status: 'weird' })).status, 400);
  assert.equal((await call('/projects', 'POST', { title: 'x', repo_url: 'ftp://nope' })).status, 400);
  const r = await call('/projects', 'POST', { title: 'Portfolio', description: 'My site', technologies: 'React, node.js,react , Tailwind', status: 'active', repo_url: 'https://github.com/a/b' });
  assert.equal(r.status, 201); proj = r.body; assert.equal(proj.technologies, 'React, node.js, Tailwind'); assert.deepEqual(proj.technologies_list, ['React', 'node.js', 'Tailwind']); assert.equal(proj.completed_at, null);
  assert.equal((await call('/projects', 'POST', { title: 'Default status' })).body.status, 'planning');
  const done = await call('/projects/' + proj.id, 'PUT', { status: 'completed' }); assert.equal(done.body.completed_at, T);
  const re = await call('/projects/' + proj.id, 'PUT', { status: 'on_hold' }); assert.equal(re.body.completed_at, null); assert.equal(re.body.status, 'on_hold');
  assert.equal((await call('/projects/' + proj.id, 'PUT', { technologies: Array.from({ length: 21 }, (_, i) => 't' + i).join(',') })).status, 400);
  assert.equal((await call('/projects/' + proj.id, 'PUT', { title: 'Portfolio v2' })).body.title, 'Portfolio v2');
});
test('projects: dynamic statistics, filters, skill suggestions', async () => {
  await call('/projects', 'POST', { title: 'API', technologies: 'Node.js, SQLite', status: 'completed' });
  await call('/skills', 'POST', { name: 'react', category: 'Frontend' });
  const r = (await call('/projects')).body, s = r.summary;
  assert.equal(s.total, 3); assert.equal(s.completed, 1); assert.equal(s.on_hold, 1); assert.equal(s.planning, 1); assert.equal(s.active, 0); assert.equal(s.completionRate, 33);
  assert.equal(s.technologies.find(t => t.name.toLowerCase() === 'node.js').count, 2);
  assert.ok(!s.missingSkills.map(x => x.toLowerCase()).includes('react')); assert.ok(s.missingSkills.includes('Tailwind'));
  assert.equal((await call('/projects?status=completed')).body.projects.length, 1); assert.equal((await call('/projects?q=sqlite')).body.projects.length, 1);
});
test('skills: categories, levels, duplicates blocked, stats', async () => {
  const mk = b => call('/skills', 'POST', b);
  assert.equal((await mk({ name: 'React' })).status, 409); assert.equal((await mk({ name: '  REACT  ' })).status, 409); assert.equal((await mk({ name: 're   act' })).status, 201); // inner spaces are a different name
  assert.equal((await mk({ name: '' })).status, 400); assert.equal((await mk({ name: 'X', category: 'Bogus' })).status, 400); assert.equal((await mk({ name: 'X', level: 101 })).status, 400); assert.equal((await mk({ name: 'X', level_name: 'God' })).status, 400);
  const py = await mk({ name: 'Python', category: 'Programming', level_name: 'Advanced' }); assert.equal(py.status, 201); assert.equal(py.body.level, 75); assert.equal(py.body.level_name, 'Advanced');
  const sql = await mk({ name: 'SQL', category: 'Data', level: 55 }); assert.equal(sql.body.level_name, 'Intermediate');
  assert.equal((await call('/skills/' + sql.body.id, 'PUT', { name: 'python' })).status, 409); // rename into a duplicate
  assert.equal((await call('/skills/' + sql.body.id, 'PUT', { name: 'SQL', level_name: 'Expert' })).body.level, 95); // same name on itself is fine
  const r = (await call('/skills')).body, s = r.summary;
  assert.equal(s.total, 4); assert.equal(s.categories, 4); assert.equal(s.byLevel.Expert, 1); assert.equal(s.advanced, 2); assert.equal(s.byCategory.Programming, 1);
  assert.equal(r.skills.filter(x => x.name.toLowerCase() === 'react').length, 1);
  const del = r.skills.find(x => x.name === 're   act'.replace(/\s+/g, ' ')); assert.equal((await call('/skills/' + del.id, 'DELETE')).status, 200); assert.equal((await call('/skills')).body.summary.total, 3);
});
test('isolation: another user cannot read or change career/projects/skills', async () => {
  assert.equal((await call('/career/paths', 'GET', null, B)).body.paths.length, 0); assert.equal((await call('/career/paths/' + P.id, 'GET', null, B)).status, 404);
  assert.equal((await call(`/career/lessons/${lessonIds[0]}/complete`, 'POST', {}, B)).status, 404); assert.equal((await call(`/career/paths/${P.id}/study`, 'POST', { minutes: 5 }, B)).status, 404);
  assert.equal((await call(`/career/paths/${P.id}/lessons`, 'POST', { title: 'hack' }, B)).status, 404); assert.equal((await call('/career/paths/' + P.id, 'DELETE', null, B)).status, 404);
  assert.equal((await call('/projects/' + proj.id, 'PUT', { title: 'hack' }, B)).status, 404); assert.equal((await call('/projects', 'GET', null, B)).body.projects.length, 0);
  const sk = (await call('/skills')).body.skills[0]; assert.equal((await call('/skills/' + sk.id, 'DELETE', null, B)).status, 404);
  assert.equal((await call('/skills', 'POST', { name: sk.name }, B)).status, 201); // same name for a different user is allowed
  assert.equal((await ach(B)).summary.unlocked, 1); // only Bob's own skill unlocked something
});

// ---------------- Achievements ----------------
test('achievements: brand-new user has nothing unlocked, all locked with 0 progress', async () => {
  const t = (await call('/auth/register', 'POST', { name: 'Cara', email: 'c2a@x.com', password: 'password3' }, null)).body.token;
  const r = await ach(t); assert.equal(r.summary.unlocked, 0); assert.equal(r.history.length, 0); assert.equal(r.summary.total, r.achievements.length);
  assert.ok(r.achievements.every(a => !a.unlocked && a.progress === 0 && a.unlocked_date === null && a.icon && a.title && a.target > 0));
  assert.deepEqual(Object.keys(r.summary.byCategory), ['Learning', 'Goals', 'Habits', 'Projects', 'Skills']); assert.ok(Object.values(r.summary.byCategory).every(c => c.total > 0));
  assert.equal((await call('/dashboard', 'GET', null, t)).body.achievements, 0);
});
test('achievements: read-only API (no manual creation)', async () => {
  assert.equal((await call('/achievements', 'POST', { title: 'Fake' })).status, 405); assert.equal((await call('/achievements/1', 'PUT', {})).status, 405); assert.equal((await call('/achievements/1', 'DELETE')).status, 405);
});
test('achievements: unlock from real progress across all five categories, with dates and progress', async () => {
  const u = await unlocked();
  for (const k of ['first_lesson', 'study_1h', 'project_1', 'project_done', 'skill_1']) assert.ok(u.includes(k), 'expected ' + k);
  assert.ok(!u.includes('lessons_10') && !u.includes('goal_1') && !u.includes('streak_3'));
  const r = await ach(), a = r.achievements;
  const les = a.find(x => x.key === 'lessons_10'); assert.equal(les.unlocked, false); assert.equal(les.current, 3); assert.equal(les.target, 10); assert.equal(les.progress, 30);
  const sk = a.find(x => x.key === 'skill_5'); assert.equal(sk.current, 3); assert.equal(sk.progress, 60);
  const first = a.find(x => x.key === 'first_lesson'); assert.equal(first.unlocked, true); assert.equal(first.unlocked_date, T); assert.equal(first.progress, 100);
  const cats = new Set(a.filter(x => x.unlocked).map(x => x.category)); for (const c of ['Learning', 'Projects', 'Skills']) assert.ok(cats.has(c));
  assert.equal((await ach()).achievements.filter(x => x.category === 'Skills').length, 4);
  assert.equal((await call('/achievements?status=locked')).body.achievements.every(x => !x.unlocked), true);
  assert.equal((await call('/achievements?category=Goals')).body.achievements.every(x => x.category === 'Goals'), true);
});
test('achievements: goals + habit streaks unlock via the automatic write hook (no GET needed)', async () => {
  const g = (await call('/goals', 'POST', { title: 'Finish course', target_date: d(30) })).body; await tick();
  assert.ok(rows("SELECT key FROM achievement_unlocks WHERE user_id=(SELECT id FROM users WHERE email='a2a@x.com') AND key='goal_set'").length === 1);
  await call('/goals/' + g.id, 'PUT', { progress: 100 }); await tick();
  assert.ok((await unlocked()).includes('goal_1'));
  const h = (await call('/habits', 'POST', { name: 'Read', daily_target: 1 })).body;
  for (const n of [-2, -1, 0]) await call(`/habits/${h.id}/logs`, 'POST', { date: d(n), count: 1 });
  await tick(); const u = await unlocked(); assert.ok(u.includes('habit_start') && u.includes('streak_3')); assert.ok(!u.includes('streak_7'));
  assert.equal((await ach()).achievements.find(x => x.key === 'streak_7').current, 3);
});
test('achievements: no duplicate unlocks and history persists after the source data is deleted', async () => {
  for (let i = 0; i < 4; i++) await ach();
  const uid = db.prepare("SELECT id FROM users WHERE email='a2a@x.com'").get().id;
  const keys = rows('SELECT key FROM achievement_unlocks WHERE user_id=?', uid).map(r => r.key); assert.equal(new Set(keys).size, keys.length);
  assert.throws(() => db.prepare('INSERT INTO achievement_unlocks(user_id,key,unlocked_date) VALUES(?,?,?)').run(uid, 'first_lesson', T), /UNIQUE|constraint/i); // DB-level guarantee
  const msgs = rows("SELECT message FROM activity_logs WHERE user_id=? AND message LIKE '%- Achievement'", uid).map(r => r.message); assert.equal(new Set(msgs).size, msgs.length);
  const before = keys.length, when = rows("SELECT unlocked_at FROM achievement_unlocks WHERE user_id=? AND key='first_lesson'", uid)[0].unlocked_at;
  await call('/career/paths/' + P.id, 'DELETE'); await call('/projects/' + proj.id, 'DELETE');
  const r = await ach(); assert.ok(r.achievements.find(x => x.key === 'first_lesson').unlocked); assert.ok(r.achievements.find(x => x.key === 'project_done').unlocked);
  assert.equal(rows('SELECT key FROM achievement_unlocks WHERE user_id=?', uid).length, before); assert.equal(rows("SELECT unlocked_at FROM achievement_unlocks WHERE user_id=? AND key='first_lesson'", uid)[0].unlocked_at, when);
  assert.equal(r.history.length, before); assert.ok(r.history.every(h => h.unlocked_date && h.title && h.category));
});
test('dashboard is wired to career, projects, skills and achievements', async () => {
  const dsh = (await call('/dashboard')).body, s = (await ach()).summary;
  assert.equal(dsh.achievements, s.unlocked); assert.equal(dsh.achievementStats.total, s.total); assert.ok(dsh.achievementStats.recent.length > 0);
  assert.equal(dsh.skillStats.total, 3); assert.equal(dsh.projectStats.total, 2); assert.equal(dsh.career.paths, 0); assert.equal(dsh.career.progress, 0);
  const p = (await call('/career/paths', 'POST', { title: 'Dash path', template: 'data', target_date: d(60) })).body;
  const first = p.stages[0].lessons[0]; await call(`/career/lessons/${first.id}/complete`, 'POST', {}); await call(`/career/paths/${p.id}/study`, 'POST', { minutes: 25 });
  const c = (await call('/dashboard')).body.career; assert.equal(c.paths, 1); assert.equal(c.lessonsDone, 1); assert.equal(c.lessonsTotal, 12); assert.equal(c.progress, 8); assert.equal(c.studyMinutes, 25);
  assert.equal(c.nextLesson.title, p.stages[0].lessons[1].title); assert.equal(c.topPath.title, 'Dash path');
});
test('persistence: data is on disk and survives reopening the database file', async () => {
  const fresh = new Database(process.env.DB_PATH);
  const uid = fresh.prepare("SELECT id FROM users WHERE email='a2a@x.com'").get().id, n = (t) => fresh.prepare(`SELECT COUNT(*) c FROM ${t} WHERE user_id=?`).get(uid).c;
  assert.equal(n('career_paths'), 1); assert.equal(n('career_lessons'), 12); assert.equal(n('career_study_logs'), 1); assert.equal(n('skills'), 3); assert.equal(n('projects'), 2); assert.ok(n('achievement_unlocks') >= 8);
});
test('demo account: real seeded career data, fake 1B achievements gone, achievements computed', async () => {
  const t = (await call('/auth/login', 'POST', { email: 'demo@learnjectory.com', password: 'demo1234' }, null)).body.token; assert.ok(t);
  const p = (await call('/career/paths', 'GET', null, t)).body; assert.equal(p.paths.length, 1); assert.equal(p.paths[0].lessons_done, 3); assert.equal(p.paths[0].study_minutes, 150);
  const r = await ach(t); assert.ok(r.achievements.find(x => x.key === 'first_lesson').unlocked); assert.ok(r.achievements.find(x => x.key === 'streak_7').unlocked); // seeded coding habit has a real 9-day log history
  assert.equal(r.achievements.find(x => x.key === 'streak_30').unlocked, false);
  assert.equal(rows('SELECT id FROM achievements WHERE title=? OR title=?', 'First 7-day streak', "Dean's List").length, 0);
  const sk = (await call('/skills', 'GET', null, t)).body.skills; assert.ok(sk.every(x => x.category && x.level_name));
});
