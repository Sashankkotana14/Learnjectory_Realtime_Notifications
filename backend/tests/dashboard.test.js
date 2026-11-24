// Dashboard integrations tests (Opportunities, Community, Statistics, Data Boards): real controllers + real SQLite (temp DB), mock req/res.
// Needs only Node (uses tests/_shims when better-sqlite3 is missing):   cd backend && npm run test:dashboard
const os = require('os'), path = require('path'), fs = require('fs'), stamp = Date.now() + '_' + process.pid;
process.env.NODE_ENV = 'test'; process.env.SEED_DEMO = 'false'; process.env.DB_PATH = path.join(os.tmpdir(), `lj_dash_${stamp}.db`);
const { test, after } = require('node:test'), assert = require('node:assert/strict');
const db = require('../database/db'), U = require('../utils'), DD = require('../controllers/dashboardData'), ST = require('../controllers/stats');
after(() => { try { db.close && db.close(); } catch { /* ignore */ } for (const s of ['', '-wal', '-shm']) fs.rmSync(process.env.DB_PATH + s, { force: true }); });

const user = n => db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(n, n.toLowerCase() + '@dash.local', 'x').lastInsertRowid;
const A = user('Alice'), B = user('Bob'), E = user('Eve'), Z = user('Zero'); // Z never gets any data
const T = U.todayStr(), d = n => U.addDays(T, n);
const run = (fn, uid, body = {}, query = {}) => { let out; fn({ user: { id: uid }, body, query, params: {} }, { status(c) { this.c = c; return this; }, json(b) { out = { status: this.c || 200, body: b }; } }); return out; };
const ok = (fn, uid, body, query) => { const r = run(fn, uid, body, query); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };
const ins = (t, uid, o) => { const k = Object.keys(o); return db.prepare(`INSERT INTO ${t}(user_id,${k}) VALUES(?,${k.map(() => '?')})`).run(uid, ...Object.values(o)).lastInsertRowid; };
const tile = (s, k) => s.tiles.find(t => t.key === k);

test('schema: dashboard_boards table, foreign key, unique key and indexes exist', () => {
  const cols = db.prepare('PRAGMA table_info(dashboard_boards)').all().map(c => c.name);
  for (const c of ['id', 'user_id', 'board_key', 'visible', 'position', 'updated_at']) assert.ok(cols.includes(c), c);
  assert.equal(db.prepare('PRAGMA foreign_key_list(dashboard_boards)').all()[0].table, 'users');
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(i => i.name);
  for (const i of ['idx_dboard_user', 'idx_cpost_user', 'idx_ccom_user', 'idx_clike_user', 'idx_ccollab_user']) assert.ok(idx.includes(i), i);
  require('../database/dashboard')(db); require('../database/dashboard')(db); // idempotent
});

test('a brand-new user gets honest empty data: zeros, nulls, no invented rows', () => {
  const o = ok(DD.opportunities, Z), c = ok(DD.community, Z), s = ok(DD.statistics, Z), b = ok(DD.boards, Z).boards;
  assert.deepEqual([o.has_resume, o.resume, o.saved_total, o.applications, o.interview_rate, o.avg_match, o.recent.length, o.top_gaps.length], [false, null, 0, 0, null, null, 0, 0]);
  assert.deepEqual(Object.values(o.counts), [0, 0, 0, 0, 0]);
  assert.deepEqual(Object.values(c.mine), Array(Object.keys(c.mine).length).fill(0));
  // the Community is shared: community-wide figures are other students' real posts, but nothing is attributed to the new user
  assert.equal(c.community.posts, db.prepare('SELECT COUNT(*) n FROM community_posts').get().n); assert.ok(c.latest.every(x => !x.is_mine));
  for (const t of s.tiles) { if (t.unit === '%') { assert.equal(t.value, null, t.key); assert.equal(t.valid, false, t.key); } else assert.equal(t.value, 0, t.key); assert.ok(!/NaN|undefined|null/.test(t.detail), t.detail); }
  assert.deepEqual(b.map(x => x.key), ['deadlines', 'study', 'skills', 'vault']); assert.ok(b.every(x => x.visible && x.data));
  assert.equal(b[0].data.items.length, 0); assert.equal(b[1].data.total_minutes, 0); assert.equal(b[2].data.top_skills.length, 0); assert.equal(b[3].data.recent.length, 0);
});

