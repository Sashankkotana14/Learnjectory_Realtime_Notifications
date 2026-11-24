# Notification History (only change)

Users can now view every notification they have previously received (unread, read and dismissed) on a new page, `/notifications`.

## What changed
- NEW `frontend/src/pages/NotificationHistory.tsx` - the page: grouped by day (Today / Yesterday / date), search, category filter, status filter (Unread / Read / Dismissed), click a row to open the related page.
- NEW `frontend/src/notificationHistory.ts` - pure helpers (filter, group by day, status).
- `frontend/src/main.tsx` - +1 import, +1 route (`/notifications`).
- `frontend/src/components/NotificationBell.tsx` - +1 "View notification history" link at the bottom of the bell panel.
- NEW tests: `frontend/tests/notificationHistory.test.ts` (`npm run test:history` in frontend), `backend/tests/notificationHistory.test.js` (`npm run test:history` in backend, also part of `npm test`).

## Database
No schema or backend code change. The page reads the existing `notifications` table through the existing `GET /api/notifications` (per user, includes read and dismissed rows).
A notification appears in history once the bell has stored it, so only notifications generated from now on (and any already stored) are listed.

Not changed: all other modules, endpoints, tables, sidebar navigation and notification rules.
