// Header-only additions: today's date and the signed-in user's profile photo.
// Used by Layout.tsx. Reads existing endpoints only (/settings/profile, /settings/avatar); changes nothing else.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, fetchBlob } from '../api';
import { MONTHS } from '../dates';

// "24 November 2026" from the user's local clock
export const longDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

// First letter of the first and last word of the name ("Priya Sharma" -> "PS", "Priya" -> "P")
export const initialsOf = (name?: string | null) => {
  const w = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '·';
  return ((w[0][0] || '') + (w.length > 1 ? w[w.length - 1][0] || '' : '')).toUpperCase();
};

export function HeaderDate() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      const n = new Date(); // re-check exactly at the next local midnight
      t = setTimeout(tick, new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).getTime() - n.getTime() + 500);
    };
    const n = new Date();
    t = setTimeout(tick, new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).getTime() - n.getTime() + 500);
    const refresh = () => { if (!document.hidden) setNow(new Date()); }; // laptop sleep / returning to the tab
    document.addEventListener('visibilitychange', refresh); window.addEventListener('focus', refresh);
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  return <time dateTime={`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`} className="whitespace-nowrap text-xs font-semibold text-sky-100/80 sm:text-sm">{longDate(now)}</time>;
}

export function HeaderAvatar() {
  const [name, setName] = useState(''), [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null), seq = useRef(0), alive = useRef(true), loc = useLocation();

  const load = useCallback(async () => {
    const my = ++seq.current; // only the latest request may apply its result
    try {
      const p = await api('/settings/profile');
      if (!alive.current || my !== seq.current) return;
      setName(p.name || '');
      let next: string | null = null;
      if (p.has_avatar) { try { next = URL.createObjectURL(await fetchBlob('/settings/avatar')); } catch { next = null; } }
      if (!alive.current || my !== seq.current) { if (next) URL.revokeObjectURL(next); return; }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = next; setUrl(next);
    } catch { /* keep whatever is shown; initials fall back to '·' */ }
  }, []);

  useEffect(() => { alive.current = true; return () => { alive.current = false; if (urlRef.current) URL.revokeObjectURL(urlRef.current); }; }, []);
  useEffect(() => { load(); }, [load, loc.pathname]); // on mount and whenever the user navigates

  // Refresh right after a successful photo change or profile save made anywhere in the app (Settings stays untouched),
  // and when returning to the tab (covers changes made on another tab/device).
  useEffect(() => {
    const orig = window.fetch;
    window.fetch = async function (this: any, ...args: Parameters<typeof fetch>) {
      const res = await orig.apply(this, args);
      try {
        const req = args[0], u = typeof req === 'string' ? req : req instanceof URL ? req.href : req.url;
        const m = (args[1]?.method || (typeof req === 'object' && 'method' in req ? req.method : 'GET')).toUpperCase();
        if (res.ok && m !== 'GET' && /\/api\/settings\/(avatar|profile)(\?|$)/.test(u)) load();
      } catch { /* observer must never break a request */ }
      return res;
    };
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { if (window.fetch !== orig) window.fetch = orig; document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-pink-500 font-bold" title={name || undefined}>
      {url ? <img src={url} alt={name ? `${name}'s profile photo` : 'Profile photo'} className="h-full w-full object-cover" onError={() => setUrl(null)} /> : <span aria-hidden>{initialsOf(name)}</span>}
    </div>
  );
}