// ---------- seed Alice (every module the integrations read) ----------
const resume = { skills: [{ name: 'JavaScript', category: 'Programming' }, { name: 'React', category: 'Frontend' }, { name: 'SQL', category: 'Data' }], education: [{ line: 'B.Tech' }], experience: [], projects: [{ name: 'X' }, { name: 'Y' }] };
db.prepare('INSERT INTO resumes(user_id,filename,file_type,size,method,parsed) VALUES(?,?,?,?,?,?)').run(A, 'cv.docx', 'docx', 1000, 'docx', JSON.stringify(resume));
const job = (uid, o) => ins('saved_jobs', uid, { source: 'manual', external_id: 'e' + Math.random(), url: 'https://x.test/' + Math.random(), ...o });
job(A, { title: 'Frontend Dev', company: 'Acme', description: 'React and JavaScript and TypeScript', status: 'saved' });
job(A, { title: 'Backend Dev', company: 'Beta', description: 'Python, Docker and SQL', status: 'applied' });
job(A, { title: 'Full Stack', company: 'Gamma', description: 'React Node.js', status: 'interviewing' });
job(A, { title: 'Data Eng', company: 'Delta', description: 'Python Docker', status: 'rejected' });
job(B, { title: 'Bob job', description: 'Rust', status: 'offer' });

test('Opportunities: resume, saved-job pipeline, interview rate, match and skill gaps come from the database', () => {
  const o = ok(DD.opportunities, A);
  assert.equal(o.has_resume, true); assert.deepEqual([o.resume.filename, o.resume.skills, o.resume.education, o.resume.projects, o.resume.experience], ['cv.docx', 3, 1, 2, 0]);
  assert.equal(o.saved_total, 4); assert.deepEqual(o.counts, { saved: 1, applied: 1, interviewing: 1, offer: 0, rejected: 1 });
  assert.equal(o.applications, 3); assert.equal(o.interview_rate, 33); // 1 interviewing of 3 applied
  assert.equal(o.recent.length, 4); assert.equal(o.recent[0].title, 'Data Eng'); // newest first
  const fe = o.recent.find(r => r.title === 'Frontend Dev'); assert.equal(fe.match, 67); // React+JS of React+JS+TS
  assert.ok(o.top_gaps.some(g => g.name === 'Docker' && g.jobs === 2) && o.top_gaps.some(g => g.name === 'TypeScript'));
  assert.ok(o.avg_match > 0 && o.avg_match <= 100);
});
test('Opportunities: another user never sees these rows (isolation) and has a different pipeline', () => {
  const b = ok(DD.opportunities, B); assert.equal(b.saved_total, 1); assert.equal(b.counts.offer, 1); assert.equal(b.has_resume, false); assert.equal(b.avg_match, null);
  assert.equal(b.recent.every(r => r.title === 'Bob job'), true);
});
test('Opportunities: dashboard is live - saving a job changes the numbers immediately', () => {
  const before = ok(DD.opportunities, B).saved_total; job(B, { title: 'Another', status: 'applied' });
  const a = ok(DD.opportunities, B); assert.equal(a.saved_total, before + 1); assert.equal(a.applications, 2);
});

// Community
const p1 = ins('community_posts', A, { content: 'How do I learn SQL?', title: 'SQL help', kind: 'question', category: 'Study Help' });
const p2 = ins('community_posts', A, { content: 'Need teammates for hackathon', title: 'Team up', kind: 'collaboration', category: 'Projects' });
const p3 = ins('community_posts', B, { content: 'Open question from Bob', title: 'Bob Q', kind: 'question', category: 'Tech' });
const p4 = ins('community_posts', B, { content: 'Just a chat', kind: 'discussion' });
const cB = db.prepare('INSERT INTO community_comments(post_id,user_id,body) VALUES(?,?,?)').run(p1, B, 'Try the docs').lastInsertRowid;
db.prepare('INSERT INTO community_comments(post_id,user_id,body) VALUES(?,?,?)').run(p3, A, 'Answer from Alice');
db.prepare('INSERT INTO community_comments(post_id,user_id,body) VALUES(?,?,?)').run(p3, A, 'Second answer');
db.prepare('UPDATE community_posts SET solved=1,accepted_comment_id=? WHERE id=?').run(cB, p1);
const like = (uid, type, id) => db.prepare('INSERT INTO community_likes(user_id,target_type,target_id) VALUES(?,?,?)').run(uid, type, id);
like(B, 'post', p1); like(A, 'post', p1) /* self-like: must not count */; like(B, 'post', p2); like(E, 'post', p2); like(B, 'comment', db.prepare('SELECT id FROM community_comments WHERE user_id=? LIMIT 1').get(A).id);
db.prepare('INSERT INTO community_collab(post_id,user_id,message,status) VALUES(?,?,?,?)').run(p2, B, 'I can help', 'pending');
db.prepare('INSERT INTO community_collab(post_id,user_id,message,status) VALUES(?,?,?,?)').run(p2, E, 'me too', 'accepted');
db.prepare('INSERT INTO community_collab(post_id,user_id,message,status) VALUES(?,?,?,?)').run(db.prepare('INSERT INTO community_posts(user_id,content,kind,collab_open) VALUES(?,?,?,1)').run(B, 'Bob team', 'collaboration').lastInsertRowid, A, 'join', 'accepted');

