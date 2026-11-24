# Settings module upgrade

Only the Settings module was changed. Every other page, route, table, style and row of data is untouched.

## What's new (Settings page)
- **Profile photo**: upload (click or drag & drop), automatic square crop + resize, preview before saving, replace, remove. Stored in the database per user (new `user_avatars` table); served only through the authenticated `GET /api/settings/avatar`. Real file-content check (JPG/PNG/WebP/GIF only, max 2 MB after resize; SVG rejected).
- **Profile details**: edit name, bio and email. Changing the email requires the current password and must be unique.
- **Appearance**: Light / Dark / System. Saved in `user_settings.theme` (so it follows the account) and cached in the browser for instant start-up. System follows the OS live. Light theme is scoped to `html[data-theme="light"]`; Dark is the unchanged original design.
- **Notifications** switch (auto-saved).
- **Security**: change password (existing endpoint), sign out of all devices.
- **Your data**: download everything stored for your account as JSON (no password hash, no photo bytes, no vault storage names).
- **Delete account**: password + typing DELETE; removes only that user's rows and encrypted vault files.

## Files
Added: `backend/controllers/settings.js`, `backend/tests/settings.test.js`, `frontend/src/settings/theme.ts`, `frontend/src/settings/settings.css`.
Replaced: `frontend/src/pages/Settings.tsx`.
Wired in (additive only): one `require` + 3 route lines in `backend/routes/api.js`; a `test:settings` script and the new test file in `backend/package.json`.

## New API (all need `Authorization: Bearer <token>`)
`GET|PUT /api/settings/profile`, `PUT /api/settings/preferences`, `GET|POST|DELETE /api/settings/avatar`, `POST /api/settings/sign-out-everywhere`, `GET /api/settings/export`, `DELETE /api/settings/account`.
The original `GET|PUT /api/settings` and `PUT /api/auth/password` are unchanged.

## Tests
`cd backend && npm run test:settings` (needs only Node 22+). Also included in `npm test`.

## Update: academic profile, username, logout
- New profile fields (saved via `PUT /api/settings/profile`, returned by `GET /api/settings/profile`): `username` (3-30 chars, letters/numbers/dot/underscore, unique case-insensitively, optional), `college`, `course`, `branch` (max 120 chars each), `year_of_study` (1-6 or Other).
- Schema: five additive columns on `users` plus a partial unique index on `LOWER(username)`, created automatically on start by `backend/controllers/settings.js`. Existing users and data are untouched (new fields start empty).
- Email is shown from the account record; changing it still requires the current password.
- Settings page now has a Log out section (server-side token revocation, same as the sidebar button).
- Changed in this update: `backend/controllers/settings.js`, `backend/tests/settings.test.js`, `frontend/src/pages/Settings.tsx`, this file. Nothing else.
- Original project backup: `Learnjectory_ORIGINAL_BACKUP.zip` (shipped next to the project folder).
