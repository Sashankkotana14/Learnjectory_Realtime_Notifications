require('dotenv').config();
const express = require('express'), cors = require('cors');
require('./database/db');
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' }); next(); });
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }), express.json({ limit: '100kb' }));
app.get('/api/health', (_, res) => res.json({ ok: true }));
app.use('/api', require('./routes/api'));
app.use((err, req, res, next) => {
  // body-parser problems (too large / bad JSON) are the client's fault: report them as 4xx instead of a generic 500
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'The upload is too large' });
  if (err && err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: err.type === 'entity.parse.failed' ? 'Invalid JSON body' : 'Bad request' });
  console.error(err); res.status(500).json({ error: 'Server error' });
});
module.exports = app;
if (require.main === module) app.listen(process.env.PORT || 5000, () => console.log('Learnjectory API on http://localhost:' + (process.env.PORT || 5000)));