test('Community: my activity, likes received (self-likes excluded), solved questions, pending join requests', () => {
  const m = ok(DD.community, A).mine;
  assert.equal(m.posts, 2); assert.equal(m.comments, 2); assert.equal(m.questions, 1); assert.equal(m.solved_questions, 1);
  assert.equal(m.likes_received, 4); // post p1 (B), post p2 (B,E), comment (B); Alice's own like on p1 excluded
  assert.equal(m.answers_accepted, 0); assert.equal(m.pending_requests, 1); assert.equal(m.my_requests, 1); assert.equal(m.teams_joined, 1);
  const bm = ok(DD.community, B).mine; assert.equal(bm.answers_accepted, 1); assert.equal(bm.posts, 3); assert.equal(bm.pending_requests, 0);
});
test('Community: community-wide figures and latest posts are real rows, newest first', () => {
  const c = ok(DD.community, A), total = db.prepare('SELECT COUNT(*) n FROM community_posts').get().n;
  assert.equal(c.community.posts, total); assert.equal(c.community.members, 2);
  assert.equal(c.community.open_questions, 1); // p3 only (p1 solved)
  assert.equal(c.community.unanswered, 0); assert.equal(c.community.open_collabs, 2);
  assert.equal(c.latest.length, 4); assert.deepEqual(c.latest.map(x => x.id), [...c.latest.map(x => x.id)].sort((a, b) => b - a));
  const mine = c.latest.find(x => x.id === p2); assert.equal(mine.is_mine, true); assert.equal(mine.author, 'Alice'); assert.equal(mine.likes, 2);
  assert.equal(c.latest.find(x => x.id === p4).text, 'Just a chat'); // untitled post falls back to its content
});
test('Community: dashboard is live - a new comment and a deleted post change the numbers', () => {
  const b0 = ok(DD.community, E).mine.comments; db.prepare('INSERT INTO community_comments(post_id,user_id,body) VALUES(?,?,?)').run(p4, E, 'hi'); assert.equal(ok(DD.community, E).mine.comments, b0 + 1);
  const unanswered = ok(DD.community, A).community.unanswered; const q = ins('community_posts', E, { content: 'nobody answers', title: 'lonely', kind: 'question' });
  assert.equal(ok(DD.community, A).community.unanswered, unanswered + 1); db.prepare('DELETE FROM community_posts WHERE id=?').run(q); assert.equal(ok(DD.community, A).community.unanswered, unanswered);
});

