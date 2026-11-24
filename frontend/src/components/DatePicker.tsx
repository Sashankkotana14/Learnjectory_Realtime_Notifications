import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { MONTHS, fmtDate, todayStr } from '../dates';

// Visual month-grid date picker. Days before `min` are disabled (cannot be clicked).
export default function DatePicker({ value, onChange, min, placeholder = 'Pick a date', clearable = true }: { value: string; onChange: (v: string) => void; min?: string; placeholder?: string; clearable?: boolean }) {
  const [open, setOpen] = useState(false), ref = useRef<HTMLDivElement>(null), btnRef = useRef<HTMLButtonElement>(null), popRef = useRef<HTMLDivElement>(null);
  const base = value || min || todayStr();
  const [view, setView] = useState({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 });
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // The popup is rendered in a portal on <body> with fixed positioning. Cards use backdrop-filter, which creates a
  // stacking context per card and clips/overlaps any z-indexed child, so the popup must live outside the cards.
  const place = useCallback(() => {
    const b = btnRef.current; if (!b) return;
    const r = b.getBoundingClientRect(), pop = popRef.current, W = 256, H = pop ? pop.offsetHeight : 320, gap = 8, vw = window.innerWidth, vh = window.innerHeight;
    const left = Math.max(8, Math.min(r.left, vw - W - 8));
    const below = vh - r.bottom - gap, above = r.top - gap;
    const top = below >= H || below >= above ? Math.max(8, Math.min(r.bottom + gap, vh - H - 8)) : Math.max(8, r.top - gap - H);
    setPos({ top, left });
  }, []);
  useLayoutEffect(() => { if (!open) { setPos(null); return; } place(); }, [open, view.m, view.y, place]);
  useEffect(() => {
    if (!open) return;
    const on = () => place(), esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('resize', on); window.addEventListener('scroll', on, true); document.addEventListener('keydown', esc);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('scroll', on, true); document.removeEventListener('keydown', esc); };
  }, [open, place]);
  useEffect(() => { const h = (e: MouseEvent) => { const n = e.target as Node; if (ref.current && !ref.current.contains(n) && !(popRef.current && popRef.current.contains(n))) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const first = (new Date(Date.UTC(view.y, view.m, 1)).getUTCDay() + 6) % 7, days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const iso = (d: number) => `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const go = (n: number) => { const t = view.m + n; setView({ y: view.y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 }); };
  const t = todayStr();
  const prevDisabled = !!min && `${view.y}-${String(view.m + 1).padStart(2, '0')}` <= min.slice(0, 7);
  return (
    <div className="relative" ref={ref}>
      <button type="button" ref={btnRef} aria-haspopup="dialog" aria-expanded={open} className="inp flex items-center justify-between text-left" onClick={() => { if (!open) { const b = value || min || todayStr(); setView({ y: Number(b.slice(0, 4)), m: Number(b.slice(5, 7)) - 1 }); } setOpen(!open); }}>
        <span className={value ? '' : 'text-sky-100/50'}>{value ? fmtDate(value) : placeholder}</span><CalendarDays className="h-4 w-4 text-sky-300" />
      </button>
      {open && createPortal(
        <div ref={popRef} role="dialog" aria-label="Choose date" style={{ position: 'fixed', top: pos ? pos.top : 0, left: pos ? pos.left : 0, zIndex: 9999, visibility: pos ? 'visible' : 'hidden' }} className="w-64 rounded-2xl border border-indigo-400/40 bg-[#211632] p-3 shadow-[0_0_28px_rgba(139,92,246,.45)]">
          <div className="mb-2 flex items-center justify-between text-sm font-bold">
            <button type="button" aria-label="Previous month" disabled={prevDisabled} onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/10 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            {MONTHS[view.m]} {view.y}
            <button type="button" aria-label="Next month" onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/10"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-sky-300">{['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => <div key={d}>{d}</div>)}</div>
          <div className="mt-1 grid grid-cols-7 gap-1 text-center text-xs">
            {cells.map((d, i) => { if (!d) return <div key={i} />; const s = iso(d), off = !!min && s < min, sel = s === value;
              return <button key={i} type="button" disabled={off} onClick={() => { onChange(s); setOpen(false); }}
                className={`h-8 rounded-lg ${sel ? 'bg-gradient-to-br from-sky-400 to-indigo-500 font-bold' : off ? 'cursor-not-allowed text-white/25 line-through' : 'hover:bg-white/10'} ${s === t && !sel ? 'ring-1 ring-sky-400' : ''}`}>{d}</button>; })}
          </div>
          <div className="mt-2 flex justify-between text-xs">
            <button type="button" className="text-sky-300 disabled:opacity-30" disabled={!!min && t < min} onClick={() => { onChange(t); setOpen(false); }}>Today</button>
            {clearable && value && <button type="button" className="flex items-center gap-1 text-sky-100/70" onClick={() => { onChange(''); setOpen(false); }}><X className="h-3 w-3" />Clear</button>}
          </div>
        </div>, document.body)}
    </div>
  );
}
