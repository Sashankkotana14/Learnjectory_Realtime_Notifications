// Part 2B HTTP integration tests (real Express app + JWT auth + SQLite). Needs the project dependencies installed (`npm install`).
// These complement tests/part2b.unit.test.js, which exercises the same controllers directly with mock req/res.
const os = require('os'), path = require('path'), fs = require('fs'), stamp = Date.now() + '_' + process.pid;
process.env.NODE_ENV = 'test'; process.env.SEED_DEMO = 'false'; process.env.DB_PATH = path.join(os.tmpdir(), `lj_2b_http_${stamp}.db`);
process.env.JWT_SECRET = 'test_secret_' + 'z'.repeat(40); process.env.VAULT_DIR = path.join(os.tmpdir(), `lj_2b_http_vault_${stamp}`); process.env.VAULT_KEY = 'http-test-key-' + 'k'.repeat(20); process.env.VAULT_MAX_MB = '1';
const { test, before, after } = require('node:test'), assert = require('node:assert/strict');
const app = require('../server'), OP = require('../controllers/opportunities'), J = require('../lib/jobSources');
let server, base, A, B;
before(() => new Promise(r => { server = app.listen(0, () => { base = 'http://localhost:' + server.address().port + '/api'; r(); }); }));
after(() => { server.close(); fs.rmSync(process.env.VAULT_DIR, { recursive: true, force: true }); });
const realFetch = global.fetch, FX = n => fs.readFileSync(path.join(__dirname, 'fixtures', n));
const call = async (p, method = 'GET', body, token = A) => { const r = await realFetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const bin = async (p, buf, token = A) => { const r = await realFetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: buf }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('setup users', async () => {
  A = (await call('/auth/register', 'POST', { name: 'Alice', email: 'a2b@x.com', password: 'password1' }, null)).body.token;
  B = (await call('/auth/register', 'POST', { name: 'Bob', email: 'b2b@x.com', password: 'password2' }, null)).body.token; assert.ok(A && B);
});
test('every Part 2B route rejects anonymous requests with 401 (also uploads)', async () => {
  for (const [m, p] of [['GET', '/opportunities/jobs'], ['GET', '/opportunities/resume'], ['POST', '/opportunities/resume'], ['GET', '/opportunities/saved'], ['GET', '/opportunities/skill-gaps'], ['GET', '/community/posts'], ['POST', '/community/posts'], ['GET', '/community/posts/1'], ['POST', '/community/posts/1/like'],
    ['GET', '/vault'], ['POST', '/vault/notes'], ['POST', '/vault/files'], ['GET', '/vault/files/1/download'], ['DELETE', '/vault/files/1']]) {
    const r = await realFetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: m === 'GET' ? undefined : '{}' }); assert.equal(r.status, 401, m + ' ' + p);
  }
});
test('existing generic routes still work and the new /vault route takes precedence over /:res', async () => {
  assert.equal((await call('/goals')).status, 200); assert.ok(Array.isArray((await call('/opportunities')).body), 'legacy generic list is untouched');
  const v = await call('/vault'); assert.equal(v.status, 200); assert.ok(Array.isArray(v.body.notes) && Array.isArray(v.body.files) && v.body.usage);
});
test('vault over HTTP: notes isolation, raw file upload, download, cross-user access, validation, size limit', async () => {
  const n = (await call('/vault/notes', 'POST', { title: 'Private', content: 'secret', tags: 'a' })).body; assert.ok(n.id);
  assert.equal((await call('/vault', 'GET', null, B)).body.notes.length, 0); assert.equal((await call('/vault/notes/' + n.id, 'PUT', { title: 'x' }, B)).status, 404); assert.equal((await call('/vault/notes/' + n.id, 'DELETE', null, B)).status, 404);
  const up = await bin('/vault/files?name=' + encodeURIComponent('my photo.png') + '&category=Pics&tags=one,two', PNG); assert.equal(up.status, 201, JSON.stringify(up.body)); assert.equal(up.body.original_name, 'my photo.png'); assert.deepEqual(up.body.tags_list, ['one', 'two']);
  const dl = await realFetch(base + `/vault/files/${up.body.id}/download`, { headers: { Authorization: 'Bearer ' + A } }); assert.equal(dl.status, 200); assert.equal(dl.headers.get('content-type'), 'image/png'); assert.equal(dl.headers.get('x-content-type-options'), 'nosniff'); assert.ok(Buffer.from(await dl.arrayBuffer()).equals(PNG));
  assert.equal((await realFetch(base + `/vault/files/${up.body.id}/download`, { headers: { Authorization: 'Bearer ' + B } })).status, 404);
  assert.equal((await call('/vault/files/' + up.body.id, 'DELETE', null, B)).status, 404);
  assert.equal((await bin('/vault/files?name=evil.exe', Buffer.from('MZ'))).status, 415); assert.equal((await bin('/vault/files?name=fake.pdf', PNG)).status, 415);
  const big = await bin('/vault/files?name=big.pdf', Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(3 * 1024 * 1024)])); assert.equal(big.status, 413); assert.match(big.body.error, /large/i);
  assert.equal((await call('/vault/files/' + up.body.id, 'DELETE')).status, 200); assert.equal((await realFetch(base + `/vault/files/${up.body.id}/download`, { headers: { Authorization: 'Bearer ' + A } })).status, 404);
});
test('error handling: oversized JSON -> 413, malformed JSON -> 400 (never a 500)', async () => {
  assert.equal((await call('/vault/notes', 'POST', { title: 'x', content: 'y'.repeat(200000) })).status, 413);
  const r = await realFetch(base + '/vault/notes', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A }, body: '{bad json' }); assert.equal(r.status, 400);
});
test('community over HTTP: permissions, likes, comments, solved flow', async () => {
  const q = (await call('/community/posts', 'POST', { title: 'What is a closure?', content: 'Explain please', kind: 'question', category: 'Tech' })).body; assert.ok(q.id);
  assert.equal((await call('/community/posts/' + q.id, 'PUT', { content: 'hack' }, B)).status, 403); assert.equal((await call('/community/posts/' + q.id, 'DELETE', null, B)).status, 403);
  assert.equal((await call('/community/posts/' + q.id + '/like', 'POST', null, B)).body.like_count, 1); assert.equal((await call('/community/posts/' + q.id + '/like', 'POST', null, B)).body.like_count, 0);
  const c = (await call('/community/posts/' + q.id + '/comments', 'POST', { body: 'A function plus its scope' }, B)).body; assert.ok(c.id);
  assert.equal((await call('/community/posts/' + q.id + '/solve', 'POST', { comment_id: c.id }, B)).status, 403); assert.equal((await call('/community/posts/' + q.id + '/solve', 'POST', { comment_id: c.id })).body.solved, true);
  assert.equal((await call('/community/comments/' + c.id, 'PUT', { body: 'x' })).status, 403); assert.equal((await call('/community/posts?solved=1', 'GET', null, B)).body.total, 1);
  assert.equal((await call('/community/posts/' + q.id, 'DELETE')).status, 200); assert.equal((await call('/community/posts/' + q.id)).status, 404);
});
test('opportunities over HTTP: resume upload + analysis, isolation, jobs (mocked API shapes) and honest failure mode, saved jobs', async () => {
  assert.equal((await bin('/opportunities/resume?name=cv.docx', Buffer.from('not a docx'))).status, 415);
  const r = await bin('/opportunities/resume?name=' + encodeURIComponent('Jane CV.docx'), FX('sample_resume.docx')); assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.analysis.education.length, 2); assert.ok(r.body.analysis.skills.some(s => s.name === 'React'));
  assert.equal((await call('/opportunities/resume', 'GET', null, B)).body.resume, null);
  J._clearCache(); OP._setFetch(async url => ({ ok: true, json: async () => (String(url).includes('remotive') ? { jobs: [{ id: 5, url: 'https://remotive.com/remote-jobs/x-5', title: 'React Developer', company_name: 'Acme', tags: ['react'], description: '<p>React and TypeScript</p>', candidate_required_location: 'Worldwide', publication_date: new Date().toISOString() }] } : { data: [] }) }));
  const j = await call('/opportunities/jobs?q=react'); assert.equal(j.status, 200); assert.equal(j.body.total, 1); assert.deepEqual(j.body.jobs[0].match.missing.map(m => m.name), ['TypeScript']);
  const s = await call('/opportunities/saved', 'POST', j.body.jobs[0]); assert.equal(s.status, 201); assert.equal((await call('/opportunities/saved', 'POST', j.body.jobs[0])).status, 409);
  assert.equal((await call('/opportunities/saved/' + s.body.id, 'PUT', { status: 'applied' }, B)).status, 404); assert.equal((await call('/opportunities/saved/' + s.body.id, 'PUT', { status: 'applied' })).body.status, 'applied');
  J._clearCache(); OP._setFetch(async () => { throw new Error('offline'); }); const off = await call('/opportunities/jobs?q=react'); assert.equal(off.body.total, 0); assert.ok(off.body.note && off.body.external_links.length > 3);
  OP._setFetch(realFetch);
});
