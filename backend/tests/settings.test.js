// Settings module tests: real controller + real SQLite (temp DB), mock req/res.   cd backend && npm run test:settings
const os = require('os'), path = require('path'), fs = require('fs'), stamp = Date.now() + '_' + process.pid;
process.env.NODE_ENV = 'test'; process.env.SEED_DEMO = 'false'; process.env.DB_PATH = path.join(os.tmpdir(), `lj_set_${stamp}.db`);
process.env.VAULT_DIR = path.join(os.tmpdir(), `lj_set_vault_${stamp}`);
const { test, after } = require('node:test'), assert = require('node:assert/strict');
// when the real bcryptjs is absent the shim is used; give it a deterministic fake so password checks can be exercised
const bc = require('bcryptjs'); let shim = false; try { bc.hashSync('x', 4); } catch { shim = true; } if (shim) { bc.hashSync = p => 'h:' + p; bc.compareSync = (p, h) => h === 'h:' + p; }
const db = require('../database/db'), S = require('../controllers/settings'), V = require('../lib/vaultStore');
after(() => { try { db.close && db.close(); } catch { /* ignore */ } for (const s of ['', '-wal', '-shm']) fs.rmSync(process.env.DB_PATH + s, { force: true }); fs.rmSync(process.env.VAULT_DIR, { recursive: true, force: true }); });

const mk = (n, pw = 'password1') => db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(n, n.toLowerCase() + '@set.local', bc.hashSync(pw, 4)).lastInsertRowid;
const call = (fn, uid, body = {}) => { let out = { headers: {} }; fn({ user: { id: uid }, body, query: {}, params: {} }, { set(h) { Object.assign(out.headers, h); return this; }, status(c) { this.c = c; return this; }, json(b) { out.status = this.c || 200; out.body = b; }, send(b) { out.status = this.c || 200; out.body = b; }, end(b) { out.status = this.c || 200; out.raw = b; } }); return out; };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const A = mk('Alice'), B = mk('Bob');

test('profile: defaults, edit name/bio, validation, isolation', () => {
  let p = call(S.getProfile, A).body; assert.equal(p.name, 'Alice'); assert.equal(p.theme, 'dark'); assert.equal(p.notifications, 1); assert.equal(p.has_avatar, false); assert.ok(!('password' in p));
  p = call(S.updateProfile, A, { name: '  Alice   Wonder ', bio: ' Hello there ' }).body; assert.equal(p.name, 'Alice Wonder'); assert.equal(p.bio, 'Hello there');
  assert.equal(call(S.updateProfile, A, { name: '   ' }).status, 400);
  assert.equal(call(S.updateProfile, A, { name: 'x'.repeat(81) }).status, 400);
  assert.equal(call(S.updateProfile, A, { bio: 'x'.repeat(501) }).status, 400);
  assert.equal(call(S.updateProfile, A, { bio: '' }).body.bio, '');
  assert.equal(call(S.getProfile, A).body.name, 'Alice Wonder'); assert.equal(call(S.getProfile, B).body.name, 'Bob');
  assert.equal(call(S.updateProfile, A, {}).body.name, 'Alice Wonder'); // empty update changes nothing
});

test('email change needs the current password, a valid address and a unique one', () => {
  assert.equal(call(S.updateProfile, A, { email: 'new@set.local' }).status, 401);
  assert.equal(call(S.updateProfile, A, { email: 'new@set.local', currentPassword: 'wrong' }).status, 401);
  assert.equal(call(S.updateProfile, A, { email: 'not-an-email', currentPassword: 'password1' }).status, 400);
  assert.equal(call(S.updateProfile, A, { email: 'BOB@set.local', currentPassword: 'password1' }).status, 409);
  const ok = call(S.updateProfile, A, { email: 'New@Set.Local', currentPassword: 'password1' }); assert.equal(ok.status, 200); assert.equal(ok.body.email, 'new@set.local');
  assert.equal(call(S.updateProfile, A, { email: 'new@set.local', name: 'Alice W' }).body.name, 'Alice W'); // unchanged email needs no password
});

test('preferences: theme light/dark/system + notifications persist; bad values rejected', () => {
  for (const t of ['light', 'system', 'dark']) { assert.equal(call(S.updatePreferences, A, { theme: t }).body.theme, t); assert.equal(call(S.getProfile, A).body.theme, t); }
  assert.equal(call(S.updatePreferences, A, { theme: 'neon' }).status, 400);
  assert.equal(call(S.updatePreferences, A, { notifications: 0 }).body.notifications, 0);
  assert.equal(call(S.updatePreferences, A, { theme: 'light' }).body.notifications, 0); // untouched field kept
  assert.equal(call(S.getProfile, B).body.theme, 'dark'); // other user unaffected
  assert.equal(db.prepare('SELECT theme FROM user_settings WHERE user_id=?').get(A).theme, 'light'); // same column the original /settings uses
});

