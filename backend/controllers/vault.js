// My Vault: private notes, folders, categories/tags, saved links and encrypted file uploads. Everything is scoped to req.user.id;
// files can only be read through the authenticated download route, which re-checks ownership on every request.
const db = require('../database/db'), V = require('../lib/vaultStore'), J = require('../lib/jobSources');
const one = (s, ...a) => db.prepare(s).get(...a), all = (s, ...a) => db.prepare(s).all(...a);
const log = (uid, m) => db.prepare('INSERT INTO activity_logs(user_id,message) VALUES(?,?)').run(uid, m);
const bad = (res, error, status = 400) => res.status(status).json({ error });
const tagList = s => String(s || '').split(',').map(t => t.trim()).filter(Boolean);
const norm = s => String(s ?? '').trim().replace(/\s+/g, ' ');
function cleanTags(v) {
  const seen = new Set(), out = [];
  for (const t of (Array.isArray(v) ? v.map(String) : String(v || '').split(','))) { const x = norm(t).replace(/^#/, ''); if (!x) continue; if (x.length > 30) return { error: 'each tag must be 30 characters or less' }; if (!seen.has(x.toLowerCase())) { seen.add(x.toLowerCase()); out.push(x); } }
  return out.length > 10 ? { error: 'at most 10 tags allowed' } : { value: out.join(',') };
}
// shared field cleaning for folder_id / category / tags; returns {out} or {error}
function common(uid, b, out) {
  if (b.folder_id !== undefined) {
    if (b.folder_id === null || b.folder_id === '' || b.folder_id === 'none') out.folder_id = null;
    else { const f = one('SELECT id FROM vault_folders WHERE id=? AND user_id=?', Number(b.folder_id), uid); if (!f) return { error: 'Folder not found' }; out.folder_id = f.id; }
  }
  if (b.category !== undefined) { const c = norm(b.category); if (c.length > 40) return { error: 'category must be 40 characters or less' }; out.category = c; }
  if (b.tags !== undefined) { const t = cleanTags(b.tags); if (t.error) return { error: t.error }; out.tags = t.value; }
  return { out };
}
const decorate = (r, kind) => ({ ...r, kind, tags_list: tagList(r.tags), pinned: !!r.pinned });
const publicFile = f => { const { stored_name, ...rest } = f; return { ...decorate(rest, 'file'), preview: !!(V.TYPES[f.ext] || {}).preview, type_kind: (V.TYPES[f.ext] || {}).kind }; };
const usage = uid => { const r = one('SELECT COUNT(*) n, COALESCE(SUM(size),0) b FROM vault_files WHERE user_id=?', uid), l = V.limits(); return { files: r.n, bytes: r.b, quota_bytes: l.quotaBytes, max_file_bytes: l.maxFileBytes, allowed_types: l.allowed }; };

// ---------- overview / search ----------
exports.overview = (req, res) => {
  const uid = req.user.id, q = String(req.query.q || '').trim().toLowerCase().slice(0, 100), tag = String(req.query.tag || '').trim().toLowerCase(), cat = String(req.query.category || '').trim().toLowerCase();
  const type = ['notes', 'files', 'links'].includes(req.query.type) ? req.query.type : 'all', fid = req.query.folder_id;
  let notes = all('SELECT * FROM vault WHERE user_id=?', uid).map(r => decorate({ ...r, content: r.content || '' }, 'note')), files = all('SELECT * FROM vault_files WHERE user_id=?', uid).map(publicFile), links = all('SELECT * FROM vault_links WHERE user_id=?', uid).map(r => decorate(r, 'link'));
  const folders = all('SELECT * FROM vault_folders WHERE user_id=? ORDER BY lower(name)', uid).map(f => ({ ...f, count: [...notes, ...files, ...links].filter(x => x.folder_id === f.id).length }));
  const categories = {}, tags = {}; for (const x of [...notes, ...files, ...links]) { if (x.category) categories[x.category] = (categories[x.category] || 0) + 1; for (const t of x.tags_list) tags[t.toLowerCase()] = (tags[t.toLowerCase()] || 0) + 1; }
  const keep = x => {
    if (fid === 'none' ? x.folder_id !== null : fid ? x.folder_id !== Number(fid) : false) return false;
    if (cat && (x.category || '').toLowerCase() !== cat) return false;
    if (tag && !x.tags_list.some(t => t.toLowerCase() === tag)) return false;
    if (q && !`${x.title || ''} ${x.original_name || ''} ${x.content || ''} ${x.description || ''} ${x.notes || ''} ${x.url || ''} ${x.category || ''} ${x.tags || ''}`.toLowerCase().includes(q)) return false;
    return true;
  };
  const dir = req.query.dir === 'asc' ? 1 : -1, key = { name: x => (x.title || x.original_name || '').toLowerCase(), size: x => x.size || 0, created: x => x.created_at || '' }[req.query.sort] || (x => x.updated_at || x.created_at || '');
  const sort = arr => arr.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * dir || b.id - a.id);
  notes = type === 'all' || type === 'notes' ? sort(notes.filter(keep)) : []; files = type === 'all' || type === 'files' ? sort(files.filter(keep)) : []; links = type === 'all' || type === 'links' ? sort(links.filter(keep)) : [];
  res.json({ notes, files, links, folders, categories: Object.entries(categories).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)), tags: Object.entries(tags).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)), usage: usage(uid) });
};

