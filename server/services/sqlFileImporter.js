// Biometric vendor SQL database importer.
// Biometric machines (ZKTeco BioTime, eSSL, Realtime, etc.) export their attendance data
// as a SQL database file. This service:
//   1. Opens the uploaded/pulled database (a SQLite binary, or a MySQL/SQL Server text dump
//      materialised by sqlTextDumpLoader) read-only
//   2. Auto-detects the vendor's employee table (userinfo/userinfo-like) and punch table
//      (checkinout / att_log / attTable / etc.)
//   3. Maps vendor columns to our normalized biometric punch shape (optionally overridden
//      by an explicit per-source columnMap saved in data_sources.options)
//   4. Auto-creates devices + stub employees as needed, then feeds every punch through
//      the same attendanceEngine.ingestPunch pipeline used by the webhook + API sync.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { db } = require('../db/database');
const { ingestPunch } = require('./attendanceEngine');
const { writeSyncLog, finishSyncLog } = require('./syncLogger');
const { notify } = require('./notificationService');

// node:sqlite is loaded lazily so serverless runtimes (which only use PG now)
// never need it at boot; it's only required when a vendor SQL file is imported.
let DatabaseSync = null;
function getDatabaseSync() {
  if (!DatabaseSync) {
    try {
      ({ DatabaseSync } = require('node:sqlite'));
    } catch (e) {
      throw new Error('node:sqlite is unavailable in this runtime; SQL imports require Node 22+ (or the --experimental-sqlite flag on Node 20)');
    }
  }
  return DatabaseSync;
}

const SQLITE_MAGIC = 'SQLite format 3';

// True when the buffer begins with the SQLite header (i.e. a binary .db, not a text dump).
function isSqliteBuffer(buf) {
  return !!buf && buf.length >= 15 && buf.subarray(0, 15).toString('latin1') === SQLITE_MAGIC;
}

const PUNCH_TABLE_NAMES = [
  'checkinout', 'check_in_out', 'att_log', 'attlog', 'attendancelog', 'attendance_log',
  'att_record', 'attlogrecord', 'raw_scan', 'scanrecord', 'punches', 'punchlog',
  'transactions', 'transaction', 'att_punch'
];

const EMP_TABLE_NAMES = [
  'userinfo', 'users', 'user', 'employees', 'employee', 'staff', 'staffinfo',
  'emp', 'personnel', 'person', 'user_list'
];

const USER_COL_CANDIDATES = ['emp_code', 'empcode', 'employee_code', 'badgenumber', 'userid', 'user_id', 'emp_id', 'staff_id', 'staffid', 'pin', 'usernum'];
const TIME_COL_CANDIDATES = ['punch_time', 'punchtime', 'checktime', 'scan_time', 'punch_datetime', 'record_time', 'recordtime', 'datetime', 'atttime', 'att_time', 'dt_atttime', 'clogtime', 'log_time', 'time'];
const STATE_COL_CANDIDATES = ['checktype', 'in_out', 'inout', 'punch_state', 'state', 'io_mode', 'direction', 'att_type'];
const VERIFY_COL_CANDIDATES = ['verify_type', 'verifymode', 'verification_mode', 'verify_mode', 'mode', 'verifystate'];
const SERIAL_COL_CANDIDATES = ['sn', 'terminal_sn', 'devicesn', 'device_sn', 'deviceid', 'terminalid'];
const NAME_COL_CANDIDATES = ['name', 'ename', 'emp_name', 'displayname', 'staffname', 'nickname', 'full_name', 'username'];

const VERIFY_MAP = {
  0: 'FINGERPRINT', 1: 'FINGERPRINT', 2: 'FACE', 3: 'RFID',
  4: 'FACE', 11: 'FINGERPRINT', 15: 'RFID', 16: 'PALM', 17: 'PALM'
};
const STATE_MAP = { 0: 'IN', 1: 'OUT', '0': 'IN', '1': 'OUT', 'I': 'IN', 'O': 'OUT' };

