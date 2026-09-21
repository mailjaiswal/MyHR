// server/routes/notifications.js
// Email notification admin surface: SMTP settings, per-event toggles, the
// outbox ("Notification Log") view, a test-send endpoint, and the cron flush
// endpoint. Mounted at /api/v1/notifications.
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authGuard');
const { accessGuard, requirePerm } = require('../middleware/accessGuard');
const { cronGuard } = require('../middleware/cronGuard');
const { db } = require('../db/database');
const { sendMail, getNotificationSettings } = require('../services/mailer');
const { flushOutbox } = require('../services/notificationService');
const { EVENTS } = require('../services/emailTemplates');
const { audit } = require('../services/auditService');

const MASK = '********';

// Cron-invoked flush (registered before the auth chain; guarded by CRON_SECRET).
// Vercel cron issues GET; also accept POST for manual/toolbox triggers.
const flushHandler = async (req, res) => {
  const result = await flushOutbox();
  res.json({ success: true, ...result });
};
router.get('/flush', cronGuard, flushHandler);
router.post('/flush', cronGuard, flushHandler);

router.use(requireAuth, accessGuard);

// GET /api/v1/notifications/settings — SMTP config (password masked) + toggles.
router.get('/settings', requirePerm('SETTINGS_VIEW'), async (req, res) => {
  try {
    const s = await getNotificationSettings();
    let prefs = s.event_prefs;
    if (typeof prefs === 'string') { try { prefs = JSON.parse(prefs); } catch { prefs = {}; } }
    res.json({
      success: true,
      smtp: {
        host: s.smtp_host || '',
        port: s.smtp_port || null,
        user: s.smtp_user || '',
        password: s.smtp_password ? MASK : '',
        from: s.smtp_from || '',
        secure: s.smtp_secure !== 0
      },
      email_enabled: Number(s.email_enabled ?? 1) === 1,
      event_prefs: prefs || {},
      events: EVENTS,
      smtp_from_env: Boolean(process.env.SMTP_HOST)
    });
  } catch (e) {
    res.status(500).json({ error: 'NOTIF_SETTINGS_FAILED', message: e.message });
  }
});

// PUT /api/v1/notifications/settings
router.put('/settings', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const cur = await getNotificationSettings();
    const body = req.body || {};
    const smtp = body.smtp || {};

    const host = smtp.host !== undefined ? String(smtp.host).trim() : (cur.smtp_host || '');
    const port = smtp.port !== undefined ? (parseInt(smtp.port, 10) || null) : (cur.smtp_port || null);
    const user = smtp.user !== undefined ? String(smtp.user).trim() : (cur.smtp_user || '');
    const from = smtp.from !== undefined ? String(smtp.from).trim() : (cur.smtp_from || '');
    const secure = smtp.secure !== undefined ? (smtp.secure ? 1 : 0) : (cur.smtp_secure !== 0 ? 1 : 0);
    const password = smtp.password === undefined || smtp.password === MASK ? (cur.smtp_password || '') : String(smtp.password);
    const emailEnabled = body.email_enabled !== undefined ? (body.email_enabled ? 1 : 0) : Number(cur.email_enabled ?? 1);

    let prefs = cur.event_prefs;
    if (typeof prefs === 'string') { try { prefs = JSON.parse(prefs); } catch { prefs = {}; } }
    prefs = prefs || {};
    if (body.event_prefs && typeof body.event_prefs === 'object') {
      for (const [k, v] of Object.entries(body.event_prefs)) {
        if (EVENTS.includes(k) && typeof v === 'boolean') prefs[k] = v;
      }
    }

    await db.run(`
      INSERT INTO notification_settings (id, smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, smtp_secure, email_enabled, event_prefs, updated_at)
      VALUES ('main', ?, ?, ?, ?, ?, ?, ?, ?::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET
        smtp_host = EXCLUDED.smtp_host, smtp_port = EXCLUDED.smtp_port, smtp_user = EXCLUDED.smtp_user,
        smtp_password = EXCLUDED.smtp_password, smtp_from = EXCLUDED.smtp_from, smtp_secure = EXCLUDED.smtp_secure,
        email_enabled = EXCLUDED.email_enabled, event_prefs = EXCLUDED.event_prefs, updated_at = now()
    `, host, port, user, password, from, secure, emailEnabled, JSON.stringify(prefs));

    await audit(req, 'settings.notifications_update', {
      entityType: 'settings', entityId: 'notification_settings',
      summary: `Email notifications ${emailEnabled ? 'enabled' : 'disabled'} (SMTP host: ${host || 'unset'})`,
      details: { host, port, user, from, secure, email_enabled: !!emailEnabled }
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'NOTIF_SETTINGS_FAILED', message: e.message });
  }
});

