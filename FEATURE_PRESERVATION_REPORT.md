# Feature Preservation Report - Learnjectory 2A + 2B

## Method
Both ZIPs were extracted side by side and compared with `diff -rq`. 2B contains all 56 source files of 2A (plus 20 more); every file that differs was read line by line.
Only 2A-exclusive item: `backend/.env` (contains a JWT secret; intentionally NOT shipped - use `.env.example`).

## Differences that matter
| File | 2A | 2B | Resolution |
|---|---|---|---|
| `database/db.js` | seeds fake opportunities, community posts, vault note | loads `part2b.js`, no fake seeds | 2B kept (fake rows conflict with "no invented data") |
| `routes/api.js` | 2A routes | same + Opportunities/Community/Vault routes | 2B kept (superset) |
| `server.js` | generic 500 handler | adds 413/4xx handling | 2B kept |
| `frontend/api.ts`, `main.tsx` | base | adds `upload`, `fetchBlob`, `ago`, 3 routes | 2B kept |
| `package.json` (backend) | no `pdf-parse` | adds `pdf-parse`, extra tests | 2B kept |

## Features
| Feature | Source | Integrated | Tested here? | Notes |
|---|---|---|---|---|
| Auth, profile, settings, logout/token revocation | Both | Yes | No (needs install) | unchanged |
| Dashboard (+ new personalized greeting) | Both | Yes | Syntax only | greeting uses real profile name; fallback "Hello!" |
| Academics, Assignments | Both | Yes | No | unchanged |
| Study Planner, My Goals, Growth Engine/Habits | Both | Yes | No | unchanged |
| Career Compass (templates, lessons, study log, YouTube) | Both | Yes | No | optional `YOUTUBE_API_KEY` |
| Projects & Skills, Achievements (24 rules) | Both | Yes | No | unchanged |
| Analytics, Search | Both | Yes | No | chart colors recolored |
| Opportunities (resume parse, live jobs, saved jobs, gaps) | 2B only | Yes | Unit tests only | needs internet; optional Adzuna |
| Community (posts, comments, likes, solve, collab) | 2B only | Yes | Unit tests only | |
| My Vault (notes, links, folders, encrypted files) | 2B only | Yes | Unit tests only | back up `VAULT_KEY` |
| Dark purple theme, all pages | New | Yes | NOT visually verified | no screenshot supplied; no browser run |

## Tests actually executed
- `node --check` on all backend JS: pass.
- Parse check of all 24 frontend TS/TSX files: 0 syntax errors.
- `npm run test:2b-unit` (33 tests, shimmed sqlite/bcrypt): 33 pass, 0 fail.

## NOT executed (limitations)
- `npm install`, backend start, frontend build/dev, HTTP integration tests (`api`, `part1b`, `part2a`, `part2b`): this environment has no network access, so `better-sqlite3`, express, vite etc. could not be installed.
- No browser run: console errors, responsive layouts, and visual match are unverified.
- The reference screenshot was not in the upload (only the two ZIPs), so the palette follows your written spec.
- Dashboard/Analytics do not yet include Opportunities/Community/Vault data (a limitation inherited from 2B).
- A TypeScript type-check (`tsc`) was not possible without installed dependencies.