function openReadOnly(filePath) {
  try {
    return new (getDatabaseSync())(filePath, { readOnly: true });
  } catch (e) {
    throw new Error(`Cannot open file as a SQLite database: ${e.message}`);
  }
}

// Robust parse of vendor punch timestamps (string ISO, "YYYY-MM-DD HH:MM:SS",
// 14-digit "YYYYMMDDHHMMSS", numeric unix seconds / ms, or Excel-like doubles).
function parseDateTime(value) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    const s = Math.floor(Math.abs(value)).toString();
    // 14-digit concat like 20190304095000 (common ZKTeco/eSSL numeric storage)
    if (s.length === 14 && !Number.isNaN(Number(s))) return fromDigits(s);
    if (value >= 1e12) return new Date(value);                          // epoch ms
    if (value >= 1e9) return new Date(value * 1000);                    // epoch sec
    return null;
  }

  const str = String(value).trim();
  if (!str) return null;

  // 14-digit concat like "20190304095000"
  if (/^\d{14}$/.test(str)) return fromDigits(str);

  // "2019-03-04 09:50:00" or "2019-03-04T09:50:00" (+ optional tz)
  let iso = str.replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(iso)) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fromDigits(digits) {
  const s = String(digits);
  const d = new Date(
    parseInt(s.slice(0, 4), 10),
    parseInt(s.slice(4, 6), 10) - 1,
    parseInt(s.slice(6, 8), 10),
    parseInt(s.slice(8, 10), 10) || 0,
    parseInt(s.slice(10, 12), 10) || 0,
    parseInt(s.slice(12, 14), 10) || 0
  );
  return d;
}

