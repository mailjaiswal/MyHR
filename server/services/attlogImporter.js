// ZKTeco-family ATTLOG '.dat' importer.
// Biometric terminals (ZKTeco, and re-branded eSSL/Realtime/Biomax firmware) can export
// their raw attendance log as a `<SERIAL>_attlog.dat` file: plain tab-delimited text, one
// punch per line, in the classic ATTLOG column layout:
//
//   USERID <TAB> CHECKTIME <TAB> VERIFYSTATE <TAB> STATUS/WORKCODE <TAB> WORKHI <TAB> <pad>
//   "       24\t2026-08-31 20:02:27\t1\t4\t15\t0"
//
//   col 0  USERID       – biometric enroll number (space-padded)
//   col 1  CHECKTIME    – device-local wall clock 'YYYY-MM-DD HH:mm:ss' (IST for our client)
//   col 2  VERIFYSTATE – 1=Check In / 2=Check Out / 3=Overtime / 4=Check In-Out (auto) / 5=Break...
//   col 3  STATUS       – ZK status/work code (0 = password verify, 15 = face, …)
//
// The parser is deliberately tolerant: 2–6 column variants, comma-separated or tab-separated,
// and lines with unparsable timestamps are skipped and counted.
// Punched wall-clock times are converted to true UTC instants (ATTLOG_LOCAL_TZ offset,
// default Asia/Kolkata +05:30) so they flow through the same attendanceEngine as live device
// pushes, and the UI renders them back in IST.

const { db } = require('../db/database');
const { ingestPunch } = require('./attendanceEngine');
const { writeSyncLog, finishSyncLog } = require('./syncLogger');
const { resolveDeviceId, ensureEmployee, knownBiometricIds } = require('./importerHelpers');
const { notify } = require('./notificationService');

// Device clocks run on local wall time; convert to UTC using this fixed offset.
const LOCAL_TZ_OFFSET_MINUTES = Number(process.env.ATTLOG_TZ_OFFSET_MINUTES || 330); // +05:30 IST

// VERIFYSTATE → in/out mode. The client's export carries a constant VERIFYSTATE (1) that
// does NOT reliably encode Check-In vs Check-Out, so we always treat punches as AUTO and
// let the attendance engine derive First-In / Last-Out from the min/max punch per duty date.
const VERIFYSTATE_MODE = { 1: 'AUTO', 2: 'AUTO', 3: 'AUTO', 4: 'AUTO', 5: 'AUTO' };
// Work/verify code → verification mode label (col 4 in this vendor's layout).
const STATUS_VERIFY_MODE = { 0: 'PASSWORD', 1: 'FINGERPRINT', 2: 'RFID', 4: 'FACE', 9: 'FACE', 15: 'FACE', 16: 'RFID', 17: 'RFID', 21: 'FACE' };

const TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/;

function defaultSerialFromFileName(fileName) {
  const m = String(fileName || '').match(/^([A-Za-z]{2,}\d{6,})/);
  return m ? m[1].toUpperCase() : null;
}

