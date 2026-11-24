import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Target, CheckCircle2, AlertTriangle, TrendingUp, Check, Minus } from 'lucide-react';
import { api } from '../api';
import DatePicker from '../components/DatePicker';
import { daysLabel, fmtDate, todayStr } from '../dates';

const CLR: Record<string, string> = { active: 'bg-sky-400/20 text-sky-200', completed: 'bg-emerald-400/20 text-emerald-200', overdue: 'bg-rose-500/25 text-rose-200' };
const Sum = ({ icon: I, label, v, sub, tone = '' }: any) => <div className="card !p-4"><div className="mb-1 flex items-center gap-2 text-xs text-sky-200"><I className="h-4 w-4" />{label}</div><div className={`text-2xl font-extrabold ${tone}`}>{v}</div><div className="text-[11px] text-sky-100/60">{sub}</div></div>;
const blank = { title: '', description: '', target_date: '', progress: 0 };

export default function Goals() {
  const [data, setData] = useState<any>(null), [f, setF] = useState<any>(null), [err, setErr] = useState(''), [tab, setTab] = useState('');
  const load = () => api('/goals' + (tab ? '?status=' + tab : '')).then(setData).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [tab]);
  const save = async (e: any) => {
    e.preventDefault(); setErr('');
    try { const body = { title: f.title, description: f.description, target_date: f.target_date, progress: Number(f.progress) || 0 }; f.id ? await api('/goals/' + f.id, 'PUT', body) : await api('/goals', 'POST', body); setF(null); load(); }
    catch (x: any) { setErr(x.message); }
  };
  const del = async (g: any) => { if (confirm(`Delete goal "${g.title}"?`)) { await api('/goals/' + g.id, 'DELETE'); load(); } };
  const setProgress = async (g: any, progress: number) => { try { await api('/goals/' + g.id, 'PUT', { progress: Math.max(0, Math.min(100, progress)) }); load(); } catch (x: any) { setErr(x.message); } };
  const S = data?.summary, today = todayStr();
  return (
    <div>
      <div className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-extrabold">My Goals</h1><button className="btn" onClick={() => { setErr(''); setF({ ...blank }); }}><Plus className="h-4 w-4" />Add goal</button></div>
      {S && <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Sum icon={Target} label="Active goals" v={S.active} sub={`${S.total} total`} />
        <Sum icon={CheckCircle2} label="Completed" v={S.completed} sub={S.total ? `${Math.round(S.completed / S.total * 100)}% of all goals` : 'nothing yet'} />
        <Sum icon={AlertTriangle} label="Overdue" v={S.overdue} sub={`${S.dueSoon} due within 7 days`} tone={S.overdue ? 'text-rose-300' : ''} />
        <Sum icon={TrendingUp} label="Average progress" v={S.avgProgress + '%'} sub="across all goals" />
      </div>}
      <div className="mb-4 flex flex-wrap gap-2">{[['', 'All'], ['active', 'Active'], ['completed', 'Completed'], ['overdue', 'Overdue']].map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`chip !px-4 !py-1.5 ${tab === k ? 'bg-sky-500/40 ring-1 ring-sky-300' : 'bg-white/5'}`}>{l}</button>)}</div>
      {err && <div className="mb-3 text-sm text-rose-300">{err}</div>}
      {f && <form onSubmit={save} className="card mb-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-sky-200 sm:col-span-2">Goal<input className="inp mt-1" required maxLength={200} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
        <label className="text-xs text-sky-200 sm:col-span-2">Description<textarea className="inp mt-1" rows={2} value={f.description || ''} onChange={e => setF({ ...f, description: e.target.value })} /></label>
        <div className="text-xs text-sky-200">Target date <span className="text-sky-100/50">(today or later)</span><div className="mt-1"><DatePicker value={f.target_date || ''} min={today} onChange={v => setF({ ...f, target_date: v })} placeholder="No deadline" /></div></div>
        <label className="text-xs text-sky-200">Progress: {f.progress}%<input className="mt-3 w-full accent-sky-400" type="range" min={0} max={100} step={5} value={f.progress} onChange={e => setF({ ...f, progress: Number(e.target.value) })} /></label>
        <div className="flex gap-2 sm:col-span-2"><button className="btn">{f.id ? 'Update' : 'Save'}</button><button type="button" className="btn-ghost" onClick={() => setF(null)}><X className="h-4 w-4" />Cancel</button></div>
      </form>}
      {data && !data.goals.length && <div className="card text-center text-sm text-sky-100/70">{S.total ? 'No goals in this view.' : 'No goals yet — click “Add goal” to set your first one.'}</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data?.goals.map((g: any) => (
          <div key={g.id} className="card">
            <div className="mb-2 flex items-start justify-between gap-2"><div className={`font-bold ${g.completed ? 'line-through opacity-70' : ''}`}>{g.title}</div>
              <div className="flex gap-2 text-sky-300"><button aria-label="Edit" onClick={() => { setErr(''); setF({ ...g, target_date: g.target_date || '' }); }}><Pencil className="h-4 w-4" /></button><button aria-label="Delete" onClick={() => del(g)}><Trash2 className="h-4 w-4" /></button></div></div>
            {g.description && <p className="mb-2 text-xs text-sky-100/70">{g.description}</p>}
            <div className="mb-2 flex flex-wrap items-center gap-2"><span className={`chip ${CLR[g.status]}`}>{daysLabel(g.days_left, g.completed)}</span>{g.target_date && <span className="text-[11px] text-sky-100/60">{g.completed && g.completed_at ? `Done ${fmtDate(g.completed_at)}` : `Target ${fmtDate(g.target_date)}`}</span>}</div>
            <div className="mb-1 flex justify-between text-xs"><span>Progress</span><span>{g.progress}%</span></div><div className="bar mb-3"><div style={{ width: g.progress + '%' }} /></div>
            <div className="flex gap-2 text-xs">
              {!g.completed && <><button className="btn-ghost !px-3 !py-1" aria-label="Decrease progress" onClick={() => setProgress(g, g.progress - 10)}><Minus className="h-3 w-3" />10%</button><button className="btn-ghost !px-3 !py-1" aria-label="Increase progress" onClick={() => setProgress(g, g.progress + 10)}><Plus className="h-3 w-3" />10%</button><button className="btn !px-3 !py-1" onClick={() => setProgress(g, 100)}><Check className="h-3 w-3" />Complete</button></>}
              {g.completed && <button className="btn-ghost !px-3 !py-1" onClick={() => setProgress(g, 90)}>Reopen</button>}
            </div>
          </div>))}
      </div>
    </div>
  );
}
