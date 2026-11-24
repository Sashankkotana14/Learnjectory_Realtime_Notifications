import { useEffect, useState } from 'react';
import { Award, Lock, Footprints, BookOpen, Library, Flag, Clock, Hourglass, GraduationCap, Target, CheckCircle2, Medal, Trophy, Sprout, Flame, Crown, CalendarCheck, FolderPlus, FolderKanban, Rocket, PackageCheck, Wrench, Layers, Zap, Shapes } from 'lucide-react';
import { api } from '../api';
import { fmtDate } from '../dates';

const ICONS: Record<string, any> = { Footprints, BookOpen, Library, Flag, Clock, Hourglass, GraduationCap, Target, CheckCircle2, Medal, Trophy, Sprout, Flame, Crown, CalendarCheck, FolderPlus, FolderKanban, Rocket, PackageCheck, Wrench, Layers, Zap, Shapes };
const progressText = (a: any) => a.metric === 'study_minutes' ? `${Math.floor(a.current / 60)}h of ${Math.floor(a.target / 60)}h` : `${a.current} / ${a.target}`;

export default function Achievements() {
  const [d, setD] = useState<any>(null), [cat, setCat] = useState(''), [st, setSt] = useState(''), [err, setErr] = useState('');
  useEffect(() => { api('/achievements').then(setD).catch(e => setErr(e.message)); }, []);
  if (err) return <div className="text-rose-300">{err}</div>;
  if (!d) return <div className="text-sky-200">Loading…</div>;
  const S = d.summary, list = d.achievements.filter((a: any) => (!cat || a.category === cat) && (!st || (st === 'unlocked') === a.unlocked));
  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold"><Award className="h-6 w-6 text-sky-300" />Achievements</h1>
      <div className="card"><div className="mb-1 flex justify-between text-sm"><span className="font-bold">{S.unlocked} of {S.total} unlocked</span><span className="text-sky-300">{S.percent}%</span></div><div className="bar"><div style={{ width: S.percent + '%' }} /></div>
        <p className="mt-2 text-xs text-sky-100/60">Achievements unlock automatically from your real progress — they can’t be added or edited by hand.</p></div>
      <div className="flex flex-wrap gap-2">{['', ...d.categories].map(c => <button key={c} onClick={() => setCat(c)} className={`chip !px-4 !py-1.5 ${cat === c ? 'bg-sky-500/40 ring-1 ring-sky-300' : 'bg-white/5'}`}>{c || 'All'}{c && ` ${S.byCategory[c].unlocked}/${S.byCategory[c].total}`}</button>)}
        <span className="mx-1 w-px bg-white/20" />{[['', 'Any status'], ['unlocked', 'Unlocked'], ['locked', 'Locked']].map(([k, l]) => <button key={k} onClick={() => setSt(k)} className={`chip !px-4 !py-1.5 ${st === k ? 'bg-sky-500/40 ring-1 ring-sky-300' : 'bg-white/5'}`}>{l}</button>)}</div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{list.map((a: any) => { const I = ICONS[a.icon] || Award; return (
        <div key={a.key} className={`card ${a.unlocked ? 'border-sky-300/60 shadow-[0_0_28px_rgba(139,92,246,.4)]' : 'opacity-80'}`}>
          <div className="flex items-start gap-3"><div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${a.unlocked ? 'bg-gradient-to-br from-sky-400 to-indigo-500' : 'bg-white/10 text-sky-100/50'}`}>{a.unlocked ? <I className="h-6 w-6" /> : <Lock className="h-5 w-5" />}</div>
            <div className="min-w-0"><div className="font-bold">{a.title}</div><div className="text-xs text-sky-100/70">{a.description}</div><span className="chip mt-1 bg-white/10">{a.category}</span></div></div>
          <div className="mt-3 flex justify-between text-xs"><span>{a.unlocked ? `Unlocked ${fmtDate(a.unlocked_date)}` : progressText(a)}</span><span>{a.progress}%</span></div><div className="bar mt-1"><div style={{ width: a.progress + '%' }} /></div>
        </div>); })}</div>
      {!list.length && <div className="card text-center text-sm text-sky-100/70">No achievements in this view.</div>}
      <div className="card"><h3 className="mb-3 font-bold">Achievement history</h3>
        {!d.history.length ? <p className="text-sm text-sky-100/60">Nothing unlocked yet — complete a lesson, set a goal, start a habit, add a project or a skill to earn your first one.</p>
          : <ul className="space-y-2">{d.history.map((h: any) => { const I = ICONS[h.icon] || Award; return <li key={h.key} className="flex items-center gap-3 text-sm"><I className="h-4 w-4 shrink-0 text-sky-300" /><span className="flex-1">{h.title} <span className="text-xs text-sky-100/50">· {h.category}</span></span><span className="text-xs text-sky-100/60">{fmtDate(h.unlocked_date)}</span></li>; })}</ul>}</div>
    </div>
  );
}
