// Notification History: read-only list of every notification previously received (read, unread and dismissed), loaded from the existing
// notifications table via GET /api/notifications. Uses fetch directly (like notifyStore.ts) so viewing history never fires toasts or 'lj:write' events.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Bell, CalendarClock, ClipboardList, Flame, Heart, History, MessageCircle, Search, Target, Trophy } from 'lucide-react';
import { getToken } from '../api';
import { FILTERS, filterHistory, groupByDay, receivedMs, statusOf, timeLabel, type HistoryRow } from '../notificationHistory';

const ICON: Record<string, any> = { overdue: ClipboardList, due: ClipboardList, session: BookOpen, reminder: CalendarClock, achievement: Trophy, 'goal-overdue': Target, 'goal-due': Target, habit: Flame, 'community-like': Heart, 'community-comment': MessageCircle };
const TONE: Record<string, string> = { overdue: 'text-rose-300 bg-rose-500/15', due: 'text-amber-300 bg-amber-500/15', session: 'text-emerald-300 bg-emerald-500/15', reminder: 'text-sky-300 bg-violet-500/20', achievement: 'text-pink-300 bg-pink-500/15', 'goal-overdue': 'text-rose-300 bg-rose-500/15', 'goal-due': 'text-amber-300 bg-amber-500/15', habit: 'text-orange-300 bg-orange-500/15', 'community-like': 'text-rose-300 bg-rose-500/15', 'community-comment': 'text-sky-300 bg-sky-500/15' };
const STATUS_TONE: Record<string, string> = { Unread: 'bg-pink-500/20 text-pink-200', Read: 'bg-white/10 text-sky-100/70', Dismissed: 'bg-white/5 text-sky-100/50' };
const STATUSES: [string, string][] = [['', 'Any status'], ['unread', 'Unread'], ['read', 'Read'], ['dismissed', 'Dismissed']];

async function loadHistory(): Promise<HistoryRow[]> {
  const r = await fetch('/api/notifications', { headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {} });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && getToken() && d.error === 'Unauthorized') { localStorage.removeItem('token'); location.href = '/login'; }
  if (!r.ok) throw new Error(d.error || 'Could not load notification history');
  return Array.isArray(d.notifications) ? d.notifications : [];
}

export default function NotificationHistory() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null), [err, setErr] = useState(''), [group, setGroup] = useState(''), [status, setStatus] = useState(''), [q, setQ] = useState('');
  const nav = useNavigate();
  const load = () => { setErr(''); loadHistory().then(setRows).catch(e => { setErr(e.message); setRows(r => r); }); };
  useEffect(() => { load(); }, []);
  const shown = useMemo(() => filterHistory(rows || [], { group, status, q }), [rows, group, status, q]);
  const days = useMemo(() => groupByDay(shown), [shown]);
  const filtered = !!(group || status || q.trim());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold"><History className="h-6 w-6 text-sky-300" />Notification History</h1>
        {rows && <span className="chip bg-white/10">{rows.length} total</span>}
      </div>
      <p className="text-sm text-sky-100/60">Every notification you’ve received, including ones you’ve read or dismissed.</p>

      <div className="card space-y-3">
        <div className="relative max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-sky-300" /><input className="inp rounded-full pl-9" placeholder="Search notifications…" aria-label="Search notification history" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="flex flex-wrap gap-2">{FILTERS.map(([k, l]) => <button key={k} type="button" onClick={() => setGroup(k)} aria-pressed={group === k} className={`chip !px-4 !py-1.5 ${group === k ? 'bg-sky-500/40 ring-1 ring-sky-300' : 'bg-white/5'}`}>{l}</button>)}
          <span className="mx-1 w-px bg-white/20" />{STATUSES.map(([k, l]) => <button key={k} type="button" onClick={() => setStatus(k)} aria-pressed={status === k} className={`chip !px-4 !py-1.5 ${status === k ? 'bg-sky-500/40 ring-1 ring-sky-300' : 'bg-white/5'}`}>{l}</button>)}</div>
      </div>

      {err && !rows ? <div className="card text-center"><p className="text-sm text-rose-300">{err}</p><button type="button" onClick={load} className="btn-ghost mt-3 text-xs">Try again</button></div>
        : !rows ? <div className="card space-y-3" aria-busy="true">{[0, 1, 2, 3].map(k => <div key={k} className="flex gap-3"><div className="h-9 w-9 animate-pulse rounded-xl bg-white/10" /><div className="flex-1 space-y-2"><div className="h-3 w-3/4 animate-pulse rounded bg-white/10" /><div className="h-3 w-1/2 animate-pulse rounded bg-white/5" /></div></div>)}</div>
        : !shown.length ? <div className="card flex flex-col items-center py-10 text-center"><span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-violet-500/15 text-violet-200"><Bell className="h-5 w-5" /></span>
            <div className="text-sm font-bold">{filtered ? 'No notifications match your filters' : 'No notifications yet'}</div>
            <div className="mt-1 text-xs text-sky-100/60">{filtered ? 'Try a different search or filter.' : 'Deadlines, reminders, achievements and community activity will be kept here once they arrive.'}</div>
            {filtered && <button type="button" onClick={() => { setGroup(''); setStatus(''); setQ(''); }} className="btn-ghost mt-4 !py-1.5 text-xs">Clear filters</button>}</div>
        : days.map(g => (
          <section key={g.key} aria-label={g.label}>
            <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-widest text-sky-200/60">{g.label}</h2>
            <ul className="card !p-0 overflow-hidden">{g.items.map(i => { const Icon = ICON[i.kind] || Bell, st = statusOf(i); return (
              <li key={i.id} className="border-b border-[rgba(167,139,250,.1)] last:border-0">
                <button type="button" onClick={() => i.to && nav(i.to)} disabled={!i.to} className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/[.04] disabled:cursor-default">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONE[i.kind] || 'text-sky-300 bg-white/10'}`}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className={`block text-sm ${st === 'Unread' ? 'font-bold' : 'font-semibold text-sky-100/80'}`}>{i.title}</span><span className="block text-xs text-sky-100/60">{i.body}</span></span>
                  <span className="flex shrink-0 flex-col items-end gap-1"><span className={`chip ${STATUS_TONE[st]}`}>{st}</span><span className="text-[11px] text-sky-200/50">{timeLabel(receivedMs(i))}</span></span>
                </button>
              </li>); })}</ul>
          </section>))}
      {rows && rows.length >= 1000 && <p className="text-center text-xs text-sky-100/50">Showing your most recent 1000 notifications.</p>}
    </div>
  );
}
