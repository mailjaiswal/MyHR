// server/services/mailer.js
// Thin Nodemailer wrapper. Transport config comes from the DB row
// 'notification_settings' (Admin Panel), with SMTP_* environment variables
// taking precedence so Vercel secrets can override stored values.
const nodemailer = require('nodemailer');
const { db } = require('../db/database');

async function getNotificationSettings() {
  const row = await db.get('SELECT * FROM notification_settings WHERE id = ?', 'main');
  return row || {};
}

// Resolve effective SMTP config: env vars win over stored settings.
async function getSmtpConfig() {
  const s = await getNotificationSettings();
  return {
    host: process.env.SMTP_HOST || s.smtp_host || '',
    port: parseInt(process.env.SMTP_PORT || s.smtp_port || 587, 10),
    user: process.env.SMTP_USER || s.smtp_user || '',
    pass: process.env.SMTP_PASS || s.smtp_password || '',
    from: process.env.SMTP_FROM || s.smtp_from || s.smtp_user || '',
    secure: process.env.SMTP_PORT ? process.env.SMTP_PORT === '465' : (s.smtp_secure !== 0)
  };
}

let _cacheKey = null;
let _transport = null;

function buildTransport(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: !!cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000
  });
}

async function getTransport() {
  const cfg = await getSmtpConfig();
  if (!cfg.host) {
    throw new Error('SMTP is not configured. Set SMTP settings in Admin Panel or SMTP_* env vars.');
  }
  const key = `${cfg.host}|${cfg.port}|${cfg.user}`;
  if (!_transport || _cacheKey !== key) {
    _transport = buildTransport(cfg);
    _cacheKey = key;
  }
  return { transport: _transport, cfg };
}

// Send a single email. Throws on failure (callers like flushOutbox handle it).
async function sendMail({ to, subject, html, text }) {
  const { transport, cfg } = await getTransport();
  return transport.sendMail({
    from: cfg.from ? `"myHR" <${cfg.from}>` : undefined,
    to,
    subject,
    html: html || undefined,
    text: text || undefined
  });
}

module.exports = { getSmtpConfig, getNotificationSettings, sendMail };
