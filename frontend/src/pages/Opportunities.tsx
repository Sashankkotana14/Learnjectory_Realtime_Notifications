import { useEffect, useRef, useState } from 'react';
import { Zap, Upload, FileText, Search, Bookmark, BookmarkCheck, ExternalLink, Trash2, Sparkles, AlertTriangle, GraduationCap, Briefcase, FolderKanban, Plus, Target } from 'lucide-react';
import { api, upload, ago } from '../api';

const TABS = [['find', 'Find jobs'], ['resume', 'My resume'], ['saved', 'Saved'], ['gaps', 'Skill gaps']] as const;
const matchClr = (s: number | null) => (s === null ? 'bg-white/10 text-sky-100/70' : s >= 70 ? 'bg-emerald-400/20 text-emerald-200' : s >= 40 ? 'bg-amber-400/20 text-amber-200' : 'bg-rose-400/20 text-rose-200');
const Chip = ({ children, cls = 'bg-white/10' }: any) => <span className={`chip ${cls}`}>{children}</span>;
const Ext = ({ href, children }: any) => <a className="btn-ghost !px-3 !py-1 text-xs" href={href} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" />{children}</a>;

export default function Opportunities() {
  const [tab, setTab] = useState<string>('find'), [err, setErr] = useState(''), [info, setInfo] = useState('');
  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold"><Zap className="h-6 w-6 text-sky-300" />Opportunities</h1>
      <div className="flex flex-wrap gap-2">{TABS.map(([k, l]) => <button key={k} onClick={() => { setTab(k); setErr(''); setInfo(''); }} className={`chip !px-4 !py-1.5 ${tab === k ? 'bg-sky-500/40 ring-1 ring-sky-300' : 'bg-white/5'}`}>{l}</button>)}</div>
      {err && <div className="text-sm text-rose-300">{err}</div>}{info && <div className="text-sm text-emerald-300">{info}</div>}
      {tab === 'find' && <Find setErr={setErr} setInfo={setInfo} goResume={() => setTab('resume')} />}
      {tab === 'resume' && <Resume setErr={setErr} setInfo={setInfo} />}
      {tab === 'saved' && <Saved setErr={setErr} />}
      {tab === 'gaps' && <Gaps setErr={setErr} goResume={() => setTab('resume')} />}
    </div>
  );
}

