const Database = require('better-sqlite3'), path = require('path'), bcrypt = require('bcryptjs');
const R = require('../models/resources'), U = require('../utils'), CT = require('../models/careerTemplates');
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'learnjectory.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,email TEXT UNIQUE,password TEXT,bio TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS user_settings(user_id INTEGER PRIMARY KEY,notifications INTEGER DEFAULT 1,theme TEXT DEFAULT 'dark');
CREATE TABLE IF NOT EXISTS activity_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,message TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
for (const [t, r] of Object.entries(R)) {
  const cols = Object.entries(r.cols).map(([k, v]) => `${k} ${v}`).join(',');
  db.exec(`CREATE TABLE IF NOT EXISTS ${t}(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,${cols},created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
}
// Lightweight migrations: add any column that is missing in an existing database (keeps old data)
function addCol(t, name, def) {
  if (!db.prepare(`PRAGMA table_info(${t})`).all().some(c => c.name === name)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${name} ${def}`);
}
for (const [t, r] of Object.entries(R)) for (const [k, v] of Object.entries(r.cols)) addCol(t, k, v);
addCol('users', 'token_version', 'INTEGER DEFAULT 0');
// Part 1B tables: study plans (+ sessions), daily habit logs. UNIQUE(habit_id,log_date) makes duplicate completion records for one date impossible.
db.exec(`CREATE TABLE IF NOT EXISTS study_plans(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,title TEXT NOT NULL,plan_date TEXT NOT NULL,total_minutes INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS study_plan_items(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,plan_id INTEGER NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,subject_id INTEGER REFERENCES academics(id) ON DELETE SET NULL,subject_name TEXT NOT NULL,allocated_minutes INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',started_at TEXT,completed_at TEXT,position INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS habit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,log_date TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(habit_id,log_date));
CREATE INDEX IF NOT EXISTS idx_plan_user ON study_plans(user_id,plan_date);CREATE INDEX IF NOT EXISTS idx_item_plan ON study_plan_items(plan_id);CREATE INDEX IF NOT EXISTS idx_hlog_user ON habit_logs(user_id,log_date)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_assign_user ON assignments(user_id,due_date);CREATE INDEX IF NOT EXISTS idx_acad_user ON academics(user_id);CREATE INDEX IF NOT EXISTS idx_act_user ON activity_logs(user_id,id)');
// Part 2A tables: career paths/lessons/study logs, achievement unlock history (UNIQUE(user_id,key) = an achievement can never unlock twice)
db.exec(`CREATE TABLE IF NOT EXISTS career_paths(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,title TEXT NOT NULL,description TEXT DEFAULT '',target_date TEXT,template_key TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS career_lessons(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,path_id INTEGER NOT NULL REFERENCES career_paths(id) ON DELETE CASCADE,stage TEXT NOT NULL,title TEXT NOT NULL,description TEXT DEFAULT '',resource_url TEXT DEFAULT '',resource_type TEXT DEFAULT 'other',youtube_query TEXT DEFAULT '',est_minutes INTEGER DEFAULT 0,position INTEGER DEFAULT 0,completed INTEGER DEFAULT 0,completed_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS career_study_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,path_id INTEGER NOT NULL REFERENCES career_paths(id) ON DELETE CASCADE,lesson_id INTEGER REFERENCES career_lessons(id) ON DELETE SET NULL,log_date TEXT NOT NULL,minutes INTEGER NOT NULL,note TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS achievement_unlocks(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,key TEXT NOT NULL,unlocked_date TEXT NOT NULL,unlocked_at TEXT DEFAULT CURRENT_TIMESTAMP,value_at_unlock INTEGER DEFAULT 0,UNIQUE(user_id,key));
CREATE INDEX IF NOT EXISTS idx_cpath_user ON career_paths(user_id);CREATE INDEX IF NOT EXISTS idx_clesson_path ON career_lessons(path_id);CREATE INDEX IF NOT EXISTS idx_clog_user ON career_study_logs(user_id,log_date);CREATE INDEX IF NOT EXISTS idx_unlock_user ON achievement_unlocks(user_id)`);
// Career Compass upgrade (additive only): optional attached YouTube video per lesson. Existing rows keep NULL/'' values and are never rewritten.
addCol('career_lessons', 'video_id', "TEXT DEFAULT ''");
addCol('career_lessons', 'video_title', "TEXT DEFAULT ''");
addCol('career_lessons', 'video_channel', "TEXT DEFAULT ''");
addCol('career_lessons', 'video_thumbnail', "TEXT DEFAULT ''");
addCol('career_study_logs', 'updated_at', 'TEXT');
// Part 2B schema (resumes, saved jobs, community comments/likes/collab, vault folders/files/links)
require('./part2b')(db);
// Dashboard integrations (Opportunities, Community, Statistics, Data Boards): one additive table + indexes
require('./dashboard')(db);
// Permanent notification storage (read / cleared state survives refresh and logout): one additive table
require('./notifications')(db);
// 1B seeded two hard-coded demo achievements; achievements are now earned from real progress only, so remove exactly those fake rows
db.prepare('DELETE FROM achievements WHERE (title=? AND description=?) OR (title=? AND description=?)').run('First 7-day streak', 'Kept a habit for a week', "Dean's List", 'Top 10% of the class');
function ins(t, uid, o) {
  const k = Object.keys(o);
  db.prepare(`INSERT INTO ${t}(user_id,${k})VALUES(?,${k.map(() => '?')})`).run(uid, ...Object.values(o));
}
function seedDemo() {
  if (db.prepare('SELECT id FROM users WHERE email=?').get('demo@learnjectory.com')) return;
  const uid = db.prepare('INSERT INTO users(name,email,password,bio) VALUES(?,?,?,?)')
    .run('Demo Student', 'demo@learnjectory.com', bcrypt.hashSync('demo1234', 10), 'Learning something new every day.').lastInsertRowid;
  db.prepare('INSERT INTO user_settings(user_id) VALUES(?)').run(uid);
  const d = n => U.addDays(U.todayStr(), n);
  [['Mathematics', 78, 'A-', 'A', 4, 34, 38], ['Physics', 64, 'B+', 'A-', 4, 28, 34], ['Computer Science', 88, 'A', 'A', 3, 30, 31], ['English', 71, 'B', 'B+', 2, 20, 26]].forEach(([subject, progress, grade, target_grade, credits, classes_attended, classes_total]) => ins('academics', uid, { subject, progress, grade, target_grade, credits, classes_attended, classes_total }));
  [['Calculus problem set', 'Mathematics', d(0), 'pending'], ['Lab report', 'Physics', d(3), 'pending'], ['React mini project', 'Computer Science', d(6), 'pending'], ['Essay draft', 'English', d(-2), 'done']]
    .forEach(([title, subject, due_date, status]) => ins('assignments', uid, { title, subject, due_date, status, completed_at: status === 'done' ? d(-3) : null }));
  [['Revise calculus', d(0), 60], ['Physics lab prep', d(1), 45], ['Coding practice', d(2), 90]].forEach(([title, session_date, duration]) => ins('study_sessions', uid, { title, session_date, duration }));
  [['Finish full-stack course', 55, d(60)], ['Read 12 books this year', 30, d(200)], ['Score 9+ CGPA', 70, d(120)]].forEach(([title, progress, target_date]) => ins('goals', uid, { title, progress, target_date }));
  // habits + real daily logs so streaks are computed from history (Read: 5-day streak incl. today, Workout: 3 days up to yesterday, Coding: 9 days incl. today)
  [['Read 20 minutes', 'Study', 5, 0], ['Workout', 'Fitness', 3, 1], ['Practice coding', 'Study', 9, 0]].forEach(([name, category, run, gap]) => {
    ins('habits', uid, { name, category, daily_target: 1 });
    const hid = db.prepare('SELECT MAX(id) m FROM habits WHERE user_id=?').get(uid).m;
    for (let i = 0; i < run; i++) db.prepare('INSERT INTO habit_logs(user_id,habit_id,log_date,count) VALUES(?,?,?,1)').run(uid, hid, d(-gap - i));
  });
  const sid = n => db.prepare('SELECT id FROM academics WHERE user_id=? AND subject=?').get(uid, n).id;
  const plan = db.prepare('INSERT INTO study_plans(user_id,title,plan_date,total_minutes) VALUES(?,?,?,?)').run(uid, 'Evening revision', d(0), 150).lastInsertRowid;
  ['Mathematics', 'Physics', 'Computer Science'].forEach((n, i) => db.prepare('INSERT INTO study_plan_items(user_id,plan_id,subject_id,subject_name,allocated_minutes,position) VALUES(?,?,?,?,?,?)').run(uid, plan, sid(n), n, 50, i));
  [['Portfolio website', 'Personal site with projects and blog', 'active', 'React, Tailwind CSS'], ['Study tracker app', 'Track study hours', 'planning', 'Node.js, SQLite']].forEach(([title, description, status, technologies]) => ins('projects', uid, { title, description, status, technologies }));
  [['JavaScript', 80, 'Programming'], ['React', 65, 'Frontend'], ['Python', 70, 'Programming'], ['SQL', 55, 'Data']].forEach(([name, level, category]) => ins('skills', uid, { name, level, category }));
  // a real demo career path from the Web Development template: 3 lessons done, 2 study logs (achievements are computed from this data, never seeded)
  const pid = db.prepare('INSERT INTO career_paths(user_id,title,description,target_date,template_key) VALUES(?,?,?,?,?)').run(uid, CT.templates.web.title, CT.templates.web.description, d(120), 'web').lastInsertRowid;
  CT.instantiate(db, uid, pid, 'web');
  db.prepare('SELECT id FROM career_lessons WHERE path_id=? ORDER BY position LIMIT 3').all(pid).forEach(l => db.prepare('UPDATE career_lessons SET completed=1,completed_at=? WHERE id=?').run(d(-1), l.id));
  [[-2, 90, 'HTML and CSS practice'], [-1, 60, 'JavaScript basics']].forEach(([n, minutes, note]) => db.prepare('INSERT INTO career_study_logs(user_id,path_id,log_date,minutes,note) VALUES(?,?,?,?,?)').run(uid, pid, d(n), minutes, note));
  // Opportunities, Community and My Vault are no longer seeded: they only show real data (jobs from live APIs, posts users write, files users upload).
  ['Joined Learnjectory', 'Completed "Essay draft"', 'Added goal "Score 9+ CGPA"'].forEach(message => db.prepare('INSERT INTO activity_logs(user_id,message) VALUES(?,?)').run(uid, message));
}
if (process.env.SEED_DEMO !== 'false') seedDemo();
module.exports = db;
if (require.main === module) console.log('Database ready (demo@learnjectory.com / demo1234)');
