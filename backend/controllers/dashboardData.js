// Dashboard integrations: Opportunities, Community, Statistics and Data Boards.
// Everything here is computed from the user's real database rows (resumes, saved_jobs, community_*, vault*, assignments, goals, habits, ...).
// Nothing is invented: when there is no data the numbers are 0 / null and the lists are empty. Ratios whose denominator is 0 are null (shown as "-"), never 0% or NaN.
const db = require('../database/db'), U = require('../utils'), S = require('../lib/skills'), V = require('../lib/vaultStore'), G = require('./goals');
const one = (s, ...a) => db.prepare(s).get(...a), all = (s, ...a) => db.prepare(s).all(...a);
const bad = (res, error, status = 400) => res.status(status).json({ error });

// ---------- validation helpers (every statistic goes through these) ----------
const int = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
const pct = (n, d) => (Number.isFinite(n) && Number.isFinite(d) && d > 0 ? Math.max(0, Math.min(100, Math.round(n / d * 100))) : null);
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const dateOf = ts => String(ts || '').slice(0, 10);

// ---------- shared real-data readers ----------
// study minutes = career study logs + completed planner sessions + completed legacy sessions (same sources the Achievements/Dashboard modules already use)
function studyByDay(uid, from, to) {
  const m = new Map(), add = rows => { for (const r of rows) m.set(r.d, (m.get(r.d) || 0) + int(r.m)); };
  add(all('SELECT log_date d,SUM(minutes) m FROM career_study_logs WHERE user_id=? AND log_date>=? AND log_date<=? GROUP BY log_date', uid, from, to));
  add(all("SELECT p.plan_date d,SUM(i.allocated_minutes) m FROM study_plan_items i JOIN study_plans p ON p.id=i.plan_id WHERE i.user_id=? AND i.status='done' AND p.plan_date>=? AND p.plan_date<=? GROUP BY p.plan_date", uid, from, to));
  add(all('SELECT session_date d,SUM(duration) m FROM study_sessions WHERE user_id=? AND completed=1 AND session_date>=? AND session_date<=? GROUP BY session_date', uid, from, to));
  return m;
}
const studyTotal = uid => int(one('SELECT COALESCE(SUM(minutes),0) c FROM career_study_logs WHERE user_id=?', uid).c) + int(one("SELECT COALESCE(SUM(allocated_minutes),0) c FROM study_plan_items WHERE user_id=? AND status='done'", uid).c) + int(one('SELECT COALESCE(SUM(duration),0) c FROM study_sessions WHERE user_id=? AND completed=1', uid).c);

// skills the user can already do: latest resume + Projects & Skills (same rule the Opportunities module uses for job matching)
function skillKeys(uid) {
  const keys = new Set(), r = one('SELECT parsed FROM resumes WHERE user_id=? ORDER BY id DESC LIMIT 1', uid);
  let parsed = null; try { parsed = r ? JSON.parse(r.parsed) : null; } catch { parsed = null; }
  for (const s of (parsed && Array.isArray(parsed.skills) ? parsed.skills : [])) keys.add(S.skillKey(s.name));
  for (const s of all('SELECT name FROM skills WHERE user_id=?', uid)) keys.add(S.skillKey(s.name));
  return { keys, parsed, resume: r };
}