// --- handle-based internals (used by importFile so we open the DB only once) ---
function listTablesOf(dbx) {
  return dbx.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name`).all();
}

function columnsOf(dbx, table) {
  return dbx.prepare(`PRAGMA table_info("${table}")`).all().map(c => c.name);
}

function pick(columns, candidates) {
  const lowerCols = columns.map(c => c.toLowerCase());
  for (const cand of candidates) {
    const idx = lowerCols.indexOf(cand);
    if (idx >= 0) return columns[idx];
  }
  return null;
}

// Auto-detect the punch table, employee table, and column mappings from an open handle
function detectOn(dbx) {
  const tables = listTablesOf(dbx).map(t => t.name);
  if (tables.length === 0) {
    throw new Error('Uploaded SQL database contains no tables.');
  }
  const lowerByName = {};
  tables.forEach(t => { lowerByName[t.toLowerCase()] = t; });

  // 1. Punch table detection
  let punchTable = null;
  for (const cand of PUNCH_TABLE_NAMES) {
    if (lowerByName[cand]) { punchTable = lowerByName[cand]; break; }
  }
  if (!punchTable) {
    // Fallback: any table containing a user column + a time column
    for (const t of tables) {
      const cols = columnsOf(dbx, t).map(c => c.toLowerCase());
      const hasUser = USER_COL_CANDIDATES.some(c => cols.includes(c));
      const hasTime = TIME_COL_CANDIDATES.some(c => cols.includes(c));
      if (hasUser && hasTime) { punchTable = t; break; }
    }
  }

  const cfg = { table: punchTable, columns: [], userCol: null, timeCol: null, stateCol: null, verifyCol: null, serialCol: null };

  if (punchTable) {
    cfg.columns = columnsOf(dbx, punchTable);
    cfg.userCol = pick(cfg.columns, USER_COL_CANDIDATES);
    cfg.timeCol = pick(cfg.columns, TIME_COL_CANDIDATES);
    cfg.stateCol = pick(cfg.columns, STATE_COL_CANDIDATES);
    cfg.verifyCol = pick(cfg.columns, VERIFY_COL_CANDIDATES);
    cfg.serialCol = pick(cfg.columns, SERIAL_COL_CANDIDATES);
  }

  // 2. Employee table detection
  const empCfg = { table: null, columns: [], userCol: null, nameCol: null };
  let empTable = null;
  for (const cand of EMP_TABLE_NAMES) {
    if (lowerByName[cand]) { empTable = lowerByName[cand]; break; }
  }
  if (!empTable && punchTable) {
    for (const t of tables) {
      if (t.toLowerCase() === punchTable.toLowerCase()) continue;
      const cols = columnsOf(dbx, t).map(c => c.toLowerCase());
      if (USER_COL_CANDIDATES.some(c => cols.includes(c)) && NAME_COL_CANDIDATES.some(c => cols.includes(c))) {
        empTable = t; break;
      }
    }
  }
  if (empTable) {
    empCfg.table = empTable;
    empCfg.columns = columnsOf(dbx, empTable);
    empCfg.userCol = pick(empCfg.columns, USER_COL_CANDIDATES);
    empCfg.nameCol = pick(empCfg.columns, NAME_COL_CANDIDATES);
  }

  return { punch: cfg, emp: empCfg, tables };
}

// Apply an admin-provided explicit column mapping so exotic/renamed vendor schemas work
// without code changes. Only present keys override the auto-detected values.
function applyColumnMap(cfg, empCfg, columnMap) {
  if (!columnMap || typeof columnMap !== 'object') return;
  const lower = {};
  for (const [k, v] of Object.entries(columnMap)) lower[k.toLowerCase()] = v;

  if (lower.punchtable) cfg.table = lower.punchtable;
  if (cfg.table) {
    if (lower.usercol) cfg.userCol = lower.usercol;
    if (lower.timecol) cfg.timeCol = lower.timecol;
    if (lower.statecol) cfg.stateCol = lower.statecol;
    if (lower.verifycol) cfg.verifyCol = lower.verifycol;
    if (lower.serialcol) cfg.serialCol = lower.serialcol;
  }
  if (lower.empetable) { empCfg.table = lower.empetable; }
  if (empCfg.table) {
    if (lower.empusercol) empCfg.userCol = lower.empusercol;
    if (lower.empnamecol) empCfg.nameCol = lower.empnamecol;
  }
}

function readPunchesOn(dbx, cfg) {
  if (!cfg.table || !cfg.userCol || !cfg.timeCol) {
    throw new Error(`Punch table '${cfg.table || '(none)'}' is missing required user/time columns.`);
  }
  const rows = dbx.prepare(`SELECT * FROM "${cfg.table}"`).all();
  const punches = [];
  for (const row of rows) {
    const t = parseDateTime(row[cfg.timeCol]);
    if (!t) continue;
    const userId = row[cfg.userCol];
    if (userId === null || userId === undefined || userId === '') continue;
    punches.push({
      biometricUserId: String(userId),
      punchTime: t.toISOString(),
      verificationMode: cfg.verifyCol ? VERIFY_MAP[row[cfg.verifyCol]] || 'FINGERPRINT' : 'FINGERPRINT',
      inOutMode: cfg.stateCol ? STATE_MAP[row[cfg.stateCol]] || 'AUTO' : 'AUTO',
      deviceSerial: cfg.serialCol ? (row[cfg.serialCol] ?? null) : null
    });
  }
  return punches;
}

function readEmployeesOn(dbx, cfg) {
  if (!cfg.table || !cfg.userCol) return [];
  const rows = dbx.prepare(`SELECT * FROM "${cfg.table}"`).all();
  return rows
    .filter(r => r[cfg.userCol] !== null && r[cfg.userCol] !== undefined && r[cfg.userCol] !== '')
    .map(r => ({
      biometricUserId: String(r[cfg.userCol]),
      fullName: cfg.nameCol ? String(r[cfg.nameCol] || `Imported Employee ${r[cfg.userCol]}`) : `Imported Employee ${r[cfg.userCol]}`
    }));
}

// --- backward-compatible file-path wrappers (kept for callers/tests) ---
function listTables(filePath) {
  const dbx = openReadOnly(filePath);
  try { return listTablesOf(dbx); } finally { dbx.close(); }
}
function detect(filePath) {
  const dbx = openReadOnly(filePath);
  try { return detectOn(dbx); } finally { dbx.close(); }
}
function readPunches(filePath, cfg) {
  const dbx = openReadOnly(filePath);
  try { return readPunchesOn(dbx, cfg); } finally { dbx.close(); }
}
function readEmployees(filePath, cfg) {
  const dbx = openReadOnly(filePath);
  try { return readEmployeesOn(dbx, cfg); } finally { dbx.close(); }
}

// Deterministic database IDs derived from external identifiers
function slugId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 10)}`;
}

