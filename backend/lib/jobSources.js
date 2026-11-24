// Real job listings from public APIs that permit this use. Nothing is ever generated: if a source fails or returns nothing, the caller gets an
// honest status plus plain external search links. All filtering happens here because the public feeds ignore or only partly support query params.
//  - Remotive   https://remotive.com/api/remote-jobs   (no key; ToS: attribute + link back, listings delayed 24h, do not hammer: cached 60 min)
//  - Arbeitnow  https://www.arbeitnow.com/api/job-board-api (no key; link back to the listing)
//  - Adzuna     https://api.adzuna.com (needs ADZUNA_APP_ID + ADZUNA_APP_KEY in backend/.env; skipped when not configured)
const TTL = 30 * 60 * 1000, cache = new Map();
const UA = { 'User-Agent': 'Learnjectory/1.0 (student career tool)', Accept: 'application/json' };
const decode = s => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
const text = (html, n = 4000) => decode(String(html || '').replace(/<(br|\/p|\/li|\/h\d|\/div)\b[^>]*>/gi, '\n').replace(/<li\b[^>]*>/gi, '- ').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);
const okUrl = u => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } };
const iso = v => { if (v === undefined || v === null || v === '') return null; const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v); return isNaN(d) ? null : d.toISOString(); };
async function getJSON(url, fetchImpl, ms = 9000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetchImpl(url, { headers: UA, signal: ac.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
  catch (e) { throw new Error(e.name === 'AbortError' ? 'timed out' : e.message || 'request failed'); } finally { clearTimeout(t); }
}
const cached = async (key, ttl, fn) => { const c = cache.get(key); if (c && Date.now() - c.t < ttl) return c.v; const v = await fn(); cache.set(key, { t: Date.now(), v }); return v; };

const SOURCES = {
  remotive: {
    name: 'Remotive', site: 'https://remotive.com', note: 'Remote jobs. Listings are delayed ~24h by Remotive.',
    configured: () => true,
    fetch: (q, f) => cached('remotive', 60 * 60 * 1000, async () => (await getJSON('https://remotive.com/api/remote-jobs', f)).jobs || []).then(rows => rows.map(j => ({
      source: 'remotive', external_id: String(j.id), title: String(j.title || ''), company: String(j.company_name || ''), location: String(j.candidate_required_location || 'Remote'), url: j.url,
      description: text(j.description), tags: Array.isArray(j.tags) ? j.tags.map(String) : [], job_type: String(j.job_type || '').replace(/_/g, ' '), remote: true, salary: String(j.salary || ''), posted_at: iso(j.publication_date) }))),
  },
  arbeitnow: {
    name: 'Arbeitnow', site: 'https://www.arbeitnow.com', note: 'Mostly Europe/Germany plus remote roles.',
    configured: () => true,
    fetch: (q, f) => cached('arbeitnow', TTL, async () => { const rows = []; for (const p of [1, 2]) { try { rows.push(...((await getJSON('https://www.arbeitnow.com/api/job-board-api?page=' + p, f)).data || [])); } catch (e) { if (p === 1) throw e; } } return rows; }).then(rows => rows.map(j => ({
      source: 'arbeitnow', external_id: String(j.slug || j.url), title: String(j.title || ''), company: String(j.company_name || ''), location: String(j.location || ''), url: j.url,
      description: text(j.description), tags: [...(j.tags || []), ...(j.job_types || [])].map(String), job_type: (j.job_types || []).join(', '), remote: !!j.remote, salary: '', posted_at: iso(j.created_at) }))),
  },
  adzuna: {
    name: 'Adzuna', site: 'https://www.adzuna.com', note: 'Needs ADZUNA_APP_ID / ADZUNA_APP_KEY. Searches worldwide listings by keyword + location.',
    configured: () => !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
    fetch: (q, f) => cached('adzuna:' + (process.env.ADZUNA_COUNTRY || 'in') + ':' + q.q + ':' + q.location, TTL, async () => {
      const u = new URL(`https://api.adzuna.com/v1/api/jobs/${encodeURIComponent((process.env.ADZUNA_COUNTRY || 'in').toLowerCase())}/search/1`);
      u.search = new URLSearchParams({ app_id: process.env.ADZUNA_APP_ID, app_key: process.env.ADZUNA_APP_KEY, results_per_page: '30', what: q.q || '', ...(q.location ? { where: q.location } : {}), 'content-type': 'application/json' });
      return (await getJSON(u.toString(), f)).results || [];
    }).then(rows => rows.map(j => ({
      source: 'adzuna', external_id: String(j.id), title: text(j.title, 200), company: String((j.company || {}).display_name || ''), location: String((j.location || {}).display_name || ''), url: j.redirect_url,
      description: text(j.description), tags: [], job_type: String(j.contract_time || '').replace(/_/g, ' '), remote: /remote/i.test(`${j.title} ${j.description}`), salary: j.salary_min ? `${Math.round(j.salary_min)}${j.salary_max ? ' - ' + Math.round(j.salary_max) : ''}` : '', posted_at: iso(j.created) }))),
  },
};
const sourceList = () => Object.entries(SOURCES).map(([id, s]) => ({ id, name: s.name, site: s.site, note: s.note, configured: s.configured() }));

// Fetch from the chosen sources in parallel; a failing source never breaks the others. Returns {jobs, sources:[{id,name,ok,count,error?}]}
async function fetchJobs({ q = '', location = '', sources }, fetchImpl = global.fetch) {
  const ids = (sources && sources.length ? sources : Object.keys(SOURCES)).filter(id => SOURCES[id]), status = [], jobs = [];
  await Promise.all(ids.map(async id => {
    const s = SOURCES[id], st = { id, name: s.name, site: s.site, ok: false, count: 0 };
    status.push(st);
    if (!s.configured()) { st.error = 'not configured (API key missing)'; st.skipped = true; return; }
    if (typeof fetchImpl !== 'function') { st.error = 'network fetch unavailable'; return; }
    try {
      const seen = new Set(), rows = (await s.fetch({ q, location }, fetchImpl)).filter(j => j.title && okUrl(j.url) && !seen.has(j.external_id) && seen.add(j.external_id)); // a listing without a real apply link is dropped
      st.ok = true; st.count = rows.length; jobs.push(...rows);
    } catch (e) { st.error = e.message; }
  }));
  return { jobs, sources: status.sort((a, b) => a.id.localeCompare(b.id)) };
}
const tokens = s => String(s || '').toLowerCase().split(/[\s,]+/).map(t => t.trim()).filter(Boolean);
function filterJobs(jobs, { q, location, remote, type, days } = {}) {
  const qt = tokens(q), lt = tokens(location), now = Date.now(); let seen = new Set();
  return jobs.filter(j => {
    const hay = `${j.title}\n${j.company}\n${(j.tags || []).join(' ')}\n${j.description}`.toLowerCase();
    if (qt.length && !qt.every(t => hay.includes(t))) return false;
    if (lt.length && !lt.some(t => `${j.location}`.toLowerCase().includes(t) || (t === 'remote' && j.remote))) return false;
    if (remote === true && !j.remote) return false;
    if (type && !`${j.job_type} ${(j.tags || []).join(' ')} ${j.title}`.toLowerCase().includes(String(type).toLowerCase())) return false;
    if (days && j.posted_at && now - Date.parse(j.posted_at) > days * 864e5) return false;
    const k = `${j.title}|${j.company}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true;
  });
}
// Plain links to the search pages of well-known boards. They open the external site; Learnjectory does not show or invent listings from them.
function searchLinks({ q = '', location = '' } = {}) {
  const e = encodeURIComponent, query = q.trim() || 'software developer', slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return [
    { name: 'LinkedIn Jobs', url: `https://www.linkedin.com/jobs/search/?keywords=${e(query)}${location ? '&location=' + e(location) : ''}` },
    { name: 'Indeed', url: `https://www.indeed.com/jobs?q=${e(query)}${location ? '&l=' + e(location) : ''}` },
    { name: 'Google Jobs', url: `https://www.google.com/search?q=${e(query + ' jobs' + (location ? ' in ' + location : ''))}&ibp=htl;jobs` },
    { name: 'Glassdoor', url: `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${e(query)}${location ? '&locKeyword=' + e(location) : ''}` },
    { name: 'Internshala (internships)', url: `https://internshala.com/internships/keywords-${e(slug)}` },
    { name: 'Naukri', url: `https://www.naukri.com/${e(slug)}-jobs${location ? '-in-' + e(location.toLowerCase().replace(/[^a-z0-9]+/g, '-')) : ''}` },
  ];
}
module.exports = { fetchJobs, filterJobs, searchLinks, sourceList, okUrl, text, _clearCache: () => cache.clear() };