// Statistics inputs
ins('assignments', A, { title: 'a1', subject: 'Math', due_date: d(2), status: 'pending' }); ins('assignments', A, { title: 'a2', subject: 'Math', due_date: d(-1), status: 'done' });
ins('assignments', A, { title: 'a3', subject: 'Phy', due_date: d(9), status: 'done' }); ins('assignments', A, { title: 'a4', subject: 'Phy', due_date: d(30), status: 'pending' });
ins('academics', A, { subject: 'Math', progress: 50, credits: 3, classes_attended: 30, classes_total: 40 }); ins('academics', A, { subject: 'Phy', progress: 70, credits: 3, classes_attended: 10, classes_total: 10 }); ins('academics', A, { subject: 'NoClasses', progress: 10, credits: 1 });
ins('goals', A, { title: 'g done', progress: 100, target_date: d(5) }); ins('goals', A, { title: 'g open', progress: 40, target_date: d(10) }); ins('goals', A, { title: 'g later', progress: 0, target_date: d(3) });
ins('skills', A, { name: 'JavaScript', level: 80, category: 'Programming' }); ins('skills', A, { name: 'Python', level: 60, category: 'Programming' }); ins('skills', A, { name: 'Figma', level: 20, category: 'Design' });
ins('projects', A, { title: 'P1', status: 'completed', technologies: 'React' }); ins('projects', A, { title: 'P2', status: 'active', technologies: 'Node' }); ins('projects', A, { title: 'P3', status: 'planning', technologies: 'Go' });
const hid = ins('habits', A, { name: 'Read', category: 'Study', daily_target: 1 });
for (const n of [0, -1, -2]) db.prepare('INSERT INTO habit_logs(user_id,habit_id,log_date,count) VALUES(?,?,?,1)').run(A, hid, d(n));
db.prepare('UPDATE habits SET created_at=? WHERE id=?').run(d(-3) + ' 10:00:00', hid); // exists for 4 days (-3..0), done on 3
const path1 = db.prepare('INSERT INTO career_paths(user_id,title,target_date) VALUES(?,?,?)').run(A, 'Web path', d(20)).lastInsertRowid;
for (const c of [1, 0, 0, 0]) db.prepare('INSERT INTO career_lessons(user_id,path_id,stage,title,completed) VALUES(?,?,?,?,?)').run(A, path1, 'Beginner', 'L', c);
db.prepare('INSERT INTO career_study_logs(user_id,path_id,log_date,minutes) VALUES(?,?,?,?)').run(A, path1, d(0), 90);
db.prepare('INSERT INTO career_study_logs(user_id,path_id,log_date,minutes) VALUES(?,?,?,?)').run(A, path1, d(-2), 30);
const plan = db.prepare('INSERT INTO study_plans(user_id,title,plan_date,total_minutes) VALUES(?,?,?,?)').run(A, 'p', d(-1), 100).lastInsertRowid;
db.prepare("INSERT INTO study_plan_items(user_id,plan_id,subject_name,allocated_minutes,status) VALUES(?,?,?,?,'done')").run(A, plan, 'Math', 50);
db.prepare("INSERT INTO study_plan_items(user_id,plan_id,subject_name,allocated_minutes,status) VALUES(?,?,?,?,'pending')").run(A, plan, 'Phy', 50); // not done: never counted
ins('study_sessions', A, { title: 'legacy', session_date: d(-3), duration: 20, completed: 1 }); ins('study_sessions', A, { title: 'legacy2', session_date: d(-3), duration: 99, completed: 0 });
const note = ins('vault', A, { title: 'My note', content: 'c' }); db.prepare('INSERT INTO vault_links(user_id,title,url) VALUES(?,?,?)').run(A, 'Docs', 'https://d.test');
db.prepare('INSERT INTO vault_files(user_id,original_name,stored_name,mime,ext,size) VALUES(?,?,?,?,?,?)').run(A, 'notes.pdf', 'abc', 'application/pdf', 'pdf', 2 * 1024 * 1024);
db.prepare('INSERT INTO vault_folders(user_id,name) VALUES(?,?)').run(A, 'School');
ins('vault', B, { title: 'Bob secret', content: 's' });

