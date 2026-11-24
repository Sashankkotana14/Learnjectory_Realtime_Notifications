import { useEffect, useState } from 'react';
import { Users, Plus, Heart, MessageCircle, CheckCircle2, HelpCircle, Handshake, Pencil, Trash2, X, Search, Send, UserPlus, Check, BookOpen, Rocket, Megaphone, ExternalLink } from 'lucide-react';
import { api, ago } from '../api';

const KIND: Record<string, { label: string; icon: any; cls: string }> = {
  discussion: { label: 'Discussion', icon: MessageCircle, cls: 'bg-sky-400/20 text-sky-200' },
  question: { label: 'Question', icon: HelpCircle, cls: 'bg-violet-400/25 text-violet-100' },
  collaboration: { label: 'Collaboration', icon: Handshake, cls: 'bg-emerald-400/20 text-emerald-200' },
  resource: { label: 'Resource Share', icon: BookOpen, cls: 'bg-amber-400/20 text-amber-200' },
  showcase: { label: 'Project Showcase', icon: Rocket, cls: 'bg-fuchsia-400/20 text-fuchsia-200' },
  announcement: { label: 'Announcement', icon: Megaphone, cls: 'bg-rose-400/20 text-rose-200' },
};
const Chip = ({ children, cls = 'bg-white/10' }: any) => <span className={`chip ${cls}`}>{children}</span>;
const blank = { kind: 'discussion', title: '', content: '', category: 'General', tags: '', skills_needed: '', max_members: '', link_url: '' };

