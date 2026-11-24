# Achievement notifications update
Frontend only. No database, API or other module changes. Achievements are still unlocked by the existing rules from real user data.

- Toast: when a real achievement unlocks, a pink "Achievement unlocked" toast shows its title and description (top-right, 6 s, click opens /achievements).
- Bell: the existing bell entry ("Achievement unlocked: ...", last 7 days) now also refreshes immediately on a new unlock.
- Each unlock is announced once per browser. On first load, already-unlocked achievements are recorded silently (no flood). Unlocks older than 10 minutes are never toasted.
- Follows Settings > Enable notifications. Login/logout never trigger a check.

Files: components/AchievementToasts.tsx (new), notifyExtras.ts (+ achievementUnlocks), api.ts (+ one 'lj:write' event line), Layout.tsx (mount), components/NotificationBell.tsx (+ one listener), frontend/tests/notifyExtras.test.ts (+4 tests), backend/tests/achievementNotify.test.js (new, 3 tests), backend/package.json (test script only).

Tests: `cd frontend && npm run test:notify` (10 pass) and `cd backend && npm run test:achnotify` (3 pass).
Not run here: the full Vite build and browser click-through (no node_modules / network in my sandbox). Please run `npm install && npm run build` in frontend/ and unlock one achievement (e.g. add a goal) to see the toast.