test('Statistics: every figure matches the database rows (and is a valid number)', () => {
  const s = ok(DD.statistics, A);
  assert.equal(tile(s, 'study').value, 90 + 30 + 50 + 20); assert.match(tile(s, 'study').detail, /^\d+ min this week$/);
  assert.equal(tile(s, 'assignments').value, 50); assert.deepEqual([tile(s, 'assignments').part, tile(s, 'assignments').whole], [2, 4]);
  assert.equal(tile(s, 'attendance').value, 80); assert.equal(tile(s, 'attendance').whole, 50); // 40 of 50, subject without classes ignored
  assert.equal(tile(s, 'goals').value, 33); assert.equal(tile(s, 'habits').value, 75); assert.deepEqual([tile(s, 'habits').part, tile(s, 'habits').whole], [3, 4]);
  assert.equal(tile(s, 'lessons').value, 25); assert.equal(tile(s, 'skills').value, 53); assert.equal(tile(s, 'projects').value, 33);
  assert.equal(tile(s, 'applications').value, 33); assert.equal(tile(s, 'community').value, 4); assert.equal(tile(s, 'vault').value, 3);
  for (const t of s.tiles) { assert.ok(t.valid); assert.ok(Number.isFinite(t.value) && t.value >= 0); if (t.unit === '%') assert.ok(t.value <= 100, t.key); assert.ok(t.link.startsWith('/')); }
  assert.ok(Number.isFinite(Date.parse(s.generated_at)));
});
test('Statistics: weekly study minutes only count work done this week; ratios with no data are null, never 0% or NaN', () => {
  const s = ok(DD.statistics, B); // Bob has no assignments / goals / habits / skills / projects
  for (const k of ['assignments', 'attendance', 'goals', 'habits', 'lessons', 'skills', 'projects']) assert.equal(tile(s, k).value, null, k);
  assert.equal(tile(s, 'applications').value, 50); /* Bob: 1 offer of 2 applied */ assert.equal(tile(s, 'vault').value, 1); assert.equal(tile(s, 'study').value, 0);
  assert.equal(DD._pct(1, 0), null); assert.equal(DD._pct(NaN, 5), null); assert.equal(DD._pct(7, 5), 100); assert.equal(DD._pct(-3, 5), 0); assert.equal(DD._int(-5), 0); assert.equal(DD._int('x'), 0); assert.equal(DD._int(3.9), 3);
});
test('Statistics: invalid stored values (attended > total, negative minutes) are clamped, not shown as >100%', () => {
  ins('academics', E, { subject: 'Odd', classes_attended: 99, classes_total: 10 }); db.prepare('INSERT INTO career_paths(user_id,title) VALUES(?,?)').run(E, 'p');
  db.prepare('INSERT INTO career_study_logs(user_id,path_id,log_date,minutes) VALUES(?,?,?,?)').run(E, db.prepare('SELECT id FROM career_paths WHERE user_id=?').get(E).id, d(0), -50);
  const s = ok(DD.statistics, E); assert.equal(tile(s, 'attendance').value, 100); assert.equal(tile(s, 'study').value, 0);
});
test('Statistics: stays live - completing an assignment updates the rate', () => {
  const id = db.prepare("SELECT id FROM assignments WHERE user_id=? AND title='a1'").get(A).id; db.prepare("UPDATE assignments SET status='done' WHERE id=?").run(id);
  assert.equal(tile(ok(DD.statistics, A), 'assignments').value, 75);
});

