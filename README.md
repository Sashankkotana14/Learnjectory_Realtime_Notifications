# Learnjectory – Your Growth Space (Full-Stack)

React + Vite + TypeScript + Tailwind + Lucide + Recharts frontend, Node/Express REST API with JWT + bcrypt, SQLite database (better-sqlite3).

## Setup (Windows / VS Code)
Requires Node.js 18+ (20 or 22 LTS recommended).

1. Open the `Learnjectory` folder in VS Code, then open a terminal in it.
2. Install everything: `npm run install-all`
3. Start both servers: `npm run dev`
4. Open http://localhost:5173

Demo login (not pre-filled any more): **demo@learnjectory.com / demo1234** (seeded only when `SEED_DEMO` is not `false`). New registrations (8+ char password) start with an empty dashboard (0% / 0 goals, like the reference).

Run separately if you prefer: `cd backend && npm start` (port 5000) and `cd frontend && npm run dev` (port 5173).

## Config
`backend/.env` (copy of `.env.example`): `PORT`, `JWT_SECRET` (a random one is included - replace it for any deployment; the server refuses weak secrets when `NODE_ENV=production`), `SEED_DEMO`, optional `CORS_ORIGIN`, `DB_PATH`.
The database file `backend/database/learnjectory.db` is created and seeded automatically on first start. Delete it to reset.

## Structure
- `backend/models/resources.js` – table definitions (academics, assignments, study_sessions, goals, habits, projects, skills, achievements, opportunities, community_posts, vault) + `users`, `user_settings`, `activity_logs` in `database/db.js`
- `backend/controllers` – auth/settings, generic CRUD, dashboard/analytics stats
- `backend/routes/api.js` – all REST routes under `/api`
- `frontend/src/config.ts` – sidebar + per-page field config; `pages/` – Dashboard, Resource (CRUD for 10 pages), Analytics, Settings, Search, Login

## API
`POST /api/auth/register|login`, `GET /api/auth/me`, `GET|PUT /api/settings`, `GET /api/dashboard|activity|analytics|search?q=`,
and for each resource `GET|POST /api/:resource`, `PUT|DELETE /api/:resource/:id` (resources: academics, assignments, study_sessions, goals, habits, projects, skills, achievements, opportunities, community_posts, vault). All except auth need `Authorization: Bearer <token>`.

## Troubleshooting
If `better-sqlite3` fails to install, make sure you're on a Node LTS version (prebuilt binaries are downloaded for these).

## Phase 1A changes
- **Auth**: emails normalised, 8+ char passwords (bcrypt cost 12), rate-limited login/register, `POST /api/auth/logout` revokes every token of that user (token versioning), `PUT /api/auth/password`, no weak default JWT secret, no prefilled credentials, basic security headers, resource names whitelisted (blocks `constructor`/`__proto__` style names).
- **Data isolation**: every query is scoped by `user_id`; covered by tests.
- **Validation**: server-side type/range/date/enum checks on all resources (progress 0-100, valid dates, grade letters, attended <= total...).
- **DB migrations**: new columns are added automatically to an existing `learnjectory.db` (no data loss).
- **Dashboard** (`GET /api/dashboard`): personalised greeting, academic stats (progress, credits, attendance), assignment summary + next assignment with priority, goals, study-week progress, activity - all computed from the database.
- **Academics** (`GET /api/academics` -> `{subjects, summary}`): subjects, current/target grade, credits, attendance (attended/total), GPA estimate (4.0 scale) and low-attendance (<75%) warnings.
- **Assignments** (`GET /api/assignments?status=&priority=&subject=&q=&sort=due|priority|title|subject|created&dir=asc|desc` -> `{assignments, summary, subjects}`): automatic priority - High 0-2 days, Medium 3-5, Low 6+, Overdue after the due date, Completed when done (never stored, always computed).
- Fixed pre-existing build bug (`postcss.config.js` was CommonJS in an ESM package).

## Phase 1B changes (Study Planner, My Goals, Growth Engine)
Built on top of 1A - auth, schema, sidebar order and the other modules are untouched. New tables are created automatically and existing `learnjectory.db` files are migrated in place (no data loss).

