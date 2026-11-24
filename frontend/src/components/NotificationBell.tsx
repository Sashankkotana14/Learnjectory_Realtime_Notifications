// (Also lists community likes/comments on your posts from /community/notifications, via notifyExtras.ts.)
// (Also lists goal deadlines from /goals and unfinished daily habits from /habits, via notifyExtras.ts.)
// Header notifications: bell button, unread count badge and notification panel.
// Used only by Layout.tsx. It reads existing endpoints (/settings/profile, /assignments, /study_sessions, /study-plans,
// /planner/reminders/due, /achievements) and stores the resulting notifications + "read" / "cleared" state permanently in the database (/api/notifications),
// so they survive refresh and logout. localStorage is only a fallback copy used when the server cannot be reached.
// Real time: a Server-Sent-Events connection (notifyLive.ts -> /api/notifications/stream) refreshes the bell the moment the server reports a change; the 60s poll stays as a safety net.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Bell, BellOff, CalendarClock, Check, CheckCheck, ClipboardList, Flame, Heart, History, MessageCircle, Target, Trophy, X } from 'lucide-react';
import { api, getToken } from '../api';
import { todayStr } from '../dates';
import { itemsSignature, saveCleared, saveRead, syncNotifications } from '../notifyStore';
import { connectLive } from '../notifyLive';
import { communityNotifications, dailyHabitNotifications, goalDeadlineNotifications } from '../notifyExtras';

export type Notif = { id: string; kind: 'overdue' | 'due' | 'session' | 'reminder' | 'achievement' | 'goal-overdue' | 'goal-due' | 'habit' | 'community-like' | 'community-comment'; title: string; body: string; to: string; at: number; tag?: string };

const pad = (n: number) => String(n).padStart(2, '0');
const dayMs = (s: string) => Date.parse(s + 'T00:00:00');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

