// Tabular punch-file importer — the spreadsheet/CSV counterpart to attlogImporter.
// Modern biometric terminals and vendor web-apps increasingly export the raw log as a
// CSV / XLSX / XLS / ODS table (columns like USERID · CHECKTIME · VERIFYSTATE) rather than
// the classic `_attlog.dat` text file. This module sniffs such a file, locates the punch
// columns, canonicalizes each row into { biometricUserId, punchTime, verificationMode,
// inOutMode } (device wall-clock → true UTC, same offset as attlog), then feeds the very
// same `bulkIngestPunches` pipeline the ATTLOG path uses — identical device resolution,
// import-batch tagging, live-progress sync log, and dedup. No behavior forks.
const { db } = require('../db/database');
const { bulkIngestPunches } = require('./attendanceEngine');
const { writeSyncLog, finishSyncLog, updateSyncLogProgress } = require('./syncLogger');
const { attachDaySummary } = require('./daySummaryService');
const { resolveDeviceId, ensureEmployee, knownBiometricIds } = require('./importerHelpers');
const { notify } = require('./notificationService');
const { sniff } = require('./fileSniffer');
const { LOCAL_TZ_OFFSET_MINUTES } = require('./attlogImporter');

// VERIFYSTATE / work-code → verification mode label (mirrors attlogImporter).
const STATUS_VERIFY_MODE = { 0: 'PASSWORD', 1: 'FINGERPRINT', 2: 'RFID', 4: 'FACE', 9: 'FACE', 15: 'FACE', 16: 'RFID', 17: 'RFID', 21: 'FACE' };
// Textual verify-mode cells ("Face", "Fingerprint", …) → canonical enum.
const VERIFY_MODE_TEXT = {
  fingerprint: 'FINGERPRINT', finger: 'FINGERPRINT', face: 'FACE', card: 'CARD', rfid: 'RFID',
  password: 'PASSWORD', pin: 'PASSWORD', 'id card': 'CARD', idcard: 'CARD'
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Which punch columns does a sheet header row expose?
function mapPunchColumns(columns) {
  const find = (...needles) => {
    for (const c of columns) {
      if (!c.normalized) continue;
      if (needles.some(n => c.normalized === n)) return c.index;
    }
    for (const c of columns) {
      if (!c.normalized) continue;
      if (needles.some(n => c.normalized.includes(n))) return c.index;
    }
    return null;
  };
  const user = find('userid', 'biometricid', 'biometricuserid', 'pin', 'biodata', 'cardno', 'empid', 'employeenoid', 'badgeno', 'sn', 'ino', 'no');
  const datetime = find('checktime', 'punchtime', 'datetime', 'timestamp', 'timeanddate', 'attenddate', 'clocktime', 'date');
  // A separate time-only column (some exports split DATE and TIME).
  const timeCol = find('checktime', 'punchtime', 'time', 'clock');
  const verify = find('verify-state', 'verifystate', 'verify', 'status', 'workcode', 'mode', 'method', 'type');
  return { user, datetime, timeCol, verify };
}

// A cell → a true-UTC ISO instant from a device wall-clock reading. Accepts Date objects
// (SheetJS cellDates), 'YYYY-MM-DD HH:mm:ss', 'DD/MM/YYYY HH:mm', or date + separate time.
function toUtcInstant(dateVal, timeVal) {
  const offset = LOCAL_TZ_OFFSET_MINUTES * 60 * 1000;
  let y, mo, d, hh = 0, mi = 0, ss = 0;
  const dv = dateVal;
  if (dv instanceof Date && !isNaN(dv.getTime())) {
    y = dv.getFullYear(); mo = dv.getMonth(); d = dv.getDate();
    hh = dv.getHours(); mi = dv.getMinutes(); ss = dv.getSeconds();
  } else {
    const s = String(dv ?? '').trim();
    if (!s) return null;
    // ISO-ish first: YYYY-MM-DD[T ]HH:MM[:SS]
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (m) {
      y = +m[1]; mo = +m[2] - 1; d = +m[3]; hh = +(m[4] || 0); mi = +(m[5] || 0); ss = +(m[6] || 0);
    } else {
      // Day-first DD/MM/YYYY or DD-MM-YYYY with optional time (Indian convention).
      m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
      if (!m) { const p = new Date(s); if (isNaN(p.getTime())) return null; y = p.getFullYear(); mo = p.getMonth(); d = p.getDate(); hh = p.getHours(); mi = p.getMinutes(); ss = p.getSeconds(); }
      else {
        let dd = +m[1], mm = +m[2], yy = +m[3];
        if (mm > 12 && dd <= 12) { const t = dd; dd = mm; mm = t; }   // month-first file
        if (yy < 100) yy += 2000;
        y = yy; mo = mm - 1; d = dd; hh = +(m[4] || 0); mi = +(m[5] || 0); ss = +(m[6] || 0);
      }
    }
  }
  // A separate TIME column overrides a midnight-only date cell.
  if (timeVal != null && !(dv instanceof Date)) {
    const ts = String(timeVal).trim();
    const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i.exec(ts);
    if (tm) {
      let H = +tm[1]; const M = +tm[2], S = +(tm[3] || 0); const ap = tm[4] && tm[4].toLowerCase().replace(/\./g, '');
      if (ap === 'pm' && H < 12) H += 12; else if (ap === 'am' && H === 12) H = 0;
      hh = H; mi = M; ss = S;
    }
  }
  if (y == null || mo == null || d == null) return null;
  const localMs = Date.UTC(y, mo, d, hh, mi, ss);
  return new Date(localMs - offset).toISOString();
}

function resolveVerifyMode(raw) {
  if (raw === '' || raw == null) return 'FINGERPRINT';
  const asNum = Number(String(raw).trim());
  if (Number.isInteger(asNum) && STATUS_VERIFY_MODE[asNum]) return STATUS_VERIFY_MODE[asNum];
  const t = VERIFY_MODE_TEXT[norm(raw)];
  return t || 'FINGERPRINT';
}

// Sniffed buffer → parsed punches, or throws if the file isn't a recognizable punch log.
function parsePunchFile(buffer, fileName) {
  const sniffed = sniff(buffer, fileName);
  let sheet = null, cols = null;
  for (const s of sniffed.sheets) {
    const c = mapPunchColumns(s.columns);
    if (c.user != null && c.datetime != null) { sheet = s; cols = c; break; }
  }
  if (!sheet) throw new Error('This tabular file has no recognizable punch columns (a user/PIN plus a check-in timestamp/date). If it is an employee list, upload it in the "Employee / Roster Master" section instead.');

  const punches = [];
  let skipped = 0;
  const dateCol = cols.datetime;
  // If the datetime column already carries a time component, don't double-count a time col.
  const sampleHasTime = sheet.rows.some(r => {
    const v = r[dateCol];
    if (v instanceof Date) return v.getHours() || v.getMinutes();
    return /\d{1,2}:\d{2}/.test(String(v || ''));
  });
  const timeCol = (!sampleHasTime && cols.timeCol != null && cols.timeCol !== dateCol) ? cols.timeCol : null;

  for (const row of sheet.rows) {
    const uid = String(row[cols.user] ?? '').trim();
    if (!uid || !/^\d+$/.test(uid.replace(/\b0+(?=\d)/, ''))) { skipped += 1; continue; }
    const iso = toUtcInstant(row[dateCol], timeCol != null ? row[timeCol] : null);
    if (!iso) { skipped += 1; continue; }
    punches.push({
      biometricUserId: String(parseInt(uid, 10)),
      punchTime: iso,
      verificationMode: resolveVerifyMode(cols.verify != null ? row[cols.verify] : ''),
      inOutMode: 'AUTO'
    });
  }
  if (!punches.length) throw new Error('No parsable punch rows found (need a numeric user id and a valid date/time per row).');
  punches.sort((a, b) => (a.punchTime < b.punchTime ? -1 : a.punchTime > b.punchTime ? 1 : 0));
  return {
    punches, skipped, sheetName: sheet.name,
    from: punches[0].punchTime, to: punches[punches.length - 1].punchTime
  };
}

// Cheap routing hint used by the ingestion /preview handler.
function looksLikePunchFile(buffer, fileName) {
  try { parsePunchFile(buffer, fileName); return true; } catch { return false; }
}

// Parse-only preview (NO DB writes), same table shape as previewAttlog.
async function previewPunchFile(buffer, fileName, { limit = 2000 } = {}) {
  const parsed = parsePunchFile(buffer, fileName);
  const known = await knownBiometricIds();
  const rows = parsed.punches.slice(0, limit).map(p => ({
    biometricUserId: p.biometricUserId,
    deviceTime: p.punchTime,
    utcTime: p.punchTime,
    verificationMode: p.verificationMode,
    known: known.has(String(p.biometricUserId))
  }));
  const distinct = new Set(parsed.punches.map(p => String(p.biometricUserId)));
  const newUsers = [...distinct].filter(id => !known.has(id)).length;
  return {
    format: 'PUNCH_TABLE',
    fileName: fileName || null,
    deviceSerial: null,
    columns: [
      { key: 'biometricUserId', label: 'User ID' },
      { key: 'utcTime', label: 'Punch time (UTC)' },
      { key: 'verificationMode', label: 'Verify mode' },
      { key: 'known', label: 'Employee' }
    ],
    rows, totalRows: parsed.punches.length, shownRows: rows.length, skippedRows: parsed.skipped,
    distinctUsers: distinct.size, knownUsers: distinct.size - newUsers, newUsers,
    dateFrom: parsed.from, dateTo: parsed.to
  };
}

// Persistence pipeline — mirrors attlogImporter.importAttlog so the guided UI + sync logs
// behave identically regardless of whether the punches came from a .dat or a spreadsheet.
async function importPunchFile({ buffer, fileName, deviceSerial, sourceId, sourceName, syncType = 'FILE_IMPORT', options = {} }) {
  const opts = { createEmployees: true, createDevices: true, ...options };
  const startedAtMs = Date.now();
  const startedAt = new Date().toISOString();
  const logId = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const counters = { recordsFound: 0, recordsImported: 0, recordsSkipped: 0, newPunches: 0, employeesCreated: 0, employeesMatched: 0, devicesCreated: 0, createdNames: [], createdEmployeeIds: [], createdDeviceIds: [], errors: [], duplicatePunches: [] };

  await writeSyncLog({ id: logId, sourceId, sourceName: sourceName || fileName || 'Punch File Import', syncType, startedAt, message: 'Punch file import started' });

  try {
    const parsed = parsePunchFile(buffer, fileName);
    counters.recordsFound = parsed.punches.length;
    const totalRows = parsed.punches.length;
    await updateSyncLogProgress(logId, { recordsFound: totalRows, recordsImported: 0 });

    const deviceId = await resolveDeviceId(deviceSerial || null, { createDevices: opts.createDevices, counters });

    const bulk = await bulkIngestPunches({
      deviceId,
      punches: parsed.punches.map(p => ({ biometricUserId: p.biometricUserId, punchTime: p.punchTime, verificationMode: p.verificationMode, inOutMode: p.inOutMode })),
      importBatch: logId,
      sourceId,
      onProgress: async (done) => { await updateSyncLogProgress(logId, { recordsImported: Math.min(done, totalRows) }); },
      ensureEmployee: opts.createEmployees ? (args) => ensureEmployee(args, true, counters) : null
    });

    counters.newPunches = bulk.newPunches;
    counters.duplicatePunches = bulk.duplicateList;
    counters.employeesMatched = bulk.employeesMatched;
    counters.employeesCreated = bulk.employeesCreated;
    counters.recordsImported = bulk.newPunches + bulk.duplicatePunches;
    counters.recordsSkipped = bulk.recordsSkipped + parsed.skipped;
    counters.errors = bulk.errors || [];

    await updateSyncLogProgress(logId, { recordsImported: totalRows });

    const durationMs = Date.now() - startedAtMs;
    const status = (counters.errors.length && counters.recordsImported === 0) ? 'FAILED' : (counters.errors.length ? 'PARTIAL' : 'SUCCESS');
    const message = counters.errors.length
      ? `Imported ${counters.recordsImported} of ${counters.recordsFound} punches (${counters.errors.length} errors: ${counters.errors.slice(0, 3).join('; ')})`
      : `Imported ${counters.recordsImported} punches from ${fileName || 'spreadsheet'} (${String(parsed.from).slice(0, 10)} → ${String(parsed.to).slice(0, 10)}).`;

    await finishSyncLog(logId, status, counters, message);

    const daySummary = await attachDaySummary(logId, { duplicatePunches: counters.duplicatePunches, startedAtIso: startedAt });

    if (counters.employeesCreated > 0) {
      await notify('employee.created', {
        count: counters.employeesCreated,
        names: counters.createdNames.slice(0, 12).join(', ') + (counters.createdNames.length > 12 ? ' …' : ''),
        sourceName: sourceName || fileName || 'Punch File Import',
        dedupeKey: `emp_created|${logId}`
      });
    }

    if (sourceId) {
      await db.run(`UPDATE data_sources SET last_sync_at = ?, updated_at = CURRENT_TIMESTAMP, status = 'ACTIVE' WHERE id = ?`, new Date().toISOString(), sourceId);
    }

    return { ...counters, status, message, durationMs, daySummary, deviceSerial: deviceSerial || null, dateFrom: parsed.from, dateTo: parsed.to };
  } catch (err) {
    await finishSyncLog(logId, 'FAILED', counters, err.message);
    if (sourceId) {
      await db.run(`UPDATE data_sources SET updated_at = CURRENT_TIMESTAMP, status = 'ERROR' WHERE id = ?`, sourceId).catch(() => {});
    }
    throw err;
  }
}

module.exports = { looksLikePunchFile, parsePunchFile, previewPunchFile, importPunchFile };
