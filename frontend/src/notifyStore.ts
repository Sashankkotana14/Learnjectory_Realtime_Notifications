// Permanent notification storage client. Talks to /api/notifications (database-backed) so read / dismissed state survives refresh, logout and other browsers.
// Uses fetch directly (not api()) so these background syncs never fire the success-toast / 'lj:write' events that other components listen to.
import { getToken } from './api';

export type StoredState = { read: string[]; cleared: string[] };
type Item = { id: string; kind: string; title: string; body: string; to: string; at: number; tag?: string };

async function call(path: string, method: string, body?: any) {
  const r = await fetch('/api/notifications' + path, { method, headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d as { notifications: { id: string; read: boolean; cleared: boolean }[] };
}
export const toState = (rows: { id: string; read: boolean; cleared: boolean }[]): StoredState => ({ read: rows.filter(r => r.read || r.cleared).map(r => r.id), cleared: rows.filter(r => r.cleared).map(r => r.id) });

// Store the current notifications and get back the saved read / cleared state. `legacy` (state an older version kept in this browser) is imported once.
export async function syncNotifications(items: Item[], legacy?: StoredState) {
  const slim = items.map(i => ({ id: i.id, kind: i.kind, title: i.title, body: i.body, to: i.to, at: i.at, tag: i.tag }));
  return toState((await call('/sync', 'POST', { items: slim, ...(legacy ? { read: legacy.read, cleared: legacy.cleared } : {}) })).notifications);
}
export const saveRead = (ids: string[]) => call('/read', 'PUT', { ids });
export const saveCleared = (ids: string[]) => call('/clear', 'PUT', { ids });
export const itemsSignature = (items: Item[]) => items.map(i => `${i.id}|${i.title}|${i.body}|${i.tag || ''}|${i.at}`).join('\n');
