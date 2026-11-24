# Notifications update (Goal Deadline, Daily Habit, Success)
Frontend only. No backend, database or other feature changes.

- Goal deadline: bell lists open goals that are overdue or due within 3 days (opens /goals).
- Daily habit: bell lists every habit not finished today (opens /growth); disappears once done, returns next day.
- Success: toast on goal added / updated / progress / completed and habit added / logged / completed (with streak).
  Both bell entries and toasts follow Settings > Enable notifications.

Files: src/notifyExtras.ts (new), src/components/SuccessToasts.tsx (new), src/components/NotificationBell.tsx, src/api.ts, src/Layout.tsx (small edits), tests/notifyExtras.test.ts (new).
Test: `cd frontend && npm run test:notify` (Node 22.6+).
