# Career Compass upgrade (only module changed)

Files touched: `backend/controllers/career.js`, `backend/routes/api.js` (new career routes only), `backend/database/db.js` (additive columns only), `frontend/src/pages/Career.tsx`, `backend/tests/careerUpgrade.test.js` (new), `backend/package.json` (`test:career` script).

## 1. YouTube resource discovery
- Search box accepts a keyword or a pasted YouTube link (watch, youtu.be, shorts, embed). Pasted links work without an API key.
- With `YOUTUBE_API_KEY` set: 8 results per page + "Load more videos". Without a key: a working youtube.com search link.
- Every lesson has "Find videos" (pre-fills its search) and each result can be **attached to a lesson** (thumbnail + inline player via youtube-nocookie) or added as a new lesson. Videos can be detached.
- API: `GET /career/youtube?q=&pageToken=`, `GET /career/youtube/resolve?url=`, `PUT|DELETE /career/lessons/:id/video`.

## 2. Lesson reordering
- Drag and drop (desktop) or up/down arrows (touch) inside a stage. Only positions of that stage's lessons are swapped; ids, completion, progress and other stages are untouched.
- API: `PUT /career/paths/:id/lessons/reorder {stage, order:[ids]}`, `POST /career/lessons/:id/move {direction}`.

## 3. Study log management
- Edit any log (minutes, date, lesson, note), delete with confirmation, filter by date range / lesson / note text, totals for the filtered set, "Load more" paging. Same rules as creating: no future dates, max 24h per day.
- API: `GET /career/paths/:id/study?from&to&lesson_id&q&limit&offset`, `PUT /career/study/:id`.

## 4. Data preservation
Database changes are additive `ALTER TABLE ... ADD COLUMN` migrations (lesson video fields, log `updated_at`); no existing row is rewritten. Existing endpoints and response fields are unchanged (lessons only gain a `video` field).

Tests: `cd backend && npm run test:career` (15 tests).