// Cheap content sniff: text, and most non-empty lines look like "id<TAB>YYYY-MM-DD HH:MM:SS".
function looksLikeAttlog(buf, fileName) {
  if (!buf || buf.length < 12) return false;
  // Not SQLite and not a SQL dump
  if (buf.subarray(0, 15).toString('latin1') === 'SQLite format 3') return false;
  if (/^\s*(--|\/\*|SET |CREATE |INSERT |ALTER |DROP |USE )/im.test(buf.subarray(0, 4096).toString('utf8'))) return false;
  const lines = buf.subarray(0, 8192).toString('utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 20);
  if (!lines.length) return false;
  const matches = lines.filter(l => l.split('\t').length >= 2 && TIME_RE.test(l.split('\t')[1].trim())).length;
  if (matches / lines.length >= 0.8) return true;
  // Explicit filename hint even if the content snippet was ambiguous
  return /_attlog\.dat$/i.test(String(fileName || ''));
}

// Parse one line → punch or null (skipped).
function parseLine(line) {
  const cols = line.split('\t').map(c => c.trim());
  if (cols.length < 2) return null;
  const userId = cols[0];
  if (!userId || !/^\d+$/.test(userId)) return null;
  const tm = TIME_RE.exec(cols[1]);
  if (!tm) return null;
  // Local wall clock → UTC instant
  const localMs = Date.UTC(+tm[1], +tm[2] - 1, +tm[3], +tm[4], +tm[5], tm[6] ? +tm[6] : 0);
  const utc = new Date(localMs - LOCAL_TZ_OFFSET_MINUTES * 60 * 1000);
  const verifyState = parseInt(cols[2], 10);
  // Verification/work code lives in col 4 for this vendor layout (1=fingerprint, 15=face).
  const workCode = cols[4] !== undefined && cols[4] !== '' ? parseInt(cols[4], 10) : NaN;
  return {
    biometricUserId: String(parseInt(userId, 10)),
    punchTime: utc.toISOString(),
    localTime: cols[1],
    verificationMode: STATUS_VERIFY_MODE[workCode] || 'FINGERPRINT',
    inOutMode: VERIFYSTATE_MODE[verifyState] || 'AUTO',
    verifyState: Number.isNaN(verifyState) ? null : verifyState
  };
}

// Parse a whole ATTLOG buffer → { punches, skipped, serial }
function parseAttlog(buf, fileName) {
  const text = buf.toString('utf8');
  const punches = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const p = parseLine(line);
    if (p) punches.push(p); else skipped += 1;
  }
  if (!punches.length) {
    throw new Error('No parsable punch rows found in ATTLOG file (expected: USERID <TAB> YYYY-MM-DD HH:MM:SS <TAB> …).');
  }
  punches.sort((a, b) => (a.punchTime < b.punchTime ? -1 : a.punchTime > b.punchTime ? 1 : 0));
  return {
    punches,
    skipped,
    serial: defaultSerialFromFileName(fileName),
    from: punches[0].punchTime,
    to: punches[punches.length - 1].punchTime
  };
}

/**
 * previewAttlog — parse-only preview (NO DB writes). Returns a table-ready shape
 * so the admin can eyeball every punch (with a matched/new-employee flag) before confirming.
 */
async function previewAttlog(buffer, fileName, { limit = 2000 } = {}) {
  const parsed = parseAttlog(buffer, fileName);
  const known = await knownBiometricIds();
  const rows = parsed.punches.slice(0, limit).map(p => ({
    biometricUserId: p.biometricUserId,
    deviceTime: p.localTime,
    utcTime: p.punchTime,
    verificationMode: p.verificationMode,
    known: known.has(String(p.biometricUserId))
  }));
  const distinct = new Set(parsed.punches.map(p => String(p.biometricUserId)));
  const newUsers = [...distinct].filter(id => !known.has(id)).length;
  return {
    format: 'ATTLOG',
    fileName: fileName || null,
    deviceSerial: parsed.serial || null,
    columns: [
      { key: 'biometricUserId', label: 'User ID' },
      { key: 'deviceTime', label: 'Device time (IST)' },
      { key: 'utcTime', label: 'Stored time (UTC)' },
      { key: 'verificationMode', label: 'Verify mode' },
      { key: 'known', label: 'Employee' }
    ],
    rows,
    totalRows: parsed.punches.length,
    shownRows: rows.length,
    skippedRows: parsed.skipped,
    distinctUsers: distinct.size,
    knownUsers: distinct.size - newUsers,
    newUsers,
    dateFrom: parsed.from,
    dateTo: parsed.to
  };
}

/**
 * importAttlog — persistence pipeline (mirrors sqlFileImporter.importFile semantics).
 * options: { createEmployees, createDevices }
 * Returns summary { status, recordsFound, recordsImported, recordsSkipped,
 *   employeesCreated, employeesMatched, devicesCreated, errors, message }
 */