// ====================================================================== OPPORTUNITIES
const JOB_STATUSES = ['saved', 'applied', 'interviewing', 'offer', 'rejected'];
function opportunities(uid) {
  const { keys, parsed } = skillKeys(uid);
  const resume = one('SELECT id,filename,file_type,uploaded_at FROM resumes WHERE user_id=? ORDER BY id DESC LIMIT 1', uid);
  const counts = Object.fromEntries(JOB_STATUSES.map(s => [s, 0]));
  for (const r of all('SELECT status,COUNT(*) n FROM saved_jobs WHERE user_id=? GROUP BY status', uid)) counts[r.status] = (counts[r.status] || 0) + int(r.n);
  const rows = all('SELECT * FROM saved_jobs WHERE user_id=? ORDER BY id DESC', uid), total = rows.length;
  const gaps = new Map(); let scored = 0, scoreSum = 0;
  const withMatch = rows.map(r => {
    const m = S.matchJob({ title: r.title, description: r.description, tags: r.tags ? r.tags.split(',') : [] }, keys);
    if (m.score !== null && keys.size) { scored++; scoreSum += m.score; for (const x of m.missing) gaps.set(x.name, (gaps.get(x.name) || 0) + 1); }
    return { r, m };
  });
  const answered = counts.applied + counts.interviewing + counts.offer + counts.rejected; // jobs the user actually applied to
  return {
    has_resume: !!resume,
    resume: resume ? { id: resume.id, filename: resume.filename, file_type: resume.file_type, uploaded_at: resume.uploaded_at,
      skills: parsed && Array.isArray(parsed.skills) ? parsed.skills.length : 0, education: parsed && Array.isArray(parsed.education) ? parsed.education.length : 0,
      projects: parsed && Array.isArray(parsed.projects) ? parsed.projects.length : 0, experience: parsed && Array.isArray(parsed.experience) ? parsed.experience.length : 0 } : null,
    saved_total: total, counts, applications: answered, interview_rate: pct(counts.interviewing + counts.offer, answered),
    avg_match: keys.size && scored ? Math.round(scoreSum / scored) : null, has_skills: keys.size > 0,
    recent: withMatch.slice(0, 4).map(({ r, m }) => ({ id: r.id, title: clip(r.title, 80), company: clip(r.company, 60), location: clip(r.location, 60), url: r.url, status: r.status, saved_at: r.saved_at, match: keys.size ? m.score : null })),
    top_gaps: [...gaps.entries()].map(([name, jobs]) => ({ name, jobs })).sort((a, b) => b.jobs - a.jobs || a.name.localeCompare(b.name)).slice(0, 5),
  };
}

// ====================================================================== COMMUNITY
function community(uid) {
  const n = (s, ...a) => int(one(s, ...a).n);
  const mine = {
    posts: n('SELECT COUNT(*) n FROM community_posts WHERE user_id=?', uid),
    comments: n('SELECT COUNT(*) n FROM community_comments WHERE user_id=?', uid),
    // likes other people gave to my posts / comments (own likes are not counted)
    likes_received: n("SELECT COUNT(*) n FROM community_likes l WHERE l.user_id<>? AND ((l.target_type='post' AND l.target_id IN (SELECT id FROM community_posts WHERE user_id=?)) OR (l.target_type='comment' AND l.target_id IN (SELECT id FROM community_comments WHERE user_id=?)))", uid, uid, uid),
    questions: n("SELECT COUNT(*) n FROM community_posts WHERE user_id=? AND kind='question'", uid),
    solved_questions: n("SELECT COUNT(*) n FROM community_posts WHERE user_id=? AND kind='question' AND solved=1", uid),
    answers_accepted: n('SELECT COUNT(*) n FROM community_posts p JOIN community_comments c ON c.id=p.accepted_comment_id WHERE c.user_id=?', uid),
    pending_requests: n("SELECT COUNT(*) n FROM community_collab k JOIN community_posts p ON p.id=k.post_id WHERE p.user_id=? AND k.status='pending'", uid),
    my_requests: n('SELECT COUNT(*) n FROM community_collab WHERE user_id=?', uid),
    teams_joined: n("SELECT COUNT(*) n FROM community_collab WHERE user_id=? AND status='accepted'", uid),
  };
  const all_ = {
    posts: n('SELECT COUNT(*) n FROM community_posts'),
    members: n('SELECT COUNT(DISTINCT user_id) n FROM (SELECT user_id FROM community_posts UNION SELECT user_id FROM community_comments)'),
    open_questions: n("SELECT COUNT(*) n FROM community_posts WHERE kind='question' AND solved=0"),
    unanswered: n("SELECT COUNT(*) n FROM community_posts p WHERE p.kind='question' AND NOT EXISTS (SELECT 1 FROM community_comments c WHERE c.post_id=p.id)"),
    open_collabs: n("SELECT COUNT(*) n FROM community_posts WHERE kind='collaboration' AND collab_open=1"),
  };
  const latest = all(`SELECT p.id,p.title,p.content,p.kind,p.category,p.created_at,p.user_id,u.name author,
      (SELECT COUNT(*) FROM community_comments c WHERE c.post_id=p.id) comments,
      (SELECT COUNT(*) FROM community_likes l WHERE l.target_type='post' AND l.target_id=p.id) likes
    FROM community_posts p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 4`).map(p => ({
    id: p.id, text: clip(p.title || p.content, 90), kind: p.kind || 'discussion', category: p.category || 'General', author: p.author || 'Student', is_mine: p.user_id === uid, comments: int(p.comments), likes: int(p.likes), created_at: p.created_at }));
  return { mine, community: all_, latest };
}

