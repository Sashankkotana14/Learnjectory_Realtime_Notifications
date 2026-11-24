// Run: node --experimental-strip-types --test tests/notificationHistory.test.ts   (from frontend/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterHistory as F, groupByDay as G, receivedMs as R, statusOf as S, type HistoryRow } from '../src/notificationHistory.ts';

const row = (o: Partial<HistoryRow>): HistoryRow => ({ id: 'x', kind: 'due', title: 'T', body: 'B', to: '/assignments', at: 0, read: false, cleared: false, created_at: '2026-11-24 10:00:00', ...o });

test('receivedMs parses SQLite UTC timestamps and falls back to at', () => {
  assert.equal(R({ created_at: '2026-11-24 10:00:00', at: 5 }), Date.parse('2026-11-24T10:00:00Z'));
  assert.equal(R({ created_at: '', at: 5 }), 5); assert.equal(R({ created_at: 'garbage', at: 7 }), 7);
});
test('statusOf: dismissed beats read beats unread', () => {
  assert.equal(S({ read: false, cleared: false }), 'Unread'); assert.equal(S({ read: true, cleared: false }), 'Read'); assert.equal(S({ read: true, cleared: true }), 'Dismissed');
});
test('filter by group, status and search; newest first', () => {
  const rows = [row({ id: 'a', kind: 'overdue', title: 'Essay overdue', created_at: '2026-11-20 09:00:00' }), row({ id: 'b', kind: 'goal-due', title: 'Goal due', read: true, created_at: '2026-11-22 09:00:00' }),
    row({ id: 'c', kind: 'habit', title: 'Read daily', read: true, cleared: true, created_at: '2026-11-23 09:00:00' })];
  assert.deepEqual(F(rows, {}).map(r => r.id), ['c', 'b', 'a']);
  assert.deepEqual(F(rows, { group: 'assignments' }).map(r => r.id), ['a']);
  assert.deepEqual(F(rows, { status: 'unread' }).map(r => r.id), ['a']);
  assert.deepEqual(F(rows, { status: 'read' }).map(r => r.id), ['b']);
  assert.deepEqual(F(rows, { status: 'dismissed' }).map(r => r.id), ['c']);
  assert.deepEqual(F(rows, { q: ' ESSAY ' }).map(r => r.id), ['a']);
  assert.deepEqual(F(rows, { group: 'goals', q: 'nope' }), []);
  assert.deepEqual(F(undefined as any, {}), []);
});
test('groupByDay labels Today / Yesterday / dated and keeps order', () => {
  const now = new Date(2026, 10, 24, 15, 0).getTime(), at = (d: number, h: number) => { const t = new Date(2026, 10, d, h, 0); return t.toISOString().replace('T', ' ').slice(0, 19); };
  const rows = [row({ id: '1', created_at: at(24, 12) }), row({ id: '2', created_at: at(24, 9) }), row({ id: '3', created_at: at(23, 12) }), row({ id: '4', created_at: at(10, 12) })];
  const g = G(rows, now);
  assert.deepEqual(g.map(x => x.label).slice(0, 2), ['Today', 'Yesterday']); assert.match(g[2].label, /10 Nov 2026/);
  assert.deepEqual(g.map(x => x.items.length), [2, 1, 1]);
});
