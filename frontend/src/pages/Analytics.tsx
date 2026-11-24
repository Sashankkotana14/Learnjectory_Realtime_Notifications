import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, AreaChart, Area, ReferenceLine, Legend } from 'recharts';
import { BarChart3, ChevronLeft, ChevronRight, Clock, Flame, Target, AlertTriangle, FolderKanban, GraduationCap, CalendarCheck, TrendingUp, TrendingDown, Minus, RefreshCw, Sparkles, BookOpen } from 'lucide-react';
import { api } from '../api';
import { fmtDate, fmtMin } from '../dates';

// ---------- shared look (matches the existing dark-purple glass cards) ----------
const C = ['#8B5CF6', '#A78BFA', '#C084FC', '#EC4899'];
const TIP = { contentStyle: { background: 'rgba(24,17,42,.96)', border: '1px solid rgba(167,139,250,.38)', borderRadius: 12, color: '#F8F5FF', fontSize: 12 }, itemStyle: { color: '#F8F5FF' }, labelStyle: { color: '#C4B5FD', fontWeight: 700 }, cursor: { fill: 'rgba(167,139,250,.12)' } };
const AX = { stroke: '#B9AEC9', fontSize: 11, tickLine: false };
const GRID = <CartesianGrid stroke="#ffffff15" vertical={false} />;
const STATE: Record<string, string> = { Completed: '#34D399', Ongoing: '#8B5CF6', Overdue: '#FB7185', Planning: '#67E8F9', Active: '#8B5CF6', 'On hold': '#FBBF24' };
const PSTATUS: Record<string, string> = { planning: 'Planning', active: 'Active', on_hold: 'On hold', completed: 'Completed' };
const LegacyBox = ({ t, children }: any) => <div className="card"><h3 className="mb-3 font-bold">{t}</h3><div className="h-60"><ResponsiveContainer>{children}</ResponsiveContainer></div></div>;

const Panel = ({ icon: I, title, badge, children, className = '' }: any) => (
  <section className={`card min-w-0 ${className}`}>
    <div className="mb-3 flex flex-wrap items-center gap-2"><I className="h-4 w-4 shrink-0 text-violet-300" /><h3 className="font-bold">{title}</h3>
      {badge && <span className="chip ml-auto bg-white/10 text-[#B9AEC9]">{badge}</span>}</div>{children}</section>
);
const Empty = ({ icon: I, title, text, to, cta }: any) => (
  <div className="grid place-items-center rounded-xl border border-dashed border-[rgba(167,139,250,.28)] bg-white/[.02] px-4 py-8 text-center">
    <I className="mb-2 h-8 w-8 text-violet-300/80" /><b className="text-sm">{title}</b><p className="mt-1 max-w-xs text-xs text-[#B9AEC9]">{text}</p>
    {to && <Link to={to} className="btn mt-3 !px-4 !py-1 text-xs">{cta}</Link>}
  </div>
);
const Bar1 = ({ v, color }: { v: number; color?: string }) => <div className="bar"><div style={{ width: Math.max(0, Math.min(100, v)) + '%', ...(color ? { background: color } : {}) }} /></div>;
const Mini = ({ label, v, sub }: any) => <div className="rounded-xl bg-white/[.04] px-3 py-2"><div className="text-[11px] text-[#B9AEC9]">{label}</div><div className="text-lg font-extrabold leading-tight">{v}</div>{sub && <div className="text-[11px] text-[#B9AEC9]">{sub}</div>}</div>;
const Tabs = ({ value, onChange, items }: any) => (
  <div className="inline-flex rounded-full bg-white/[.06] p-0.5 text-xs" role="tablist">
    {items.map(([k, l]: string[]) => <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)} className={`rounded-full px-3 py-1 font-semibold transition ${value === k ? 'bg-violet-500 text-white shadow-[0_0_12px_rgba(139,92,246,.6)]' : 'text-[#B9AEC9] hover:text-white'}`}>{l}</button>)}
  </div>
);
// change vs the previous period (arrow + text)
function Delta({ now, prev, unit = '', label, lowerIsBetter = false }: any) {
  if (prev === null || prev === undefined || now === null || now === undefined) return null;
  const diff = Math.round((now - prev) * 10) / 10;
  if (diff === 0) return <span className="inline-flex items-center gap-1 text-[11px] text-[#B9AEC9]"><Minus className="h-3 w-3" />same as {label}</span>;
  const good = lowerIsBetter ? diff < 0 : diff > 0, I = diff > 0 ? TrendingUp : TrendingDown;
  return <span className={`inline-flex items-center gap-1 text-[11px] ${good ? 'text-emerald-300' : 'text-rose-300'}`}><I className="h-3 w-3" />{diff > 0 ? '+' : ''}{diff}{unit} vs {label}</span>;
}
const hrs = (m: number) => (m ? fmtMin(m) : '0m');
const rateColor = (r: number | null) => (r === null ? '#B9AEC9' : r >= 75 ? '#34D399' : r >= 50 ? '#FBBF24' : '#FB7185');
const ttTitle = (_l: any, p: any) => p?.[0]?.payload?.title || '';

