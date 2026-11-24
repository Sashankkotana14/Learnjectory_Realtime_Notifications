import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, GraduationCap, Percent, BookOpen, Target } from 'lucide-react';
import { api } from '../api';
const GRADES = ['', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];
const blank = { subject: '', grade: '', target_grade: '', credits: 3, progress: 0, classes_attended: 0, classes_total: 0 };
const Sum = ({ icon: I, label, v, sub }: any) => <div className="card !p-4"><div className="mb-1 flex items-center gap-2 text-xs text-sky-200"><I className="h-4 w-4" />{label}</div><div className="text-2xl font-extrabold">{v}</div><div className="text-[11px] text-sky-100/60">{sub}</div></div>;
export default function Academics() {
  const [data, setData] = useState<any>(null), [f, setF] = useState<any>(null), [err, setErr] = useState('');
  const load = () => api('/academics').then(setData).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const save = async (e: any) => {
    e.preventDefault(); setErr('');
    try { f.id ? await api('/academics/' + f.id, 'PUT', f) : await api('/academics', 'POST', f); setF(null); load(); } catch (x: any) { setErr(x.message); }
  };
  const del = async (r: any) => { if (confirm(`Delete "${r.subject}"?`)) { await api('/academics/' + r.id, 'DELETE'); load(); } };
  const num = (k: string) => <input className="inp mt-1" type="number" min={0} max={k === 'progress' ? 100 : undefined} step={k === 'credits' ? 0.5 : 1} value={f[k] ?? 0} onChange={e => setF({ ...f, [k]: e.target.value === '' ? 0 : Number(e.target.value) })} />;
  const sel = (k: string) => <select className="inp mt-1" value={f[k] || ''} onChange={e => setF({ ...f, [k]: e.target.value })}>{GRADES.map(g => <option key={g} value={g}>{g || '—'}</option>)}</select>;
  const S = data?.summary;
  return (
    <div>
      <div className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-extrabold">Academics</h1><button className="btn" onClick={() => { setErr(''); setF({ ...blank }); }}><Plus className="h-4 w-4" />Add subject</button></div>
      {S && <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Sum icon={BookOpen} label="Subjects" v={S.subjects} sub={`${S.totalCredits} total credits`} />
        <Sum icon={Target} label="Avg. progress" v={S.avgProgress + '%'} sub="across all subjects" />
        <Sum icon={GraduationCap} label="GPA (4.0)" v={S.currentGpa ?? '—'} sub={S.targetGpa ? `target ${S.targetGpa}` : 'set grades & targets'} />
        <Sum icon={Percent} label="Attendance" v={S.attendance !== null ? S.attendance + '%' : '—'} sub={S.lowAttendance.length ? `Below 75%: ${S.lowAttendance.join(', ')}` : 'no warnings'} />
      </div>}
      {err && <div className="mb-3 text-sm text-rose-300">{err}</div>}
      {f && <form onSubmit={save} className="card mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-sky-200 sm:col-span-2">Subject<input className="inp mt-1" required value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} /></label>
        <label className="text-xs text-sky-200">Credits{num('credits')}</label><label className="text-xs text-sky-200">Progress %{num('progress')}</label>
        <label className="text-xs text-sky-200">Current grade{sel('grade')}</label><label className="text-xs text-sky-200">Target grade{sel('target_grade')}</label>
        <label className="text-xs text-sky-200">Classes attended{num('classes_attended')}</label><label className="text-xs text-sky-200">Total classes{num('classes_total')}</label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4"><button className="btn">{f.id ? 'Update' : 'Save'}</button><button type="button" className="btn-ghost" onClick={() => setF(null)}><X className="h-4 w-4" />Cancel</button></div>
      </form>}
      {data && !data.subjects.length && <div className="card text-center text-sm text-sky-100/70">No subjects yet — click “Add subject” to start tracking your grades and attendance.</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data?.subjects.map((r: any) => (
          <div key={r.id} className="card">
            <div className="mb-2 flex items-start justify-between gap-2"><div><div className="font-bold">{r.subject}</div><div className="text-xs text-sky-100/60">{r.credits} credit{r.credits === 1 ? '' : 's'}</div></div>
              <div className="flex gap-2 text-sky-300"><button aria-label="Edit" onClick={() => { setErr(''); setF(r); }}><Pencil className="h-4 w-4" /></button><button aria-label="Delete" onClick={() => del(r)}><Trash2 className="h-4 w-4" /></button></div></div>
            <div className="mb-3 flex gap-2 text-xs"><span className="chip bg-sky-400/20 text-sky-200">Grade {r.grade || '—'}</span><span className="chip bg-indigo-400/25 text-indigo-200">Target {r.target_grade || '—'}</span></div>
            <div className="mb-1 flex justify-between text-xs"><span>Progress</span><span>{r.progress}%</span></div><div className="bar mb-3"><div style={{ width: r.progress + '%' }} /></div>
            <div className="mb-1 flex justify-between text-xs"><span>Attendance</span><span className={r.attendance_pct !== null && r.attendance_pct < 75 ? 'text-rose-300' : ''}>{r.attendance_pct !== null ? `${r.attendance_pct}% (${r.classes_attended}/${r.classes_total})` : 'not tracked'}</span></div>
            <div className="bar"><div style={{ width: (r.attendance_pct ?? 0) + '%' }} /></div>
          </div>))}
      </div>
    </div>
  );
}
