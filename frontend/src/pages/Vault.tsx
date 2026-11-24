import { useEffect, useRef, useState } from 'react';
import { Lock, StickyNote, Link2, FileUp, FolderPlus, Folder, Pencil, Trash2, Search, Download, Eye, X, Pin, FileText, Image as ImageIcon, Presentation, File as FileIcon, ExternalLink } from 'lucide-react';
import { api, upload, fetchBlob, ago } from '../api';

const fmtSize = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B');
const fileIcon = (k: string) => (k === 'image' ? ImageIcon : k === 'presentation' ? Presentation : k === 'pdf' || k === 'document' ? FileText : FileIcon);
const Chip = ({ children, cls = 'bg-white/10' }: any) => <span className={`chip ${cls}`}>{children}</span>;
const blankNote = { title: '', content: '', category: '', tags: '', folder_id: '', pinned: false }, blankLink = { title: '', url: '', category: '', tags: '', notes: '', folder_id: '' };

export default function Vault() {
  const [d, setD] = useState<any>(null), [q, setQ] = useState(''), [type, setType] = useState(''), [folder, setFolder] = useState(''), [cat, setCat] = useState(''), [tag, setTag] = useState(''), [sort, setSort] = useState('updated');
  const [err, setErr] = useState(''), [info, setInfo] = useState(''), [form, setForm] = useState<any>(null), [fm, setFm] = useState<any>(null), [up, setUp] = useState<any>({ category: '', tags: '', folder_id: '' }), [busy, setBusy] = useState(false), file = useRef<HTMLInputElement>(null);
  const load = () => {
    const qs = new URLSearchParams({ sort, ...(q ? { q } : {}), ...(type ? { type } : {}), ...(folder ? { folder_id: folder } : {}), ...(cat ? { category: cat } : {}), ...(tag ? { tag } : {}) });
    return api('/vault?' + qs.toString()).then(setD).catch(e => setErr(e.message));
  };
  useEffect(() => { load(); }, [type, folder, cat, tag, sort]);
  const run = async (fn: () => Promise<any>, ok = '') => { setErr(''); setInfo(''); try { await fn(); await load(); if (ok) setInfo(ok); } catch (x: any) { setErr(x.message); } };
  const folderName = (id: number | null) => d?.folders.find((f: any) => f.id === id)?.name;
  const saveForm = (e: any) => {
    e.preventDefault();
    run(async () => {
      const kind = form.kind, base = kind === 'note' ? 'notes' : kind === 'link' ? 'links' : 'files', { id, ...rest } = form; delete rest.kind;
      const body = { ...rest, folder_id: rest.folder_id === '' ? null : Number(rest.folder_id) };
      id ? await api(`/vault/${base}/${id}`, 'PUT', body) : await api(`/vault/${base}`, 'POST', body); setForm(null);
    });
  };
  const onFiles = async (e: any) => {
    const files: File[] = Array.from(e.target.files || []); if (!files.length) return; setBusy(true); setErr(''); setInfo(''); let n = 0;
    for (const f of files) { try { await upload('/vault/files', f, { category: up.category, tags: up.tags, ...(up.folder_id ? { folder_id: up.folder_id } : {}) }); n++; } catch (x: any) { setErr(`${f.name}: ${x.message}`); } }
    if (file.current) file.current.value = ''; setBusy(false); if (n) setInfo(`${n} file${n > 1 ? 's' : ''} uploaded and encrypted`); await load();
  };
  const dl = async (f: any, inline: boolean) => {
    try { const b = await fetchBlob(`/vault/files/${f.id}/download${inline ? '?inline=1' : ''}`), url = URL.createObjectURL(b);
      if (inline) window.open(url, '_blank'); else { const a = document.createElement('a'); a.href = url; a.download = f.original_name; document.body.appendChild(a); a.click(); a.remove(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (x: any) { setErr(x.message); }
  };
  const U = d?.usage, pct = U ? Math.min(100, Math.round((U.bytes / U.quota_bytes) * 100)) : 0, folderSel = (v: any, set: any) => <select className="inp mt-1" value={v ?? ''} onChange={e => set(e.target.value)}><option value="">Unfiled</option>{d?.folders.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>;
  const Tags = ({ x }: any) => <>{x.category && <Chip cls="bg-indigo-400/20 text-indigo-100">{x.category}</Chip>}{x.tags_list.map((t: string) => <button key={t} className="chip bg-white/10 hover:bg-sky-400/30" onClick={() => setTag(t)}>#{t}</button>)}{x.folder_id && <Chip><Folder className="mr-1 h-3 w-3" />{folderName(x.folder_id)}</Chip>}</>;
  const Actions = ({ x, kind }: any) => <span className="flex gap-2 text-sky-300"><button aria-label="Edit" onClick={() => { setErr(''); setForm(kind === 'file' ? { kind, id: x.id, name: x.original_name, description: x.description, category: x.category, tags: x.tags_list.join(', '), folder_id: x.folder_id ?? '' } : { kind, ...x, tags: x.tags_list.join(', '), folder_id: x.folder_id ?? '' }); }}><Pencil className="h-4 w-4" /></button>
    <button aria-label="Delete" onClick={() => confirm(`Delete "${x.title || x.original_name}"? This cannot be undone.`) && run(() => api(`/vault/${kind}s/${x.id}`, 'DELETE'))}><Trash2 className="h-4 w-4" /></button></span>;
  const empty = d && !d.notes.length && !d.files.length && !d.links.length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="flex items-center gap-2 text-2xl font-extrabold"><Lock className="h-6 w-6 text-sky-300" />My Vault</h1>
        <div className="flex flex-wrap gap-2"><button className="btn !px-4 !py-1.5" onClick={() => { setErr(''); setForm({ kind: 'note', ...blankNote, folder_id: folder && folder !== 'none' ? folder : '' }); }}><StickyNote className="h-4 w-4" />Note</button>
          <button className="btn !px-4 !py-1.5" onClick={() => { setErr(''); setForm({ kind: 'link', ...blankLink }); }}><Link2 className="h-4 w-4" />Link</button>
          <input ref={file} type="file" multiple className="hidden" accept=".pdf,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp" onChange={onFiles} /><button className="btn !px-4 !py-1.5" disabled={busy} onClick={() => file.current?.click()}><FileUp className="h-4 w-4" />{busy ? 'Uploading…' : 'Upload'}</button></div></div>
      <p className="text-xs text-sky-100/60">Private to you. Files are encrypted on the server and can only be opened by your account. Allowed: PDF, DOCX, PPT, PPTX and images (PNG, JPG, GIF, WEBP){U ? ` · max ${fmtSize(U.max_file_bytes)} per file` : ''}.</p>
      {err && <div className="text-sm text-rose-300">{err}</div>}{info && <div className="text-sm text-emerald-300">{info}</div>}
      {U && <div className="card !p-3"><div className="mb-1 flex justify-between text-xs text-sky-100/70"><span>{U.files} file{U.files === 1 ? '' : 's'} · {fmtSize(U.bytes)} of {fmtSize(U.quota_bytes)} used</span><span>{pct}%</span></div><div className="bar"><div style={{ width: pct + '%' }} /></div>
        <div className="mt-2 grid gap-2 text-xs text-sky-200 sm:grid-cols-3"><label>Upload into folder{folderSel(up.folder_id, (v: string) => setUp({ ...up, folder_id: v }))}</label><label>Category for uploads<input className="inp mt-1" maxLength={40} value={up.category} onChange={e => setUp({ ...up, category: e.target.value })} /></label><label>Tags for uploads<input className="inp mt-1" placeholder="comma separated" value={up.tags} onChange={e => setUp({ ...up, tags: e.target.value })} /></label></div></div>}
      {form && <form onSubmit={saveForm} className="card grid gap-3 sm:grid-cols-2">
        <div className="font-bold sm:col-span-2">{form.id ? 'Edit' : 'New'} {form.kind}</div>
        {form.kind === 'file' ? <label className="text-xs text-sky-200 sm:col-span-2">File name<input className="inp mt-1" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          : <label className="text-xs text-sky-200 sm:col-span-2">Title<input className="inp mt-1" required maxLength={200} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>}
        {form.kind === 'note' && <label className="text-xs text-sky-200 sm:col-span-2">Note<textarea className="inp mt-1" rows={8} maxLength={20000} value={form.content || ''} onChange={e => setForm({ ...form, content: e.target.value })} /></label>}
        {form.kind === 'link' && <><label className="text-xs text-sky-200 sm:col-span-2">URL<input className="inp mt-1" required placeholder="https://…" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} /></label><label className="text-xs text-sky-200 sm:col-span-2">Notes<textarea className="inp mt-1" rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></label></>}
        {form.kind === 'file' && <label className="text-xs text-sky-200 sm:col-span-2">Description<input className="inp mt-1" maxLength={500} value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></label>}
        <label className="text-xs text-sky-200">Folder{folderSel(form.folder_id, (v: string) => setForm({ ...form, folder_id: v }))}</label>
        <label className="text-xs text-sky-200">Category<input className="inp mt-1" list="vault-cats" maxLength={40} value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })} /><datalist id="vault-cats">{d?.categories.map((c: any) => <option key={c.name} value={c.name} />)}</datalist></label>
        <label className="text-xs text-sky-200">Tags <span className="text-sky-100/50">(comma separated, max 10)</span><input className="inp mt-1" value={form.tags || ''} onChange={e => setForm({ ...form, tags: e.target.value })} /></label>
        {form.kind === 'note' && <label className="flex items-center gap-2 self-end text-xs text-sky-200"><input type="checkbox" checked={!!form.pinned} onChange={e => setForm({ ...form, pinned: e.target.checked })} />Pin to top</label>}
        <div className="flex gap-2 sm:col-span-2"><button className="btn">Save</button><button type="button" className="btn-ghost" onClick={() => setForm(null)}><X className="h-4 w-4" />Cancel</button></div></form>}
      <div className="grid gap-5 lg:grid-cols-[230px_1fr]">
        <aside className="space-y-4">
          <div className="card !p-3"><div className="mb-2 flex items-center justify-between text-xs font-bold tracking-wider text-sky-300">FOLDERS<button aria-label="New folder" onClick={() => setFm({ name: '' })}><FolderPlus className="h-4 w-4" /></button></div>
            {fm && !fm.id && <form className="mb-2 flex gap-1" onSubmit={e => { e.preventDefault(); run(async () => { await api('/vault/folders', 'POST', { name: fm.name }); setFm(null); }); }}><input autoFocus className="inp !py-1 text-xs" maxLength={50} placeholder="Folder name" value={fm.name} onChange={e => setFm({ ...fm, name: e.target.value })} /><button className="btn !px-3 !py-1 text-xs">Add</button></form>}
            {[['', 'All items'], ['none', 'Unfiled']].map(([k, l]) => <button key={k} onClick={() => setFolder(k)} className={`mb-1 block w-full rounded-lg px-2 py-1 text-left text-sm ${folder === k ? 'bg-sky-500/30' : 'hover:bg-white/5'}`}>{l}</button>)}
            {d?.folders.map((f: any) => fm?.id === f.id
              ? <form key={f.id} className="mb-1 flex gap-1" onSubmit={e => { e.preventDefault(); run(async () => { await api('/vault/folders/' + f.id, 'PUT', { name: fm.name }); setFm(null); }); }}><input autoFocus className="inp !py-1 text-xs" maxLength={50} value={fm.name} onChange={e => setFm({ ...fm, name: e.target.value })} /><button className="btn !px-2 !py-1 text-xs">OK</button></form>
              : <div key={f.id} className={`group mb-1 flex items-center justify-between rounded-lg px-2 py-1 text-sm ${folder === String(f.id) ? 'bg-sky-500/30' : 'hover:bg-white/5'}`}><button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setFolder(String(f.id))}><Folder className="h-4 w-4 shrink-0" /><span className="truncate">{f.name}</span><span className="text-[11px] text-sky-100/50">{f.count}</span></button>
                <span className="flex gap-1 text-sky-300 opacity-70 group-hover:opacity-100"><button aria-label="Rename folder" onClick={() => setFm({ id: f.id, name: f.name })}><Pencil className="h-3 w-3" /></button><button aria-label="Delete folder" onClick={() => confirm(`Delete folder "${f.name}"? Its items are kept and moved to Unfiled.`) && run(async () => { await api('/vault/folders/' + f.id, 'DELETE'); if (folder === String(f.id)) setFolder(''); })}><Trash2 className="h-3 w-3" /></button></span></div>)}</div>
          {d?.categories.length > 0 && <div className="card !p-3"><div className="mb-2 text-xs font-bold tracking-wider text-sky-300">CATEGORIES</div>{d.categories.map((c: any) => <button key={c.name} onClick={() => setCat(cat === c.name ? '' : c.name)} className={`mb-1 block w-full rounded-lg px-2 py-1 text-left text-sm ${cat === c.name ? 'bg-sky-500/30' : 'hover:bg-white/5'}`}>{c.name} <span className="text-[11px] text-sky-100/50">{c.count}</span></button>)}</div>}
          {d?.tags.length > 0 && <div className="card !p-3"><div className="mb-2 text-xs font-bold tracking-wider text-sky-300">TAGS</div><div className="flex flex-wrap gap-1">{d.tags.map((t: any) => <button key={t.name} onClick={() => setTag(tag === t.name ? '' : t.name)} className={`chip ${tag === t.name ? 'bg-sky-500/40' : 'bg-white/10'}`}>#{t.name} · {t.count}</button>)}</div></div>}
        </aside>
        <section className="space-y-4">
          <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); load(); }}>
            <div className="relative min-w-[180px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-sky-300" /><input className="inp pl-9" placeholder="Search titles, notes, file names, tags…" value={q} onChange={e => setQ(e.target.value)} /></div>
            <select className="inp !w-auto" aria-label="Type" value={type} onChange={e => setType(e.target.value)}><option value="">All types</option><option value="notes">Notes</option><option value="files">Files</option><option value="links">Links</option></select>
            <select className="inp !w-auto" aria-label="Sort" value={sort} onChange={e => setSort(e.target.value)}><option value="updated">Recently updated</option><option value="name">Name</option><option value="created">Date added</option><option value="size">Size</option></select>
            <button className="btn">Search</button>{(q || cat || tag || folder || type) && <button type="button" className="btn-ghost" onClick={() => { setQ(''); setCat(''); setTag(''); setFolder(''); setType(''); setTimeout(load, 0); }}><X className="h-4 w-4" />Clear</button>}</form>
          {empty && <div className="card text-center text-sm text-sky-100/70">{q || cat || tag || folder || type ? 'Nothing matches these filters.' : 'Your vault is empty. Add a note, save a link or upload a file.'}</div>}
          {d?.notes.length > 0 && <div><div className="mb-2 text-xs font-bold tracking-wider text-sky-300">NOTES · {d.notes.length}</div><div className="grid gap-3 sm:grid-cols-2">{d.notes.map((n: any) => (
            <div key={n.id} className="card !p-4"><div className="flex items-start justify-between gap-2"><div className="flex items-center gap-1 font-bold">{n.pinned && <Pin className="h-3 w-3 text-amber-300" />}{n.title}</div><Actions x={n} kind="note" /></div>
              {n.content && <p className="mt-1 line-clamp-4 whitespace-pre-line text-xs text-sky-100/70">{n.content}</p>}<div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]"><Tags x={n} /><span className="text-sky-100/50">{ago(n.updated_at || n.created_at)}</span></div></div>))}</div></div>}
          {d?.files.length > 0 && <div><div className="mb-2 text-xs font-bold tracking-wider text-sky-300">FILES · {d.files.length}</div><div className="grid gap-3 sm:grid-cols-2">{d.files.map((f: any) => { const I = fileIcon(f.type_kind); return (
            <div key={f.id} className="card !p-4"><div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><I className="h-5 w-5 shrink-0 text-sky-300" /><div className="min-w-0"><div className="truncate font-bold" title={f.original_name}>{f.original_name}</div><div className="text-[11px] text-sky-100/60">{fmtSize(f.size)} · {ago(f.created_at)}</div></div></div><Actions x={f} kind="file" /></div>
              {f.description && <p className="mt-1 text-xs text-sky-100/70">{f.description}</p>}<div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]"><Tags x={f} /></div>
              <div className="mt-3 flex gap-2">{f.preview && <button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => dl(f, true)}><Eye className="h-3 w-3" />Preview</button>}<button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => dl(f, false)}><Download className="h-3 w-3" />Download</button></div></div>); })}</div></div>}
          {d?.links.length > 0 && <div><div className="mb-2 text-xs font-bold tracking-wider text-sky-300">LINKS · {d.links.length}</div><div className="grid gap-3 sm:grid-cols-2">{d.links.map((l: any) => (
            <div key={l.id} className="card !p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-bold">{l.title}</div><a className="flex items-center gap-1 truncate text-xs text-sky-300 hover:underline" href={l.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3 shrink-0" /><span className="truncate">{l.url}</span></a></div><Actions x={l} kind="link" /></div>
              {l.notes && <p className="mt-1 text-xs text-sky-100/70">{l.notes}</p>}<div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]"><Tags x={l} /></div></div>))}</div></div>}
        </section>
      </div>
    </div>
  );
}
