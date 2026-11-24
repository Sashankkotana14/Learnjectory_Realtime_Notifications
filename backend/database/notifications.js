// Notification storage schema (permanent). Idempotent and purely additive: one new table + one index. No existing table or row is touched.
//   notifications - one row per user per notification id. user_id -> users(id) ON DELETE CASCADE (rows disappear with the account).
//   UNIQUE(user_id, notif_id) = a notification is stored once; later syncs only refresh its text, never its read/cleared state.
module.exports = function notificationsSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,notif_id TEXT NOT NULL,kind TEXT NOT NULL DEFAULT '',title TEXT NOT NULL DEFAULT '',body TEXT NOT NULL DEFAULT '',link TEXT NOT NULL DEFAULT '',tag TEXT NOT NULL DEFAULT '',notif_at INTEGER NOT NULL DEFAULT 0,is_read INTEGER NOT NULL DEFAULT 0,is_cleared INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,notif_id));
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id,is_cleared)`);
};