function Find({ setErr, setInfo, goResume }: any) {
  const [f, setF] = useState<any>({ q: '', location: '', remote: false, min_match: '0', sort: 'match' }), [d, setD] = useState<any>(null), [busy, setBusy] = useState(false), [page, setPage] = useState(1), [open, setOpen] = useState<number | null>(null);
  const run = async (p = 1) => {
    setBusy(true); setErr(''); setPage(p);
    const qs = new URLSearchParams({ q: f.q, location: f.location, min_match: f.min_match, sort: f.sort, page: String(p), ...(f.remote ? { remote: 'true' } : {}) });
    try { setD(await api('/opportunities/jobs?' + qs.toString())); } catch (x: any) { setErr(x.message); } setBusy(false);
  };
  useEffect(() => { run(1); }, []);
  const save = async (j: any) => { try { const s = await api('/opportunities/saved', 'POST', j); setD({ ...d, jobs: d.jobs.map((x: any) => (x.external_id === j.external_id && x.source === j.source ? { ...x, saved_id: s.id } : x)) }); setInfo('Job saved'); } catch (x: any) { setErr(x.message); } };
  const unsave = async (j: any) => { try { await api('/opportunities/saved/' + j.saved_id, 'DELETE'); setD({ ...d, jobs: d.jobs.map((x: any) => (x.saved_id === j.saved_id ? { ...x, saved_id: null } : x)) }); } catch (x: any) { setErr(x.message); } };
  return (
    <div className="space-y-4">
      <form onSubmit={e => { e.preventDefault(); run(1); }} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs text-sky-200 lg:col-span-2">Keywords<input className="inp mt-1" placeholder="e.g. react developer, data analyst" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} /></label>
        <label className="text-xs text-sky-200">Location<input className="inp mt-1" placeholder="City, country or 'remote'" value={f.location} onChange={e => setF({ ...f, location: e.target.value })} /></label>
        <label className="text-xs text-sky-200">Minimum skill match<select className="inp mt-1" value={f.min_match} onChange={e => setF({ ...f, min_match: e.target.value })}>{['0', '25', '50', '75'].map(v => <option key={v} value={v}>{v === '0' ? 'Any' : v + '%+'}</option>)}</select></label>
        <label className="text-xs text-sky-200">Sort by<select className="inp mt-1" value={f.sort} onChange={e => setF({ ...f, sort: e.target.value })}><option value="match">Best skill match</option><option value="date">Newest</option></select></label>
        <label className="flex items-center gap-2 text-xs text-sky-200"><input type="checkbox" checked={f.remote} onChange={e => setF({ ...f, remote: e.target.checked })} />Remote only</label>
        <div className="sm:col-span-2 lg:col-span-4 flex justify-end"><button className="btn" disabled={busy}><Search className="h-4 w-4" />{busy ? 'Searching…' : 'Search jobs'}</button></div>
      </form>
      {d && !d.has_resume && <div className="card !p-3 text-xs text-sky-100/80">Upload your resume (or add skills in Projects & Skills) to see how well each job matches you. <button className="underline text-sky-300" onClick={goResume}>Upload resume</button></div>}
      {d && <div className="flex flex-wrap items-center gap-2 text-[11px] text-sky-100/70">Sources: {d.sources.map((s: any) => <span key={s.id} className={`chip ${s.ok ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/10'}`} title={s.error || s.site}>{s.name}: {s.ok ? s.count + ' listings' : s.skipped ? 'not configured' : 'unavailable'}</span>)}
        <span>· Listings come live from the sources above; apply links open the original posting.</span></div>}
      {d?.note && <div className="card !p-3 text-sm text-amber-200"><AlertTriangle className="mr-2 inline h-4 w-4" />{d.note}</div>}
      {d?.top_gaps?.length > 0 && <div className="card !p-3 text-xs"><span className="text-sky-200">Skills these results ask for that you don't list yet: </span>{d.top_gaps.map((g: any) => <Chip key={g.name} cls="mr-1 bg-rose-400/15 text-rose-100">{g.name} · {g.jobs}</Chip>)}</div>}
      <div className="space-y-3">{d?.jobs.map((j: any) => (
        <div key={j.source + j.external_id} className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><div className="font-bold">{j.title}</div><div className="text-xs text-sky-100/70">{j.company}{j.location ? ' · ' + j.location : ''}{j.posted_at ? ' · ' + ago(j.posted_at) : ''}</div></div>
            <div className="flex flex-wrap items-center gap-2"><Chip cls={matchClr(j.match.score)}>{j.match.score === null ? 'No skills listed' : j.match.score + '% match'}</Chip><Chip>{j.source}</Chip>{j.remote && <Chip cls="bg-sky-400/20 text-sky-100">Remote</Chip>}{j.job_type && <Chip>{j.job_type}</Chip>}{j.salary && <Chip>{j.salary}</Chip>}</div>
          </div>
          {(j.match.matched.length > 0 || j.match.missing.length > 0) && <div className="mt-2 flex flex-wrap gap-1 text-[11px]">{j.match.matched.map((m: string) => <Chip key={m} cls="bg-emerald-400/15 text-emerald-200">✓ {m}</Chip>)}{j.match.missing.map((m: any) => <Chip key={m.name} cls="bg-rose-400/15 text-rose-100">missing: {m.name}</Chip>)}</div>}
          {open === j.id || open === (j.external_id as any) ? <p className="mt-2 whitespace-pre-line text-xs text-sky-100/70">{j.description}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2"><Ext href={j.url}>Apply on {j.source}</Ext>
            {j.saved_id ? <button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => unsave(j)}><BookmarkCheck className="h-3 w-3" />Saved</button> : <button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => save(j)}><Bookmark className="h-3 w-3" />Save</button>}
            {j.description && <button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => setOpen(open === (j.external_id as any) ? null : (j.external_id as any))}>{open === (j.external_id as any) ? 'Hide details' : 'Details'}</button>}</div>
        </div>))}</div>
      {d && d.pages > 1 && <div className="flex items-center justify-center gap-3 text-sm"><button className="btn-ghost" disabled={page <= 1} onClick={() => run(page - 1)}>Previous</button>Page {page} of {d.pages}<button className="btn-ghost" disabled={page >= d.pages} onClick={() => run(page + 1)}>Next</button></div>}
      {d && <div className="card"><h3 className="mb-1 text-sm font-bold">Search on other job sites</h3><p className="mb-3 text-xs text-sky-100/60">These open the search page of each site in a new tab. Learnjectory does not list or copy their jobs.</p><div className="flex flex-wrap gap-2">{d.external_links.map((l: any) => <Ext key={l.name} href={l.url}>{l.name}</Ext>)}</div></div>}
    </div>
  );
}

