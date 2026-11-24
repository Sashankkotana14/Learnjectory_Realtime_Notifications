// Achievements: rule-based, computed from real user data. Unlocks are stored once per (user,key) in achievement_unlocks and never removed (history persists).
const db = require('../database/db'), U = require('../utils'), H = require('./habits'), PR = require('./projects');
const one = (s, ...a) => db.prepare(s).get(...a), all = (s, ...a) => db.prepare(s).all(...a);
const CATEGORIES = ['Learning', 'Goals', 'Habits', 'Projects', 'Skills'];
// [key, category, title, description, icon (lucide name), metric, target]
const D = [
  ['first_lesson', 'Learning', 'First Step', 'Complete your first career lesson', 'Footprints', 'lessons_done', 1],
  ['lessons_10', 'Learning', 'Lesson Streak', 'Complete 10 career lessons', 'BookOpen', 'lessons_done', 10],
  ['lessons_25', 'Learning', 'Knowledge Builder', 'Complete 25 career lessons', 'Library', 'lessons_done', 25],
  ['path_complete', 'Learning', 'Path Finisher', 'Finish every lesson of a career path', 'Flag', 'paths_completed', 1],
  ['study_1h', 'Learning', 'Hour of Focus', 'Study for 1 hour in total', 'Clock', 'study_minutes', 60],
  ['study_10h', 'Learning', 'Dedicated Learner', 'Study for 10 hours in total', 'Hourglass', 'study_minutes', 600],
  ['study_50h', 'Learning', 'Scholar', 'Study for 50 hours in total', 'GraduationCap', 'study_minutes', 3000],
  ['goal_set', 'Goals', 'Goal Setter', 'Create your first goal', 'Target', 'goals_created', 1],
  ['goal_1', 'Goals', 'Goal Getter', 'Complete your first goal', 'CheckCircle2', 'goals_completed', 1],
  ['goal_5', 'Goals', 'Achiever', 'Complete 5 goals', 'Medal', 'goals_completed', 5],
  ['goal_10', 'Goals', 'Unstoppable', 'Complete 10 goals', 'Trophy', 'goals_completed', 10],
  ['habit_start', 'Habits', 'Habit Starter', 'Create your first habit', 'Sprout', 'habits_created', 1],
  ['streak_3', 'Habits', 'On a Roll', 'Reach a 3-day habit streak', 'Flame', 'longest_streak', 3],
  ['streak_7', 'Habits', 'Week Warrior', 'Reach a 7-day habit streak', 'Flame', 'longest_streak', 7],
  ['streak_30', 'Habits', 'Habit Master', 'Reach a 30-day habit streak', 'Crown', 'longest_streak', 30],
  ['habit_days_50', 'Habits', 'Consistency Counts', 'Complete habits on 50 days in total', 'CalendarCheck', 'habit_completions', 50],
  ['project_1', 'Projects', 'Builder', 'Add your first project', 'FolderPlus', 'projects_total', 1],
  ['project_3', 'Projects', 'Portfolio Growing', 'Add 3 projects', 'FolderKanban', 'projects_total', 3],
  ['project_done', 'Projects', 'Shipped It', 'Complete your first project', 'Rocket', 'projects_completed', 1],
  ['project_done_3', 'Projects', 'Serial Shipper', 'Complete 3 projects', 'PackageCheck', 'projects_completed', 3],
  ['skill_1', 'Skills', 'Skill Unlocked', 'Add your first skill', 'Wrench', 'skills_total', 1],
  ['skill_5', 'Skills', 'Well Rounded', 'Add 5 skills', 'Layers', 'skills_total', 5],
  ['skill_adv', 'Skills', 'Advanced Practitioner', 'Reach Advanced level in a skill', 'Zap', 'advanced_skills', 1],
  ['skill_cats_3', 'Skills', 'Versatile', 'Have skills in 3 different categories', 'Shapes', 'skill_categories', 3],
];
const DEFS = D.map(([key, category, title, description, icon, metric, target]) => ({ key, category, title, description, icon, metric, target }));

