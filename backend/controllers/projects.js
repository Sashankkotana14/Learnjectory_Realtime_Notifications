// Projects & Skills: validated CRUD, technologies, status, skill categories/levels, duplicate prevention, live statistics
const db = require('../database/db'), U = require('../utils');
const one = (s, ...a) => db.prepare(s).get(...a), all = (s, ...a) => db.prepare(s).all(...a);
const log = (uid, m) => db.prepare('INSERT INTO activity_logs(user_id,message) VALUES(?,?)').run(uid, m);
const bad = (res, error, status = 400) => res.status(status).json({ error });
const STATUS = ['planning', 'active', 'on_hold', 'completed'];
const CATEGORIES = ['Programming', 'Frontend', 'Backend', 'Data', 'Design', 'Tools', 'Soft Skills', 'Other'];
const LEVELS = { Beginner: 25, Intermediate: 50, Advanced: 75, Expert: 95 };
const levelLabel = n => (n >= 90 ? 'Expert' : n >= 67 ? 'Advanced' : n >= 34 ? 'Intermediate' : 'Beginner');
const norm = s => String(s).trim().replace(/\s+/g, ' ');
const techList = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const okUrl = s => { try { return ['http:', 'https:'].includes(new URL(s).protocol); } catch { return false; } };
const pv = p => ({ ...p, technologies_list: techList(p.technologies) });
exports.levelLabel = levelLabel; exports.LEVELS = LEVELS;

// ---------- statistics (always computed from the rows) ----------
const projectStats = (uid, projects = all('SELECT * FROM projects WHERE user_id=?', uid)) => {
  const skills = new Set(all('SELECT name FROM skills WHERE user_id=?', uid).map(s => s.name.toLowerCase())), tech = new Map();
  for (const p of projects) for (const t of techList(p.technologies)) { const k = t.toLowerCase(), e = tech.get(k) || { name: t, count: 0 }; e.count++; tech.set(k, e); }
  const by = s => projects.filter(p => p.status === s).length;
  return { total: projects.length, planning: by('planning'), active: by('active'), on_hold: by('on_hold'), completed: by('completed'),
    completionRate: projects.length ? Math.round(by('completed') / projects.length * 100) : 0,
    technologies: [...tech.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)), missingSkills: [...tech.entries()].filter(([k]) => !skills.has(k)).map(([, v]) => v.name) };
};
const skillStats = (uid, skills = all('SELECT * FROM skills WHERE user_id=?', uid)) => {
  const cat = {}; for (const s of skills) cat[s.category || 'Other'] = (cat[s.category || 'Other'] || 0) + 1;
  const lv = { Beginner: 0, Intermediate: 0, Advanced: 0, Expert: 0 }; for (const s of skills) lv[levelLabel(s.level)]++;
  return { total: skills.length, byCategory: cat, byLevel: lv, categories: Object.keys(cat).length, avgLevel: skills.length ? Math.round(skills.reduce((a, s) => a + s.level, 0) / skills.length) : 0, advanced: skills.filter(s => s.level >= 67).length };
};
exports.projectStats = projectStats; exports.skillStats = skillStats;

// ---------- projects ----------
function parseProject(b, old) {
  const out = {};
  if (b.title !== undefined || !old) { const t = norm(b.title ?? '').slice(0, 200); if (!t) return { error: 'title is required' }; out.title = t; }
  if (b.description !== undefined) out.description = String(b.description ?? '').trim().slice(0, 2000);
  if (b.status !== undefined) { const s = String(b.status); if (!STATUS.includes(s)) return { error: `status must be one of: ${STATUS.join(', ')}` }; out.status = s; }
  else if (!old) out.status = 'planning';
  if (b.technologies !== undefined) {
    const raw = Array.isArray(b.technologies) ? b.technologies.join(',') : String(b.technologies ?? ''), seen = new Set(), list = [];
    for (const t of techList(raw)) { if (t.length > 40) return { error: 'each technology must be 40 characters or less' }; if (!seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); list.push(t); } }
    if (list.length > 20) return { error: 'a project can list at most 20 technologies' };
    out.technologies = list.join(', ');
  }
  if (b.repo_url !== undefined) { const u = String(b.repo_url ?? '').trim(); if (u && (u.length > 300 || !okUrl(u))) return { error: 'repo_url must be a valid http(s) link' }; out.repo_url = u; }
  return { out };
}
exports.listProjects = (req, res) => {
  const all0 = all('SELECT * FROM projects WHERE user_id=?', req.user.id); let rows = all0.slice();
  if (req.query.status) rows = rows.filter(p => p.status === req.query.status);
  if (req.query.q) { const q = String(req.query.q).toLowerCase(); rows = rows.filter(p => (p.title + ' ' + (p.technologies || '')).toLowerCase().includes(q)); }
  rows.sort((a, b) => b.id - a.id);
  res.json({ projects: rows.map(pv), summary: projectStats(req.user.id, all0), statuses: STATUS });
};
exports.createProject = (req, res) => {
  const { out, error } = parseProject(req.body || {}, null); if (error) return bad(res, error);
  if (out.status === 'completed') out.completed_at = U.todayStr();
  const k = Object.keys(out), id = db.prepare(`INSERT INTO projects(user_id,${k}) VALUES(?,${k.map(() => '?')})`).run(req.user.id, ...k.map(c => out[c])).lastInsertRowid;
  log(req.user.id, `Added "${out.title.slice(0, 40)}" - Project`);
  res.status(201).json(pv(one('SELECT * FROM projects WHERE id=?', id)));
};
exports.updateProject = (req, res) => {
  const old = one('SELECT * FROM projects WHERE id=? AND user_id=?', Number(req.params.id), req.user.id); if (!old) return bad(res, 'Not found', 404);
  const { out, error } = parseProject(req.body || {}, old); if (error) return bad(res, error);
  let done = false;
  if (out.status !== undefined && out.status !== old.status) { if (out.status === 'completed') { out.completed_at = U.todayStr(); done = true; } else out.completed_at = null; }
  const k = Object.keys(out); if (k.length) db.prepare(`UPDATE projects SET ${k.map(c => c + '=?')} WHERE id=?`).run(...k.map(c => out[c]), old.id);
  log(req.user.id, `${done ? 'Completed' : 'Updated'} "${(out.title || old.title).slice(0, 40)}" - Project`);
  res.json(pv(one('SELECT * FROM projects WHERE id=?', old.id)));
};
exports.removeProject = (req, res) => {
  const p = one('SELECT * FROM projects WHERE id=? AND user_id=?', Number(req.params.id), req.user.id); if (!p) return bad(res, 'Not found', 404);
  db.prepare('DELETE FROM projects WHERE id=?').run(p.id); log(req.user.id, `Deleted "${p.title.slice(0, 40)}" - Project`); res.json({ ok: true });
};

