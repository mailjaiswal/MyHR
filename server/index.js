require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const config = require('./config');
const { migrate } = require('./db/database');
const { getSettings } = require('./services/settingsService');

const app = express();

// Middleware
app.use(cors({
  // Allow all origins in dev; restrict to CORS_ORIGINS allowlist when configured.
  origin: config.CORS_ORIGINS.length
    ? (origin, cb) => (!origin || config.CORS_ORIGINS.includes(origin) ? cb(null, true) : cb(new Error('CORS blocked')))
    : true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logger for API calls
app.use((req, res, next) => {
  if (req.path !== '/api/v1/biometrics/stream') {
    console.log(`[${new Date().toLocaleTimeString('en-IN')}] ${req.method} ${req.path}`);
  }
  next();
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({
      status: 'HEALTHY',
      organization: settings.name,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (e) {
    res.status(500).json({ status: 'ERROR', error: e.message });
  }
});

// Mount Application Route Modules
app.use('/api/v1/auth', require('./routes/auth'));
const { router: biometricsRouter } = require('./routes/biometrics');
app.use('/api/v1/biometrics', biometricsRouter);
app.use('/api/v1/attendance', require('./routes/attendance'));
app.use('/api/v1/payroll', require('./routes/payroll'));
app.use('/api/v1/organization', require('./routes/organization'));
app.use('/api/v1/ingestion', require('./routes/ingestion'));
app.use('/api/v1/leaves', require('./routes/leaves'));
app.use('/api/v1/access', require('./routes/access'));
app.use('/api/v1/dashboard', require('./routes/dashboard'));
app.use('/api/v1/audit', require('./routes/audit'));
app.use('/api/v1/notifications', require('./routes/notifications'));
app.use('/api/v1/backup', require('./routes/backup'));

// Serve client production bundle if available
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', async (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), async (err) => {
    if (err) {
      const settings = await getSettings().catch(() => ({ name: 'MyHR' }));
      res.status(200).send(`${settings.name} Enterprise Biometric & Payroll API is running. Vite dev server runs on port 5173.`);
    }
  });
});

// Start Server (only if not running in a serverless environment like Vercel)
if (!process.env.VERCEL) {
  migrate()
    .then(() => {
      return getSettings();
    })
    .then((org) => {
      app.listen(config.PORT, () => {
        console.log(`=======================================================`);
        console.log(`🏢 ${(org.name || 'MyHR').toUpperCase()} - ${(org.tagline || 'Biometric & Payroll Platform').toUpperCase()}`);
        console.log(`🚀 Server listening on http://localhost:${config.PORT}`);
        console.log(`📡 Punch Webhook:           http://localhost:${config.PORT}/api/v1/biometrics/punch`);
        console.log(`   Data Source Sync:         http://localhost:${config.PORT}/api/v1/ingestion`);
        console.log(`=======================================================`);
      });

      const { startScheduler } = require('./services/syncEngine');
      startScheduler(1);

      // Notification outbox worker (on Vercel this runs via cron endpoints instead).
      const { flushOutbox, purgeAudit } = require('./services/notificationService');
      setInterval(() => { flushOutbox().catch(() => {}); }, 60 * 1000).unref();
      setInterval(() => { purgeAudit().catch(() => {}); }, 24 * 60 * 60 * 1000).unref();

      // Daily off-site backup worker (on Vercel this runs via cron instead).
      const { runBackup, pruneBackups } = require('./services/backupService');
      const runDailyBackup = () => { runBackup('AUTO', null).then(() => pruneBackups()).catch(() => {}); };
      setInterval(runDailyBackup, 24 * 60 * 60 * 1000).unref();
    })
    .catch((e) => {
      console.error('Database migration failed:', e.message);
      process.exit(1);
    });
}

module.exports = app;