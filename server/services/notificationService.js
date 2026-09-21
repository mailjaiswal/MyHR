// server/services/notificationService.js
// Workflow email notifications via a durable outbox:
//   notify(event, ctx)  -> resolves recipients per the event catalog, renders the
//                           template and queues rows into email_outbox (never throws).
//   flushOutbox()       -> delivers queued emails via SMTP (mailer.js) with retries.
//   purgeAudit()        -> trims audit_logs beyond the configured retention window.
const crypto = require('crypto');
const { db } = require('../db/database');
const { getSettings } = require('./settingsService');
const { buildEventEmail } = require('./emailTemplates');
const { sendMail, getNotificationSettings } = require('./mailer');

const APP_URL = process.env.APP_URL || 'https://myhr-by-swaniki.vercel.app';
const MAX_ATTEMPTS = 5;

// ---------- recipient helpers ----------
async function emailOfEmployee(employeeId) {
  if (!employeeId) return null;
  const row = await db.get(`SELECT id, email, full_name, manager_id FROM employees WHERE id = ?`, employeeId);
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.full_name, managerId: row.manager_id };
}

async function adminsWith(permKey) {
  const rows = await db.all(`
    SELECT DISTINCT e.id, e.email, e.full_name
    FROM employees e
    JOIN roles r ON e.role_id = r.id
    WHERE e.status = 'ACTIVE' AND r.permissions @> ?::jsonb
  `, JSON.stringify([permKey]));
  return rows.filter(r => r.email);
}

async function managerOf(emp) {
  if (!emp || !emp.managerId) return null;
  const mgr = await emailOfEmployee(emp.managerId);
  return mgr && mgr.email ? mgr : null;
}

