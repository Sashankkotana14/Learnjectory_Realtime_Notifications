import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, FolderKanban, CheckCircle2, Wrench, Layers, ExternalLink, PlayCircle } from 'lucide-react';
import { api } from '../api';
import { fmtDate } from '../dates';

const SCLR: Record<string, string> = { planning: 'bg-violet-400/20 text-violet-200', active: 'bg-sky-400/20 text-sky-200', on_hold: 'bg-amber-400/20 text-amber-200', completed: 'bg-emerald-400/20 text-emerald-200' };
const LCLR: Record<string, string> = { Beginner: 'bg-slate-400/20 text-slate-200', Intermediate: 'bg-sky-400/20 text-sky-200', Advanced: 'bg-indigo-400/30 text-indigo-100', Expert: 'bg-fuchsia-400/25 text-fuchsia-100' };
const label = (s: string) => s.replace('_', ' ').replace(/^\w/, c => c.toUpperCase());
const Sum = ({ icon: I, label: l, v, sub }: any) => <div className="card !p-4"><div className="mb-1 flex items-center gap-2 text-xs text-sky-200"><I className="h-4 w-4" />{l}</div><div className="text-2xl font-extrabold">{v}</div><div className="text-[11px] text-sky-100/60">{sub}</div></div>;
const blankP = { title: '', description: '', technologies: '', status: 'planning', repo_url: '' }, blankS = { name: '', category: 'Programming', level_name: 'Beginner' };

