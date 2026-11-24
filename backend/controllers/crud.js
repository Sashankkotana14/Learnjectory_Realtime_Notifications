
const db = require('../database/db');
const R = require('../models/resources');
const U = require('../utils');

const log = (uid, m) =>
  db.prepare(
    'INSERT INTO activity_logs(user_id,message) VALUES(?,?)'
  ).run(uid, m);

const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];

const STATUS = {
  assignments: ['pending', 'in_progress', 'done'],
  projects: ['planning', 'active', 'completed']
};

const DATES = ['due_date', 'target_date', 'session_date', 'earned_at'];

// Validate + normalise a request body against the table definition.
function clean(t, body, partial) {
  const r = R[t], out = {};

  for (const [c, type] of Object.entries(r.cols)) {
    if (body[c] === undefined) continue;

    let v = body[c];

    if (c === 'completed_at') continue;

    if (/^(INTEGER|REAL)/.test(type)) {
      if (v === '' || v === null) v = 0;

      v = Number(v);

      if (!Number.isFinite(v))
        return { error: `${c} must be a number` };

      if (type.startsWith('INTEGER')) v = Math.round(v);

      if (v < 0)
        return { error: `${c} cannot be negative` };

      if (['progress', 'level'].includes(c) && v > 100)
        return { error: `${c} must be between 0 and 100` };

      if (c === 'credits' && v > 60)
        return { error: 'credits must be 60 or less' };

      if (c === 'duration' && v > 1440)
        return { error: 'duration must be 1440 minutes or less' };

      if (['done_today', 'completed'].includes(c))
        v = v ? 1 : 0;

    } else {
      v = v === null
        ? ''
        : String(v).trim().slice(
            0,
            c === 'content' || c === 'description' ? 5000 : 300
          );

      if (DATES.includes(c) && v !== '' && !U.isDate(v))
        return { error: `${c} must be a valid date (YYYY-MM-DD)` };

      if (STATUS[t] && c === 'status' && !STATUS[t].includes(v))
        return {
          error: `status must be one of: ${STATUS[t].join(', ')}`
        };

      if (
        t === 'academics' &&
        ['grade', 'target_grade'].includes(c) &&
        v !== ''
      ) {
        v = v.toUpperCase();

        if (!GRADES.includes(v))
          return {
            error: `${c} must be a letter grade (${GRADES.join(', ')})`
          };
      }
    }

    out[c] = v;
  }

  if (!partial || out[r.title] !== undefined) {
    if (!out[r.title])
      return { error: `${r.title} is required` };
  }

  return { data: out };
}

exports.clean = clean;


// LIST
exports.list = (req, res) => {
  const t = req.params.res;
  const r = R[t];

  let sql = `SELECT * FROM ${t} WHERE user_id=?`;
  const a = [req.user.id];

  if (req.query.q) {
    sql += ` AND ${r.title} LIKE ?`;
    a.push(`%${String(req.query.q).slice(0, 100)}%`);
  }

  res.json(
    db.prepare(sql + ' ORDER BY id DESC').all(...a)
  );
};


// CREATE
exports.create = (req, res) => {
  const t = req.params.res;
  const r = R[t];

  const { data, error } = clean(t, req.body, false);

  if (error)
    return res.status(400).json({ error });

  if (
    t === 'academics' &&
    data.classes_attended > data.classes_total
  ) {
    return res.status(400).json({
      error: 'classes_attended cannot exceed classes_total'
    });
  }

  if (t === 'assignments' && data.status === 'done')
    data.completed_at = U.todayStr();

  const k = Object.keys(data);

  const id = db.prepare(
    `INSERT INTO ${t}(user_id,${k})
     VALUES(?,${k.map(() => '?')})`
  ).run(
    req.user.id,
    ...k.map(c => data[c])
  ).lastInsertRowid;

  log(
    req.user.id,
    `Added "${String(data[r.title]).slice(0, 40)}" - ${r.label}`
  );

  res.status(201).json(
    db.prepare(`SELECT * FROM ${t} WHERE id=?`).get(id)
  );
};