async function ensureDevice(deviceSerial, counters) {
  const serial = deviceSerial ? String(deviceSerial) : 'IMPORT_DEFAULT';
  const existing = await db.get('SELECT id FROM devices WHERE serial_number = ?', serial);
  if (existing) return existing.id;
  const id = slugId('dev', serial);
  await db.run(`
    INSERT INTO devices (id, serial_number, model, device_name, location, ip_address, port, protocol, status)
    VALUES (?, ?, 'Imported Biometric Terminal', ?, 'Synced from vendor source', NULL, 4370, 'IMPORT', 'ONLINE')
  `, id, serial, `Imported ${serial}`);
  counters.devicesCreated += 1;
  return id;
}

async function defaultShiftId() {
  return ((await db.get('SELECT id FROM shifts ORDER BY created_at ASC LIMIT 1')) || {}).id || null;
}

async function defaultDepartmentId() {
  return ((await db.get('SELECT id FROM departments ORDER BY created_at ASC LIMIT 1')) || {}).id || null;
}

async function ensureEmployee({ biometricUserId, fullName }, createEmployees, counters) {
  const existing = await db.get('SELECT * FROM employees WHERE biometric_user_id = ?', biometricUserId);
  if (existing) return existing;

  if (!createEmployees) return null;

  const id = slugId('emp', biometricUserId);
  const departmentId = await defaultDepartmentId();
  const shiftId = await defaultShiftId();
  if (!departmentId || !shiftId) {
    throw new Error('Cannot auto-create employee: no department/shift configured. Configure shifts & departments first.');
  }
  const name = fullName || `Imported Employee ${biometricUserId}`;
  await db.run(`
    INSERT INTO employees (id, employee_code, biometric_user_id, full_name, designation, department_id, shift_id, gender, date_of_joining, base_ctc, role, status)
    VALUES (?, ?, ?, ?, 'Imported Employee', ?, ?, 'Other', ?, 0, 'EMPLOYEE', 'ACTIVE')
  `, id, `IMP-${biometricUserId}`, biometricUserId, name, departmentId, shiftId, new Date().toISOString().slice(0, 10));
  counters.employeesCreated += 1;
  if (counters.createdNames) counters.createdNames.push(name);
  return db.get('SELECT * FROM employees WHERE id = ?', id);
}

/**
 * importFile — full SQL import pipeline.
 * Accepts either a Buffer (`buffer`) or a `filePath`. The buffer may be a SQLite
 * binary or a MySQL/SQL Server text dump (auto-detected + materialised).
 * Returns summary { status, recordsFound, recordsImported, recordsSkipped,
 *   employeesCreated, devicesCreated, detectedTables, errors, message }
 */
