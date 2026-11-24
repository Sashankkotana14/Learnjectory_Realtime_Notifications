// Part 2B unit/controller tests. They call the real controllers with mock req/res against a real SQLite database (temp file) and do NOT need
// express/jsonwebtoken/bcrypt, so they can run where only Node is available:  npm run test:2b-unit
// (if better-sqlite3 is not installed, tests/_shims provides a node:sqlite stand-in; with real dependencies installed the real package is used).
const os = require('os'), path = require('path'), fs = require('fs'), zlib = require('zlib'), stamp = Date.now() + '_' + process.pid;
process.env.NODE_ENV = 'test'; process.env.SEED_DEMO = 'false'; process.env.DB_PATH = path.join(os.tmpdir(), `lj_2b_unit_${stamp}.db`);
process.env.VAULT_DIR = path.join(os.tmpdir(), `lj_2b_vault_${stamp}`); process.env.VAULT_KEY = 'unit-test-key-' + 'k'.repeat(20);
delete process.env.ADZUNA_APP_ID; delete process.env.ADZUNA_APP_KEY; delete process.env.VAULT_MAX_MB; delete process.env.VAULT_QUOTA_MB;
const { test, after } = require('node:test'), assert = require('node:assert/strict');
const db = require('../database/db'), S = require('../lib/skills'), RP = require('../lib/resumeParser'), TX = require('../lib/textExtract'), V = require('../lib/vaultStore'), J = require('../lib/jobSources');
const OP = require('../controllers/opportunities'), CM = require('../controllers/community'), VT = require('../controllers/vault');
const FX = n => fs.readFileSync(path.join(__dirname, 'fixtures', n));
after(() => { try { db.close && db.close(); } catch { /* ignore */ } fs.rmSync(process.env.VAULT_DIR, { recursive: true, force: true }); for (const s of ['', '-wal', '-shm']) fs.rmSync(process.env.DB_PATH + s, { force: true }); });

// ---- helpers ----
const user = n => db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(n, n.toLowerCase() + '@test.local', 'x').lastInsertRowid;
const A = user('Alice'), B = user('Bob'), C = user('Cara');
async function call(fn, uid, { body, query, params } = {}) {
  const res = { statusCode: 200, headers: {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, set(h) { Object.assign(this.headers, h); return this; }, send(b) { this.sent = b; return this; } };
  await fn({ user: { id: uid }, body: body ?? {}, query: query || {}, params: params || {} }, res); return res;
}
const ok = (r, code = 200) => { assert.equal(r.statusCode, code, JSON.stringify(r.body)); return r.body; };
const fail = (r, code, re) => { assert.equal(r.statusCode, code, JSON.stringify(r.body)); if (re) assert.match(r.body.error, re); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const crc = b => { if (zlib.crc32) return zlib.crc32(b); let c, t = [], r = 0xffffffff; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } for (const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
function makeZip(files) { // tiny ZIP writer (stored) used only to build structurally valid PPTX test files
  const parts = [], cd = []; let off = 0;
  for (const [name, data] of Object.entries(files)) {
    const n = Buffer.from(name), d = Buffer.from(data), h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc(d), 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc(d), 16); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(d.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, n, d); cd.push(c, n); off += 30 + n.length + d.length;
  }
  const cdb = Buffer.concat(cd), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(files).length, 8); e.writeUInt16LE(Object.keys(files).length, 10); e.writeUInt32LE(cdb.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdb, e]);
}
const PPTX = makeZip({ '[Content_Types].xml': '<Types/>', 'ppt/presentation.xml': '<p:presentation/>' });
const PPT = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64), Buffer.from('PowerPoint Document', 'utf16le')]);

// =============== skills / resume parsing ===============
test('skills: aliases normalise, ambiguous words are not guessed from running text', () => {
  const found = S.extract('Built apps with ReactJS and node.js on PostgreSQL. We go to market; rest of the team uses Git and C++.').map(s => s.name);
  for (const n of ['React', 'Node.js', 'PostgreSQL', 'Git', 'C++']) assert.ok(found.includes(n), n);
  for (const n of ['Go', 'R', 'C', 'REST APIs']) assert.ok(!found.includes(n), 'should not guess ' + n);
  assert.ok(!found.includes('Java'), 'Java must not match inside JavaScript'); assert.ok(S.extract('JavaScript').every(s => s.name !== 'Java'));
  assert.equal(S.skillKey('ReactJS'), 'react'); assert.equal(S.skillKey(' Some Unknown Thing. '), 'some unknown thing');
  assert.ok(S.extract('', ['Go', 'R']).map(s => s.name).includes('Go'), 'ambiguous names are accepted from explicit skill lists');
});
test('skills: job match score, missing skills, and null when a listing names no skills', () => {
  const m = S.matchJob({ title: 'Frontend developer', description: 'React, TypeScript, CSS and Docker required', tags: [] }, new Set(['react', 'css']));
  assert.equal(m.score, 50); assert.deepEqual(m.matched.sort(), ['CSS', 'React']); assert.deepEqual(m.missing.map(x => x.name).sort(), ['Docker', 'TypeScript']);
  const none = S.matchJob({ title: 'Office manager', description: 'Great people skills', tags: [] }, new Set(['react'])); assert.equal(none.score, null); assert.deepEqual(none.missing, []);
});
test('resume text extraction: real DOCX and simple PDF fixtures', async () => {
  const d = await TX.extractText(FX('sample_resume.docx'), 'docx'); assert.equal(d.method, 'docx-xml'); assert.match(d.text, /JANE SAMPLE/); assert.match(d.text, /Software Intern, Sample Labs/);
  const p = await TX.extractText(FX('sample_resume_simple.pdf'), 'pdf'); assert.match(p.text, /Example Institute of Technology/); assert.match(p.text, /PostgreSQL/);
});
test('resume text extraction: unreadable PDF (embedded CID fonts) is reported as empty, never as garbage', async () => {
  let pdfParseInstalled = true; try { require.resolve('pdf-parse/lib/pdf-parse.js'); } catch { pdfParseInstalled = false; }
  const r = await TX.extractText(FX('sample_resume_word.pdf'), 'pdf');
  if (pdfParseInstalled) assert.match(r.text, /Sample/); else assert.equal(r.text, '');
});
const check = parsed => {
  const names = parsed.skills.map(s => s.name);
  for (const n of ['Python', 'JavaScript', 'Java', 'C++', 'React', 'Node.js', 'Express', 'Flask', 'Git', 'Docker', 'PostgreSQL', 'Figma', 'PyTorch', 'Pandas', 'SQLite']) assert.ok(names.includes(n), 'skill ' + n);
  assert.equal(parsed.education.length, 2); assert.deepEqual([parsed.education[0].degree, parsed.education[0].institution, parsed.education[0].years, parsed.education[0].score], ['B.Tech in Computer Science', 'Example Institute of Technology', '2021 - 2025', 'CGPA 8.4/10']);
  assert.match(parsed.education[1].degree, /Higher Secondary/);
  assert.deepEqual(parsed.experience.map(e => [e.title, e.dates]), [['Software Intern, Sample Labs', 'Jun 2024 - Aug 2024'], ['Teaching Assistant, Example Institute', 'Jan 2023 - May 2023']]);
  assert.deepEqual(parsed.projects.map(p => p.title), ['Study Tracker', 'Image Classifier']); assert.deepEqual(parsed.projects[0].technologies.sort(), ['Node.js', 'React', 'SQLite']);
  assert.equal(parsed.experience_years, 0.7); assert.deepEqual(parsed.warnings, []);
};
test('resume parsing: skills, education, experience and projects from the DOCX fixture', async () => check(RP.parseResume((await TX.extractText(FX('sample_resume.docx'), 'docx')).text, { now: new Date('2026-11-22') })));
test('resume parsing: same result from the PDF fixture (no blank lines in PDFs)', async () => check(RP.parseResume((await TX.extractText(FX('sample_resume_simple.pdf'), 'pdf')).text, { now: new Date('2026-11-22') })));
test('resume parsing: no contact details stored; empty/unstructured text yields warnings, not invented data', () => {
  const p = RP.parseResume('Hello there. jane@x.com +1 555 0100\nI like long walks.'); assert.deepEqual([p.skills, p.education, p.experience, p.projects], [[], [], [], []]); assert.ok(p.warnings.length >= 3);
  assert.ok(!JSON.stringify(RP.parseResume('Skills\nPython\nmail me at jane@x.com')).includes('jane@x.com'));
});