// Pure: turns raw API rows into a newest-first / most-urgent-first notification list. Ids are stable, so read state survives refreshes.
export function buildNotifications(a: { assignments?: any[]; sessions?: any[]; plans?: any[]; reminders?: any[]; achievements?: any[]; goals?: any[]; habits?: any[]; community?: any[]; today: string; now?: number }): Notif[] {
  const now = a.now ?? Date.now(), out: Notif[] = [];
  for (const x of a.assignments || []) {
    if (!x || x.status === 'done' || typeof x.days_left !== 'number') continue;
    const n = x.days_left, name = x.title || 'Assignment';
    if (n < 0) out.push({ id: `as:${x.id}:overdue`, kind: 'overdue', title: `${name} is overdue`, body: `Was due ${plural(-n, 'day')} ago${x.subject ? ' · ' + x.subject : ''}`, to: '/assignments', at: dayMs(x.due_date) });
    else if (n <= 2) out.push({ id: `as:${x.id}:${x.due_date}`, kind: 'due', title: n === 0 ? `${name} is due today` : n === 1 ? `${name} is due tomorrow` : `${name} is due in 2 days`, body: x.subject || 'Assignment', to: '/assignments', at: dayMs(a.today), tag: n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : 'In 2 days' });
  }
  // Study sessions: sessions have a date but no clock time, so they notify on the day itself and the day before. Finished sessions never notify.
  const tomorrow = new Date(dayMs(a.today) + 864e5), tmr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
  const sessDay = (d: any) => (d === a.today ? 0 : d === tmr ? 1 : -1);
  const sessAt = (n: number) => dayMs(a.today) + (n === 0 ? 1000 : 0); // today's sessions list above tomorrow's
  for (const x of a.sessions || []) {
    if (!x || x.completed || typeof x.session_date !== 'string') continue;
    const n = sessDay(x.session_date); if (n < 0) continue;
    const name = x.title || 'Study session', mins = Number(x.duration) > 0 ? `${Number(x.duration)} min` : 'Study session';
    out.push({ id: `ss:${x.id}:${x.session_date}`, kind: 'session', title: `${name} ${n === 0 ? 'is scheduled today' : 'is scheduled tomorrow'}`, body: mins, to: '/planner', at: sessAt(n), tag: n === 0 ? 'Today' : 'Tomorrow' });
  }
  for (const p of a.plans || []) {
    if (!p || typeof p.plan_date !== 'string') continue;
    const n = sessDay(p.plan_date), items = (p.items || []).filter((i: any) => i && i.status !== 'done');
    if (n < 0 || !items.length) continue;
    const running = items.find((i: any) => i.status === 'active'), left = items.reduce((t: number, i: any) => t + (Number(i.allocated_minutes) || 0), 0);
    if (running && n === 0) out.push({ id: `sp:${p.id}:${p.plan_date}:active`, kind: 'session', title: `Session in progress: ${running.subject_name}`, body: `${p.title || 'Study plan'} · ${plural(items.length, 'session')} left`, to: '/planner', at: sessAt(0) + 1000, tag: 'Now' });
    else out.push({ id: `sp:${p.id}:${p.plan_date}`, kind: 'session', title: `${p.title || 'Study plan'}: ${plural(items.length, 'session')} ${n === 0 ? 'today' : 'tomorrow'}`, body: `${left} min planned`, to: '/planner', at: sessAt(n), tag: n === 0 ? 'Today' : 'Tomorrow' });
  }
  for (const r of a.reminders || []) out.push({ id: `rem:${r.id}:${a.today}`, kind: 'reminder', title: `Habit reminder: ${r.habit_name}`, body: `Scheduled for ${r.remind_time}`, to: '/growth', at: dayMs(a.today) + (parseInt(String(r.remind_time).slice(0, 2), 10) || 0) * 36e5 });
  for (const h of a.achievements || []) {
    const t = Date.parse(String(h.unlocked_at || '').includes('T') ? h.unlocked_at : String(h.unlocked_at || '').replace(' ', 'T') + 'Z');
    if (!isNaN(t) && now - t < 7 * 864e5 && now - t > -864e5) out.push({ id: `ach:${h.key}`, kind: 'achievement', title: `Achievement unlocked: ${h.title}`, body: h.category || 'Achievements', to: '/achievements', at: t });
  }
  out.push(...goalDeadlineNotifications(a.goals, a.today), ...dailyHabitNotifications(a.habits, a.today), ...communityNotifications(a.community));
  const rank = { overdue: 0, 'goal-overdue': 0, due: 1, 'goal-due': 1, session: 2, habit: 3, reminder: 3, achievement: 4, 'community-comment': 4, 'community-like': 4 } as const;
  return out.sort((p, q) => rank[p.kind] - rank[q.kind] || q.at - p.at);
}

const KEY = (uid: any) => `lj_notif_state:${uid ?? 'anon'}`;
type Saved = { read: string[]; cleared: string[] };
const load = (uid: any): Saved => { try { const v = JSON.parse(localStorage.getItem(KEY(uid)) || '{}'); return { read: Array.isArray(v.read) ? v.read : [], cleared: Array.isArray(v.cleared) ? v.cleared : [] }; } catch { return { read: [], cleared: [] }; } };
const save = (uid: any, s: Saved) => { try { localStorage.setItem(KEY(uid), JSON.stringify({ read: s.read.slice(-300), cleared: s.cleared.slice(-300) })); } catch { /* storage unavailable: state is kept for this session only */ } };

