# Real-time Notifications (only change)

New notifications now appear in the header bell instantly, without refreshing the page or waiting for the 60-second poll.

## How it works
- The browser opens one Server-Sent-Events connection to `GET /api/notifications/stream` (login token sent in the `Authorization` header, never in the URL).
- The server pushes a small `refresh` event the moment something may have changed; the bell reloads at once (bursts are merged into one reload).
- When a new unread notification arrives the bell rings briefly, the badge pulses and screen readers announce it. A small dot in the panel header shows "Live updates on".
- The connection reconnects automatically (1s, 2s, 4s ... max 30s), drops dead connections (no heartbeat for 70s) and refreshes again after every reconnect, so nothing is missed while offline. The existing 60s poll stays as a safety net.

## What triggers an instant update
- Any successful change you make (goals, habits, assignments, planner ...) updates your other open tabs/browsers, including achievements unlocked by that change.
- Another student likes / comments on / answers / accepts something of yours in Community -> your bell updates immediately (the person who did it is not notified).
- Syncing, reading or dismissing notifications in one tab updates your other tabs.

## Files
- NEW `backend/lib/notifyHub.js` (in-memory connection registry, max 8 tabs per user), NEW `backend/lib/notifyLive.js` (decides who to notify; read-only lookups).
- `backend/controllers/notifications.js` (+ `stream`, + publish after sync/read/clear), `backend/routes/api.js` (+1 stream route, +1 post-write hook), `backend/package.json` (test script).
- NEW `frontend/src/notifyLive.ts` (SSE client), `frontend/src/components/NotificationBell.tsx` (connect, ring/announce, live dot), `frontend/package.json` (test script).
- NEW tests: `backend/tests/notificationsLive.test.js` (`npm run test:live`, also in `npm test`), `frontend/tests/notifyLive.test.ts` (`npm run test:live`).

## Not changed
All other modules, database schema (no new tables), other endpoints, notification rules/wording, Settings > Enable notifications behaviour. No new dependencies.

## Deployment note
Behind nginx/another proxy keep response buffering off for `/api/notifications/stream` (the server already sends `X-Accel-Buffering: no`). Streams are per server process; with several backend instances use sticky routing or a shared pub/sub.