// ---------- notes ----------
function parseNote(uid, b, old) {
  const out = {};
  if (b.title !== undefined || !old) { const t = norm(b.title).slice(0, 200); if (!t) return { error: 'title is required' }; out.title = t; }
  if (b.content !== undefined) { const c = String(b.content ?? ''); if (c.length > 20000) return { error: 'A note can hold up to 20,000 characters' }; out.content = c; } else if (!old) out.content = '';
  if (b.pinned !== undefined) out.pinned = b.pinned ? 1 : 0;
  const c = common(uid, b, out); return c.error ? c : { out };
}
exports.createNote = (req, res) => {
  const { out, error } = parseNote(req.user.id, req.body || {}, null); if (error) return bad(res, error);
  const k = Object.keys(out), id = db.prepare(`INSERT INTO vault(user_id,${k},updated_at) VALUES(?,${k.map(() => '?')},CURRENT_TIMESTAMP)`).run(req.user.id, ...k.map(c => out[c])).lastInsertRowid;
  log(req.user.id, `Added note "${out.title.slice(0, 40)}" - Vault`); res.status(201).json(decorate(one('SELECT * FROM vault WHERE id=?', id), 'note'));
};
exports.updateNote = (req, res) => {
  const old = one('SELECT * FROM vault WHERE id=? AND user_id=?', Number(req.params.id), req.user.id); if (!old) return bad(res, 'Note not found', 404);
  const { out, error } = parseNote(req.user.id, req.body || {}, old); if (error) return bad(res, error);
  const k = Object.keys(out); if (k.length) db.prepare(`UPDATE vault SET ${k.map(c => c + '=?')},updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`).run(...k.map(c => out[c]), old.id, req.user.id);
  res.json(decorate(one('SELECT * FROM vault WHERE id=?', old.id), 'note'));
};
exports.removeNote = (req, res) => {
  const old = one('SELECT * FROM vault WHERE id=? AND user_id=?', Number(req.params.id), req.user.id); if (!old) return bad(res, 'Note not found', 404);
  db.prepare('DELETE FROM vault WHERE id=? AND user_id=?').run(old.id, req.user.id); log(req.user.id, `Deleted note "${(old.title || '').slice(0, 40)}" - Vault`); res.json({ ok: true });
};

// ---------- folders (deleting a folder keeps its items; they move to "Unfiled") ----------
const folderName = b => { const n = norm(b.name); return !n ? { error: 'name is required' } : n.length > 50 ? { error: 'name must be 50 characters or less' } : { n }; };
exports.createFolder = (req, res) => {
  const { n, error } = folderName(req.body || {}); if (error) return bad(res, error);
  if (one('SELECT id FROM vault_folders WHERE user_id=? AND lower(name)=lower(?)', req.user.id, n)) return bad(res, 'A folder with this name already exists', 409);
  const id = db.prepare('INSERT INTO vault_folders(user_id,name) VALUES(?,?)').run(req.user.id, n).lastInsertRowid; res.status(201).json(one('SELECT * FROM vault_folders WHERE id=?', id));
};
exports.updateFolder = (req, res) => {
  const f = one('SELECT * FROM vault_folders WHERE id=? AND user_id=?', Number(req.params.id), req.user.id); if (!f) return bad(res, 'Folder not found', 404);
  const { n, error } = folderName(req.body || {}); if (error) return bad(res, error);
  const dup = one('SELECT id FROM vault_folders WHERE user_id=? AND lower(name)=lower(?) AND id<>?', req.user.id, n, f.id); if (dup) return bad(res, 'A folder with this name already exists', 409);
  db.prepare('UPDATE vault_folders SET name=? WHERE id=? AND user_id=?').run(n, f.id, req.user.id); res.json(one('SELECT * FROM vault_folders WHERE id=?', f.id));
};
exports.removeFolder = (req, res) => {
  const f = one('SELECT * FROM vault_folders WHERE id=? AND user_id=?', Number(req.params.id), req.user.id); if (!f) return bad(res, 'Folder not found', 404);
  for (const t of ['vault', 'vault_files', 'vault_links']) db.prepare(`UPDATE ${t} SET folder_id=NULL WHERE folder_id=? AND user_id=?`).run(f.id, req.user.id);
  db.prepare('DELETE FROM vault_folders WHERE id=? AND user_id=?').run(f.id, req.user.id); res.json({ ok: true });
};

