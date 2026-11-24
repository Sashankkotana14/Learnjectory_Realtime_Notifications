import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, X, ListChecks, Clock, CheckCircle2, AlertTriangle, Check, RotateCcw } from 'lucide-react';
import { api } from '../api';
const PCLR: Record<string, string> = { Overdue: 'bg-rose-500/25 text-rose-200', High: 'bg-orange-500/25 text-orange-200', Medium: 'bg-amber-400/20 text-amber-200', Low: 'bg-emerald-400/20 text-emerald-200', Completed: 'bg-sky-400/20 text-sky-200' };
const blank = { title: '', subject: '', description: '', due_date: '', status: 'pending' };
const Sum = ({ icon: I, label, v, sub, tone = '' }: any) => <div className="card !p-4"><div className="mb-1 flex items-center gap-2 text-xs text-sky-200"><I className="h-4 w-4" />{label}</div><div className={`text-2xl font-extrabold ${tone}`}>{v}</div><div className="text-[11px] text-sky-100/60">{sub}</div></div>;
const when = (a: any) => a.status === 'done' ? (a.completed_at ? `Done ${a.completed_at}` : 'Done') : a.days_left === null ? 'No due date' : a.days_left < 0 ? `${-a.days_left}d overdue` : a.days_left === 0 ? 'Due today' : `${a.days_left}d left`;
export default function Assignments() {
  const [data, setData] = useState<any>(null), [f, setF] = useState<any>(null), [err, setErr] = useState('');
  const [flt, setFlt] = useState({ status: '', priority: '', subject: '', q: '', sort: 'due', dir: 'asc' });
  const qs = useMemo(() => '?' + new URLSearchParams(Object.entries(flt).filter(([, v]) => v) as any).toString(), [flt]);
  const load = () => api('/assignments' + qs).then(setData).catch(e => setErr(e.message));
  useEffect(() => { const t = setTimeout(load, flt.q ? 250 : 0); return () => clearTimeout(t); }, [qs]);
  const save = async (e: any) => {
    e.preventDefault(); setErr('');
    try { const { id, priority, days_left, created_at, user_id, completed_at, ...body } = f; id ? await api('/assignments/' + id, 'PUT', body) : await api('/assignments', 'POST', body); setF(null); load(); } catch (x: any) { setErr(x.message); }
  };
  const del = async (a: any) => { if (confirm(`Delete "${a.title}"?`)) { await api('/assignments/' + a.id, 'DELETE'); load(); } };
  const setStatus = async (a: any, status: string) => { try { await api('/assignments/' + a.id, 'PUT', { status }); load(); } catch (x: any) { setErr(x.message); } };
  const S = data?.summary, set = (k: string) => (e: any) => setFlt({ ...flt, [k]: e.target.value });
  return (
    <div>
      <div className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-extrabold">Assignments</h1><button className="btn" onClick={() => { setErr(''); setF({ ...blank }); }}><Plus className="h-4 w-4" />Add assignment</button></div>
      {S && <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Sum icon={ListChecks} label="Total" v={S.total} sub={`${S.pending} pending`} />
        <Sum icon={CheckCircle2} label="Completed" v={S.completed} sub={S.total ? `${Math.round(S.completed / S.total * 100)}% done` : 'nothing yet'} />
        <Sum icon={AlertTriangle} label="Overdue" v={S.overdue} sub="past due date" tone={S.overdue ? 'text-rose-300' : ''} />
        <Sum icon={Clock} label="Priority" v={`${S.high} · ${S.medium} · ${S.low}`} sub="High · Medium · Low" />
      </div>}
      <div className="card mb-4 grid gap-3 !p-4 sm:grid-cols-3 lg:grid-cols-6">
        <input className="inp sm:col-span-3 lg:col-span-2" placeholder="Search assignments…" value={flt.q} onChange={set('q')} />
        <select className="inp" value={flt.status} onChange={set('status')}><option value="">All status</option><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="done">Done</option></select>
        <select className="inp" value={flt.priority} onChange={set('priority')}><option value="">All priorities</option>{['Overdue', 'High', 'Medium', 'Low', 'Completed'].map(p => <option key={p}>{p}</option>)}</select>
        <select className="inp" value={flt.subject} onChange={set('subject')}><option value="">All subjects</option>{data?.subjects.map((s: string) => <option key={s}>{s}</option>)}</select>
        <select className="inp" value={flt.sort + ':' + flt.dir} onChange={e => { const [sort, dir] = e.target.value.split(':'); setFlt({ ...flt, sort, dir }); }}>
          <option value="due:asc">Due date ↑</option><option value="due:desc">Due date ↓</option><option value="priority:asc">Priority</option><option value="title:asc">Title A–Z</option><option value="subject:asc">Subject A–Z</option><option value="created:desc">Newest</option></select>
      </div>
      {err && <div className="mb-3 text-sm text-rose-300">{err}</div>}
      {f && <form onSubmit={save} className="card mb-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-sky-200 sm:col-span-2">Title<input className="inp mt-1" required value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
        <label className="text-xs text-sky-200">Subject<input className="inp mt-1" list="subj" value={f.subject || ''} onChange={e => setF({ ...f, subject: e.target.value })} /><datalist id="subj">{data?.subjects.map((s: string) => <option key={s} value={s} />)}</datalist></label>
        <label className="text-xs text-sky-200">Due date<input className="inp mt-1" type="date" value={f.due_date || ''} onChange={e => setF({ ...f, due_date: e.target.value })} /></label>
        <label className="text-xs text-sky-200">Status<select className="inp mt-1" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="done">Done</option></select></label>
        <label className="text-xs text-sky-200 sm:col-span-2">Notes<textarea className="inp mt-1" rows={2} value={f.description || ''} onChange={e => setF({ ...f, description: e.target.value })} /></label>
        <div className="flex items-center gap-2 sm:col-span-2"><button className="btn">{f.id ? 'Update' : 'Save'}</button><button type="button" className="btn-ghost" onClick={() => setF(null)}><X className="h-4 w-4" />Cancel</button><span className="ml-2 text-[11px] text-sky-100/60">Priority is automatic: High 0–2 days, Medium 3–5, Low 6+, Overdue after the due date.</span></div>
      </form>}
      {data && !data.assignments.length && <div className="card text-center text-sm text-sky-100/70">{S.total ? 'No assignments match these filters.' : 'No assignments yet — click “Add assignment” to get started.'}</div>}
      <div className="space-y-3">
        {data?.assignments.map((a: any) => (
          <div key={a.id} className="card flex flex-wrap items-center gap-3 !p-4">
            <button aria-label={a.status === 'done' ? 'Mark as pending' : 'Mark as done'} onClick={() => setStatus(a, a.status === 'done' ? 'pending' : 'done')} className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border ${a.status === 'done' ? 'border-sky-400 bg-sky-400/30' : 'border-indigo-400/50 hover:bg-white/5'}`}>{a.status === 'done' ? <Check className="h-4 w-4" /> : null}</button>
            <div className="min-w-0 flex-1"><div className={`font-bold ${a.status === 'done' ? 'line-through opacity-60' : ''}`}>{a.title}</div>
              <div className="text-xs text-sky-100/70">{a.subject || 'No subject'} · {a.due_date || 'no date'} · {when(a)}{a.status === 'in_progress' ? ' · in progress' : ''}</div>
              {a.description && <div className="mt-1 truncate text-xs text-sky-100/50">{a.description}</div>}</div>
            <span className={`chip ${PCLR[a.priority]}`}>{a.priority}</span>
            <div className="flex gap-3 text-sky-300">
              {a.status !== 'done' && a.status !== 'in_progress' && <button title="Start" aria-label="Start" onClick={() => setStatus(a, 'in_progress')}><RotateCcw className="h-4 w-4" /></button>}
              <button aria-label="Edit" onClick={() => { setErr(''); setF(a); }}><Pencil className="h-4 w-4" /></button><button aria-label="Delete" onClick={() => del(a)}><Trash2 className="h-4 w-4" /></button></div>
          </div>))}
      </div>
    </div>
  );
}