const ICON = { overdue: ClipboardList, due: ClipboardList, session: BookOpen, reminder: CalendarClock, achievement: Trophy, 'goal-overdue': Target, 'goal-due': Target, habit: Flame, 'community-like': Heart, 'community-comment': MessageCircle } as const;
const TONE = { overdue: 'text-rose-300 bg-rose-500/15', due: 'text-amber-300 bg-amber-500/15', session: 'text-emerald-300 bg-emerald-500/15', reminder: 'text-sky-300 bg-violet-500/20', achievement: 'text-pink-300 bg-pink-500/15', 'goal-overdue': 'text-rose-300 bg-rose-500/15', 'goal-due': 'text-amber-300 bg-amber-500/15', habit: 'text-orange-300 bg-orange-500/15', 'community-like': 'text-rose-300 bg-rose-500/15', 'community-comment': 'text-sky-300 bg-sky-500/15' } as const;
const when = (n: Notif) => (n.kind === 'achievement' || n.kind === 'community-like' || n.kind === 'community-comment' ? (() => { const m = Math.floor((Date.now() - n.at) / 6e4); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`; })() : n.kind === 'overdue' || n.kind === 'goal-overdue' ? 'Overdue' : n.kind === 'reminder' ? 'Today' : n.tag || 'Soon');

export default function NotificationBell() {
  const [open, setOpen] = useState(false), [items, setItems] = useState<Notif[]>([]), [uid, setUid] = useState<any>(null), [enabled, setEnabled] = useState(true);
  const [state, setState] = useState<Saved>({ read: [], cleared: [] }), [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [live, setLive] = useState(false), [ring, setRing] = useState(false), [announce, setAnnounce] = useState('');
  const seen = useRef<Set<string> | null>(null), ringT = useRef<any>(null), liveT = useRef<any>(null);
  const synced = useRef<string>(''), wrap = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null), alive = useRef(true), seq = useRef(0), uidRef = useRef<any>(null);
  const nav = useNavigate(), loc = useLocation();

  const refresh = useCallback(async () => {
    const my = ++seq.current, today = todayStr(), n = new Date(), time = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
    const ok = <T,>(p: Promise<T>) => p.then(v => v, () => null); // one failing source must not hide the others
    const [p, as, ses, pl, rem, ach, gl, hb, cm] = await Promise.all([ok(api('/settings/profile')), ok(api('/assignments')), ok(api('/study_sessions')), ok(api('/study-plans')), ok(api(`/planner/reminders/due?date=${today}&time=${time}`)), ok(api('/achievements')), ok(api('/goals')), ok(api('/habits')), ok(api('/community/notifications'))]);
    if (!alive.current || my !== seq.current) return;
    if (!p && !as && !ses && !pl && !rem && !ach && !gl && !hb && !cm) { setStatus('error'); return; }
    if (p) { if (uidRef.current !== p.id) { uidRef.current = p.id; setUid(p.id); setState(load(p.id)); } setEnabled(p.notifications !== 0 && p.notifications !== false); }
    const built = buildNotifications({ assignments: as?.assignments, sessions: Array.isArray(ses) ? ses : undefined, plans: pl?.plans, reminders: rem?.due, achievements: ach?.history, goals: gl?.goals, habits: hb?.habits, community: cm?.notifications, today });
    // Permanent storage: save the notifications and load the saved read / cleared state from the database (first run also imports this browser's old state).
    if (p) {
      const sig = uidRef.current + '\n' + itemsSignature(built), impKey = `lj_notif_imported:${p.id}`;
      let imported = false; try { imported = localStorage.getItem(impKey) === '1'; } catch { /* ignore */ }
      if (sig !== synced.current || !imported) {
        try {
          const st = await syncNotifications(built, imported ? undefined : load(p.id));
          if (!alive.current || my !== seq.current) return;
          synced.current = sig; try { localStorage.setItem(impKey, '1'); } catch { /* ignore */ }
          setState(st); save(p.id, st);
        } catch { /* database unreachable: keep showing the browser copy of the state */ }
      }
    }
    setItems(built);
    setStatus('ready');
  }, []);

  useEffect(() => { alive.current = true; refresh(); const t = setInterval(refresh, 60000); const vis = () => { if (!document.hidden) refresh(); }; document.addEventListener('visibilitychange', vis); return () => { alive.current = false; clearInterval(t); document.removeEventListener('visibilitychange', vis); }; }, [refresh]);
  useEffect(() => { const h = () => refresh(); window.addEventListener('lj:success', h); return () => window.removeEventListener('lj:success', h); }, [refresh]); // a goal/habit change updates the bell straight away
  useEffect(() => { const h = () => refresh(); window.addEventListener('lj:achievement', h); return () => window.removeEventListener('lj:achievement', h); }, [refresh]); // a new unlock shows in the bell straight away
  useEffect(() => { // real time: any `refresh` event from the server reloads the bell at once (bursts are merged into one reload)
    const stop = connectLive({ getToken, onStatus: setLive, onOpen: () => refresh(), onEvent: e => { if (e.event === 'refresh') { clearTimeout(liveT.current); liveT.current = setTimeout(() => refresh(), 150); } } });
    return () => { stop(); clearTimeout(liveT.current); clearTimeout(ringT.current); };
  }, [refresh]);
  useEffect(() => { refresh(); }, [loc.pathname, refresh]); // changes made on any page show up right after navigating
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => { if (open) refresh(); }, [open, refresh]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent | TouchEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', down); document.addEventListener('touchstart', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('touchstart', down); document.removeEventListener('keydown', key); };
  }, [open]);

  const visible = useMemo(() => (enabled ? items.filter(i => !state.cleared.includes(i.id)) : []), [items, state, enabled]);
  const unread = visible.filter(i => !state.read.includes(i.id)).length;
  useEffect(() => { // a notification that was not there before: ring the bell briefly and announce it (the first load only records what already exists)
    if (status !== 'ready') return; const fresh = visible.filter(i => !state.read.includes(i.id)), ids = new Set(fresh.map(i => i.id));
    if (seen.current === null) { seen.current = ids; return; }
    const added = fresh.filter(i => !seen.current!.has(i.id)); seen.current = new Set([...seen.current, ...ids]);
    if (!added.length) return;
    setAnnounce(added.length === 1 ? `New notification: ${added[0].title}` : `${added.length} new notifications`); setRing(true); clearTimeout(ringT.current); ringT.current = setTimeout(() => setRing(false), 2500);
  }, [visible, state, status]);
  const update = (fn: (s: Saved) => Saved, persist?: () => Promise<unknown>) => { setState(s => { const n = fn(s); save(uid, n); return n; }); persist?.().catch(() => { /* kept in this browser; the next sync retries */ synced.current = ''; try { localStorage.removeItem(`lj_notif_imported:${uid}`); } catch { /* ignore */ } }); };
  const markRead = (ids: string[]) => { if (ids.length) update(s => ({ ...s, read: [...new Set([...s.read, ...ids])] }), () => saveRead(ids)); };
  const clearOne = (id: string) => update(s => ({ read: [...new Set([...s.read, id])], cleared: [...new Set([...s.cleared, id])] }), () => saveCleared([id]));
  const open1 = (i: Notif) => { markRead([i.id]); setOpen(false); nav(i.to); };

  const label = !enabled ? 'Notifications (off)' : unread ? `Notifications, ${plural(unread, 'unread notification')}` : 'Notifications, none unread';
  return (
    <div className="relative" ref={wrap}>
      <button ref={btn} type="button" onClick={() => setOpen(o => !o)} aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls="notif-panel"
        className={`relative grid h-9 w-9 place-items-center rounded-full text-sky-200 transition hover:bg-white/10 ${open ? 'bg-white/10' : ''}`}>
        {enabled ? <Bell className={`h-5 w-5 ${ring ? 'animate-bounce motion-reduce:animate-none' : ''}`} /> : <BellOff className="h-5 w-5 opacity-70" />}
        {unread > 0 && <span aria-hidden className={`absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-gradient-to-br from-pink-500 to-rose-500 px-1 text-[10px] font-extrabold leading-none text-white shadow-[0_0_10px_rgba(236,72,153,.65)] ring-2 ring-[#18112A] ${ring ? 'animate-pulse motion-reduce:animate-none' : ''}`}>{unread > 9 ? '9+' : unread}</span>}
      </button>
      <span className="sr-only" role="status" aria-live="polite">{announce || (unread > 0 ? plural(unread, 'unread notification') : '')}</span>
      {open && (
        <div id="notif-panel" role="dialog" aria-label="Notifications"
          className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-2xl border border-[rgba(167,139,250,.3)] bg-[#1d1430] shadow-[0_18px_60px_rgba(0,0,0,.55),0_0_32px_rgba(139,92,246,.25)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[380px]">
          <div className="flex items-center gap-2 border-b border-[rgba(167,139,250,.18)] px-4 py-3">
            <div className="text-sm font-extrabold">Notifications</div>
            {unread > 0 && <span className="chip bg-pink-500/20 text-pink-200">{unread} new</span>}
            <span title={live ? 'Live updates on' : 'Live updates reconnecting…'} aria-label={live ? 'Live updates on' : 'Live updates reconnecting'} className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,.8)]' : 'bg-slate-500'}`} />
            <button type="button" disabled={!unread} onClick={() => markRead(visible.map(i => i.id))} className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-violet-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"><CheckCheck className="h-3.5 w-3.5" />Mark all read</button>
            <button type="button" onClick={() => { setOpen(false); btn.current?.focus(); }} aria-label="Close notifications" className="grid h-7 w-7 place-items-center rounded-full text-sky-200 hover:bg-white/10 sm:hidden"><X className="h-4 w-4" /></button>
          </div>
          <div className="max-h-[min(70vh,440px)] overflow-y-auto">
            {!enabled ? <Empty Icon={BellOff} title="Notifications are off" text="Turn them on in Settings to see reminders and updates here." action={{ label: 'Open Settings', go: () => { setOpen(false); nav('/settings'); } }} />
              : status === 'loading' ? <div className="space-y-3 p-4" aria-busy="true">{[0, 1, 2].map(k => <div key={k} className="flex gap-3"><div className="h-9 w-9 animate-pulse rounded-xl bg-white/10" /><div className="flex-1 space-y-2"><div className="h-3 w-3/4 animate-pulse rounded bg-white/10" /><div className="h-3 w-1/2 animate-pulse rounded bg-white/5" /></div></div>)}</div>
              : status === 'error' && !items.length ? <Empty Icon={Bell} title="Couldn’t load notifications" text="Check your connection and try again." action={{ label: 'Try again', go: refresh }} />
              : !visible.length ? <Empty Icon={Check} title="You’re all caught up" text="New deadlines, reminders, achievements and community likes and comments will show up here." />
              : <ul>{visible.map(i => { const Icon = ICON[i.kind], isNew = !state.read.includes(i.id); return (
                <li key={i.id} className={`group relative flex items-start gap-3 border-b border-[rgba(167,139,250,.1)] px-4 py-3 last:border-0 ${isNew ? 'bg-violet-500/[.08]' : ''}`}>
                  <button type="button" onClick={() => open1(i)} className="flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONE[i.kind]}`}><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><span className={`block truncate text-sm ${isNew ? 'font-bold' : 'font-semibold text-sky-100/80'}`}>{i.title}</span><span className="block truncate text-xs text-sky-100/60">{i.body}</span><span className="mt-0.5 block text-[11px] text-sky-200/50">{when(i)}</span></span>
                    {isNew && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-pink-400" aria-label="Unread" />}
                  </button>
                  <button type="button" onClick={() => clearOne(i.id)} aria-label={`Dismiss: ${i.title}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sky-200/60 transition hover:bg-white/10 hover:text-white focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
                </li>); })}</ul>}
          </div>
          <div className="border-t border-[rgba(167,139,250,.18)] px-4 py-2.5 text-center"><button type="button" onClick={() => { setOpen(false); nav('/notifications'); }} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-violet-200 transition hover:bg-white/10"><History className="h-3.5 w-3.5" />View notification history</button></div>
        </div>
      )}
    </div>
  );
}

function Empty({ Icon, title, text, action }: { Icon: any; title: string; text: string; action?: { label: string; go: () => void } }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-violet-500/15 text-violet-200"><Icon className="h-5 w-5" /></span>
      <div className="text-sm font-bold">{title}</div><div className="mt-1 text-xs text-sky-100/60">{text}</div>
      {action && <button type="button" onClick={action.go} className="btn-ghost mt-4 !py-1.5 text-xs">{action.label}</button>}
    </div>
  );
}
