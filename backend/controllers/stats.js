const db = require('../database/db'), U = require('../utils'), AS = require('./assignments'), AC = require('./academics'), PL = require('./planner'), G = require('./goals'), H = require('./habits'), CA = require('./career'), PS = require('./projects'), AM = require('./achievements'), DD = require('./dashboardData');
const one = (s, ...a) => db.prepare(s).get(...a);
const all = (s, ...a) => db.prepare(s).all(...a);
exports.dashboard = (req, res) => {
  const u = req.user.id, today = U.todayStr();
  AM.evaluate(u);
  const user = one('SELECT name FROM users WHERE id=?', u);
  const subjects = all('SELECT * FROM academics WHERE user_id=?', u), acad = AC.summarize(subjects);
  const list = AS.forUser(u), asum = AS.summarize(list);
  const open = list.filter(a => a.status !== 'done').sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  const wk0 = U.weekStart(today), wk1 = U.addDays(wk0, 6);
  const goals = G.forUser(u), habits = H.forUser(u), hs = H.summarize(habits, today);
  const h = new Date().getHours();
  res.json({
    user: { name: user.name, greeting: h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' },
    today,
    academics: acad.avgProgress,
    academicStats: acad,
    activeGoals: goals.filter(g => !g.completed).length,
    goalSummary: G.summarize(goals),
    dueToday: asum.dueToday,
    habitsDone: hs.doneToday,
    habitsTotal: hs.total,
    habitStats: hs,
    pendingAssignments: asum.pending,
    assignmentSummary: asum,
    nextAssignment: open[0] || null,
    upcomingAssignments: open.slice(0, 4),
    goals: goals.filter(g => !g.completed).sort((a, b) => (a.target_date || '9999').localeCompare(b.target_date || '9999') || b.id - a.id).slice(0, 3),
    focus: PL.focus(u, today),
    study: PL.weekStats(u, wk0, wk1),
    activity: all('SELECT * FROM activity_logs WHERE user_id=? ORDER BY id DESC LIMIT 5', u),
    achievements: AM.summary(u).unlocked,
    achievementStats: AM.summary(u),
    career: CA.dashboard(u),
    projectStats: PS.projectStats(u),
    skillStats: PS.skillStats(u),
    // Dashboard integrations: Opportunities, Community, Statistics, Data Boards (all computed from real database rows)
    ...DD.forDashboard(u),
  });
};
exports.activity = (req, res) => res.json(all('SELECT * FROM activity_logs WHERE user_id=? ORDER BY id DESC LIMIT 30', req.user.id));
exports.analytics = (req, res) => {
  const u = req.user.id;
  res.json({
    subjects: all('SELECT subject name,progress value FROM academics WHERE user_id=?', u),
    assignments: all('SELECT status name,COUNT(*) value FROM assignments WHERE user_id=? GROUP BY status', u),
    study: all('SELECT session_date name,SUM(duration) value FROM study_sessions WHERE user_id=? GROUP BY session_date ORDER BY session_date', u),
    skills: all('SELECT name,level value FROM skills WHERE user_id=?', u),
  });
};
