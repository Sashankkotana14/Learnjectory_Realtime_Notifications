// Achievement unlock toasts: "Achievement unlocked: <title>" shown when a real achievement unlocks. Mounted once in Layout.tsx.
// After every successful write (api.ts fires 'lj:write') it re-reads GET /achievements and announces unlocks not yet seen on this browser.
// Read-only: never writes to the server. Respects Settings > Enable notifications. The bell entry comes from NotificationBell (already existing).
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, X } from 'lucide-react';
import { api } from '../api';
import { achievementUnlocks, AchToast } from '../notifyExtras';

type Toast = AchToast & { id: number };
const KEY = (uid: any) => `lj_ach_seen:${uid ?? 'anon'}`;
const loadSeen = (uid: any): string[] | null => { try { const v = JSON.parse(localStorage.getItem(KEY(uid)) || 'null'); return Array.isArray(v) ? v : null; } catch { return null; } };
const saveSeen = (uid: any, s: string[]) => { try { localStorage.setItem(KEY(uid), JSON.stringify(s)); } catch { /* storage unavailable: announced for this session only */ } };

export default function AchievementToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]), seq = useRef(0), timers = useRef<Record<number, any>>({}), busy = useRef(false), again = useRef(false), mem = useRef<string[] | null>(null);
  const nav = useNavigate();
  const drop = (id: number) => { clearTimeout(timers.current[id]); delete timers.current[id]; setToasts(t => t.filter(x => x.id !== id)); };

  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (busy.current) { again.current = true; return; }
      busy.current = true;
      try {
        const [p, a] = await Promise.all([api('/settings/profile'), api('/achievements')]);
        if (!alive) return;
        const uid = p?.id, stored = loadSeen(uid), r = achievementUnlocks(a?.achievements, stored ?? (uid === undefined ? mem.current : null));
        saveSeen(uid, r.seen); mem.current = r.seen;
        if (r.fresh.length) {
          window.dispatchEvent(new Event('lj:achievement'));
          if (p.notifications !== 0 && p.notifications !== false) for (const f of r.fresh) {
            const id = ++seq.current;
            setToasts(t => [...t.filter(x => x.key !== f.key), { ...f, id }].slice(-3));
            timers.current[id] = setTimeout(() => drop(id), 6000);
          }
        }
      } catch { /* a failed check must never affect the page */ }
      finally { busy.current = false; if (again.current && alive) { again.current = false; check(); } }
    };
    check(); // baseline: records what is already unlocked without announcing it
    const onWrite = (e: Event) => { if (String((e as CustomEvent<string>).detail || '').startsWith('/auth')) return; check(); }; // login/logout never trigger a check
    window.addEventListener('lj:write', onWrite);
    return () => { alive = false; window.removeEventListener('lj:write', onWrite); Object.values(timers.current).forEach(clearTimeout); };
  }, []);

  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 top-20 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-pink-400/40 bg-[#1d1430] px-4 py-3 text-sm shadow-[0_12px_40px_rgba(0,0,0,.5),0_0_24px_rgba(236,72,153,.25)]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-pink-500/15 text-pink-300"><Trophy className="h-4 w-4" /></span>
          <button type="button" onClick={() => { drop(t.id); nav('/achievements'); }} className="min-w-0 flex-1 text-left">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-pink-300">Achievement unlocked</span>
            <span className="block truncate font-extrabold">{t.title}</span>
            <span className="block text-xs text-sky-100/60">{t.description}</span>
          </button>
          <button type="button" onClick={() => drop(t.id)} aria-label="Dismiss" className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-sky-200/60 hover:bg-white/10 hover:text-white"><X className="h-3.5 w-3.5" /></button>
        </div>))}
    </div>
  );
}
