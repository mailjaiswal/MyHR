// server/routes/backup.js
// Admin backup & recovery surface + a cron-invoked backup endpoint. Mounted at
// /api/v1/backup. Reads gated by SETTINGS_VIEW, mutations by SETTINGS_EDIT.
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authGuard');
const { accessGuard, requirePerm } = require('../middleware/accessGuard');
const { cronGuard } = require('../middleware/cronGuard');
const { db } = require('../db/database');
const { audit } = require('../services/auditService');
const {
  runBackup, listBackups, downloadBackup, restoreBackup, pruneBackups, getBackupConfig
} = require('../services/backupService');

// ── Cron-invoked daily backup (registered before the auth chain) ─────────────
const cronRun = async (req, res) => {
  const result = await runBackup('AUTO', null);
  const pruned = await pruneBackups();
  res.status(result.status === 'SUCCESS' ? 200 : 500).json({ success: result.status === 'SUCCESS', backup: result, pruned });
};
router.get('/run', cronGuard, cronRun);
router.post('/run', cronGuard, cronRun);

// Manual run (authenticated admin).
router.post('/run-manual', requireAuth, accessGuard, requirePerm('SETTINGS_EDIT'), async (req, res) => {
  const result = await runBackup('MANUAL', req.currentUser && req.currentUser.id);
  const pruned = await pruneBackups();
  await audit(req, 'backup.run', {
    entityType: 'backup', entityId: result.id,
    summary: `Manual backup ${result.status}${result.error ? `: ${result.error}` : ` (${result.size_bytes || 0} bytes)`}`
  });
  res.status(result.status === 'SUCCESS' ? 200 : 502).json({ success: result.status === 'SUCCESS', backup: result, pruned });
});

// Everything below requires an authenticated admin viewer.
router.use(requireAuth, accessGuard, requirePerm('SETTINGS_VIEW'));

// List recent backups + counts.
router.get('/', async (req, res) => {
  try {
    const { entries, counts } = await listBackups(parseInt(req.query.limit, 10) || 50);
    const cfg = await getBackupConfig();
    res.json({ success: true, entries, counts, configured: Boolean(cfg.url && cfg.key), bucket: cfg.bucket });
  } catch (e) {
    res.status(500).json({ error: 'BACKUP_LIST_FAILED', message: e.message });
  }
});

// Backup settings (read by SETTINGS_VIEW, write by SETTINGS_EDIT).
router.get('/settings', async (req, res) => {
  try {
    const cfg = await getBackupConfig();
    res.json({ success: true, backup_enabled: cfg.enabled, backup_retention_count: cfg.retention, bucket: cfg.bucket, configured: Boolean(cfg.url && cfg.key) });
  } catch (e) {
    res.status(500).json({ error: 'BACKUP_SETTINGS_FAILED', message: e.message });
  }
});

router.put('/settings', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const body = req.body || {};
    const cur = await getBackupConfig();
    const enabled = body.backup_enabled !== undefined ? (body.backup_enabled ? 1 : 0) : (cur.enabled ? 1 : 0);
    let retention = body.backup_retention_count !== undefined ? parseInt(body.backup_retention_count, 10) : cur.retention;
    if (!Number.isFinite(retention) || retention < 1 || retention > 365) {
      return res.status(400).json({ error: 'INVALID_RETENTION', message: 'backup_retention_count must be between 1 and 365.' });
    }
    await db.run(`
      INSERT INTO notification_settings (id, backup_enabled, backup_retention_count, updated_at)
      VALUES ('main', ?, ?, now())
      ON CONFLICT (id) DO UPDATE SET backup_enabled = EXCLUDED.backup_enabled, backup_retention_count = EXCLUDED.backup_retention_count, updated_at = now()
    `, enabled, retention);
    await audit(req, 'backup.settings_update', { entityType: 'settings', entityId: 'notification_settings', summary: `Backup ${enabled ? 'enabled' : 'disabled'}, retention ${retention} copies` });
    res.json({ success: true, backup_enabled: !!enabled, backup_retention_count: retention });
  } catch (e) {
    res.status(500).json({ error: 'BACKUP_SETTINGS_FAILED', message: e.message });
  }
});

// Download a dump file (admin editor).
router.get('/:id/download', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const { backup, sql } = await downloadBackup(req.params.id);
    await audit(req, 'backup.download', { entityType: 'backup', entityId: backup.id, summary: `Downloaded backup ${backup.id}` });
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="myhr_backup_${backup.id}.sql"`);
    res.send(sql);
  } catch (e) {
    if (e.code === 404) return res.status(404).json({ error: 'NOT_FOUND', message: e.message });
    res.status(500).json({ error: 'BACKUP_DOWNLOAD_FAILED', message: e.message });
  }
});

// Guarded restore (admin editor, explicit confirm token must equal the id).
router.post('/:id/restore', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  const { id } = req.params;
  if (!req.body || req.body.confirm !== id) {
    return res.status(400).json({ error: 'CONFIRM_REQUIRED', message: 'Send { confirm: "<backup id>" } to perform this destructive restore.' });
  }
  try {
    const result = await restoreBackup(id);
    await audit(req, 'backup.restore', {
      entityType: 'backup', entityId: id,
      summary: `Database restored from backup ${id} (taken ${result.ts})`,
      details: { destructive: true }
    });
    res.json({ success: true, ...result });
  } catch (e) {
    await audit(req, 'backup.restore', { entityType: 'backup', entityId: id, summary: `Restore from ${id} FAILED: ${e.message}`, details: { error: e.message } });
    if (e.code === 404) return res.status(404).json({ error: 'NOT_FOUND', message: e.message });
    res.status(500).json({ error: 'BACKUP_RESTORE_FAILED', message: e.message });
  }
});

module.exports = router;
