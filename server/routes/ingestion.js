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
const { sniff } = require('../services/fileSniffer');
const smart = require('../services/smartIngest');
const { FIELD_SPEC } = require('../services/fieldSpec');
const punch = require('../services/punchFileImporter');
const { buildPrefilledTemplate } = require('../services/excelTemplateService');
const { writeSyncLog, finishSyncLog, updateSyncLogProgress } = require('../services/syncLogger');
const { requireAuth } = require('../middleware/authGuard');
const { accessGuard, requirePerm } = require('../middleware/accessGuard');
const { audit, diffFields } = require('../services/auditService');

// Data Sources management is an admin surface (SETTINGS_VIEW to read, SETTINGS_EDIT to mutate)
router.use(requireAuth, accessGuard, requirePerm('SETTINGS_VIEW'));

function makeId(prefix) {
  return `${prefix}_${Date.now()}${crypto.randomBytes(3).toString('hex')}`;
}

// ── Smart roster ingestion helpers (shared by /roster/parse + /roster/apply) ──
// Read a raw request body into a Buffer (roster/punch files are posted as octet-stream).
function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('error', reject);
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// Apply an admin-corrected mapping over the engine's auto-mapping. `override` is
// { fieldKey: columnIndex | null } — null un-maps a field, an index pins a column.
function buildMappingOverride(sheet, override) {
  const base = smart.mapColumns(sheet.columns);
  if (!override || typeof override !== 'object') return base;
  const mapping = { ...base.mapping };
  for (const [k, col] of Object.entries(override)) {
    if (!Object.prototype.hasOwnProperty.call(mapping, k)) continue;
    if (col === null || col === undefined || col === -1) { mapping[k] = { column: null, header: null, confidence: 'none' }; continue; }
    const c = sheet.columns.find(cc => cc.index === Number(col));
    mapping[k] = { column: Number(col), header: c ? c.header : `Column ${col}`, confidence: 'manual' };
  }
  const used = new Set(Object.values(mapping).filter(m => m.column != null).map(m => m.column));
  const unmappedColumns = sheet.columns.filter(c => c.header && !used.has(c.index)).map(c => ({ index: c.index, header: c.header }));
  return { mapping, unmappedColumns };
}

// Parse + map a sniffed roster buffer into canonical rows (used by parse + apply).
function rowsFromRoster(raw, fileName, opts = {}) {
  const sniffed = sniff(raw, fileName);
  const idx = Number.isInteger(opts.sheetIndex) ? opts.sheetIndex : sniffed.bestSheetIndex;
  const sheet = sniffed.sheets[idx] || sniffed.sheets[sniffed.bestSheetIndex];
  if (!sheet || !sheet.columns.length) throw new Error('No readable columns found in this file.');
  const { mapping, unmappedColumns } = buildMappingOverride(sheet, opts.mapping);
  const rows = smart.buildEmployeeRows(sheet, mapping);
  return { sniffed, sheet, sheetIndex: sniffed.sheets.indexOf(sheet), mapping, unmappedColumns, rows };
}

