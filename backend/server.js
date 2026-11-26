
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
require('./database/db');

const app = express();

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin'
  });
  next();
});

app.use(cors({
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : true
}));

app.use(express.json({ limit: '100kb' }));

// API routes
app.get('/api', (req, res) => {
  res.json({ ok: true, message: 'Learnjectory API is running!' });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api', require('./routes/api'));

// Serve frontend
const frontendPath = path.join(__dirname, '../frontend/dist');

app.use(express.static(frontendPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The upload is too large' });
  }

  if (err && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({
      error: err.type === 'entity.parse.failed'
        ? 'Invalid JSON body'
        : 'Bad request'
    });
  }

  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

module.exports = app;

if (require.main === module) {
  app.listen(process.env.PORT || 5000, () => {
    console.log('Learnjectory running on port ' + (process.env.PORT || 5000));
  });
}
