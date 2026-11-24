import { useEffect, useState } from 'react';
import { Plus, Trash2, X, Compass, ArrowLeft, Check, Circle, Youtube, ExternalLink, Clock, Search, Pencil, BookOpen, TrendingUp, ChevronUp, ChevronDown, GripVertical, Play, Paperclip, Filter } from 'lucide-react';
import { api } from '../api';
import DatePicker from '../components/DatePicker';
import { daysLabel, fmtDate, fmtMin, todayStr } from '../dates';

const CLR: Record<string, string> = { active: 'bg-sky-400/20 text-sky-200', completed: 'bg-emerald-400/20 text-emerald-200', overdue: 'bg-rose-500/25 text-rose-200' };
const Sum = ({ icon: I, label, v, sub }: any) => <div className="card !p-4"><div className="mb-1 flex items-center gap-2 text-xs text-sky-200"><I className="h-4 w-4" />{label}</div><div className="text-2xl font-extrabold">{v}</div><div className="text-[11px] text-sky-100/60">{sub}</div></div>;
const Bar = ({ v }: { v: number }) => <div className="bar"><div style={{ width: v + '%' }} /></div>;
const blankL = { title: '', stage: 'Beginner', resource_url: '', resource_type: 'article', youtube_query: '', est_minutes: 0 };

