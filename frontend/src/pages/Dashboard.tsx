import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowUpRight, BookOpen, Target, CheckCircle2, Flame, ClipboardList, CalendarCheck, Activity, TrendingUp, Trophy, Heart, Calendar, Compass } from 'lucide-react';
import { api } from '../api';
import { daysLabel, fmtMin } from '../dates';
import DashboardExtras from '../components/DashboardExtras';
const PCLR: Record<string, string> = { Overdue: 'bg-rose-500/25 text-rose-200', High: 'bg-orange-500/25 text-orange-200', Medium: 'bg-amber-400/20 text-amber-200', Low: 'bg-emerald-400/20 text-emerald-200' };
const Stat = ({ icon: I, label, v, sub, bar }: any) => (
  <div className="card"><div className="mb-2 flex items-center gap-2 text-sm text-sky-200"><I className="h-4 w-4" />{label}</div><div className="text-3xl font-extrabold">{v}</div>
    {bar !== undefined && <div className="bar my-1"><div style={{ width: bar + '%' }} /></div>}<div className="text-xs text-sky-100/70">{sub}</div></div>);
export default function Dashboard() {
  const [d, setD] = useState<any>(null), [err, setErr] = useState('');
  useEffect(() => { api('/dashboard').then(setD).catch(e => setErr(e.message)); }, []);
  if (err) return <div className="text-rose-300">{err}</div>;
  if (!d) return <div className="card animate-pulse text-sky-200" aria-busy="true">Loading your dashboard…</div>;
  const first = String(d.user?.name || '').trim().split(/\s+/)[0] || '', today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const A = d.assignmentSummary, S = d.academicStats, ST = d.study, na = d.nextAssignment;
  return (
    <div className="space-y-4">
      <section className="card relative min-h-[190px] overflow-hidden !p-0">
        <img src="/hero.svg" alt="" className="absolute right-0 top-0 hidden h-full w-[45%] object-cover md:block [mask-image:linear-gradient(90deg,transparent,#000_30%)]" />
        <div className="relative max-w-xl p-6">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold tracking-wider text-sky-300"><Sparkles className="h-3 w-3" />YOUR PERSONAL STUDENT SPACE</div>
          <h1 className="grad-text text-3xl font-extrabold leading-tight sm:text-4xl" data-testid="dashboard-greeting">{first ? `Hello, ${first}!` : 'Hello!'} <span aria-hidden="true">✨</span></h1>
          <p className="mt-1 text-lg font-bold">Make today count. <Heart className="inline h-5 w-5 fill-pink-400 text-pink-400" /></p>
          <p className="mt-2 text-sm text-[#B9AEC9]"><b className="text-[#F8F5FF]">{d.user.greeting}.</b> Ready to make today count? Let's keep moving toward your goals — every little step builds the future you dream about.</p>
          <Link to="/goals" className="btn mt-5">Explore my journey <ArrowUpRight className="h-4 w-4" /></Link>
        </div>
        <div className="absolute right-4 top-4 hidden items-center gap-2 rounded-xl bg-black/40 px-3 py-1 text-xs md:flex"><Calendar className="h-3 w-3" />{today}</div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={BookOpen} label="Academics" v={d.academics + '%'} sub={S.subjects ? `Overall progress · ${S.subjects} subjects · ${S.totalCredits} credits${S.attendance !== null ? ` · ${S.attendance}% attendance` : ''}` : 'Overall progress'} bar={d.academics} />
        <Stat icon={Target} label="Goals" v={d.activeGoals} sub="Active goals" />
        <Stat icon={CheckCircle2} label="Tasks" v={d.dueToday} sub={`Due today${A.overdue ? ` · ${A.overdue} overdue` : ''}`} />
        <Stat icon={Flame} label="Consistency" v={d.habitsDone} sub={`Habits completed today${d.habitStats?.bestCurrentStreak ? ` · best streak ${d.habitStats.bestCurrentStreak}d` : ''}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card"><h3 className="mb-3 font-bold">What should I do next?</h3>
          <div className="flex gap-4"><div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-indigo-500/40"><ClipboardList className="h-9 w-9" /></div>
            <div className="min-w-0 text-sm">{d.pendingAssignments ? <><b>Complete your upcoming assignments</b>
              <p className="my-1 text-xs text-sky-100/70">You have {d.pendingAssignments} assignment{d.pendingAssignments > 1 ? 's' : ''} to finish{na && <>. Next: {na.title}</>}.</p>
              {na && <span className={`chip mb-1 ${PCLR[na.priority]}`}>{na.priority}{na.days_left !== null && na.priority !== 'Overdue' ? ` · ${na.days_left === 0 ? 'today' : na.days_left + 'd left'}` : ''}</span>}</>
              : <><b>You're all caught up</b><p className="text-xs text-sky-100/70">Set a new goal to keep growing.</p></>}
              <div><Link to={d.pendingAssignments ? '/assignments' : '/goals'} className="btn !px-3 !py-1 text-xs">{d.pendingAssignments ? 'View Assignments' : 'Create goal'}</Link></div></div></div></div>
        <div className="card"><h3 className="mb-3 font-bold">Your Goals</h3>
          {d.goals.length ? d.goals.map((g: any) => <div key={g.id} className="mb-2 text-sm"><div className="flex justify-between"><span>{g.title}</span><span className="text-sky-300">{g.progress}%</span></div><div className="bar"><div style={{ width: g.progress + '%' }} /></div>{g.target_date && <div className={`mt-0.5 text-[11px] ${g.status === 'overdue' ? 'text-rose-300' : 'text-sky-100/60'}`}>{daysLabel(g.days_left)}</div>}</div>)
            : <div className="py-3 text-center text-sm"><Target className="mx-auto mb-1 text-sky-300" /><b>Start with a goal</b><br /><Link to="/goals" className="text-xs text-sky-300">+ Create a new goal</Link></div>}</div>
        <div className="card"><h3 className="mb-3 font-bold">Today's Focus</h3>
          <div className="flex items-center gap-4"><CalendarCheck className="h-12 w-12 shrink-0 text-sky-300" />
            <div className="text-sm">{d.focus ? <><b>{d.focus.title}</b><p className="text-xs text-sky-100/70">{d.focus.plan_title ? `${d.focus.plan_title} · ` : ''}{d.focus.session_date} · {fmtMin(d.focus.duration)}{d.focus.status === 'active' ? ' · in progress' : ''}</p></> : <p className="text-xs">No sessions planned.</p>}
              <Link to="/planner" className="btn mt-2 !px-3 !py-1 text-xs">Open Study Planner</Link></div></div></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card"><h3 className="mb-3 font-bold">Your Growth Journey</h3><TrendingUp className="mb-2 text-sky-300" />
          <p className="text-sm text-sky-100/80">{d.achievements}/{d.achievementStats.total} achievements earned · {d.habitsDone}/{d.habitsTotal} habits done today.</p>
          <div className="mt-3 text-xs text-sky-100/80"><div className="flex justify-between"><Link to="/career" className="hover:text-sky-300"><Compass className="mr-1 inline h-3 w-3" />Career lessons</Link><span>{d.career.lessonsDone}/{d.career.lessonsTotal} · {fmtMin(d.career.studyMinutes)} studied</span></div>
            <div className="bar mt-1"><div style={{ width: d.career.progress + '%' }} /></div>{d.career.nextLesson && <div className="mt-1 text-[11px] text-sky-100/60">Next: {d.career.nextLesson.title} ({d.career.nextLesson.stage})</div>}</div>
          <p className="mt-3 text-xs text-sky-100/80"><Link to="/projects" className="hover:text-sky-300">{d.projectStats.total} project{d.projectStats.total === 1 ? '' : 's'} ({d.projectStats.completed} completed) · {d.skillStats.total} skill{d.skillStats.total === 1 ? '' : 's'}</Link></p>
          <div className="mt-3 text-xs text-sky-100/80"><div className="flex justify-between"><span>Study this week</span><span>{ST.weekCompleted}/{ST.weekSessions} sessions · {ST.weekMinutesDone}/{ST.weekMinutes} min</span></div>
            <div className="bar mt-1"><div style={{ width: (ST.weekMinutes ? Math.round(ST.weekMinutesDone / ST.weekMinutes * 100) : 0) + '%' }} /></div></div>
          {A.total > 0 && <div className="mt-3 text-xs text-sky-100/80"><div className="flex justify-between"><span>Assignments completed</span><span>{A.completed}/{A.total}</span></div><div className="bar mt-1"><div style={{ width: Math.round(A.completed / A.total * 100) + '%' }} /></div></div>}
        </div>
        <div className="card"><h3 className="mb-3 font-bold">Recent Activity</h3>{d.activity.length ? d.activity.map((a: any) => <div key={a.id} className="mb-1 flex items-center gap-2 text-sm"><Activity className="h-4 w-4 shrink-0 text-sky-300" /><span className="truncate">{a.message}</span></div>) : <p className="text-sm">Nothing yet.</p>}</div>
        <div className="card text-center"><h3 className="mb-3 text-left font-bold">You're doing great!</h3><Trophy className="mx-auto mb-2 text-sky-300" /><b className="text-sm">Keep learning, keep growing.</b><p className="text-xs text-sky-100/70">Every task you finish is a step toward the future.</p>
          {d.achievementStats.recent.length > 0 && <Link to="/achievements" className="mt-3 block text-xs text-sky-300">Latest unlock: {d.achievementStats.recent[0].title}</Link>}</div>
      </div>
      <DashboardExtras d={d} />
    </div>
  );
}