// ====================================================================== STATISTICS
function statistics(uid) {
  const today = U.todayStr(), wk0 = U.weekStart(today), from7 = U.addDays(today, -6);
  const n = (s, ...a) => int(one(s, ...a).n);
  const tile = (key, label, value, unit, detail, link, extra = {}) => ({ key, label, value, unit, detail, link, valid: value !== null && value !== undefined, ...extra });

  const studyAll = studyTotal(uid);
  let weekMin = 0; for (const v of studyByDay(uid, wk0, U.addDays(wk0, 6)).values()) weekMin += v;

  const aTot = n('SELECT COUNT(*) n FROM assignments WHERE user_id=?', uid), aDone = n("SELECT COUNT(*) n FROM assignments WHERE user_id=? AND status='done'", uid);
  const att = one('SELECT COALESCE(SUM(classes_attended),0) a,COALESCE(SUM(classes_total),0) t FROM academics WHERE user_id=? AND classes_total>0', uid);
  const goals = G.forUser(uid), gDone = goals.filter(g => g.completed).length;

  // habit consistency over the last 7 days: completed habit-days / days each habit existed in that window (a day is complete when count >= daily target)
  let hDone = 0, hElig = 0;
  const first = new Map(all('SELECT habit_id,MIN(log_date) d FROM habit_logs WHERE user_id=? GROUP BY habit_id', uid).map(r => [r.habit_id, r.d]));
  const logs = all('SELECT habit_id,log_date,count FROM habit_logs WHERE user_id=? AND log_date>=? AND log_date<=?', uid, from7, today);
  for (const h of all('SELECT id,daily_target,created_at FROM habits WHERE user_id=?', uid)) {
    const created = dateOf(h.created_at) || today, start0 = first.get(h.id) && first.get(h.id) < created ? first.get(h.id) : created, start = start0 > from7 ? start0 : from7;
    if (start > today) continue;
    hElig += U.daysBetween(start, today) + 1;
    const target = h.daily_target || 1; hDone += new Set(logs.filter(l => l.habit_id === h.id && l.log_date >= start && l.count >= target).map(l => l.log_date)).size;
  }
  const habitCount = n('SELECT COUNT(*) n FROM habits WHERE user_id=?', uid);

  const sk = one('SELECT COUNT(*) n,COALESCE(AVG(level),0) a FROM skills WHERE user_id=?', uid);
  const pTot = n('SELECT COUNT(*) n FROM projects WHERE user_id=?', uid), pDone = n("SELECT COUNT(*) n FROM projects WHERE user_id=? AND status='completed'", uid);
  const op = opportunities(uid), cm = community(uid);
  const vNotes = n('SELECT COUNT(*) n FROM vault WHERE user_id=?', uid), vFiles = n('SELECT COUNT(*) n FROM vault_files WHERE user_id=?', uid), vLinks = n('SELECT COUNT(*) n FROM vault_links WHERE user_id=?', uid);
  const lessons = one('SELECT COUNT(*) t,COALESCE(SUM(completed),0) d FROM career_lessons WHERE user_id=?', uid);

  const tiles = [
    tile('study', 'Study time', studyAll, 'min', `${weekMin} min this week`, '/planner'),
    tile('assignments', 'Assignments done', pct(aDone, aTot), '%', aTot ? `${aDone} of ${aTot} completed` : 'No assignments yet', '/assignments', { part: aDone, whole: aTot }),
    tile('attendance', 'Attendance', pct(att.a, att.t), '%', att.t ? `${int(att.a)} of ${int(att.t)} classes` : 'No attendance recorded', '/academics', { part: int(att.a), whole: int(att.t) }),
    tile('goals', 'Goals completed', pct(gDone, goals.length), '%', goals.length ? `${gDone} of ${goals.length} goals` : 'No goals yet', '/goals', { part: gDone, whole: goals.length }),
    tile('habits', 'Habit consistency', pct(hDone, hElig), '%', habitCount ? `${hDone} of ${hElig} habit-days · last 7 days` : 'No habits yet', '/growth', { part: hDone, whole: hElig }),
    tile('lessons', 'Career lessons', pct(lessons.d, lessons.t), '%', int(lessons.t) ? `${int(lessons.d)} of ${int(lessons.t)} lessons` : 'No career path yet', '/career', { part: int(lessons.d), whole: int(lessons.t) }),
    tile('skills', 'Average skill level', int(sk.n) ? Math.max(0, Math.min(100, Math.round(sk.a))) : null, '%', int(sk.n) ? `${int(sk.n)} skill${int(sk.n) === 1 ? '' : 's'}` : 'No skills yet', '/projects'),
    tile('projects', 'Projects completed', pct(pDone, pTot), '%', pTot ? `${pDone} of ${pTot} projects` : 'No projects yet', '/projects', { part: pDone, whole: pTot }),
    tile('applications', 'Interview rate', op.interview_rate, '%', op.applications ? `${op.applications} applied · ${op.saved_total} saved` : `${op.saved_total} saved job${op.saved_total === 1 ? '' : 's'}`, '/opportunities'),
    tile('community', 'Community activity', cm.mine.posts + cm.mine.comments, 'count', `${cm.mine.posts} post${cm.mine.posts === 1 ? '' : 's'} · ${cm.mine.comments} comment${cm.mine.comments === 1 ? '' : 's'} · ${cm.mine.likes_received} like${cm.mine.likes_received === 1 ? '' : 's'}`, '/community'),
    tile('vault', 'Vault items', vNotes + vFiles + vLinks, 'count', `${vNotes} note${vNotes === 1 ? '' : 's'} · ${vFiles} file${vFiles === 1 ? '' : 's'} · ${vLinks} link${vLinks === 1 ? '' : 's'}`, '/vault'),
  ];
  return { generated_at: new Date().toISOString(), today, tiles, sources: ['assignments', 'academics', 'goals', 'habits', 'habit_logs', 'career_lessons', 'career_study_logs', 'study_plan_items', 'study_sessions', 'skills', 'projects', 'saved_jobs', 'resumes', 'community_posts', 'community_comments', 'community_likes', 'vault', 'vault_files', 'vault_links'] };
}

