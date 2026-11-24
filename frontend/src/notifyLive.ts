// Real-time notification client: listens to GET /api/notifications/stream (Server-Sent Events) and calls back the moment the server says something changed.
// Uses fetch streaming (not EventSource) so the login token travels in the Authorization header, never in a URL. No imports, so it can be unit tested with plain node.
// Reconnects automatically (1s, 2s, 4s ... max 30s), notices a silent/dead connection (no data for 70s; the server sends a heartbeat every 25s) and
// calls onOpen after every (re)connect so anything missed while offline is picked up.

export type LiveEvent = { event: string; data: any };

// Incremental SSE parser. feed(chunk) returns the complete events found so far; partial events stay buffered until the rest arrives.
export function createParser() {
  let buf = '';
  return (chunk: string): LiveEvent[] => {
    buf += chunk.replace(/\r\n?/g, '\n'); const out: LiveEvent[] = []; let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, i); buf = buf.slice(i + 2); let event = 'message'; const data: string[] = [];
      for (const line of raw.split('\n')) {
        if (!line || line.startsWith(':')) continue; // comment / keep-alive
        const c = line.indexOf(':'), f = c < 0 ? line : line.slice(0, c), v = c < 0 ? '' : line.slice(c + 1).replace(/^ /, '');
        if (f === 'event') event = v; else if (f === 'data') data.push(v);
      }
      if (!data.length && event === 'message') continue;
      let parsed: any = {}; try { parsed = data.length ? JSON.parse(data.join('\n')) : {}; } catch { parsed = { raw: data.join('\n') }; }
      out.push({ event, data: parsed });
    }
    return out;
  };
}
export const backoff = (attempt: number) => Math.min(30000, 1000 * 2 ** Math.max(0, attempt));

export type LiveOptions = { getToken: () => string | null; onEvent: (e: LiveEvent) => void; onStatus?: (connected: boolean) => void; onOpen?: () => void; url?: string; staleMs?: number };

// Starts the live connection; returns stop(). Safe to call stop() more than once.
export function connectLive(o: LiveOptions): () => void {
  const url = o.url || '/api/notifications/stream', stale = o.staleMs ?? 70000;
  let stopped = false, attempt = 0, ctl: AbortController | null = null, retry: any = null, watchdog: any = null;
  const status = (v: boolean) => { try { o.onStatus?.(v); } catch { /* ignore */ } };
  const schedule = () => { if (stopped) return; clearTimeout(retry); retry = setTimeout(run, backoff(attempt++)); };
  const run = async () => {
    if (stopped) return; const token = o.getToken(); if (!token) { schedule(); return; }
    ctl = new AbortController(); const mine = ctl; const feed = createParser();
    const kick = () => { clearTimeout(watchdog); watchdog = setTimeout(() => mine.abort(), stale); };
    try {
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token, Accept: 'text/event-stream' }, signal: mine.signal, cache: 'no-store' });
      if (r.status === 401) { status(false); return; } // signed out / revoked: api.ts handles the redirect, nothing to reconnect to
      if (!r.ok || !r.body) throw new Error('stream ' + r.status);
      attempt = 0; kick(); status(true); try { o.onOpen?.(); } catch { /* ignore */ }
      const reader = r.body.getReader(), dec = new TextDecoder();
      for (;;) { const { done, value } = await reader.read(); if (done) break; kick(); for (const e of feed(dec.decode(value, { stream: true }))) { try { o.onEvent(e); } catch { /* a bad handler must not drop the connection */ } } }
    } catch { /* dropped or aborted: fall through to reconnect */ }
    clearTimeout(watchdog); status(false); schedule();
  };
  run();
  return () => { stopped = true; clearTimeout(retry); clearTimeout(watchdog); try { ctl?.abort(); } catch { /* ignore */ } status(false); };
}
