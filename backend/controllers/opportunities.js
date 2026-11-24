// Opportunities: resume upload + analysis, real job listings (public APIs), saved jobs, skill-gap analysis.
const crypto = require('crypto'), db = require('../database/db'), S = require('../lib/skills'), J = require('../lib/jobSources'), V = require('../lib/vaultStore'), T = require('../lib/textExtract'), RP = require('../lib/resumeParser');
const one = (s, ...a) => db.prepare(s).get(...a), all = (s, ...a) => db.prepare(s).all(...a);
const log = (uid, m) => db.prepare('INSERT INTO activity_logs(user_id,message) VALUES(?,?)').run(uid, m);
const bad = (res, error, status = 400) => res.status(status).json({ error });
const STATUSES = ['saved', 'applied', 'interviewing', 'offer', 'rejected'];
const MAX_RESUME_BYTES = 5 * V.MB, MAX_RESUMES = 3;
const state = { fetch: global.fetch }; exports._setFetch = f => { state.fetch = f; };

const latestResume = uid => { const r = one('SELECT * FROM resumes WHERE user_id=? ORDER BY id DESC LIMIT 1', uid); return r ? { ...r, parsed: JSON.parse(r.parsed) } : null; };
// Everything we know the user can do: skills from the latest resume + skills they entered in Projects & Skills
function userSkills(uid) {
  const keys = new Set(), names = [], r = latestResume(uid);
  for (const s of (r ? r.parsed.skills : [])) { const k = S.skillKey(s.name); if (!keys.has(k)) { keys.add(k); names.push(s.name); } }
  for (const s of all('SELECT name FROM skills WHERE user_id=?', uid)) { const k = S.skillKey(s.name); if (!keys.has(k)) { keys.add(k); names.push(s.name); } }
  return { keys, names, hasResume: !!r };
}
const resumeView = r => r && { id: r.id, filename: r.filename, file_type: r.file_type, size: r.size, uploaded_at: r.uploaded_at, method: r.method, analysis: r.parsed };

