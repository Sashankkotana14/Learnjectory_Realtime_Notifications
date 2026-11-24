// Date helpers on YYYY-MM-DD strings (no timezone drift)
const pad = (n: number) => String(n).padStart(2, '0');
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const addDays = (s: string, n: number) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const fmtDate = (s?: string | null) => { if (!s) return ''; const [y, m, d] = s.split('-').map(Number); return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`; };
export const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);
// same remainder rule as the server: the first sessions get the extra minutes
export const distribute = (total: number, n: number) => { const b = Math.floor(total / n), r = total % n; return Array.from({ length: n }, (_, i) => b + (i < r ? 1 : 0)); };
export const daysLabel = (n: number | null, completed?: boolean) => completed ? 'Completed' : n === null ? 'No deadline' : n < 0 ? `${-n} day${n === -1 ? '' : 's'} overdue` : n === 0 ? 'Due today' : `${n} day${n === 1 ? '' : 's'} left`;
