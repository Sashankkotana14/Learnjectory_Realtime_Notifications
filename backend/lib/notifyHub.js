// Real-time notification hub (in-memory). Keeps the open Server-Sent-Events connections of each signed-in user (one per browser tab)
// and pushes small events to them the moment something changes. It stores nothing and never touches the database.
//   subscribe(uid, res)      -> registers an already-opened SSE response; returns an unsubscribe function
//   publish(uid, event, data)-> writes one SSE message to every open connection of that user; returns how many received it
//   publishAll(event, data)  -> same, for every connected user (used for server shutdown notices / tests)
//   stats()                  -> { users, connections }
// Limits: MAX_PER_USER connections per user (oldest is closed first), so a runaway client cannot exhaust memory.
const conns = new Map(); // uid -> Set<res>
const MAX_PER_USER = 8;
let seq = 0;

const frame = (event, data, id) => `${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data == null ? {} : data)}\n\n`;
const safeWrite = (res, chunk) => { try { if (res.writableEnded || res.destroyed) return false; res.write(chunk); return true; } catch { return false; } };

function subscribe(uid, res) {
  uid = Number(uid); let set = conns.get(uid); if (!set) conns.set(uid, set = new Set());
  while (set.size >= MAX_PER_USER) { const old = set.values().next().value; set.delete(old); try { old.end(); } catch { /* ignore */ } }
  set.add(res);
  return () => { const s = conns.get(uid); if (!s) return; s.delete(res); if (!s.size) conns.delete(uid); };
}
function publish(uid, event, data) {
  const set = conns.get(Number(uid)); if (!set) return 0;
  const chunk = frame(event, data, ++seq); let n = 0;
  for (const res of [...set]) { if (safeWrite(res, chunk)) n++; else set.delete(res); }
  if (!set.size) conns.delete(Number(uid));
  return n;
}
function publishAll(event, data) { let n = 0; for (const uid of [...conns.keys()]) n += publish(uid, event, data); return n; }
const stats = () => ({ users: conns.size, connections: [...conns.values()].reduce((t, s) => t + s.size, 0) });
const reset = () => { for (const s of conns.values()) for (const r of s) { try { r.end(); } catch { /* ignore */ } } conns.clear(); };

module.exports = { subscribe, publish, publishAll, stats, reset, frame, safeWrite, MAX_PER_USER };
