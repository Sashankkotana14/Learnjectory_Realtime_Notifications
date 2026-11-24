import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap, Users, BarChart3, LayoutGrid, Settings2, Eye, EyeOff, ArrowUp, ArrowDown, FileText, Link2, StickyNote, Lock, MessageSquare, Heart, HelpCircle, ClipboardList, Target, Compass, FolderKanban, UserPlus } from 'lucide-react';
import { api, ago } from '../api';
import { daysLabel, fmtDate, fmtMin } from '../dates';

// Dashboard integrations: Statistics, Opportunities, Community and Data Boards. Every number comes from GET /api/dashboard (real database rows).
const JCLR: Record<string, string> = { saved: 'bg-sky-400/20 text-sky-200', applied: 'bg-violet-500/25 text-violet-200', interviewing: 'bg-amber-400/20 text-amber-200', offer: 'bg-emerald-400/20 text-emerald-200', rejected: 'bg-rose-500/25 text-rose-200' };
const fmtBytes = (b: number) => (b >= 1048576 ? (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : b + ' B');
const Empty = ({ text, to, cta }: { text: string; to: string; cta: string }) => (<div className="py-3 text-center text-sm"><p className="text-xs text-sky-100/70">{text}</p><Link to={to} className="text-xs text-sky-300">{cta}</Link></div>);
const Head = ({ icon: I, title, to, cta }: any) => (<div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-2 font-bold"><I className="h-4 w-4 text-sky-300" />{title}</h3>{to && <Link to={to} className="text-xs text-sky-300 hover:underline">{cta || 'Open'}</Link>}</div>);
const Mini = ({ v, label }: { v: any; label: string }) => (<div className="rounded-xl bg-white/5 px-3 py-2 text-center"><div className="text-lg font-extrabold">{v}</div><div className="text-[10px] text-sky-100/70">{label}</div></div>);

function StatTile({ t }: { t: any }) {
  const none = t.value === null || t.value === undefined;
  const v = none ? '—' : t.unit === '%' ? t.value + '%' : t.unit === 'min' ? fmtMin(t.value) : t.value;
  return (<Link to={t.link} className="card block !p-4" data-testid={'stat-' + t.key}>
    <div className="text-xs text-sky-200">{t.label}</div><div className="text-2xl font-extrabold">{v}</div>
    {t.unit === '%' && <div className="bar my-1"><div style={{ width: (none ? 0 : t.value) + '%' }} /></div>}
    <div className="text-[11px] text-sky-100/70">{t.detail}</div></Link>);
}

function OpportunitiesCard({ o }: { o: any }) {
  return (<div className="card" data-testid="dash-opportunities"><Head icon={Zap} title="Opportunities" to="/opportunities" cta="Find jobs" />
    {o.has_resume ? <p className="mb-2 text-xs text-sky-100/80"><FileText className="mr-1 inline h-3 w-3" />Resume “{o.resume.filename}” · {o.resume.skills} skill{o.resume.skills === 1 ? '' : 's'} · {o.resume.projects} project{o.resume.projects === 1 ? '' : 's'} · analysed {ago(o.resume.uploaded_at)}</p>
      : <p className="mb-2 text-xs text-sky-100/70">No resume analysed yet. <Link to="/opportunities" className="text-sky-300">Upload one</Link> to get skill matches.</p>}
    <div className="mb-3 grid grid-cols-3 gap-2"><Mini v={o.saved_total} label="Saved jobs" /><Mini v={o.applications} label="Applied" /><Mini v={o.interview_rate === null ? '—' : o.interview_rate + '%'} label="Interview rate" /></div>
    {o.saved_total > 0 && <div className="mb-3 flex flex-wrap gap-1">{Object.entries(o.counts).filter(([, n]: any) => n > 0).map(([s, n]: any) => <span key={s} className={`chip ${JCLR[s]}`}>{s} · {n}</span>)}{o.avg_match !== null && <span className="chip bg-white/10 text-sky-100">avg match {o.avg_match}%</span>}</div>}
    {o.recent.length ? <div className="space-y-1.5">{o.recent.map((j: any) => (<a key={j.id} href={j.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm hover:bg-white/5">
      <span className="min-w-0"><span className="block truncate">{j.title}</span><span className="block truncate text-[11px] text-sky-100/60">{[j.company, j.location].filter(Boolean).join(' · ') || 'Saved ' + ago(j.saved_at)}</span></span>
      <span className="flex shrink-0 items-center gap-1">{j.match !== null && <span className="text-[11px] text-sky-300">{j.match}%</span>}<span className={`chip ${JCLR[j.status] || JCLR.saved}`}>{j.status}</span></span></a>))}</div>
      : <Empty text="You haven't saved any jobs yet." to="/opportunities" cta="Browse opportunities" />}
    {o.top_gaps.length > 0 && <div className="mt-3 text-xs text-sky-100/80"><div className="mb-1 font-semibold">Skills your saved jobs ask for</div><div className="flex flex-wrap gap-1">{o.top_gaps.map((g: any) => <span key={g.name} className="chip bg-pink-500/20 text-pink-200">{g.name} · {g.jobs} job{g.jobs === 1 ? '' : 's'}</span>)}</div></div>}
  </div>);
}

function CommunityCard({ c }: { c: any }) {
  const m = c.mine, k = c.community;
  return (<div className="card" data-testid="dash-community"><Head icon={Users} title="Community" to="/community" cta="Open community" />
    <div className="mb-3 grid grid-cols-4 gap-2"><Mini v={m.posts} label="Posts" /><Mini v={m.comments} label="Comments" /><Mini v={m.likes_received} label="Likes" /><Mini v={m.solved_questions} label="Solved" /></div>
    {m.pending_requests > 0 && <Link to="/community" className="mb-2 flex items-center gap-2 rounded-lg bg-amber-400/15 px-3 py-1.5 text-xs text-amber-200"><UserPlus className="h-3 w-3" />{m.pending_requests} pending join request{m.pending_requests === 1 ? '' : 's'} on your collaboration posts</Link>}
    <p className="mb-2 text-[11px] text-sky-100/70"><HelpCircle className="mr-1 inline h-3 w-3" />{k.open_questions} open question{k.open_questions === 1 ? '' : 's'} ({k.unanswered} unanswered) · {k.open_collabs} team{k.open_collabs === 1 ? '' : 's'} recruiting · {k.members} active member{k.members === 1 ? '' : 's'}</p>
    {c.latest.length ? <div className="space-y-1.5">{c.latest.map((p: any) => (<Link key={p.id} to="/community" className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm hover:bg-white/5">
      <span className="min-w-0"><span className="block truncate">{p.text}</span><span className="block truncate text-[11px] text-sky-100/60">{p.is_mine ? 'You' : p.author} · {p.kind} · {ago(p.created_at)}</span></span>
      <span className="flex shrink-0 items-center gap-2 text-[11px] text-sky-100/70"><span><MessageSquare className="mr-0.5 inline h-3 w-3" />{p.comments}</span><span><Heart className="mr-0.5 inline h-3 w-3" />{p.likes}</span></span></Link>))}</div>
      : <Empty text="No posts yet. Start the first conversation." to="/community" cta="Write a post" />}
  </div>);
}

const ICON: Record<string, any> = { assignment: ClipboardList, goal: Target, career: Compass, note: StickyNote, link: Link2, file: FileText };
function BoardBody({ b }: { b: any }) {
  const D = b.data;
  if (b.key === 'deadlines') return D.items.length ? (<div className="space-y-1.5">{D.items.map((i: any) => { const I = ICON[i.type]; return (<Link key={i.type + i.id} to={i.link} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm hover:bg-white/5">
    <span className="flex min-w-0 items-center gap-2"><I className="h-4 w-4 shrink-0 text-sky-300" /><span className="min-w-0"><span className="block truncate">{i.title}</span><span className="block truncate text-[11px] text-sky-100/60">{i.type} · {i.meta ? i.meta + ' · ' : ''}{fmtDate(i.date)}</span></span></span>
    <span className={`shrink-0 text-[11px] ${i.days_left < 0 ? 'text-rose-300' : i.days_left <= 2 ? 'text-amber-200' : 'text-sky-100/70'}`}>{daysLabel(i.days_left)}</span></Link>); })}{D.total > D.items.length && <p className="px-2 text-[11px] text-sky-100/60">+ {D.total - D.items.length} more</p>}</div>)
    : <Empty text="No upcoming deadlines." to="/goals" cta="Create a goal" />;
  if (b.key === 'study') return (<div><div className="flex h-24 items-end gap-2">{D.days.map((x: any) => (<div key={x.date} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${x.date}: ${x.minutes} min`}>
    <div className={`w-full rounded-t ${x.minutes ? 'bg-gradient-to-t from-violet-500 to-pink-500' : 'bg-white/10'}`} style={{ height: (x.minutes && D.max_minutes ? Math.max(6, Math.round(x.minutes / D.max_minutes * 80)) : 3) + 'px' }} />
    <span className={`text-[10px] ${x.is_today ? 'font-bold text-sky-300' : 'text-sky-100/60'}`}>{x.label}</span></div>))}</div>
    <p className="mt-2 text-xs text-sky-100/80">{D.total_minutes ? `${fmtMin(D.total_minutes)} over ${D.active_days} day${D.active_days === 1 ? '' : 's'} · avg ${fmtMin(D.avg_minutes)} per active day` : 'No study time recorded in the last 7 days.'}</p></div>);
  if (b.key === 'skills') return (<div className="space-y-3">
    {D.top_skills.length ? <div>{D.top_skills.map((s: any) => <div key={s.id} className="mb-1.5 text-sm"><div className="flex justify-between"><span className="truncate">{s.name}</span><span className="text-sky-300">{s.level}%</span></div><div className="bar"><div style={{ width: s.level + '%' }} /></div></div>)}<p className="text-[11px] text-sky-100/60">{D.skills_total} skill{D.skills_total === 1 ? '' : 's'} in {D.categories} categor{D.categories === 1 ? 'y' : 'ies'}</p></div> : <Empty text="No skills added yet." to="/projects" cta="Add a skill" />}
    <div className="text-xs text-sky-100/80"><div className="mb-1 flex items-center gap-1 font-semibold"><FolderKanban className="h-3 w-3" />Projects in progress</div>{D.open_projects.length ? D.open_projects.map((p: any) => <div key={p.id} className="flex justify-between gap-2 py-0.5"><span className="truncate">{p.title}</span><span className="chip bg-white/10 text-sky-100">{p.status}</span></div>) : <p className="text-sky-100/60">{D.projects_total ? 'All projects completed.' : 'No projects yet.'}</p>}</div></div>);
  if (b.key === 'vault') return (<div>
    <div className="mb-3 grid grid-cols-4 gap-2"><Mini v={D.notes} label="Notes" /><Mini v={D.links} label="Links" /><Mini v={D.files} label="Files" /><Mini v={D.folders} label="Folders" /></div>
    <div className="mb-3 text-xs text-sky-100/80"><div className="flex justify-between"><span><Lock className="mr-1 inline h-3 w-3" />Encrypted storage</span><span>{fmtBytes(D.bytes)} / {fmtBytes(D.quota_bytes)}</span></div><div className="bar mt-1"><div style={{ width: (D.quota_percent || 0) + '%' }} /></div></div>
    {D.recent.length ? D.recent.map((r: any) => { const I = ICON[r.kind]; return <Link key={r.kind + r.id} to="/vault" className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-white/5"><I className="h-4 w-4 shrink-0 text-sky-300" /><span className="truncate">{r.title}</span><span className="ml-auto shrink-0 text-[11px] text-sky-100/60">{ago(r.at)}</span></Link>; }) : <Empty text="Your vault is empty." to="/vault" cta="Add a note, link or file" />}</div>);
  return null;
}

export default function DashboardExtras({ d }: { d: any }) {
  const [boards, setBoards] = useState<any[]>(d.boards || []), [edit, setEdit] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const save = async (next: any[]) => {
    setBusy(true); setErr('');
    try { const r = await api('/dashboard/boards', 'PUT', { boards: next.map(b => ({ key: b.key, visible: b.visible })) }); setBoards(r.boards); }
    catch (e: any) { setErr(e.message || 'Could not save'); }
    finally { setBusy(false); }
  };
  const toggle = (key: string) => save(boards.map(b => (b.key === key ? { ...b, visible: !b.visible } : b)));
  const move = (i: number, dir: number) => { const n = [...boards]; const j = i + dir; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; save(n); };
  const shown = boards.filter(b => b.visible && b.data);
  return (
    <>
      <section aria-label="Statistics"><h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-sky-200"><BarChart3 className="h-4 w-4" />Your Statistics <span className="text-[11px] font-normal text-sky-100/50">· live from your data</span></h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{d.statistics.tiles.map((t: any) => <StatTile key={t.key} t={t} />)}</div></section>
      <div className="grid gap-4 lg:grid-cols-2"><OpportunitiesCard o={d.opportunities} /><CommunityCard c={d.community} /></div>
      <section aria-label="Data Boards"><div className="mb-2 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-bold text-sky-200"><LayoutGrid className="h-4 w-4" />Data Boards</h2>
        <button type="button" className="btn-ghost !px-3 !py-1 text-xs" aria-expanded={edit} onClick={() => setEdit(!edit)}><Settings2 className="h-3 w-3" />{edit ? 'Done' : 'Customize'}</button></div>
        {edit && <div className="card mb-3 !p-3" role="group" aria-label="Choose boards">{err && <div className="mb-2 text-xs text-rose-300" role="alert">{err}</div>}
          {boards.map((b, i) => (<div key={b.key} className="flex items-center justify-between gap-2 py-1 text-sm"><span className={b.visible ? '' : 'text-sky-100/50'}>{b.title}</span>
            <span className="flex items-center gap-1"><button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} className="btn-ghost !p-1.5" aria-label={`Move ${b.title} up`}><ArrowUp className="h-3 w-3" /></button>
              <button type="button" disabled={busy || i === boards.length - 1} onClick={() => move(i, 1)} className="btn-ghost !p-1.5" aria-label={`Move ${b.title} down`}><ArrowDown className="h-3 w-3" /></button>
              <button type="button" disabled={busy} onClick={() => toggle(b.key)} className="btn-ghost !p-1.5" aria-pressed={b.visible} aria-label={`${b.visible ? 'Hide' : 'Show'} ${b.title}`}>{b.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}</button></span></div>))}</div>}
        {shown.length ? <div className="grid gap-4 lg:grid-cols-2">{shown.map(b => <div key={b.key} className="card" data-testid={'board-' + b.key}><Head icon={LayoutGrid} title={b.title} to={b.link} />{<BoardBody b={b} />}</div>)}</div>
          : <div className="card text-center text-sm text-sky-100/70">All boards are hidden. Use Customize to show them again.</div>}</section>
    </>
  );
}
