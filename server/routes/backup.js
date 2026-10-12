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
  CATEGORIES, runBackup, listBackups, downloadBackup, restoreBackup, pruneBackups, getBackupConfig,
  encryptSecret, testStorage, storageConfigured, storageBucket
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
    res.json({
      success: true, entries, counts,
      configured: storageConfigured(cfg), target: cfg.target,
      bucket: storageBucket(cfg)
    });
  } catch (e) {
    res.status(500).json({ error: 'BACKUP_LIST_FAILED', message: e.message });
  }
});

// Data categories the client can choose to include in their backups.
router.get('/categories', (req, res) => {
  res.json({ success: true, categories: CATEGORIES.map(({ key, label, desc }) => ({ key, label, desc })) });
});

// Backup settings (read by SETTINGS_VIEW, write by SETTINGS_EDIT) — includes
// the client's own cloud-storage destination (credentials never echoed back).
router.get('/settings', async (req, res) => {
  try {
    const cfg = await getBackupConfig();
    res.json({
      success: true,
      backup_enabled: cfg.enabled,
      backup_retention_count: cfg.retention,
      bucket: storageBucket(cfg),
      configured: storageConfigured(cfg),
      target: cfg.target,
      categories: cfg.categories,
      storage: {
        endpoint: cfg.s3config.endpoint || '',
        region: cfg.s3config.region || '',
        bucket: cfg.s3config.bucket || '',
        access_key: cfg.s3config.accessKey || '',
        secret_set: Boolean(cfg.s3config.secret)
      }
    });
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

    // Category scope — validated against the known list, defaults to "all".
    let categories = cur.categories;
    if (body.categories !== undefined) {
      if (!Array.isArray(body.categories)) {
        return res.status(400).json({ error: 'INVALID_CATEGORIES', message: 'categories must be an array of keys.' });
      }
      const known = new Set(CATEGORIES.map(c => c.key));
      categories = [...new Set(body.categories.filter(k => known.has(k)))];
    }

    // Client-owned storage destination. Sent as a block; blank/clear_storage
    // removes it and falls back to platform defaults.
    let endpoint = cur.s3config.endpoint, region = cur.s3config.region, bucket = cur.s3config.bucket;
    let accessKey = cur.s3config.accessKey, secretEnc = cur.target === 's3' ? encryptSecret(cur.s3config.secret) : '';
    const storageTouched = body.clear_storage || ['storage_endpoint', 'storage_bucket', 'storage_access_key', 'storage_secret'].some(k => body[k] !== undefined);
    if (body.clear_storage) {
      endpoint = region = bucket = accessKey = secretEnc = '';
    } else if (storageTouched) {
      endpoint = String(body.storage_endpoint ?? endpoint).trim();
      bucket = String(body.storage_bucket ?? bucket).trim();
      accessKey = String(body.storage_access_key ?? accessKey).trim();
      region = String(body.storage_region ?? region).trim() || 'us-east-1';
      if (body.storage_secret) secretEnc = encryptSecret(String(body.storage_secret));
      if (endpoint || bucket || accessKey || secretEnc) {
        if (!/^https?:\/\//i.test(endpoint)) {
          return res.status(400).json({ error: 'INVALID_ENDPOINT', message: 'storage_endpoint must be a full https:// URL (e.g. https://s3.us-west-2.amazonaws.com).' });
        }
        if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
          return res.status(400).json({ error: 'INVALID_BUCKET', message: 'storage_bucket is not a valid bucket name.' });
        }
        if (!accessKey || !secretEnc) {
          return res.status(400).json({ error: 'INCOMPLETE_CREDENTIALS', message: 'Access key and secret key are both required to enable your own storage.' });
        }
      } else {
        region = '';
      }
    }

    await db.run(`
      INSERT INTO notification_settings (id, backup_enabled, backup_retention_count, backup_categories_json,
        backup_storage_endpoint, backup_storage_region, backup_storage_bucket, backup_storage_access_key, backup_storage_secret_enc, updated_at)
      VALUES ('main', ?, ?, ?, ?, ?, ?, ?, ?, now())
      ON CONFLICT (id) DO UPDATE SET backup_enabled = EXCLUDED.backup_enabled,
        backup_retention_count = EXCLUDED.backup_retention_count,
        backup_categories_json = EXCLUDED.backup_categories_json,
        backup_storage_endpoint = EXCLUDED.backup_storage_endpoint,
        backup_storage_region = EXCLUDED.backup_storage_region,
        backup_storage_bucket = EXCLUDED.backup_storage_bucket,
        backup_storage_access_key = EXCLUDED.backup_storage_access_key,
        backup_storage_secret_enc = EXCLUDED.backup_storage_secret_enc,
        updated_at = now()
    `, enabled, retention, JSON.stringify(categories),
       endpoint || null, region || null, bucket || null, accessKey || null, secretEnc || null);
    await audit(req, 'backup.settings_update', {
      entityType: 'settings', entityId: 'notification_settings',
      summary: `Backup ${enabled ? 'enabled' : 'disabled'}, retention ${retention} copies, ${categories.length} category scope(s), destination ${endpoint ? 'client storage' : 'platform default'}`,
      details: { categories, has_client_storage: Boolean(endpoint) }
    });
    const fresh = await getBackupConfig();
    res.json({
      success: true, backup_enabled: !!enabled, backup_retention_count: retention,
      categories: fresh.categories, target: fresh.target,
      storage: { endpoint: fresh.s3config.endpoint, region: fresh.s3config.region, bucket: fresh.s3config.bucket, access_key: fresh.s3config.accessKey, secret_set: Boolean(fresh.s3config.secret) }
    });
  } catch (e) {
    res.status(500).json({ error: 'BACKUP_SETTINGS_FAILED', message: e.message });
  }
});

// Probe the client's bucket with a write/read/delete round trip. Credentials
// may be passed inline (to test before saving) — they are never stored or logged.
router.post('/test-storage', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const body = req.body || {};
    const cur = await getBackupConfig();
    const sc = {
      endpoint: String(body.storage_endpoint ?? cur.s3config.endpoint).trim(),
      region: String(body.storage_region ?? cur.s3config.region).trim() || 'us-east-1',
      bucket: String(body.storage_bucket ?? cur.s3config.bucket).trim(),
      accessKey: String(body.storage_access_key ?? cur.s3config.accessKey).trim(),
      secret: String(body.storage_secret ?? cur.s3config.secret).trim()
    };
    if (!sc.endpoint || !sc.bucket || !sc.accessKey || !sc.secret) {
      return res.status(400).json({ error: 'INCOMPLETE_CREDENTIALS', message: 'Endpoint, bucket, access key and secret key are all required for the test.' });
    }
    const result = await testStorage(sc);
    await audit(req, 'backup.test_storage', { entityType: 'settings', entityId: 'notification_settings', summary: `Storage connection test to ${result.bucket} succeeded` });
    res.json({ success: true, ...result });
  } catch (e) {
    await audit(req, 'backup.test_storage', { entityType: 'settings', entityId: 'notification_settings', summary: `Storage connection test FAILED: ${e.message}` });
    res.status(502).json({ error: 'STORAGE_TEST_FAILED', message: e.message });
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
