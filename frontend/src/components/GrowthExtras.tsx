import { useEffect, useState } from 'react';
import { Plus, Trash2, X, Check, Flag, Bell, BellOff, Pencil } from 'lucide-react';
import { api } from '../api';
import DatePicker from './DatePicker';
import { fmtDate, todayStr } from '../dates';

// Growth Engine additions: Goal Milestones + Habit Reminders.
// Uses the existing goal_milestones / habit_reminders tables and endpoints; habit logs and streak logic are never touched here.
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const Err = ({ m }: { m: string }) => (m ? <div className="mb-3 text-sm text-rose-300">{m}</div> : null);
const DayChips = ({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) => (
  <div className="flex flex-wrap gap-2">{DAYS.map((d, i) => { const on = value.includes(i); return <button type="button" key={d} aria-pressed={on} onClick={() => onChange(on ? value.filter(x => x !== i) : [...value, i].sort())} className={`chip !px-3 !py-1.5 ${on ? 'bg-sky-500/40 ring-1 ring-sky-300' : 'bg-white/5'}`}>{d}</button>; })}</div>
);
const dayText = (d: number[]) => (!d.length ? 'Every day' : d.map(i => DAYS[i]).join(', '));

function GoalCard({ g, reload, setErr }: { g: any; reload: () => void; setErr: (m: string) => void }) {
  const [title, setTitle] = useState(''), [due, setDue] = useState(''), [open, setOpen] = useState(false), [edit, setEdit] = useState<{ id: number; title: string; due: string } | null>(null);
  const t = todayStr();
  const act = async (fn: () => Promise<any>) => { setErr(''); try { await fn(); reload(); } catch (x: any) { setErr(x.message); } };
  const add = (e: any) => { e.preventDefault(); act(async () => { await api(`/planner/goals/${g.id}/milestones`, 'POST', { title, due_date: due || null }); setTitle(''); setDue(''); }); };
  return (
    <div className="card">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-2"><div><div className="text-lg font-bold">{g.title}</div><div className="text-xs text-sky-100/70">{g.target_date ? `Target ${fmtDate(g.target_date)}` : 'No target date'} · goal progress {g.progress}%</div></div>
        <button className="btn-ghost !py-1" onClick={() => setOpen(!open)}><Plus className="h-4 w-4" />Add milestone</button></div>
      <div className="mb-1 flex justify-between text-xs text-sky-100/80"><span>{g.milestones_done}/{g.milestones_total} milestones</span><span>{g.milestone_pct}%</span></div>
      <div className="bar mb-3"><div style={{ width: g.milestone_pct + '%' }} /></div>
      {open && <form onSubmit={add} className="mb-3 grid gap-2 rounded-xl bg-white/5 p-3 sm:grid-cols-[1fr_12rem_auto]">
        <input className="inp" maxLength={200} placeholder="Milestone, e.g. Finish module 1" value={title} onChange={e => setTitle(e.target.value)} />
        <DatePicker value={due} min={t} placeholder="Due date (optional)" onChange={setDue} />
        <button className="btn" disabled={!title.trim()}>Add</button></form>}
      {!g.milestones.length && <div className="text-sm text-sky-100/60">No milestones yet.</div>}
      <div className="space-y-2">{g.milestones.map((m: any) => (
        <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
          <button role="checkbox" aria-checked={m.completed} aria-label={m.completed ? 'Reopen milestone' : 'Complete milestone'} onClick={() => act(() => api('/planner/milestones/' + m.id, 'PUT', { completed: !m.completed }))} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${m.completed ? 'border-emerald-300 bg-emerald-500/40' : 'border-violet-300/50'}`}>{m.completed && <Check className="h-3 w-3" />}</button>
          <div className={`min-w-0 flex-1 ${m.completed && edit?.id !== m.id ? 'opacity-60' : ''}`}>
            {edit?.id === m.id ? <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); act(async () => { await api('/planner/milestones/' + m.id, 'PUT', { title: edit.title, due_date: edit.due || null }); setEdit(null); }); }}>
                <input className="inp !w-auto min-w-[10rem] flex-1 !py-1" autoFocus maxLength={200} value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} />
                <div className="w-44"><DatePicker value={edit.due} min={t} placeholder="Due date" onChange={v => setEdit({ ...edit, due: v })} /></div>
                <button className="btn !px-3 !py-1" disabled={!edit.title.trim()}>Save</button><button type="button" className="btn-ghost !px-3 !py-1" onClick={() => setEdit(null)}><X className="h-3 w-3" /></button></form>
              : <><div className={`font-semibold ${m.completed ? 'line-through' : ''}`}>{m.title}</div><div className="text-xs text-sky-100/70">{m.completed ? `Completed ${fmtDate(m.completed_at)}` : m.due_date ? `Due ${fmtDate(m.due_date)}` : 'No due date'}{m.overdue && <span className="chip ml-2 bg-rose-400/20 text-rose-200">Overdue</span>}</div></>}
          </div>
          {edit?.id !== m.id && <div className="flex gap-3 text-sky-300"><button aria-label="Edit milestone" onClick={() => setEdit({ id: m.id, title: m.title, due: m.due_date || '' })}><Pencil className="h-4 w-4" /></button><button aria-label="Delete milestone" onClick={() => { if (confirm(`Delete milestone "${m.title}"?`)) act(() => api('/planner/milestones/' + m.id, 'DELETE')); }}><Trash2 className="h-4 w-4" /></button></div>}
        </div>))}</div>
    </div>
  );
}

export function GrowthMilestones() {
  const [data, setData] = useState<any>(null), [err, setErr] = useState('');
  const load = () => api('/planner/goals').then(setData).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const S = data?.summary;
  return (
    <div>
      <div className="mb-3 text-sm text-sky-100/70"><Flag className="mr-1 inline h-4 w-4 text-pink-300" />Break each goal into milestones, set due dates, edit them and tick them off. Your goal’s own progress (My Goals) is not changed.</div>
      {S && <div className="mb-3 text-xs text-sky-200">{S.done}/{S.milestones} milestones done{S.overdue ? ` · ${S.overdue} overdue` : ''}</div>}
      <Err m={err} />
      {data && !data.goals.length && <div className="card text-center text-sm text-sky-100/70">You have no goals yet — create one in My Goals, then add milestones to it here.</div>}
      <div className="space-y-4">{data?.goals.map((g: any) => <GoalCard key={g.id} g={g} reload={load} setErr={setErr} />)}</div>
    </div>
  );
}

const supportsNotif = () => typeof window !== 'undefined' && 'Notification' in window;
export function GrowthReminders() {
  const [data, setData] = useState<any>(null), [err, setErr] = useState(''), [f, setF] = useState({ habit_id: 0, time: '08:00', days: [] as number[] }), [perm, setPerm] = useState(supportsNotif() ? Notification.permission : 'denied');
  const [edit, setEdit] = useState<{ id: number; days: number[] } | null>(null);
  const load = () => api('/planner/reminders').then(d => { setData(d); setF(x => ({ ...x, habit_id: x.habit_id && d.habits.some((h: any) => h.id === x.habit_id) ? x.habit_id : d.habits[0]?.id || 0 })); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const act = async (fn: () => Promise<any>) => { setErr(''); try { await fn(); load(); } catch (x: any) { setErr(x.message); } };
  const add = (e: any) => { e.preventDefault(); act(() => api('/planner/reminders', 'POST', { habit_id: f.habit_id, remind_time: f.time, days_of_week: f.days })); };
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="text-sm text-sky-100/70">Set, edit and manage reminders for your habits. Reminders show up while the Growth Engine page is open{supportsNotif() ? ', and as a browser notification if you allow it' : ''}.</div>
        {supportsNotif() && perm !== 'granted' && perm !== 'denied' && <button className="btn-ghost shrink-0" onClick={async () => setPerm(await Notification.requestPermission())}><Bell className="h-4 w-4" />Allow notifications</button>}
        {supportsNotif() && perm === 'denied' && <span className="text-xs text-sky-100/60">Browser notifications are blocked; reminders still appear on this page.</span>}</div>
      <Err m={err} />
      {data && !data.habits.length ? <div className="card text-center text-sm text-sky-100/70">You have no habits yet — add one in the Habits tab, then set reminders for it here.</div> : data && <form onSubmit={add} className="card mb-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-sky-200">Habit<select className="inp mt-1" value={f.habit_id} onChange={e => setF({ ...f, habit_id: Number(e.target.value) })}>{data.habits.map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
        <label className="text-xs text-sky-200">Time<input className="inp mt-1" type="time" required value={f.time} onChange={e => setF({ ...f, time: e.target.value })} /></label>
        <div className="self-end"><button className="btn" disabled={!f.habit_id || !f.time}><Plus className="h-4 w-4" />Add reminder</button></div>
        <div className="sm:col-span-3"><div className="mb-1 text-xs text-sky-200">Days (leave all unselected for every day)</div><DayChips value={f.days} onChange={v => setF({ ...f, days: v })} /></div>
      </form>}
      {data && data.habits.length > 0 && !data.reminders.length && <div className="card text-center text-sm text-sky-100/70">No reminders yet.</div>}
      <div className="space-y-2">{data?.reminders.map((r: any) => (
        <div key={r.id} className={`card !p-3 ${r.enabled ? '' : 'opacity-60'}`}>
          <div className="flex flex-wrap items-center gap-3">
            <Bell className="h-4 w-4 text-sky-300" />
            <div className="min-w-0 flex-1"><div className="font-semibold">{r.habit_name}</div><div className="text-xs text-sky-100/70">{dayText(r.days_of_week)}</div></div>
            <input className="inp !w-28 !py-1" type="time" aria-label="Reminder time" value={r.remind_time} onChange={e => e.target.value && act(() => api('/planner/reminders/' + r.id, 'PUT', { remind_time: e.target.value }))} />
            <button className="btn-ghost !px-3 !py-1" onClick={() => setEdit(edit?.id === r.id ? null : { id: r.id, days: r.days_of_week })}><Pencil className="h-3 w-3" />Days</button>
            <button className="btn-ghost !px-3 !py-1" onClick={() => act(() => api('/planner/reminders/' + r.id, 'PUT', { enabled: !r.enabled }))}>{r.enabled ? <><BellOff className="h-3 w-3" />Turn off</> : <><Bell className="h-3 w-3" />Turn on</>}</button>
            <button aria-label="Delete reminder" className="text-sky-300" onClick={() => { if (confirm(`Delete this reminder for "${r.habit_name}"?`)) act(() => api('/planner/reminders/' + r.id, 'DELETE')); }}><Trash2 className="h-4 w-4" /></button>
          </div>
          {edit?.id === r.id && <div className="mt-3 rounded-xl bg-white/5 p-3"><div className="mb-1 text-xs text-sky-200">Days (none selected = every day)</div><DayChips value={edit.days} onChange={v => setEdit({ id: r.id, days: v })} />
            <div className="mt-3 flex gap-2"><button className="btn !px-3 !py-1" onClick={() => act(async () => { await api('/planner/reminders/' + r.id, 'PUT', { days_of_week: edit.days }); setEdit(null); })}>Save</button><button className="btn-ghost !px-3 !py-1" onClick={() => setEdit(null)}>Cancel</button></div></div>}
        </div>))}</div>
    </div>
  );
}
