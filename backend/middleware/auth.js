const jwt = require('jsonwebtoken'), crypto = require('crypto'), db = require('../database/db');
const WEAK = ['change_me_to_a_long_random_string', 'dev_secret', ''];
let secretVal = process.env.JWT_SECRET;
if (WEAK.includes(secretVal || '')) {
  if (process.env.NODE_ENV === 'production') { console.error('FATAL: set a strong JWT_SECRET in backend/.env'); process.exit(1); }
  // Dev/test: random per-process secret (sessions reset on restart) instead of a guessable default
  secretVal = crypto.randomBytes(48).toString('hex');
  console.warn('[auth] JWT_SECRET is not set to a strong value - using a temporary random secret. Set JWT_SECRET in backend/.env to keep sessions across restarts.');
}
exports.sign = u => jwt.sign({ id: u.id, tv: u.token_version || 0 }, secretVal, { expiresIn: '7d' });
exports.auth = (req, res, next) => {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  try {
    const p = jwt.verify(t, secretVal);
    const u = db.prepare('SELECT id,token_version FROM users WHERE id=?').get(p.id);
    if (!u || (u.token_version || 0) !== (p.tv || 0)) throw new Error('revoked');
    req.user = { id: u.id }; next();
  } catch { res.status(401).json({ error: 'Unauthorized' }); }
};
// Minimal in-memory rate limiter (per IP + route) for auth endpoints
const hits = new Map();
exports.rateLimit = (max, windowMs) => (req, res, next) => {
  if (process.env.NODE_ENV === 'test') return next();
  const key = req.ip + req.path, now = Date.now(), e = hits.get(key) || { n: 0, t: now };
  if (now - e.t > windowMs) { e.n = 0; e.t = now; }
  e.n++; hits.set(key, e);
  if (e.n > max) return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  next();
};