function Resume({ setErr, setInfo }: any) {
  const [r, setR] = useState<any>(undefined), [busy, setBusy] = useState(false), [paste, setPaste] = useState(''), file = useRef<HTMLInputElement>(null);
  const load = () => api('/opportunities/resume').then(d => setR(d.resume)).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const onFile = async (e: any) => { const f = e.target.files?.[0]; if (!f) return; setBusy(true); setErr(''); setInfo(''); try { await upload('/opportunities/resume', f); await load(); setInfo('Resume analysed'); } catch (x: any) { setErr(x.message); } setBusy(false); if (file.current) file.current.value = ''; };
  const sendPaste = async () => { setBusy(true); setErr(''); try { await api('/opportunities/resume/text', 'POST', { text: paste }); setPaste(''); await load(); setInfo('Resume text analysed'); } catch (x: any) { setErr(x.message); } setBusy(false); };
  const imp = async () => { try { const d = await api('/opportunities/resume/import-skills', 'POST', {}); setInfo(d.added.length ? `Added ${d.added.length} skills to Projects & Skills (Beginner level - adjust them there)` : 'All resume skills are already in your profile'); await load(); } catch (x: any) { setErr(x.message); } };
  const A = r?.analysis, missing = A?.skills.filter((s: any) => !s.in_profile).length;
  return (
    <div className="space-y-4">
      <div className="card"><h2 className="mb-1 flex items-center gap-2 font-bold"><Upload className="h-4 w-4" />Upload your resume</h2>
        <p className="mb-3 text-xs text-sky-100/60">PDF or DOCX, up to 5 MB. The text is analysed on the server to find your skills, education, projects and experience; the file itself is not kept and contact details are not stored.</p>
        <input ref={file} type="file" accept=".pdf,.docx" className="hidden" onChange={onFile} /><button className="btn" disabled={busy} onClick={() => file.current?.click()}><FileText className="h-4 w-4" />{busy ? 'Analysing…' : r ? 'Upload a new resume' : 'Choose PDF or DOCX'}</button>
        <details className="mt-3 text-xs text-sky-100/70"><summary className="cursor-pointer">PDF not readable? Paste your resume text instead</summary><textarea className="inp mt-2" rows={6} maxLength={40000} placeholder="Paste the text of your resume (include headings like Skills, Education, Projects, Experience)" value={paste} onChange={e => setPaste(e.target.value)} /><button className="btn mt-2" disabled={busy || paste.length < 80} onClick={sendPaste}>Analyse text</button></details></div>
      {r === null && <div className="card text-center text-sm text-sky-100/70">No resume yet. Upload one to unlock skill matching.</div>}
      {A && <>
        <div className="card"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-bold">{r.filename}</div><div className="text-xs text-sky-100/60">Analysed {ago(r.uploaded_at)} · {A.word_count} words{A.experience_years !== null ? ` · about ${A.experience_years} years of dated experience` : ''}</div></div>
          <button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => confirm('Delete this analysed resume?') && api('/opportunities/resume/' + r.id, 'DELETE').then(load).catch(e => setErr(e.message))}><Trash2 className="h-3 w-3" />Delete</button></div>
          {A.warnings.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-amber-200">{A.warnings.map((w: string) => <li key={w}>{w}</li>)}</ul>}</div>
        <div className="card"><div className="mb-2 flex items-center justify-between"><h3 className="flex items-center gap-2 font-bold"><Sparkles className="h-4 w-4" />Skills found ({A.skills.length})</h3>{missing > 0 && <button className="btn !px-3 !py-1 text-xs" onClick={imp}><Plus className="h-3 w-3" />Add {missing} to my skills</button>}</div>
          <div className="flex flex-wrap gap-1">{A.skills.map((s: any) => <Chip key={s.name} cls={s.in_profile ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/10'}>{s.name}{s.in_profile ? ' ✓' : ''}</Chip>)}</div>{!A.skills.length && <p className="text-xs text-sky-100/60">No skills recognised.</p>}</div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card"><h3 className="mb-2 flex items-center gap-2 font-bold"><GraduationCap className="h-4 w-4" />Education</h3>{!A.education.length && <p className="text-xs text-sky-100/60">None found.</p>}{A.education.map((e: any, i: number) => <div key={i} className="mb-2 text-xs"><div className="font-semibold">{e.degree || e.institution}</div><div className="text-sky-100/70">{e.institution !== e.degree ? e.institution : ''} {e.years && '· ' + e.years} {e.score && '· ' + e.score}</div></div>)}</div>
          <div className="card"><h3 className="mb-2 flex items-center gap-2 font-bold"><Briefcase className="h-4 w-4" />Experience</h3>{!A.experience.length && <p className="text-xs text-sky-100/60">None found.</p>}{A.experience.map((e: any, i: number) => <div key={i} className="mb-2 text-xs"><div className="font-semibold">{e.title}</div><div className="text-sky-100/70">{e.dates}</div>{e.details.slice(0, 3).map((x: string, k: number) => <div key={k} className="text-sky-100/60">• {x}</div>)}</div>)}</div>
          <div className="card"><h3 className="mb-2 flex items-center gap-2 font-bold"><FolderKanban className="h-4 w-4" />Projects</h3>{!A.projects.length && <p className="text-xs text-sky-100/60">None found.</p>}{A.projects.map((e: any, i: number) => <div key={i} className="mb-2 text-xs"><div className="font-semibold">{e.title}</div>{e.technologies?.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{e.technologies.map((t: string) => <Chip key={t}>{t}</Chip>)}</div>}</div>)}</div>
        </div></>}
    </div>
  );
}

function Saved({ setErr }: any) {
  const [d, setD] = useState<any>(null), [st, setSt] = useState(''), [form, setForm] = useState<any>(null);
  const load = () => api('/opportunities/saved' + (st ? '?status=' + st : '')).then(setD).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [st]);
  const run = async (fn: () => Promise<any>) => { setErr(''); try { await fn(); await load(); } catch (x: any) { setErr(x.message); } };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">{[['', 'All'], ...(d?.statuses || []).map((s: string) => [s, s[0].toUpperCase() + s.slice(1)])].map(([k, l]: any) => <button key={k} onClick={() => setSt(k)} className={`chip !px-3 !py-1 ${st === k ? 'bg-sky-500/40 ring-1 ring-sky-300' : 'bg-white/5'}`}>{l}{k && d ? ` · ${d.counts[k] || 0}` : ''}</button>)}
        <button className="btn !px-4 !py-1.5 ml-auto" onClick={() => setForm({ title: '', company: '', url: '', description: '' })}><Plus className="h-4 w-4" />Add a job I found elsewhere</button></div>
      {form && <form className="card grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); run(async () => { await api('/opportunities/saved', 'POST', { ...form, source: 'manual' }); setForm(null); }); }}>
        <label className="text-xs text-sky-200">Job title<input className="inp mt-1" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
        <label className="text-xs text-sky-200">Company<input className="inp mt-1" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></label>
        <label className="text-xs text-sky-200 sm:col-span-2">Link to the posting<input className="inp mt-1" required placeholder="https://…" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} /></label>
        <label className="text-xs text-sky-200 sm:col-span-2">Paste the job description <span className="text-sky-100/50">(optional - lets us compare required skills)</span><textarea className="inp mt-1" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
        <div className="flex gap-2 sm:col-span-2"><button className="btn">Save job</button><button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button></div></form>}
      {d && !d.jobs.length && <div className="card text-center text-sm text-sky-100/70">{st ? 'No jobs with this status.' : 'No saved jobs yet. Save listings from "Find jobs".'}</div>}
      <div className="grid gap-3 lg:grid-cols-2">{d?.jobs.map((j: any) => (
        <div key={j.id} className="card"><div className="flex items-start justify-between gap-2"><div><div className="font-bold">{j.title}</div><div className="text-xs text-sky-100/70">{j.company}{j.location ? ' · ' + j.location : ''} · saved {ago(j.saved_at)}</div></div><Chip cls={matchClr(j.match.score)}>{j.match.score === null ? 'No skills listed' : j.match.score + '%'}</Chip></div>
          {j.match.missing.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{j.match.missing.map((m: any) => <Chip key={m.name} cls="bg-rose-400/15 text-rose-100">missing: {m.name}</Chip>)}</div>}
          <div className="mt-3 flex flex-wrap items-center gap-2"><select className="inp !w-auto !py-1 text-xs" value={j.status} onChange={e => run(() => api('/opportunities/saved/' + j.id, 'PUT', { status: e.target.value }))}>{d.statuses.map((s: string) => <option key={s}>{s}</option>)}</select>
            <Ext href={j.url}>Open posting</Ext><button aria-label="Remove saved job" className="btn-ghost !px-3 !py-1 text-xs" onClick={() => confirm('Remove this saved job?') && run(() => api('/opportunities/saved/' + j.id, 'DELETE'))}><Trash2 className="h-3 w-3" /></button></div>
          <textarea className="inp mt-2 text-xs" rows={2} placeholder="Notes (e.g. deadline, contact, interview date)" defaultValue={j.notes} maxLength={1000} onBlur={e => e.target.value !== j.notes && run(() => api('/opportunities/saved/' + j.id, 'PUT', { notes: e.target.value }))} /></div>))}</div>
    </div>
  );
}