test('avatar: upload, replace, serve, remove, validation, isolation', () => {
  assert.equal(call(S.getAvatar, A).status, 404);
  assert.equal(call(S.uploadAvatar, A, Buffer.alloc(0)).status, 400);
  assert.equal(call(S.uploadAvatar, A, Buffer.from('<svg onload=alert(1)></svg>' + ' '.repeat(40))).status, 415);
  assert.equal(call(S.uploadAvatar, A, Buffer.from('GIF89a'.padEnd(5, 'x'))).status, 415); // too short / not real
  assert.equal(call(S.uploadAvatar, A, Buffer.concat([JPG, Buffer.alloc(2 * 1024 * 1024)])).status, 413);
  let r = call(S.uploadAvatar, A, PNG); assert.equal(r.status, 200); assert.equal(r.body.has_avatar, true);
  let g = call(S.getAvatar, A); assert.equal(g.headers['Content-Type'], 'image/png'); assert.ok(Buffer.from(g.raw).equals(PNG)); assert.equal(g.headers['X-Content-Type-Options'], 'nosniff');
  call(S.uploadAvatar, A, JPG); g = call(S.getAvatar, A); assert.equal(g.headers['Content-Type'], 'image/jpeg'); assert.equal(db.prepare('SELECT COUNT(*) n FROM user_avatars WHERE user_id=?').get(A).n, 1);
  assert.equal(call(S.getAvatar, B).status, 404); // Bob cannot see Alice's photo
  assert.equal(call(S.removeAvatar, A).body.has_avatar, false); assert.equal(call(S.getAvatar, A).status, 404);
  assert.equal(call(S.removeAvatar, A).status, 200); // removing twice is fine
});

test('sign out everywhere bumps token_version', () => {
  const before = db.prepare('SELECT COALESCE(token_version,0) v FROM users WHERE id=?').get(A).v;
  assert.equal(call(S.signOutEverywhere, A).body.ok, true);
  assert.equal(db.prepare('SELECT COALESCE(token_version,0) v FROM users WHERE id=?').get(A).v, before + 1);
  assert.equal(db.prepare('SELECT COALESCE(token_version,0) v FROM users WHERE id=?').get(B).v, 0);
});

const ins = (t, uid, o) => { const k = Object.keys(o); return db.prepare(`INSERT INTO ${t}(user_id,${k}) VALUES(?,${k.map(() => '?')})`).run(uid, ...Object.values(o)).lastInsertRowid; };
test('export contains only the caller\'s data, no password hash, no stored file names', () => {
  ins('goals', A, { title: 'Alice goal' }); ins('goals', B, { title: 'Bob goal' });
  const stored = V.save(A, Buffer.from('%PDF-1.4 hello')); ins('vault_files', A, { original_name: 'a.pdf', stored_name: stored, mime: 'application/pdf', ext: 'pdf', size: 14 });
  const r = call(S.exportData, A); assert.match(r.headers['Content-Disposition'], /attachment/);
  const j = JSON.parse(r.body); assert.equal(j.profile.email, 'new@set.local');
  assert.deepEqual(j.data.goals.map(g => g.title), ['Alice goal']);
  assert.ok(!r.body.includes('Bob goal')); assert.ok(!r.body.includes('password')); assert.ok(!r.body.includes(stored)); assert.equal(j.data.vault_files.length, 1);
});

