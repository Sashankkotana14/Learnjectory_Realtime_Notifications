import { successMessage } from './notifyExtras';
export const getToken = () => localStorage.getItem('token');
export const clearSession = () => { localStorage.removeItem('token'); };
// Only the auth middleware's own 401 ('Unauthorized' = missing/expired/revoked token) ends the session. Other 401s (wrong current password, wrong password on account deletion) are normal errors shown to the user.
export async function api(path: string, method = 'GET', body?: any) {
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && getToken() && d.error === 'Unauthorized') { clearSession(); location.href = '/login'; }
  if (!r.ok) throw new Error(d.error || 'Request failed');
  if (method !== 'GET') { try { const m = successMessage(method, path, body, d); if (m) window.dispatchEvent(new CustomEvent('lj:success', { detail: m })); } catch { /* a toast must never break a request */ } try { window.dispatchEvent(new CustomEvent('lj:write', { detail: path })); } catch { /* ignore */ } }
  return d;
}
// Server-side logout revokes the token; always clear it locally even if the request fails
export async function logout() { try { await api('/auth/logout', 'POST'); } catch { /* ignore */ } clearSession(); }
// Binary upload: the file is sent as the raw request body (name + options travel in the query string). Used by resume upload and My Vault.
export async function upload(path: string, file: File, params: Record<string, string> = {}) {
  const q = new URLSearchParams({ name: file.name, ...params }).toString();
  const r = await fetch('/api' + path + '?' + q, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}) }, body: file });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && getToken() && d.error === 'Unauthorized') { clearSession(); location.href = '/login'; }
  if (!r.ok) throw new Error(d.error || 'Upload failed');
  return d;
}
// Authenticated file download -> Blob (the token is sent in a header, so plain <a href> links cannot be used for private files)
export async function fetchBlob(path: string) {
  const r = await fetch('/api' + path, { headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {} });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Download failed'); }
  return r.blob();
}
export const ago = (iso?: string | null) => {
  if (!iso) return ''; const t = Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z'); if (isNaN(t)) return '';
  const m = Math.floor((Date.now() - t) / 6e4); if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'; const h = Math.floor(m / 60); if (h < 24) return h + 'h ago'; const d = Math.floor(h / 24); return d < 30 ? d + 'd ago' : new Date(t).toLocaleDateString();
};
