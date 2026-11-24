import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Play, Check, RotateCcw, Timer, Layers, Clock, CheckCircle2, CalendarDays, Repeat, Flag, Bell } from 'lucide-react';
import { api } from '../api';
import DatePicker from '../components/DatePicker';
import { CalendarView, MilestonesView, RecurringView, ReminderWatcher, RemindersView } from '../components/PlannerExtras';
import { distribute, fmtDate, fmtMin, todayStr } from '../dates';

const CLR: Record<string, string> = { planned: 'bg-sky-400/20 text-sky-200', in_progress: 'bg-amber-400/20 text-amber-200', completed: 'bg-emerald-400/20 text-emerald-200' };
const LBL: Record<string, string> = { planned: 'Planned', in_progress: 'In progress', completed: 'Completed' };
const Sum = ({ icon: I, label, v, sub }: any) => <div className="card !p-4"><div className="mb-1 flex items-center gap-2 text-xs text-sky-200"><I className="h-4 w-4" />{label}</div><div className="text-2xl font-extrabold">{v}</div><div className="text-[11px] text-sky-100/60">{sub}</div></div>;
const blank = () => ({ title: '', plan_date: todayStr(), hours: 1, minutes: 0, picked: [] as number[], extra: [] as string[], newName: '' });

function Elapsed({ since }: { since: string }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
  return <span className="font-mono text-xs text-amber-200"><Timer className="mr-1 inline h-3 w-3" />{String(Math.floor(s / 3600)).padStart(2, '0')}:{String(Math.floor(s / 60) % 60).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>;
}

export default function StudyPlanner() {
  const [data, setData] = useState<any>(null), [f, setF] = useState<any>(null), [ed, setEd] = useState<any>(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('plans');
  const load = () => api('/study-plans').then(setData).catch(e => setErr(e.message));
  // recurring plans are generated server-side; ask for a refresh first so today's/upcoming occurrences are in the list, and reload whenever the Plans tab is shown
  useEffect(() => { if (tab === 'plans') api('/planner/recurrences').catch(() => null).then(load); }, [tab]);

  const total = f ? Number(f.hours || 0) * 60 + Number(f.minutes || 0) : 0, count = f ? f.picked.length + f.extra.length : 0;
  const names = f && data ? [...f.picked.map((id: number) => data.subjects.find((s: any) => s.id === id)?.subject), ...f.extra] : [];
  const preview = f && count && total >= count ? distribute(total, count) : [];
  const toggle = (id: number) => setF({ ...f, picked: f.picked.includes(id) ? f.picked.filter((x: number) => x !== id) : [...f.picked, id] });
  const addName = () => { const n = f.newName.trim(); if (!n) return; const known = data.subjects.find((s: any) => s.subject.toLowerCase() === n.toLowerCase()); if (known) setF({ ...f, picked: f.picked.includes(known.id) ? f.picked : [...f.picked, known.id], newName: '' }); else if (!f.extra.some((x: string) => x.toLowerCase() === n.toLowerCase())) setF({ ...f, extra: [...f.extra, n], newName: '' }); else setF({ ...f, newName: '' }); };
  const create = async (e: any) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api('/study-plans', 'POST', { title: f.title, plan_date: f.plan_date, hours: Number(f.hours || 0), minutes: Number(f.minutes || 0), subjects: [...f.picked.map((id: number) => ({ id })), ...f.extra] }); setF(null); load(); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const act = async (p: any, it: any, a: string) => { setErr(''); try { await api(`/study-plans/${p.id}/items/${it.id}/${a}`, 'POST'); load(); } catch (x: any) { setErr(x.message); } };
  const del = async (p: any) => { if (confirm(`Delete plan "${p.title}"?`)) { await api('/study-plans/' + p.id, 'DELETE'); load(); } };

  // ---- editing allocations (never lets the sum go over the total) ----
  const startEdit = (p: any) => { setErr(''); setEd({ id: p.id, title: p.title, hours: Math.floor(p.total_minutes / 60), minutes: p.total_minutes % 60, alloc: Object.fromEntries(p.items.map((i: any) => [i.id, i.allocated_minutes])), items: p.items }); };
  const edTotal = ed ? Number(ed.hours || 0) * 60 + Number(ed.minutes || 0) : 0;
  const edSum = ed ? ed.items.reduce((s: number, i: any) => s + (Number(ed.alloc[i.id]) || 0), 0) : 0, edLeft = edTotal - edSum;
  const setAlloc = (id: number, v: string) => { const raw = Math.max(0, Math.floor(Number(v) || 0)); const others = edSum - (Number(ed.alloc[id]) || 0); setEd({ ...ed, alloc: { ...ed.alloc, [id]: Math.min(raw, Math.max(0, edTotal - others)) } }); }; // clamps so the total is never exceeded
  const shareEqually = () => { const open = ed.items.filter((i: any) => i.status !== 'done'); if (!open.length) return; const locked = ed.items.filter((i: any) => i.status === 'done').reduce((s: number, i: any) => s + i.allocated_minutes, 0); const parts = distribute(Math.max(0, edTotal - locked), open.length); const a = { ...ed.alloc }; open.forEach((i: any, k: number) => (a[i.id] = parts[k])); setEd({ ...ed, alloc: a }); };
  const saveEdit = async () => {
    setErr('');
    try { await api('/study-plans/' + ed.id, 'PUT', { title: ed.title, total_minutes: edTotal, allocations: ed.items.filter((i: any) => i.status !== 'done').map((i: any) => ({ id: i.id, minutes: Number(ed.alloc[i.id]) })) }); setEd(null); load(); }
    catch (x: any) { setErr(x.message); }
  };
  const S = data?.summary;
  return (
    <div>
      <div className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-extrabold">Study Planner</h1>{tab === 'plans' && <button className="btn" onClick={() => { setErr(''); setF(blank()); }}><Plus className="h-4 w-4" />New plan</button>}</div>
      <ReminderWatcher />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Study Planner sections">
        {([['plans', 'Plans', Layers], ['calendar', 'Calendar', CalendarDays], ['recurring', 'Recurring', Repeat], ['milestones', 'Milestones', Flag], ['reminders', 'Reminders', Bell]] as any[]).map(([k, label, I]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={tab === k ? 'btn !py-1.5' : 'btn-ghost !py-1.5'}><I className="h-4 w-4" />{label}</button>)}
      </div>
      {tab === 'calendar' && <CalendarView />}{tab === 'recurring' && <RecurringView />}{tab === 'milestones' && <MilestonesView />}{tab === 'reminders' && <RemindersView />}
      {tab === 'plans' && <>
      {S && <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Sum icon={Layers} label="Plans" v={S.plans} sub={`${S.sessions} sessions`} />
        <Sum icon={CheckCircle2} label="Sessions done" v={`${S.sessionsDone}/${S.sessions}`} sub={S.sessions ? `${Math.round(S.sessionsDone / S.sessions * 100)}% complete` : 'nothing planned'} />
        <Sum icon={Clock} label="Study time" v={fmtMin(S.completedMinutes)} sub={`of ${fmtMin(S.plannedMinutes)} planned`} />
        <Sum icon={Timer} label="Progress" v={S.progress_pct + '%'} sub={S.active ? `Now: ${S.active.subject_name}` : 'No session running'} />
      </div>}
      {err && <div className="mb-3 text-sm text-rose-300">{err}</div>}
      {f && <form onSubmit={create} className="card mb-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-sky-200">Plan name<input className="inp mt-1" placeholder="e.g. Exam revision" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
        <div className="text-xs text-sky-200">Date<div className="mt-1"><DatePicker value={f.plan_date} onChange={v => setF({ ...f, plan_date: v })} clearable={false} /></div></div>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2"><label className="text-xs text-sky-200">Total hours<input className="inp mt-1" type="number" min={0} max={24} value={f.hours} onChange={e => setF({ ...f, hours: e.target.value })} /></label>
          <label className="text-xs text-sky-200">Minutes<input className="inp mt-1" type="number" min={0} max={59} value={f.minutes} onChange={e => setF({ ...f, minutes: e.target.value })} /></label></div>
        <div className="sm:col-span-2"><div className="mb-1 text-xs text-sky-200">Subjects (select one or more)</div>
          <div className="flex flex-wrap gap-2">{data?.subjects.map((s: any) => <button type="button" key={s.id} onClick={() => toggle(s.id)} className={`chip !px-3 !py-1.5 ${f.picked.includes(s.id) ? 'bg-sky-500/40 ring-1 ring-sky-300' : 'bg-white/5'}`}>{f.picked.includes(s.id) && <Check className="mr-1 h-3 w-3" />}{s.subject}</button>)}
            {f.extra.map((n: string) => <button type="button" key={n} onClick={() => setF({ ...f, extra: f.extra.filter((x: string) => x !== n) })} className="chip !px-3 !py-1.5 bg-emerald-500/25 ring-1 ring-emerald-300/60">{n} <span className="ml-1 text-[10px]">(new)</span><X className="ml-1 h-3 w-3" /></button>)}
            {!data?.subjects.length && !f.extra.length && <span className="text-xs text-sky-100/60">No subjects yet — add one below.</span>}</div>
          <div className="mt-2 flex gap-2"><input className="inp" placeholder="Create a new subject…" value={f.newName} onChange={e => setF({ ...f, newName: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addName(); } }} /><button type="button" className="btn-ghost shrink-0" onClick={addName}><Plus className="h-4 w-4" />Add</button></div></div>
        <div className="rounded-xl bg-white/5 p-3 text-xs sm:col-span-2">{preview.length ? <><b>{fmtMin(total)}</b> shared equally: {preview.map((m, i) => <span key={i} className="mr-2 inline-block"><span className="text-sky-300">{names[i]}</span> {m}m</span>)}{total % count ? <div className="mt-1 text-sky-100/60">{total % count} spare minute{total % count > 1 ? 's' : ''} given one each to the first subject{total % count > 1 ? 's' : ''}, so the total is exact.</div> : null}</>
          : <span className="text-sky-100/60">{count && total < count ? 'Not enough time for that many subjects (1 minute minimum each).' : 'Choose a total time and at least one subject to see the split.'}</span>}</div>
        <div className="flex gap-2 sm:col-span-2"><button className="btn" disabled={busy || !preview.length}>Create plan</button><button type="button" className="btn-ghost" onClick={() => setF(null)}><X className="h-4 w-4" />Cancel</button></div>
      </form>}
      {data && !data.plans.length && <div className="card text-center text-sm text-sky-100/70">No study plans yet — click “New plan” to split your study time across subjects.</div>}
      <div className="space-y-4">
        {data?.plans.map((p: any) => { const editing = ed && ed.id === p.id; return (
          <div key={p.id} className="card">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div><div className="text-lg font-bold">{p.title}</div><div className="text-xs text-sky-100/70">{fmtDate(p.plan_date)}{p.plan_date === data.today ? ' · today' : ''} · {fmtMin(p.total_minutes)} total{p.unallocated_minutes > 0 ? ` · ${p.unallocated_minutes}m unallocated` : ''}</div></div>
              <div className="flex items-center gap-3"><span className={`chip ${CLR[p.status]}`}>{LBL[p.status]}</span><button aria-label="Edit allocations" className="text-sky-300" onClick={() => (editing ? setEd(null) : startEdit(p))}><Pencil className="h-4 w-4" /></button><button aria-label="Delete plan" className="text-sky-300" onClick={() => del(p)}><Trash2 className="h-4 w-4" /></button></div>
            </div>
            <div className="mb-1 flex justify-between text-xs text-sky-100/80"><span>{p.items_done}/{p.items_total} sessions · {fmtMin(p.completed_minutes)} of {fmtMin(p.allocated_minutes)}</span><span>{p.progress_pct}%</span></div>
            <div className="bar mb-3"><div style={{ width: p.progress_pct + '%' }} /></div>
            {editing && <div className="mb-3 grid gap-3 rounded-xl bg-white/5 p-3 sm:grid-cols-3">
              <label className="text-xs text-sky-200 sm:col-span-3">Plan name<input className="inp mt-1" value={ed.title} onChange={e => setEd({ ...ed, title: e.target.value })} /></label>
              <label className="text-xs text-sky-200">Hours<input className="inp mt-1" type="number" min={0} max={24} value={ed.hours} onChange={e => setEd({ ...ed, hours: e.target.value })} /></label>
              <label className="text-xs text-sky-200">Minutes<input className="inp mt-1" type="number" min={0} max={59} value={ed.minutes} onChange={e => setEd({ ...ed, minutes: e.target.value })} /></label>
              <div className={`self-end text-xs ${edLeft < 0 ? 'text-rose-300' : 'text-sky-100/80'}`}>Allocated {edSum}m of {edTotal}m · {edLeft >= 0 ? `${edLeft}m left` : `${-edLeft}m over`}</div></div>}
            <div className="space-y-2">
              {p.items.map((it: any) => (
                <div key={it.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
                  <div className={`min-w-0 flex-1 ${it.status === 'done' ? 'opacity-60' : ''}`}><div className={`font-semibold ${it.status === 'done' ? 'line-through' : ''}`}>{it.subject_name}</div>
                    <div className="text-xs text-sky-100/70">{it.status === 'active' && it.started_at ? <Elapsed since={it.started_at} /> : it.status === 'done' ? 'Completed' : 'Not started'}</div></div>
                  {editing && it.status !== 'done' ? <div className="flex items-center gap-1 text-xs"><input className="inp !w-20 !py-1" type="number" min={1} value={ed.alloc[it.id] ?? 0} onChange={e => setAlloc(it.id, e.target.value)} />min</div>
                    : <span className="text-sm font-bold text-sky-200">{fmtMin(it.allocated_minutes)}</span>}
                  <div className="flex gap-2 text-xs">
                    {it.status === 'pending' && <button className="btn !px-3 !py-1" onClick={() => act(p, it, 'start')}><Play className="h-3 w-3" />Start</button>}
                    {it.status !== 'done' && <button className={it.status === 'active' ? 'btn !px-3 !py-1' : 'btn-ghost !px-3 !py-1'} onClick={() => act(p, it, 'complete')}><Check className="h-3 w-3" />Complete</button>}
                    {it.status !== 'pending' && <button className="btn-ghost !px-3 !py-1" aria-label="Reset session" onClick={() => act(p, it, 'reset')}><RotateCcw className="h-3 w-3" /></button>}
                  </div>
                </div>))}
            </div>
            {editing && <div className="mt-3 flex flex-wrap gap-2"><button className="btn" disabled={edLeft < 0 || edTotal < 1} onClick={saveEdit}>Save changes</button><button className="btn-ghost" onClick={shareEqually}>Share remaining time equally</button><button className="btn-ghost" onClick={() => setEd(null)}><X className="h-4 w-4" />Cancel</button></div>}
          </div>); })}
      </div>
      </>}
    </div>
  );
}
