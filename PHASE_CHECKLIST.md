# Learnjectory - Phase checklist (after Part 2B Stage 1)

## Completed in 1A / 1B
- [x] Auth, data isolation, Dashboard, Academics, Assignments (1A)
- [x] Study Planner, My Goals, Growth Engine (1B)

## Completed in 2A
- [x] Career Compass: paths from templates or custom, goals + target dates, Beginner/Intermediate/Advanced stages, lessons + resources, YouTube search links (+ real YouTube API results when a key is set), lesson completion + progress, study-hour tracking
- [x] Projects & Skills: project CRUD (description, technologies, status), skill add/remove/edit, categories + levels, duplicate prevention, live statistics
- [x] Achievements: 24 data-driven achievements (Learning, Goals, Habits, Projects, Skills), locked/unlocked, progress, dates, icons, no duplicate unlocks, persistent history, read-only API
- [x] Dashboard connected to all three; all persisted in SQLite
- [x] Backend tests: 49 passing (see README for how they were run)

## Completed in 2B - Stage 1
- [x] Opportunities: PDF/DOCX resume upload + analysis (skills, education, projects, experience), real job listings (Remotive, Arbeitnow, optional Adzuna) with real apply links, saved jobs + status, filters, skill match + gaps, honest external search links when APIs are unavailable
- [x] Community: posts (discussion/question/collaboration), categories, edit/delete, comments/answers, likes, solved answers, collaboration requests, server-side permissions
- [x] My Vault: notes, folders, categories, tags, links, encrypted file uploads (PDF/DOCX/PPT/PPTX/images), validation, quotas, search, per-user isolation
- [x] Tests: 33 new controller/DB tests executed; 8 HTTP integration tests written (not executed in the build environment - no npm install possible); existing 49 tests not re-run in that environment
- [ ] Stage 2 (not started)

## Pending
- [ ] Analytics: charts do not yet include study-plan, habit, career-study or achievement data
- [ ] Notifications (bell) - e.g. a toast when an achievement unlocks, avatar upload, theme setting
- [ ] Career: no reordering of lessons, no editing of study logs (delete + re-add), no custom resource-type icons; YouTube API path not exercised against the live service
- [ ] Frontend automated tests (none), mobile/accessibility pass
- [ ] Vault encryption, httpOnly-cookie sessions, email verification / password reset, code-splitting
- [ ] Earlier 1B items: Study Planner calendar view / recurring plans, goal milestones, habit reminders
- [ ] `npm test` uses `NODE_ENV=test` inline syntax (works on macOS/Linux/Git Bash; on Windows cmd use `set NODE_ENV=test&& ...` or add cross-env)

## Dashboard integrations (added after 2B Stage 1)
- [x] Dashboard: Opportunities card, Community card, live Statistics (11 tiles, validated), Data Boards (deadlines, study 7 days, skills & projects, vault; per-user show/hide/order) - all from real database rows
- [x] New table `dashboard_boards` + indexes, new endpoints `/api/dashboard/*`, 20 new tests (`npm run test:dashboard`)