export default function Career() {
  const [data, setData] = useState<any>(null), [tpl, setTpl] = useState<any[]>([]), [sel, setSel] = useState<number | null>(null), [det, setDet] = useState<any>(null), [err, setErr] = useState('');
  const [pf, setPf] = useState<any>(null), [lf, setLf] = useState<any>(null), [sf, setSf] = useState<any>(null), [yq, setYq] = useState(''), [yt, setYt] = useState<any>(null), [yl, setYl] = useState(false);
  // Career Compass upgrade state: video target lesson, inline player, drag source, study-log list/filter/edit
  const [vt, setVt] = useState<string>(''), [play, setPlay] = useState<number | null>(null), [drag, setDrag] = useState<number | null>(null), [lg, setLg] = useState<any>(null), [lfil, setLfil] = useState<any>({ from: '', to: '', lesson_id: '', q: '' }), [ef, setEf] = useState<any>(null), [lgBusy, setLgBusy] = useState(false);
  const today = todayStr();
  const loadList = () => api('/career/paths').then(setData).catch(e => setErr(e.message));
  const loadDet = (id = sel) => id ? api('/career/paths/' + id).then(setDet).catch(e => { setErr(e.message); setSel(null); }) : Promise.resolve();
  const logQs = (fil: any, offset = 0) => { const q = new URLSearchParams({ limit: '20', offset: String(offset) }); for (const k of ['from', 'to', 'lesson_id', 'q']) if (fil[k]) q.set(k, fil[k]); return q.toString(); };
  const loadLogs = (fil = lfil, id = sel, append = false) => { if (!id) return Promise.resolve(); setLgBusy(true); return api(`/career/paths/${id}/study?${logQs(fil, append ? (lg?.logs.length || 0) : 0)}`).then(r => setLg((o: any) => append && o ? { ...r, logs: [...o.logs, ...r.logs] } : r)).catch(e => setErr(e.message)).finally(() => setLgBusy(false)); };
  const refresh = async () => { await Promise.all([loadList(), loadDet(), loadLogs()]); };
  useEffect(() => { loadList(); api('/career/templates').then(setTpl).catch(() => {}); }, []);
  useEffect(() => { setDet(null); setLf(null); setSf(null); setYt(null); setLg(null); setEf(null); setPlay(null); setVt(''); const f = { from: '', to: '', lesson_id: '', q: '' }; setLfil(f); if (sel) { loadDet(sel); loadLogs(f, sel); } }, [sel]);
  useEffect(() => { if (det && !yq) { const n = det.stages.flatMap((s: any) => s.lessons).find((l: any) => !l.completed); setYq(n ? (n.youtube_query || n.title) : det.title); } }, [det]);
  const run = async (fn: () => Promise<any>) => { setErr(''); try { await fn(); await refresh(); } catch (x: any) { setErr(x.message); } };
  const savePath = (e: any) => { e.preventDefault(); run(async () => { const body = { title: pf.title, description: pf.description, target_date: pf.target_date || null, ...(pf.id ? {} : { template: pf.template || undefined }) }; const r = pf.id ? await api('/career/paths/' + pf.id, 'PUT', body) : await api('/career/paths', 'POST', body); setPf(null); if (!pf.id) setSel(r.id); }); };
  const delPath = (p: any) => { if (confirm(`Delete "${p.title}" with all its lessons and study logs?`)) { setErr(''); api('/career/paths/' + p.id, 'DELETE').then(() => { setSel(null); setDet(null); setYq(''); loadList(); }).catch(x => setErr(x.message)); } };
  const toggle = (l: any) => run(() => api(`/career/lessons/${l.id}/complete`, 'POST', { completed: !l.completed }));
  const addLesson = (e: any) => { e.preventDefault(); run(async () => { await api(`/career/paths/${sel}/lessons`, 'POST', lf); setLf(null); }); };
  const delLesson = (l: any) => { if (confirm(`Remove lesson "${l.title}"?`)) run(() => api('/career/lessons/' + l.id, 'DELETE')); };
  const addStudy = (e: any) => { e.preventDefault(); run(async () => { await api(`/career/paths/${sel}/study`, 'POST', { minutes: Number(sf.minutes), date: sf.date, lesson_id: sf.lesson_id || undefined, note: sf.note }); setSf(null); }); };
  const applyFil = (n: any) => { setLfil(n); loadLogs(n); };
  const saveEdit = (e: any) => { e.preventDefault(); run(async () => { await api('/career/study/' + ef.id, 'PUT', { minutes: Number(ef.minutes), date: ef.date, lesson_id: ef.lesson_id || null, note: ef.note }); setEf(null); }); };
  const delLog = (x: any) => { if (confirm(`Delete this ${fmtMin(x.minutes)} study log from ${fmtDate(x.log_date)}?`)) run(() => api('/career/study/' + x.id, 'DELETE')); };
  const move = (l: any, direction: 'up' | 'down') => run(() => api(`/career/lessons/${l.id}/move`, 'POST', { direction }));
  const dropOn = (st: any, target: any) => { if (drag === null || drag === target.id) { setDrag(null); return; } const ids = st.lessons.map((x: any) => x.id), from = ids.indexOf(drag), to = ids.indexOf(target.id); setDrag(null); if (from < 0 || to < 0) return; ids.splice(to, 0, ids.splice(from, 1)[0]); run(() => api(`/career/paths/${sel}/lessons/reorder`, 'PUT', { stage: st.stage, order: ids })); };
  const attach = (l: any, v: any) => run(() => api(`/career/lessons/${l}/video`, 'PUT', { id: v.id, title: v.title, channel: v.channel, thumbnail: v.thumbnail }));
  const findFor = (l: any) => { const q = l.youtube_query || l.title; setYq(q); setVt(String(l.id)); setYt(null); setYl(true); setErr(''); api('/career/youtube?q=' + encodeURIComponent(q)).then(setYt).catch(x => setErr(x.message)).finally(() => setYl(false)); };
  const more = async () => { if (!yt?.next_page_token) return; setYl(true); try { const r = await api('/career/youtube?q=' + encodeURIComponent(yt.query) + '&pageToken=' + encodeURIComponent(yt.next_page_token)); setYt({ ...r, videos: [...yt.videos, ...r.videos] }); } catch (x: any) { setErr(x.message); } setYl(false); };
  const search = async (e?: any) => { e?.preventDefault(); setYl(true); setErr(''); try { setYt(await api('/career/youtube?q=' + encodeURIComponent(yq))); } catch (x: any) { setErr(x.message); } setYl(false); };
  const S = data?.summary, lessons = det ? det.stages.flatMap((s: any) => s.lessons) : [];
  return (
    <div>
      <div className="mb-4 flex items-center justify-between"><h1 className="flex items-center gap-2 text-2xl font-extrabold"><Compass className="h-6 w-6 text-sky-300" />Career Compass</h1>
        {!sel && <button className="btn" onClick={() => { setErr(''); setPf({ title: '', description: '', target_date: '', template: '' }); }}><Plus className="h-4 w-4" />New career path</button>}</div>
      {err && <div className="mb-3 text-sm text-rose-300">{err}</div>}
      {pf && <form onSubmit={savePath} className="card mb-4 grid gap-3 sm:grid-cols-2">
        {!pf.id && <label className="text-xs text-sky-200 sm:col-span-2">Start from<select className="inp mt-1" value={pf.template} onChange={e => { const t = tpl.find(x => x.key === e.target.value); setPf({ ...pf, template: e.target.value, title: t ? t.title : pf.title, description: t ? t.description : pf.description }); }}><option value="">Custom path (add my own lessons)</option>{tpl.map(t => <option key={t.key} value={t.key}>{t.title} · {t.lessons} lessons</option>)}</select></label>}
        <label className="text-xs text-sky-200 sm:col-span-2">Career goal / path name<input className="inp mt-1" required maxLength={200} value={pf.title} onChange={e => setPf({ ...pf, title: e.target.value })} /></label>
        <label className="text-xs text-sky-200 sm:col-span-2">Description<textarea className="inp mt-1" rows={2} value={pf.description} onChange={e => setPf({ ...pf, description: e.target.value })} /></label>
        <div className="text-xs text-sky-200">Target date <span className="text-sky-100/50">(today or later)</span><div className="mt-1"><DatePicker value={pf.target_date} min={today} onChange={v => setPf({ ...pf, target_date: v })} placeholder="No target date" /></div></div>
        <div className="flex items-end gap-2"><button className="btn">{pf.id ? 'Update' : 'Create path'}</button><button type="button" className="btn-ghost" onClick={() => setPf(null)}><X className="h-4 w-4" />Cancel</button></div>
      </form>}
      {!sel && <>
        {S && <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Sum icon={Compass} label="Career paths" v={S.paths} sub={`${S.active} active · ${S.completed} completed`} />
          <Sum icon={BookOpen} label="Lessons completed" v={`${S.lessonsDone}/${S.lessonsTotal}`} sub={S.lessonsTotal ? `${Math.round(S.lessonsDone / S.lessonsTotal * 100)}% overall` : 'no lessons yet'} />
          <Sum icon={Clock} label="Study time" v={fmtMin(S.studyMinutes)} sub="logged in total" />
          <Sum icon={TrendingUp} label="This week" v={fmtMin(S.studyMinutesWeek)} sub="study time since Monday" /></div>}
        {data && !data.paths.length && <div className="card text-center text-sm text-sky-100/70">No career paths yet — click “New career path” and pick a template or build your own.</div>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data?.paths.map((p: any) => (
          <button key={p.id} onClick={() => setSel(p.id)} className="card text-left transition hover:border-sky-300/60">
            <div className="mb-1 font-bold">{p.title}</div>
            <div className="mb-2 flex flex-wrap items-center gap-2"><span className={`chip ${CLR[p.status]}`}>{p.status === 'completed' ? 'Completed' : p.target_date ? daysLabel(p.days_left) : 'No target date'}</span><span className="chip bg-white/10">{p.current_stage}</span></div>
            <div className="mb-1 flex justify-between text-xs"><span>{p.lessons_done}/{p.lessons_total} lessons</span><span>{p.progress}%</span></div><Bar v={p.progress} />
            <div className="mt-2 text-[11px] text-sky-100/60">{fmtMin(p.study_minutes)} studied{p.target_date ? ` · target ${fmtDate(p.target_date)}` : ''}</div>
          </button>))}</div>
      </>}
      {sel && !det && <div className="text-sky-200">Loading…</div>}
      {sel && det && <div className="space-y-4">
        <button className="btn-ghost !py-1 text-xs" onClick={() => { setSel(null); setDet(null); setYq(''); loadList(); }}><ArrowLeft className="h-3 w-3" />All paths</button>
        <div className="card">
          <div className="flex items-start justify-between gap-2"><div><h2 className="text-xl font-extrabold">{det.title}</h2>{det.description && <p className="mt-1 text-xs text-sky-100/70">{det.description}</p>}</div>
            <div className="flex gap-2 text-sky-300"><button aria-label="Edit path" onClick={() => setPf({ id: det.id, title: det.title, description: det.description, target_date: det.target_date })}><Pencil className="h-4 w-4" /></button><button aria-label="Delete path" onClick={() => delPath(det)}><Trash2 className="h-4 w-4" /></button></div></div>
          <div className="my-2 flex flex-wrap items-center gap-2"><span className={`chip ${CLR[det.status]}`}>{det.status === 'completed' ? 'Completed' : det.target_date ? daysLabel(det.days_left) : 'No target date'}</span>{det.target_date && <span className="text-[11px] text-sky-100/60">Target {fmtDate(det.target_date)}</span>}<span className="text-[11px] text-sky-100/60">· {fmtMin(det.study_minutes)} studied ({fmtMin(det.study_minutes_week)} this week)</span></div>
          <div className="mb-1 flex justify-between text-xs"><span>{det.lessons_done}/{det.lessons_total} lessons</span><span>{det.progress}%</span></div><Bar v={det.progress} />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">{det.stages.map((st: any) => (
          <div key={st.stage} className="card">
            <div className="mb-1 flex justify-between"><h3 className="font-bold">{st.stage}</h3><span className="text-xs text-sky-300">{st.done}/{st.total}</span></div><Bar v={st.progress} />
            {!st.total && <p className="mt-3 text-xs text-sky-100/60">No lessons in this stage yet.</p>}
            <ul className="mt-3 space-y-2">{st.lessons.map((l: any, i: number) => (
              <li key={l.id} draggable onDragStart={() => setDrag(l.id)} onDragEnd={() => setDrag(null)} onDragOver={e => { if (drag !== null) e.preventDefault(); }} onDrop={e => { e.preventDefault(); dropOn(st, l); }} className={`rounded-xl bg-white/5 p-2 text-sm ${drag === l.id ? 'opacity-40' : ''}`}>
                <div className="flex items-start gap-2"><span title="Drag to reorder" className="mt-0.5 cursor-grab text-sky-300/50"><GripVertical className="h-4 w-4" /></span>
                  <button aria-label={l.completed ? 'Mark not done' : 'Mark done'} onClick={() => toggle(l)} className={l.completed ? 'text-emerald-300' : 'text-sky-300'}>{l.completed ? <Check className="h-5 w-5" /> : <Circle className="h-5 w-5" />}</button>
                  <div className="min-w-0 flex-1"><div className={l.completed ? 'line-through opacity-60' : ''}>{l.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px]">{l.est_minutes > 0 && <span className="text-sky-100/60">{fmtMin(l.est_minutes)}</span>}
                      <a className="flex items-center gap-1 text-rose-300 hover:underline" href={l.youtube_url} target="_blank" rel="noopener noreferrer"><Youtube className="h-3 w-3" />YouTube</a>
                      <button className="flex items-center gap-1 text-rose-300 hover:underline" onClick={() => findFor(l)}><Search className="h-3 w-3" />Find videos</button>
                      {l.resource_url && <a className="flex items-center gap-1 text-sky-300 hover:underline" href={l.resource_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" />{l.resource_type}</a>}
                      {l.completed && l.completed_at && <span className="text-emerald-300/80">done {fmtDate(l.completed_at)}</span>}</div>
                    {l.video && <div className="mt-2 rounded-lg bg-black/20 p-2">
                      {play === l.id ? <div className="aspect-video w-full overflow-hidden rounded-lg"><iframe className="h-full w-full" src={l.video.embed_url} title={l.video.title || 'Lesson video'} loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>
                        : <button className="relative block w-full" onClick={() => setPlay(l.id)} aria-label="Play video"><img src={l.video.thumbnail} alt="" className="h-24 w-full rounded-lg object-cover" /><span className="absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-black/60 p-2"><Play className="h-5 w-5" /></span></span></button>}
                      <div className="mt-1 flex items-center justify-between gap-2 text-[11px]"><a className="line-clamp-1 min-w-0 text-sky-200 hover:underline" href={l.video.url} target="_blank" rel="noopener noreferrer">{l.video.title || 'Attached video'}{l.video.channel ? ` · ${l.video.channel}` : ''}</a>
                        <span className="flex shrink-0 gap-2">{play === l.id && <button className="text-sky-300 hover:underline" onClick={() => setPlay(null)}>Close</button>}<button className="text-rose-300 hover:underline" onClick={() => run(() => api(`/career/lessons/${l.id}/video`, 'DELETE'))}>Detach</button></span></div></div>}</div>
                  <div className="flex shrink-0 flex-col items-center"><button aria-label="Move lesson up" disabled={i === 0} className="text-sky-300/70 hover:text-sky-200 disabled:opacity-20" onClick={() => move(l, 'up')}><ChevronUp className="h-4 w-4" /></button><button aria-label="Move lesson down" disabled={i === st.lessons.length - 1} className="text-sky-300/70 hover:text-sky-200 disabled:opacity-20" onClick={() => move(l, 'down')}><ChevronDown className="h-4 w-4" /></button></div>
                  <button aria-label="Remove lesson" className="text-sky-300/60 hover:text-rose-300" onClick={() => delLesson(l)}><Trash2 className="h-3.5 w-3.5" /></button></div>
              </li>))}</ul>
          </div>))}</div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card"><div className="mb-2 flex items-center justify-between"><h3 className="font-bold">Lessons & resources</h3>{!lf && <button className="btn !px-3 !py-1 text-xs" onClick={() => setLf({ ...blankL })}><Plus className="h-3 w-3" />Add lesson</button>}</div>
            {lf ? <form onSubmit={addLesson} className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-sky-200 sm:col-span-2">Title<input className="inp mt-1" required value={lf.title} onChange={e => setLf({ ...lf, title: e.target.value })} /></label>
              <label className="text-xs text-sky-200">Stage<select className="inp mt-1" value={lf.stage} onChange={e => setLf({ ...lf, stage: e.target.value })}>{['Beginner', 'Intermediate', 'Advanced'].map(s => <option key={s}>{s}</option>)}</select></label>
              <label className="text-xs text-sky-200">Resource type<select className="inp mt-1" value={lf.resource_type} onChange={e => setLf({ ...lf, resource_type: e.target.value })}>{(data?.resource_types || []).map((s: string) => <option key={s}>{s}</option>)}</select></label>
              <label className="text-xs text-sky-200 sm:col-span-2">Resource link (optional)<input className="inp mt-1" placeholder="https://…" value={lf.resource_url} onChange={e => setLf({ ...lf, resource_url: e.target.value })} /></label>
              <label className="text-xs text-sky-200">YouTube search<input className="inp mt-1" placeholder="defaults to the title" value={lf.youtube_query} onChange={e => setLf({ ...lf, youtube_query: e.target.value })} /></label>
              <label className="text-xs text-sky-200">Estimated minutes<input className="inp mt-1" type="number" min={0} value={lf.est_minutes} onChange={e => setLf({ ...lf, est_minutes: Number(e.target.value) })} /></label>
              <div className="flex gap-2 sm:col-span-2"><button className="btn !py-1">Save lesson</button><button type="button" className="btn-ghost !py-1" onClick={() => setLf(null)}>Cancel</button></div></form>
              : <p className="text-xs text-sky-100/60">Every lesson has a working YouTube search link. Add your own lessons with any article, course or documentation link.</p>}
            <h3 className="mb-2 mt-4 flex items-center gap-2 font-bold"><Youtube className="h-4 w-4 text-rose-300" />Find videos</h3>
            <form onSubmit={search} className="flex gap-2"><input className="inp" value={yq} onChange={e => setYq(e.target.value)} placeholder="Search YouTube or paste a video link…" minLength={2} /><button className="btn !px-3" disabled={yl || yq.trim().length < 2}><Search className="h-4 w-4" /></button></form>
            {yt && <div className="mt-3 text-xs">
              <a className="flex items-center gap-1 text-rose-300 hover:underline" href={yt.search_url} target="_blank" rel="noopener noreferrer"><Youtube className="h-3 w-3" />Open results for “{yt.query}” on YouTube</a>
              {yt.note && <p className="mt-1 text-sky-100/60">{yt.note}</p>}
              {!!yt.videos.length && <label className="mt-2 block text-sky-200">Attach videos to lesson<select className="inp mt-1" value={vt} onChange={e => setVt(e.target.value)}><option value="">Choose a lesson…</option>{lessons.map((l: any) => <option key={l.id} value={l.id}>{l.stage} · {l.title}</option>)}</select></label>}
              <ul className="mt-2 space-y-2">{yt.videos.map((v: any) => <li key={v.id} className="flex gap-2 rounded-xl bg-white/5 p-2">{v.thumbnail && <img src={v.thumbnail} alt="" className="h-14 w-24 shrink-0 rounded object-cover" />}
                <div className="min-w-0"><a className="line-clamp-2 font-semibold hover:underline" href={v.url} target="_blank" rel="noopener noreferrer">{v.title || v.url}</a><div className="text-sky-100/60">{v.channel}</div>
                  <div className="mt-1 flex flex-wrap gap-3">{vt && <button className="flex items-center gap-1 text-sky-300 hover:underline" onClick={() => attach(vt, v)}><Paperclip className="h-3 w-3" />Attach to lesson</button>}
                  <button className="text-sky-300 hover:underline" onClick={() => run(() => api(`/career/paths/${sel}/lessons`, 'POST', { title: (v.title || 'YouTube video').slice(0, 200), stage: det.current_stage, resource_url: v.url, resource_type: 'video', youtube_query: yq }))}>+ Add as lesson ({det.current_stage})</button></div></div></li>)}</ul>
              {yt.next_page_token && <button className="btn-ghost mt-2 !py-1 text-xs" disabled={yl} onClick={more}>Load more videos</button>}</div>}
          </div>
          <div className="card"><div className="mb-2 flex items-center justify-between"><h3 className="font-bold">Study hours</h3>{!sf && <button className="btn !px-3 !py-1 text-xs" onClick={() => setSf({ minutes: 30, date: today, lesson_id: '', note: '' })}><Plus className="h-3 w-3" />Log study time</button>}</div>
            {sf && <form onSubmit={addStudy} className="mb-3 grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-sky-200">Minutes<input className="inp mt-1" type="number" min={1} max={1440} required value={sf.minutes} onChange={e => setSf({ ...sf, minutes: e.target.value })} /></label>
              <div className="text-xs text-sky-200">Date<div className="mt-1"><DatePicker value={sf.date} onChange={v => setSf({ ...sf, date: v || today })} clearable={false} /></div></div>
              <label className="text-xs text-sky-200 sm:col-span-2">Lesson (optional)<select className="inp mt-1" value={sf.lesson_id} onChange={e => setSf({ ...sf, lesson_id: e.target.value })}><option value="">General study</option>{lessons.map((l: any) => <option key={l.id} value={l.id}>{l.title}</option>)}</select></label>
              <label className="text-xs text-sky-200 sm:col-span-2">Note<input className="inp mt-1" maxLength={300} value={sf.note} onChange={e => setSf({ ...sf, note: e.target.value })} /></label>
              <div className="flex gap-2 sm:col-span-2"><button className="btn !py-1">Save</button><button type="button" className="btn-ghost !py-1" onClick={() => setSf(null)}>Cancel</button></div></form>}
            <div className="mb-2 grid gap-2 rounded-xl bg-white/5 p-2 text-[11px] sm:grid-cols-2">
              <div className="text-sky-200">From<div className="mt-1"><DatePicker value={lfil.from} onChange={v => applyFil({ ...lfil, from: v || '' })} placeholder="Any date" /></div></div>
              <div className="text-sky-200">To<div className="mt-1"><DatePicker value={lfil.to} onChange={v => applyFil({ ...lfil, to: v || '' })} placeholder="Any date" /></div></div>
              <label className="text-sky-200">Lesson<select className="inp mt-1" value={lfil.lesson_id} onChange={e => applyFil({ ...lfil, lesson_id: e.target.value })}><option value="">All</option><option value="none">General study</option>{lessons.map((l: any) => <option key={l.id} value={l.id}>{l.title}</option>)}</select></label>
              <label className="text-sky-200">Search notes<input className="inp mt-1" maxLength={60} value={lfil.q} onChange={e => setLfil({ ...lfil, q: e.target.value })} onBlur={() => loadLogs()} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); loadLogs(); } }} /></label>
              {(lfil.from || lfil.to || lfil.lesson_id || lfil.q) && <button className="btn-ghost !py-1 text-xs sm:col-span-2" onClick={() => applyFil({ from: '', to: '', lesson_id: '', q: '' })}><X className="h-3 w-3" />Clear filters</button>}</div>
            {lg && <div className="mb-2 flex items-center gap-1 text-[11px] text-sky-100/70"><Filter className="h-3 w-3" />{lg.total} {lg.total === 1 ? 'log' : 'logs'} · <b>{fmtMin(lg.total_minutes)}</b> total{(lfil.from || lfil.to || lfil.lesson_id || lfil.q) ? ' (filtered)' : ''}</div>}
            {lg && !lg.logs.length && <p className="text-xs text-sky-100/60">{(lfil.from || lfil.to || lfil.lesson_id || lfil.q) ? 'No study logs match these filters.' : 'No study time logged yet.'}</p>}
            <ul className="space-y-1">{(lg?.logs || []).map((x: any) => ef && ef.id === x.id ? <li key={x.id} className="rounded-lg bg-white/10 p-2">
                <form onSubmit={saveEdit} className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-sky-200">Minutes<input className="inp mt-1" type="number" min={1} max={1440} required value={ef.minutes} onChange={e => setEf({ ...ef, minutes: e.target.value })} /></label>
                  <div className="text-xs text-sky-200">Date<div className="mt-1"><DatePicker value={ef.date} onChange={v => setEf({ ...ef, date: v || x.log_date })} clearable={false} /></div></div>
                  <label className="text-xs text-sky-200 sm:col-span-2">Lesson<select className="inp mt-1" value={ef.lesson_id} onChange={e => setEf({ ...ef, lesson_id: e.target.value })}><option value="">General study</option>{lessons.map((l: any) => <option key={l.id} value={l.id}>{l.title}</option>)}</select></label>
                  <label className="text-xs text-sky-200 sm:col-span-2">Note<input className="inp mt-1" maxLength={300} value={ef.note} onChange={e => setEf({ ...ef, note: e.target.value })} /></label>
                  <div className="flex gap-2 sm:col-span-2"><button className="btn !py-1">Save changes</button><button type="button" className="btn-ghost !py-1" onClick={() => setEf(null)}>Cancel</button></div></form></li>
              : <li key={x.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-xs"><span className="min-w-0"><b>{fmtMin(x.minutes)}</b> · {fmtDate(x.log_date)}{x.lesson_title ? ` · ${x.lesson_title}` : ''}{x.note ? ` · ${x.note}` : ''}{x.updated_at ? <span className="text-sky-100/40"> · edited</span> : null}</span>
                <span className="flex shrink-0 gap-2"><button aria-label="Edit log" className="text-sky-300/70 hover:text-sky-200" onClick={() => { setSf(null); setEf({ id: x.id, minutes: x.minutes, date: x.log_date, lesson_id: x.lesson_id ? String(x.lesson_id) : '', note: x.note || '' }); }}><Pencil className="h-3.5 w-3.5" /></button>
                <button aria-label="Delete log" className="text-sky-300/60 hover:text-rose-300" onClick={() => delLog(x)}><Trash2 className="h-3.5 w-3.5" /></button></span></li>)}</ul>
            {lg?.has_more && <button className="btn-ghost mt-2 !py-1 text-xs" disabled={lgBusy} onClick={() => loadLogs(lfil, sel, true)}>Load more ({lg.total - lg.logs.length} left)</button>}
          </div>
        </div>
      </div>}
    </div>
  );
}