function Gaps({ setErr, goResume }: any) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api('/opportunities/skill-gaps').then(setD).catch(e => setErr(e.message)); }, []);
  if (!d) return null;
  return (
    <div className="space-y-4">
      <div className="card !p-4 text-sm"><Target className="mr-2 inline h-4 w-4 text-sky-300" />Compared against <b>{d.analysed_jobs}</b> of your {d.saved_jobs} saved jobs.{d.note && <span className="ml-1 text-amber-200">{d.note}</span>}{!d.has_skills && <button className="ml-2 underline text-sky-300" onClick={goResume}>Upload resume</button>}</div>
      {d.missing.length > 0 && <div className="card"><h3 className="mb-3 font-bold">Skills to learn</h3><div className="space-y-2">{d.missing.map((m: any) => (
        <div key={m.name} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 p-3 text-sm"><div><span className="font-semibold">{m.name}</span> <Chip>{m.category}</Chip><div className="text-[11px] text-sky-100/60">Asked for in {m.jobs_count} saved job{m.jobs_count === 1 ? '' : 's'}: {m.jobs.join(', ')}</div></div><Ext href={m.learn_url}>Find tutorials</Ext></div>))}</div></div>}
      {d.strengths.length > 0 && <div className="card"><h3 className="mb-2 font-bold">Your matching strengths</h3><div className="flex flex-wrap gap-1">{d.strengths.map((s: any) => <Chip key={s.name} cls="bg-emerald-400/15 text-emerald-200">{s.name} · {s.jobs_count}</Chip>)}</div></div>}
    </div>
  );
}
