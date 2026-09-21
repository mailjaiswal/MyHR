// server/routes/audit.js
// Admin-facing audit trail: filtered list, CSV export, action catalogue and
// retention settings. Mounted at /api/v1/audit.
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authGuard');
const { accessGuard, requirePerm } = require('../middleware/accessGuard');
const { cronGuard } = require('../middleware/cronGuard');
const { db } = require('../db/database');
const { purgeAudit } = require('../services/notificationService');
const { getNotificationSettings } = require('../services/mailer');

// Cron-invoked purge (registered before the auth chain; guarded by CRON_SECRET).
// Vercel cron issues GET; also accept POST for manual triggers.
const purgeHandler = async (req, res) => {
  const result = await purgeAudit();
  res.json({ success: true, ...result });
};
router.get('/purge', cronGuard, purgeHandler);
router.post('/purge', cronGuard, purgeHandler);

router.use(requireAuth, accessGuard, requirePerm('AUDIT_VIEW'));

// Shared filter builder for list + export.
function buildFilters(query) {
  const where = [];
  const params = [];
  if (query.from) { where.push('ts >= ?'); params.push(String(query.from)); }
  if (query.to) { where.push('ts <= ?'); params.push(String(query.to)); }
  if (query.actor) { where.push('LOWER(COALESCE(actor_name, \'\')) LIKE ?'); params.push(`%${String(query.actor).toLowerCase()}%`); }
  if (query.action) { where.push('action LIKE ?'); params.push(`${String(query.action).replace(/%|_/g, '')}%`); }
  if (query.entityType) { where.push('entity_type = ?'); params.push(String(query.entityType)); }
  if (query.entityId) { where.push('entity_id = ?'); params.push(String(query.entityId)); }
  if (query.q) {
    where.push('(LOWER(COALESCE(summary, \'\')) LIKE ? OR LOWER(COALESCE(entity_id, \'\')) LIKE ?)');
    const term = `%${String(query.q).toLowerCase()}%`;
    params.push(term, term);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

// GET /api/v1/audit?from&to&actor&action&entityType&entityId&q&limit&offset
router.get('/', async (req, res) => {
  try {
    const { clause, params } = buildFilters(req.query);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const total = await db.get(`SELECT COUNT(*) AS n FROM audit_logs ${clause}`, ...params);
    const rows = await db.all(
      `SELECT * FROM audit_logs ${clause} ORDER BY ts DESC LIMIT ? OFFSET ?`,
      ...params, limit, offset
    );
    res.json({ success: true, total: Number(total ? total.n : 0), limit, offset, entries: rows });
  } catch (e) {
    res.status(500).json({ error: 'AUDIT_QUERY_FAILED', message: e.message });
  }
});

// Distinct action list for the filter dropdown.
router.get('/actions', async (req, res) => {
  try {
    const rows = await db.all(`SELECT DISTINCT action FROM audit_logs ORDER BY action ASC`);
    res.json({ success: true, actions: rows.map(r => r.action) });
  } catch (e) {
    res.status(500).json({ error: 'AUDIT_QUERY_FAILED', message: e.message });
  }
});

function csvCell(v) {
  const s = v === null || v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/v1/audit/export  (same filters, CSV download, cap 20k rows)
router.get('/export', async (req, res) => {
  try {
    const { clause, params } = buildFilters(req.query);
    const rows = await db.all(
      `SELECT ts, actor_name, actor_role, action, entity_type, entity_id, summary, details, ip
       FROM audit_logs ${clause} ORDER BY ts DESC LIMIT 20000`,
      ...params
    );
    const header = ['Timestamp', 'Actor', 'Role', 'Action', 'Entity Type', 'Entity ID', 'Summary', 'Details', 'IP'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([r.ts, r.actor_name, r.actor_role, r.action, r.entity_type, r.entity_id, r.summary, r.details, r.ip].map(csvCell).join(','));
    }
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="myhr_audit_${stamp}.csv"`);
    res.send('\uFEFF' + lines.join('\r\n'));
  } catch (e) {
    res.status(500).json({ error: 'AUDIT_EXPORT_FAILED', message: e.message });
  }
});

// Retention settings (readable by AUDIT_VIEW, writable by SETTINGS_EDIT).
router.get('/settings', async (req, res) => {
  try {
    const s = await getNotificationSettings();
    let days = parseInt(s.audit_retention_days, 10);
    if (!Number.isFinite(days) || days < 1) days = 365;
    res.json({ success: true, audit_retention_days: days });
  } catch (e) {
    res.status(500).json({ error: 'AUDIT_SETTINGS_FAILED', message: e.message });
  }
});

router.put('/settings', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const days = parseInt(req.body.audit_retention_days, 10);
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      return res.status(400).json({ error: 'INVALID_RETENTION', message: 'audit_retention_days must be between 1 and 3650.' });
    }
    await db.run(`
      INSERT INTO notification_settings (id, audit_retention_days, updated_at)
      VALUES ('main', ?, now())
      ON CONFLICT (id) DO UPDATE SET audit_retention_days = EXCLUDED.audit_retention_days, updated_at = now()
    `, days);
    const { audit } = require('../services/auditService');
    await audit(req, 'audit.settings_update', { entityType: 'settings', entityId: 'notification_settings', summary: `Audit retention set to ${days} day(s)` });
    res.json({ success: true, audit_retention_days: days });
  } catch (e) {
    res.status(500).json({ error: 'AUDIT_SETTINGS_FAILED', message: e.message });
  }
});

module.exports = router;