async function importFile({ buffer, filePath: existingPath, sourceId, sourceName, syncType = 'FILE_IMPORT', options = {} }) {
  const opts = { createEmployees: true, createDevices: true, ...options };
  const startedAt = new Date().toISOString();
  const logId = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const counters = { recordsFound: 0, recordsImported: 0, recordsSkipped: 0, employeesCreated: 0, devicesCreated: 0, createdNames: [], detectedTables: [], errors: [] };

  await writeSyncLog({ id: logId, sourceId, sourceName, syncType, startedAt, message: 'Import started' });

  // Resolve a readable SQLite file: text dumps are materialised into a temp .sqlite.
  let filePath = existingPath || null;
  let materialized = null;
  const loader = require('./sqlTextDumpLoader');

  try {
    if (buffer && !isSqliteBuffer(buffer)) {
      if (loader.looksLikeSqlText(buffer)) {
        materialized = loader.materializeToSqlite(buffer);
        filePath = materialized;
      } else {
        throw new Error('Uploaded file is neither a SQLite database nor a recognizable SQL text dump.');
      }
    } else if (buffer) {
      filePath = path.join(os.tmpdir(), `biometric_import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.sqlite`);
      fs.writeFileSync(filePath, buffer);
      materialized = filePath;
    }
    if (!filePath) throw new Error('No SQL file or buffer provided to importFile');

    const dbx = openReadOnly(filePath);
    let detectRes;
    let punches;
    let employees;
    try {
      detectRes = detectOn(dbx);
      applyColumnMap(detectRes.punch, detectRes.emp, opts.columnMap);
      if (!detectRes.punch.table) {
        throw new Error('No recognizable punch/attendance table found. Supported vendor tables: checkinout, att_log, raw_scan, attendancelog, etc. (or configure an explicit columnMap).');
      }
      punches = readPunchesOn(dbx, detectRes.punch);
      if (detectRes.emp.table) employees = readEmployeesOn(dbx, detectRes.emp);
      counters.detectedTables = detectRes.tables;
    } finally {
      try { dbx.close(); } catch (e) { /* ignore */ }
    }

    counters.recordsFound = punches.length;
    const empByName = {};
    (employees || []).forEach(e => { empByName[e.biometricUserId] = e; });

    for (const punch of punches) {
      try {
        let deviceId = null;
        if (opts.createDevices) {
          deviceId = await ensureDevice(punch.deviceSerial, counters);
        } else {
          const row = punch.deviceSerial
            ? await db.get('SELECT id FROM devices WHERE serial_number = ?', punch.deviceSerial)
            : null;
          deviceId = row ? row.id : null;
        }
        if (!deviceId) {
          deviceId = ((await db.get('SELECT id FROM devices ORDER BY created_at ASC LIMIT 1')) || {}).id || null;
        }
        if (!deviceId) {
          throw new Error('No biometric device exists; create a device first or enable auto-create devices.');
        }

        const emp = await ensureEmployee(
          { biometricUserId: punch.biometricUserId, fullName: empByName[punch.biometricUserId]?.fullName },
          opts.createEmployees,
          counters
        );
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
        if (counters.errors.length < 20) counters.errors.push(`${punch.biometricUserId}: ${e.message}`);
      }
    }

    const status = counters.errors.length > 0 ? 'PARTIAL' : 'SUCCESS';
    const message = counters.errors.length
      ? `Imported ${counters.recordsImported} of ${counters.recordsFound} punches (${counters.errors.length} errors: ${counters.errors.join('; ')})`
      : `Imported ${counters.recordsImported} punches from ${detectRes.punch.table}.`;

    await finishSyncLog(logId, status, counters, message);

    // Digest email to HR admins when an import created staff records.
    if (counters.employeesCreated > 0) {
      await notify('employee.created', {
        count: counters.employeesCreated,
        names: counters.createdNames.slice(0, 12).join(', ') + (counters.createdNames.length > 12 ? ' …' : ''),
        sourceName,
        dedupeKey: `emp_created|${logId}`
      });
    }

    if (sourceId) {
      await db.run(`UPDATE data_sources SET last_sync_at = ?, updated_at = CURRENT_TIMESTAMP, status = 'ACTIVE' WHERE id = ?`, new Date().toISOString(), sourceId);
    }

    return { ...counters, status };
  } catch (err) {
    await finishSyncLog(logId, 'FAILED', counters, err.message);
    if (sourceId) {
      await db.run(`UPDATE data_sources SET updated_at = CURRENT_TIMESTAMP, status = 'ERROR' WHERE id = ?`, sourceId).catch(() => {});
    }
    throw err;
  } finally {
    // Clean up any temp file we created (but not caller-owned existingPath)
    if (materialized && materialized !== existingPath) {
      try { fs.unlinkSync(materialized); } catch (e) { /* best-effort */ }
    }
  }
}

module.exports = {
  isSqliteBuffer,
  listTables,
  detect,
  readPunches,
  readEmployees,
  parseDateTime,
  importFile,
  PUNCH_TABLE_NAMES,
  EMP_TABLE_NAMES
};
