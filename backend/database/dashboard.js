// Dashboard integration schema (Opportunities / Community / Statistics / Data Boards).
// Idempotent and purely additive: one new table + read-performance indexes. No existing table or row is touched.
//   dashboard_boards - which Data Boards a user shows on the Dashboard and in which order.
//     user_id -> users(id) (ON DELETE CASCADE); UNIQUE(user_id, board_key) = one preference row per board per user.
module.exports = function dashboardSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS dashboard_boards(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,board_key TEXT NOT NULL,visible INTEGER NOT NULL DEFAULT 1,position INTEGER NOT NULL DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,board_key));
CREATE INDEX IF NOT EXISTS idx_dboard_user ON dashboard_boards(user_id);
CREATE INDEX IF NOT EXISTS idx_cpost_user ON community_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_ccom_user ON community_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_clike_user ON community_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_ccollab_user ON community_collab(user_id);
CREATE INDEX IF NOT EXISTS idx_vnote_user ON vault(user_id);
CREATE INDEX IF NOT EXISTS idx_clog_path ON career_study_logs(path_id)`);
};