test('delete account: needs DELETE + password; removes only that user and their files; keeps others intact', () => {
  const C = mk('Carol'), D = mk('Dave');
  ins('goals', C, { title: 'Carol goal' }); ins('goals', D, { title: 'Dave goal' });
  const stored = V.save(C, Buffer.from('%PDF-1.4 carol')); ins('vault_files', C, { original_name: 'c.pdf', stored_name: stored, mime: 'application/pdf', ext: 'pdf', size: 14 });
  call(S.uploadAvatar, C, PNG);
  const post = ins('community_posts', C, { content: 'carol post' }), dpost = ins('community_posts', D, { content: 'dave post' });
  const cm = db.prepare('INSERT INTO community_comments(post_id,user_id,body) VALUES(?,?,?)'); cm.run(post, D, 'dave on carol'); cm.run(dpost, C, 'carol on dave');
  db.prepare("INSERT INTO community_likes(user_id,target_type,target_id) VALUES(?,?,?)").run(D, 'post', post);
  assert.equal(call(S.deleteAccount, C, { password: 'password1' }).status, 400); // missing DELETE
  assert.equal(call(S.deleteAccount, C, { confirm: 'delete', password: 'password1' }).status, 400);
  assert.equal(call(S.deleteAccount, C, { confirm: 'DELETE', password: 'nope' }).status, 401);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users WHERE id=?').get(C).n, 1); // nothing deleted by failed attempts
  assert.equal(call(S.deleteAccount, C, { confirm: 'DELETE', password: 'password1' }).body.ok, true);
  const n = (t, w, ...a) => db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE ${w}`).get(...a).n;
  assert.equal(n('users', 'id=?', C), 0); assert.equal(n('goals', 'user_id=?', C), 0); assert.equal(n('user_avatars', 'user_id=?', C), 0); assert.equal(n('user_settings', 'user_id=?', C), 0); assert.equal(n('vault_files', 'user_id=?', C), 0);
  assert.equal(n('community_posts', 'id=?', post), 0); assert.equal(n('community_comments', 'post_id=?', post), 0); assert.equal(n('community_likes', "target_type='post' AND target_id=?", post), 0);
  assert.equal(n('community_comments', 'user_id=?', C), 0);
  assert.throws(() => V.load(C, stored)); // encrypted file gone from disk
  assert.equal(n('users', 'id=?', D), 1); assert.equal(n('goals', 'user_id=?', D), 1); assert.equal(n('community_posts', 'id=?', dpost), 1); // Dave untouched
  assert.equal(n('users', 'id=?', A), 1); assert.equal(n('goals', 'user_id=?', A), 1);
});

test('schema is additive and idempotent; original settings endpoints still work', t => {
  require('../controllers/settings');
  assert.deepEqual(db.prepare('PRAGMA table_info(user_settings)').all().map(c => c.name), ['user_id', 'notifications', 'theme']); // existing table untouched
  let A2; try { A2 = require('../controllers/auth'); } catch { return t.skip('jsonwebtoken not installed here (runs with the real dependencies)'); }
  const g = call(A2.getSettings, B).body; assert.equal(g.name, 'Bob'); assert.equal(g.theme, 'dark');
  assert.equal(call(A2.putSettings, B, { name: 'Bobby', notifications: 0 }).body.name, 'Bobby');
});

test('academic profile + username: save, persist, validate, unique, isolation', () => {
  const C = mk('Cora'), D = mk('Dana');
  let p = call(S.getProfile, C).body; assert.equal(p.username, ''); assert.equal(p.college, ''); assert.equal(p.year_of_study, '');
  p = call(S.updateProfile, C, { username: 'Cora_99', college: '  MIT  ', course: 'B.Tech', branch: 'Computer   Science', year_of_study: '3' }).body;
  assert.deepEqual([p.username, p.college, p.course, p.branch, p.year_of_study], ['Cora_99', 'MIT', 'B.Tech', 'Computer Science', '3']);
  p = call(S.getProfile, C).body; assert.equal(p.college, 'MIT'); assert.equal(p.year_of_study, '3'); // persisted
  assert.equal(call(S.updateProfile, C, { name: 'Cora Z' }).body.branch, 'Computer Science'); // untouched fields kept
  assert.equal(call(S.updateProfile, D, { username: 'cora_99' }).status, 409); // case-insensitive unique
  assert.equal(call(S.updateProfile, C, { username: 'Cora_99' }).status, 200); // own username again is fine
  assert.equal(call(S.updateProfile, D, { username: 'a b' }).status, 400);
  assert.equal(call(S.updateProfile, D, { username: 'ab' }).status, 400);
  assert.equal(call(S.updateProfile, D, { college: 'x'.repeat(121) }).status, 400);
  assert.equal(call(S.updateProfile, D, { year_of_study: '99' }).status, 400);
  assert.equal(call(S.getProfile, D).body.college, ''); // isolation
  assert.equal(call(S.updateProfile, C, { username: '', year_of_study: '' }).body.username, ''); // can be cleared
  assert.equal(call(S.updateProfile, D, { username: 'Cora_99' }).status, 200); // freed
  assert.equal(call(S.getProfile, C).body.email, 'cora@set.local'); // real account email
});
