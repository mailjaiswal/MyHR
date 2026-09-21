const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db } = require('../db/database');
const importer = require('../services/sqlFileImporter');
const loader = require('../services/sqlTextDumpLoader');
const syncEngine = require('../services/syncEngine');
const { requireAuth } = require('../middleware/authGuard');
const { accessGuard, requirePerm } = require('../middleware/accessGuard');

// Data Sources / Demo Lab is an admin-only surface (DEMO_LAB permission)
router.use(requireAuth, accessGuard, requirePerm('DEMO_LAB'));

function makeId(prefix) {
  return `${prefix}_${Date.now()}${crypto.randomBytes(3).toString('hex')}`;
}

// ── 1. List all data sources ───────────────────────────────────────────
router.get('/sources', async (req, res) => {
  try {
    const sources = await db.all(`
      SELECT sr.*,
             (SELECT COUNT(*) FROM sync_logs sl WHERE sl.source_id = sr.id AND sl.status = 'FAILED') as last_error_count,
             (SELECT message FROM sync_logs sl WHERE sl.source_id = sr.id ORDER BY sl.started_at DESC LIMIT 1) as last_message
      FROM data_sources sr
      ORDER BY sr.created_at DESC
    `);
    const safe = sources.map(s => ({ ...s, password_enc: s.password_enc ? '••••••••' : null }));
    return res.json({ success: true, count: safe.length, sources: safe });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── 2. Create a data source ────────────────────────────────────────────
router.post('/sources', async (req, res) => {
  try {
    const {
      name, source_type = 'API', vendor = 'ZKTeco', base_url, username,
      password, token_type = 'JWT', options = {}, sync_frequency_minutes = 60, status = 'ACTIVE'
    } = req.body || {};

    if (!name) return res.status(400).json({ error: 'Source name is required' });
    if (!['API', 'SQL_FILE'].includes(source_type)) {
      return res.status(400).json({ error: "source_type must be 'API' or 'SQL_FILE'" });
    }
    if (source_type === 'API' && (!base_url || !username || !password)) {
      return res.status(400).json({ error: 'API sources require base_url, username and password (vendor web-app login)' });
    }

    const id = makeId('src');
    await db.run(`
      INSERT INTO data_sources (id, name, source_type, vendor, base_url, username, password_enc, token_type, options, sync_frequency_minutes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      id, name, source_type, vendor,
      base_url ? String(base_url).replace(/\/+$/, '') : null,
      username || null,
      password ? syncEngine.encodePassword(password) : null,
      token_type, JSON.stringify(options || {}), sync_frequency_minutes, status
    );

    const created = await db.get('SELECT * FROM data_sources WHERE id = ?', id);
    return res.status(201).json({ success: true, source: { ...created, password_enc: '••••••••' } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── 3. Update a data source ────────────────────────────────────────────
router.put('/sources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.get('SELECT * FROM data_sources WHERE id = ?', id);
    if (!existing) return res.status(404).json({ error: 'Data source not found' });

    const {
      name, vendor, base_url, username, password, token_type,
      options, sync_frequency_minutes, status
    } = req.body || {};

    await db.run(`
      UPDATE data_sources SET
        name = coalesce(?, name),
        vendor = coalesce(?, vendor),
        base_url = coalesce(?, base_url),
        username = coalesce(?, username),
        password_enc = ?,
        token_type = coalesce(?, token_type),
        options = coalesce(?, options),
        sync_frequency_minutes = coalesce(?, sync_frequency_minutes),
        status = coalesce(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      name ?? null,
      vendor ?? null,
      base_url ? String(base_url).replace(/\/+$/, '') : null,
      username ?? null,
      password ? syncEngine.encodePassword(password) : existing.password_enc,
      token_type ?? null,
      options !== undefined ? JSON.stringify(options) : null,
      sync_frequency_minutes ?? null,
      status ?? null,
      id
    );

    const updated = await db.get('SELECT * FROM data_sources WHERE id = ?', id);
    return res.json({ success: true, source: { ...updated, password_enc: '••••••••' } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── 4. Delete a data source ────────────────────────────────────────────
router.delete('/sources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.run(`DELETE FROM sync_logs WHERE source_id = ?`, id);
    const info = await db.run(`DELETE FROM data_sources WHERE id = ?`, id);
    if (info.changes === 0) return res.status(404).json({ error: 'Data source not found' });
    return res.json({ success: true, message: 'Data source deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── 5. Test an API source connection ───────────────────────────────────
router.post('/sources/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const source = await db.get('SELECT * FROM data_sources WHERE id = ?', id);
    if (!source) return res.status(404).json({ error: 'Data source not found' });

    const biotime = require('../services/biotimeApi');
    const result = await biotime.testConnection({
      baseUrl: source.base_url,
      username: source.username,
      password: syncEngine.decodePassword(source.password_enc),
      tokenType: source.token_type || 'JWT'
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
});

// ── 6. Manual sync trigger (API sources) ───────────────────────────────
router.post('/sources/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await syncEngine.syncSourceById(id, true);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── 7. SQL database file upload + import ───────────────────────────────
// Accepts a SQLite (.db) binary OR a MySQL/SQL Server text dump as the raw body.
// Optional headers: X-Source-Id (link to a data_sources row), X-Source-Name,
// X-Vendor, X-Options (JSON: { createEmployees, columnMap, ... }).
router.post('/upload', (req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('error', e => res.status(400).json({ error: e.message }));
  req.on('end', async () => {
    const raw = Buffer.concat(chunks);
    if (!raw.length) {
      return res.status(400).json({ error: 'No file body received. Send the SQL database file as raw body' });
    }
    if (!importer.isSqliteBuffer(raw) && !loader.looksLikeSqlText(raw)) {
      return res.status(400).json({ error: 'Unrecognized file. Expected a SQLite (.db) database or a SQL text dump.' });
    }

    const sourceId = req.headers['x-source-id'] || null;
    const sourceName = req.headers['x-source-name'] || 'SQL File Import';
    let options = {};
    try { options = JSON.parse(req.headers['x-options'] || '{}'); } catch (e) { /* ignore malformed options header */ }

    try {
      const summary = await importer.importFile({ buffer: raw, sourceId, sourceName, syncType: 'FILE_IMPORT', options });
      const logRow = await db.get(`SELECT * FROM sync_logs WHERE sync_type = 'FILE_IMPORT' ORDER BY started_at DESC LIMIT 1`);
      return res.json({ success: true, detectedTables: summary.detectedTables, import: summary, syncLog: logRow });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  });
});

// ── 8. Sync log history ────────────────────────────────────────────────
router.get('/logs', async (req, res) => {
  try {
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const logs = await db.all(`
      SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT ?
    `, limit);
    return res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── 9. Ingestion dashboard summary ─────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const totals = await db.get(`
      SELECT
        (SELECT COUNT(*) FROM data_sources) as total_sources,
        (SELECT COUNT(*) FROM data_sources WHERE source_type = 'API') as api_sources,
        (SELECT COUNT(*) FROM data_sources WHERE source_type = 'SQL_FILE') as file_sources,
        (SELECT COUNT(*) FROM sync_logs WHERE status = 'SUCCESS') as successful_runs,
        (SELECT COUNT(*) FROM sync_logs WHERE status = 'FAILED') as failed_runs,
        (SELECT COUNT(*) FROM sync_logs) as total_runs,
        (SELECT COUNT(*) FROM biometric_punches) as total_punches
    `);
    const lastRun = await db.get(`SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 1`);
    return res.json({ success: true, summary: { ...totals, lastRun } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── 10. Get a single source (details for edit) ─────────────────────────
router.get('/sources/:id', async (req, res) => {
  try {
    const source = await db.get('SELECT * FROM data_sources WHERE id = ?', req.params.id);
    if (!source) return res.status(404).json({ error: 'Data source not found' });
    const logs = await db.all(`SELECT * FROM sync_logs WHERE source_id = ? ORDER BY started_at DESC LIMIT 10`, source.id);
    return res.json({ success: true, source: { ...source, password_enc: null }, logs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;