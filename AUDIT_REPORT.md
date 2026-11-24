# Learnjectory – Global Functionality & Workflow Audit

## Method / limits
No network in the audit environment, so `npm install`, the real server, `vite build`, `tsc` and a browser were NOT available. Testing used: syntax checks on all backend JS and all 27 frontend TS/TSX files; the project's own test suites that run on the node:sqlite shim; and an in-process harness (test-only stand-ins for express/JWT/bcrypt, not shipped) that executed the real controllers and routes with two separate users (~190 checks).

## Passed
- 138 API routes resolve to real handlers; every route except register/login requires auth.
- 95 distinct frontend API calls cross-checked against backend routes: all match.
- Data isolation: Academics, Assignments, Goals, Habits, Projects, Skills, Study sessions, Study plans (+items), Career paths, Vault notes/files, Community posts, Habit logs/history – user B cannot read, edit or delete user A's records (404/403).
- Auth: register/login validation, duplicate email, case-insensitive login, garbage/missing token (401), logout revokes token, account deletion kills the session and removes the user.
- Validation: past goal dates, progress range, attendance > total, invalid grade/date/status, empty required fields, unsupported/spoofed vault file types, empty uploads, non-image avatar.
- Unsafe `javascript:` links rejected for projects, saved jobs, vault links, career resources; community links stored only for resource/showcase posts and validated.
- Empty-state endpoints (new user) return 200 for dashboard, analytics, planner, vault, community, opportunities, settings, export.
- Existing suites: part2b.unit 34/34, dashboard 20/20, analytics 12/12, careerUpgrade 15/15, growthEngine 4/4, plannerExtras 11/11, settings 7/7 (1 skipped in the original suite).

## Issue found and fixed
1. **Wrong password logged the user out** (`frontend/src/api.ts`). Any HTTP 401 was treated as "session expired": token cleared and redirect to /login. But the backend also returns 401 for "Current password is incorrect" (Settings → change password), "Password is incorrect" (delete account) and the email-change password check, so a typo logged the user out and hid the message. Same for a failed login while a stale token was stored.
   Fix: only the auth middleware's own 401 (`error: "Unauthorized"`) ends the session. Backend auth is unchanged.

## Observations (not changed – would be design/feature changes or need a browser to verify)
- Mobile sidebar has no tap-outside backdrop; menu button has no aria-label; bell icon is decorative.
- Study plans may be created for past dates (treated as intended behavior).
- Not verifiable here: visual/responsive rendering, console errors, `tsc` type-check, live job/YouTube APIs. Run `npm run install-all`, `npm test --prefix backend`, `npm run build --prefix frontend` once on your machine.
