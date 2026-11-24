import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Flame, Trophy, CheckCircle2, Percent, Check, Undo2, History } from 'lucide-react';
import { api } from '../api';
import { GrowthMilestones, GrowthReminders } from '../components/GrowthExtras';
import { ReminderWatcher } from '../components/PlannerExtras';

const Sum = ({ icon: I, label, v, sub }: any) => <div className="card !p-4"><div className="mb-1 flex items-center gap-2 text-xs text-sky-200"><I className="h-4 w-4" />{label}</div><div className="text-2xl font-extrabold">{v}</div><div className="text-[11px] text-sky-100/60">{sub}</div></div>;
const blank = { name: '', category: 'General', daily_target: 1, target_type: 'standard', target_unit: '', target_label: '', target_value: '' };
const TYPES: [string, string][] = [['standard', 'Times per day (default)'], ['duration', 'Duration (minutes / hours)'], ['count', 'Count (pages, questions, tasks…)'], ['custom', 'Custom target']];
// Duration targets/logs are stored in minutes; count/custom use the habit's own unit label.
const fmtMin = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}` : `${m} min`;
const fmt = (h: any, n: number) => h.target_type === 'duration' ? fmtMin(n) : `${n} ${h.target_unit || ''}`.trim();
const typed = (h: any) => h.target_type && h.target_type !== 'standard';
// when editing, show the saved target in the habit's own unit (hours for duration-in-hours)
const toForm = (h: any) => ({ ...blank, ...h, target_value: h.target_type === 'duration' && h.target_unit === 'hours' ? +(h.daily_target / 60).toFixed(2) : h.daily_target });

function Habits() {
  const [data, setData] = useState<any>(null), [f, setF] = useState<any>(null), [err, setErr] = useState(''), [cat, setCat] = useState(''), [hist, setHist] = useState<Record<number, any[] | null>>({}), [amt, setAmt] = useState<Record<number, string>>({}), [amtUnit, setAmtUnit] = useState<Record<number, string>>({});
  const load = () => api('/habits').then(d => { setData(d); Object.keys(hist).forEach(k => { if (hist[+k]) loadHist(+k); }); }).catch(e => setErr(e.message));
  const loadHist = (id: number) => api(`/habits/${id}/history?days=30`).then(r => setHist(h => ({ ...h, [id]: r.history }))).catch(() => {});
  useEffect(() => { load(); }, []);
  const save = async (e: any) => {
    e.preventDefault(); setErr('');
    try {
      const type = f.target_type || 'standard'; let body: any = { name: f.name, category: f.category, daily_target: Number(f.daily_target) || 1 };
      if (type === 'duration') { const u = f.target_unit || 'minutes'; body = { ...body, daily_target: Math.round(Number(f.target_value) * (u === 'hours' ? 60 : 1)), target_unit: u }; }
      else if (type === 'count') body = { ...body, daily_target: Number(f.target_value), target_unit: f.target_unit };
      else if (type === 'custom') body = { ...body, daily_target: Number(f.target_value), target_unit: f.target_unit, target_label: f.target_label };
      if (!f.id && type !== 'standard') body.target_type = type;
      f.id ? await api('/habits/' + f.id, 'PUT', body) : await api('/habits', 'POST', body); setF(null); load();
    }
    catch (x: any) { setErr(x.message); }
  };
  const del = async (h: any) => { if (confirm(`Delete habit "${h.name}" and its history?`)) { await api('/habits/' + h.id, 'DELETE'); load(); } };
  const run = async (p: Promise<any>) => { setErr(''); try { await p; load(); } catch (x: any) { setErr(x.message); } };
  // one record per habit per date: the server upserts, so double clicks can never create duplicates
  const toggleDay = (h: any, date: string, completed: boolean) => run(completed ? api(`/habits/${h.id}/logs/${date}`, 'DELETE') : api(`/habits/${h.id}/logs`, 'POST', { date }));
  const bump = (h: any) => run(api(`/habits/${h.id}/logs`, 'POST', { increment: 1 }));
  const logAmt = (h: any) => {
    const raw = Number(amt[h.id]), mult = h.target_type === 'duration' && (amtUnit[h.id] || h.target_unit) === 'hours' ? 60 : 1, inc = Math.round(raw * mult);
    if (!raw || raw <= 0 || inc < 1) { setErr('Enter an amount greater than 0'); return; }
    setAmt({ ...amt, [h.id]: '' }); run(api(`/habits/${h.id}/logs`, 'POST', { increment: inc }));
  };
  const showHist = (h: any) => { if (hist[h.id]) setHist({ ...hist, [h.id]: null }); else loadHist(h.id); };
  const S = data?.summary, list = (data?.habits || []).filter((h: any) => !cat || h.category === cat);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-extrabold">Growth Engine <span className="text-base font-semibold text-sky-300">· Daily Habits</span></h1><button className="btn" onClick={() => { setErr(''); setF({ ...blank }); }}><Plus className="h-4 w-4" />Add habit</button></div>
      {S && <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Sum icon={CheckCircle2} label="Done today" v={`${S.doneToday}/${S.total}`} sub={S.total ? `${S.completionToday}% of habits` : 'no habits yet'} />
        <Sum icon={Flame} label="Current streak" v={`${S.bestCurrentStreak} day${S.bestCurrentStreak === 1 ? '' : 's'}`} sub="best active streak" />
        <Sum icon={Trophy} label="Longest streak" v={`${S.longestStreak} day${S.longestStreak === 1 ? '' : 's'}`} sub="all time" />
        <Sum icon={Percent} label="Today" v={S.completionToday + '%'} sub="habit completion" />
      </div>}
      {data && data.habits.length > 0 && <div className="card mb-4 overflow-x-auto !p-4">
        <h3 className="mb-3 font-bold">Weekly tracker</h3>
        <table className="w-full min-w-[520px] text-center text-xs"><thead><tr><th className="pb-2 text-left font-semibold text-sky-300">Habit</th>{data.weekly.map((d: any) => <th key={d.date} className={`pb-2 font-semibold ${d.is_today ? 'text-sky-300' : 'text-sky-100/70'}`}>{d.label}<div className="text-[10px] font-normal">{d.date.slice(8)}</div></th>)}</tr></thead>
          <tbody>
            {data.habits.map((h: any) => <tr key={h.id}><td className="py-1 text-left">{h.name}</td>
              {h.week.map((d: any) => <td key={d.date} className="py-1"><button disabled={d.is_future} aria-label={`${h.name} ${d.date}`} onClick={() => toggleDay(h, d.date, d.completed)}
                className={`mx-auto grid h-7 w-7 place-items-center rounded-lg border text-[10px] ${d.completed ? 'border-sky-400 bg-sky-400/40' : d.count ? 'border-amber-300/60 bg-amber-400/10' : 'border-indigo-400/30'} ${d.is_today ? 'ring-1 ring-sky-300' : ''} ${d.is_future ? 'opacity-30' : 'hover:bg-white/10'}`}>{d.completed ? <Check className="h-4 w-4" /> : d.count ? d.count : ''}</button></td>)}</tr>)}
            <tr className="border-t border-white/10"><td className="pt-2 text-left text-sky-300">Completed</td>{data.weekly.map((d: any) => <td key={d.date} className={`pt-2 font-bold ${d.is_future ? 'opacity-30' : ''}`}>{d.completed}/{d.total}</td>)}</tr>
          </tbody></table>
      </div>}
      {data && <div className="mb-4 flex flex-wrap gap-2">{['', ...data.categories].map((c: string) => <button key={c} onClick={() => setCat(c)} className={`chip !px-3 !py-1.5 ${cat === c ? 'bg-sky-500/40 ring-1 ring-sky-300' : 'bg-white/5'}`}>{c || 'All'}</button>)}</div>}
      {err && <div className="mb-3 text-sm text-rose-300">{err}</div>}
      {f && <form onSubmit={save} className="card mb-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-sky-200 sm:col-span-3">Habit<input className="inp mt-1" required maxLength={120} placeholder="e.g. Read 20 minutes" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <label className="text-xs text-sky-200">Category<select className="inp mt-1" value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{data?.categories.map((c: string) => <option key={c}>{c}</option>)}</select></label>
        <label className="text-xs text-sky-200">Target type<select className="inp mt-1" disabled={!!f.id} value={f.target_type || 'standard'} onChange={e => setF({ ...f, target_type: e.target.value, target_unit: e.target.value === 'duration' ? 'minutes' : e.target.value === 'count' ? 'pages' : '', target_value: '' })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {(f.target_type || 'standard') === 'standard' && <label className="text-xs text-sky-200">Daily target (times per day)<input className="inp mt-1" type="number" min={1} max={100} value={f.daily_target} onChange={e => setF({ ...f, daily_target: e.target.value })} /></label>}
        {f.target_type === 'duration' && <>
          <label className="text-xs text-sky-200">Daily time target<input className="inp mt-1" type="number" required min={0.01} step="any" placeholder={f.target_unit === 'hours' ? 'e.g. 1.5' : 'e.g. 30'} value={f.target_value} onChange={e => setF({ ...f, target_value: e.target.value })} /></label>
          <label className="text-xs text-sky-200">Unit<select className="inp mt-1" value={f.target_unit || 'minutes'} onChange={e => setF({ ...f, target_unit: e.target.value })}><option value="minutes">Minutes</option><option value="hours">Hours</option></select></label>
        </>}
        {f.target_type === 'count' && <>
          <label className="text-xs text-sky-200">Daily target (number)<input className="inp mt-1" type="number" required min={1} max={10000} step={1} placeholder="e.g. 10" value={f.target_value} onChange={e => setF({ ...f, target_value: e.target.value })} /></label>
          <label className="text-xs text-sky-200">What are you counting?<input className="inp mt-1" list="habit-units" maxLength={30} placeholder="pages, questions, tasks…" value={f.target_unit} onChange={e => setF({ ...f, target_unit: e.target.value })} /><datalist id="habit-units"><option value="pages" /><option value="questions" /><option value="tasks" /><option value="problems" /><option value="chapters" /></datalist></label>
        </>}
        {f.target_type === 'custom' && <>
          <label className="text-xs text-sky-200">My target<input className="inp mt-1" required maxLength={80} placeholder="e.g. Practice LeetCode problems" value={f.target_label} onChange={e => setF({ ...f, target_label: e.target.value })} /></label>
          <label className="text-xs text-sky-200">Daily amount<input className="inp mt-1" type="number" required min={1} max={10000} step={1} placeholder="e.g. 3" value={f.target_value} onChange={e => setF({ ...f, target_value: e.target.value })} /></label>
          <label className="text-xs text-sky-200">Unit (optional)<input className="inp mt-1" maxLength={30} placeholder="e.g. problems, reps, km" value={f.target_unit} onChange={e => setF({ ...f, target_unit: e.target.value })} /></label>
        </>}
        <div className="flex items-end gap-2"><button className="btn">{f.id ? 'Update' : 'Save'}</button><button type="button" className="btn-ghost" onClick={() => setF(null)}><X className="h-4 w-4" />Cancel</button></div>
      </form>}
      {data && !data.habits.length && <div className="card text-center text-sm text-sky-100/70">No habits yet — click “Add habit” to start building a streak.</div>}
      {data && data.habits.length > 0 && !list.length && <div className="card text-center text-sm text-sky-100/70">No habits in this category.</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((h: any) => (
          <div key={h.id} className="card">
            <div className="mb-2 flex items-start justify-between gap-2"><div><div className="font-bold">{h.name}</div><span className="chip mt-1 bg-indigo-400/20 text-indigo-100">{h.category}</span>{typed(h) && <span className="chip mt-1 ml-1 bg-sky-400/20 text-sky-100">{h.target_type === 'duration' ? 'Duration' : h.target_type === 'count' ? 'Count' : 'Custom'}</span>}{h.target_type === 'custom' && h.target_label && <div className="mt-1 text-xs text-sky-100/70">{h.target_label}</div>}</div>
              <div className="flex gap-2 text-sky-300"><button aria-label="Edit" onClick={() => { setErr(''); setF(toForm(h)); }}><Pencil className="h-4 w-4" /></button><button aria-label="Delete" onClick={() => del(h)}><Trash2 className="h-4 w-4" /></button></div></div>
            <div className="mb-2 flex gap-4 text-xs"><span><Flame className="mr-1 inline h-3 w-3 text-orange-300" /><b>{h.current_streak}</b> current</span><span><Trophy className="mr-1 inline h-3 w-3 text-amber-300" /><b>{h.longest_streak}</b> longest</span><span className="text-sky-100/60">{h.total_completions} days done</span></div>
            <div className="mb-1 flex justify-between text-xs"><span>Today</span><span>{typed(h) ? `${fmt(h, h.today_count)} / ${fmt(h, h.daily_target)}` : `${h.today_count}/${h.daily_target}`}{h.done_today ? ' ✓' : ''}</span></div>
            <div className="bar mb-3"><div style={{ width: Math.min(100, Math.round(h.today_count / h.daily_target * 100)) + '%' }} /></div>
            <div className="flex flex-wrap gap-2 text-xs">
              {typed(h) ? <>
                {!h.done_today && <><input aria-label={`Amount to log for ${h.name}`} className="inp !w-20 !px-2 !py-1" type="number" min={0} step="any" placeholder={h.target_type === 'duration' ? 'time' : 'amount'} value={amt[h.id] || ''} onChange={e => setAmt({ ...amt, [h.id]: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') logAmt(h); }} />
                  {h.target_type === 'duration' && <select aria-label="Time unit" className="inp !w-24 !px-2 !py-1" value={amtUnit[h.id] || h.target_unit || 'minutes'} onChange={e => setAmtUnit({ ...amtUnit, [h.id]: e.target.value })}><option value="minutes">min</option><option value="hours">hours</option></select>}
                  <button className="btn !px-3 !py-1" onClick={() => logAmt(h)}><Plus className="h-3 w-3" />Log</button>
                  <button className="btn-ghost !px-3 !py-1" onClick={() => run(api(`/habits/${h.id}/logs`, 'POST', { count: h.daily_target }))}>Complete</button></>}
                {h.today_count > 0 && <button className="btn-ghost !px-3 !py-1" onClick={() => toggleDay(h, data.today, true)}><Undo2 className="h-3 w-3" />Reset</button>}</>
              : h.daily_target === 1 ? <button className={h.done_today ? 'btn-ghost !px-3 !py-1' : 'btn !px-3 !py-1'} onClick={() => toggleDay(h, data.today, h.done_today)}>{h.done_today ? <><Undo2 className="h-3 w-3" />Undo</> : <><Check className="h-3 w-3" />Mark done</>}</button>
                : <>{!h.done_today && <button className="btn !px-3 !py-1" onClick={() => bump(h)}><Plus className="h-3 w-3" />1</button>}{!h.done_today && <button className="btn-ghost !px-3 !py-1" onClick={() => run(api(`/habits/${h.id}/logs`, 'POST', { count: h.daily_target }))}>Complete</button>}{h.today_count > 0 && <button className="btn-ghost !px-3 !py-1" onClick={() => toggleDay(h, data.today, true)}><Undo2 className="h-3 w-3" />Reset</button>}</>}
              <button className="btn-ghost !px-3 !py-1" onClick={() => showHist(h)}><History className="h-3 w-3" />History</button>
            </div>
            {hist[h.id] && <div className="mt-3"><div className="mb-1 text-[11px] text-sky-100/60">Last 30 days</div><div className="flex flex-wrap gap-1">{hist[h.id]!.map((d: any) => <div key={d.date} title={`${d.date}: ${d.count}`} className={`h-4 w-4 rounded ${d.completed ? 'bg-sky-400' : d.count ? 'bg-amber-400/50' : 'bg-white/10'}`} />)}</div></div>}
          </div>))}
      </div>
    </div>
  );
}

// Growth Engine tabs: the original Habits view is unchanged; Goal Milestones and Reminders are additions.
const TABS: [string, string][] = [['habits', 'Habits'], ['milestones', 'Goal Milestones'], ['reminders', 'Reminders']];
export default function Growth() {
  const [tab, setTab] = useState('habits');
  return (
    <div>
      <ReminderWatcher />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`chip !px-3 !py-1.5 ${tab === k ? 'bg-sky-500/40 ring-1 ring-sky-300' : 'bg-white/5'}`}>{l}</button>)}</div>
      {tab === 'habits' && <Habits />}
      {tab === 'milestones' && <GrowthMilestones />}
      {tab === 'reminders' && <GrowthReminders />}
    </div>
  );
}
