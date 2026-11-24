// Run: node --experimental-strip-types --test tests/notifyExtras.test.ts   (from frontend/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { goalDeadlineNotifications as G, dailyHabitNotifications as H, successMessage as S, achievementUnlocks as A, communityNotifications as CN } from '../src/notifyExtras.ts';

const T = '2026-11-24';
const goal = (o: any) => ({ id: 1, title: 'Learn HTML', progress: 40, target_date: '2026-12-01', completed: false, days_left: 7, ...o });
const habit = (o: any) => ({ id: 5, name: 'Read', daily_target: 1, today_count: 0, done_today: false, current_streak: 0, ...o });

test('goal: overdue, today, tomorrow, in 3 days', () => {
  const r = G([goal({ id: 1, days_left: -2 }), goal({ id: 2, days_left: 0 }), goal({ id: 3, days_left: 1 }), goal({ id: 4, days_left: 3 })], T);
  assert.deepEqual(r.map(x => x.kind), ['goal-overdue', 'goal-due', 'goal-due', 'goal-due']);
  assert.match(r[0].title, /deadline passed/); assert.match(r[0].body, /2 days overdue/);
  assert.match(r[1].title, /due today/); assert.match(r[2].title, /due tomorrow/); assert.match(r[3].title, /due in 3 days/);
  assert.ok(r.every(x => x.to === '/goals'));
});
test('goal: ignores far, completed, undated and bad rows', () => {
  assert.equal(G([goal({ days_left: 4 }), goal({ completed: true, days_left: 0 }), goal({ target_date: '', days_left: null }), null as any], T).length, 0);
  assert.equal(G(undefined, T).length, 0);
});
test('goal: id changes when the deadline changes (so a moved deadline notifies again)', () => {
  assert.notEqual(G([goal({ days_left: 1, target_date: '2026-11-25' })], T)[0].id, G([goal({ days_left: 1, target_date: '2026-11-26' })], T)[0].id);
});
test('habit: one entry per unfinished habit, none once done', () => {
  const r = H([habit({ id: 1 }), habit({ id: 2, done_today: true }), habit({ id: 3, daily_target: 3, today_count: 1, current_streak: 4 })], T);
  assert.equal(r.length, 2); assert.equal(r[0].title, 'Daily habit: Read'); assert.match(r[1].body, /1\/3 done today/); assert.match(r[1].body, /4 days streak/);
  assert.ok(r[0].id.endsWith(T)); assert.equal(r[0].to, '/growth');
});
test('success: goals', () => {
  assert.equal(S('POST', '/goals', {}, { title: 'A' }), 'Goal added: A');
  assert.match(S('PUT', '/goals/3', { progress: 100 }, { title: 'A', completed: true, progress: 100 })!, /Goal completed: A/);
  assert.equal(S('PUT', '/goals/3', { progress: 50 }, { title: 'A', completed: false, progress: 50 }), 'Goal progress updated to 50%');
  assert.equal(S('PUT', '/goals/3', { title: 'B', progress: 10 }, { title: 'B', completed: false, progress: 10 }), 'Goal updated: B');
  assert.equal(S('DELETE', '/goals/3', undefined, { ok: true }), null);
  assert.equal(S('GET', '/goals', undefined, {}), null);
});
test('success: habits', () => {
  assert.equal(S('POST', '/habits', {}, { name: 'Read' }), 'Habit added: Read');
  assert.equal(S('POST', '/habits/5/logs', { count: 1 }, { name: 'Read', done_today: true, current_streak: 1 }, T), 'Read completed for today!');
  assert.equal(S('POST', '/habits/5/logs', {}, { name: 'Read', done_today: true, current_streak: 6 }, T), 'Read completed! 6-day streak');
  assert.equal(S('POST', '/habits/5/logs', { increment: 1 }, { name: 'Run', done_today: false, today_count: 2, daily_target: 5 }, T), 'Run: 2/5 logged');
  assert.match(S('POST', '/habits/5/logs', { date: '2026-11-20' }, { name: 'Read', done_today: true }, T)!, /log saved for 2026-11-20/);
  assert.equal(S('PUT', '/habits/5', {}, { name: 'Read' }), null);
  assert.equal(S('DELETE', '/habits/5/logs/2026-11-24', undefined, {}), null);
  assert.equal(S('POST', '/assignments', {}, {}), null);
});

// ---- Achievement unlock toasts ----
const NOW = Date.parse('2026-11-24T12:00:00Z');
const ach = (o: any) => ({ key: 'goal_set', title: 'Goal Setter', description: 'Create your first goal', category: 'Goals', unlocked: true, unlocked_at: '2026-11-24 11:59:30', ...o });
test('achievements: first run records existing unlocks and announces nothing', () => {
  const r = A([ach({ key: 'a' }), ach({ key: 'b', unlocked: false })], null, NOW);
  assert.deepEqual(r.fresh, []); assert.deepEqual(r.seen, ['a']);
});
test('achievements: a new real unlock is announced once', () => {
  const list = [ach({ key: 'a' }), ach({ key: 'goal_1', title: 'Goal Getter' })];
  const r = A(list, ['a'], NOW);
  assert.deepEqual(r.fresh.map(x => x.key), ['goal_1']); assert.equal(r.fresh[0].title, 'Goal Getter'); assert.equal(r.fresh[0].category, 'Goals');
  assert.equal(A(list, r.seen, NOW).fresh.length, 0); // no duplicate on the next check
});
test('achievements: locked ones never notify; old (>10 min) unlocks are recorded silently', () => {
  const r = A([ach({ key: 'x', unlocked: false, unlocked_at: null }), ach({ key: 'old', unlocked_at: '2026-11-24 10:00:00' })], [], NOW);
  assert.deepEqual(r.fresh, []); assert.deepEqual(r.seen, ['old']);
});
test('achievements: bad input is safe', () => {
  assert.deepEqual(A(undefined, [], NOW), { fresh: [], seen: [] }); assert.deepEqual(A([null as any, {} as any], null, NOW).seen, []);
});

const crow = (o: any) => ({ id: 'cc:1', type: 'comment', target: 'post', actor: 'Bob', post_id: 9, post_title: 'My post', kind: 'discussion', text: 'Nice work', created_at: '2026-11-24 10:00:00', ...o });
test('community: comment, answer and like titles', () => {
  const r = CN([crow({}), crow({ id: 'cc:2', kind: 'question' }), crow({ id: 'cl:p:3', type: 'like' }), crow({ id: 'cl:c:4', type: 'like', target: 'comment', text: 'Try grid' })]);
  assert.deepEqual(r.map(x => x.kind), ['community-comment', 'community-comment', 'community-like', 'community-like']);
  assert.equal(r[0].title, 'Bob commented on your post'); assert.equal(r[1].title, 'Bob answered your question');
  assert.equal(r[2].title, 'Bob liked your post'); assert.equal(r[3].title, 'Bob liked your comment'); assert.match(r[3].body, /Try grid/);
  assert.ok(r.every(x => x.to === '/community' && x.id.startsWith('com:')));
});
test('community: ignores bad rows and parses UTC timestamps', () => {
  assert.equal(CN([null as any, { id: 1 }, crow({ type: 'x' }), crow({ created_at: 'nope' })]).length, 0); assert.equal(CN(undefined).length, 0);
  assert.equal(CN([crow({})])[0].at, Date.parse('2026-11-24T10:00:00Z'));
});