- **Study Planner** (`/planner`): plans -> sessions (one per subject). Subjects are the Academics subjects; typing a new name creates it (case-insensitive match, no duplicates). Total time = hours + minutes; it is split equally and the remainder goes one minute at a time to the first subjects (100 min / 3 = 34/33/33, always sums exactly). Allocations can be edited but the sum can never exceed the plan total (server-enforced, UI clamps); completed sessions are locked; "share remaining time equally" is available. Sessions: Start (only one running at a time) -> Complete -> Reset. Progress = completed allocated minutes / allocated minutes.
  `GET|POST /api/study-plans`, `GET|PUT|DELETE /api/study-plans/:id`, `POST /api/study-plans/:id/items/:itemId/start|complete|reset`
- **My Goals** (`/goals`): add/edit/delete, visual calendar date picker, past target dates rejected (API + picker), days remaining (computed from the server date), progress 0-100, completion date set automatically at 100%, status active/completed/overdue.
  `GET /api/goals?status=&q=` -> `{goals, summary}`, `POST|PUT|DELETE /api/goals[/:id]`
- **Growth Engine** (`/growth`): daily habits with category + daily target, per-day logs, current/longest streak, weekly tracker (Mon-Sun, click a day to toggle), 30-day history. One log row per habit per date is guaranteed by a `UNIQUE(habit_id, log_date)` constraint + upsert. A day is complete when count >= daily target (derived, so changing the target re-evaluates history). A streak stays alive until the end of today.
  `GET|POST /api/habits`, `PUT|DELETE /api/habits/:id`, `POST /api/habits/:id/logs {date?,count?,increment?}`, `DELETE /api/habits/:id/logs/:date`, `GET /api/habits/:id/history?days=`
- **Dashboard** now reads all three from the database: active goals + days left, habits done today + best streak, Today's Focus (running/next study session) and weekly study progress.
- Upgrade notes: legacy `habits.done_today/streak` and `study_sessions` are kept for compatibility but no longer drive the habit UI; old habit streaks are not carried over (streaks are now computed from daily logs). Legacy `study_sessions` rows still count in the dashboard weekly study stats.

## Phase 2A changes (Career Compass, Projects & Skills, Achievements)
Built on top of 1A/1B - existing modules, routes and data are untouched. New tables/columns are created and migrated automatically on start (no data loss).

- **Career Compass** (`/career`): career paths with a goal name and target date (past dates rejected). Start from a template (Full-Stack Web, Data Science, Software Engineering & Algorithms, Cybersecurity - 12 lessons each) or build a custom path. Every path has Beginner / Intermediate / Advanced stages; lessons carry a resource link + type, an estimated time and a **working YouTube search link**. Completing/reopening a lesson updates stage and overall progress. Study hours are logged per path (optionally per lesson; no future dates, max 24 h/day) with weekly and total figures.
  `GET /api/career/templates|paths|paths/:id|youtube?q=`, `POST|PUT|DELETE /api/career/paths[/:id]`, `POST /api/career/paths/:id/lessons|study`, `PUT|DELETE /api/career/lessons/:id`, `POST /api/career/lessons/:id/complete {completed?}`, `DELETE /api/career/study/:id`
- **YouTube discovery**: with `YOUTUBE_API_KEY` in `backend/.env` (YouTube Data API v3) the *Find videos* box returns real videos (title, channel, thumbnail, link) that can be added as lessons. Without a key (or if YouTube is unreachable) it returns a working `youtube.com/results?search_query=...` link instead. The key never leaves the server.
- **Projects & Skills** (`/projects`): projects with description, technologies (deduplicated, max 20), status (planning / active / on hold / completed), optional link; completion date is set automatically. Skills have a category and a level (Beginner / Intermediate / Advanced / Expert, stored as the existing 0-100 `level`). Skill names are unique per user (case/space-insensitive, 409 on duplicates, also on rename). Statistics (counts by status, completion rate, technologies, skills by category/level) are computed live; technologies used in projects but missing from skills are offered as one-click additions.
  `GET|POST /api/projects`, `PUT|DELETE /api/projects/:id`, `GET|POST /api/skills`, `PUT|DELETE /api/skills/:id`
