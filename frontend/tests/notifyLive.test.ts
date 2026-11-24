// Unit tests for the real-time client (src/notifyLive.ts).   cd frontend && npm run test:live   (Node 22.6+)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backoff, connectLive, createParser } from '../src/notifyLive.ts';

test('parser: reads complete events and keeps partial ones buffered', () => {
  const p = createParser();
  assert.deepEqual(p('retry: 3000\n\nevent: ready\ndata: {"at":1}\n\nevent: refr'), [{ event: 'ready', data: { at: 1 } }]);
  assert.deepEqual(p('esh\ndata: {"reason":"sync"}\n\n'), [{ event: 'refresh', data: { reason: 'sync' } }]);
});
test('parser: handles CRLF, comments, ids and several events in one chunk', () => {
  const p = createParser();
  const out = p(': keep-alive\r\n\r\nid: 5\r\nevent: refresh\r\ndata: {"a":1}\r\n\r\nevent: ping\r\ndata: {}\r\n\r\n');
  assert.deepEqual(out.map(e => e.event), ['refresh', 'ping']); assert.deepEqual(out[0].data, { a: 1 });
});
test('parser: bad JSON never throws', () => { assert.deepEqual(createParser()('event: x\ndata: not-json\n\n'), [{ event: 'x', data: { raw: 'not-json' } }]); });
test('backoff doubles up to 30s', () => { assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 20].map(backoff), [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]); });

// ---- connectLive with a fake fetch ----
const enc = new TextEncoder();
function streamOf(chunks: string[], hold = false) {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { ctrl = c; for (const x of chunks) c.enqueue(enc.encode(x)); if (!hold) c.close(); } });
  return { body, push: (x: string) => ctrl.enqueue(enc.encode(x)), end: () => ctrl.close() };
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const realFetch = globalThis.fetch;

test('connectLive: sends the token in a header, reports status and delivers events', async () => {
  const s = streamOf(['event: ready\ndata: {}\n\n'], true); let seenHeaders: any, calls = 0;
  (globalThis as any).fetch = async (_u: string, init: any) => { calls++; seenHeaders = init.headers; return { ok: true, status: 200, body: s.body }; };
  const events: string[] = [], status: boolean[] = []; let opened = 0;
  const stop = connectLive({ getToken: () => 'tok', onEvent: e => events.push(e.event), onStatus: v => status.push(v), onOpen: () => opened++ });
  await sleep(30); assert.equal(seenHeaders.Authorization, 'Bearer tok'); assert.equal(opened, 1); assert.equal(status[0], true); assert.deepEqual(events, ['ready']);
  s.push('event: refresh\ndata: {"reason":"write"}\n\n'); await sleep(30); assert.deepEqual(events, ['ready', 'refresh']);
  stop(); await sleep(10); assert.equal(status.at(-1), false); assert.equal(calls, 1, 'no reconnect after stop()');
});
test('connectLive: reconnects after the server closes the stream and calls onOpen again', async () => {
  let calls = 0; (globalThis as any).fetch = async () => { calls++; return { ok: true, status: 200, body: streamOf(['event: ready\ndata: {}\n\n']).body }; };
  let opened = 0; const stop = connectLive({ getToken: () => 'tok', onEvent: () => {}, onOpen: () => opened++ });
  await sleep(1400); stop(); assert.ok(calls >= 2 && opened >= 2, `calls=${calls} opened=${opened}`);
});
test('connectLive: a 401 stops quietly (no retry storm)', async () => {
  let calls = 0; (globalThis as any).fetch = async () => { calls++; return { ok: false, status: 401, body: null }; };
  const status: boolean[] = []; const stop = connectLive({ getToken: () => 'tok', onEvent: () => {}, onStatus: v => status.push(v) });
  await sleep(1300); stop(); assert.equal(calls, 1);
});
test('connectLive: a silent (dead) connection is dropped after staleMs and re-established', async () => {
  let calls = 0; (globalThis as any).fetch = async (_u: string, init: any) => { calls++; const s = streamOf([], true); init.signal.addEventListener('abort', () => { try { s.end(); } catch { /* closed */ } }); return { ok: true, status: 200, body: s.body }; };
  const stop = connectLive({ getToken: () => 'tok', onEvent: () => {}, staleMs: 60 }); await sleep(1300); stop(); assert.ok(calls >= 2, 'calls=' + calls);
});
test('connectLive: waits for a token instead of failing when signed out', async () => {
  let calls = 0; (globalThis as any).fetch = async () => { calls++; return { ok: true, status: 200, body: streamOf([], true).body }; };
  const stop = connectLive({ getToken: () => null, onEvent: () => {} }); await sleep(50); stop(); assert.equal(calls, 0);
});
test('cleanup', () => { (globalThis as any).fetch = realFetch; });
