# Community likes & comments notifications
Adds only bell notifications for real Community activity. No existing module, table or endpoint was changed.

- Someone likes your post -> "Bob liked your post"
- Someone likes your comment/answer -> "Bob liked your comment" (shows the comment text)
- Someone comments on / answers your post -> "Bob commented on your post" / "Bob answered your question"
- Your own likes/comments never notify you. Un-liking or deleting a comment removes its notification. Only the last 14 days are listed.
- Uses the existing bell: unread badge, mark read, dismiss, "Mark all read", and Settings > Enable notifications. Click opens /community.
- The bell refreshes every 60 s, on tab focus, and on page navigation, so another student's like/comment appears shortly after it happens.

Files: backend/controllers/communityNotify.js (new, read-only GET /api/community/notifications), backend/routes/api.js (+1 route),
frontend/src/notifyExtras.ts (+communityNotifications), frontend/src/components/NotificationBell.tsx (small additions),
tests: backend/tests/communityNotify.test.js (8), frontend/tests/notifyExtras.test.ts (+2).
Tests: `cd backend && npm run test:commnotify`, `cd frontend && npm run test:notify`.
