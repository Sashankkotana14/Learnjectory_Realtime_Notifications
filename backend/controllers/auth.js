const bcrypt = require('bcryptjs'), db = require('../database/db'), { sign } = require('../middleware/auth');
const pub = u => ({ id: u.id, name: u.name, email: u.email, bio: u.bio });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
exports.register = (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80), email = String(req.body.email || '').trim().toLowerCase(), password = String(req.body.password || '');
  if (!name || !EMAIL.test(email) || password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Name, a valid email and a password of 8+ characters are required' });
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'Email already registered' });
  const id = db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(name, email, bcrypt.hashSync(password, 12)).lastInsertRowid;
  db.prepare('INSERT INTO user_settings(user_id) VALUES(?)').run(id);
  db.prepare('INSERT INTO activity_logs(user_id,message) VALUES(?,?)').run(id, 'Joined Learnjectory');
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  res.json({ token: sign(u), user: pub(u) });
};
exports.login = (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.password)) return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: sign(u), user: pub(u) });
};
exports.me = (req, res) => res.json(pub(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)));
exports.getSettings = (req, res) => {
  const u = db.prepare('SELECT name,email,bio FROM users WHERE id=?').get(req.user.id);
  res.json({ ...u, ...db.prepare('SELECT notifications,theme FROM user_settings WHERE user_id=?').get(req.user.id) });
};
exports.putSettings = (req, res) => {
  const { name, bio, notifications, theme } = req.body;
  db.prepare('UPDATE users SET name=COALESCE(?,name),bio=COALESCE(?,bio) WHERE id=?').run(name ?? null, bio ?? null, req.user.id);
  db.prepare('UPDATE user_settings SET notifications=COALESCE(?,notifications),theme=COALESCE(?,theme) WHERE user_id=?').run(notifications ?? null, theme ?? null, req.user.id);
  exports.getSettings(req, res);
};

// Logout: bump token_version so every previously issued token for this user stops working
exports.logout = (req, res) => { db.prepare('UPDATE users SET token_version=COALESCE(token_version,0)+1 WHERE id=?').run(req.user.id); res.json({ ok: true }); };
exports.changePassword = (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(String(currentPassword || ''), u.password)) return res.status(401).json({ error: 'Current password is incorrect' });
  if (String(newPassword || '').length < 8) return res.status(400).json({ error: 'New password must be 8+ characters' });
  db.prepare('UPDATE users SET password=?,token_version=COALESCE(token_version,0)+1 WHERE id=?').run(bcrypt.hashSync(newPassword, 12), req.user.id);
  const n = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  res.json({ token: sign(n), user: pub(n) });
};