function Gauge({ value, label }: { value: number | null; label?: string }) {
  const r = 54, c = 2 * Math.PI * r, v = value ?? 0;
  return (
    <div className="relative mx-auto h-40 w-40 shrink-0" role="img" aria-label={`Overall learning progress ${v} percent`}>
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90"><defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stopColor="#8B5CF6" /><stop offset="1" stopColor="#EC4899" /></linearGradient></defs>
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="12" />
        <circle cx="70" cy="70" r={r} fill="none" stroke="url(#gg)" strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: 'stroke-dashoffset .6s ease' }} /></svg>
      <div className="absolute inset-0 grid place-items-center text-center"><div><div className="text-3xl font-extrabold">{value === null ? '–' : value + '%'}</div><div className="text-[11px] text-[#B9AEC9]">{label}</div></div></div>
    </div>
  );
}

export default function Analytics() {
  const [range, setRange] = useState<'week' | 'month' | 'overall'>('week'), [offset, setOffset] = useState(0);
  const [d, setD] = useState<any>(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const [studyBy, setStudyBy] = useState('subject'), [goalFilter, setGoalFilter] = useState('all'), [attSort, setAttSort] = useState('name');
  const seq = useRef(0);
  const load = useCallback(() => {
    const n = ++seq.current; setBusy(true); setErr('');
    api(`/analytics?range=${range}&offset=${range === 'overall' ? 0 : offset}`)
      .then(r => { if (n === seq.current) setD(r); })
      .catch(e => { if (n === seq.current) setErr(e.message || 'Could not load analytics'); })
      .finally(() => { if (n === seq.current) setBusy(false); });
  }, [range, offset]);
  useEffect(load, [load]);
  const pick = (r: 'week' | 'month' | 'overall') => { setRange(r); setOffset(0); };

  if (!d && err) return <div className="card text-center"><AlertTriangle className="mx-auto mb-2 text-rose-300" /><p className="mb-3 text-rose-300">{err}</p><button className="btn" onClick={load}><RefreshCw className="h-4 w-4" />Try again</button></div>;
  if (!d) return <div className="card animate-pulse text-violet-200" aria-busy="true">Loading your analytics…</div>;

  const { studyHours: S, habitTrends: HT, weeklyHabits: WH, goals: GL, overdueAssignments: OD, projects: PJ, learning: L, attendance: AT, grades: GR, comparison: CMP } = d;
  const label = CMP?.label, period = d.period.label, ax = { stroke: '#67E8F9', fontSize: 11 };
  const attRows = AT.subjects.filter((s: any) => s.tracked).slice().sort((a: any, b: any) => (attSort === 'pct' ? a.pct - b.pct : a.subject.localeCompare(b.subject)));
  const goalItems = GL.items.filter((g: any) => goalFilter === 'all' || g.state === goalFilter);
  const gradeRows = GR.subjects.filter((s: any) => s.status !== 'incomplete');
  const noData = !S.hasData && !HT.hasData && !GL.hasData && !OD.hasData && !PJ.hasData && !AT.hasData && !GR.hasData;
  const kpis = [
    { i: Sparkles, l: 'Learning score', v: L.score === null ? '–' : L.score + '%', s: L.level || 'No data yet' },
    { i: Clock, l: 'Study time', v: hrs(S.totalMinutes), s: S.hasData ? `${S.activeDays} active day${S.activeDays === 1 ? '' : 's'}` : 'No study logged' },
    { i: Flame, l: 'Habit completion', v: HT.completionRate === null ? '–' : HT.completionRate + '%', s: HT.hasData ? `${HT.completions}/${HT.possible} habit-days` : 'No habit data' },
    { i: Target, l: 'Goals completed', v: GL.completed, s: `${GL.ongoing} ongoing` },
    { i: AlertTriangle, l: 'Overdue', v: OD.overdue, s: OD.total ? `of ${OD.total} assignments` : 'No assignments' },
    { i: GraduationCap, l: 'Attendance', v: AT.overall === null ? '–' : AT.overall + '%', s: AT.hasData ? `${AT.low.length} below ${AT.threshold}%` : 'Not tracked' },
  ];

  return (
    <div className="space-y-4">
      {/* header + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0"><h1 className="flex items-center gap-2 text-2xl font-extrabold"><BarChart3 className="h-6 w-6 text-violet-300" />Analytics</h1>
          <p className="text-xs text-[#B9AEC9]" aria-live="polite">{period}{busy ? ' · updating…' : ''}</p></div>
        {range !== 'overall' && (
          <div className="flex items-center gap-1">
            <button className="btn-ghost !p-2" aria-label={`Previous ${range}`} onClick={() => setOffset(offset - 1)}><ChevronLeft className="h-4 w-4" /></button>
            <button className="btn-ghost !px-3 !py-1.5 text-xs" disabled={offset === 0} onClick={() => setOffset(0)}>{range === 'week' ? 'This week' : 'This month'}</button>
            <button className="btn-ghost !p-2" aria-label={`Next ${range}`} disabled={offset === 0} onClick={() => setOffset(Math.min(0, offset + 1))}><ChevronRight className="h-4 w-4" /></button>
          </div>)}
        <Tabs value={range} onChange={pick} items={[['week', 'Weekly'], ['month', 'Monthly'], ['overall', 'Overall']]} />
      </div>
      {err && <div className="card flex items-center gap-3 !py-3 text-sm text-rose-300"><AlertTriangle className="h-4 w-4" />{err}<button className="btn-ghost ml-auto !py-1 text-xs" onClick={load}>Retry</button></div>}
      <div className={`space-y-4 transition-opacity ${busy ? 'opacity-60' : ''}`}>
        {noData && <Empty icon={Sparkles} title="No analytics yet" text="Add subjects, goals, habits, assignments or study sessions and your analytics will appear here automatically." to="/academics" cta="Go to Academics" />}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {kpis.map(k => <div key={k.l} className="card !p-4"><div className="mb-1 flex items-center gap-2 text-xs text-violet-200"><k.i className="h-4 w-4" />{k.l}</div><div className="text-2xl font-extrabold">{k.v}</div><div className="text-[11px] text-[#B9AEC9]">{k.s}</div></div>)}
        </div>

        {/* 9. Overall learning progress */}
        <Panel icon={Sparkles} title="Overall learning progress" badge={period}>
          {L.hasData ? (
            <div className="grid items-center gap-6 md:grid-cols-[170px_1fr]">
              <div><Gauge value={L.score} label={L.level} />{CMP && <div className="mt-2 text-center"><Delta now={L.score} prev={CMP.score} unit=" pts" label={label} /></div>}</div>
              <div className="space-y-3">
                {L.components.map((c: any) => <div key={c.key}><div className="mb-1 flex justify-between gap-2 text-sm"><span className="font-semibold">{c.label}<span className="ml-2 text-[11px] font-normal text-[#B9AEC9]">{c.detail}</span></span><b style={{ color: rateColor(c.value) }}>{c.value}%</b></div><Bar1 v={c.value} /></div>)}
                <p className="text-[11px] text-[#B9AEC9]">Average of the areas that have data{L.skills.count ? ` · ${L.skills.count} skills, average level ${L.skills.avgLevel}%` : ''}.</p>
              </div>
            </div>) : <Empty icon={Sparkles} title="Nothing to measure yet" text="Your learning score is built from academics, assignments, goals, habits, study plans, career lessons and projects." to="/goals" cta="Create a goal" />}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* 3. Study hours */}
          <Panel icon={Clock} title={range === 'week' ? 'Weekly study hours' : 'Study hours'} badge={S.hasData ? `${(S.totalMinutes / 60).toFixed(1)} h total` : undefined}>
            {S.hasData ? <>
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Mini label="Total" v={hrs(S.totalMinutes)} sub={CMP ? <Delta now={S.totalMinutes} prev={CMP.studyMinutes} unit=" min" label={label} /> : undefined} />
                <Mini label="Avg / day" v={hrs(S.avgMinutesPerDay)} />
                <Mini label="Best day" v={S.bestDay ? hrs(S.bestDay.minutes) : '–'} sub={S.bestDay ? fmtDate(S.bestDay.date) : ''} />
                <Mini label="Plan adherence" v={S.adherence === null ? '–' : S.adherence + '%'} sub={S.plannedMinutes ? `${hrs(S.plannedDoneMinutes)} of ${hrs(S.plannedMinutes)}` : 'No plans'} />
              </div>
              <div className="h-52"><ResponsiveContainer><BarChart data={S.series}>{GRID}<XAxis dataKey="label" {...AX} interval="preserveStartEnd" /><YAxis {...AX} unit="h" allowDecimals />
                <Tooltip {...TIP} formatter={(_v: any, _n: any, p: any) => [hrs(p.payload.minutes), 'Studied']} labelFormatter={ttTitle} />
                <Bar dataKey="hours" fill="#8B5CF6" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
              <div className="mt-3 flex items-center justify-between"><span className="text-xs font-bold text-violet-200">Where the time went</span><Tabs value={studyBy} onChange={setStudyBy} items={[['subject', 'Subject'], ['source', 'Source']]} /></div>
              <div className="mt-2 space-y-2">{(studyBy === 'subject' ? S.bySubject : S.bySource).map((x: any) => <div key={x.name} className="text-xs"><div className="mb-0.5 flex justify-between gap-2"><span className="truncate">{x.name}</span><span className="shrink-0 text-[#B9AEC9]">{hrs(x.minutes)} · {x.share}%</span></div><Bar1 v={x.share} /></div>)}</div>
            </> : <Empty icon={Clock} title="No study time in this period" text="Complete a Study Planner session or log study hours in Career Compass to see your hours here." to="/planner" cta="Open Study Planner" />}
          </Panel>

          {/* 4. Habit completion trends */}
          <Panel icon={Flame} title="Habit completion trends" badge={HT.hasData ? `${HT.completionRate}% overall` : undefined}>
            {HT.hasData ? <>
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Mini label="Completion" v={HT.completionRate + '%'} sub={CMP ? <Delta now={HT.completionRate} prev={CMP.habitRate} unit="%" label={label} /> : undefined} />
                <Mini label="Perfect days" v={HT.perfectDays} sub="all habits done" />
                <Mini label="Best streak" v={HT.bestStreak + 'd'} sub={`longest ${HT.longestStreak}d`} />
                <Mini label="Best period" v={HT.bestPeriod || '–'} />
              </div>
              <div className="h-52"><ResponsiveContainer><AreaChart data={HT.series}><defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#EC4899" stopOpacity=".5" /><stop offset="1" stopColor="#8B5CF6" stopOpacity=".05" /></linearGradient></defs>{GRID}
                <XAxis dataKey="label" {...AX} interval="preserveStartEnd" /><YAxis {...AX} domain={[0, 100]} unit="%" />
                <Tooltip {...TIP} formatter={(v: any, _n: any, p: any) => [`${v}% (${p.payload.done}/${p.payload.eligible})`, 'Completed']} labelFormatter={ttTitle} />
                <Area type="monotone" dataKey="rate" stroke="#EC4899" strokeWidth={3} fill="url(#hg)" connectNulls={false} dot={{ r: 3, fill: '#EC4899' }} /></AreaChart></ResponsiveContainer></div>
              <div className="mt-3 space-y-2">{HT.habits.slice(0, 6).map((h: any) => <div key={h.id} className="text-xs"><div className="mb-0.5 flex justify-between gap-2"><span className="truncate">{h.name}<span className="ml-2 text-[#B9AEC9]">{h.category}</span></span><span className="shrink-0" style={{ color: rateColor(h.rate) }}>{h.rate === null ? '–' : h.rate + '%'} · {h.completedDays}/{h.eligibleDays}d</span></div><Bar1 v={h.rate || 0} color={rateColor(h.rate)} /></div>)}</div>
            </> : <Empty icon={Flame} title="No habit data in this period" text="Create a habit in the Growth Engine and tick it off each day to see your trend." to="/growth" cta="Open Growth Engine" />}
          </Panel>

          {/* 5. Weekly habit activity */}
          <Panel icon={CalendarCheck} title="Weekly habit activity" badge={WH.hasData ? (WH.perDate ? 'This week by day' : 'By weekday') : undefined}>
            {WH.hasData ? <>
              <div className="overflow-x-auto"><div className="min-w-[420px]">
                <div className="grid items-center gap-1" style={{ gridTemplateColumns: '110px repeat(7, 1fr)' }}>
                  <div />{WH.days.map((x: any) => <div key={x.label} className="text-center text-[11px] text-[#B9AEC9]">{x.label}</div>)}
                  {WH.habits.map((h: any) => <div key={h.id} className="contents">
                    <div className="truncate pr-2 text-xs" title={h.name}>{h.name}</div>
                    {h.cells.map((c: any) => {
                      const r = c.eligible ? c.done / c.eligible : null;
                      const tip = !c.eligible ? `${h.name} · ${c.label}: no data` : WH.perDate ? `${h.name} · ${fmtDate(c.date)}: ${c.done ? 'completed' : 'not completed'}` : `${h.name} · ${c.label}: ${c.done} of ${c.eligible} days completed`;
                      return <div key={c.label} tabIndex={0} title={tip} aria-label={tip}
                        className="grid h-8 place-items-center rounded-md text-[11px] font-bold outline-none transition hover:ring-2 hover:ring-violet-300 focus:ring-2 focus:ring-violet-300"
                        style={{ background: r === null ? 'rgba(255,255,255,.04)' : `rgba(139,92,246,${0.12 + r * 0.78})`, color: r === null ? '#B9AEC9' : '#fff' }}>{r === null ? '·' : WH.perDate ? (c.done ? '✓' : '') : c.done}</div>;
                    })}</div>)}
                </div></div></div>
              <div className="mt-3 h-36"><ResponsiveContainer><BarChart data={WH.days}>{GRID}<XAxis dataKey="label" {...AX} /><YAxis {...AX} allowDecimals={false} />
                <Tooltip {...TIP} formatter={(v: any, _n: any, p: any) => [`${v} of ${p.payload.eligible}${p.payload.rate !== null ? ` (${p.payload.rate}%)` : ''}`, 'Habit-days completed']} />
                <Bar dataKey="done" fill="#C084FC" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
              <p className="mt-1 text-[11px] text-[#B9AEC9]">{WH.bestDay ? `Most consistent day: ${WH.bestDay}. ` : ''}{WH.perDate ? 'Darker = completed.' : 'Numbers show completed days across the period; darker = higher completion.'}</p>
            </> : <Empty icon={CalendarCheck} title="No habit activity yet" text="Once you have habits, their weekly pattern shows up here." to="/growth" cta="Add a habit" />}
          </Panel>

          {/* 6. Goals completed vs ongoing */}
          <Panel icon={Target} title="Goals: completed vs ongoing" badge={GL.hasData ? `${GL.completionRate}% completed` : undefined}>
            {GL.hasData ? <>
              <div className="grid items-center gap-3 sm:grid-cols-[170px_1fr]">
                <div className="h-40"><ResponsiveContainer><PieChart><Pie data={GL.chart} dataKey="value" nameKey="name" innerRadius={42} outerRadius={66} paddingAngle={3} stroke="none">{GL.chart.map((x: any) => <Cell key={x.name} fill={STATE[x.name]} />)}</Pie><Tooltip {...TIP} /></PieChart></ResponsiveContainer></div>
                <div className="grid grid-cols-3 gap-2"><Mini label="Completed" v={GL.completed} /><Mini label="Ongoing" v={GL.ongoing} sub={GL.avgOngoingProgress !== null ? `avg ${GL.avgOngoingProgress}%` : ''} /><Mini label="Overdue" v={GL.overdue} /></div>
              </div>
              <div className="my-3 flex flex-wrap gap-1">{[['all', 'All'], ['ongoing', 'Ongoing'], ['overdue', 'Overdue'], ['completed', 'Completed']].map(([k, l]) => <button key={k} onClick={() => setGoalFilter(k)} className={`chip ${goalFilter === k ? 'bg-violet-500 text-white' : 'bg-white/10 text-[#B9AEC9] hover:text-white'}`}>{l}</button>)}</div>
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">{goalItems.length ? goalItems.map((g: any) => <div key={g.id + g.state} className="text-sm"><div className="flex justify-between gap-2"><span className="truncate">{g.title}</span><span className="shrink-0 text-xs" style={{ color: g.state === 'overdue' ? STATE.Overdue : g.state === 'completed' ? STATE.Completed : STATE.Ongoing }}>{g.progress}%</span></div><Bar1 v={g.progress} color={g.state === 'overdue' ? '#FB7185' : g.state === 'completed' ? '#34D399' : undefined} />
                <div className="mt-0.5 text-[11px] text-[#B9AEC9]">{g.state === 'completed' ? `Completed ${fmtDate(g.completed_at)}` : g.target_date ? `${g.state === 'overdue' ? 'Was due' : 'Due'} ${fmtDate(g.target_date)}` : 'No deadline'}</div></div>) : <p className="py-4 text-center text-xs text-[#B9AEC9]">No goals in this filter.</p>}</div>
            </> : <Empty icon={Target} title="No goals in this period" text="Set a goal with a target date and track it from ongoing to completed." to="/goals" cta="Create a goal" />}
          </Panel>

          {/* 7. Overdue assignments */}
          <Panel icon={AlertTriangle} title="Overdue assignments analysis" badge={OD.hasData ? `${OD.overdue} overdue` : undefined}>
            {OD.hasData ? <>
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><Mini label="Overdue" v={OD.overdue} sub={OD.overdueRate !== null ? `${OD.overdueRate}% of ${OD.total}` : ''} /><Mini label="Completed" v={OD.completed} sub={OD.completionRate !== null ? `${OD.completionRate}%` : ''} /><Mini label="On time" v={OD.onTimeRate === null ? '–' : OD.onTimeRate + '%'} sub={`${OD.completedLate} late`} /><Mini label="Pending" v={OD.pending} sub="not yet due" /></div>
              <div className="h-48"><ResponsiveContainer><BarChart data={OD.series}>{GRID}<XAxis dataKey="label" {...AX} interval="preserveStartEnd" /><YAxis {...AX} allowDecimals={false} /><Tooltip {...TIP} labelFormatter={ttTitle} /><Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="onTime" name="On time" stackId="a" fill="#34D399" /><Bar dataKey="late" name="Done late" stackId="a" fill="#FBBF24" /><Bar dataKey="pending" name="Pending" stackId="a" fill="#8B5CF6" /><Bar dataKey="overdue" name="Overdue" stackId="a" fill="#FB7185" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
              {OD.overdue > 0 ? <>
                <div className="mt-3 grid grid-cols-4 gap-1 text-center text-[11px]">{OD.ageing.map((a: any) => <div key={a.name} className="rounded-lg bg-white/[.04] py-1"><b className="block text-sm" style={{ color: a.value ? '#FB7185' : undefined }}>{a.value}</b>{a.name}</div>)}</div>
                <div className="mt-3 max-h-40 space-y-1.5 overflow-y-auto pr-1">{OD.items.map((a: any) => <div key={a.id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate">{a.title}<span className="ml-2 text-[11px] text-[#B9AEC9]">{a.subject}</span></span><span className="chip shrink-0 bg-rose-500/25 text-rose-200">{a.days_overdue}d overdue</span></div>)}</div>
                <Link to="/assignments" className="mt-2 inline-block text-xs text-violet-300 hover:underline">Go to Assignments →</Link>
              </> : <p className="mt-3 rounded-xl bg-emerald-400/10 p-3 text-center text-xs text-emerald-200">Nothing overdue — great work staying on top of deadlines.</p>}
            </> : <Empty icon={AlertTriangle} title="No assignments in this period" text="Assignments due in the selected period appear here, with what is overdue and what was finished late." to="/assignments" cta="Add an assignment" />}
          </Panel>

          {/* 8. Project performance */}
          <Panel icon={FolderKanban} title="Project performance" badge={PJ.hasData ? `${PJ.completionRate}% completed` : undefined}>
            {PJ.hasData ? <>
              <div className="grid items-center gap-3 sm:grid-cols-[170px_1fr]">
                <div className="h-40"><ResponsiveContainer><PieChart><Pie data={PJ.chart} dataKey="value" nameKey="name" innerRadius={42} outerRadius={66} paddingAngle={3} stroke="none">{PJ.chart.map((x: any) => <Cell key={x.name} fill={STATE[x.name]} />)}</Pie><Tooltip {...TIP} /></PieChart></ResponsiveContainer></div>
                <div className="grid grid-cols-2 gap-2"><Mini label="Total" v={PJ.total} sub={`${PJ.active} active · ${PJ.onHold} on hold`} /><Mini label="Completed" v={PJ.completed} sub={`${PJ.completedInPeriod} in period`} /><Mini label="Started in period" v={PJ.createdInPeriod} /><Mini label="Avg time to finish" v={PJ.avgDaysToComplete === null ? '–' : PJ.avgDaysToComplete + 'd'} /></div>
              </div>
              {range !== 'overall' && <div className="mt-3 h-32"><ResponsiveContainer><BarChart data={PJ.series}>{GRID}<XAxis dataKey="label" {...AX} interval="preserveStartEnd" /><YAxis {...AX} allowDecimals={false} /><Tooltip {...TIP} labelFormatter={ttTitle} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="started" name="Started" fill="#8B5CF6" radius={[4, 4, 0, 0]} /><Bar dataKey="completed" name="Completed" fill="#34D399" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>}
              {PJ.technologies.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{PJ.technologies.map((t: any) => <span key={t.name} className="chip bg-violet-500/20 text-violet-100">{t.name} · {t.count}</span>)}</div>}
              <div className="mt-3 max-h-40 space-y-1.5 overflow-y-auto pr-1">{PJ.items.map((p: any) => { const col = STATE[PSTATUS[p.status]] || '#A78BFA'; return <div key={p.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{p.title}</span><span className="chip shrink-0" style={{ background: col + '33', color: col }}>{String(p.status).replace('_', ' ')}</span></div>; })}</div>
              <p className="mt-1 text-[11px] text-[#B9AEC9]">Statuses show each project's current state.</p>
            </> : <Empty icon={FolderKanban} title="No projects yet" text="Add a project in Projects & Skills to track how many you start and finish." to="/projects" cta="Add a project" />}
          </Panel>

          {/* 1. Attendance by subject */}
          <Panel icon={GraduationCap} title="Attendance by subject" badge="All-time">
            {AT.hasData ? <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-[#B9AEC9]">Overall <b className="text-sm text-white">{AT.overall}%</b> · {AT.attended}/{AT.total} classes</span><Tabs value={attSort} onChange={setAttSort} items={[['name', 'A–Z'], ['pct', 'Lowest first']]} /></div>
              <div style={{ height: Math.max(160, attRows.length * 42 + 30) }}><ResponsiveContainer><BarChart data={attRows} layout="vertical" margin={{ left: 8, right: 16 }}><CartesianGrid stroke="#ffffff15" horizontal={false} /><XAxis type="number" domain={[0, 100]} unit="%" {...AX} /><YAxis type="category" dataKey="subject" width={92} {...AX} />
                <Tooltip {...TIP} formatter={(v: any, _n: any, p: any) => [`${v}% (${p.payload.attended}/${p.payload.total} classes, ${p.payload.missed} missed)`, 'Attendance']} />
                <ReferenceLine x={AT.threshold} stroke="#FBBF24" strokeDasharray="4 4" label={{ value: `${AT.threshold}%`, fill: '#FBBF24', fontSize: 10, position: 'top' }} />
                <Bar dataKey="pct" radius={[0, 6, 6, 0]}>{attRows.map((r: any) => <Cell key={r.id} fill={r.status === 'low' ? '#FB7185' : r.status === 'watch' ? '#FBBF24' : '#34D399'} />)}</Bar></BarChart></ResponsiveContainer></div>
              {AT.low.length > 0 ? <p className="mt-2 rounded-xl bg-rose-500/10 p-2 text-xs text-rose-200">Below {AT.threshold}%: {AT.low.join(', ')}.</p> : <p className="mt-2 rounded-xl bg-emerald-400/10 p-2 text-xs text-emerald-200">All tracked subjects are at or above {AT.threshold}%.</p>}
              {AT.untracked > 0 && <p className="mt-1 text-[11px] text-[#B9AEC9]">{AT.untracked} subject{AT.untracked === 1 ? ' has' : 's have'} no classes recorded yet.</p>}
            </> : <Empty icon={GraduationCap} title="No attendance recorded" text="Enter classes attended and total classes for a subject in Academics." to="/academics" cta="Open Academics" />}
          </Panel>

          {/* 2. Current vs target grade */}
          <Panel icon={BookOpen} title="Current grade vs target grade" badge="Current">
            {GR.hasData ? <>
              <div className="mb-3 grid grid-cols-3 gap-2"><Mini label="Current GPA" v={GR.currentGpa ?? '–'} /><Mini label="Target GPA" v={GR.targetGpa ?? '–'} /><Mini label="Gap" v={GR.gpaGap === null ? '–' : GR.gpaGap > 0 ? '+' + GR.gpaGap : GR.gpaGap} sub={GR.gpaGap !== null && GR.gpaGap <= 0 ? 'target reached' : 'to reach target'} /></div>
              <div className="h-56"><ResponsiveContainer><BarChart data={gradeRows}>{GRID}<XAxis dataKey="subject" {...AX} interval={0} /><YAxis {...AX} domain={[0, 4]} ticks={[0, 1, 2, 3, 4]} /><Legend wrapperStyle={{ fontSize: 11 }} />
                <Tooltip {...TIP} formatter={(v: any, n: any, p: any) => [`${v} (${n === 'Current' ? p.payload.grade : p.payload.target_grade})`, n]} />
                <Bar dataKey="current" name="Current" fill="#8B5CF6" radius={[6, 6, 0, 0]} /><Bar dataKey="target" name="Target" fill="#EC4899" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
              <div className="mt-2 space-y-1.5">{gradeRows.map((s: any) => <div key={s.id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate">{s.subject}</span><span className="flex shrink-0 items-center gap-2"><span className="text-xs text-[#B9AEC9]">{s.grade} → {s.target_grade}</span><span className={`chip ${s.status === 'met' ? 'bg-emerald-400/20 text-emerald-200' : s.status === 'close' ? 'bg-amber-400/20 text-amber-200' : 'bg-rose-500/25 text-rose-200'}`}>{s.status === 'met' ? 'target met' : s.status === 'close' ? `${s.gap} to go` : `${s.gap} behind`}</span></span></div>)}</div>
              {GR.missing > 0 && <p className="mt-1 text-[11px] text-[#B9AEC9]">{GR.missing} subject{GR.missing === 1 ? ' needs' : 's need'} both a current and a target grade to be compared.</p>}
            </> : <Empty icon={BookOpen} title="No grades to compare" text="Set a current grade and a target grade for a subject in Academics." to="/academics" cta="Open Academics" />}
          </Panel>
        </div>

        {/* original charts (unchanged data, all-time) */}
        <div><h2 className="mb-2 mt-2 text-sm font-bold text-violet-200">Existing insights <span className="font-normal text-[#B9AEC9]">· all-time</span></h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <LegacyBox t="Academic progress by subject"><BarChart data={d.subjects}><CartesianGrid stroke="#ffffff15" /><XAxis dataKey="name" {...ax} /><YAxis {...ax} /><Tooltip /><Bar dataKey="value" fill="#8B5CF6" radius={[6, 6, 0, 0]} /></BarChart></LegacyBox>
            <LegacyBox t="Assignments"><PieChart><Pie data={d.assignments} dataKey="value" nameKey="name" label>{d.assignments.map((_: any, i: number) => <Cell key={i} fill={C[i % 4]} />)}</Pie><Tooltip /></PieChart></LegacyBox>
            <LegacyBox t="Study minutes by day"><LineChart data={d.study}><CartesianGrid stroke="#ffffff15" /><XAxis dataKey="name" {...ax} /><YAxis {...ax} /><Tooltip /><Line dataKey="value" stroke="#A78BFA" strokeWidth={3} /></LineChart></LegacyBox>
            <LegacyBox t="Skill levels"><BarChart data={d.skills} layout="vertical"><XAxis type="number" {...ax} /><YAxis type="category" dataKey="name" {...ax} /><Tooltip /><Bar dataKey="value" fill="#C084FC" radius={[0, 6, 6, 0]} /></BarChart></LegacyBox>
          </div></div>
      </div>
    </div>
  );
}
