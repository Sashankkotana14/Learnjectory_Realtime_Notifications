// Career Compass upgrade tests: YouTube support, lesson reordering, study log management, data preservation.
// Controller-level tests (no HTTP server needed): run with NODE_ENV=test node --test tests/careerUpgrade.test.js
process.env.NODE_ENV = 'test';
process.env.DB_PATH = require('path').join(require('os').tmpdir(), `lj_test_career_${Date.now()}.db`);
process.env.JWT_SECRET = 'test_secret_' + 'z'.repeat(40);
process.env.SEED_DEMO = 'false'; // bcrypt is shimmed in this sandbox; legacy data is inserted with raw SQL below
delete process.env.YOUTUBE_API_KEY;
const { test } = require('node:test'), assert = require('node:assert/strict');
const db = require('../database/db'), CA = require('../controllers/career'), U = require('../utils');
const T = U.todayStr(), d = n => U.addDays(T, n);
const mk = (email) => db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run('U', email, 'x').lastInsertRowid;
const call = async (fn, uid, { body, params, query } = {}) => { let out; const res = { status(c) { this.code = c; return this; }, json(x) { out = { status: this.code || 200, body: x }; return this; } }; await fn({ user: { id: uid }, body: body || {}, params: params || {}, query: query || {} }, res); return out; };
const A = mk('ca@x.com'), B = mk('cb@x.com');
let pid, lessons;
test('setup: template path', async () => {
  const r = await call(CA.create, A, { body: { title: 'Web', template: 'web' } });
  assert.equal(r.status, 201); pid = r.body.id; lessons = r.body.stages.flatMap(s => s.lessons); assert.equal(lessons.length, 12);
});
test('migration is additive: new columns exist, legacy rows (pre-upgrade shape) are untouched and still render', async () => {
  const cols = db.prepare('PRAGMA table_info(career_lessons)').all().map(c => c.name);
  for (const c of ['video_id', 'video_title', 'video_channel', 'video_thumbnail']) assert.ok(cols.includes(c), c);
  assert.ok(db.prepare('PRAGMA table_info(career_study_logs)').all().some(c => c.name === 'updated_at'));
  // legacy rows written with only the OLD columns
  const L = mk('legacy@x.com'), lp = db.prepare('INSERT INTO career_paths(user_id,title,target_date) VALUES(?,?,?)').run(L, 'Legacy', d(30)).lastInsertRowid;
  const li = (t, c, pos) => db.prepare("INSERT INTO career_lessons(user_id,path_id,stage,title,completed,completed_at,position) VALUES(?,?,'Beginner',?,?,?,?)").run(L, lp, t, c, c ? d(-1) : null, pos).lastInsertRowid;
  const a = li('One', 1, 0), b = li('Two', 0, 1); db.prepare('INSERT INTO career_study_logs(user_id,path_id,log_date,minutes,note) VALUES(?,?,?,?,?)').run(L, lp, d(-1), 50, 'old');
  const r = await call(CA.get, L, { params: { id: lp } }); assert.equal(r.body.lessons_done, 1); assert.equal(r.body.progress, 50); assert.equal(r.body.study_minutes, 50); assert.equal(r.body.stages[0].lessons[0].video, null);
  await call(CA.reorderLessons, L, { params: { id: lp }, body: { stage: 'Beginner', order: [b, a] } });
  const after = db.prepare('SELECT id,completed,completed_at,title FROM career_lessons WHERE path_id=? ORDER BY id').all(lp);
  assert.deepEqual(after.map(x => [x.title, x.completed]), [['One', 1], ['Two', 0]]); assert.equal(after[0].completed_at, d(-1));
  assert.equal(db.prepare('SELECT minutes,note FROM career_study_logs WHERE path_id=?').get(lp).minutes, 50);
});
test('existing lesson view keeps all old fields and gets video:null', async () => {
  const r = await call(CA.get, A, { params: { id: pid } }), l = r.body.stages[0].lessons[0];
  for (const k of ['id', 'title', 'stage', 'completed', 'youtube_url', 'resource_url', 'position']) assert.ok(k in l, k);
  assert.equal(l.video, null);
});
test('video id parsing', () => {
  const v = CA._videoId, id = 'dQw4w9WgXcQ';
  assert.equal(v('https://www.youtube.com/watch?v=' + id + '&t=3'), id); assert.equal(v('https://youtu.be/' + id + '?si=x'), id);
  assert.equal(v('https://www.youtube.com/shorts/' + id), id); assert.equal(v('https://youtube.com/embed/' + id), id); assert.equal(v('https://m.youtube.com/watch?v=' + id), id);
  assert.equal(v(id), id); assert.equal(v('https://evil.com/watch?v=' + id), null); assert.equal(v('https://youtube.com.evil.com/watch?v=' + id), null); assert.equal(v('javascript:alert(1)'), null); assert.equal(v('hello world'), null);
});
test('youtube search: validation, pasted link, no-key fallback', async () => {
  assert.equal((await call(CA.youtube, A, { query: { q: 'a' } })).status, 400);
  const s = await call(CA.youtube, A, { query: { q: 'react hooks' } }); assert.equal(s.body.source, 'search-link'); assert.ok(s.body.search_url.includes('react%20hooks')); assert.deepEqual(s.body.videos, []);
  const realFetch = global.fetch; global.fetch = async () => { throw new Error('offline'); };
  const l = await call(CA.youtube, A, { query: { q: 'https://youtu.be/dQw4w9WgXcQ' } });
  global.fetch = realFetch; assert.equal(l.body.source, 'video-link'); assert.equal(l.body.videos[0].id, 'dQw4w9WgXcQ'); assert.equal(l.body.videos[0].verified, false);
  assert.equal((await call(CA.youtubeResolve, A, { query: { url: 'https://example.com' } })).status, 400);
});
test('youtube search with API key: results + pagination token', async () => {
  process.env.YOUTUBE_API_KEY = 'k'; const realFetch = global.fetch; let url;
  global.fetch = async u => { url = String(u); return { ok: true, json: async () => ({ nextPageToken: 'NEXT1', items: [{ id: { videoId: 'aaaaaaaaaaa' }, snippet: { title: 'T', channelTitle: 'C', thumbnails: { medium: { url: 'https://i.ytimg.com/x.jpg' } } } }, { id: {}, snippet: {} }] }) }; };
  const r = await call(CA.youtube, A, { query: { q: 'node', pageToken: 'P_1-x!!' } }); global.fetch = realFetch; delete process.env.YOUTUBE_API_KEY;
  assert.equal(r.body.source, 'youtube-api'); assert.equal(r.body.videos.length, 1); assert.equal(r.body.next_page_token, 'NEXT1'); assert.ok(url.includes('pageToken=P_1-x'));
});
test('attach / replace / remove a video on a lesson (isolated per user)', async () => {
  const l = lessons[0], realFetch = global.fetch; global.fetch = async () => ({ ok: true, json: async () => ({ title: 'Great HTML', author_name: 'Chan', thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' }) });
  const bad = await call(CA.setVideo, A, { params: { id: l.id }, body: { url: 'https://notyoutube.com/x' } }); assert.equal(bad.status, 400);
  assert.equal((await call(CA.setVideo, B, { params: { id: l.id }, body: { url: 'dQw4w9WgXcQ' } })).status, 404);
  const ok = await call(CA.setVideo, A, { params: { id: l.id }, body: { url: 'https://youtu.be/dQw4w9WgXcQ' } }); global.fetch = realFetch;
  assert.equal(ok.body.video.title, 'Great HTML'); assert.equal(ok.body.video.embed_url, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'); assert.equal(ok.body.title, l.title); assert.equal(ok.body.completed, false);
  const det = (await call(CA.get, A, { params: { id: pid } })).body; assert.equal(det.stages[0].lessons.find(x => x.id === l.id).video.id, 'dQw4w9WgXcQ');
  const cl = await call(CA.clearVideo, A, { params: { id: l.id } }); assert.equal(cl.body.video, null);
});
test('reorder lessons within a stage keeps other stages, progress and ids', async () => {
  await call(CA.complete, A, { params: { id: lessons[0].id }, body: { completed: true } });
  const before = (await call(CA.get, A, { params: { id: pid } })).body, st = before.stages[0].lessons.map(x => x.id), other = before.stages[1].lessons.map(x => x.id);
  const next = [st[3], st[1], st[0], st[2]], r = await call(CA.reorderLessons, A, { params: { id: pid }, body: { stage: 'Beginner', order: next } });
  assert.equal(r.status, 200); assert.deepEqual(r.body.stages[0].lessons.map(x => x.id), next); assert.deepEqual(r.body.stages[1].lessons.map(x => x.id), other);
  assert.equal(r.body.lessons_done, 1); assert.equal(r.body.lessons_total, 12); assert.equal(r.body.stages[0].lessons.find(x => x.id === lessons[0].id).completed, true);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM career_lessons WHERE path_id=?').get(pid).n, 12);
  const again = (await call(CA.get, A, { params: { id: pid } })).body; assert.deepEqual(again.stages[0].lessons.map(x => x.id), next);
});
test('reorder validation + ownership', async () => {
  const st = (await call(CA.get, A, { params: { id: pid } })).body.stages[0].lessons.map(x => x.id), o = (stage, order, uid = A) => call(CA.reorderLessons, uid, { params: { id: pid }, body: { stage, order } });
  assert.equal((await o('Nope', st)).status, 400); assert.equal((await o('Beginner', st.slice(1))).status, 400); assert.equal((await o('Beginner', [st[0], st[0], st[1], st[2]])).status, 400);
  assert.equal((await o('Beginner', 'x')).status, 400); assert.equal((await o('Intermediate', st)).status, 400); assert.equal((await o('Beginner', st, B)).status, 404);
});
test('move up/down swaps neighbours and ignores edges', async () => {
  const get = async () => (await call(CA.get, A, { params: { id: pid } })).body.stages[0].lessons.map(x => x.id), ids = await get();
  let r = await call(CA.moveLesson, A, { params: { id: ids[0] }, body: { direction: 'up' } }); assert.deepEqual(await get(), ids);
  r = await call(CA.moveLesson, A, { params: { id: ids[0] }, body: { direction: 'down' } }); assert.deepEqual(r.body.stages[0].lessons.map(x => x.id), [ids[1], ids[0], ids[2], ids[3]]);
  assert.equal((await call(CA.moveLesson, A, { params: { id: ids[0] }, body: { direction: 'left' } })).status, 400); assert.equal((await call(CA.moveLesson, B, { params: { id: ids[0] }, body: { direction: 'up' } })).status, 404);
});
test('new lessons still append to the end after a reorder; legacy duplicate positions are handled', async () => {
  const r = await call(CA.addLesson, A, { params: { id: pid }, body: { title: 'Extra', stage: 'Beginner' } }); assert.equal(r.status, 201);
  const ids = (await call(CA.get, A, { params: { id: pid } })).body.stages[0].lessons.map(x => x.id); assert.equal(ids[ids.length - 1], r.body.id);
  db.prepare('UPDATE career_lessons SET position=5 WHERE path_id=? AND stage=?').run(pid, 'Beginner'); // simulate legacy equal positions
  const cur = db.prepare('SELECT id FROM career_lessons WHERE path_id=? AND stage=? ORDER BY position,id').all(pid, 'Beginner').map(x => x.id), rev = [...cur].reverse();
  const rr = await call(CA.reorderLessons, A, { params: { id: pid }, body: { stage: 'Beginner', order: rev } }); assert.deepEqual(rr.body.stages[0].lessons.map(x => x.id), rev);
});
let logIds = [];
test('study logs: create, list with totals, filters and paging', async () => {
  const ls = (await call(CA.get, A, { params: { id: pid } })).body.stages[0].lessons;
  for (const [n, m, lid, note] of [[0, 30, ls[0].id, 'html basics'], [-1, 45, null, 'general reading'], [-2, 60, ls[0].id, 'forms'], [-40, 20, null, 'old session']]) logIds.push((await call(CA.addStudy, A, { params: { id: pid }, body: { minutes: m, date: d(n), lesson_id: lid || undefined, note } })).body.id);
  let r = (await call(CA.listStudy, A, { params: { id: pid } })).body; assert.equal(r.total, 4); assert.equal(r.total_minutes, 155); assert.equal(r.logs[0].log_date, T); assert.equal(r.logs[0].lesson_title, ls[0].title);
  r = (await call(CA.listStudy, A, { params: { id: pid }, query: { from: d(-7), to: T } })).body; assert.equal(r.total, 3); assert.equal(r.total_minutes, 135);
  r = (await call(CA.listStudy, A, { params: { id: pid }, query: { lesson_id: String(ls[0].id) } })).body; assert.equal(r.total, 2);
  r = (await call(CA.listStudy, A, { params: { id: pid }, query: { lesson_id: 'none' } })).body; assert.equal(r.total, 2);
  r = (await call(CA.listStudy, A, { params: { id: pid }, query: { q: 'form' } })).body; assert.equal(r.total, 1);
  r = (await call(CA.listStudy, A, { params: { id: pid }, query: { q: '%' } })).body; assert.equal(r.total, 0);
  r = (await call(CA.listStudy, A, { params: { id: pid }, query: { limit: '2', offset: '0' } })).body; assert.equal(r.logs.length, 2); assert.equal(r.has_more, true); assert.equal(r.total, 4);
  r = (await call(CA.listStudy, A, { params: { id: pid }, query: { limit: '2', offset: '2' } })).body; assert.equal(r.has_more, false);
  assert.equal((await call(CA.listStudy, A, { params: { id: pid }, query: { from: 'bad' } })).status, 400); assert.equal((await call(CA.listStudy, A, { params: { id: pid }, query: { from: T, to: d(-3) } })).status, 400);
  assert.equal((await call(CA.listStudy, B, { params: { id: pid } })).status, 404);
});
test('study logs: edit with validation, 24h cap excludes itself, ownership', async () => {
  const id = logIds[0], ed = (body, uid = A) => call(CA.updateStudy, uid, { params: { id }, body });
  let r = await ed({ minutes: 90, note: 'edited', lesson_id: null }); assert.equal(r.status, 200); assert.equal(r.body.minutes, 90); assert.equal(r.body.note, 'edited'); assert.equal(r.body.lesson_id, null); assert.equal(r.body.lesson_title, null); assert.ok(r.body.updated_at);
  assert.equal(r.body.log_date, T);
  assert.equal((await ed({ minutes: 0 })).status, 400); assert.equal((await ed({ minutes: 1441 })).status, 400); assert.equal((await ed({ date: d(1) })).status, 400); assert.equal((await ed({ date: 'xx' })).status, 400); assert.equal((await ed({ lesson_id: 999999 })).status, 400);
  assert.equal((await ed({ minutes: 1440 })).status, 200); // alone that day (excludes itself) -> allowed
  await call(CA.addStudy, A, { params: { id: pid }, body: { minutes: 1, date: d(-3) } }); const other = (await call(CA.listStudy, A, { params: { id: pid }, query: { from: d(-3), to: d(-3) } })).body.logs[0].id;
  assert.equal((await call(CA.updateStudy, A, { params: { id: other }, body: { date: T } })).status, 400); // today already 1440
  await ed({ minutes: 30 }); assert.equal((await ed({ minutes: 20 }, B)).status, 404); assert.equal((await call(CA.updateStudy, A, { params: { id: 999999 }, body: {} })).status, 404);
  const det = (await call(CA.get, A, { params: { id: pid } })).body; assert.ok(det.study_minutes > 0 && det.logs.length > 0);
});
test('study log delete still works and totals update; deleting a lesson keeps its logs', async () => {
  const before = (await call(CA.listStudy, A, { params: { id: pid } })).body;
  assert.equal((await call(CA.removeStudy, A, { params: { id: logIds[3] } })).status, 200); assert.equal((await call(CA.removeStudy, B, { params: { id: logIds[2] } })).status, 404);
  const after = (await call(CA.listStudy, A, { params: { id: pid } })).body; assert.equal(after.total, before.total - 1);
  const lid = db.prepare('SELECT lesson_id FROM career_study_logs WHERE id=?').get(logIds[2]).lesson_id; db.prepare('DELETE FROM career_lessons WHERE id=?').run(lid);
  assert.ok(db.prepare('SELECT id FROM career_study_logs WHERE id=?').get(logIds[2]));
});
test('dashboard + summary still work (next lesson follows new order)', async () => {
  const dash = CA.dashboard(A); assert.ok(dash.nextLesson && dash.paths === 1);
  const first = (await call(CA.get, A, { params: { id: pid } })).body.stages.flatMap(s => s.lessons).filter(l => !l.completed).sort((a, b) => a.position - b.position || a.id - b.id)[0];
  assert.equal(dash.nextLesson.id, first.id);
});
