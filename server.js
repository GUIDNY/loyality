// ══════════════════════════════════════════════════════
// Ten Dots — digital loyalty punch cards
//
// Entry point. Everything of substance lives in src/:
//   src/db.js            Postgres (Supabase) data access
//   src/auth.js          password hashing + signed sessions
//   src/views/           HTML rendering
//   src/wallet/          Apple + Google Wallet
//   src/routes/          route handlers
//
// The previous single-file version is kept as server.legacy.js.
// ══════════════════════════════════════════════════════
const express      = require('express');
const cookieParser = require('cookie-parser');

// Local development reads DATABASE_URL and friends from .env; on Vercel the
// platform injects them. process.loadEnvFile is a no-op if the file is absent.
if (!process.env.VERCEL) {
  try { process.loadEnvFile('.env'); } catch { /* no .env — fine */ }
}

const { notFound } = require('./src/views/card');

const app = express();
app.use(express.json({ limit: '1mb' })); // logo uploads are ~100KB data URLs
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.set('trust proxy', 1);

app.use(require('./src/routes/public'));
app.use(require('./src/routes/business'));
app.use(require('./src/routes/wallet'));

app.use((req, res) => res.status(404).send(notFound()));

app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.originalUrl, '—', err.stack || err.message);
  if (res.headersSent) return next(err);
  res.status(500).send(notFound());
});

if (!process.env.VERCEL) {
  const os = require('os');
  const localIP = () => {
    for (const ifaces of Object.values(os.networkInterfaces()))
      for (const i of ifaces) if (i.family === 'IPv4' && !i.internal) return i.address;
    return 'localhost';
  };
  const PORT = process.env.PORT || 3000;
  const IP = localIP();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  Ten Dots\n`);
    console.log(`   Landing:    http://${IP}:${PORT}`);
    console.log(`   Dashboard:  http://${IP}:${PORT}/dashboard\n`);
  });
}

module.exports = app;
