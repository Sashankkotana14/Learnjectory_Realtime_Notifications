// Success toasts: small confirmations ("Goal completed", "Habit completed") shown bottom-right. Mounted once in Layout.tsx.
// Fed by the 'lj:success' window event that api.ts fires after a successful goal/habit call. Respects Settings > Enable notifications.
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { api } from '../api';

type Toast = { id: number; text: string };

export default function SuccessToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]), seq = useRef(0), enabled = useRef(true), timers = useRef<Record<number, any>>({});
  const drop = (id: number) => { clearTimeout(timers.current[id]); delete timers.current[id]; setToasts(t => t.filter(x => x.id !== id)); };

  useEffect(() => {
    let alive = true;
    const refreshPref = () => api('/settings/profile').then(p => { if (alive) enabled.current = p.notifications !== 0 && p.notifications !== false; }, () => {});
    refreshPref();
    const onSuccess = (e: Event) => {
      const text = (e as CustomEvent<string>).detail; if (!text) return;
      refreshPref(); // keeps the on/off switch current without waiting for a reload
      if (!enabled.current) return;
      const id = ++seq.current;
      setToasts(t => [...t.filter(x => x.text !== text), { id, text }].slice(-3));
      timers.current[id] = setTimeout(() => drop(id), 4000);
    };
    window.addEventListener('lj:success', onSuccess);
    return () => { alive = false; window.removeEventListener('lj:success', onSuccess); Object.values(timers.current).forEach(clearTimeout); };
  }, []);

  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-emerald-400/30 bg-[#1d1430] px-4 py-3 text-sm shadow-[0_12px_40px_rgba(0,0,0,.5),0_0_24px_rgba(52,211,153,.18)]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          <span className="min-w-0 flex-1 font-semibold">{t.text}</span>
          <button type="button" onClick={() => drop(t.id)} aria-label="Dismiss" className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-sky-200/60 hover:bg-white/10 hover:text-white"><X className="h-3.5 w-3.5" /></button>
        </div>))}
    </div>
  );
}
