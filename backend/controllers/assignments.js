const db = require('../database/db'), U = require('../utils');
const ORDER = { Overdue: 0, High: 1, Medium: 2, Low: 3, Completed: 4 };
const summarize = list => ({
  total: list.length,
  pending: list.filter(a => a.status !== 'done').length,
  completed: list.filter(a => a.status === 'done').length,
  overdue: list.filter(a => a.priority === 'Overdue').length,
  high: list.filter(a => a.priority === 'High').length,
  medium: list.filter(a => a.priority === 'Medium').length,
  low: list.filter(a => a.priority === 'Low').length,
  dueToday: list.filter(a => a.status !== 'done' && a.days_left === 0).length,
});
exports.summarize = summarize;
exports.forUser = uid => { const t = U.todayStr(); return db.prepare('SELECT * FROM assignments WHERE user_id=?').all(uid).map(a => U.withPriority(a, t)); };
// GET /api/assignments?status=&priority=&subject=&q=&sort=due|priority|title|subject|created&dir=asc|desc
exports.list = (req, res) => {
  const { status, priority, subject, q, sort = 'due', dir = 'asc' } = req.query;
  const all = exports.forUser(req.user.id);
  let rows = all.slice();
  if (status && ['pending', 'in_progress', 'done'].includes(status)) rows = rows.filter(a => a.status === status);
  if (priority) rows = rows.filter(a => a.priority.toLowerCase() === String(priority).toLowerCase());
  if (subject) rows = rows.filter(a => (a.subject || '').toLowerCase() === String(subject).toLowerCase());
  if (q) rows = rows.filter(a => (a.title + ' ' + (a.subject || '')).toLowerCase().includes(String(q).toLowerCase()));
  const key = { due: a => a.due_date || '9999-12-31', priority: a => ORDER[a.priority], title: a => a.title.toLowerCase(), subject: a => (a.subject || '').toLowerCase(), created: a => a.id }[sort] || (a => a.due_date || '9999-12-31');
  rows.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : a.id - b.id));
  if (dir === 'desc') rows.reverse();
  res.json({ assignments: rows, summary: summarize(all), subjects: [...new Set(all.map(a => a.subject).filter(Boolean))].sort() });
};