export default function ProjectsSkills() {
  const [pd, setPd] = useState<any>(null), [sd, setSd] = useState<any>(null), [pf, setPf] = useState<any>(null), [sf, setSf] = useState<any>(null), [tab, setTab] = useState(''), [err, setErr] = useState('');
  const load = () => Promise.all([api('/projects' + (tab ? '?status=' + tab : '')).then(setPd), api('/skills').then(setSd)]).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [tab]);
  const run = async (fn: () => Promise<any>) => { setErr(''); try { await fn(); await load(); } catch (x: any) { setErr(x.message); } };
  const saveP = (e: any) => { e.preventDefault(); run(async () => { const b = { title: pf.title, description: pf.description, technologies: pf.technologies, status: pf.status, repo_url: pf.repo_url }; pf.id ? await api('/projects/' + pf.id, 'PUT', b) : await api('/projects', 'POST', b); setPf(null); }); };
  const saveS = (e: any) => { e.preventDefault(); run(async () => { const b = { name: sf.name, category: sf.category, level_name: sf.level_name }; sf.id ? await api('/skills/' + sf.id, 'PUT', b) : await api('/skills', 'POST', b); setSf(null); }); };
  const PS = pd?.summary, SS = sd?.summary;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h1 className="flex items-center gap-2 text-2xl font-extrabold"><FolderKanban className="h-6 w-6 text-sky-300" />Projects & Skills</h1></div>
      {err && <div className="text-sm text-rose-300">{err}</div>}
      {PS && SS && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Sum icon={FolderKanban} label="Projects" v={PS.total} sub={`${PS.active} active · ${PS.planning} planning · ${PS.on_hold} on hold`} />
        <Sum icon={CheckCircle2} label="Completed" v={PS.completed} sub={PS.total ? `${PS.completionRate}% of projects` : 'nothing yet'} />
        <Sum icon={Wrench} label="Skills" v={SS.total} sub={`${SS.categories} categories · ${SS.advanced} advanced+`} />
        <Sum icon={Layers} label="Average level" v={SS.avgLevel + '%'} sub={`${SS.byLevel.Expert} expert · ${SS.byLevel.Advanced} advanced`} /></div>}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Projects</h2>
          <div className="flex flex-wrap items-center gap-2">{[['', 'All'], ['planning', 'Planning'], ['active', 'Active'], ['on_hold', 'On hold'], ['completed', 'Completed']].map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`chip !px-3 !py-1 ${tab === k ? 'bg-sky-500/40 ring-1 ring-sky-300' : 'bg-white/5'}`}>{l}</button>)}
            <button className="btn !px-4 !py-1.5" onClick={() => { setErr(''); setPf({ ...blankP }); }}><Plus className="h-4 w-4" />Add project</button></div></div>
        {pf && <form onSubmit={saveP} className="card mb-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-sky-200">Project name<input className="inp mt-1" required maxLength={200} value={pf.title} onChange={e => setPf({ ...pf, title: e.target.value })} /></label>
          <label className="text-xs text-sky-200">Status<select className="inp mt-1" value={pf.status} onChange={e => setPf({ ...pf, status: e.target.value })}>{(pd?.statuses || []).map((s: string) => <option key={s} value={s}>{label(s)}</option>)}</select></label>
          <label className="text-xs text-sky-200 sm:col-span-2">Description<textarea className="inp mt-1" rows={2} value={pf.description || ''} onChange={e => setPf({ ...pf, description: e.target.value })} /></label>
          <label className="text-xs text-sky-200">Technologies <span className="text-sky-100/50">(comma separated)</span><input className="inp mt-1" placeholder="React, Node.js, SQLite" value={pf.technologies || ''} onChange={e => setPf({ ...pf, technologies: e.target.value })} /></label>
          <label className="text-xs text-sky-200">Repository / demo link<input className="inp mt-1" placeholder="https://…" value={pf.repo_url || ''} onChange={e => setPf({ ...pf, repo_url: e.target.value })} /></label>
          <div className="flex gap-2 sm:col-span-2"><button className="btn">{pf.id ? 'Update' : 'Save'}</button><button type="button" className="btn-ghost" onClick={() => setPf(null)}><X className="h-4 w-4" />Cancel</button></div></form>}
        {pd && !pd.projects.length && <div className="card text-center text-sm text-sky-100/70">{PS.total ? 'No projects in this view.' : 'No projects yet — add your first one.'}</div>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{pd?.projects.map((p: any) => (
          <div key={p.id} className="card">
            <div className="mb-2 flex items-start justify-between gap-2"><div className="font-bold">{p.title}</div><div className="flex gap-2 text-sky-300"><button aria-label="Edit project" onClick={() => { setErr(''); setPf({ ...p }); }}><Pencil className="h-4 w-4" /></button><button aria-label="Delete project" onClick={() => confirm(`Delete project "${p.title}"?`) && run(() => api('/projects/' + p.id, 'DELETE'))}><Trash2 className="h-4 w-4" /></button></div></div>
            <div className="mb-2 flex flex-wrap items-center gap-2"><span className={`chip ${SCLR[p.status]}`}>{label(p.status)}</span>{p.completed_at && <span className="text-[11px] text-sky-100/60">Done {fmtDate(p.completed_at)}</span>}</div>
            {p.description && <p className="mb-2 text-xs text-sky-100/70">{p.description}</p>}
            <div className="mb-2 flex flex-wrap gap-1">{p.technologies_list.map((t: string) => <span key={t} className="chip bg-white/10">{t}</span>)}</div>
            {p.repo_url && <a className="flex items-center gap-1 text-xs text-sky-300 hover:underline" href={p.repo_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" />Open link</a>}
            {p.status !== 'completed' && <button className="btn-ghost mt-3 !px-3 !py-1 text-xs" onClick={() => run(() => api('/projects/' + p.id, 'PUT', { status: 'completed' }))}><PlayCircle className="h-3 w-3" />Mark completed</button>}
          </div>))}</div>
        {PS?.technologies.length > 0 && <div className="card mt-4"><h3 className="mb-2 text-sm font-bold">Technologies used</h3><div className="flex flex-wrap gap-2">{PS.technologies.map((t: any) => <span key={t.name} className="chip bg-sky-400/15 text-sky-100">{t.name} · {t.count}</span>)}</div></div>}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Skills</h2><button className="btn !px-4 !py-1.5" onClick={() => { setErr(''); setSf({ ...blankS }); }}><Plus className="h-4 w-4" />Add skill</button></div>
        {sf && <form onSubmit={saveS} className="card mb-4 grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-sky-200">Skill<input className="inp mt-1" required maxLength={60} value={sf.name} onChange={e => setSf({ ...sf, name: e.target.value })} /></label>
          <label className="text-xs text-sky-200">Category<select className="inp mt-1" value={sf.category} onChange={e => setSf({ ...sf, category: e.target.value })}>{(sd?.categories || []).map((c: string) => <option key={c}>{c}</option>)}</select></label>
          <label className="text-xs text-sky-200">Level<select className="inp mt-1" value={sf.level_name} onChange={e => setSf({ ...sf, level_name: e.target.value })}>{(sd?.levels || []).map((c: string) => <option key={c}>{c}</option>)}</select></label>
          <div className="flex gap-2 sm:col-span-3"><button className="btn">{sf.id ? 'Update' : 'Save'}</button><button type="button" className="btn-ghost" onClick={() => setSf(null)}><X className="h-4 w-4" />Cancel</button></div></form>}
        {PS?.missingSkills.length > 0 && <div className="card mb-4 !p-3 text-xs"><span className="text-sky-200">Used in your projects but not in your skills yet: </span>{PS.missingSkills.map((m: string) => <button key={m} className="chip mr-1 bg-white/10 hover:bg-sky-400/30" onClick={() => run(() => api('/skills', 'POST', { name: m, category: 'Other', level_name: 'Beginner' }))}>+ {m}</button>)}</div>}
        {sd && !sd.skills.length && <div className="card text-center text-sm text-sky-100/70">No skills yet — add the skills you have or are building.</div>}
        {sd && Object.keys(SS.byCategory).sort().map(cat => (
          <div key={cat} className="mb-4"><div className="mb-2 text-xs font-bold tracking-wider text-sky-300">{cat.toUpperCase()} · {SS.byCategory[cat]}</div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{sd.skills.filter((s: any) => (s.category || 'Other') === cat).map((s: any) => (
              <div key={s.id} className="card !p-4"><div className="mb-1 flex items-start justify-between gap-2"><div className="font-semibold">{s.name}</div><div className="flex gap-2 text-sky-300"><button aria-label="Edit skill" onClick={() => { setErr(''); setSf({ ...s, category: s.category || 'Other' }); }}><Pencil className="h-3.5 w-3.5" /></button><button aria-label="Remove skill" onClick={() => confirm(`Remove skill "${s.name}"?`) && run(() => api('/skills/' + s.id, 'DELETE'))}><Trash2 className="h-3.5 w-3.5" /></button></div></div>
                <span className={`chip ${LCLR[s.level_name]}`}>{s.level_name}</span><div className="bar mt-2"><div style={{ width: s.level + '%' }} /></div></div>))}</div></div>))}
      </section>
    </div>
  );
}
