const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db } = require('../db/database');
const importer = require('../services/sqlFileImporter');
const loader = require('../services/sqlTextDumpLoader');
const attlog = require('../services/attlogImporter');
const syncEngine = require('../services/syncEngine');
const { recomputeAttendance } = require('../services/attendanceEngine');
const roster = require('../services/rosterImporter');
const { requireAuth } = require('../middleware/authGuard');
const { accessGuard, requirePerm } = require('../middleware/accessGuard');
const { audit, diffFields } = require('../services/auditService');

// Data Sources management is an admin surface (SETTINGS_VIEW to read, SETTINGS_EDIT to mutate)
router.use(requireAuth, accessGuard, requirePerm('SETTINGS_VIEW'));

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
router.post('/sources', requirePerm('SETTINGS_EDIT'), async (req, res) => {
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
    await audit(req, 'ingestion.source_create', {
      entityType: 'data_source', entityId: id,
      summary: `Data source '${name}' (${source_type}) created`,
      details: { name, source_type, vendor, base_url: base_url || null, sync_frequency_minutes }
    });
    return res.status(201).json({ success: true, source: { ...created, password_enc: '••••••••' } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── 3. Update a data source ────────────────────────────────────────────
router.put('/sources/:id', requirePerm('SETTINGS_EDIT'), async (req, res) => {
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
    await audit(req, 'ingestion.source_update', {
      entityType: 'data_source', entityId: id,
      summary: `Data source '${updated.name}' updated${password ? ' (credentials rotated)' : ''}`,
      details: {
        changes: diffFields(
          { name: existing.name, vendor: existing.vendor, base_url: existing.base_url, username: existing.username, token_type: existing.token_type, sync_frequency_minutes: existing.sync_frequency_minutes, status: existing.status },
          { name: updated.name, vendor: updated.vendor, base_url: updated.base_url, username: updated.username, token_type: updated.token_type, sync_frequency_minutes: updated.sync_frequency_minutes, status: updated.status }
        ),
        password_changed: Boolean(password)
      }
    });
    return res.json({ success: true, source: { ...updated, password_enc: '••••••••' } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── 4. Delete a data source ────────────────────────────────────────────
router.delete('/sources/:id', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.get('SELECT * FROM data_sources WHERE id = ?', id);
    await db.run(`DELETE FROM sync_logs WHERE source_id = ?`, id);
    const info = await db.run(`DELETE FROM data_sources WHERE id = ?`, id);
    if (info.changes === 0) return res.status(404).json({ error: 'Data source not found' });
    await audit(req, 'ingestion.source_delete', { entityType: 'data_source', entityId: id, summary: `Data source '${existing.name}' deleted`, details: { name: existing.name, source_type: existing.source_type } });
    return res.json({ success: true, message: 'Data source deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── 5. Test an API source connection ───────────────────────────────────
router.post('/sources/:id/test', requirePerm('SETTINGS_EDIT'), async (req, res) => {
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
router.post('/sources/:id/sync', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await syncEngine.syncSourceById(id, true);
    await audit(req, 'ingestion.sync_manual', { entityType: 'data_source', entityId: id, summary: `Manual sync triggered on source '${id}': ${result.recordsImported ?? 0} imported, ${result.employeesCreated ?? 0} employees created`, details: { recordsFound: result.recordsFound, recordsImported: result.recordsImported, employeesCreated: result.employeesCreated, status: result.status } });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── 7. Biometric file PREVIEW (parse only — nothing is written to the DB) ─
// Same raw-body + header contract as /upload, but returns the decoded table
// (columns + rows + summary + matched/new-employee flags) so an admin can
// eyeball the data and explicitly confirm before importing.
router.post('/preview', requirePerm('SETTINGS_EDIT'), (req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('error', e => res.status(400).json({ error: e.message }));
  req.on('end', async () => {
    const raw = Buffer.concat(chunks);
    if (!raw.length) {
      return res.status(400).json({ error: 'No file body received. Send the biometric export file as raw body' });
    }
    const fileName = req.headers['x-file-name'] ? String(req.headers['x-file-name']) : null;
    let options = {};
    try { options = JSON.parse(req.headers['x-options'] || '{}'); } catch (e) { /* ignore malformed options header */ }

    try {
      let preview;
      if (attlog.looksLikeAttlog(raw, fileName)) {
        preview = await attlog.previewAttlog(raw, fileName);
      } else if (importer.isSqliteBuffer(raw) || loader.looksLikeSqlText(raw)) {
        preview = await importer.previewFile(raw, { columnMap: options.columnMap });
      } else {
        return res.status(400).json({ error: 'Unrecognized file. Expected a ZKTeco ATTLOG .dat text export, a SQLite (.db) database, or a SQL text dump.' });
      }
      preview.fileName = preview.fileName || fileName;
      if (req.headers['x-device-serial']) preview.deviceSerial = String(req.headers['x-device-serial']) || preview.deviceSerial;
      return res.json({ success: true, preview });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  });
});

// ── 8. Biometric file upload + import ──────────────────────────────────
// Accepts a ZKTeco-family ATTLOG text export (*.dat), a SQLite (.db) binary,
// OR a MySQL/SQL Server text dump as the raw body (auto-detected).
// Optional headers: X-Source-Id (link to a data_sources row), X-Source-Name,
// X-Vendor, X-File-Name, X-Device-Serial, X-Options (JSON: { createEmployees, columnMap, ... }).
router.post('/upload', requirePerm('SETTINGS_EDIT'), (req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('error', e => res.status(400).json({ error: e.message }));
  req.on('end', async () => {
    const raw = Buffer.concat(chunks);
    if (!raw.length) {
      return res.status(400).json({ error: 'No file body received. Send the biometric export file as raw body' });
    }
    const fileName = req.headers['x-file-name'] ? String(req.headers['x-file-name']) : null;
    const sourceId = req.headers['x-source-id'] || null;
    const sourceName = req.headers['x-source-name'] || 'Biometric File Import';
    let options = {};
    try { options = JSON.parse(req.headers['x-options'] || '{}'); } catch (e) { /* ignore malformed options header */ }

    try {
      let summary;
      let detectedTables = null;
      if (attlog.looksLikeAttlog(raw, fileName)) {
        // ZKTeco-family ATTLOG .dat text export: one punch per tab-delimited line
        summary = await attlog.importAttlog({
          buffer: raw,
          fileName,
          deviceSerial: req.headers['x-device-serial'] ? String(req.headers['x-device-serial']) : null,
          sourceId, sourceName, options
        });
      } else if (importer.isSqliteBuffer(raw) || loader.looksLikeSqlText(raw)) {
        summary = await importer.importFile({ buffer: raw, sourceId, sourceName, syncType: 'FILE_IMPORT', options });
        detectedTables = summary.detectedTables;
      } else {
        return res.status(400).json({ error: 'Unrecognized file. Expected a ZKTeco ATTLOG .dat text export, a SQLite (.db) database, or a SQL text dump.' });
      }
      const logRow = await db.get(`SELECT * FROM sync_logs WHERE sync_type = 'FILE_IMPORT' ORDER BY started_at DESC LIMIT 1`);
      await audit(req, 'ingestion.file_import', {
        entityType: 'data_source', entityId: sourceId || 'upload',
        summary: `File import ('${sourceName}'): ${summary.recordsImported ?? 0} punches, ${summary.employeesCreated ?? 0} employees created`,
        details: { sourceName, fileName, recordsFound: summary.recordsFound, recordsImported: summary.recordsImported, employeesCreated: summary.employeesCreated, detectedTables: detectedTables || undefined }
      });
      return res.json({ success: true, detectedTables, import: summary, syncLog: logRow });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  });
});

// ── 8. Sync log history ────────────────────────────────────────────────
// `tagged_punches` = how many punches still carry this run's import_batch marker,
// i.e. how many rows an "Undo" on this run would actually remove. Legacy imports
// (made before batch tagging existed) report 0 and therefore aren't reversible.
router.get('/logs', async (req, res) => {
  try {
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const logs = await db.all(`
      SELECT sl.*, (SELECT COUNT(*) FROM biometric_punches bp WHERE bp.import_batch = sl.id) as tagged_punches
      FROM sync_logs sl ORDER BY sl.started_at DESC LIMIT ?
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

// ── 11. Recompute attendance from stored punches ───────────────────────
// Rebuilds attendance_records from the raw punches already in the DB using each
// employee's CURRENT shift — e.g. after fixing a shift or a roster import. No file
// needed. Body: { from?, to?, employeeId? } (dates YYYY-MM-DD; omit for all history).
router.post('/recompute', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const { from, to, employeeId } = req.body || {};
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (from && !dateRe.test(from)) return res.status(400).json({ error: "'from' must be YYYY-MM-DD" });
    if (to && !dateRe.test(to)) return res.status(400).json({ error: "'to' must be YYYY-MM-DD" });
    if (from && to && from > to) return res.status(400).json({ error: "'from' is after 'to'" });

    const result = await recomputeAttendance({
      from: from || null,
      to: to || null,
      employeeIds: employeeId ? [employeeId] : null
    });
    await audit(req, 'ingestion.recompute', {
      entityType: 'attendance', entityId: employeeId || 'all',
      summary: `Attendance recomputed for ${result.employees} employee(s): ${result.daysWritten} day(s) rebuilt, ${result.daysDeleted} removed${from ? ` (${from}→${to || 'now'})` : ' (all dates)'}`,
      details: { from: from || null, to: to || null, employeeId: employeeId || null, ...result }
    });
    return res.json({ success: true, message: 'Attendance recomputed', result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── 12. Roster / employee-name CSV preview + apply ─────────────────────
// The picker lists the department / shift labels the CSV must use, so admins don't
// have to guess names like "Night (19:00 - 07:00)".
router.get('/setup', async (req, res) => {
  try {
    const departments = await db.all('SELECT id, name, code FROM departments ORDER BY name');
    const shifts = await db.all('SELECT id, name, start_time, duration_hours FROM shifts ORDER BY name');
    return res.json({ success: true, departments, shifts });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Body: { rows: [ { biometricUserId, employeeCode, fullName, designation, department,
//                   shift, email, mobile, baseCtc, dateOfJoining, gender } ] }
router.post('/roster/preview', async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows || !rows.length) return res.status(400).json({ error: 'Provide a non-empty rows array' });
    if (rows.length > 5000) return res.status(400).json({ error: 'Too many rows (max 5000)' });
    const result = await roster.analyzeRoster(rows, { apply: false });
    return res.json({ success: true, preview: result });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/roster/apply', requirePerm('EMPLOYEES_EDIT'), async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows || !rows.length) return res.status(400).json({ error: 'Provide a non-empty rows array' });
    if (rows.length > 5000) return res.status(400).json({ error: 'Too many rows (max 5000)' });

    const result = await roster.analyzeRoster(rows, { apply: true });
    // Shift changes affect derived attendance — rebuild just those employees.
    let recompute = null;
    if (result.recomputeEmployeeIds.length) {
      recompute = await recomputeAttendance({ employeeIds: result.recomputeEmployeeIds });
    }
    await audit(req, 'ingestion.roster_apply', {
      entityType: 'employee', entityId: 'roster_csv',
      summary: `Roster CSV applied: ${result.summary.updated} updated, ${result.summary.created} created, ${result.summary.errors} error(s)`,
      details: { ...result.summary, recomputed: recompute }
    });
    return res.json({ success: true, result: result.summary, recompute });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// ── 13. Revert (undo) one import batch ─────────────────────────────────
// Deletes the punches tagged with a given sync-log id, rebuilds the affected
// employees' attendance, and removes the employees/devices that batch auto-created
// (only when nothing else references them). Idempotent — a batch reverts once.
function safeParseIds(v) { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }

router.post('/logs/:id/revert', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const { id } = req.params;
    const log = await db.get('SELECT * FROM sync_logs WHERE id = ?', id);
    if (!log) return res.status(404).json({ error: 'Import run not found' });
    if (log.reverted_at) return res.status(400).json({ error: 'This import was already reverted' });

    // Which employees does this batch touch? (resolve BEFORE deleting the punches)
    const bioRows = await db.all('SELECT DISTINCT biometric_user_id FROM biometric_punches WHERE import_batch = ?', id);
    const bioIds = bioRows.map(r => String(r.biometric_user_id)).filter(Boolean);
    let affectedEmpIds = [];
    if (bioIds.length) {
      const ph = bioIds.map(() => '?').join(',');
      affectedEmpIds = (await db.all(`SELECT id FROM employees WHERE biometric_user_id IN (${ph})`, ...bioIds)).map(e => e.id);
    }

    const punchDel = await db.run('DELETE FROM biometric_punches WHERE import_batch = ?', id);
    const punchesRemoved = punchDel.changes || 0;

    let recompute = { employees: 0, daysWritten: 0, daysDeleted: 0 };
    if (affectedEmpIds.length) recompute = await recomputeAttendance({ employeeIds: affectedEmpIds });

    // Remove auto-created master rows only if nothing else depends on them now.
    const createdEmpIds = safeParseIds(log.created_employee_ids);
    const createdDevIds = safeParseIds(log.created_device_ids);
    let employeesRemoved = 0, employeesKept = 0;
    for (const empId of createdEmpIds) {
      const emp = await db.get('SELECT biometric_user_id FROM employees WHERE id = ?', empId);
      if (!emp) continue;
      const stillPunching = emp.biometric_user_id
        ? await db.get('SELECT 1 AS x FROM biometric_punches WHERE biometric_user_id = ? LIMIT 1', emp.biometric_user_id) : null;
      const hasAtt = await db.get('SELECT 1 AS x FROM attendance_records WHERE employee_id = ? LIMIT 1', empId);
      const hasLeave = await db.get('SELECT 1 AS x FROM leave_requests WHERE employee_id = ? LIMIT 1', empId);
      const hasPay = await db.get('SELECT 1 AS x FROM payslips WHERE employee_id = ? LIMIT 1', empId);
      const hasCorr = await db.get('SELECT 1 AS x FROM attendance_corrections WHERE employee_id = ? LIMIT 1', empId);
      const isManager = await db.get('SELECT 1 AS x FROM employees WHERE manager_id = ? LIMIT 1', empId);
      if (stillPunching || hasAtt || hasLeave || hasPay || hasCorr || isManager) employeesKept += 1;
      else { await db.run('DELETE FROM employees WHERE id = ?', empId); employeesRemoved += 1; }
    }
    let devicesRemoved = 0;
    for (const devId of createdDevIds) {
      const stillPunching = await db.get('SELECT 1 AS x FROM biometric_punches WHERE device_id = ? LIMIT 1', devId);
      if (!stillPunching) { await db.run('DELETE FROM devices WHERE id = ?', devId); devicesRemoved += 1; }
    }

    await db.run('UPDATE sync_logs SET reverted_at = ?, status = ?, message = ? WHERE id = ?',
      new Date().toISOString(), 'REVERTED', String(`Reverted: ${punchesRemoved} punches removed, ${recompute.employees} employee(s) rebuilt.`).slice(0, 1000), id);

    await audit(req, 'ingestion.revert', {
      entityType: 'data_source', entityId: log.source_id || id,
      summary: `Reverted import '${log.source_name}' (${id}): ${punchesRemoved} punches removed`,
      details: { sourceName: log.source_name, punchesRemoved, employeesRemoved, employeesKept, devicesRemoved, recompute }
    });
    return res.json({
      success: true,
      result: { punchesRemoved, employeesRemoved, employeesKept, devicesRemoved, attendanceRebuilt: recompute.employees, daysDeleted: recompute.daysDeleted }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;