// ====================================================================== DATA BOARDS
const BOARDS = [
  { key: 'deadlines', title: 'Upcoming Deadlines', link: '/assignments' },
  { key: 'study', title: 'Study Time · Last 7 Days', link: '/planner' },
  { key: 'skills', title: 'Skills & Projects', link: '/projects' },
  { key: 'vault', title: 'My Vault', link: '/vault' },
];
const BOARD_KEYS = BOARDS.map(b => b.key);
const boardData = {
  deadlines(uid) {
    const today = U.todayStr(), items = [];
    for (const a of all("SELECT id,title,subject,due_date FROM assignments WHERE user_id=? AND COALESCE(status,'pending')<>'done' AND due_date IS NOT NULL AND due_date<>''", uid)) if (U.isDate(a.due_date)) items.push({ type: 'assignment', id: a.id, title: clip(a.title, 70), meta: clip(a.subject, 40), date: a.due_date, link: '/assignments' });
    for (const g of G.forUser(uid)) if (!g.completed && g.target_date && U.isDate(g.target_date)) items.push({ type: 'goal', id: g.id, title: clip(g.title, 70), meta: `${g.progress}% done`, date: g.target_date, link: '/goals' });
    for (const p of all('SELECT c.id,c.title,c.target_date,(SELECT COUNT(*) FROM career_lessons l WHERE l.path_id=c.id) t,(SELECT COALESCE(SUM(l.completed),0) FROM career_lessons l WHERE l.path_id=c.id) d FROM career_paths c WHERE c.user_id=? AND c.target_date IS NOT NULL AND c.target_date<>\'\'', uid)) if (U.isDate(p.target_date) && !(p.t > 0 && p.d >= p.t)) items.push({ type: 'career', id: p.id, title: clip(p.title, 70), meta: p.t ? `${int(p.d)}/${int(p.t)} lessons` : 'No lessons yet', date: p.target_date, link: '/career' });
    items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
    return { total: items.length, overdue: items.filter(i => i.date < today).length, items: items.slice(0, 6).map(i => ({ ...i, days_left: U.daysBetween(today, i.date) })) };
  },
  study(uid) {
    const today = U.todayStr(), from = U.addDays(today, -6), by = studyByDay(uid, from, today);
    const days = Array.from({ length: 7 }, (_, i) => { const d = U.addDays(from, i); return { date: d, label: U.DOW[(new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7], minutes: by.get(d) || 0, is_today: d === today }; });
    const total = days.reduce((s, d) => s + d.minutes, 0), active = days.filter(d => d.minutes > 0).length;
    return { days, total_minutes: total, active_days: active, avg_minutes: active ? Math.round(total / active) : 0, max_minutes: Math.max(0, ...days.map(d => d.minutes)) };
  },
  skills(uid) {
    const top = all('SELECT id,name,level,category FROM skills WHERE user_id=? ORDER BY level DESC,id LIMIT 5', uid).map(s => ({ ...s, level: Math.max(0, Math.min(100, int(s.level))) }));
    const by = Object.fromEntries(all('SELECT COALESCE(status,\'active\') s,COUNT(*) n FROM projects WHERE user_id=? GROUP BY COALESCE(status,\'active\')', uid).map(r => [r.s, int(r.n)]));
    const open = all("SELECT id,title,status,technologies FROM projects WHERE user_id=? AND COALESCE(status,'active')<>'completed' ORDER BY id DESC LIMIT 3", uid).map(p => ({ id: p.id, title: clip(p.title, 60), status: p.status || 'active', technologies: clip(p.technologies, 60) }));
    return { skills_total: n1('SELECT COUNT(*) n FROM skills WHERE user_id=?', uid), categories: n1("SELECT COUNT(DISTINCT COALESCE(category,'Other')) n FROM skills WHERE user_id=?", uid), top_skills: top, projects_total: Object.values(by).reduce((a, b) => a + b, 0), projects_by_status: by, open_projects: open };
  },
  vault(uid) {
    const l = V.limits(), f = one('SELECT COUNT(*) n,COALESCE(SUM(size),0) b FROM vault_files WHERE user_id=?', uid);
    const recent = [
      ...all('SELECT id,title,COALESCE(updated_at,created_at) t FROM vault WHERE user_id=? ORDER BY COALESCE(updated_at,created_at) DESC,id DESC LIMIT 4', uid).map(r => ({ kind: 'note', id: r.id, title: clip(r.title, 60) || 'Untitled note', at: r.t })),
      ...all('SELECT id,title,COALESCE(updated_at,created_at) t FROM vault_links WHERE user_id=? ORDER BY COALESCE(updated_at,created_at) DESC,id DESC LIMIT 4', uid).map(r => ({ kind: 'link', id: r.id, title: clip(r.title, 60), at: r.t })),
      ...all('SELECT id,original_name,COALESCE(updated_at,created_at) t FROM vault_files WHERE user_id=? ORDER BY COALESCE(updated_at,created_at) DESC,id DESC LIMIT 4', uid).map(r => ({ kind: 'file', id: r.id, title: clip(r.original_name, 60), at: r.t })),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at)) || b.id - a.id).slice(0, 4);
    return { notes: n1('SELECT COUNT(*) n FROM vault WHERE user_id=?', uid), links: n1('SELECT COUNT(*) n FROM vault_links WHERE user_id=?', uid), files: int(f.n), folders: n1('SELECT COUNT(*) n FROM vault_folders WHERE user_id=?', uid), bytes: int(f.b), quota_bytes: l.quotaBytes, quota_percent: pct(int(f.b), l.quotaBytes), recent };
  },
};
function n1(s, ...a) { return int(one(s, ...a).n); }