// =============== resume endpoints ===============
test('resume upload: validation (type, content, size, empty) and honest errors', async () => {
  fail(await call(OP.uploadResume, A, { body: FX('sample_resume.docx'), query: { name: 'cv.exe' } }), 415);
  fail(await call(OP.uploadResume, A, { body: Buffer.from('just text, not a zip'), query: { name: 'cv.docx' } }), 415, /does not match/);
  fail(await call(OP.uploadResume, A, { body: Buffer.from('MZ-not-a-pdf'), query: { name: 'cv.pdf' } }), 415);
  fail(await call(OP.uploadResume, A, { body: Buffer.alloc(0), query: { name: 'cv.pdf' } }), 400);
  fail(await call(OP.uploadResume, A, { body: PNG, query: { name: 'cv.png' } }), 415, /PDF or DOCX/);
  fail(await call(OP.uploadResume, A, { body: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(6 * 1024 * 1024)]), query: { name: 'big.pdf' } }), 413);
  // This Word-exported PDF uses embedded CID fonts: without pdf-parse it is honestly rejected (422); with pdf-parse installed it is readable and accepted (201).
  let pdfParseInstalled = true; try { require.resolve('pdf-parse/lib/pdf-parse.js'); } catch { pdfParseInstalled = false; }
  if (pdfParseInstalled) { const w = ok(await call(OP.uploadResume, A, { body: FX('sample_resume_word.pdf'), query: { name: 'cv.pdf' } }), 201); ok(await call(OP.removeResume, A, { params: { id: w.id } })); } // removed again so the next test starts with no resume for this user
  else fail(await call(OP.uploadResume, A, { body: FX('sample_resume_word.pdf'), query: { name: 'cv.pdf' } }), 422, /Could not read|read enough/);
});
test('resume upload + analysis for DOCX, per-user isolation, import skills without duplicates', async () => {
  assert.equal(ok(await call(OP.getResume, A)).resume, null);
  const r = ok(await call(OP.uploadResume, A, { body: FX('sample_resume.docx'), query: { name: 'Jane CV.docx' } }), 201);
  assert.equal(r.filename, 'Jane CV.docx'); assert.equal(r.analysis.education.length, 2); assert.ok(r.analysis.skills.length >= 15);
  assert.equal(ok(await call(OP.getResume, B)).resume, null, 'another user must not see this resume');
  db.prepare('INSERT INTO skills(user_id,name,level,category) VALUES(?,?,?,?)').run(A, 'react', 60, 'Frontend');
  const got = ok(await call(OP.getResume, A)).resume; assert.equal(got.analysis.skills.find(s => s.name === 'React').in_profile, true); assert.equal(got.analysis.skills.find(s => s.name === 'Python').in_profile, false);
  const imp = ok(await call(OP.importSkills, A, { body: { skills: ['React', 'Python', 'Docker'] } })); assert.deepEqual(imp.added.sort(), ['Docker', 'Python']);
  assert.equal(ok(await call(OP.importSkills, A, { body: {} })).added.includes('React'), false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM skills WHERE user_id=? AND lower(name)=?').get(A, 'react').n, 1);
  assert.equal(db.prepare("SELECT level FROM skills WHERE user_id=? AND name='Python'").get(A).level, 25, 'imported skills start at Beginner');
  fail(await call(OP.importSkills, B, { body: {} }), 404);
  fail(await call(OP.removeResume, B, { params: { id: r.id } }), 404); ok(await call(OP.removeResume, A, { params: { id: r.id } }));
});
test('resume upload: simple PDF works; pasted text works; too-short text is rejected', async () => {
  ok(await call(OP.uploadResume, B, { body: FX('sample_resume_simple.pdf'), query: { name: 'cv.pdf' } }), 201);
  const t = ok(await call(OP.pasteResume, C, { body: { text: (await TX.extractText(FX('sample_resume.docx'), 'docx')).text } }), 201); assert.equal(t.method, 'pasted-text'); assert.ok(t.analysis.skills.length);
  fail(await call(OP.pasteResume, C, { body: { text: 'too short' } }), 422);
  fail(await call(OP.pasteResume, C, { body: { text: 'This is a long sentence about nothing in particular that contains no resume content at all, repeated. '.repeat(3) } }), 422, /No skills/);
});
test('resume: only the 3 most recent resumes are kept per user', async () => {
  const U = user('Dora'); for (let i = 0; i < 5; i++) ok(await call(OP.pasteResume, U, { body: { text: 'Skills\nPython, React, SQL, Docker, Git, Linux, Figma, Excel, Tableau, MongoDB and plenty more tools listed here for length padding' } }), 201);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM resumes WHERE user_id=?').get(U).n, 3);
});

// =============== jobs: real API shapes are mocked ONLY here, in tests; the app never fabricates listings ===============
const REMOTIVE = { jobs: [
  { id: 101, url: 'https://remotive.com/remote-jobs/software-dev/react-dev-101', title: 'React Developer', company_name: 'Acme', category: 'Software Development', tags: ['react', 'typescript'], job_type: 'full_time', publication_date: new Date(Date.now() - 864e5).toISOString(), candidate_required_location: 'Worldwide', salary: '$60k', description: '<p>We use <b>React</b>, TypeScript and CSS.</p>' },
  { id: 102, url: 'https://remotive.com/remote-jobs/data/analyst-102', title: 'Data Analyst', company_name: 'Beta', category: 'Data', tags: ['sql'], job_type: 'contract', publication_date: new Date(Date.now() - 2 * 864e5).toISOString(), candidate_required_location: 'Europe', description: '<ul><li>SQL</li><li>Tableau</li></ul>' },
  { id: 103, title: 'No link job', company_name: 'Ghost', description: 'React' },
] };
const ARBEIT = { data: [{ slug: 'junior-node-dev-berlin-9', title: 'Junior Node.js Developer', company_name: 'Gamma GmbH', description: 'Node.js, Express and Docker', remote: false, url: 'https://www.arbeitnow.com/jobs/companies/gamma/junior-node-dev-berlin-9', tags: ['Node.js'], job_types: ['full time'], location: 'Berlin', created_at: Math.floor(Date.now() / 1000) - 3600 }] };
const goodFetch = async url => ({ ok: true, json: async () => (String(url).includes('remotive') ? REMOTIVE : ARBEIT) });
const calls = []; const spyFetch = async (u, o) => { calls.push(String(u)); return goodFetch(u, o); };
test('jobs: real listings are normalised, filtered, matched to the user and carry real apply links', async () => {
  J._clearCache(); OP._setFetch(spyFetch);
  ok(await call(OP.pasteResume, B, { body: { text: 'Skills\nReact, CSS, Node.js, Express, Git\nProjects\nStudy app\n- Built with React and Node.js for tracking' } }), 201);
  const r = ok(await call(OP.searchJobs, B, { query: {} }));
  assert.equal(r.total, 3, 'listing without a link must be dropped'); assert.ok(r.jobs.every(j => /^https:\/\//.test(j.url)));
  assert.deepEqual(r.sources.map(s => [s.id, s.ok, s.count]), [['adzuna', false, 0], ['arbeitnow', true, 1], ['remotive', true, 2]]); assert.ok(r.sources.find(s => s.id === 'adzuna').skipped);
  const react = r.jobs.find(j => j.title === 'React Developer'); assert.equal(react.description.includes('<'), false, 'HTML stripped'); assert.deepEqual(react.match.missing.map(m => m.name), ['TypeScript']); assert.equal(react.match.score, 67);
  assert.equal(r.sort, 'match'); assert.ok(r.jobs[0].match.score >= r.jobs[1].match.score);
  assert.ok(r.top_gaps.some(g => g.name === 'TypeScript')); assert.ok(r.external_links.length >= 4 && r.external_links.every(l => /^https:\/\//.test(l.url)));
  const f = ok(await call(OP.searchJobs, B, { query: { q: 'node', location: 'berlin' } })); assert.deepEqual(f.jobs.map(j => j.title), ['Junior Node.js Developer']);
  assert.equal(ok(await call(OP.searchJobs, B, { query: { remote: 'true' } })).jobs.every(j => j.remote), true);
  const mid = ok(await call(OP.searchJobs, B, { query: { min_match: '50' } })).jobs; assert.deepEqual(mid.map(j => j.title).sort(), ['Junior Node.js Developer', 'React Developer']); assert.equal(ok(await call(OP.searchJobs, B, { query: { min_match: '90' } })).total, 0);
  assert.equal(ok(await call(OP.searchJobs, B, { query: { q: 'zzzz-nothing' } })).total, 0);
  assert.match(ok(await call(OP.searchJobs, B, { query: { q: 'zzzz-nothing' } })).note, /No listings/);
  const n = calls.length; await call(OP.searchJobs, B, { query: {} }); assert.equal(calls.length, n, 'responses are cached, public APIs are not hammered');
});
test('jobs: when every API is down no listings are invented - honest note + external search links', async () => {
  J._clearCache(); OP._setFetch(async () => { throw new Error('getaddrinfo ENOTFOUND'); });
  const r = ok(await call(OP.searchJobs, A, { query: { q: 'python developer', location: 'Pune' } }));
  assert.deepEqual(r.jobs, []); assert.equal(r.total, 0); assert.match(r.note, /could not be reached/); assert.ok(r.sources.filter(s => !s.skipped).every(s => !s.ok && /ENOTFOUND/.test(s.error)));
  assert.ok(r.external_links.some(l => l.url.includes('linkedin.com') && l.url.includes('python%20developer') && l.url.includes('Pune')));
  OP._setFetch(async () => ({ ok: false, status: 503, json: async () => ({}) })); J._clearCache();
  assert.ok(ok(await call(OP.searchJobs, A, { query: {} })).sources.some(s => /HTTP 503/.test(s.error || '')));
  OP._setFetch(spyFetch); J._clearCache();
});
test('jobs: Adzuna is only queried when its keys are configured', async () => {
  process.env.ADZUNA_APP_ID = 'id'; process.env.ADZUNA_APP_KEY = 'key'; J._clearCache(); const urls = [];
  OP._setFetch(async url => { urls.push(String(url)); return { ok: true, json: async () => (String(url).includes('adzuna') ? { results: [{ id: 7, title: 'Python <b>Developer</b>', company: { display_name: 'Delta' }, location: { display_name: 'Pune' }, redirect_url: 'https://www.adzuna.in/land/ad/7', description: 'Python and SQL', created: '2026-11-20T10:00:00Z', salary_min: 500000, salary_max: 800000 }] } : { jobs: [], data: [] }) }; });
  const r = ok(await call(OP.searchJobs, A, { query: { q: 'python', location: 'Pune' } })); delete process.env.ADZUNA_APP_ID; delete process.env.ADZUNA_APP_KEY;
  const u = urls.find(x => x.includes('adzuna')); assert.ok(u && u.includes('what=python') && u.includes('where=Pune')); assert.equal(r.jobs[0].title, 'Python Developer'); assert.equal(r.jobs[0].salary, '500000 - 800000'); OP._setFetch(spyFetch); J._clearCache();
});

// =============== saved jobs + skill gaps ===============
let savedId;
test('saved jobs: save from a listing, duplicate/invalid rejected, status tracking, isolation', async () => {
  J._clearCache(); const listing = ok(await call(OP.searchJobs, B, { query: { q: 'react' } })).jobs[0];
  const s = ok(await call(OP.saveJob, B, { body: listing }), 201); savedId = s.id; assert.equal(s.status, 'saved'); assert.equal(s.url, listing.url);
  fail(await call(OP.saveJob, B, { body: listing }), 409); fail(await call(OP.saveJob, B, { body: { title: 'x', url: 'javascript:alert(1)' } }), 400); fail(await call(OP.saveJob, B, { body: { url: 'https://a.com' } }), 400);
  assert.equal(ok(await call(OP.searchJobs, B, { query: { q: 'react' } })).jobs[0].saved_id, s.id, 'search results show what is already saved');
  ok(await call(OP.saveJob, B, { body: { title: 'Manual role', company: 'Elsewhere', url: 'https://example.org/jobs/1', description: 'Needs Docker and Kubernetes', source: 'manual' } }), 201);
  assert.equal(ok(await call(OP.updateSaved, B, { params: { id: savedId }, body: { status: 'applied', notes: 'Sent CV' } })).status, 'applied'); fail(await call(OP.updateSaved, B, { params: { id: savedId }, body: { status: 'hired!' } }), 400);
  fail(await call(OP.updateSaved, A, { params: { id: savedId }, body: { status: 'offer' } }), 404); fail(await call(OP.removeSaved, A, { params: { id: savedId } }), 404);
  assert.equal(ok(await call(OP.listSaved, A)).jobs.length, 0); const l = ok(await call(OP.listSaved, B)); assert.equal(l.jobs.length, 2); assert.equal(l.counts.applied, 1); assert.equal(ok(await call(OP.listSaved, B, { query: { status: 'saved' } })).jobs.length, 1);
});
test('skill gaps: computed from saved jobs vs. resume + profile skills, with learning links', async () => {
  const g = ok(await call(OP.skillGaps, B)); assert.equal(g.saved_jobs, 2); const names = g.missing.map(m => m.name);
  assert.ok(names.includes('Docker') && names.includes('Kubernetes') && names.includes('TypeScript')); assert.ok(g.missing[0].learn_url.startsWith('https://www.youtube.com/results?search_query='));
  assert.ok(g.strengths.some(s => s.name === 'React')); assert.equal(ok(await call(OP.skillGaps, A)).saved_jobs, 0); assert.match(ok(await call(OP.skillGaps, A)).note, /Save some jobs/);
  ok(await call(OP.removeSaved, B, { params: { id: savedId } })); assert.equal(ok(await call(OP.listSaved, B)).jobs.length, 1);
});

// =============== community ===============
let Q, D, K;
test('community: create all three kinds with validation', async () => {
  fail(await call(CM.create, A, { body: { content: '' } }), 400); fail(await call(CM.create, A, { body: { content: 'x', kind: 'rant' } }), 400); fail(await call(CM.create, A, { body: { content: 'x', category: 'Nope' } }), 400);
  fail(await call(CM.create, A, { body: { content: 'How?', kind: 'question' } }), 400, /title/); fail(await call(CM.create, A, { body: { content: 'x'.repeat(5001) } }), 400); fail(await call(CM.create, A, { body: { content: 'x', tags: 'a,b,c,d,e,f' } }), 400);
  D = ok(await call(CM.create, A, { body: { content: 'Anyone up for a study group?', category: 'Study Help', tags: 'maths, group,maths' } }), 201); assert.deepEqual(D.tags_list, ['maths', 'group']); assert.equal(D.is_mine, true); assert.equal(D.author.name, 'Alice');
  Q = ok(await call(CM.create, A, { body: { title: 'How does JOIN work?', content: 'Explain INNER vs LEFT JOIN', kind: 'question', category: 'Tech' } }), 201);
  K = ok(await call(CM.create, A, { body: { title: 'Team for hackathon', content: 'Need a designer', kind: 'collaboration', category: 'Projects', skills_needed: 'Figma, React', max_members: 3 } }), 201); assert.deepEqual(K.skills_needed_list, ['Figma', 'React']);
  fail(await call(CM.create, A, { body: { title: 't', content: 'c', kind: 'collaboration', max_members: 1 } }), 400);
});
test('community: only the author can edit/delete a post; type is immutable', async () => {
  fail(await call(CM.update, B, { params: { id: D.id }, body: { content: 'hacked' } }), 403); fail(await call(CM.remove, B, { params: { id: D.id } }), 403);
  const u = ok(await call(CM.update, A, { params: { id: D.id }, body: { content: 'Study group on Saturday?' } })); assert.equal(u.content, 'Study group on Saturday?'); assert.ok(u.updated_at);
  fail(await call(CM.update, A, { params: { id: D.id }, body: { kind: 'question' } }), 400, /cannot be changed/); fail(await call(CM.update, A, { params: { id: 99999 }, body: { content: 'x' } }), 404);
});
test('community: list, filters, search and pagination (all signed-in users see all posts)', async () => {
  assert.equal(ok(await call(CM.list, B)).total, 3); assert.equal(ok(await call(CM.list, B, { query: { kind: 'question' } })).posts[0].id, Q.id); assert.equal(ok(await call(CM.list, B, { query: { category: 'Projects' } })).total, 1);
  assert.equal(ok(await call(CM.list, B, { query: { q: 'JOIN' } })).total, 1); assert.equal(ok(await call(CM.list, B, { query: { q: '%' } })).total, 0, 'LIKE wildcards are escaped');
  assert.equal(ok(await call(CM.list, B, { query: { mine: 'true' } })).total, 0); assert.equal(ok(await call(CM.list, A, { query: { mine: 'true' } })).total, 3);
  assert.equal(ok(await call(CM.list, B, { query: { limit: '2' } })).posts.length, 2); assert.equal(ok(await call(CM.list, B, { query: { limit: '2', page: '2' } })).posts.length, 1);
  assert.equal(ok(await call(CM.list, B, { query: { sort: 'unanswered' } })).total, 1); assert.equal(ok(await call(CM.list, B, { query: { solved: '0' } })).total, 1);
});
test('community: likes toggle per user and are counted once', async () => {
  let r = ok(await call(CM.likePost, B, { params: { id: D.id } })); assert.deepEqual([r.liked, r.like_count], [true, 1]); r = ok(await call(CM.likePost, C, { params: { id: D.id } })); assert.equal(r.like_count, 2);
  r = ok(await call(CM.likePost, B, { params: { id: D.id } })); assert.deepEqual([r.liked, r.like_count], [false, 1]); fail(await call(CM.likePost, B, { params: { id: 424242 } }), 404);
  assert.equal(ok(await call(CM.get, C, { params: { id: D.id } })).liked, true); assert.equal(ok(await call(CM.get, B, { params: { id: D.id } })).liked, false);
});
let ans1, ans2;
test('community: comments/answers - add, edit, delete, permissions, comment likes', async () => {
  fail(await call(CM.addComment, B, { params: { id: Q.id }, body: { body: '  ' } }), 400); fail(await call(CM.addComment, B, { params: { id: 9999 }, body: { body: 'x' } }), 404);
  ans1 = ok(await call(CM.addComment, B, { params: { id: Q.id }, body: { body: 'INNER keeps matches only' } }), 201); ans2 = ok(await call(CM.addComment, C, { params: { id: Q.id }, body: { body: 'LEFT keeps all left rows' } }), 201);
  fail(await call(CM.updateComment, C, { params: { id: ans1.id }, body: { body: 'edited by someone else' } }), 403); fail(await call(CM.removeComment, A, { params: { id: ans1.id } }), 403, /own comments/);
  assert.equal(ok(await call(CM.updateComment, B, { params: { id: ans1.id }, body: { body: 'INNER keeps only matching rows' } })).body, 'INNER keeps only matching rows');
  assert.equal(ok(await call(CM.likeComment, A, { params: { id: ans2.id } })).like_count, 1);
  const p = ok(await call(CM.get, A, { params: { id: Q.id } })); assert.equal(p.comments.length, 2); assert.equal(p.comment_count, 2); assert.equal(p.comments.find(c => c.id === ans1.id).is_mine, false);
  assert.equal(ok(await call(CM.list, B, { query: { sort: 'unanswered' } })).total, 0);
});
test('community: only the question author can mark an answer solved; deleting that answer re-opens it', async () => {
  fail(await call(CM.solve, B, { params: { id: Q.id }, body: { comment_id: ans1.id } }), 403); fail(await call(CM.solve, A, { params: { id: D.id }, body: { comment_id: 1 } }), 400, /question/); fail(await call(CM.solve, A, { params: { id: Q.id }, body: { comment_id: 987654 } }), 400);
  const s = ok(await call(CM.solve, A, { params: { id: Q.id }, body: { comment_id: ans2.id } })); assert.equal(s.solved, true); assert.equal(s.accepted_comment_id, ans2.id);
  const p = ok(await call(CM.get, B, { params: { id: Q.id } })); assert.equal(p.comments[0].id, ans2.id); assert.equal(p.comments[0].accepted, true, 'accepted answer is shown first'); assert.equal(ok(await call(CM.list, B, { query: { solved: '1' } })).total, 1);
  fail(await call(CM.reopen, B, { params: { id: Q.id } }), 403); ok(await call(CM.removeComment, C, { params: { id: ans2.id } })); const after = ok(await call(CM.get, A, { params: { id: Q.id } })); assert.equal(after.solved, false); assert.equal(after.accepted_comment_id, null);
  ok(await call(CM.solve, A, { params: { id: Q.id }, body: { comment_id: ans1.id } })); assert.equal(ok(await call(CM.reopen, A, { params: { id: Q.id } })).solved, false);
});
let reqB, reqC;
test('community: collaboration requests - rules, privacy, accept/decline, team size', async () => {
  fail(await call(CM.requestJoin, B, { params: { id: Q.id } }), 400, /not a collaboration/); fail(await call(CM.requestJoin, A, { params: { id: K.id } }), 400, /own post/);
  reqB = ok(await call(CM.requestJoin, B, { params: { id: K.id }, body: { message: 'I can design' } }), 201); reqC = ok(await call(CM.requestJoin, C, { params: { id: K.id }, body: { message: 'private note from Cara' } }), 201);
  fail(await call(CM.requestJoin, B, { params: { id: K.id } }), 409);
  const own = ok(await call(CM.get, B, { params: { id: K.id } })); assert.equal(own.requests.length, 1); assert.equal(own.requests[0].message, 'I can design'); assert.equal(own.my_request, 'pending');
  const owner = ok(await call(CM.get, A, { params: { id: K.id } })); assert.equal(owner.requests.length, 2);
  fail(await call(CM.decide, B, { params: { id: reqB.id }, body: { status: 'accepted' } }), 403); fail(await call(CM.decide, A, { params: { id: reqB.id }, body: { status: 'maybe' } }), 400);
  ok(await call(CM.decide, A, { params: { id: reqB.id }, body: { status: 'accepted' } })); assert.deepEqual(ok(await call(CM.get, C, { params: { id: K.id } })).members.map(m => m.name), ['Bob']);
  ok(await call(CM.decide, A, { params: { id: reqC.id }, body: { status: 'accepted' } })); // team of 3 incl. author is now full
  const D2 = user('Eve'); const r3 = ok(await call(CM.requestJoin, D2, { params: { id: K.id } }), 201); fail(await call(CM.decide, A, { params: { id: r3.id }, body: { status: 'accepted' } }), 409, /full/);
  fail(await call(CM.withdraw, C, { params: { id: reqB.id } }), 403); ok(await call(CM.withdraw, B, { params: { id: reqB.id } }));
  ok(await call(CM.update, A, { params: { id: K.id }, body: { collab_open: false } })); fail(await call(CM.requestJoin, user('Finn'), { params: { id: K.id } }), 409, /closed/);
});
test('community: deleting a post removes its comments, likes and requests', async () => {
  ok(await call(CM.likePost, B, { params: { id: Q.id } })); ok(await call(CM.likeComment, B, { params: { id: ans1.id } })); ok(await call(CM.remove, A, { params: { id: Q.id } })); ok(await call(CM.remove, A, { params: { id: K.id } }));
  const n = (t, w) => db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE ${w}`).get().n;
  assert.equal(n('community_comments', `post_id IN (${Q.id},${K.id})`), 0); assert.equal(n('community_collab', `post_id=${K.id}`), 0); assert.equal(n('community_likes', `(target_type='post' AND target_id=${Q.id}) OR (target_type='comment' AND target_id=${ans1.id})`), 0); fail(await call(CM.get, A, { params: { id: Q.id } }), 404);
});

// =============== vault ===============
test('vault notes: CRUD, validation, pinning, strict per-user isolation', async () => {
  fail(await call(VT.createNote, A, { body: { title: '' } }), 400); fail(await call(VT.createNote, A, { body: { title: 'x', content: 'y'.repeat(20001) } }), 400); fail(await call(VT.createNote, A, { body: { title: 'x', tags: 'a,b,c,d,e,f,g,h,i,j,k' } }), 400);
  const n = ok(await call(VT.createNote, A, { body: { title: 'Physics formulas', content: 'E = mc^2', category: 'Study', tags: '#physics, exams' } }), 201); assert.deepEqual(n.tags_list, ['physics', 'exams']);
  fail(await call(VT.updateNote, B, { params: { id: n.id }, body: { title: 'stolen' } }), 404); fail(await call(VT.removeNote, B, { params: { id: n.id } }), 404);
  assert.equal(ok(await call(VT.overview, B)).notes.length, 0, 'Bob sees none of Alice\'s notes');
  const u = ok(await call(VT.updateNote, A, { params: { id: n.id }, body: { content: 'E = mc^2 and F = ma', pinned: true } })); assert.equal(u.pinned, true); assert.equal(u.title, 'Physics formulas');
  assert.equal(ok(await call(VT.overview, A, { query: { q: 'f = ma' } })).notes.length, 1); ok(await call(VT.removeNote, A, { params: { id: n.id } })); assert.equal(ok(await call(VT.overview, A)).notes.length, 0);
});
test('vault folders/links/categories/tags: uniqueness, ownership checks, search & organise', async () => {
  const f = ok(await call(VT.createFolder, A, { body: { name: 'Semester 1' } }), 201); fail(await call(VT.createFolder, A, { body: { name: 'semester 1' } }), 409); ok(await call(VT.createFolder, B, { body: { name: 'Semester 1' } }), 201);
  fail(await call(VT.createFolder, A, { body: { name: '' } }), 400); fail(await call(VT.updateFolder, B, { params: { id: f.id }, body: { name: 'x' } }), 404); fail(await call(VT.removeFolder, B, { params: { id: f.id } }), 404);
  fail(await call(VT.createNote, B, { body: { title: 'n', folder_id: f.id } }), 400, /Folder not found/); // cannot file things into someone else's folder
  const note = ok(await call(VT.createNote, A, { body: { title: 'Syllabus', content: 'unit 1', folder_id: f.id, category: 'Study', tags: 'syllabus' } }), 201);
  const link = ok(await call(VT.createLink, A, { body: { title: 'MDN', url: 'https://developer.mozilla.org', folder_id: f.id, category: 'Reference', tags: 'web,docs' } }), 201);
  fail(await call(VT.createLink, A, { body: { title: 'bad', url: 'javascript:alert(1)' } }), 400); fail(await call(VT.createLink, A, { body: { title: 'bad', url: 'ftp://x.org' } }), 400);
  fail(await call(VT.updateLink, B, { params: { id: link.id }, body: { title: 'x' } }), 404); fail(await call(VT.removeLink, B, { params: { id: link.id } }), 404);
  let o = ok(await call(VT.overview, A, { query: { folder_id: String(f.id) } })); assert.equal(o.notes.length + o.links.length, 2); assert.equal(o.folders.find(x => x.id === f.id).count, 2);
  assert.equal(ok(await call(VT.overview, A, { query: { tag: 'docs' } })).links.length, 1); assert.equal(ok(await call(VT.overview, A, { query: { category: 'study' } })).notes.length, 1); assert.equal(ok(await call(VT.overview, A, { query: { q: 'mozilla', type: 'links' } })).links.length, 1);
  assert.deepEqual(o.categories.map(c => c.name), ['Reference', 'Study']); assert.ok(o.tags.some(t => t.name === 'web'));
  ok(await call(VT.updateNote, A, { params: { id: note.id }, body: { folder_id: null } })); ok(await call(VT.removeFolder, A, { params: { id: f.id } }));
  o = ok(await call(VT.overview, A, { query: { folder_id: 'none' } })); assert.equal(o.notes.length, 1); assert.equal(o.links.length, 1, 'deleting a folder keeps its items (moved to Unfiled)'); assert.equal(o.links[0].folder_id, null);
});
const up = (uid, buf, name, extra = {}) => call(VT.uploadFile, uid, { body: buf, query: { name, ...extra } });
test('vault files: allowed types are accepted (PDF, DOCX, PPT, PPTX, PNG)', async () => {
  for (const [buf, name] of [[FX('sample_resume_simple.pdf'), 'notes.pdf'], [FX('sample_resume.docx'), 'essay.docx'], [PPTX, 'slides.pptx'], [PPT, 'old.ppt'], [PNG, 'photo.png']]) { const f = ok(await up(A, buf, name, { category: 'Study', tags: 'x' }), 201); assert.equal(f.original_name, name); assert.equal(f.size, buf.length); assert.equal('stored_name' in f, false, 'internal storage name is never exposed'); }
  assert.equal(ok(await call(VT.overview, A, { query: { type: 'files' } })).files.length, 5);
});
test('vault files: validation rejects wrong types, mismatched content, oversize, empty and traversal names', async () => {
  fail(await up(A, Buffer.from('MZ\x90\x00 malware'), 'setup.exe'), 415, /not allowed/); fail(await up(A, Buffer.from('<svg onload=alert(1)>'), 'x.svg'), 415); fail(await up(A, Buffer.from('<html>'), 'page.html'), 415); fail(await up(A, Buffer.from('x'), 'noext'), 415);
  fail(await up(A, PNG, 'pretend.pdf'), 415, /does not match/); fail(await up(A, Buffer.from('%PDF-1.4 hi'), 'pretend.png'), 415, /does not match/); fail(await up(A, Buffer.from('PK\x03\x04junk'), 'fake.docx'), 415); fail(await up(A, FX('sample_resume.docx'), 'deck.pptx'), 415, /does not match/);
  fail(await up(A, Buffer.alloc(0), 'a.pdf'), 400); fail(await up(A, 'not a buffer', 'a.pdf'), 400);
  const t = ok(await up(A, PNG, '../../../etc/passwd.png'), 201); assert.equal(t.original_name, 'passwd.png'); const row = db.prepare('SELECT * FROM vault_files WHERE id=?').get(t.id); assert.match(row.stored_name, /^[0-9a-f-]{36}\.bin$/);
  const dirFiles = fs.readdirSync(path.join(process.env.VAULT_DIR, String(A))); assert.ok(dirFiles.includes(row.stored_name)); assert.ok(!fs.existsSync(path.join(process.env.VAULT_DIR, 'etc')));
  process.env.VAULT_MAX_MB = '0.001'; fail(await up(A, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(3000)]), 'big.pdf'), 413, /too large/); delete process.env.VAULT_MAX_MB;
  process.env.VAULT_QUOTA_MB = '0.001'; const small = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(700)]); ok(await up(B, small, 'fits.pdf'), 201); fail(await up(B, small, 'second.pdf'), 413, /storage limit/); delete process.env.VAULT_QUOTA_MB;
  fail(await up(A, PNG, 'p.png', { folder_id: '99999' }), 400, /Folder not found/); fail(await up(A, PNG, 'p.png', { tags: 'a'.repeat(31) }), 400);
});
test('vault files: encrypted at rest; download returns identical bytes with safe headers', async () => {
  const marker = 'UNIQUE-SECRET-MARKER-' + stamp, pdf = Buffer.from(`%PDF-1.4\n% ${marker}\n1 0 obj<<>>endobj\n%%EOF`); const f = ok(await up(A, pdf, 'secret plan.pdf'), 201);
  const raw = fs.readFileSync(path.join(process.env.VAULT_DIR, String(A), db.prepare('SELECT stored_name FROM vault_files WHERE id=?').get(f.id).stored_name));
  assert.ok(!raw.includes(marker) && !raw.includes('%PDF-'), 'ciphertext must not contain the plaintext'); assert.equal(raw.subarray(0, 4).toString(), 'LJV1');
  const d = await call(VT.downloadFile, A, { params: { id: f.id } }); assert.equal(d.statusCode, 200); assert.ok(Buffer.compare(d.sent, pdf) === 0);
  assert.equal(d.headers['Content-Type'], 'application/pdf'); assert.match(d.headers['Content-Disposition'], /^attachment; filename\*=UTF-8''secret%20plan\.pdf$/); assert.equal(d.headers['X-Content-Type-Options'], 'nosniff'); assert.equal(d.headers['Cache-Control'], 'private, no-store');
  assert.match((await call(VT.downloadFile, A, { params: { id: f.id }, query: { inline: '1' } })).headers['Content-Disposition'], /^inline/);
  const docx = ok(await up(A, FX('sample_resume.docx'), 'e.docx'), 201); assert.match((await call(VT.downloadFile, A, { params: { id: docx.id }, query: { inline: '1' } })).headers['Content-Disposition'], /^attachment/, 'only PDFs and images can be shown inline');
});
test('vault files: another user can never read, change or delete a private file', async () => {
  const f = ok(await up(A, PNG, 'mine.png'), 201), stored = db.prepare('SELECT stored_name FROM vault_files WHERE id=?').get(f.id).stored_name;
  fail(await call(VT.downloadFile, B, { params: { id: f.id } }), 404); fail(await call(VT.updateFile, B, { params: { id: f.id }, body: { description: 'x' } }), 404); fail(await call(VT.removeFile, B, { params: { id: f.id } }), 404);
  assert.ok(!ok(await call(VT.overview, B)).files.some(x => x.id === f.id));
  assert.throws(() => V.load(B, stored), /ENOENT/, 'the file does not exist under another user\'s storage folder'); assert.throws(() => V.load(A, '../../x.bin'), /invalid storage name/); assert.throws(() => V.load('../A', stored), /invalid storage name/);
  const swapped = path.join(process.env.VAULT_DIR, String(B)); fs.mkdirSync(swapped, { recursive: true }); fs.copyFileSync(path.join(process.env.VAULT_DIR, String(A), stored), path.join(swapped, stored));
  assert.throws(() => V.load(B, stored), 'ciphertext copied into another user\'s folder cannot be decrypted (AAD binds it to the owner)'); fs.rmSync(path.join(swapped, stored));
  ok(await call(VT.removeFile, A, { params: { id: f.id } })); assert.ok(!fs.existsSync(path.join(process.env.VAULT_DIR, String(A), stored)), 'file removed from disk on delete'); fail(await call(VT.downloadFile, A, { params: { id: f.id } }), 404);
});
test('vault files: rename keeps extension, move between folders, tamper detection', async () => {
  const folder = ok(await call(VT.createFolder, A, { body: { name: 'Certificates' } }), 201), f = ok(await up(A, PNG, 'cert.png'), 201);
  const u = ok(await call(VT.updateFile, A, { params: { id: f.id }, body: { name: 'cert-final.png', folder_id: folder.id, category: 'Awards', tags: 'cert', description: 'Hackathon' } })); assert.deepEqual([u.original_name, u.folder_id, u.category, u.description], ['cert-final.png', folder.id, 'Awards', 'Hackathon']);
  fail(await call(VT.updateFile, A, { params: { id: f.id }, body: { name: 'cert.exe' } }), 400, /extension/); fail(await call(VT.updateFile, A, { params: { id: f.id }, body: { folder_id: 424242 } }), 400);
  const p = path.join(process.env.VAULT_DIR, String(A), db.prepare('SELECT stored_name FROM vault_files WHERE id=?').get(f.id).stored_name), buf = fs.readFileSync(p); buf[buf.length - 1] ^= 1; fs.writeFileSync(p, buf);
  fail(await call(VT.downloadFile, A, { params: { id: f.id } }), 500, /could not be read/);
});

// =============== static checks: auth on every new route, sidebar order, routing ===============
test('routes: every Part 2B API route requires authentication', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'api.js'), 'utf8'), re = /router\.(get|post|put|delete)\('(\/(?:opportunities|community|vault)[^']*)',\s*([^;]*?)\);/g; let m, n = 0;
  while ((m = re.exec(src))) { n++; assert.ok(/^auth\b/.test(m[3]), `${m[1].toUpperCase()} ${m[2]} must use auth first`); if (/raw\(/.test(m[3])) assert.ok(m[3].indexOf('auth') < m[3].indexOf('raw('), 'auth must run before the body is read'); }
  assert.ok(n >= 40, 'expected at least 40 new routes, found ' + n);
});
test('frontend: sidebar order unchanged and new pages are routed', () => {
  const cfg = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'config.ts'), 'utf8'), labels = [...cfg.slice(cfg.indexOf('export const nav')).matchAll(/'\/[a-z]*', '([^']+)'/g)].map(x => x[1]);
  assert.deepEqual(labels, ['Dashboard', 'Academics', 'Assignments', 'Study Planner', 'My Goals', 'Growth Engine', 'Career Compass', 'Projects & Skills', 'Achievements', 'Opportunities', 'Community', 'My Vault', 'Analytics', 'Settings']);
  const main = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'main.tsx'), 'utf8'); for (const p of ['opportunities', 'community', 'vault']) assert.match(main, new RegExp(`path="${p}"`));
});

// =============== community: all six post types ===============
test('community: all six post types can be created, listed, filtered, edited and deleted', async () => {
  const meta = ok(await call(CM.meta, A)); assert.deepEqual(meta.kinds, ['discussion', 'question', 'collaboration', 'resource', 'showcase', 'announcement']);
  // validation for the three newer types
  fail(await call(CM.create, A, { body: { kind: 'resource', title: 'Free SQL course', content: 'Great intro' } }), 400, /link/);
  fail(await call(CM.create, A, { body: { kind: 'resource', title: 'x', content: 'y', link_url: 'javascript:alert(1)' } }), 400, /link_url/);
  fail(await call(CM.create, A, { body: { kind: 'resource', title: 'x', content: 'y', link_url: 'not a url' } }), 400, /link_url/);
  fail(await call(CM.create, A, { body: { kind: 'showcase', content: 'No name' } }), 400, /title/);
  fail(await call(CM.create, A, { body: { kind: 'showcase', title: 'p', content: 'c', link_url: 'ftp://x.y/z' } }), 400, /link_url/);
  fail(await call(CM.create, A, { body: { kind: 'announcement', content: 'No headline' } }), 400, /title/);
  const R = ok(await call(CM.create, A, { body: { kind: 'resource', title: 'Free SQL course', content: 'Great intro', category: 'Resources', link_url: 'https://example.com/sql', tags: 'sql' } }), 201);
  const P = ok(await call(CM.create, B, { body: { kind: 'showcase', title: 'Learnjectory', content: 'My growth app', category: 'Projects', link_url: 'https://github.com/x/y' } }), 201);
  const P2 = ok(await call(CM.create, B, { body: { kind: 'showcase', title: 'No link project', content: 'still fine', category: 'Projects' } }), 201);
  const N = ok(await call(CM.create, C, { body: { kind: 'announcement', title: 'Hackathon on Friday', content: 'Register by Thursday', category: 'Opportunities' } }), 201);
  assert.equal(R.kind, 'resource'); assert.equal(R.link_url, 'https://example.com/sql'); assert.equal(P.kind, 'showcase'); assert.equal(P2.link_url, ''); assert.equal(N.kind, 'announcement'); assert.equal(N.link_url, '');
  // link is ignored on kinds that do not use it
  assert.equal(ok(await call(CM.create, A, { body: { kind: 'announcement', title: 'a', content: 'b', link_url: 'https://x.y' } }), 201).link_url, '');
  // listing + filtering by every kind (the three originals still work alongside)
  ok(await call(CM.create, A, { body: { content: 'Open chat' } }), 201); ok(await call(CM.create, A, { body: { kind: 'question', title: 'Q?', content: 'q' } }), 201); ok(await call(CM.create, A, { body: { kind: 'collaboration', title: 'Team', content: 'c', skills_needed: 'JS', max_members: 4 } }), 201);
  for (const k of meta.kinds) { const l = ok(await call(CM.list, A, { query: { kind: k } })); assert.ok(l.posts.length >= 1, k); assert.ok(l.posts.every(p => p.kind === k), k); }
  assert.ok(ok(await call(CM.list, A, { query: { kind: 'resource' } })).posts.some(p => p.id === R.id));
  // comments, likes, search work on the new types
  ok(await call(CM.addComment, B, { params: { id: R.id }, body: { body: 'Thanks!' } }), 201);
  assert.equal(ok(await call(CM.likePost, B, { params: { id: N.id } })).liked, true);
  assert.equal(ok(await call(CM.get, A, { params: { id: R.id } })).comments.length, 1);
  assert.ok(ok(await call(CM.list, A, { query: { q: 'Hackathon' } })).posts.some(p => p.id === N.id));
  // edit: only the author, link validated, type immutable
  fail(await call(CM.update, B, { params: { id: R.id }, body: { title: 'hijack' } }), 403);
  fail(await call(CM.update, A, { params: { id: R.id }, body: { link_url: '' } }), 400, /link/);
  fail(await call(CM.update, A, { params: { id: R.id }, body: { kind: 'showcase' } }), 400, /cannot be changed/);
  const U = ok(await call(CM.update, A, { params: { id: R.id }, body: { title: 'Free SQL course (updated)', link_url: 'https://example.com/sql2' } })); assert.equal(U.link_url, 'https://example.com/sql2'); assert.ok(U.updated_at);
  // delete cleans up
  ok(await call(CM.remove, A, { params: { id: R.id } })); fail(await call(CM.get, A, { params: { id: R.id } }), 404);
});