// ---------- skills ----------
function parseSkill(uid, b, old) {
  const out = {};
  if (b.name !== undefined || !old) {
    const n = norm(b.name ?? '').slice(0, 60); if (!n) return { error: 'name is required' };
    // duplicate check is case-insensitive and ignores extra spaces; runs synchronously with the insert so it cannot race
    if (all('SELECT id,name FROM skills WHERE user_id=?', uid).some(s => s.id !== (old && old.id) && norm(s.name).toLowerCase() === n.toLowerCase())) return { error: `You already have the skill "${n}"`, status: 409 };
    out.name = n;
  }
  if (b.category !== undefined || !old) { const c = String(b.category ?? 'Other'); if (!CATEGORIES.includes(c)) return { error: `category must be one of: ${CATEGORIES.join(', ')}` }; out.category = c; }
  if (b.level_name !== undefined && b.level === undefined) { if (!LEVELS[b.level_name]) return { error: `level_name must be one of: ${Object.keys(LEVELS).join(', ')}` }; out.level = LEVELS[b.level_name]; }
  else if (b.level !== undefined) { const n = U.toInt(b.level); if (!Number.isInteger(n) || n < 0 || n > 100) return { error: 'level must be a whole number between 0 and 100' }; out.level = n; }
  else if (!old) out.level = LEVELS.Beginner;
  return { out };
}
const sv = s => ({ ...s, level_name: levelLabel(s.level) });
exports.listSkills = (req, res) => {
  const rows = all('SELECT * FROM skills WHERE user_id=? ORDER BY level DESC,name', req.user.id);
  res.json({ skills: rows.map(sv), summary: skillStats(req.user.id, rows), categories: CATEGORIES, levels: Object.keys(LEVELS) });
};
exports.createSkill = (req, res) => {
  const { out, error, status } = parseSkill(req.user.id, req.body || {}, null); if (error) return bad(res, error, status);
  const k = Object.keys(out), id = db.prepare(`INSERT INTO skills(user_id,${k}) VALUES(?,${k.map(() => '?')})`).run(req.user.id, ...k.map(c => out[c])).lastInsertRowid;
  log(req.user.id, `Added "${out.name}" - Skill`); res.status(201).json(sv(one('SELECT * FROM skills WHERE id=?', id)));
};
exports.updateSkill = (req, res) => {
  const old = one('SELECT * FROM skills WHERE id=? AND user_id=?', Number(req.params.id), req.user.id); if (!old) return bad(res, 'Not found', 404);
  const { out, error, status } = parseSkill(req.user.id, req.body || {}, old); if (error) return bad(res, error, status);
  const k = Object.keys(out); if (k.length) db.prepare(`UPDATE skills SET ${k.map(c => c + '=?')} WHERE id=?`).run(...k.map(c => out[c]), old.id);
  log(req.user.id, `Updated "${out.name || old.name}" - Skill`); res.json(sv(one('SELECT * FROM skills WHERE id=?', old.id)));
};
exports.removeSkill = (req, res) => {
  const s = one('SELECT * FROM skills WHERE id=? AND user_id=?', Number(req.params.id), req.user.id); if (!s) return bad(res, 'Not found', 404);
  db.prepare('DELETE FROM skills WHERE id=?').run(s.id); log(req.user.id, `Removed "${s.name}" - Skill`); res.json({ ok: true });
};