- **Achievements** (`/achievements`): 24 rule-based achievements in Learning, Goals, Habits, Projects and Skills, evaluated from the real data (lessons done, study minutes incl. completed planner sessions, goals created/completed, habit streaks/completions, projects, skills). Unlocks are stored in `achievement_unlocks` with `UNIQUE(user_id,key)` (no duplicates, even under concurrency), keep their unlock date and are never removed - deleting the underlying data does not take an achievement back. They are re-checked after every successful write (`routes/api.js` hook), on the Dashboard and on `GET /api/achievements`. Locked ones show live progress. The API is read-only (`POST/PUT/DELETE /api/achievements` -> 405).
- **Dashboard** now shows career progress + next lesson + study time, project and skill counts, and achievements unlocked/total with the latest unlock.
- **Upgrade notes**: the two fake demo achievements seeded in 1B ("First 7-day streak", "Dean's List") are deleted on start (exact match only); any achievement rows you typed in by hand in the old generic page stay in the legacy `achievements` table but are no longer shown or counted. Existing skills get category "Other".

## Phase 2B changes - Stage 1 (Opportunities, Community, My Vault)
Built on top of 1A/1B/2A. Existing modules, routes, sidebar order and data are untouched. New tables are created and existing tables extended automatically on start (existing `vault` notes and `community_posts` are kept and upgraded in place). The invented demo rows that earlier phases seeded for these three pages (3 fake opportunities, 2 demo posts, 1 demo vault note) are no longer seeded and are removed on start (exact-match only; anything you typed yourself stays).

- **Opportunities** (`/opportunities`): upload a **PDF or DOCX resume** (<= 5 MB; type is checked by extension *and* file content) or paste its text. The server extracts **skills, education, projects and experience** (heuristic, heading-based; dictionary of ~150 skills, plus anything listed in a "Skills" section). Contact details are not extracted and the file itself is not stored - only the analysis. DOCX is read with a built-in ZIP/XML reader. PDF uses `pdf-parse` when installed (listed in `package.json`) and otherwise a built-in reader that only understands simple PDFs; if a PDF cannot be read you get a clear error (never garbage) and can upload DOCX or paste text. Resume skills can be copied into *Projects & Skills* (as Beginner).
  **Jobs are real**: fetched live from Remotive and Arbeitnow (no key) and, optionally, Adzuna (`ADZUNA_APP_ID/KEY`). Each listing has its original apply link and source label; listings without a link are dropped; responses are cached (30-60 min) to respect the providers' limits (Remotive: listings are delayed 24 h and must be attributed). Filters: keywords, location, remote, minimum skill match, sort by match/date. Each job shows **match %, matched skills and missing skills**; the "Skill gaps" tab aggregates missing skills over your saved jobs with tutorial-search links. **If the APIs are unreachable or nothing matches, no listings are invented**: you get an honest message plus search links to LinkedIn, Indeed, Google Jobs, Glassdoor, Internshala and Naukri. Jobs found elsewhere can be added manually (title + real link). Saved jobs have a status tracker (saved/applied/interviewing/offer/rejected) and notes.
  `POST /api/opportunities/resume?name=cv.pdf` (raw body), `POST .../resume/text {text}`, `GET .../resume`, `DELETE .../resume/:id`, `POST .../resume/import-skills`, `GET .../jobs?q=&location=&remote=&min_match=&sort=&page=`, `GET .../skill-gaps`, `GET|POST .../saved`, `PUT|DELETE .../saved/:id`