function metrics(uid) {
  const n = (s, ...a) => one(s, ...a).c || 0, habits = H.forUser(uid), ss = PR.skillStats(uid);
  const pathDone = all('SELECT path_id,COUNT(*) t,SUM(completed) d FROM career_lessons WHERE user_id=? GROUP BY path_id', uid).filter(r => r.t > 0 && r.d === r.t).length;
  return {
    lessons_done: n('SELECT COUNT(*) c FROM career_lessons WHERE user_id=? AND completed=1', uid), paths_completed: pathDone,
    study_minutes: n('SELECT COALESCE(SUM(minutes),0) c FROM career_study_logs WHERE user_id=?', uid) + n("SELECT COALESCE(SUM(allocated_minutes),0) c FROM study_plan_items WHERE user_id=? AND status='done'", uid),
    goals_created: n('SELECT COUNT(*) c FROM goals WHERE user_id=?', uid), goals_completed: n('SELECT COUNT(*) c FROM goals WHERE user_id=? AND progress>=100', uid),
    habits_created: habits.length, longest_streak: Math.max(0, ...habits.map(h => h.longest_streak)), habit_completions: habits.reduce((s, h) => s + h.total_completions, 0),
    projects_total: n('SELECT COUNT(*) c FROM projects WHERE user_id=?', uid), projects_completed: n("SELECT COUNT(*) c FROM projects WHERE user_id=? AND status='completed'", uid),
    skills_total: ss.total, advanced_skills: ss.advanced, skill_categories: ss.categories,
  };
}
// Unlock everything whose rule is now met. INSERT OR IGNORE + UNIQUE(user_id,key) make duplicate unlocks impossible even under concurrent calls.
function evaluate(uid) {
  const m = metrics(uid), today = U.todayStr(), fresh = [];
  const ins = db.prepare('INSERT OR IGNORE INTO achievement_unlocks(user_id,key,unlocked_date,value_at_unlock) VALUES(?,?,?,?)');
  db.transaction(() => { for (const d of DEFS) if (m[d.metric] >= d.target && ins.run(uid, d.key, today, m[d.metric]).changes === 1) { fresh.push(d); db.prepare('INSERT INTO activity_logs(user_id,message) VALUES(?,?)').run(uid, `Unlocked "${d.title}" - Achievement`); } })();
  return fresh;
}
function view(uid) {
  const m = metrics(uid), unlocked = new Map(all('SELECT * FROM achievement_unlocks WHERE user_id=?', uid).map(u => [u.key, u]));
  const list = DEFS.map(d => { const u = unlocked.get(d.key), cur = Math.min(m[d.metric], d.target); return { ...d, current: u ? d.target : cur, progress: u ? 100 : Math.floor(cur / d.target * 100), unlocked: !!u, unlocked_date: u ? u.unlocked_date : null, unlocked_at: u ? u.unlocked_at : null }; });
  return { list, metrics: m };
}
exports.evaluate = evaluate;
exports.summary = uid => {
  const { list } = view(uid), un = list.filter(a => a.unlocked).sort((a, b) => (b.unlocked_at || '').localeCompare(a.unlocked_at || '') || DEFS.findIndex(x => x.key === b.key) - DEFS.findIndex(x => x.key === a.key));
  return { total: list.length, unlocked: un.length, recent: un.slice(0, 3).map(a => ({ key: a.key, title: a.title, icon: a.icon, unlocked_date: a.unlocked_date })) };
};
exports.list = (req, res) => {
  evaluate(req.user.id);
  let { list, metrics: m } = view(req.user.id);
  const byCategory = Object.fromEntries(CATEGORIES.map(c => [c, { total: list.filter(a => a.category === c).length, unlocked: list.filter(a => a.category === c && a.unlocked).length }]));
  const history = list.filter(a => a.unlocked).sort((a, b) => b.unlocked_at.localeCompare(a.unlocked_at) || DEFS.findIndex(x => x.key === b.key) - DEFS.findIndex(x => x.key === a.key)).map(a => ({ key: a.key, title: a.title, category: a.category, icon: a.icon, unlocked_date: a.unlocked_date, unlocked_at: a.unlocked_at }));
  if (req.query.category) list = list.filter(a => a.category === req.query.category);
  if (req.query.status === 'unlocked') list = list.filter(a => a.unlocked); else if (req.query.status === 'locked') list = list.filter(a => !a.unlocked);
  res.json({ achievements: list, summary: { total: DEFS.length, unlocked: history.length, percent: Math.round(history.length / DEFS.length * 100), byCategory }, history, categories: CATEGORIES });
};
exports.readOnly = (req, res) => res.status(405).json({ error: 'Achievements are unlocked automatically from your progress and cannot be edited' });
