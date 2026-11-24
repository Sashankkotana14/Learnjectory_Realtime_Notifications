// Shared helpers: local-date handling, validation and automatic assignment priority
const pad = n => String(n).padStart(2, '0');
const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const daysBetween = (from, to) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 864e5);
// High: 0-2 days, Medium: 3-5 days, Low: 6+ days, Overdue: past due date (unless completed)
function priority(a, today = todayStr()) {
  if (a.status === 'done') return { priority: 'Completed', days_left: a.due_date && isDate(a.due_date) ? daysBetween(today, a.due_date) : null };
  if (!a.due_date || !isDate(a.due_date)) return { priority: 'Low', days_left: null };
  const n = daysBetween(today, a.due_date);
  return { priority: n < 0 ? 'Overdue' : n <= 2 ? 'High' : n <= 5 ? 'Medium' : 'Low', days_left: n };
}
const withPriority = (a, today) => ({ ...a, ...priority(a, today) });
const attendancePct = r => (r.classes_total > 0 ? Math.round((r.classes_attended / r.classes_total) * 1000) / 10 : null);
// ---- Part 1B helpers (all date maths is done on YYYY-MM-DD strings in UTC to avoid DST/timezone drift) ----
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekStart = s => addDays(s, -((new Date(s + 'T00:00:00Z').getUTCDay() + 6) % 7)); // Monday
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Split `total` whole minutes over n sessions; the remainder is handed out one minute at a time so the parts always sum to total
const distribute = (total, n) => { const base = Math.floor(total / n), r = total % n; return Array.from({ length: n }, (_, i) => base + (i < r ? 1 : 0)); };
// current streak counts back from today (or from yesterday if today is not done yet, so the streak is still alive)
function streaks(dates, today = todayStr()) {
  const set = new Set(dates), sorted = [...set].sort();
  let current = 0, cur = set.has(today) ? today : addDays(today, -1);
  while (set.has(cur)) { current++; cur = addDays(cur, -1); }
  let longest = 0, run = 0, prev = null;
  for (const x of sorted) { run = prev && addDays(prev, 1) === x ? run + 1 : 1; if (run > longest) longest = run; prev = x; }
  return { current, longest };
}
const toInt = v => (v === '' || v === null || v === undefined || typeof v === 'boolean' ? NaN : Number(v));
module.exports = { todayStr, isDate, daysBetween, priority, withPriority, attendancePct, addDays, weekStart, DOW, distribute, streaks, toInt };