// Flag obvious data-quality issues so the admin can eyeball them before confirming.
function detectAnomalies(rows) {
  const warnings = [];
  const seen = new Set(); const dup = new Set();
  for (const r of rows) { const id = r.biometricUserId; if (id) { if (seen.has(id)) dup.add(id); seen.add(id); } }
  if (dup.size) warnings.push({ type: 'duplicate_biometric_ids', message: `Duplicate Biometric ID(s) in file: ${[...dup].slice(0, 10).join(', ')}`, count: dup.size });
  const badDates = rows.filter(r => (r.dateOfJoining && !/^\d{4}-\d{2}-\d{2}$/.test(r.dateOfJoining)) || (r.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(r.dateOfBirth))).length;
  if (badDates) warnings.push({ type: 'invalid_dates', message: `${badDates} row(s) have an unparsable date`, count: badDates });
  const neg = rows.filter(r => r.baseCtc && Number(r.baseCtc) < 0).length;
  if (neg) warnings.push({ type: 'negative_salary', message: `${neg} row(s) have a negative salary`, count: neg });
  const noName = rows.filter(r => !r.fullName).length;
  if (noName) warnings.push({ type: 'missing_name', message: `${noName} row(s) have no name`, count: noName });
  return warnings;
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
        // CSV / XLSX / XLS / ODS punch export (user id + timestamp columns).
        try { preview = await punch.previewPunchFile(raw, fileName); }
        catch (pe) {
          return res.status(400).json({ error: 'Unrecognized file. For punches, expected a ZKTeco ATTLOG .dat, a SQLite (.db), a SQL text dump, or a punch spreadsheet (CSV/XLSX with a User ID + timestamp column). If this is an employee list, upload it under "Employee / Roster Master" below.' });
        }
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
        // CSV / XLSX / XLS / ODS punch export → same bulk-ingest pipeline as ATTLOG.
        try {
          summary = await punch.importPunchFile({
            buffer: raw, fileName,
            deviceSerial: req.headers['x-device-serial'] ? String(req.headers['x-device-serial']) : null,
            sourceId, sourceName, options
          });
        } catch (pe) {
          return res.status(400).json({ error: pe.message });
        }
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

// ── 7b. Live import progress (polled by the UI while /upload is mid-flight) ──
// The /upload serverless invocation streams counts into the RUNNING sync_logs row
// (shared DB), so this separate read-only request can observe them cross-instance.
// Returns the newest still-RUNNING file import; null once it finishes.
router.get('/progress', async (req, res) => {
  try {
    const row = await db.get(`
      SELECT id, records_found, records_imported
      FROM sync_logs
      WHERE status = 'RUNNING' AND sync_type IN ('FILE_IMPORT', 'FILE_PULL', 'API_PULL', 'MANUAL')
      ORDER BY started_at DESC LIMIT 1
    `);
    return res.json({
      success: true,
      progress: row ? { logId: row.id, recordsFound: Number(row.records_found) || 0, recordsImported: Number(row.records_imported) || 0 } : null
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
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
    const empCount = await db.get(`SELECT count(*)::int AS c FROM employees WHERE status = 'ACTIVE'`);
    return res.json({ success: true, departments, shifts, employeeCount: empCount ? empCount.c : 0 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 12b. Master sheet template for first-time onboarding (bulk employee upload).
router.get('/roster/template', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const departments = await db.all('SELECT name FROM departments ORDER BY name');
    const shifts = await db.all('SELECT name FROM shifts ORDER BY name');
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['Biometric ID*', 'Employee Code', 'Full Name*', 'Gender', 'Department', 'Designation', 'Shift', 'Date of Joining', 'Base CTC', 'Email', 'Mobile'],
      ['1024', '', 'Anita Sharma', 'Female', (departments[0] || {}).name || '', 'Staff Nurse', (shifts[0] || {}).name || '', '2026-01-15', '18000', 'anita@example.com', '9876543210'],
      [],
      ['# Biometric ID* = numeric user number from the attendance device (required to create a new employee).'],
      ['# Employee Code may be left blank - the system allocates the next number in the configured format.'],
      ['# Department and Shift must exactly match names configured in the app. Date format: YYYY-MM-DD.'],
      ['# Rows matching an existing employee (by Biometric ID or Employee Code) update safe fields only.'],
      [`# Valid departments: ${departments.map(d => d.name).join(' | ') || '(none yet)'}`],
      [`# Valid shifts: ${shifts.map(s => s.name).join(' | ') || '(none yet)'}`]
    ];
    const csv = '\uFEFF' + lines.map(r => r.map(esc).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="myHR_Employee_Master_Template.csv"');
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 12c. Smart roster PARSE (format-agnostic): sniff the uploaded file (CSV/TSV/XLSX/XLS/ODS),
// auto-map its columns onto the canonical field model, normalize values, and return a
// preview + column-mapping (editable) + capture report + warnings — nothing is written yet.
// Raw body (octet-stream) like /preview. Optional X-Options: { sheetIndex, mapping }.
router.post('/roster/parse', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const raw = await readRaw(req);
    if (!raw.length) return res.status(400).json({ error: 'No file body received. Send the roster file as raw body.' });
    const fileName = req.headers['x-file-name'] ? String(req.headers['x-file-name']) : null;
    let opts = {}; try { opts = JSON.parse(req.headers['x-options'] || '{}'); } catch (e) { /* ignore */ }

    const { sniffed, sheet, sheetIndex, mapping, unmappedColumns, rows } = rowsFromRoster(raw, fileName, opts);
    if (!rows.length) return res.status(400).json({ error: 'No employee rows detected. Ensure a Biometric ID / Name / Employee Code column is present and not hidden.' });

    const classification = await roster.analyzeRoster(rows, { apply: false });
    const warnings = detectAnomalies(rows);
    const unknownDeptShift = classification.rows.filter(r => /\(unknown\)/.test(`${r.departmentName} ${r.shiftName}`)).length;
    if (unknownDeptShift) warnings.push({ type: 'unknown_dept_shift', message: `${unknownDeptShift} row(s) name a department/shift that isn't set up — those cells are left unchanged`, count: unknownDeptShift });

    return res.json({
      success: true,
      parse: {
        fileName: fileName || null, detectedFormat: sniffed.format, sheetNames: sniffed.sheetNames, sheetIndex,
        columns: sheet.columns, fields: FIELD_SPEC.map(f => ({ key: f.key, label: f.label, group: f.group, required: f.required, type: f.type })),
        mapping, unmappedColumns,
        rowsCount: rows.length, previewRows: rows.slice(0, 200),
        summary: classification.summary, report: classification.report, warnings
      }
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// 12d. Prepopulated, gap-highlighted Employee Master (.xlsx) — current data + amber blanks
// + dropdown validation + a "Complete These Fields" gap sheet. Re-upload it after filling.
router.get('/roster/template.xlsx', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const buf = await buildPrefilledTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="myHR_Employee_Master_Prefilled.xlsx"');
    return res.send(buf);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 12e. Apply a roster. Two ways in:
//   • raw file (octet-stream) + optional X-Options { sheetIndex, mapping } → re-parses with
//     the admin's corrected mapping (preferred; keeps large files off the JSON limit); OR
//   • JSON { rows: [canonical...] } (small/manual payloads, backward-compatible).
// Writes a MANUAL sync log so it appears in history + /progress streams row counts.
router.post('/roster/apply', requirePerm('EMPLOYEES_EDIT'), async (req, res) => {
  let logId;
  try {
    const ct = req.headers['content-type'] || '';
    let rows;
    if (ct.includes('application/json') && Array.isArray(req.body?.rows)) {
      rows = req.body.rows;
    } else {
      const raw = await readRaw(req);
      if (!raw.length) return res.status(400).json({ error: 'No file body received.' });
      const fileName = req.headers['x-file-name'] ? String(req.headers['x-file-name']) : null;
      let opts = {}; try { opts = JSON.parse(req.headers['x-options'] || '{}'); } catch (e) { /* ignore */ }
      rows = rowsFromRoster(raw, fileName, opts).rows;
    }
    if (!rows || !rows.length) return res.status(400).json({ error: 'No rows to apply' });
    if (rows.length > 5000) return res.status(400).json({ error: 'Too many rows (max 5000)' });

    const sourceName = req.headers['x-source-name'] ? String(req.headers['x-source-name']) : 'Employee Roster Import';
    logId = `sync_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    await writeSyncLog({ id: logId, sourceId: null, sourceName, syncType: 'MANUAL', startedAt: new Date().toISOString(), message: `Roster import started (${rows.length} rows)` });
    await updateSyncLogProgress(logId, { recordsFound: rows.length, recordsImported: 0 });
    let lastEmit = 0;
    const onProgress = async (done) => { if (done - lastEmit >= 25 || done === rows.length) { lastEmit = done; await updateSyncLogProgress(logId, { recordsImported: done }); } };

    const result = await roster.analyzeRoster(rows, { apply: true, onProgress });

    let recompute = null;
    if (result.recomputeEmployeeIds.length) recompute = await recomputeAttendance({ employeeIds: result.recomputeEmployeeIds });

    const applied = result.summary.updated + result.summary.created;
    const status = result.summary.errors ? (applied ? 'PARTIAL' : 'FAILED') : 'SUCCESS';
    const message = `Roster applied: ${result.summary.updated} updated, ${result.summary.created} created, ${result.summary.errors} error(s). Field capture ${result.report.totalCoveragePct}%; ${result.report.enrichmentGaps.length} enrichment field(s) still incomplete.`;
    await finishSyncLog(logId, status, {
      recordsFound: rows.length, recordsImported: applied, recordsSkipped: result.summary.errors,
      employeesCreated: result.summary.created, devicesCreated: 0
    }, message);

    await audit(req, 'ingestion.roster_apply', {
      entityType: 'employee', entityId: 'roster_smart',
      summary: message,
      details: { ...result.summary, capture: { coveragePct: result.report.totalCoveragePct, coreGaps: result.report.coreGaps.length, enrichmentGaps: result.report.enrichmentGaps.length }, recomputed: recompute }
    });
    return res.json({ success: true, result: result.summary, report: result.report, recompute, syncLogId: logId });
  } catch (err) {
    if (logId) await finishSyncLog(logId, 'FAILED', {}, err.message).catch(() => {});
    return res.status(400).json({ error: err.message });
  }
});

// Legacy JSON preview path (kept for the Employees panel / small manual payloads).
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