// UPDATE
exports.update = (req, res) => {
  const t = req.params.res;
  const r = R[t];
  const id = Number(req.params.id);

  const old = db.prepare(
    `SELECT * FROM ${t} WHERE id=? AND user_id=?`
  ).get(id, req.user.id);

  if (!old)
    return res.status(404).json({ error: 'Not found' });

  const { data, error } = clean(t, req.body, true);

  if (error)
    return res.status(400).json({ error });

  if (t === 'academics') {
    const m = { ...old, ...data };

    if (m.classes_attended > m.classes_total) {
      return res.status(400).json({
        error: 'classes_attended cannot exceed classes_total'
      });
    }
  }

  let completed = false;

  if (
    t === 'assignments' &&
    data.status !== undefined &&
    data.status !== old.status
  ) {
    if (data.status === 'done') {
      data.completed_at = U.todayStr();
      completed = true;
    } else {
      data.completed_at = null;
    }
  }

  const k = Object.keys(data);

  if (k.length) {
    db.prepare(
      `UPDATE ${t}
       SET ${k.map(c => c + '=?')}
       WHERE id=? AND user_id=?`
    ).run(
      ...k.map(c => data[c]),
      id,
      req.user.id
    );
  }

  const row = db.prepare(
    `SELECT * FROM ${t} WHERE id=? AND user_id=?`
  ).get(id, req.user.id);

  log(
    req.user.id,
    `${completed ? 'Completed' : 'Updated'} "${String(row[r.title]).slice(0, 40)}" - ${r.label}`
  );

  res.json(row);
};


// DELETE
exports.remove = (req, res) => {
  const t = req.params.res;
  const r = R[t];

  const row = db.prepare(
    `SELECT * FROM ${t} WHERE id=? AND user_id=?`
  ).get(Number(req.params.id), req.user.id);

  if (!row)
    return res.status(404).json({ error: 'Not found' });

  db.prepare(
    `DELETE FROM ${t} WHERE id=? AND user_id=?`
  ).run(row.id, req.user.id);

  log(
    req.user.id,
    `Deleted "${String(row[r.title]).slice(0, 40)}" - ${r.label}`
  );

  res.json({ ok: true });
};


// SEARCH - IMPROVED WORD MATCHING
exports.search = (req, res) => {
  const query = String(req.query.q || '')
    .trim()
    .slice(0, 100);

  if (!query) {
    return res.json([]);
  }

  const normalQuery = query.toLowerCase();

  // Escape special regular expression characters.
  const escapedQuery = normalQuery.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );

  // Match complete words or phrases.
  const wordBoundaryRegex = new RegExp(
    `(^|[^a-z0-9])${escapedQuery}($|[^a-z0-9])`,
    'i'
  );

  const results = [];

  for (const [t, r] of Object.entries(R)) {

    const rows = db.prepare(
      `SELECT id, ${r.title} AS title
       FROM ${t}
       WHERE user_id=?
       ORDER BY id DESC`
    ).all(req.user.id);

    for (const row of rows) {
      const title = String(row.title || '').trim();

      if (!title) continue;

      if (!wordBoundaryRegex.test(title)) continue;

      const normalizedTitle = title.toLowerCase();

      let score = 1;

      if (normalizedTitle === normalQuery) {
        score = 3;
      } else if (
        normalizedTitle.startsWith(normalQuery)
      ) {
        score = 2;
      }

      results.push({
        id: row.id,
        title,
        type: t,
        label: r.label,
        score
      });
    }
  }

  // Sort best matches first.
  results.sort((a, b) =>
    b.score - a.score ||
    a.title.localeCompare(b.title)
  );

  // Return only the top 50 results.
  const finalResults = results
    .slice(0, 50)
    .map(({ score, ...result }) => result);

  res.json(finalResults);
};