export default function Community() {
  const [meta, setMeta] = useState<any>({ categories: [], kinds: [] }), [data, setData] = useState<any>(null), [flt, setFlt] = useState<any>({ q: '', category: '', kind: '', sort: 'new', mine: false, page: 1 });
  const [form, setForm] = useState<any>(null), [openId, setOpenId] = useState<number | null>(null), [err, setErr] = useState('');
  const load = () => {
    const qs = new URLSearchParams({ sort: flt.sort, page: String(flt.page), ...(flt.q ? { q: flt.q } : {}), ...(flt.category ? { category: flt.category } : {}), ...(flt.kind ? { kind: flt.kind } : {}), ...(flt.mine ? { mine: 'true' } : {}) });
    return api('/community/posts?' + qs.toString()).then(setData).catch(e => setErr(e.message));
  };
  useEffect(() => { api('/community/meta').then(setMeta).catch(() => {}); }, []);
  useEffect(() => { load(); }, [flt.category, flt.kind, flt.sort, flt.mine, flt.page]);
  const save = async (e: any) => {
    e.preventDefault(); setErr('');
    try {
      const b: any = { title: form.title, content: form.content, category: form.category, tags: form.tags };
      if (!form.id) b.kind = form.kind;
      if (form.kind === 'resource' || form.kind === 'showcase') b.link_url = form.link_url;
      if ((form.kind || '') === 'collaboration') { b.skills_needed = form.skills_needed; b.max_members = form.max_members === '' ? null : Number(form.max_members); }
      form.id ? await api('/community/posts/' + form.id, 'PUT', b) : await api('/community/posts', 'POST', b);
      setForm(null); await load();
    } catch (x: any) { setErr(x.message); }
  };
  const edit = (p: any) => { setErr(''); setForm({ id: p.id, kind: p.kind, title: p.title, content: p.content, category: p.category, tags: p.tags_list.join(', '), skills_needed: p.skills_needed_list.join(', '), max_members: p.max_members ?? '', link_url: p.link_url || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const del = async (p: any) => { if (!confirm('Delete this post and all its comments?')) return; try { await api('/community/posts/' + p.id, 'DELETE'); if (openId === p.id) setOpenId(null); await load(); } catch (x: any) { setErr(x.message); } };
  const like = async (p: any) => { try { const r = await api('/community/posts/' + p.id + '/like', 'POST'); setData({ ...data, posts: data.posts.map((x: any) => (x.id === p.id ? { ...x, liked: r.liked, like_count: r.like_count } : x)) }); } catch (x: any) { setErr(x.message); } };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="flex items-center gap-2 text-2xl font-extrabold"><Users className="h-6 w-6 text-sky-300" />Community</h1><button className="btn" onClick={() => { setErr(''); setForm({ ...blank }); }}><Plus className="h-4 w-4" />New post</button></div>
      {err && <div className="text-sm text-rose-300">{err}</div>}
      {form && <form onSubmit={save} className="card grid gap-3 sm:grid-cols-2">
        {!form.id && <div className="flex flex-wrap gap-2 sm:col-span-2">{meta.kinds.map((k: string) => { const K = KIND[k], I = K.icon; return <button type="button" key={k} onClick={() => setForm({ ...form, kind: k })} className={`chip !px-3 !py-1.5 ${form.kind === k ? 'ring-1 ring-sky-300 ' + K.cls : 'bg-white/5'}`}><I className="mr-1 h-3 w-3" />{K.label}</button>; })}</div>}
        <label className="text-xs text-sky-200 sm:col-span-2">{form.kind === 'discussion' ? 'Title (optional)' : form.kind === 'question' ? 'Your question' : form.kind === 'resource' ? 'Resource title' : form.kind === 'showcase' ? 'Project name' : form.kind === 'announcement' ? 'Announcement headline' : 'What are you building?'}<input className="inp mt-1" maxLength={150} required={form.kind !== 'discussion'} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
        <label className="text-xs text-sky-200 sm:col-span-2">{form.kind === 'question' ? 'Details' : form.kind === 'resource' ? 'Why is it useful?' : form.kind === 'showcase' ? 'Describe your project' : 'Message'}<textarea className="inp mt-1" rows={4} required maxLength={5000} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} /></label>
        <label className="text-xs text-sky-200">Category<select className="inp mt-1" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{meta.categories.map((c: string) => <option key={c}>{c}</option>)}</select></label>
        <label className="text-xs text-sky-200">Tags <span className="text-sky-100/50">(comma separated, max 5)</span><input className="inp mt-1" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} /></label>
        {(form.kind === 'resource' || form.kind === 'showcase') && <label className="text-xs text-sky-200 sm:col-span-2">{form.kind === 'resource' ? 'Resource link' : 'Project link'} <span className="text-sky-100/50">{form.kind === 'resource' ? '(https://…)' : '(repo or live demo, optional)'}</span><input className="inp mt-1" type="url" maxLength={500} placeholder="https://" required={form.kind === 'resource'} value={form.link_url} onChange={e => setForm({ ...form, link_url: e.target.value })} /></label>}
        {form.kind === 'collaboration' && <><label className="text-xs text-sky-200">Skills you need <span className="text-sky-100/50">(comma separated)</span><input className="inp mt-1" value={form.skills_needed} onChange={e => setForm({ ...form, skills_needed: e.target.value })} /></label>
          <label className="text-xs text-sky-200">Team size incl. you <span className="text-sky-100/50">(2-20, optional)</span><input className="inp mt-1" type="number" min={2} max={20} value={form.max_members} onChange={e => setForm({ ...form, max_members: e.target.value })} /></label></>}
        <div className="flex gap-2 sm:col-span-2"><button className="btn">{form.id ? 'Update post' : 'Publish'}</button><button type="button" className="btn-ghost" onClick={() => setForm(null)}><X className="h-4 w-4" />Cancel</button></div></form>}
      <form className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={e => { e.preventDefault(); setFlt({ ...flt, page: 1 }); load(); }}>
        <div className="relative lg:col-span-2"><Search className="absolute left-3 top-2.5 h-4 w-4 text-sky-300" /><input className="inp pl-9" placeholder="Search posts…" value={flt.q} onChange={e => setFlt({ ...flt, q: e.target.value })} /></div>
        <select className="inp" aria-label="Category" value={flt.category} onChange={e => setFlt({ ...flt, category: e.target.value, page: 1 })}><option value="">All categories</option>{meta.categories.map((c: string) => <option key={c}>{c}</option>)}</select>
        <select className="inp" aria-label="Type" value={flt.kind} onChange={e => setFlt({ ...flt, kind: e.target.value, page: 1 })}><option value="">All types</option>{meta.kinds.map((k: string) => <option key={k} value={k}>{KIND[k].label}</option>)}</select>
        <select className="inp" aria-label="Sort" value={flt.sort} onChange={e => setFlt({ ...flt, sort: e.target.value, page: 1 })}><option value="new">Newest</option><option value="popular">Most active</option><option value="unanswered">Unanswered questions</option></select>
        <label className="flex items-center gap-2 text-xs text-sky-200"><input type="checkbox" checked={flt.mine} onChange={e => setFlt({ ...flt, mine: e.target.checked, page: 1 })} />Only my posts</label>
      </form>
      {data && !data.posts.length && <div className="card text-center text-sm text-sky-100/70">{flt.q || flt.category || flt.kind || flt.mine ? 'No posts match these filters.' : 'No posts yet - start the conversation!'}</div>}
      <div className="space-y-3">{data?.posts.map((p: any) => { const K = KIND[p.kind] || KIND.discussion, I = K.icon; return (
        <div key={p.id} className="card">
          <div className="flex flex-wrap items-center gap-2 text-[11px]"><Chip cls={K.cls}><I className="mr-1 h-3 w-3" />{K.label}</Chip><Chip>{p.category}</Chip>{p.solved && <Chip cls="bg-emerald-400/25 text-emerald-100"><CheckCircle2 className="mr-1 h-3 w-3" />Solved</Chip>}{p.kind === 'collaboration' && <Chip cls={p.collab_open ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/10'}>{p.collab_open ? 'Open' : 'Closed'}</Chip>}
            <span className="text-sky-100/60">{p.author.name}{p.is_mine ? ' (you)' : ''} · {ago(p.created_at)}{p.updated_at ? ' · edited' : ''}</span></div>
          {p.title && <div className="mt-2 font-bold">{p.title}</div>}
          <p className="mt-1 whitespace-pre-line text-sm text-sky-100/80">{p.content}</p>
          {p.link_url && <a href={p.link_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 break-all text-xs text-sky-300 underline"><ExternalLink className="h-3 w-3" />{p.link_url}</a>}
          {(p.tags_list.length > 0 || p.skills_needed_list.length > 0) && <div className="mt-2 flex flex-wrap gap-1">{p.tags_list.map((t: string) => <Chip key={t}>#{t}</Chip>)}{p.skills_needed_list.map((t: string) => <Chip key={t} cls="bg-emerald-400/15 text-emerald-200">needs {t}</Chip>)}</div>}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <button className={`flex items-center gap-1 ${p.liked ? 'text-rose-300' : 'text-sky-200'}`} aria-label="Like" onClick={() => like(p)}><Heart className={`h-4 w-4 ${p.liked ? 'fill-current' : ''}`} />{p.like_count}</button>
            <button className="flex items-center gap-1 text-sky-200" onClick={() => setOpenId(openId === p.id ? null : p.id)}><MessageCircle className="h-4 w-4" />{p.comment_count} {p.kind === 'question' ? 'answers' : 'comments'}{openId === p.id ? ' ▲' : ' ▼'}</button>
            {p.kind === 'collaboration' && <span className="text-sky-100/60">{p.members_count + 1}{p.max_members ? '/' + p.max_members : ''} on team</span>}
            {p.is_mine && <span className="ml-auto flex gap-3 text-sky-300"><button aria-label="Edit post" onClick={() => edit(p)}><Pencil className="h-4 w-4" /></button><button aria-label="Delete post" onClick={() => del(p)}><Trash2 className="h-4 w-4" /></button></span>}
          </div>
          {openId === p.id && <Thread id={p.id} onChange={load} setErr={setErr} />}
        </div>); })}</div>
      {data && data.pages > 1 && <div className="flex items-center justify-center gap-3 text-sm"><button className="btn-ghost" disabled={flt.page <= 1} onClick={() => setFlt({ ...flt, page: flt.page - 1 })}>Previous</button>Page {flt.page} of {data.pages}<button className="btn-ghost" disabled={flt.page >= data.pages} onClick={() => setFlt({ ...flt, page: flt.page + 1 })}>Next</button></div>}
    </div>
  );
}

function Thread({ id, onChange, setErr }: any) {
  const [p, setP] = useState<any>(null), [text, setText] = useState(''), [edit, setEdit] = useState<any>(null), [msg, setMsg] = useState('');
  const load = () => api('/community/posts/' + id).then(setP).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [id]);
  const run = async (fn: () => Promise<any>) => { setErr(''); try { await fn(); await load(); onChange(); } catch (x: any) { setErr(x.message); } };
  if (!p) return <div className="mt-3 text-xs text-sky-100/60">Loading…</div>;
  const isQ = p.kind === 'question', word = isQ ? 'answer' : 'comment';
  return (
    <div className="mt-4 space-y-3 border-t border-indigo-400/20 pt-3">
      {p.kind === 'collaboration' && <div className="rounded-xl bg-white/5 p-3 text-xs">
        <div className="mb-1 font-bold">Team</div><div className="mb-2 text-sky-100/70">{p.author.name} (owner){p.members.map((m: any) => ', ' + m.name).join('')}</div>
        {p.is_mine ? (p.requests.length ? p.requests.map((r: any) => <div key={r.id} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/20 p-2"><div><b>{r.user.name}</b> <Chip>{r.status}</Chip>{r.message && <div className="text-sky-100/70">{r.message}</div>}</div>
          <div className="flex gap-2">{r.status !== 'accepted' && <button className="btn !px-3 !py-1 text-xs" onClick={() => run(() => api('/community/collab/' + r.id, 'PUT', { status: 'accepted' }))}><Check className="h-3 w-3" />Accept</button>}{r.status === 'pending' && <button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => run(() => api('/community/collab/' + r.id, 'PUT', { status: 'declined' }))}>Decline</button>}{r.status === 'accepted' && <button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => confirm('Remove this member?') && run(() => api('/community/collab/' + r.id, 'DELETE'))}>Remove</button>}</div></div>) : <div className="text-sky-100/60">No join requests yet.</div>)
          : p.my_request ? <div className="flex items-center gap-2">Your request: <Chip>{p.my_request}</Chip><button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => run(() => api('/community/collab/' + p.requests[0].id, 'DELETE'))}>Withdraw</button></div>
          : p.collab_open ? <div className="flex flex-wrap gap-2"><input className="inp flex-1" placeholder="Say hi and mention what you can contribute (optional)" maxLength={500} value={msg} onChange={e => setMsg(e.target.value)} /><button className="btn !py-1.5" onClick={() => run(async () => { await api('/community/posts/' + id + '/collab', 'POST', { message: msg }); setMsg(''); })}><UserPlus className="h-4 w-4" />Request to join</button></div> : <div className="text-sky-100/60">This collaboration is closed.</div>}
        {p.is_mine && <button className="mt-1 text-sky-300 underline" onClick={() => run(() => api('/community/posts/' + id, 'PUT', { collab_open: !p.collab_open }))}>{p.collab_open ? 'Close to new requests' : 'Re-open requests'}</button>}
      </div>}
      {isQ && p.is_mine && p.solved && <button className="text-xs text-sky-300 underline" onClick={() => run(() => api('/community/posts/' + id + '/solve', 'DELETE'))}>Re-open this question</button>}
      {p.comments.map((c: any) => (
        <div key={c.id} className={`rounded-xl p-3 text-sm ${c.accepted ? 'bg-emerald-400/10 ring-1 ring-emerald-400/40' : 'bg-white/5'}`}>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-sky-100/60"><b className="text-sky-100">{c.author.name}{c.is_mine ? ' (you)' : ''}</b>{ago(c.created_at)}{c.updated_at ? ' · edited' : ''}{c.accepted && <Chip cls="bg-emerald-400/25 text-emerald-100"><CheckCircle2 className="mr-1 h-3 w-3" />Accepted answer</Chip>}</div>
          {edit?.id === c.id ? <div className="flex gap-2"><textarea className="inp" rows={2} maxLength={2000} value={edit.body} onChange={e => setEdit({ ...edit, body: e.target.value })} /><div className="flex flex-col gap-1"><button className="btn !px-3 !py-1 text-xs" onClick={() => run(async () => { await api('/community/comments/' + c.id, 'PUT', { body: edit.body }); setEdit(null); })}>Save</button><button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => setEdit(null)}>Cancel</button></div></div> : <p className="whitespace-pre-line text-sky-100/90">{c.body}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs"><button className={`flex items-center gap-1 ${c.liked ? 'text-rose-300' : 'text-sky-200'}`} onClick={() => run(() => api('/community/comments/' + c.id + '/like', 'POST'))}><Heart className={`h-3.5 w-3.5 ${c.liked ? 'fill-current' : ''}`} />{c.like_count}</button>
            {isQ && p.is_mine && !c.accepted && <button className="flex items-center gap-1 text-emerald-300" onClick={() => run(() => api('/community/posts/' + id + '/solve', 'POST', { comment_id: c.id }))}><CheckCircle2 className="h-3.5 w-3.5" />Mark as solution</button>}
            {c.is_mine && <span className="ml-auto flex gap-3 text-sky-300"><button aria-label="Edit" onClick={() => setEdit({ id: c.id, body: c.body })}><Pencil className="h-3.5 w-3.5" /></button><button aria-label="Delete" onClick={() => confirm('Delete this ' + word + '?') && run(() => api('/community/comments/' + c.id, 'DELETE'))}><Trash2 className="h-3.5 w-3.5" /></button></span>}</div>
        </div>))}
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (text.trim()) run(async () => { await api('/community/posts/' + id + '/comments', 'POST', { body: text }); setText(''); }); }}>
        <input className="inp" placeholder={isQ ? 'Write an answer…' : 'Write a comment…'} maxLength={2000} value={text} onChange={e => setText(e.target.value)} /><button className="btn" disabled={!text.trim()}><Send className="h-4 w-4" /></button></form>
    </div>
  );
}
