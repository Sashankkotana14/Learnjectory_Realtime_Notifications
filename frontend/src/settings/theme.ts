// Theme engine for the Settings module. Imported by pages/Settings.tsx (which main.tsx loads eagerly), so the saved theme is applied
// as soon as the app starts - on every page, including Login - without any other file having to know about it.
// - Preference = 'light' | 'dark' | 'system'. 'system' follows the OS and re-applies live when the OS setting changes.
// - Stored per user in the database (user_settings.theme, so it follows the account across devices) and cached in localStorage for instant start-up.
import { getToken } from '../api';
export type ThemeMode = 'light' | 'dark' | 'system';
export const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system'];
const DEVICE_KEY = 'lj_theme', userKey = (id: number | string) => 'lj_theme_' + id;
const isMode = (v: any): v is ThemeMode => THEME_MODES.includes(v);
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable: preference still saved on the server */ } };

// user id from the session token (payload only - used to pick the right cache key, never for authorization)
export function currentUserId(): number | null {
  const t = getToken(); if (!t) return null;
  try { const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return Number.isFinite(Number(p.id)) ? Number(p.id) : null; } catch { return null; }
}
export const resolveTheme = (m: ThemeMode): 'light' | 'dark' => (m === 'system' ? (mq && mq.matches ? 'light' : 'dark') : m);
let mode: ThemeMode = 'dark';
export const getThemeMode = () => mode;
export function applyTheme(m: ThemeMode) {
  mode = m; const r = resolveTheme(m), el = document.documentElement;
  el.setAttribute('data-theme', r); el.setAttribute('data-theme-mode', m); el.style.colorScheme = r;
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.content = r === 'light' ? '#F6F2FF' : '#100B1D';
  window.dispatchEvent(new CustomEvent('lj-theme', { detail: { mode: m, resolved: r } }));
}
// choose + remember a theme (cache only; the Settings page also saves it to the server)
export function rememberTheme(m: ThemeMode) { write(DEVICE_KEY, m); const id = currentUserId(); if (id !== null) write(userKey(id), m); applyTheme(m); }
function cached(): ThemeMode { const id = currentUserId(), v = (id !== null ? read(userKey(id)) : null) || read(DEVICE_KEY); return isMode(v) ? v : 'dark'; }

let lastToken: string | null = null;
async function syncFromServer() {
  const id = currentUserId(); if (id === null) return;
  try {
    const r = await fetch('/api/settings/profile', { headers: { Authorization: 'Bearer ' + getToken() } });
    if (!r.ok) return; const p = await r.json();
    if (isMode(p.theme) && currentUserId() === id) { write(userKey(id), p.theme); write(DEVICE_KEY, p.theme); applyTheme(p.theme); }
  } catch { /* offline: keep the cached theme */ }
}
function init() {
  if (typeof window === 'undefined' || (window as any).__ljThemeInit) return; (window as any).__ljThemeInit = true;
  applyTheme(cached()); lastToken = getToken(); if (lastToken) syncFromServer();
  const onOs = () => { if (mode === 'system') applyTheme('system'); };
  if (mq) { if (mq.addEventListener) mq.addEventListener('change', onOs); else (mq as any).addListener(onOs); }
  // another tab changed the preference
  window.addEventListener('storage', e => { if (e.key && (e.key === DEVICE_KEY || e.key.startsWith('lj_theme_')) && cached() !== mode) applyTheme(cached()); });
  // login / logout / switching account in this tab: re-read this account's saved theme
  setInterval(() => { const t = getToken(); if (t !== lastToken) { lastToken = t; applyTheme(cached()); if (t) syncFromServer(); } }, 1000);
}
init();
