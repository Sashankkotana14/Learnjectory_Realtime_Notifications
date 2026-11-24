// File validation + encrypted per-user storage for My Vault (and resume type checks).
// - Type is decided by BOTH the extension and the file's real content (magic bytes), so renaming a .exe to .pdf is rejected.
// - Files are stored under random names, in a per-user folder, AES-256-GCM encrypted (key from VAULT_KEY or an auto-generated key file).
// - Nothing is ever served statically; the only way to read a file is the authenticated download route, which checks ownership.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zip = require('./zip');
const TYPES = {
  pdf: { mime: 'application/pdf', kind: 'pdf', preview: true }, docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'document' },
  ppt: { mime: 'application/vnd.ms-powerpoint', kind: 'presentation' }, pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'presentation' },
  png: { mime: 'image/png', kind: 'image', preview: true }, jpg: { mime: 'image/jpeg', kind: 'image', preview: true }, jpeg: { mime: 'image/jpeg', kind: 'image', preview: true },
  gif: { mime: 'image/gif', kind: 'image', preview: true }, webp: { mime: 'image/webp', kind: 'image', preview: true },
};
const MB = 1024 * 1024, num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const limits = () => ({ maxFileBytes: num(process.env.VAULT_MAX_MB, 10) * MB, quotaBytes: num(process.env.VAULT_QUOTA_MB, 200) * MB, allowed: Object.keys(TYPES) });
const dir = () => process.env.VAULT_DIR || path.join(__dirname, '..', 'storage', 'vault');
const extOf = name => (path.extname(String(name || '')).slice(1) || '').toLowerCase();
// strip any path, control characters and characters that are unsafe in file names; keep the readable name for display only (never used on disk)
function sanitizeName(name) {
  let n = String(name || '').replace(/\\/g, '/').split('/').pop().replace(/[\u0000-\u001f\u007f"<>|?*:]/g, '').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  return n.slice(-150);
}
function sniff(buf, ext) {
  const b = buf, starts = (...bytes) => bytes.every((x, i) => b[i] === x);
  switch (ext) {
    case 'pdf': return b.subarray(0, 1024).includes('%PDF-');
    case 'png': return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'jpg': case 'jpeg': return starts(0xff, 0xd8, 0xff);
    case 'gif': return b.subarray(0, 6).toString('latin1') === 'GIF87a' || b.subarray(0, 6).toString('latin1') === 'GIF89a';
    case 'webp': return b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
    case 'docx': case 'pptx': { if (!starts(0x50, 0x4b, 0x03, 0x04)) return false; try { const n = zip.names(b); return n.includes(ext === 'docx' ? 'word/document.xml' : 'ppt/presentation.xml') && n.includes('[Content_Types].xml'); } catch { return false; } }
    case 'ppt': return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1) && b.includes(Buffer.from('PowerPoint Document', 'utf16le'));
    default: return false;
  }
}
// -> { ok, ext, type } or { ok:false, error }
function validate(buf, filename, maxBytes = limits().maxFileBytes) {
  if (!Buffer.isBuffer(buf) || !buf.length) return { ok: false, status: 400, error: 'No file received (empty upload)' };
  const name = sanitizeName(filename), ext = extOf(name);
  if (!name) return { ok: false, status: 400, error: 'A file name is required' };
  if (!TYPES[ext]) return { ok: false, status: 415, error: `File type .${ext || '?'} is not allowed. Allowed: ${Object.keys(TYPES).map(e => '.' + e).join(', ')}` };
  if (buf.length > maxBytes) return { ok: false, status: 413, error: `File is too large (max ${Math.round(maxBytes / MB)} MB)` };
  if (!sniff(buf, ext)) return { ok: false, status: 415, error: `The content of this file does not match a real .${ext} file` };
  return { ok: true, name, ext, type: TYPES[ext] };
}
// ---- encryption at rest ----
let keyCache = null;
function key() {
  if (keyCache && keyCache.dir === dir() && keyCache.env === process.env.VAULT_KEY) return keyCache.k;
  let k;
  if (process.env.VAULT_KEY) k = crypto.scryptSync(process.env.VAULT_KEY, 'learnjectory-vault-v1', 32);
  else {
    const f = path.join(dir(), '.vault.key'); fs.mkdirSync(dir(), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    k = Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'hex');
  }
  keyCache = { k, dir: dir(), env: process.env.VAULT_KEY }; return k;
}
const SAFE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.bin$/, MAGIC = Buffer.from('LJV1');
const where = (uid, stored) => { if (!SAFE.test(stored) || !Number.isInteger(Number(uid))) throw new Error('invalid storage name'); return path.join(dir(), String(Number(uid)), stored); };
function save(uid, buf) {
  const stored = crypto.randomUUID() + '.bin', p = where(uid, stored), iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  c.setAAD(Buffer.from(`${uid}:${stored}`)); const enc = Buffer.concat([c.update(buf), c.final()]);
  fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 }); fs.writeFileSync(p, Buffer.concat([MAGIC, iv, c.getAuthTag(), enc]), { mode: 0o600 });
  return stored;
}
function load(uid, stored) {
  const raw = fs.readFileSync(where(uid, stored));
  if (!raw.subarray(0, 4).equals(MAGIC)) throw new Error('corrupt vault file');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(4, 16)); d.setAAD(Buffer.from(`${uid}:${stored}`)); d.setAuthTag(raw.subarray(16, 32));
  return Buffer.concat([d.update(raw.subarray(32)), d.final()]);
}
const remove = (uid, stored) => { try { fs.unlinkSync(where(uid, stored)); } catch { /* already gone */ } };
module.exports = { TYPES, limits, sanitizeName, extOf, validate, save, load, remove, MB };