// ---------- links ----------
function parseLink(uid, b, old) {
  const out = {};
  if (b.title !== undefined || !old) { const t = norm(b.title).slice(0, 200); if (!t) return { error: 'title is required' }; out.title = t; }
  if (b.url !== undefined || !old) { const u = String(b.url ?? '').trim(); if (!J.okUrl(u) || u.length > 1000) return { error: 'url must be a valid http(s) link' }; out.url = u; }
  if (b.notes !== undefined) out.notes = String(b.notes ?? '').slice(0, 2000);
  const c = common(uid, b, out); return c.error ? c : { out };
}
exports.createLink = (req, res) => {
  const { out, error } = parseLink(req.user.id, req.body || {}, null); if (error) return bad(res, error);
  const k = Object.keys(out), id = db.prepare(`INSERT INTO vault_links(user_id,${k},updated_at) VALUES(?,${k.map(() => '?')},CURRENT_TIMESTAMP)`).run(req.user.id, ...k.map(c => out[c])).lastInsertRowid;
  res.status(201).json(decorate(one('SELECT * FROM vault_links WHERE id=?', id), 'link'));
};
exports.updateLink = (req, res) => {
  const old = one('SELECT * FROM vault_links WHERE id=? AND user_id=?', Number(req.params.id), req.user.id); if (!old) return bad(res, 'Link not found', 404);
  const { out, error } = parseLink(req.user.id, req.body || {}, old); if (error) return bad(res, error);
  const k = Object.keys(out); if (k.length) db.prepare(`UPDATE vault_links SET ${k.map(c => c + '=?')},updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`).run(...k.map(c => out[c]), old.id, req.user.id);
  res.json(decorate(one('SELECT * FROM vault_links WHERE id=?', old.id), 'link'));
};
exports.removeLink = (req, res) => {
  const r = db.prepare('DELETE FROM vault_links WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id);
  if (!r.changes) return bad(res, 'Link not found', 404); res.json({ ok: true });
};

// ---------- files ----------
exports.uploadFile = (req, res) => {
  const uid = req.user.id, v = V.validate(req.body, req.query.name); if (!v.ok) return bad(res, v.error, v.status);
  const u = usage(uid); if (u.bytes + req.body.length > u.quota_bytes) return bad(res, `Vault storage limit reached (${Math.round(u.quota_bytes / V.MB)} MB). Delete some files first.`, 413);
  const meta = {}, c = common(uid, { folder_id: req.query.folder_id, category: req.query.category, tags: req.query.tags }, meta); if (c.error) return bad(res, c.error);
  const description = String(req.query.description || '').slice(0, 500);
  const stored = V.save(uid, req.body);
  try {
    const id = db.prepare('INSERT INTO vault_files(user_id,folder_id,original_name,stored_name,mime,ext,size,category,tags,description,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)')
      .run(uid, meta.folder_id ?? null, v.name, stored, v.type.mime, v.ext, req.body.length, meta.category || '', meta.tags || '', description).lastInsertRowid;
    log(uid, `Uploaded "${v.name.slice(0, 40)}" - Vault`); res.status(201).json(publicFile(one('SELECT * FROM vault_files WHERE id=?', id)));
  } catch (e) { V.remove(uid, stored); throw e; }
};
exports.downloadFile = (req, res) => {
  const f = one('SELECT * FROM vault_files WHERE id=? AND user_id=?', Number(req.params.id), req.user.id); if (!f) return bad(res, 'File not found', 404); // another user's file looks exactly like a missing one
  let data; try { data = V.load(req.user.id, f.stored_name); } catch { return bad(res, 'This file could not be read from storage', 500); }
  const inline = req.query.inline === '1' && (V.TYPES[f.ext] || {}).preview;
  res.set({ 'Content-Type': f.mime, 'Content-Length': String(data.length), 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.original_name)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; sandbox" });
  res.status(200).send(data);
};
exports.updateFile = (req, res) => {
  const f = one('SELECT * FROM vault_files WHERE id=? AND user_id=?', Number(req.params.id), req.user.id); if (!f) return bad(res, 'File not found', 404);
  const b = req.body || {}, out = {};
  if (b.name !== undefined) { const n = V.sanitizeName(b.name); if (!n || V.extOf(n) !== f.ext) return bad(res, `The new name must keep the .${f.ext} extension`); out.original_name = n; }
  if (b.description !== undefined) out.description = String(b.description ?? '').slice(0, 500);
  const c = common(req.user.id, b, out); if (c.error) return bad(res, c.error);
  const k = Object.keys(out); if (k.length) db.prepare(`UPDATE vault_files SET ${k.map(x => x + '=?')},updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`).run(...k.map(x => out[x]), f.id, req.user.id);
  res.json(publicFile(one('SELECT * FROM vault_files WHERE id=?', f.id)));
};
exports.removeFile = (req, res) => {
  const f = one('SELECT * FROM vault_files WHERE id=? AND user_id=?', Number(req.params.id), req.user.id); if (!f) return bad(res, 'File not found', 404);
  db.prepare('DELETE FROM vault_files WHERE id=? AND user_id=?').run(f.id, req.user.id); V.remove(req.user.id, f.stored_name);
  log(req.user.id, `Deleted file "${f.original_name.slice(0, 40)}" - Vault`); res.json({ ok: true });
};
