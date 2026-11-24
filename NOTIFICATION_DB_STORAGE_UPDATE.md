# Permanent Notification Database Storage (only change)

Notifications and their read / dismissed state are now saved in the database per user, so they survive page refresh, logout/login and other browsers.

## What changed
- NEW `backend/database/notifications.js` - one additive table `notifications` (UNIQUE(user_id, notif_id), ON DELETE CASCADE). Existing tables/rows untouched.
- NEW `backend/controllers/notifications.js` - `GET /api/notifications`, `POST /api/notifications/sync`, `PUT /api/notifications/read`, `PUT /api/notifications/clear`.
- `backend/database/db.js` (+1 line to load the schema), `backend/routes/api.js` (+4 routes, before the generic `/:res`), `backend/package.json` (test script).
- NEW `frontend/src/notifyStore.ts` - small client (uses fetch directly, so it fires no toasts / `lj:write` events).
- `frontend/src/components/NotificationBell.tsx` - syncs notifications to the database and loads read/cleared state from it. localStorage stays only as a fallback if the server is unreachable. State saved in a browser by the previous version is imported once.
- NEW `backend/tests/notifications.test.js` (`npm run test:notifstore`, also part of `npm test`).

Not changed: all other modules, endpoints, tables, notification rules/wording, Settings > Enable notifications behaviour.
Account export and account deletion include/remove the new table automatically (they work off `user_id`).
