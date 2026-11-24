// Goal deadline, daily habit and success notifications. Pure functions only (no imports) so they can be unit tested with plain node.
// Used by components/NotificationBell.tsx (goal + habit entries) and components/SuccessToasts.tsx (success toasts, fed by api.ts).

export type ExtraNotif = { id: string; kind: 'goal-overdue' | 'goal-due' | 'habit'; title: string; body: string; to: string; at: number; tag?: string };

const dayMs = (s: string) => Date.parse(s + 'T00:00:00');
const localToday = () => { const d = new Date(), z = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

// Goals: open goals with a deadline notify when overdue, or when due within 3 days (today / tomorrow / in N days). Completed goals and goals without a deadline never notify.
export function goalDeadlineNotifications(goals: any[] | undefined, today: string): ExtraNotif[] {
  const out: ExtraNotif[] = [];
  for (const g of goals || []) {
    if (!g || g.completed || !g.target_date || typeof g.days_left !== 'number') continue;
    const n = g.days_left, name = g.title || 'Goal', prog = `${Number(g.progress) || 0}% done`;
    if (n < 0) out.push({ id: `goal:${g.id}:overdue`, kind: 'goal-overdue', title: `Goal deadline passed: ${name}`, body: `${plural(-n, 'day')} overdue · ${prog}`, to: '/goals', at: dayMs(g.target_date) });
    else if (n <= 3) out.push({ id: `goal:${g.id}:${g.target_date}`, kind: 'goal-due', title: n === 0 ? `Goal due today: ${name}` : n === 1 ? `Goal due tomorrow: ${name}` : `Goal due in ${n} days: ${name}`, body: prog, to: '/goals', at: dayMs(today), tag: n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days` });
  }
  return out;
}

// Habits: one entry per habit that is not finished today. The id contains today's date, so it comes back fresh every day and disappears once the habit is done.
export function dailyHabitNotifications(habits: any[] | undefined, today: string): ExtraNotif[] {
  const out: ExtraNotif[] = [];
  for (const h of habits || []) {
    if (!h || h.done_today) continue;
    const target = Number(h.daily_target) || 1, done = Number(h.today_count) || 0, streak = Number(h.current_streak) || 0;
    const progress = done > 0 ? `${done}/${target} done today` : target > 1 ? `Target ${target} today` : 'Not done yet today';
    out.push({ id: `habit:${h.id}:${today}`, kind: 'habit', title: `Daily habit: ${h.name}`, body: streak > 0 ? `${progress} · keep your ${plural(streak, 'day')} streak going` : progress, to: '/growth', at: dayMs(today) + (done > 0 ? 1 : 0), tag: 'Today' });
  }
  return out;
}

// Success toasts: derived from a finished, successful API call. Returns null when the call is not one we announce.
export function successMessage(method: string, path: string, body: any, res: any, today: string = localToday()): string | null {
  const m = method.toUpperCase(), p = path.split('?')[0];
  if (m === 'POST' && p === '/goals') return res?.title ? `Goal added: ${res.title}` : 'Goal added';
  if (m === 'PUT' && /^\/goals\/\d+$/.test(p)) {
    if (res?.completed) return `Goal completed: ${res.title}. Great work!`;
    if (body && body.progress !== undefined && Object.keys(body).length === 1) return `Goal progress updated to ${res?.progress ?? body.progress}%`;
    return res?.title ? `Goal updated: ${res.title}` : 'Goal updated';
  }
  if (m === 'POST' && p === '/habits') return res?.name ? `Habit added: ${res.name}` : 'Habit added';
  if (m === 'POST' && /^\/habits\/\d+\/logs$/.test(p)) {
    const name = res?.name || 'Habit';
    if (body && typeof body.date === 'string' && body.date !== today) return `${name}: log saved for ${body.date}`; // a past day was edited, so today's completion is not announced
    if (res?.done_today) return res.current_streak > 1 ? `${name} completed! ${res.current_streak}-day streak` : `${name} completed for today!`;
    return res && res.daily_target ? `${name}: ${res.today_count}/${res.daily_target} logged` : `${name} progress saved`;
  }
  return null;
}

// Achievement unlock toasts. `list` is GET /achievements -> achievements (real, rule-based unlocks). `seen` is the per-user list of unlock keys already announced on this browser.
// First run (seen === null) only records what is already unlocked, so old achievements never flood the screen. Unlocks older than 10 minutes are recorded silently too
// (e.g. earned on another device). Returns the achievements to announce now and the updated seen list.
export type AchToast = { key: string; title: string; description: string; category: string };
export function achievementUnlocks(list: any[] | undefined, seen: string[] | null, now: number = Date.now()): { fresh: AchToast[]; seen: string[] } {
  const unlocked = (list || []).filter(a => a && a.unlocked && typeof a.key === 'string');
  const all = unlocked.map(a => a.key);
  if (seen === null) return { fresh: [], seen: all };
  const known = new Set(seen), fresh: AchToast[] = [];
  for (const a of unlocked) {
    if (known.has(a.key)) continue;
    const t = Date.parse(String(a.unlocked_at || '').includes('T') ? a.unlocked_at : String(a.unlocked_at || '').replace(' ', 'T') + 'Z');
    if (!isNaN(t) && now - t <= 10 * 6e4 && now - t >= -864e5) fresh.push({ key: a.key, title: a.title || 'Achievement', description: a.description || '', category: a.category || 'Achievements' });
  }
  return { fresh, seen: [...new Set([...seen, ...all])] };
}

// Community notifications: likes and comments other students leave on my posts / comments. `rows` is GET /community/notifications -> notifications (real activity only).
export type CommunityNotif = { id: string; kind: 'community-like' | 'community-comment'; title: string; body: string; to: string; at: number };
const utc = (v: any) => Date.parse(String(v || '').includes('T') ? String(v) : String(v || '').replace(' ', 'T') + 'Z');
export function communityNotifications(rows: any[] | undefined): CommunityNotif[] {
  const out: CommunityNotif[] = [];
  for (const r of rows || []) {
    if (!r || typeof r.id !== 'string' || (r.type !== 'like' && r.type !== 'comment')) continue;
    const at = utc(r.created_at); if (isNaN(at)) continue;
    const who = r.actor || 'Someone', q = r.kind === 'question', post = r.post_title ? `“${r.post_title}”` : 'your post';
    if (r.type === 'like') out.push({ id: `com:${r.id}`, kind: 'community-like', title: r.target === 'comment' ? `${who} liked your ${q ? 'answer' : 'comment'}` : `${who} liked your post`, body: r.target === 'comment' && r.text ? `${r.text} · on ${post}` : post, to: '/community', at });
    else out.push({ id: `com:${r.id}`, kind: 'community-comment', title: `${who} ${q ? 'answered' : 'commented on'} your ${q ? 'question' : 'post'}`, body: r.text ? `${r.text} · on ${post}` : post, to: '/community', at });
  }
  return out;
}