test('Data Boards: Upcoming Deadlines merges assignments, goals and career paths, soonest first, overdue counted', () => {
  const b = ok(DD.boards, A).boards.find(x => x.key === 'deadlines').data;
  assert.deepEqual(b.items.map(i => i.title), ['g later', 'g open', 'Web path', 'a4']); assert.equal(b.total, 4); assert.equal(b.overdue, 0);
  assert.deepEqual(b.items.map(i => i.date), [...b.items.map(i => i.date)].sort()); assert.ok(b.items.every(i => i.days_left === U.daysBetween(T, i.date)));
  const types = new Set(b.items.map(i => i.type)); assert.ok(types.has('assignment') && types.has('goal') && types.has('career'));
  assert.ok(!b.items.some(i => i.title === 'g done'), 'completed goals are not deadlines'); assert.ok(!b.items.some(i => i.title === 'a2'), 'done assignments are not deadlines');
  ins('assignments', A, { title: 'late', due_date: d(-4), status: 'pending' }); const b2 = ok(DD.boards, A).boards[0].data; assert.equal(b2.items[0].title, 'late'); assert.equal(b2.overdue, 1); assert.equal(b2.items[0].days_left, -4);
});
test('Data Boards: Study board = last 7 days of real study minutes (career logs + completed planner + completed legacy sessions)', () => {
  const s = ok(DD.boards, A).boards.find(x => x.key === 'study').data;
  assert.equal(s.days.length, 7); assert.equal(s.days[6].date, T); assert.equal(s.days[6].is_today, true);
  const m = Object.fromEntries(s.days.map(x => [x.date, x.minutes])); assert.equal(m[d(0)], 90); assert.equal(m[d(-1)], 50); assert.equal(m[d(-2)], 30); assert.equal(m[d(-3)], 20);
  assert.equal(s.total_minutes, 190); assert.equal(s.active_days, 4); assert.equal(s.avg_minutes, 48); assert.equal(s.max_minutes, 90);
});
test('Data Boards: Skills & Projects and My Vault read the real tables', () => {
  const bs = ok(DD.boards, A).boards, sk = bs.find(x => x.key === 'skills').data, v = bs.find(x => x.key === 'vault').data;
  assert.deepEqual(sk.top_skills.map(x => x.name), ['JavaScript', 'Python', 'Figma']); assert.equal(sk.skills_total, 3); assert.equal(sk.categories, 2);
  assert.deepEqual(sk.projects_by_status, { completed: 1, active: 1, planning: 1 }); assert.equal(sk.open_projects.length, 2); assert.ok(!sk.open_projects.some(p => p.title === 'P1'));
  assert.deepEqual([v.notes, v.links, v.files, v.folders], [1, 1, 1, 1]); assert.equal(v.bytes, 2 * 1024 * 1024); assert.ok(v.quota_bytes > v.bytes); assert.equal(v.quota_percent, 1);
  assert.deepEqual(v.recent.map(r => r.kind).sort(), ['file', 'link', 'note']); assert.ok(!JSON.stringify(v).includes('Bob secret'), 'vault is private per user');
  assert.equal(JSON.stringify(v).includes('stored_name') || JSON.stringify(v).includes('abc'), false, 'storage names never leave the server');
});
test('Data Boards: choose which boards are shown and their order (persisted per user)', () => {
  let r = ok(DD.saveBoards, A, { boards: [{ key: 'vault', visible: true }, { key: 'study', visible: false }] });
  assert.deepEqual(r.boards.map(b => b.key), ['vault', 'study', 'deadlines', 'skills']); assert.equal(r.boards[1].visible, false); assert.equal(r.boards[1].data, null); assert.ok(r.boards[0].data);
  assert.deepEqual(ok(DD.boards, A).boards.map(b => [b.key, b.visible]), [['vault', true], ['study', false], ['deadlines', true], ['skills', true]]); // survives a reload
  assert.deepEqual(ok(DD.boards, B).boards.map(b => [b.key, b.visible]), [['deadlines', true], ['study', true], ['skills', true], ['vault', true]]); // other users unaffected
  assert.equal(db.prepare('SELECT COUNT(*) n FROM dashboard_boards WHERE user_id=?').get(A).n, 4); // upsert: one row per board, no duplicates
  r = ok(DD.saveBoards, A, { boards: [{ key: 'study' }] }); assert.equal(r.boards[0].key, 'study'); assert.equal(r.boards[0].visible, false, 'visibility is kept when not sent');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM dashboard_boards WHERE user_id=?').get(A).n, 4);
  ok(DD.saveBoards, A, { boards: ['deadlines', 'study', 'skills', 'vault'].map(key => ({ key, visible: true })) });
});
test('Data Boards: invalid requests are rejected and change nothing', () => {
  const before = JSON.stringify(ok(DD.boards, A).boards);
  for (const body of [{}, { boards: [] }, { boards: 'x' }, { boards: [{ key: 'nope' }] }, { boards: [{ key: 'vault', visible: 'yes' }] }, { boards: [{ key: 'vault' }, { key: 'vault' }] }, { boards: [null] }, { boards: Array(9).fill({ key: 'vault' }) }]) assert.equal(run(DD.saveBoards, A, body).status, 400, JSON.stringify(body));
  assert.equal(JSON.stringify(ok(DD.boards, A).boards), before);
});
test('foreign key: deleting a user removes their board preferences', () => {
  const u = user('Temp'); ok(DD.saveBoards, u, { boards: [{ key: 'vault', visible: false }] }); assert.equal(db.prepare('SELECT COUNT(*) n FROM dashboard_boards WHERE user_id=?').get(u).n, 4);
  db.prepare('DELETE FROM users WHERE id=?').run(u); assert.equal(db.prepare('SELECT COUNT(*) n FROM dashboard_boards WHERE user_id=?').get(u).n, 0);
});

test('GET /api/dashboard now carries the four integrations and keeps every existing key', () => {
  const dash = ok(ST.dashboard, A);
  for (const k of ['user', 'academics', 'academicStats', 'activeGoals', 'goalSummary', 'dueToday', 'habitsDone', 'habitsTotal', 'habitStats', 'pendingAssignments', 'assignmentSummary', 'nextAssignment', 'upcomingAssignments', 'goals', 'focus', 'study', 'activity', 'achievements', 'achievementStats', 'career', 'projectStats', 'skillStats']) assert.ok(k in dash, 'existing key kept: ' + k);
  for (const k of ['opportunities', 'community', 'statistics', 'boards']) assert.ok(dash[k], 'new key: ' + k);
  assert.equal(dash.opportunities.saved_total, 4); assert.equal(dash.community.mine.posts, 2); assert.equal(dash.statistics.tiles.length, 11); assert.equal(dash.boards.length, 4);
  // separate endpoints return exactly the same blocks
  assert.deepEqual(ok(DD.opportunities, A), dash.opportunities); assert.deepEqual(ok(DD.community, A), dash.community);
});
test('GET /api/dashboard works for a user with no data at all', () => { const dash = ok(ST.dashboard, Z); assert.equal(dash.opportunities.saved_total, 0); assert.equal(dash.community.mine.posts, 0); assert.equal(dash.boards.length, 4); });
