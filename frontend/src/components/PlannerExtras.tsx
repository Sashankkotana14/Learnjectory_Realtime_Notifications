import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, X, Check, ChevronLeft, ChevronRight, Repeat, Pause, Play, Flag, Bell, BellOff, Pencil, ClipboardList, CalendarClock } from 'lucide-react';
import { api } from '../api';
import DatePicker from './DatePicker';
import { MONTHS, addDays, fmtDate, fmtMin, todayStr } from '../dates';

// Study Planner additions: Calendar view, Recurring plans, Goal milestones, Habit reminders.
// Uses the same design tokens/classes (card, btn, btn-ghost, inp, chip, bar) as the rest of the Study Planner.
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dowOf = (s: string) => (new Date(s + 'T00:00:00Z').getUTCDay() + 6) % 7;
const weekStart = (s: string) => addDays(s, -dowOf(s));
const pad2 = (n: number) => String(n).padStart(2, '0');
const Err = ({ m }: { m: string }) => (m ? <div className="mb-3 text-sm text-rose-300">{m}</div> : null);
const DayChips = ({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) => (
  <div className="flex flex-wrap gap-2">{DAYS.map((d, i) => { const on = value.includes(i); return <button type="button" key={d} aria-pressed={on} onClick={() => onChange(on ? value.filter(x => x !== i) : [...value, i].sort())} className={`chip !px-3 !py-1.5 ${on ? 'bg-sky-500/40 ring-1 ring-sky-300' : 'bg-white/5'}`}>{d}</button>; })}</div>
);

// ---------------------------------------------------------------- 1. Calendar view
export function CalendarView() {
  const t = todayStr();
  const [ym, setYm] = useState({ y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) - 1 }), [sel, setSel] = useState(t), [cal, setCal] = useState<any>(null), [err, setErr] = useState('');
  const first = `${ym.y}-${pad2(ym.m + 1)}-01`, from = weekStart(first), to = addDays(from, 41);
  useEffect(() => { setErr(''); api(`/planner/calendar?from=${from}&to=${to}`).then(setCal).catch(e => setErr(e.message)); }, [from, to]);
  const move = (n: number) => { const d = new Date(Date.UTC(ym.y, ym.m + n, 1)); setYm({ y: d.getUTCFullYear(), m: d.getUTCMonth() }); };
  const cells = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  const info = (d: string) => cal?.days?.[d] || { plans: [], upcoming: [], tasks: [], milestones: [] };
  const sd = info(sel);
  const tone: Record<string, string> = { plan: 'bg-sky-500/30 text-sky-100', done: 'bg-emerald-500/25 text-emerald-100 line-through', task: 'bg-amber-400/25 text-amber-100', ms: 'bg-pink-500/25 text-pink-100', up: 'border border-dashed border-sky-300/50 text-sky-200' };
  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><button className="btn-ghost !px-2 !py-1" aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></button>
          <div className="min-w-[10rem] text-center text-lg font-bold">{MONTHS[ym.m]} {ym.y}</div>
          <button className="btn-ghost !px-2 !py-1" aria-label="Next month" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></button></div>
        <button className="btn-ghost !py-1" onClick={() => { setYm({ y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) - 1 }); setSel(t); }}>Today</button>
      </div>
      <Err m={err} />
      <div className="mb-3 flex flex-wrap gap-2 text-[11px]"><span className={`chip ${tone.plan}`}>Study plan</span><span className={`chip ${tone.up}`}>Upcoming recurring</span><span className={`chip ${tone.task}`}>Task / assignment</span><span className={`chip ${tone.ms}`}>Milestone</span></div>
      <div className="overflow-x-auto"><div className="min-w-[640px]">
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-sky-200">{DAYS.map(d => <div key={d} className="py-1">{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map(d => { const i = info(d), inMonth = d.slice(0, 7) === first.slice(0, 7), items = [
            ...i.plans.map((p: any) => ({ k: p.status === 'completed' ? 'done' : 'plan', t: p.title })), ...i.upcoming.map((p: any) => ({ k: 'up', t: p.title })),
            ...i.tasks.map((x: any) => ({ k: x.done ? 'done' : 'task', t: x.title })), ...i.milestones.map((x: any) => ({ k: x.done ? 'done' : 'ms', t: x.title }))];
            return (
              <button key={d} onClick={() => setSel(d)} aria-label={fmtDate(d)} className={`min-h-[84px] rounded-xl p-1.5 text-left align-top transition ${inMonth ? 'bg-white/5' : 'bg-white/[.02] opacity-50'} ${d === sel ? 'ring-2 ring-sky-300' : 'hover:bg-white/10'}`}>
                <div className={`mb-1 text-xs font-bold ${d === t ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-white' : 'text-sky-100/80'}`}>{Number(d.slice(8))}</div>
                <div className="space-y-0.5">{items.slice(0, 3).map((x, n) => <div key={n} className={`truncate rounded px-1 text-[10px] ${tone[x.k]}`}>{x.t}</div>)}{items.length > 3 && <div className="text-[10px] text-sky-100/60">+{items.length - 3} more</div>}</div>
              </button>); })}
        </div>
      </div></div>
      <div className="mt-4 rounded-xl bg-white/5 p-3">
        <div className="mb-2 font-bold">{fmtDate(sel)}{sel === t ? ' · today' : ''}</div>
        {!sd.plans.length && !sd.upcoming.length && !sd.tasks.length && !sd.milestones.length && <div className="text-sm text-sky-100/60">Nothing scheduled for this day.</div>}
        <div className="space-y-2 text-sm">
          {sd.plans.map((p: any) => <div key={'p' + p.id} className="flex flex-wrap items-center justify-between gap-2"><div><span className="font-semibold">{p.title}</span>{p.recurring && <Repeat className="ml-1 inline h-3 w-3 text-sky-300" aria-label="Recurring" />}<div className="text-xs text-sky-100/70">{p.subjects.join(', ')} · {fmtMin(p.total_minutes)} · {p.items_done}/{p.items_total} sessions</div></div><span className={`chip ${p.status === 'completed' ? 'bg-emerald-400/20 text-emerald-200' : p.status === 'in_progress' ? 'bg-amber-400/20 text-amber-200' : 'bg-sky-400/20 text-sky-200'}`}>{p.status === 'in_progress' ? 'In progress' : p.status === 'completed' ? 'Completed' : 'Planned'}</span></div>)}
          {sd.upcoming.map((p: any) => <div key={'u' + p.recurrence_id} className="text-sky-200"><Repeat className="mr-1 inline h-3 w-3" />{p.title} <span className="text-xs text-sky-100/60">· {p.subjects.join(', ')} · {fmtMin(p.total_minutes)} · scheduled</span></div>)}
          {sd.tasks.map((x: any) => <div key={x.kind + x.id} className={x.done ? 'opacity-60' : ''}><ClipboardList className="mr-1 inline h-3 w-3 text-amber-300" />{x.title} <span className="text-xs text-sky-100/60">· {x.kind === 'assignment' ? `Assignment due${x.subject ? ' · ' + x.subject : ''}` : `Study session · ${fmtMin(x.minutes)}`}{x.done ? ' · done' : ''}</span></div>)}
          {sd.milestones.map((x: any) => <div key={'m' + x.id} className={x.done ? 'opacity-60' : ''}><Flag className="mr-1 inline h-3 w-3 text-pink-300" />{x.title} <span className="text-xs text-sky-100/60">· Milestone for “{x.goal_title}”{x.done ? ' · done' : ''}</span></div>)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 2. Recurring study plans
const blankRec = () => ({ id: 0, title: '', start_date: todayStr(), end_date: '', hours: 1, minutes: 0, frequency: 'daily', interval_n: 1, interval_unit: 'days', days: [] as number[], picked: [] as number[], extra: [] as string[], newName: '' });
export function RecurringView() {
  const [data, setData] = useState<any>(null), [subjects, setSubjects] = useState<any[]>([]), [f, setF] = useState<any>(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const load = () => api('/planner/recurrences').then(setData).catch(e => setErr(e.message));
  useEffect(() => { load(); api('/academics').then(d => setSubjects(d.subjects || [])).catch(() => {}); }, []);
  const weekly = f && (f.frequency === 'weekly' || (f.frequency === 'custom' && f.interval_unit === 'weeks'));
  const total = f ? Number(f.hours || 0) * 60 + Number(f.minutes || 0) : 0, count = f ? f.picked.length + f.extra.length : 0;
  const toggle = (id: number) => setF({ ...f, picked: f.picked.includes(id) ? f.picked.filter((x: number) => x !== id) : [...f.picked, id] });
  const addName = () => { const n = f.newName.trim(); if (!n) return; const known = subjects.find((s: any) => s.subject.toLowerCase() === n.toLowerCase()); if (known) setF({ ...f, picked: f.picked.includes(known.id) ? f.picked : [...f.picked, known.id], newName: '' }); else if (!f.extra.some((x: string) => x.toLowerCase() === n.toLowerCase())) setF({ ...f, extra: [...f.extra, n], newName: '' }); else setF({ ...f, newName: '' }); };
  const edit = (r: any) => { setErr(''); setF({ id: r.id, title: r.title, start_date: r.start_date, end_date: r.end_date || '', hours: Math.floor(r.total_minutes / 60), minutes: r.total_minutes % 60, frequency: r.frequency, interval_n: r.interval_n, interval_unit: r.interval_unit, days: r.days_of_week, picked: r.subjects.filter((s: any) => subjects.some((x: any) => x.id === s.id)).map((s: any) => s.id), extra: r.subjects.filter((s: any) => !subjects.some((x: any) => x.id === s.id)).map((s: any) => s.name), newName: '' }); };
  const save = async (e: any) => {
    e.preventDefault(); setErr(''); setBusy(true);
    const body: any = { title: f.title, start_date: f.start_date, end_date: f.end_date || null, hours: Number(f.hours || 0), minutes: Number(f.minutes || 0), frequency: f.frequency, interval_n: Number(f.interval_n || 1), interval_unit: f.interval_unit, days_of_week: weekly ? f.days : [], subjects: [...f.picked.map((id: number) => ({ id })), ...f.extra] };
    try { await api(f.id ? '/planner/recurrences/' + f.id : '/planner/recurrences', f.id ? 'PUT' : 'POST', body); setF(null); load(); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const toggleActive = async (r: any) => { setErr(''); try { await api('/planner/recurrences/' + r.id, 'PUT', { active: !r.active }); load(); } catch (x: any) { setErr(x.message); } };
  const del = async (r: any) => { if (confirm(`Delete recurring plan "${r.title}"? Upcoming untouched sessions are removed; started or completed ones are kept.`)) { try { await api('/planner/recurrences/' + r.id, 'DELETE'); load(); } catch (x: any) { setErr(x.message); } } };
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><div className="text-sm text-sky-100/70">Repeat a study plan daily, weekly or on a custom schedule. Upcoming plans appear automatically in your plan list for the next {data?.window_days || 14} days.</div>
        {!f && <button className="btn shrink-0" onClick={() => { setErr(''); setF(blankRec()); }}><Plus className="h-4 w-4" />New recurring plan</button>}</div>
      <Err m={err} />
      {f && <form onSubmit={save} className="card mb-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-sky-200">Plan name<input className="inp mt-1" placeholder="e.g. Evening revision" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-xs text-sky-200">Hours<input className="inp mt-1" type="number" min={0} max={24} value={f.hours} onChange={e => setF({ ...f, hours: e.target.value })} /></label><label className="text-xs text-sky-200">Minutes<input className="inp mt-1" type="number" min={0} max={59} value={f.minutes} onChange={e => setF({ ...f, minutes: e.target.value })} /></label></div>
        <div className="text-xs text-sky-200">Starts<div className="mt-1"><DatePicker value={f.start_date} min={f.id ? undefined : todayStr()} onChange={v => setF({ ...f, start_date: v })} clearable={false} /></div></div>
        <div className="text-xs text-sky-200">Ends (optional)<div className="mt-1"><DatePicker value={f.end_date} min={f.start_date} placeholder="Never" onChange={v => setF({ ...f, end_date: v })} /></div></div>
        <label className="text-xs text-sky-200">Repeats<select className="inp mt-1" value={f.frequency} onChange={e => setF({ ...f, frequency: e.target.value })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="custom">Custom</option></select></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-xs text-sky-200">Every<input className="inp mt-1" type="number" min={1} max={365} value={f.interval_n} onChange={e => setF({ ...f, interval_n: e.target.value })} /></label>
          {f.frequency === 'custom' ? <label className="text-xs text-sky-200">Unit<select className="inp mt-1" value={f.interval_unit} onChange={e => setF({ ...f, interval_unit: e.target.value })}><option value="days">day(s)</option><option value="weeks">week(s)</option></select></label>
            : <div className="self-end pb-2 text-xs text-sky-100/70">{f.frequency === 'daily' ? 'day(s)' : 'week(s)'}</div>}</div>
        {weekly && <div className="sm:col-span-2"><div className="mb-1 text-xs text-sky-200">On these days (defaults to the start date’s weekday)</div><DayChips value={f.days} onChange={v => setF({ ...f, days: v })} /></div>}
        <div className="sm:col-span-2"><div className="mb-1 text-xs text-sky-200">Subjects (select one or more)</div>
          <div className="flex flex-wrap gap-2">{subjects.map((s: any) => <button type="button" key={s.id} onClick={() => toggle(s.id)} className={`chip !px-3 !py-1.5 ${f.picked.includes(s.id) ? 'bg-sky-500/40 ring-1 ring-sky-300' : 'bg-white/5'}`}>{f.picked.includes(s.id) && <Check className="mr-1 h-3 w-3" />}{s.subject}</button>)}
            {f.extra.map((n: string) => <button type="button" key={n} onClick={() => setF({ ...f, extra: f.extra.filter((x: string) => x !== n) })} className="chip !px-3 !py-1.5 bg-emerald-500/25 ring-1 ring-emerald-300/60">{n} <span className="ml-1 text-[10px]">(new)</span><X className="ml-1 h-3 w-3" /></button>)}</div>
          <div className="mt-2 flex gap-2"><input className="inp" placeholder="Create a new subject…" value={f.newName} onChange={e => setF({ ...f, newName: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addName(); } }} /><button type="button" className="btn-ghost shrink-0" onClick={addName}><Plus className="h-4 w-4" />Add</button></div></div>
        <div className="flex gap-2 sm:col-span-2"><button className="btn" disabled={busy || !count || total < count}>{f.id ? 'Save changes' : 'Create recurring plan'}</button><button type="button" className="btn-ghost" onClick={() => setF(null)}><X className="h-4 w-4" />Cancel</button></div>
        {f.id ? <div className="text-[11px] text-sky-100/60 sm:col-span-2">Saving rebuilds upcoming sessions that haven’t been started; started or completed sessions are kept as they are.</div> : null}
      </form>}
      {data && !data.recurrences.length && !f && <div className="card text-center text-sm text-sky-100/70">No recurring plans yet — click “New recurring plan” to repeat a study routine.</div>}
      <div className="space-y-3">{data?.recurrences.map((r: any) => (
        <div key={r.id} className={`card ${r.active ? '' : 'opacity-70'}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><div className="text-lg font-bold"><Repeat className="mr-2 inline h-4 w-4 text-sky-300" />{r.title}</div>
              <div className="text-xs text-sky-100/70">{r.description} · {fmtMin(r.total_minutes)} · {r.subjects.map((s: any) => s.name).join(', ')}</div>
              <div className="text-xs text-sky-100/60">{fmtDate(r.start_date)}{r.end_date ? ` → ${fmtDate(r.end_date)}` : ' → no end date'}{r.active ? (r.next_date ? ` · next: ${fmtDate(r.next_date)}` : ' · finished') : ' · paused'}</div></div>
            <div className="flex items-center gap-3 text-sky-300"><button aria-label={r.active ? 'Pause' : 'Resume'} title={r.active ? 'Pause' : 'Resume'} onClick={() => toggleActive(r)}>{r.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button><button aria-label="Edit recurring plan" onClick={() => edit(r)}><Pencil className="h-4 w-4" /></button><button aria-label="Delete recurring plan" onClick={() => del(r)}><Trash2 className="h-4 w-4" /></button></div>
          </div></div>))}</div>
    </div>
  );
}

// ---------------------------------------------------------------- 3. Goal milestones
function GoalCard({ g, reload, setErr }: { g: any; reload: () => void; setErr: (m: string) => void }) {
  const [title, setTitle] = useState(''), [due, setDue] = useState(''), [open, setOpen] = useState(false), [edit, setEdit] = useState<{ id: number; title: string } | null>(null);
  const t = todayStr();
  const add = async (e: any) => { e.preventDefault(); setErr(''); try { await api(`/planner/goals/${g.id}/milestones`, 'POST', { title, due_date: due || null }); setTitle(''); setDue(''); reload(); } catch (x: any) { setErr(x.message); } };
  const act = async (fn: () => Promise<any>) => { setErr(''); try { await fn(); reload(); } catch (x: any) { setErr(x.message); } };
  return (
    <div className="card">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-2"><div><div className="text-lg font-bold">{g.title}</div><div className="text-xs text-sky-100/70">{g.target_date ? `Target ${fmtDate(g.target_date)}` : 'No target date'} · goal progress {g.progress}%</div></div>
        <button className="btn-ghost !py-1" onClick={() => setOpen(!open)}><Plus className="h-4 w-4" />Add milestone</button></div>
      <div className="mb-1 flex justify-between text-xs text-sky-100/80"><span>{g.milestones_done}/{g.milestones_total} milestones</span><span>{g.milestone_pct}%</span></div>
      <div className="bar mb-3"><div style={{ width: g.milestone_pct + '%' }} /></div>
      {open && <form onSubmit={add} className="mb-3 grid gap-2 rounded-xl bg-white/5 p-3 sm:grid-cols-[1fr_12rem_auto]">
        <input className="inp" placeholder="Milestone, e.g. Finish module 1" value={title} onChange={e => setTitle(e.target.value)} />
        <DatePicker value={due} min={t} placeholder="Due date (optional)" onChange={setDue} />
        <button className="btn" disabled={!title.trim()}>Add</button></form>}
      {!g.milestones.length && <div className="text-sm text-sky-100/60">No milestones yet.</div>}
      <div className="space-y-2">{g.milestones.map((m: any) => (
        <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
          <button role="checkbox" aria-checked={m.completed} aria-label={m.completed ? 'Reopen milestone' : 'Complete milestone'} onClick={() => act(() => api('/planner/milestones/' + m.id, 'PUT', { completed: !m.completed }))} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${m.completed ? 'border-emerald-300 bg-emerald-500/40' : 'border-violet-300/50'}`}>{m.completed && <Check className="h-3 w-3" />}</button>
          <div className={`min-w-0 flex-1 ${m.completed ? 'opacity-60' : ''}`}>
            {edit?.id === m.id ? <form className="flex gap-2" onSubmit={e => { e.preventDefault(); act(async () => { await api('/planner/milestones/' + m.id, 'PUT', { title: edit.title }); setEdit(null); }); }}><input className="inp !py-1" autoFocus value={edit.title} onChange={e => setEdit({ id: m.id, title: e.target.value })} /><button className="btn !px-3 !py-1">Save</button><button type="button" className="btn-ghost !px-3 !py-1" onClick={() => setEdit(null)}><X className="h-3 w-3" /></button></form>
              : <><div className={`font-semibold ${m.completed ? 'line-through' : ''}`}>{m.title}</div><div className="text-xs text-sky-100/70">{m.completed ? `Completed ${fmtDate(m.completed_at)}` : m.due_date ? `Due ${fmtDate(m.due_date)}` : 'No due date'}{m.overdue && <span className="chip ml-2 bg-rose-400/20 text-rose-200">Overdue</span>}</div></>}
          </div>
          <div className="flex gap-3 text-sky-300"><button aria-label="Rename milestone" onClick={() => setEdit({ id: m.id, title: m.title })}><Pencil className="h-4 w-4" /></button><button aria-label="Delete milestone" onClick={() => { if (confirm(`Delete milestone "${m.title}"?`)) act(() => api('/planner/milestones/' + m.id, 'DELETE')); }}><Trash2 className="h-4 w-4" /></button></div>
        </div>))}</div>
    </div>
  );
}
export function MilestonesView() {
  const [data, setData] = useState<any>(null), [err, setErr] = useState('');
  const load = () => api('/planner/goals').then(setData).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const S = data?.summary;
  return (
    <div>
      <div className="mb-3 text-sm text-sky-100/70">Break your goals into milestones and tick them off. Milestones appear on the calendar on their due date. Your goal’s own progress (My Goals) is not changed.</div>
      {S && <div className="mb-3 text-xs text-sky-200">{S.done}/{S.milestones} milestones done{S.overdue ? ` · ${S.overdue} overdue` : ''}</div>}
      <Err m={err} />
      {data && !data.goals.length && <div className="card text-center text-sm text-sky-100/70">You have no goals yet — create one in My Goals, then add milestones to it here.</div>}
      <div className="space-y-4">{data?.goals.map((g: any) => <GoalCard key={g.id} g={g} reload={load} setErr={setErr} />)}</div>
    </div>
  );
}

// ---------------------------------------------------------------- 4. Habit reminders
const supportsNotif = () => typeof window !== 'undefined' && 'Notification' in window;
export function RemindersView() {
  const [data, setData] = useState<any>(null), [err, setErr] = useState(''), [f, setF] = useState({ habit_id: 0, time: '08:00', days: [] as number[] }), [perm, setPerm] = useState(supportsNotif() ? Notification.permission : 'denied');
  const load = () => api('/planner/reminders').then(d => { setData(d); setF(x => ({ ...x, habit_id: x.habit_id || d.habits[0]?.id || 0 })); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const act = async (fn: () => Promise<any>) => { setErr(''); try { await fn(); load(); } catch (x: any) { setErr(x.message); } };
  const add = (e: any) => { e.preventDefault(); act(() => api('/planner/reminders', 'POST', { habit_id: f.habit_id, remind_time: f.time, days_of_week: f.days })); };
  const dayText = (d: number[]) => (!d.length ? 'Every day' : d.map(i => DAYS[i]).join(', '));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="text-sm text-sky-100/70">Get a reminder for a habit at a time you choose. Reminders show up while the Study Planner page is open{supportsNotif() ? ', and as a browser notification if you allow it' : ''}.</div>
        {supportsNotif() && perm !== 'granted' && perm !== 'denied' && <button className="btn-ghost shrink-0" onClick={async () => setPerm(await Notification.requestPermission())}><Bell className="h-4 w-4" />Allow notifications</button>}
        {supportsNotif() && perm === 'denied' && <span className="text-xs text-sky-100/60">Browser notifications are blocked; reminders still appear on this page.</span>}</div>
      <Err m={err} />
      {data && !data.habits.length ? <div className="card text-center text-sm text-sky-100/70">You have no habits yet — add one in Growth Engine, then set reminders for it here.</div> : data && <form onSubmit={add} className="card mb-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-sky-200">Habit<select className="inp mt-1" value={f.habit_id} onChange={e => setF({ ...f, habit_id: Number(e.target.value) })}>{data.habits.map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
        <label className="text-xs text-sky-200">Time<input className="inp mt-1" type="time" required value={f.time} onChange={e => setF({ ...f, time: e.target.value })} /></label>
        <div className="self-end"><button className="btn" disabled={!f.habit_id || !f.time}><Plus className="h-4 w-4" />Add reminder</button></div>
        <div className="sm:col-span-3"><div className="mb-1 text-xs text-sky-200">Days (leave all unselected for every day)</div><DayChips value={f.days} onChange={v => setF({ ...f, days: v })} /></div>
      </form>}
      {data && data.habits.length > 0 && !data.reminders.length && <div className="card text-center text-sm text-sky-100/70">No reminders yet.</div>}
      <div className="space-y-2">{data?.reminders.map((r: any) => (
        <div key={r.id} className={`card flex flex-wrap items-center gap-3 !p-3 ${r.enabled ? '' : 'opacity-60'}`}>
          <Bell className="h-4 w-4 text-sky-300" />
          <div className="min-w-0 flex-1"><div className="font-semibold">{r.habit_name}</div><div className="text-xs text-sky-100/70">{dayText(r.days_of_week)}</div></div>
          <input className="inp !w-28 !py-1" type="time" aria-label="Reminder time" value={r.remind_time} onChange={e => e.target.value && act(() => api('/planner/reminders/' + r.id, 'PUT', { remind_time: e.target.value }))} />
          <button className="btn-ghost !px-3 !py-1" onClick={() => act(() => api('/planner/reminders/' + r.id, 'PUT', { enabled: !r.enabled }))}>{r.enabled ? <><BellOff className="h-3 w-3" />Turn off</> : <><Bell className="h-3 w-3" />Turn on</>}</button>
          <button aria-label="Delete reminder" className="text-sky-300" onClick={() => act(() => api('/planner/reminders/' + r.id, 'DELETE'))}><Trash2 className="h-4 w-4" /></button>
        </div>))}</div>
    </div>
  );
}

// Polls for due reminders while the Study Planner page is open: in-page banner + (optional) browser notification. Each reminder fires once per day.
export function ReminderWatcher() {
  const [due, setDue] = useState<any[]>([]), shown = useRef<Set<string>>(new Set());
  useEffect(() => {
    let stop = false;
    const check = async () => {
      const n = new Date(), date = todayStr(), time = `${pad2(n.getHours())}:${pad2(n.getMinutes())}`;
      try {
        const d = await api(`/planner/reminders/due?date=${date}&time=${time}`);
        for (const r of d.due) {
          const key = r.id + ':' + date; if (shown.current.has(key)) continue; shown.current.add(key);
          await api(`/planner/reminders/${r.id}/ack`, 'POST', { date }).catch(() => {});
          if (stop) return;
          setDue(x => [...x, r]);
          if (supportsNotif() && Notification.permission === 'granted') { try { new Notification('Habit reminder', { body: `Time for: ${r.habit_name} (${r.remind_time})` }); } catch { /* ignore */ } }
        }
      } catch { /* offline or logged out: try again later */ }
    };
    check(); const t = setInterval(check, 30000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  const dismiss = (r: any) => setDue(x => x.filter(y => y !== r));
  const complete = async (r: any) => { try { await api(`/habits/${r.habit_id}/logs`, 'POST', {}); } catch { /* ignore */ } dismiss(r); };
  if (!due.length) return null;
  return <div className="mb-4 space-y-2" role="status" aria-live="polite">{due.map(r => (
    <div key={r.id} className="card flex flex-wrap items-center gap-3 !border-amber-300/50 !p-3"><CalendarClock className="h-5 w-5 text-amber-300" />
      <div className="min-w-0 flex-1"><div className="font-bold">Habit reminder: {r.habit_name}</div><div className="text-xs text-sky-100/70">Scheduled for {r.remind_time}</div></div>
      <button className="btn !px-3 !py-1" onClick={() => complete(r)}><Check className="h-3 w-3" />Mark done</button><button className="btn-ghost !px-3 !py-1" onClick={() => dismiss(r)}><X className="h-3 w-3" />Dismiss</button></div>))}</div>;
}