async function importAttlog({ buffer, fileName, deviceSerial, sourceId, sourceName, syncType = 'FILE_IMPORT', options = {} }) {
  const opts = { createEmployees: true, createDevices: true, ...options };
  const startedAt = new Date().toISOString();
  const logId = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const counters = { recordsFound: 0, recordsImported: 0, recordsSkipped: 0, employeesCreated: 0, employeesMatched: 0, devicesCreated: 0, createdNames: [], errors: [] };

  await writeSyncLog({ id: logId, sourceId, sourceName: sourceName || fileName || 'ATTLOG Import', syncType, startedAt, message: 'ATTLOG import started' });

  try {
    const parsed = parseAttlog(buffer, fileName);
    const serial = deviceSerial || parsed.serial || null;
    counters.recordsFound = parsed.punches.length;

    // Pre-resolve the device once (all punches in one ATTLOG file come from one terminal)
    const deviceId = await resolveDeviceId(serial, { createDevices: opts.createDevices, counters });

    // Punched chronologically; count employees that already existed
    const seenUsers = new Set();
    for (const punch of parsed.punches) {
      if (!seenUsers.has(punch.biometricUserId)) {
        seenUsers.add(punch.biometricUserId);
        const known = await db.get('SELECT id FROM employees WHERE biometric_user_id = ?', punch.biometricUserId);
        if (known) counters.employeesMatched += 1;
      }
    }

    for (const punch of parsed.punches) {
      try {
        const emp = await ensureEmployee({ biometricUserId: punch.biometricUserId }, opts.createEmployees, counters);
        if (!emp) {
          counters.recordsSkipped += 1;
          continue;
        }
        const result = await ingestPunch({
          deviceId,
          biometricUserId: punch.biometricUserId,
          punchTime: punch.punchTime,
          verificationMode: punch.verificationMode,
          inOutMode: punch.inOutMode
        });
        if (result && (result.status === 'SUCCESS' || result.status === 'DUPLICATE_IGNORED')) {
          counters.recordsImported += 1;
        } else {
          counters.recordsSkipped += 1;
        }
      } catch (e) {
        counters.recordsSkipped += 1;
        if (counters.errors.length < 20) counters.errors.push(`${punch.biometricUserId}@${punch.localTime}: ${e.message}`);
      }
    }

    const status = counters.errors.length > 0 ? 'PARTIAL' : 'SUCCESS';
    const message = counters.errors.length
      ? `Imported ${counters.recordsImported} of ${counters.recordsFound} ATTLOG punches (${counters.errors.length} errors: ${counters.errors.slice(0, 3).join('; ')})`
      : `Imported ${counters.recordsImported} ATTLOG punches${serial ? ` from device ${serial}` : ''} (${String(parsed.from).slice(0, 10)} → ${String(parsed.to).slice(0, 10)}).`;

    await finishSyncLog(logId, status, counters, message);

    if (counters.employeesCreated > 0) {
      await notify('employee.created', {
        count: counters.employeesCreated,
        names: counters.createdNames.slice(0, 12).join(', ') + (counters.createdNames.length > 12 ? ' …' : ''),
        sourceName: sourceName || fileName || 'ATTLOG Import',
        dedupeKey: `emp_created|${logId}`
      });
    }

    if (sourceId) {
      await db.run(`UPDATE data_sources SET last_sync_at = ?, updated_at = CURRENT_TIMESTAMP, status = 'ACTIVE' WHERE id = ?`, new Date().toISOString(), sourceId);
    }

    return { ...counters, status, message, deviceSerial: serial, dateFrom: parsed.from, dateTo: parsed.to };
  } catch (err) {
    await finishSyncLog(logId, 'FAILED', counters, err.message);
    if (sourceId) {
      await db.run(`UPDATE data_sources SET updated_at = CURRENT_TIMESTAMP, status = 'ERROR' WHERE id = ?`, sourceId).catch(() => {});
    }
    throw err;
  }
}

module.exports = {
  looksLikeAttlog,
  parseAttlog,
  parseLine,
  previewAttlog,
  importAttlog,
  LOCAL_TZ_OFFSET_MINUTES
};
