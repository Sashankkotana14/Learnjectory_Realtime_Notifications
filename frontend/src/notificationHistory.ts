// Notification History helpers (pure, no imports). Used only by pages/NotificationHistory.tsx.
// Rows come from GET /api/notifications (the existing `notifications` table): every notification ever stored for the user, including read and dismissed ones.
export type HistoryRow = { id: string; kind: string; title: string; body: string; to: string; tag?: string; at: number; read: boolean; cleared: boolean; created_at?: string };

export const KIND_GROUPS: Record<string, string[]> = {
  assignments: ['overdue', 'due'],
  planner: ['session', 'reminder'],
  goals: ['goal-overdue', 'goal-due'],
  habits: ['habit'],
  achievements: ['achievement'],
  community: ['community-like', 'community-comment'],
};
export const FILTERS: [string, string][] = [['', 'All'], ['assignments', 'Assignments'], ['planner', 'Planner'], ['goals', 'Goals'], ['habits', 'Habits'], ['achievements', 'Achievements'], ['community', 'Community']];

// "Received" time: when it was first stored (SQLite CURRENT_TIMESTAMP = UTC "YYYY-MM-DD HH:MM:SS"). Falls back to the notification's own time.
export function receivedMs(r: Pick<HistoryRow, 'created_at' | 'at'>): number {
  const c = String(r.created_at || '');
  if (c) { const t = Date.parse(c.includes('T') ? c : c.replace(' ', 'T') + 'Z'); if (!isNaN(t)) return t; }
  return Number(r.at) || 0;
}
const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export function filterHistory(rows: HistoryRow[], f: { group?: string; status?: string; q?: string }): HistoryRow[] {
  const kinds = f.group ? KIND_GROUPS[f.group] : null, q = (f.q || '').trim().toLowerCase();
  return (rows || []).filter(r => r && (!kinds || kinds.includes(r.kind))
    && (!f.status || (f.status === 'unread' ? !r.read : f.status === 'read' ? r.read && !r.cleared : r.cleared))
    && (!q || `${r.title} ${r.body}`.toLowerCase().includes(q)))
    .sort((a, b) => receivedMs(b) - receivedMs(a) || (b.at || 0) - (a.at || 0));
}

// Groups an already newest-first list by local calendar day: "Today", "Yesterday", then e.g. "Mon 16 Nov 2026".
export function groupByDay(rows: HistoryRow[], now = Date.now()): { key: string; label: string; items: HistoryRow[] }[] {
  const today = dayKey(now), yest = dayKey(now - 864e5), out: { key: string; label: string; items: HistoryRow[] }[] = [];
  for (const r of rows) {
    const ms = receivedMs(r), k = dayKey(ms); let g = out[out.length - 1];
    if (!g || g.key !== k) { const d = new Date(ms); g = { key: k, label: k === today ? 'Today' : k === yest ? 'Yesterday' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), items: [] }; out.push(g); }
    g.items.push(r);
  }
  return out;
}
export const statusOf = (r: Pick<HistoryRow, 'read' | 'cleared'>) => (r.cleared ? 'Dismissed' : r.read ? 'Read' : 'Unread');
export const timeLabel = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
