const db = require('../database/db'), U = require('../utils');
const POINTS = { 'A+': 4, A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7, 'C+': 2.3, C: 2, 'C-': 1.7, D: 1, F: 0 };
// GET /api/academics - rows with computed attendance % + summary
exports.list = (req, res) => {
  const rows = db.prepare('SELECT * FROM academics WHERE user_id=? ORDER BY subject COLLATE NOCASE').all(req.user.id)
    .map(r => ({ ...r, attendance_pct: U.attendancePct(r) }));
  res.json({ subjects: rows, summary: exports.summarize(rows) });
};
exports.summarize = rows => {
  const graded = rows.filter(r => POINTS[r.grade] !== undefined), credits = graded.reduce((s, r) => s + (r.credits || 0), 0);
  const target = rows.filter(r => POINTS[r.target_grade] !== undefined), tcred = target.reduce((s, r) => s + (r.credits || 0), 0);
  const withAtt = rows.filter(r => r.classes_total > 0), att = withAtt.reduce((s, r) => s + r.classes_attended, 0), tot = withAtt.reduce((s, r) => s + r.classes_total, 0);
  return {
    subjects: rows.length,
    totalCredits: rows.reduce((s, r) => s + (r.credits || 0), 0),
    avgProgress: rows.length ? Math.round(rows.reduce((s, r) => s + r.progress, 0) / rows.length) : 0,
    currentGpa: credits ? Math.round(graded.reduce((s, r) => s + POINTS[r.grade] * r.credits, 0) / credits * 100) / 100 : null,
    targetGpa: tcred ? Math.round(target.reduce((s, r) => s + POINTS[r.target_grade] * r.credits, 0) / tcred * 100) / 100 : null,
    attendance: tot ? Math.round(att / tot * 1000) / 10 : null,
    lowAttendance: withAtt.filter(r => r.classes_attended / r.classes_total < 0.75).map(r => r.subject),
  };
};