// ---------- resume ----------
function storeResume(req, res, text, filename, type, size, method) {
  if (String(text || '').replace(/\s/g, '').length < 80) return bad(res, 'Could not read enough text from this resume. If it is a scanned image or uses special fonts, upload a DOCX or use "paste your resume text".', 422);
  const parsed = RP.parseResume(text);
  if (!parsed.skills.length && !parsed.education.length && !parsed.experience.length && !parsed.projects.length) return bad(res, 'No skills, education, projects or experience could be found in this document. Is it a resume?', 422);
  const id = db.prepare('INSERT INTO resumes(user_id,filename,file_type,size,method,parsed) VALUES(?,?,?,?,?,?)').run(req.user.id, filename, type, size, method, JSON.stringify(parsed)).lastInsertRowid;
  for (const old of all('SELECT id FROM resumes WHERE user_id=? ORDER BY id DESC LIMIT -1 OFFSET ?', req.user.id, MAX_RESUMES)) db.prepare('DELETE FROM resumes WHERE id=? AND user_id=?').run(old.id, req.user.id);
  log(req.user.id, `Analysed resume "${filename.slice(0, 40)}" - Opportunities`);
  return res.status(201).json(resumeView(latestResume(req.user.id)));
}
exports.uploadResume = async (req, res) => {
  const v = V.validate(req.body, req.query.name, MAX_RESUME_BYTES);
  if (!v.ok) return bad(res, v.error, v.status);
  if (!['pdf', 'docx'].includes(v.ext)) return bad(res, 'Resumes must be PDF or DOCX files', 415);
  let r; try { r = await T.extractText(req.body, v.ext); } catch (e) { return bad(res, 'This file could not be read: ' + e.message, 422); }
  return storeResume(req, res, r.text, v.name, v.ext, req.body.length, r.method);
};
exports.pasteResume = (req, res) => {
  const text = String(req.body.text || '').slice(0, 40000);
  return storeResume(req, res, text, 'Pasted resume text', 'text', Buffer.byteLength(text), 'pasted-text');
};
exports.getResume = (req, res) => {
  const r = latestResume(req.user.id), have = new Set(all('SELECT name FROM skills WHERE user_id=?', req.user.id).map(s => S.skillKey(s.name)));
  if (!r) return res.json({ resume: null });
  const v = resumeView(r); v.analysis.skills = v.analysis.skills.map(s => ({ ...s, in_profile: have.has(S.skillKey(s.name)) }));
  res.json({ resume: v });
};
exports.removeResume = (req, res) => {
  const r = db.prepare('DELETE FROM resumes WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id);
  if (!r.changes) return bad(res, 'Not found', 404); res.json({ ok: true });
};
// copy chosen resume skills into Projects & Skills (Beginner level, because a resume mention is not a proficiency level)
exports.importSkills = (req, res) => {
  const r = latestResume(req.user.id); if (!r) return bad(res, 'Upload a resume first', 404);
  const want = new Set((Array.isArray(req.body.skills) ? req.body.skills : r.parsed.skills.map(s => s.name)).map(x => S.skillKey(String(x)))), have = new Set(all('SELECT name FROM skills WHERE user_id=?', req.user.id).map(s => S.skillKey(s.name))), added = [];
  for (const s of r.parsed.skills) { const k = S.skillKey(s.name); if (!want.has(k) || have.has(k)) continue; db.prepare('INSERT INTO skills(user_id,name,level,category) VALUES(?,?,?,?)').run(req.user.id, s.name.slice(0, 60), 25, s.category || 'Other'); have.add(k); added.push(s.name); }
  if (added.length) log(req.user.id, `Imported ${added.length} skills from resume - Opportunities`);
  res.json({ added, skipped: want.size - added.length });
};

// ---------- jobs ----------
const bool = v => v === true || v === 'true' || v === '1' || v === 1;
const savedMap = uid => new Map(all('SELECT id,source,external_id,status FROM saved_jobs WHERE user_id=?', uid).map(s => [s.source + '|' + s.external_id, s]));
exports.searchJobs = async (req, res) => {
  const uid = req.user.id, us = userSkills(uid), qy = req.query;
  const q = String(qy.q || '').trim().slice(0, 100), location = String(qy.location || '').trim().slice(0, 80);
  const srcs = String(qy.sources || '').split(',').filter(Boolean);
  const { jobs: raw, sources } = await J.fetchJobs({ q, location, sources: srcs }, state.fetch);
  const minMatch = Math.min(100, Math.max(0, parseInt(qy.min_match, 10) || 0)), saved = savedMap(uid);
  let jobs = J.filterJobs(raw, { q, location, remote: bool(qy.remote) ? true : undefined, type: String(qy.type || '').slice(0, 30), days: parseInt(qy.days, 10) || 0 })
    .map(j => { const m = S.matchJob(j, us.keys), s = saved.get(j.source + '|' + j.external_id); return { ...j, description: j.description.slice(0, 1500), match: m, saved_id: s ? s.id : null }; });
  if (minMatch) jobs = jobs.filter(j => j.match.score !== null && j.match.score >= minMatch);
  const sort = qy.sort === 'date' || !us.keys.size ? 'date' : 'match';
  jobs.sort((a, b) => (sort === 'match' ? (b.match.score ?? -1) - (a.match.score ?? -1) : 0) || (Date.parse(b.posted_at || 0) || 0) - (Date.parse(a.posted_at || 0) || 0));
  const total = jobs.length, limit = Math.min(50, Math.max(1, parseInt(qy.limit, 10) || 30)), page = Math.max(1, parseInt(qy.page, 10) || 1);
  const gaps = new Map(); for (const j of jobs.slice(0, 60)) for (const m of j.match.missing) { const e = gaps.get(m.name) || { name: m.name, category: m.category, jobs: 0 }; e.jobs++; gaps.set(m.name, e); }
  const failedAll = sources.filter(s => !s.skipped).every(s => !s.ok);
  // listings are always real API results; when there are none we say so and offer plain external search links instead
  const queryForLinks = q || us.names.slice(0, 3).join(' ');
  res.json({
    jobs: jobs.slice((page - 1) * limit, page * limit), total, page, pages: Math.ceil(total / limit) || 1, sort, sources,
    external_links: J.searchLinks({ q: queryForLinks, location }),
    my_skills: us.names, has_resume: us.hasResume, top_gaps: [...gaps.values()].sort((a, b) => b.jobs - a.jobs || a.name.localeCompare(b.name)).slice(0, 10),
    note: failedAll ? 'Job APIs could not be reached right now, so no listings are shown. Use the external search links below instead.' : total === 0 ? 'No listings from the connected job sources match this search. Try broader keywords, or use the external search links below.' : undefined,
  });
};

// ---------- saved jobs ----------
const jobView = j => ({ ...j, remote: !!j.remote, tags_list: j.tags ? j.tags.split(',').filter(Boolean) : [] });
exports.listSaved = (req, res) => {
  const us = userSkills(req.user.id); let rows = all('SELECT * FROM saved_jobs WHERE user_id=? ORDER BY id DESC', req.user.id);
  if (req.query.status) rows = rows.filter(r => r.status === req.query.status);
  const jobs = rows.map(r => ({ ...jobView(r), match: S.matchJob({ title: r.title, description: r.description, tags: r.tags ? r.tags.split(',') : [] }, us.keys) }));
  const counts = Object.fromEntries(STATUSES.map(s => [s, 0])); for (const r of all('SELECT status FROM saved_jobs WHERE user_id=?', req.user.id)) counts[r.status] = (counts[r.status] || 0) + 1;
  res.json({ jobs, counts, statuses: STATUSES });
};
exports.saveJob = (req, res) => {
  const b = req.body || {}, title = String(b.title || '').trim().slice(0, 200), url = String(b.url || '').trim();
  if (!title) return bad(res, 'title is required');
  if (!J.okUrl(url) || url.length > 1000) return bad(res, 'A valid http(s) link to the job posting is required');
  const source = String(b.source || 'manual').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20) || 'manual';
  const ext = String(b.external_id || '').slice(0, 200) || crypto.createHash('sha1').update(url).digest('hex');
  if (one('SELECT id FROM saved_jobs WHERE user_id=? AND source=? AND external_id=?', req.user.id, source, ext)) return bad(res, 'You already saved this job', 409);
  const tags = (Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',')).map(t => String(t).trim()).filter(Boolean).slice(0, 15).join(',').slice(0, 300);
  const id = db.prepare('INSERT INTO saved_jobs(user_id,source,external_id,title,company,location,url,description,salary,job_type,remote,tags,posted_at,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(req.user.id, source, ext, title, String(b.company || '').slice(0, 120), String(b.location || '').slice(0, 120), url, String(b.description || '').slice(0, 4000), String(b.salary || '').slice(0, 80), String(b.job_type || '').slice(0, 40), bool(b.remote) ? 1 : 0, tags, b.posted_at ? String(b.posted_at).slice(0, 30) : null, String(b.notes || '').slice(0, 1000)).lastInsertRowid;
  log(req.user.id, `Saved job "${title.slice(0, 40)}" - Opportunities`);
  res.status(201).json(jobView(one('SELECT * FROM saved_jobs WHERE id=?', id)));
};
exports.updateSaved = (req, res) => {
  const row = one('SELECT * FROM saved_jobs WHERE id=? AND user_id=?', Number(req.params.id), req.user.id); if (!row) return bad(res, 'Not found', 404);
  const b = req.body || {}, out = {};
  if (b.status !== undefined) { if (!STATUSES.includes(b.status)) return bad(res, `status must be one of: ${STATUSES.join(', ')}`); out.status = b.status; }
  if (b.notes !== undefined) out.notes = String(b.notes).slice(0, 1000);
  const k = Object.keys(out); if (k.length) db.prepare(`UPDATE saved_jobs SET ${k.map(c => c + '=?')},updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`).run(...k.map(c => out[c]), row.id, req.user.id);
  if (out.status && out.status !== row.status) log(req.user.id, `Marked "${row.title.slice(0, 40)}" as ${out.status} - Opportunities`);
  res.json(jobView(one('SELECT * FROM saved_jobs WHERE id=?', row.id)));
};
exports.removeSaved = (req, res) => {
  const r = db.prepare('DELETE FROM saved_jobs WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id);
  if (!r.changes) return bad(res, 'Not found', 404); res.json({ ok: true });
};

// ---------- skill gaps (from saved jobs, compared with resume + profile skills) ----------
exports.skillGaps = (req, res) => {
  const us = userSkills(req.user.id), rows = all('SELECT * FROM saved_jobs WHERE user_id=?', req.user.id), gaps = new Map(), covered = new Map(); let withSkills = 0;
  for (const r of rows) {
    const m = S.matchJob({ title: r.title, description: r.description, tags: r.tags ? r.tags.split(',') : [] }, us.keys); if (m.score === null) continue; withSkills++;
    for (const x of m.missing) { const e = gaps.get(x.name) || { name: x.name, category: x.category, jobs: [] }; e.jobs.push(r.title); gaps.set(x.name, e); }
    for (const n of m.matched) covered.set(n, (covered.get(n) || 0) + 1);
  }
  const yt = n => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(n + ' tutorial for beginners');
  res.json({
    saved_jobs: rows.length, analysed_jobs: withSkills, has_skills: us.keys.size > 0,
    missing: [...gaps.values()].map(g => ({ name: g.name, category: g.category, jobs_count: g.jobs.length, jobs: g.jobs.slice(0, 5), learn_url: yt(g.name) })).sort((a, b) => b.jobs_count - a.jobs_count || a.name.localeCompare(b.name)),
    strengths: [...covered.entries()].map(([name, jobs]) => ({ name, jobs_count: jobs })).sort((a, b) => b.jobs_count - a.jobs_count),
    note: !rows.length ? 'Save some jobs to see which skills they ask for that you do not have yet.' : !us.keys.size ? 'Upload a resume or add skills in Projects & Skills so gaps can be calculated.' : withSkills < rows.length ? `${rows.length - withSkills} saved job(s) name no recognisable skills and were not counted.` : undefined,
  });
};