// Dedupe recipients by email, dropping empties.
function unique(list) {
  const seen = new Set();
  const out = [];
  for (const r of list) {
    if (!r || !r.email) continue;
    const key = String(r.email).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

// event -> async (ctx) => [{email,name}]
const CATALOG = {
  'leave.requested': async (ctx) => {
    const emp = await emailOfEmployee(ctx.employeeId);
    const mgr = await managerOf(emp);
    return mgr ? [mgr] : await adminsWith('LEAVES_APPROVE');
  },
  'leave.ack': async (ctx) => [await emailOfEmployee(ctx.employeeId)],
  'leave.approved': async (ctx) => [await emailOfEmployee(ctx.employeeId)],
  'leave.rejected': async (ctx) => [await emailOfEmployee(ctx.employeeId)],
  'correction.requested': async (ctx) => {
    const emp = await emailOfEmployee(ctx.employeeId);
    const mgr = await managerOf(emp);
    const approvers = await adminsWith('REGULARIZATION_APPROVE');
    return mgr ? [mgr, ...approvers] : approvers;
  },
  'correction.decided': async (ctx) => [await emailOfEmployee(ctx.employeeId)],
  'attendance.regularized': async (ctx) => [await emailOfEmployee(ctx.employeeId)],
  'overtime.logged': async (ctx) => {
    const emp = await emailOfEmployee(ctx.employeeId);
    return [emp];
  },
  'employee.created': async () => adminsWith('EMPLOYEES_EDIT'),
  'employee.role_changed': async (ctx) => [await emailOfEmployee(ctx.employeeId)],
  'employee.manager_changed': async (ctx) => [await emailOfEmployee(ctx.employeeId)],
  'payroll.completed': async () => adminsWith('PAYROLL_MANAGE'),
  'payslip.generated': async (ctx) => [await emailOfEmployee(ctx.employeeId)],
  'password.admin_reset': async (ctx) => [await emailOfEmployee(ctx.employeeId)],
  'auth.lockout': async () => adminsWith('ACCESS_MANAGE'),
  'test.email': async (ctx) => [{ email: ctx.to, name: ctx.toName || null }]
};

// ---------- queue ----------
// Fire-and-forget-safe: never throws so a broken SMTP config can't fail the
// business request. Callers still await it so serverless functions don't
// freeze before the outbox rows are committed.
async function notify(event, ctx = {}) {
  try {
    const resolver = CATALOG[event];
    if (!resolver) return { queued: 0, skipped: 'unknown event' };

    const settings = await getNotificationSettings();
    if (!ctx.force && Number(settings.email_enabled ?? 1) === 0) return { queued: 0, skipped: 'email disabled' };
    let prefs = settings.event_prefs;
    if (typeof prefs === 'string') { try { prefs = JSON.parse(prefs); } catch { prefs = {}; } }
    if (prefs && prefs[event] === false) return { queued: 0, skipped: 'event disabled' };

    const org = await getSettings();
    const content = buildEventEmail(event, { ...ctx, orgName: org.name, appUrl: ctx.appUrl || APP_URL });
    if (!content) return { queued: 0, skipped: 'no template' };

    const recipients = unique(await resolver(ctx));
    let queued = 0;
    for (const r of recipients) {
      if (ctx.skipTo && String(ctx.skipTo).toLowerCase() === String(r.email).toLowerCase()) continue;
      const id = crypto.randomUUID();
      if (ctx.dedupeKey) {
        // One queued email per (event, dedup_key): keeps OT/creation digests from spamming.
        const dup = await db.get(
          `SELECT 1 AS hit FROM email_outbox WHERE event = ? AND dedup_key = ? LIMIT 1`,
          event, ctx.dedupeKey
        );
        if (dup) continue;
      }
      await db.run(`
        INSERT INTO email_outbox (id, event, dedup_key, to_email, to_name, subject, html, text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, id, event, ctx.dedupeKey || null, r.email, r.name || null, content.subject, content.html, content.text);
      queued += 1;
    }
    return { queued };
  } catch (e) {
    console.error('[notify] failed for', event, ':', e.message);
    return { queued: 0, skipped: e.message };
  }
}

// ---------- delivery ----------
async function flushOutbox(limit = 25) {
  const result = { sent: 0, failed: 0, pending: 0 };
  try {
    const rows = await db.all(`
      SELECT * FROM email_outbox
      WHERE status IN ('PENDING', 'FAILED') AND attempts < ${MAX_ATTEMPTS}
      ORDER BY created_at ASC
      LIMIT ?
    `, limit);
    for (const row of rows) {
      try {
        await sendMail({ to: row.to_email, subject: row.subject, html: row.html, text: row.text });
        await db.run(`UPDATE email_outbox SET status = 'SENT', attempts = attempts + 1, last_error = NULL, sent_at = now() WHERE id = ?`, row.id);
        result.sent += 1;
      } catch (e) {
        const status = (row.attempts + 1) >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING';
        await db.run(`UPDATE email_outbox SET status = ?, attempts = attempts + 1, last_error = ? WHERE id = ?`,
          status, String(e.message).slice(0, 500), row.id);
        result.failed += 1;
      }
    }
    const stuck = await db.get(`SELECT COUNT(*) AS n FROM email_outbox WHERE status = 'PENDING'`);
    result.pending = Number(stuck ? stuck.n : 0);
  } catch (e) {
    console.error('[notify] flush failed:', e.message);
  }
  return result;
}

// ---------- audit retention ----------
async function purgeAudit() {
  try {
    const settings = await getNotificationSettings();
    let days = parseInt(settings.audit_retention_days, 10);
    if (!Number.isFinite(days) || days < 1) days = 365;
    const res = await db.run(
      `DELETE FROM audit_logs WHERE ts < now() - make_interval(days => ?)`, days
    );
    return { deleted: res.changes || 0, retentionDays: days };
  } catch (e) {
    console.error('[notify] audit purge failed:', e.message);
    return { deleted: 0, error: e.message };
  }
}

module.exports = { notify, flushOutbox, purgeAudit, APP_URL };