// POST /api/v1/notifications/test — direct send so errors surface immediately.
router.post('/test', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  const to = String((req.body || {}).to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'INVALID_EMAIL', message: 'Provide a valid recipient address.' });
  }
  try {
    const { notify } = require('../services/notificationService');
    // Queue for the log + immediate direct send for instant feedback.
    await notify('test.email', { to, force: true });
    await sendMail({
      to,
      subject: 'myHR SMTP test email',
      html: '<p>This is a test notification from myHR. Your email settings are configured correctly.</p>',
      text: 'This is a test notification from myHR. Your email settings are configured correctly.'
    });
    await db.run(`UPDATE email_outbox SET status = 'SENT', attempts = attempts + 1, sent_at = now() WHERE to_email = ? AND event = 'test.email' AND status = 'PENDING'`, to);
    await audit(req, 'settings.notifications_test', { entityType: 'settings', entityId: 'notification_settings', summary: `Test email sent to ${to}` });
    res.json({ success: true, message: `Test email delivered to ${to}` });
  } catch (e) {
    await audit(req, 'settings.notifications_test', { entityType: 'settings', entityId: 'notification_settings', summary: `Test email to ${to} failed: ${e.message}`, details: { error: e.message } });
    res.status(502).json({ error: 'SMTP_SEND_FAILED', message: e.message });
  }
});

// GET /api/v1/notifications/outbox — recent notification log.
router.get('/outbox', requirePerm('SETTINGS_VIEW'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const status = req.query.status;
    let rows;
    if (status && ['PENDING', 'SENT', 'FAILED'].includes(String(status))) {
      rows = await db.all(`SELECT id, event, dedup_key, to_email, to_name, subject, status, attempts, last_error, created_at, sent_at FROM email_outbox WHERE status = ? ORDER BY created_at DESC LIMIT ?`, String(status), limit);
    } else {
      rows = await db.all(`SELECT id, event, dedup_key, to_email, to_name, subject, status, attempts, last_error, created_at, sent_at FROM email_outbox ORDER BY created_at DESC LIMIT ?`, limit);
    }
    const counts = await db.get(`
      SELECT COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
             COUNT(*) FILTER (WHERE status = 'SENT') AS sent,
             COUNT(*) FILTER (WHERE status = 'FAILED') AS failed
      FROM email_outbox
    `);
    res.json({ success: true, entries: rows, counts: { pending: Number(counts?.pending || 0), sent: Number(counts?.sent || 0), failed: Number(counts?.failed || 0) } });
  } catch (e) {
    res.status(500).json({ error: 'OUTBOX_QUERY_FAILED', message: e.message });
  }
});

// POST /api/v1/notifications/flush-now — manual drain from the admin UI.
router.post('/flush-now', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  const result = await flushOutbox(25);
  await audit(req, 'settings.notifications_flush', { entityType: 'settings', entityId: 'notification_settings', summary: `Manual outbox flush: ${result.sent} sent, ${result.failed} failed, ${result.pending} pending` });
  res.json({ success: true, ...result });
});

module.exports = router;