- **Community** (`/community`): posts of three kinds - *discussion*, *question* and *collaboration* - with categories, tags, search, filters (category/type/mine/solved/unanswered) and sorting. Create/edit/delete posts, comments (answers on questions) and likes (toggle, one per user). The author of a question can **mark an answer as the solution** (shown first; deleting that answer re-opens the question). Collaboration posts list needed skills and team size; others send a join request, only the post author sees request messages and can accept/decline (team-size limit enforced), requesters can withdraw. **Permissions are enforced on the server**: anyone signed in can read; only authors can edit/delete their posts/comments (403 otherwise); only the question author can solve/re-open; only the collaboration owner can decide requests. Deleting a post removes its comments, likes and requests.
  `GET /api/community/meta|posts|posts/:id`, `POST|PUT|DELETE /api/community/posts[/:id]`, `POST .../posts/:id/like|comments|collab`, `POST|DELETE .../posts/:id/solve`, `PUT|DELETE .../comments/:id`, `POST .../comments/:id/like`, `PUT|DELETE .../collab/:id`
- **My Vault** (`/vault`): private **notes**, **saved links**, **folders**, free-text **categories** and **tags**, and **file uploads** (PDF, DOCX, PPT, PPTX, PNG, JPG, GIF, WEBP; SVG/HTML are refused). Search across titles, note text, file names, descriptions, URLs, tags; filter by folder/category/tag/type; sort. Files: type validated by extension **and magic bytes**, max 10 MB each (`VAULT_MAX_MB`), 200 MB per user (`VAULT_QUOTA_MB`), stored under random names in a per-user folder, **encrypted at rest (AES-256-GCM)** with the ciphertext bound to the owner, downloaded only through an authenticated route that re-checks ownership (another user's file looks like a missing one: 404), served with `nosniff`, `attachment` (inline only for PDFs/images) and `no-store`. Deleting a folder keeps its items (moved to Unfiled).
  `GET /api/vault?q=&folder_id=&category=&tag=&type=&sort=`, `POST|PUT|DELETE /api/vault/notes|folders|links[/:id]`, `POST /api/vault/files?name=&folder_id=&category=&tags=&description=` (raw body), `GET /api/vault/files/:id/download[?inline=1]`, `PUT|DELETE /api/vault/files/:id`
- **Honest limits**: resume parsing is heuristic (unusual layouts may miss entries); skill matching only knows the built-in dictionary; job coverage is limited to the connected free sources (Remotive = remote jobs, Arbeitnow = mostly Europe); vault notes/links are stored in SQLite unencrypted (only files are encrypted); the encryption key lives in `VAULT_KEY` or `storage/vault/.vault.key` - **back it up, losing it makes files unreadable**; Analytics and the Dashboard do not yet include the new modules.
- **Install note**: `pdf-parse` was added to `backend/package.json`; run `npm install` in `backend` (the lock file will be updated by npm).

## Tests
Part 2B adds `tests/part2b.unit.test.js` (33 tests; controllers + real SQLite + real DOCX/PDF fixtures; runs with plain Node via `npm run test:2b-unit` even without `npm install`, using `tests/_shims` stand-ins for `better-sqlite3`/`bcryptjs` that are only used when the real packages are missing) and `tests/part2b.test.js` (HTTP integration tests with real Express/JWT; needs `npm install`). `npm test` runs everything.

`cd backend && npm test` (49 tests: 11 from 1A + 18 for 1B + 20 for 2A; 1B covered time distribution, remainder handling, allocation limits, session flow, goal date rules, habit duplicate prevention, streaks, week/month/year/leap-day date handling, isolation, dashboard wiring, persistence; 2A covers career flow/progress/study hours/YouTube (mocked API), projects, skills + duplicates, achievements unlock/no-duplicate/history, isolation, dashboard wiring, on-disk persistence). Frontend: `cd frontend && npm run build` (type-check + production build).

## Combined build (2A + 2B) and dark purple redesign
- Base: the 2B code, which already contains every 2A module and file (verified by a file-by-file diff, see `FEATURE_PRESERVATION_REPORT.md`). Nothing from 2A was dropped.
- Theme: design tokens in `frontend/src/index.css` (`--bg0`, `--card`, `--primary`, `--pink`, `--cyan`, ...). `frontend/tailwind.config.js` remaps the legacy `sky`/`indigo`/`blue` palettes to purple/violet, so every page, form, modal, chart and badge picks up the new theme with no behaviour change.
- Dashboard greeting: "Hello, <first name>! ✨" comes from the authenticated user's profile (`GET /api/dashboard` -> `user.name`); falls back to "Hello!" if no name exists.

### Windows PowerShell
```powershell
cd Learnjectory_Combined_Complete
Copy-Item backend\.env.example backend\.env   # then set JWT_SECRET to a long random value
npm run install-all
npm run dev                                    # API :5000, web :5173
cd backend; npm test                           # backend test suites
```
Deployment: set `NODE_ENV=production`, a strong `JWT_SECRET`, `VAULT_KEY` (back it up), optional `YOUTUBE_API_KEY`, `ADZUNA_APP_ID/KEY`; build the web app with `npm run build --prefix frontend` and serve `frontend/dist` behind a proxy to `/api`.

## Analytics upgrade
Only the Analytics module changed (`backend/controllers/analytics.js`, the `/api/analytics` route line in `routes/api.js`, `frontend/src/pages/Analytics.tsx`, `backend/tests/analytics.test.js`, two test scripts in `backend/package.json`). No new tables, no schema change, existing data untouched.

`GET /api/analytics?range=week|month|overall&offset=0|-1|-2...` (default `overall`; `offset` steps back through weeks/months, never into the future). Everything is computed live from academics, assignments, study planner + legacy study sessions, Career Compass, goals, habits/habit logs and projects. The original keys (`subjects`, `assignments`, `study`, `skills`) are still returned unchanged and still drive the four original charts, shown under "Existing insights".

| Section | Response key | Follows the filter? |
|---|---|---|
| Attendance by subject | `attendance` | No - all-time snapshot (attendance has no dates); 75% threshold marked |
| Current vs target grade | `grades` | No - current snapshot; GPA from the same 4.0 scale as Academics |
| Study hours | `studyHours` | Yes - completed planner sessions (by completion date) + completed legacy sessions + Career Compass study logs; per day (week/month) or per week/month bucket (overall); by subject and source; plan adherence |
| Habit completion trends | `habitTrends` | Yes - a habit-day counts when logged count >= daily target; a habit is only counted from the day it started |
| Weekly habit activity | `weeklyHabits` | Yes - habit x weekday heat grid (exact dates for a week, counts per weekday for month/overall) |
| Goals completed vs ongoing | `goals` | Yes - completed in the period, ongoing/overdue as of the period end |
| Overdue assignments | `overdueAssignments` | Yes - assignments due in the period; overdue = not done and past due; late vs on-time; ageing buckets |
| Project performance | `projects` | Partly - started/completed in the period; status counts are each project's current status |
| Overall learning progress | `learning` | Yes - average of the areas that have data (academics, assignments, goals, habits, plan adherence, career lessons, projects) |

Weekly = Monday-Sunday, Monthly = calendar month, both with previous/next arrows; weekly/monthly also return `comparison` (previous period) for the trend arrows. Every section returns `hasData` and the page shows an empty state with a link to the relevant module.

Tests: `cd backend && npm run test:analytics` (12 tests, needs only Node), also part of `npm test`. Frontend: `cd frontend && npm run build`.

## Dashboard integrations (Opportunities, Community, Statistics, Data Boards)
Additive upgrade of the **Dashboard only**. Every other module, route, table, row and screen is unchanged; the original Dashboard cards are untouched and the new sections are appended below them. Everything is read from the database on each request - there is no dummy data, and an account with no data shows zeros / "-" / friendly empty states.

- **Opportunities card**: latest resume (file, skills/projects counts), saved-job pipeline (saved / applied / interviewing / offer / rejected), interview rate, average skill match, the 4 newest saved jobs with their match %, and the skills your saved jobs ask for that you don't have yet. Reads `resumes` + `saved_jobs` (+ your skills). No external job API is called by the Dashboard.
- **Community card**: your posts, comments, likes received (your own likes excluded), solved questions, pending join requests on your collaboration posts, community-wide open/unanswered questions and teams recruiting, and the latest 4 posts. Reads `community_posts / comments / likes / collab`.
- **Your Statistics** (11 tiles): study time (career study logs + completed planner sessions + completed legacy sessions), assignments done, attendance, goals completed, 7-day habit consistency, career lessons, average skill level, projects completed, interview rate, community activity, vault items. Validity rules: a ratio with no data is `null` (shown as "-", never 0% or NaN), percentages are clamped to 0-100, counts are never negative.
- **Data Boards** (choose and reorder with *Customize*; saved per user): Upcoming Deadlines (assignments + goals + career paths, soonest first, overdue flagged), Study Time - last 7 days, Skills & Projects, My Vault (counts, encrypted-storage usage, latest items; file names only, never contents).
- **New table**: `dashboard_boards(id, user_id -> users.id ON DELETE CASCADE, board_key, visible, position, updated_at, UNIQUE(user_id, board_key))`, created automatically on start; plus read indexes on `community_posts/comments/likes/collab(user_id)` and `vault(user_id)`. Existing databases are upgraded in place without data loss.
- **API**: `GET /api/dashboard` now also returns `opportunities`, `community`, `statistics`, `boards` (all existing keys unchanged). Separate endpoints: `GET /api/dashboard/opportunities|community|statistics|boards`, `PUT /api/dashboard/boards {boards:[{key,visible}]}` (array order = display order; unknown/duplicate keys -> 400).
- **Code**: `backend/controllers/dashboardData.js`, `backend/database/dashboard.js`, `frontend/src/components/DashboardExtras.tsx`; hooks: one line each in `stats.js`, `routes/api.js`, `database/db.js`, `pages/Dashboard.tsx`.
- **Tests**: `cd backend && npm run test:dashboard` (20 tests, real controllers + real SQLite; also part of `npm test`).

## Study Planner additions (Calendar, Recurring Plans, Goal Milestones, Habit Reminders)
Only the Study Planner (`/planner`) was extended - it now has tabs: **Plans** (the existing page, unchanged), **Calendar**, **Recurring**, **Milestones**, **Reminders**. No other page, route, table or column was modified; new tables are created automatically on start (`CREATE TABLE IF NOT EXISTS`), so existing `learnjectory.db` files keep all their data.

- **Calendar** - month grid (Mon-Sun) showing study plans, upcoming recurring occurrences, assignments due, legacy study sessions and goal milestones; click a day for details. `GET /api/planner/calendar?from=&to=` (max 100 days).
- **Recurring plans** - daily, weekly (chosen weekdays) or custom (every N days / every N weeks on chosen weekdays), optional end date, pause/resume/edit/delete. Occurrences for the next 14 days become real study plans (so Start/Complete/progress/dashboard work on them); later ones show on the calendar as "upcoming". A plan you delete is never re-created; editing or deleting a rule rebuilds/removes only sessions that have not been started.
  `GET|POST /api/planner/recurrences`, `PUT|DELETE /api/planner/recurrences/:id`
- **Goal milestones** - add, rename, due date (not in the past, not after the goal's target date), complete/reopen, delete, per-goal milestone progress. Milestones are removed with their goal; a goal's own progress (My Goals) is never changed by milestones.
  `GET /api/planner/goals`, `POST /api/planner/goals/:goalId/milestones`, `PUT|DELETE /api/planner/milestones/:id`
- **Habit reminders** - per-habit time (HH:MM) + weekdays (none = every day), on/off, up to 5 per habit. While the Study Planner page is open a due reminder shows as a banner (with "Mark done", which uses the normal habit log) and, if allowed, a browser notification; each reminder fires once per day and is skipped if the habit is already done.
  `GET|POST /api/planner/reminders`, `PUT|DELETE /api/planner/reminders/:id`, `GET /api/planner/reminders/due?date=&time=`, `POST /api/planner/reminders/:id/ack`
- Files: `backend/controllers/plannerExtras.js`, `frontend/src/components/PlannerExtras.tsx`, tests in `backend/tests/plannerExtras.test.js` (`cd backend && NODE_ENV=test node --test tests/plannerExtras.test.js`).