// Board list for one user: saved visibility/order from dashboard_boards, defaults (visible, default order) for boards the user never touched.
function boards(uid) {
  const prefs = new Map(all('SELECT board_key,visible,position FROM dashboard_boards WHERE user_id=?', uid).map(r => [r.board_key, r]));
  return BOARDS.map((b, i) => { const p = prefs.get(b.key); return { ...b, visible: p ? !!p.visible : true, position: p ? p.position : i, _i: i }; })
    .sort((a, b) => a.position - b.position || a._i - b._i)
    .map(({ _i, ...b }, i) => ({ ...b, position: i, data: b.visible ? boardData[b.key](uid) : null }));
}
function saveBoards(uid, list) {
  const seen = new Set();
  for (const b of list) {
    if (!b || typeof b.key !== 'string' || !BOARD_KEYS.includes(b.key)) return { error: `key must be one of: ${BOARD_KEYS.join(', ')}` };
    if (seen.has(b.key)) return { error: `Duplicate board "${b.key}"` }; seen.add(b.key);
    if (b.visible !== undefined && typeof b.visible !== 'boolean') return { error: 'visible must be true or false' };
  }
  const cur = new Map(boards(uid).map(b => [b.key, b])), up = db.prepare('INSERT INTO dashboard_boards(user_id,board_key,visible,position) VALUES(?,?,?,?) ON CONFLICT(user_id,board_key) DO UPDATE SET visible=excluded.visible,position=excluded.position,updated_at=CURRENT_TIMESTAMP');
  db.exec('BEGIN');
  try {
    // boards named in the request keep the request's order and come first; the rest keep their current place after them
    const order = [...list.map(b => b.key), ...[...cur.keys()].filter(k => !seen.has(k))];
    order.forEach((k, i) => { const given = list.find(b => b.key === k); up.run(uid, k, (given && given.visible !== undefined ? given.visible : cur.get(k).visible) ? 1 : 0, i); });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { ok: true };
}

// ---------- HTTP handlers ----------
exports.opportunities = (req, res) => res.json(opportunities(req.user.id));
exports.community = (req, res) => res.json(community(req.user.id));
exports.statistics = (req, res) => res.json(statistics(req.user.id));
exports.boards = (req, res) => res.json({ boards: boards(req.user.id) });
exports.saveBoards = (req, res) => {
  const list = req.body && req.body.boards;
  if (!Array.isArray(list) || !list.length || list.length > BOARDS.length) return bad(res, 'boards must be a non-empty array');
  const r = saveBoards(req.user.id, list); if (r.error) return bad(res, r.error);
  res.json({ boards: boards(req.user.id) });
};
// the four blocks the main GET /api/dashboard response now carries
exports.forDashboard = uid => ({ opportunities: opportunities(uid), community: community(uid), statistics: statistics(uid), boards: boards(uid) });
exports._pct = pct; exports._int = int; exports.BOARD_KEYS = BOARD_KEYS;
