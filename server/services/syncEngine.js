// Data-source sync engine.
// Pulls punches from configured vendor APIs on a schedule and feeds them
// through the same ingestion pipeline as webhook + SQL import.
const { db } = require('../db/database');
const biotime = require('./biotimeApi');
const { ingestPunch } = require('./attendanceEngine');
const { writeSyncLog, finishSyncLog } = require('./syncLogger');

function encodePassword(plain) {
  if (!plain) return null;
  return Buffer.from(`enc:${plain}`, 'utf8').toString('base64');
}

function decodePassword(stored) {
  if (!stored) return null;
  try {
    const decoded = Buffer.from(stored, 'base64').toString('utf8');
    return decoded.startsWith('enc:') ? decoded.slice(4) : decoded;
  } catch (e) {
    return stored;
  }
}

function parseOptions(source) {
  try { return JSON.parse(source.options || '{}'); } catch (e) { return {}; }
}

function formatWindowStart(date) {
  const d = new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function formatWindowEnd(date) {
  return formatWindowStart(date);
}

async function syncApiSource(source, manual = false) {
  const options = parseOptions(source);
  const startedAt = new Date().toISOString();
  const logId = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const counters = { recordsFound: 0, recordsImported: 0, recordsSkipped: 0, employeesCreated: 0, devicesCreated: 0, errors: [] };

  await writeSyncLog({ id: logId, sourceId: source.id, sourceName: source.name, syncType: manual ? 'MANUAL' : 'API_PULL', startedAt, message: 'Pulling punches from vendor API' });

  try {
    if (source.status === 'PAUSED' && !manual) {
      throw new Error('Source is paused; skipping scheduled sync');
    }
    if (!source.base_url || !source.username) {
      throw new Error('API source is missing base URL or username');
    }

    const windowDays = options.backfillDays || 7;
    const lastSync = source.last_sync_at ? new Date(source.last_sync_at) : null;
    let start = new Date();
    start.setDate(start.getDate() - windowDays);
    if (lastSync && !Number.isNaN(lastSync.getTime()) && lastSync < start) start = lastSync;
    const end = new Date();

    const token = await biotime.getAuthToken({
      baseUrl: source.base_url,
      username: source.username,
      password: decodePassword(source.password_enc),
      tokenType: source.token_type || 'JWT'
    });

    const transactions = await biotime.getTransactions({
      baseUrl: source.base_url,
      token,
      tokenType: source.token_type || 'JWT',
      startTime: formatWindowStart(start),
      endTime: formatWindowEnd(end),
      empCode: options.empCode || null
    });
    counters.recordsFound = transactions.length;

    // Optionally mirror employees from the vendor personnel module
    if (options.syncEmployees) {
      const remoteEmps = await biotime.getEmployees({
        baseUrl: source.base_url, token, tokenType: source.token_type || 'JWT'
      });
      for (const re of remoteEmps) {
        const bioId = String(re.emp_code != null ? re.emp_code : '');
        if (!bioId) continue;
        const name = [re.first_name, re.last_name].filter(Boolean).join(' ') || `Imported ${bioId}`;
        const existing = await db.get('SELECT id FROM employees WHERE biometric_user_id = ?', bioId);
        if (!existing) {
          const dept = await defaultDepartmentId();
          const shift = await defaultShiftId();
          if (!dept || !shift) continue;
          const id = `emp_api_${crypto_hash(bioId)}`;
          await db.run(`
            INSERT INTO employees (id, employee_code, biometric_user_id, full_name, designation, department_id, shift_id, gender, date_of_joining, base_ctc, role, status)
            VALUES (?, ?, ?, ?, 'Imported Employee', ?, ?, 'Other', ?, 0, 'EMPLOYEE', 'ACTIVE')
          `, id, `API-${bioId}`, bioId, name, dept, shift, new Date().toISOString().slice(0, 10));
          counters.employeesCreated += 1;
        }
      }
    }

    for (const txn of transactions) {
      try {
        const norm = biotime.normalizeTransaction(txn);
        if (!norm.biometricUserId || !norm.punchTime) {
          counters.recordsSkipped += 1;
          continue;
        }
        const deviceId = await ensureDevice(norm.deviceSerial || null, counters);
        const emp = await ensureEmployee(norm.biometricUserId, norm.biometricUserId, counters);
        if (!emp) {
          counters.recordsSkipped += 1;
          continue;
        }
        const result = await ingestPunch({
          deviceId,
          biometricUserId: norm.biometricUserId,
          punchTime: norm.punchTime,
          verificationMode: norm.verificationMode,
          inOutMode: norm.inOutMode
        });
        if (result && (result.status === 'SUCCESS' || result.status === 'DUPLICATE_IGNORED')) {
          counters.recordsImported += 1;
        } else {
          counters.recordsSkipped += 1;
        }
      } catch (e) {
        counters.recordsSkipped += 1;
        if (counters.errors.length < 20) counters.errors.push(`${txn.emp_code}: ${e.message}`);
      }
    }

    const status = counters.errors.length ? 'PARTIAL' : 'SUCCESS';
    const message = counters.errors.length
      ? `Pulled ${counters.recordsImported} of ${counters.recordsFound} transactions (${counters.errors.length} errors: ${counters.errors.join('; ')})`
      : `Pulled ${counters.recordsImported} transactions from ${source.base_url}.`;

    await finishSyncLog(logId, status, counters, message);

    await db.run(`UPDATE data_sources SET last_sync_at = ?, updated_at = CURRENT_TIMESTAMP, status = 'ACTIVE' WHERE id = ?`,
      new Date().toISOString(), source.id);

    return { ...counters, status };
  } catch (err) {
    await finishSyncLog(logId, 'FAILED', counters, err.message);
    await db.run(`UPDATE data_sources SET updated_at = CURRENT_TIMESTAMP, status = 'ERROR' WHERE id = ?`, source.id);
    throw err;
  }
}

function crypto_hash(value) {
  return require('crypto').createHash('sha1').update(String(value)).digest('hex').slice(0, 10);
}

async function defaultShiftId() {
  return ((await db.get('SELECT id FROM shifts ORDER BY created_at ASC LIMIT 1')) || {}).id || null;
}

async function defaultDepartmentId() {
  return ((await db.get('SELECT id FROM departments ORDER BY created_at ASC LIMIT 1')) || {}).id || null;
}

async function ensureDevice(deviceSerial, counters) {
  const serial = deviceSerial ? String(deviceSerial) : 'API_DEFAULT';
  const existing = await db.get('SELECT id FROM devices WHERE serial_number = ?', serial);
  if (existing) return existing.id;
  const id = `dev_api_${crypto_hash(serial)}`;
  await db.run(`
    INSERT INTO devices (id, serial_number, model, device_name, location, ip_address, port, protocol, status)
    VALUES (?, ?, 'Synced Biometric Terminal', ?, 'Synced from vendor API', NULL, 4370, 'API_SYNC', 'ONLINE')
  `, id, serial, `API ${serial}`);
  counters.devicesCreated += 1;
  return id;
}

async function ensureEmployee(biometricUserId, fullName, counters) {
  const existing = await db.get('SELECT * FROM employees WHERE biometric_user_id = ?', biometricUserId);
  if (existing) return existing;
  const departmentId = await defaultDepartmentId();
  const shiftId = await defaultShiftId();
  if (!departmentId || !shiftId) {
    return null;
  }
  const id = `emp_api_${crypto_hash(biometricUserId)}`;
  await db.run(`
    INSERT INTO employees (id, employee_code, biometric_user_id, full_name, designation, department_id, shift_id, gender, date_of_joining, base_ctc, role, status)
    VALUES (?, ?, ?, ?, 'Imported Employee', ?, ?, 'Other', ?, 0, 'EMPLOYEE', 'ACTIVE')
  `, id, `API-${biometricUserId}`, biometricUserId, fullName || `Imported ${biometricUserId}`, departmentId, shiftId, new Date().toISOString().slice(0, 10));
  counters.employeesCreated += 1;
  return db.get('SELECT * FROM employees WHERE id = ?', id);
}

// Download a vendor SQL file over HTTP(S) using the source's stored credentials.
// Supports optional basic-auth (username + password) and bearer-token auth, plus
// any custom headers supplied in options.headers.
async function downloadFileSource(source, options) {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch unavailable; automatic file fetching requires Node 18+.');
  }
  const url = options.fileUrl || source.base_url;
  if (!url) throw new Error('SQL file source has no download URL configured (base_url / options.fileUrl).');

  const headers = { 'User-Agent': 'myHR-DataSync/1.0', ...(options.headers || {}) };
  if (source.username && source.password_enc) {
    const pass = decodePassword(source.password_enc);
    if ((source.token_type || '').toUpperCase() === 'BEARER') {
      headers.Authorization = `Bearer ${pass}`;
    } else {
      headers.Authorization = `Basic ${Buffer.from(`${source.username}:${pass}`).toString('base64')}`;
    }
  }

  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) throw new Error(`File download failed: HTTP ${res.status} ${res.statusText} from ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error('Downloaded file was empty.');
  return buf;
}

// Pull + import a vendor SQL file (SQLite binary or text dump) for a SQL_FILE source.
async function syncFilePullSource(source, manual = false) {
  const options = parseOptions(source);
  if (source.status === 'PAUSED' && !manual) throw new Error('Source is paused; skipping scheduled sync');

  const importer = require('./sqlFileImporter');
  let buffer;
  try {
    buffer = await downloadFileSource(source, options);
  } catch (err) {
    await db.run(`UPDATE data_sources SET updated_at = CURRENT_TIMESTAMP, status = 'ERROR' WHERE id = ?`, source.id);
    throw err;
  }
  // The importer writes its own sync_log row (and updates last_sync_at on success).
  return importer.importFile({
    buffer,
    sourceId: source.id,
    sourceName: source.name,
    syncType: manual ? 'MANUAL' : 'FILE_PULL',
    options
  });
}

// Run a single sync for one source (used by manual triggers + tests)
async function syncSourceById(sourceId, manual = false) {
  const source = await db.get('SELECT * FROM data_sources WHERE id = ?', sourceId);
  if (!source) throw new Error('Data source not found');
  if (source.source_type === 'SQL_FILE') {
    // SQL file sources are either upload-only (no URL) or auto-fetched (URL set).
    if (!source.base_url && !parseOptions(source).fileUrl) {
      throw new Error('This SQL file source is upload-only; import a file instead of syncing.');
    }
    return syncFilePullSource(source, manual);
  }
  return syncApiSource(source, manual);
}

// Scheduled pass: sync every ACTIVE API source + every auto-fetch SQL_FILE source that is due
async function runScheduledSyncs() {
  const sources = await db.all(`
    SELECT * FROM data_sources WHERE status IN ('ACTIVE', 'ERROR')
  `);
  const now = new Date();
  for (const source of sources) {
    const options = parseOptions(source);
    const isFile = source.source_type === 'SQL_FILE';
    // Skip upload-only file sources and any unknown source types.
    if (isFile && !options.autoFetch) continue;
    if (!isFile && source.source_type !== 'API') continue;

    const freq = Math.max(5, Number(source.sync_frequency_minutes) || 60);
    if (source.last_sync_at) {
      const elapsedMin = (now - new Date(source.last_sync_at)) / 60000;
      if (elapsedMin < freq) continue;
    }
    try {
      if (isFile) {
        await syncFilePullSource(source, false);
      } else {
        await syncApiSource(source, false);
      }
    } catch (e) {
      console.error(`[syncEngine] source ${source.name} sync failed: ${e.message}`);
    }
  }
}


// Start the background scheduler (local server only — not on serverless)
function startScheduler(intervalMinutes = 1) {
  if (global.__syncSchedulerStarted) return;
  global.__syncSchedulerStarted = true;
  setInterval(() => {
    runScheduledSyncs().catch(e => console.error('[syncEngine] scheduler error:', e.message));
  }, intervalMinutes * 60 * 1000);
  console.log(`[syncEngine] Background data-source scheduler active (tick every ${intervalMinutes}m)`);
}

module.exports = {
  syncApiSource,
  syncFilePullSource,
  syncSourceById,
  runScheduledSyncs,
  startScheduler,
  encodePassword,
  decodePassword
};