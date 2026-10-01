const crypto = require('crypto');
const { db } = require('../db/database');
const config = require('../config');
const { notify } = require('./notificationService');

/**
 * Generates an idempotent SHA256 hash for a biometric punch
 * Groups duplicate rapid taps within the same minute into one punch
 */
function generatePunchHash(deviceId, biometricUserId, punchTime) {
  const date = new Date(punchTime);
  // Local (IST) minute key — dedup must group by device wall clock, not UTC.
  const minuteKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}`;
  return crypto
    .createHash('sha256')
    .update(`${deviceId}:${biometricUserId}:${minuteKey}`)
    .digest('hex');
}

/**
 * Resolves the logical duty date for a punch, handling cross-midnight shifts (e.g. 20:00 - 08:00)
 */
function resolveDutyDate(employee, shift, punchDate) {
  if (!shift.is_cross_midnight) {
    const yyyy = punchDate.getFullYear();
    const mm = String(punchDate.getMonth() + 1).padStart(2, '0');
    const dd = String(punchDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  const hours = punchDate.getHours();
  const [shiftStartH] = shift.start_time.split(':').map(Number);
  const [shiftEndH] = shift.end_time.split(':').map(Number);

  if (hours <= shiftEndH + 3) {
    const prevDay = new Date(punchDate.getTime() - 24 * 60 * 60 * 1000);
    const yyyy = prevDay.getFullYear();
    const mm = String(prevDay.getMonth() + 1).padStart(2, '0');
    const dd = String(prevDay.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } else {
    const yyyy = punchDate.getFullYear();
    const mm = String(punchDate.getMonth() + 1).padStart(2, '0');
    const dd = String(punchDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}

/**
 * Minutes the last-out punch fell BEFORE the scheduled shift end.
 * Returns 0 when the employee stayed to (or past) the end of shift.
 * Returns null when the day carries no measurable early-out: no out punch,
 * no worked hours, or punches that sit outside this shift's window (a stray
 * or a previous-night punch) — the UI then hides "early-by" instead of
 * showing a meaningless multi-hour number.
 * Cross-midnight shifts (e.g. 20:00-08:00) end on the day after duty_date.
 */
function computeEarlyMinutes(dutyDate, lastOut, shift, opts = {}) {
  if (!lastOut || !shift || !shift.end_time) return null;
  if (opts.totalHours != null && !(Number(opts.totalHours) > 0)) return null;

  const pad = (n) => String(n).padStart(2, '0');
  const [eh, em] = String(shift.end_time).split(':').map(Number);
  if (!Number.isFinite(eh) || !Number.isFinite(em)) return null;
  const crossMidnight = !!shift.is_cross_midnight && eh <= 12;

  const shiftEnd = new Date(`${dutyDate}T${pad(eh)}:${pad(em)}:00`);
  if (crossMidnight) shiftEnd.setDate(shiftEnd.getDate() + 1);

  const [sh, sm] = String(shift.start_time || '').split(':').map(Number);
  let shiftStart = null;
  if (Number.isFinite(sh) && Number.isFinite(sm)) {
    shiftStart = new Date(`${dutyDate}T${pad(sh)}:${pad(sm)}:00`);
    // Same-clock cross-midnight shift starting at/after its own end time means
    // the start belongs to the duty date (e.g. 19:00 -> 07:00 next day).
    if (crossMidnight && sh < eh) shiftStart.setDate(shiftStart.getDate() + 1);
  }

  const actualOut = new Date(lastOut);
  if (isNaN(actualOut)) return null;
  if (shiftStart && actualOut < shiftStart) return null; // punch outside this window

  const diff = Math.floor((shiftEnd - actualOut) / 60000);
  if (diff <= 0) return 0;
  if (shiftStart && diff > (shiftEnd - shiftStart) / 60000) return null; // longer than the shift itself
  return diff;
}

async function ingestPunch({ deviceId, biometricUserId, punchTime, verificationMode = 'FINGERPRINT', inOutMode = 'AUTO', importBatch = null, sourceId = null }) {
  const punchDate = new Date(punchTime || new Date().toISOString());
  const punchIso = punchDate.toISOString();
  const punchHash = generatePunchHash(deviceId, biometricUserId, punchIso);

  // 1. Check for duplicate punch
  const existingPunch = await db.get('SELECT id FROM biometric_punches WHERE punch_hash = ?', punchHash);
  if (existingPunch) {
    return {
      status: 'DUPLICATE_IGNORED',
      message: 'Biometric punch tap already recorded within the same minute window',
      punchId: existingPunch.id,
      biometricUserId,
      punchTime: punchIso
    };
  }

  // 2. Find employee associated with this biometric machine user ID
  const employee = await db.get('SELECT * FROM employees WHERE biometric_user_id = ?', biometricUserId);
  if (!employee) {
    throw new Error(`Unregistered biometric user ID [${biometricUserId}] received from device [${deviceId}]`);
  }

  // 3. Find employee's assigned shift
  const shift = await db.get('SELECT * FROM shifts WHERE id = ?', employee.shift_id);
  if (!shift) {
    throw new Error(`No shift configuration found for employee ${employee.full_name} (${employee.employee_code})`);
  }

  // 4. Record raw biometric punch
  const punchId = `punch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await db.run(`
    INSERT INTO biometric_punches (id, punch_hash, device_id, biometric_user_id, punch_time, verification_mode, in_out_mode, import_batch, source_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, punchId, punchHash, deviceId, biometricUserId, punchIso, verificationMode, inOutMode, importBatch, sourceId);

  // 5. Update device heartbeat
  await db.run(`UPDATE devices SET last_heartbeat = ?, status = 'ONLINE' WHERE id = ?`, punchIso, deviceId);

  // 6. Determine logical duty date
  const dutyDate = resolveDutyDate(employee, shift, punchDate);

  // 7. Find or create daily attendance record for this duty date
  let attendance = await db.get(`
    SELECT * FROM attendance_records WHERE duty_date = ? AND employee_id = ?
  `, dutyDate, employee.id);

  let firstIn = attendance ? attendance.first_in_time : null;
  let lastOut = attendance ? attendance.last_out_time : null;

  if (!firstIn) {
    firstIn = punchIso;
    lastOut = punchIso;
  } else {
    if (new Date(punchIso) < new Date(firstIn)) {
      firstIn = punchIso;
    }
    if (new Date(punchIso) > new Date(lastOut || firstIn)) {
      lastOut = punchIso;
    }
  }

  const diffMs = new Date(lastOut) - new Date(firstIn);
  const totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;

  const [shiftStartH, shiftStartM] = shift.start_time.split(':').map(Number);
  const expectedStartTime = new Date(`${dutyDate}T${String(shiftStartH).padStart(2, '0')}:${String(shiftStartM).padStart(2, '0')}:00`);
  const actualIn = new Date(firstIn);
  let lateMinutes = 0;
  if (actualIn > expectedStartTime) {
    lateMinutes = Math.max(0, Math.floor((actualIn - expectedStartTime) / (1000 * 60)));
  }

  const overtimeHours = totalHours > shift.duration_hours ? Math.round((totalHours - shift.duration_hours) * 10) / 10 : 0;
  const earlyMinutes = computeEarlyMinutes(dutyDate, lastOut, shift, { totalHours }) || 0;

  let status = 'PRESENT';
  if (totalHours < config.ATTENDANCE_RULES.HALF_DAY_MIN_HOURS) {
    status = 'ABSENT';
  } else if (totalHours < config.ATTENDANCE_RULES.FULL_DAY_MIN_HOURS) {
    status = 'HALF_DAY';
  } else if (overtimeHours > 0) {
    status = 'OVERTIME';
  }

  const attendanceId = attendance ? attendance.id : `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  if (attendance) {
    await db.run(`
      UPDATE attendance_records
      SET first_in_time = ?, last_out_time = ?, total_hours = ?, late_minutes = ?, undertime_minutes = ?, overtime_hours = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, firstIn, lastOut, totalHours, lateMinutes, earlyMinutes, overtimeHours, status, attendance.id);
  } else {
    await db.run(`
      INSERT INTO attendance_records (id, duty_date, employee_id, shift_id, first_in_time, last_out_time, total_hours, late_minutes, undertime_minutes, overtime_hours, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, attendanceId, dutyDate, employee.id, shift.id, firstIn, lastOut, totalHours, lateMinutes, earlyMinutes, overtimeHours, status);
  }

  // Notify the employee when overtime is classified (dedup: once per employee/day).
  if (status === 'OVERTIME' && overtimeHours > 0) {
    await notify('overtime.logged', {
      employeeId: employee.id,
      dutyDate,
      totalHours,
      otHours: overtimeHours,
      status,
      dedupeKey: `ot|${dutyDate}|${employee.id}`
    });
  }

  return {
    status: 'SUCCESS',
    punchId,
    employee: {
      id: employee.id,
      name: employee.full_name,
      code: employee.employee_code,
      designation: employee.designation,
      shift: shift.name
    },
    dutyDate,
    firstIn,
    lastOut,
    totalHours,
    overtimeHours,
    dayStatus: status
  };
}

/**
 * recomputeAttendance — rebuild attendance_records purely from the raw punches already
 * stored, using each employee's CURRENT shift. Use after fixing a shift / importing a
 * roster or reverting a bad batch, so days refresh without re-ingesting any file.
 *   { from, to, employeeIds }  — all optional; defaults to every punched employee, all dates.
 * Manual 'REGULARIZED' days are preserved (never downgraded or deleted).
 */
async function recomputeAttendance({ from = null, to = null, employeeIds = null } = {}) {
  const HALF = config.ATTENDANCE_RULES.HALF_DAY_MIN_HOURS;
  const FULL = config.ATTENDANCE_RULES.FULL_DAY_MIN_HOURS;
  const result = { employees: 0, daysWritten: 0, daysDeleted: 0, skipped: 0 };

  let employees;
  if (Array.isArray(employeeIds) && employeeIds.length) {
    const ph = employeeIds.map(() => '?').join(',');
    employees = await db.all(`SELECT * FROM employees WHERE id IN (${ph})`, ...employeeIds);
  } else {
    employees = await db.all(`
      SELECT DISTINCT e.* FROM employees e
      JOIN biometric_punches p ON p.biometric_user_id = e.biometric_user_id
      WHERE e.shift_id IS NOT NULL AND e.biometric_user_id IS NOT NULL
    `);
  }

  for (const employee of employees) {
    if (!employee.shift_id || !employee.biometric_user_id) { result.skipped += 1; continue; }
    const shift = await db.get('SELECT * FROM shifts WHERE id = ?', employee.shift_id);
    if (!shift) { result.skipped += 1; continue; }

    const punches = await db.all(
      'SELECT punch_time FROM biometric_punches WHERE biometric_user_id = ? ORDER BY punch_time ASC',
      employee.biometric_user_id
    );
    const byDate = {};
    for (const row of punches) {
      const d = new Date(row.punch_time);
      const dd = resolveDutyDate(employee, shift, d);
      (byDate[dd] = byDate[dd] || []).push(d);
    }

    const inRange = (dd) => (!from || dd >= from) && (!to || dd <= to);

    for (const [dutyDate, dates] of Object.entries(byDate)) {
      if (!inRange(dutyDate)) continue;
      let firstIn = dates[0], lastOut = dates[0];
      for (const d of dates) { if (d < firstIn) firstIn = d; if (d > lastOut) lastOut = d; }
      const totalHours = Math.round(((lastOut - firstIn) / 3600000) * 10) / 10;
      const [sh, sm] = shift.start_time.split(':').map(Number);
      const expected = new Date(`${dutyDate}T${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:00`);
      let lateMinutes = firstIn > expected ? Math.max(0, Math.floor((firstIn - expected) / 60000)) : 0;
      const overtimeHours = totalHours > shift.duration_hours ? Math.round((totalHours - shift.duration_hours) * 10) / 10 : 0;
      const earlyMinutes = computeEarlyMinutes(dutyDate, lastOut.toISOString(), shift, { totalHours }) || 0;
      let status = 'PRESENT';
      if (totalHours < HALF) status = 'ABSENT';
      else if (totalHours < FULL) status = 'HALF_DAY';
      else if (overtimeHours > 0) status = 'OVERTIME';

      const existing = await db.get('SELECT id, status FROM attendance_records WHERE duty_date = ? AND employee_id = ?', dutyDate, employee.id);
      if (existing && existing.status === 'REGULARIZED') continue;
      if (existing) {
        await db.run(`
          UPDATE attendance_records
          SET shift_id = ?, first_in_time = ?, last_out_time = ?, total_hours = ?, late_minutes = ?, undertime_minutes = ?, overtime_hours = ?, status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, shift.id, firstIn.toISOString(), lastOut.toISOString(), totalHours, lateMinutes, earlyMinutes, overtimeHours, status, existing.id);
      } else {
        const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await db.run(`
          INSERT INTO attendance_records (id, duty_date, employee_id, shift_id, first_in_time, last_out_time, total_hours, late_minutes, undertime_minutes, overtime_hours, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, id, dutyDate, employee.id, shift.id, firstIn.toISOString(), lastOut.toISOString(), totalHours, lateMinutes, earlyMinutes, overtimeHours, status);
      }
      result.daysWritten += 1;
    }

    // Remove days that no longer have any punches (e.g. after a revert), keeping regularized days.
    const existingRecs = (from || to)
      ? await db.all('SELECT id, duty_date, status FROM attendance_records WHERE employee_id = ? AND duty_date BETWEEN ? AND ?', employee.id, from || '1970-01-01', to || '2999-12-31')
      : await db.all('SELECT id, duty_date, status FROM attendance_records WHERE employee_id = ?', employee.id);
    for (const rec of existingRecs) {
      const dd = String(rec.duty_date).slice(0, 10);
      if (!byDate[dd] && rec.status !== 'REGULARIZED') {
        await db.run('DELETE FROM attendance_records WHERE id = ?', rec.id);
        result.daysDeleted += 1;
      }
    }
    result.employees += 1;
  }

  return result;
}

/**
 * Pure day-metrics computation shared by the incremental recompute and the
 * set-based bulk rebuild. Given every punch instant that belongs to one
 * (employee, duty date), derive first-in / last-out / hours / late / OT / early
 * and the attendance status, exactly as recomputeAttendance does.
 */
function computeDayMetrics(shift, dutyDate, dateObjs) {
  const HALF = config.ATTENDANCE_RULES.HALF_DAY_MIN_HOURS;
  const FULL = config.ATTENDANCE_RULES.FULL_DAY_MIN_HOURS;
  let firstIn = dateObjs[0], lastOut = dateObjs[0];
  for (const d of dateObjs) { if (d < firstIn) firstIn = d; if (d > lastOut) lastOut = d; }
  const totalHours = Math.round(((lastOut - firstIn) / 3600000) * 10) / 10;
  const [sh, sm] = shift.start_time.split(':').map(Number);
  const expected = new Date(`${dutyDate}T${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:00`);
  const lateMinutes = firstIn > expected ? Math.max(0, Math.floor((firstIn - expected) / 60000)) : 0;
  const overtimeHours = totalHours > shift.duration_hours ? Math.round((totalHours - shift.duration_hours) * 10) / 10 : 0;
  const earlyMinutes = computeEarlyMinutes(dutyDate, lastOut.toISOString(), shift, { totalHours }) || 0;
  let status = 'PRESENT';
  if (totalHours < HALF) status = 'ABSENT';
  else if (totalHours < FULL) status = 'HALF_DAY';
  else if (overtimeHours > 0) status = 'OVERTIME';
  return {
    firstIn: firstIn.toISOString(), lastOut: lastOut.toISOString(),
    totalHours, lateMinutes, earlyMinutes, overtimeHours, status
  };
}

const IN_CHUNK = 500;   // rows per multi-value statement (bounds $n params well under PG's 65k cap)
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

/**
 * rebuildAttendanceForEmployees — set-based rebuild for a KNOWN set of employees.
 * Loads all their punches + shifts + existing records in a handful of queries,
 * derives each duty date in memory, then bulk-upserts. Manually REGULARIZED days
 * are never overwritten (guarded in the ON CONFLICT ... WHERE clause). This is the
 * fast counterpart to recomputeAttendance for the bulk import hot path.
 */
async function rebuildAttendanceForEmployees(employees) {
  const result = { employees: 0, daysUpserted: 0, overtimeDays: [] };
  const valid = employees.filter(e => e && e.shift_id && e.biometric_user_id);
  if (!valid.length) return result;

  const bios = [...new Set(valid.map(e => String(e.biometric_user_id)))];
  const empIds = [...new Set(valid.map(e => e.id))];

  // All punches for these staff (batched).
  const punchByBio = new Map();
  for (const slice of chunk(bios, IN_CHUNK)) {
    const ph = slice.map(() => '?').join(',');
    const rows = await db.all(`SELECT biometric_user_id, punch_time FROM biometric_punches WHERE biometric_user_id IN (${ph})`, ...slice);
    for (const r of rows) {
      const b = String(r.biometric_user_id);
      if (!punchByBio.has(b)) punchByBio.set(b, []);
      punchByBio.get(b).push(r.punch_time);
    }
  }

  // Shifts (batched).
  const shiftIds = [...new Set(valid.map(e => e.shift_id))];
  const shiftMap = new Map();
  for (const slice of chunk(shiftIds, IN_CHUNK)) {
    const ph = slice.map(() => '?').join(',');
    const rows = await db.all(`SELECT * FROM shifts WHERE id IN (${ph})`, ...slice);
    for (const s of rows) shiftMap.set(s.id, s);
  }

  // Derived rows in memory.
  const now = Date.now();
  const rowsToWrite = [];
  for (const emp of valid) {
    const shift = shiftMap.get(emp.shift_id);
    if (!shift) continue;
    const list = punchByBio.get(String(emp.biometric_user_id)) || [];
    const groups = {};
    for (const iso of list) {
      const d = new Date(iso);
      const dd = resolveDutyDate(emp, shift, d);
      (groups[dd] = groups[dd] || []).push(d);
    }
    for (const [dutyDate, dates] of Object.entries(groups)) {
      const m = computeDayMetrics(shift, dutyDate, dates);
      rowsToWrite.push({ dutyDate, employeeId: emp.id, shiftId: shift.id, ...m });
      if (m.status === 'OVERTIME' && m.overtimeHours > 0) {
        result.overtimeDays.push({ employeeId: emp.id, dutyDate, totalHours: m.totalHours, otHours: m.overtimeHours });
      }
    }
    result.employees += 1;
  }

  // Bulk upsert, protecting REGULARIZED days.
  let seq = 0;
  for (const slice of chunk(rowsToWrite, IN_CHUNK)) {
    const tuples = slice.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const params = [];
    for (const r of slice) {
      params.push(`att_${now}_${seq++}`, r.dutyDate, r.employeeId, r.shiftId, r.firstIn, r.lastOut,
        r.totalHours, r.lateMinutes, r.earlyMinutes, r.overtimeHours, r.status);
    }
    const res = await db.run(`
      INSERT INTO attendance_records (id, duty_date, employee_id, shift_id, first_in_time, last_out_time, total_hours, late_minutes, undertime_minutes, overtime_hours, status)
      VALUES ${tuples.join(',')}
      ON CONFLICT (duty_date, employee_id) DO UPDATE SET
        shift_id = EXCLUDED.shift_id, first_in_time = EXCLUDED.first_in_time, last_out_time = EXCLUDED.last_out_time,
        total_hours = EXCLUDED.total_hours, late_minutes = EXCLUDED.late_minutes, undertime_minutes = EXCLUDED.undertime_minutes,
        overtime_hours = EXCLUDED.overtime_hours, status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP
      WHERE attendance_records.status <> 'REGULARIZED'
    `, ...params);
    result.daysUpserted += (res.changes || 0);
  }
  void empIds;
  return result;
}

/**
 * bulkIngestPunches — set-based ingestion of a whole file/pull in a handful of
 * round-trips instead of ~6 per punch. Dedups within the batch and against
 * stored punches by punch_hash, auto-provisions missing employees via the
 * supplied resolver, bulk-inserts new raw punches, then rebuilds derived
 * attendance for only the touched staff. Returns counts + the dedup-ignored list
 * so the caller can build the day-handling summary.
 */
async function bulkIngestPunches({ deviceId, punches = [], importBatch = null, sourceId = null, ensureEmployee = null }) {
  const out = {
    newPunches: 0, duplicatePunches: 0, recordsSkipped: 0,
    duplicateList: [], employeesMatched: 0, employeesCreated: 0,
    errors: [], affectedEmployees: []
  };
  if (!punches.length) return out;

  // 1. In-batch dedup by hash (same device + user + minute) — keep first.
  const byHash = new Map();
  for (const p of punches) {
    const iso = new Date(p.punchTime).toISOString();
    const hash = generatePunchHash(deviceId, p.biometricUserId, iso);
    if (!byHash.has(hash)) byHash.set(hash, { ...p, punchTime: iso, hash });
  }
  const candidates = [...byHash.values()];

  // 2. Resolve employees for distinct biometric ids (batched) + auto-create missing.
  const bios = [...new Set(candidates.map(c => String(c.biometricUserId)))];
  const empByBio = new Map();
  for (const slice of chunk(bios, IN_CHUNK)) {
    const ph = slice.map(() => '?').join(',');
    const rows = await db.all(`SELECT * FROM employees WHERE biometric_user_id IN (${ph})`, ...slice);
    for (const e of rows) empByBio.set(String(e.biometric_user_id), e);
  }
  out.employeesMatched = empByBio.size;
  if (ensureEmployee) {
    for (const bio of bios) {
      if (empByBio.has(bio)) continue;
      try {
        const emp = await ensureEmployee({ biometricUserId: bio });
        if (emp) { empByBio.set(bio, emp); out.employeesCreated += 1; }
      } catch (e) { if (out.errors.length < 20) out.errors.push(`${bio}: ${e.message}`); }
    }
  }

  // 3. Which candidate hashes already exist in the DB? (batched)
  const existingHash = new Set();
  const hashes = candidates.map(c => c.hash);
  for (const slice of chunk(hashes, IN_CHUNK)) {
    const ph = slice.map(() => '?').join(',');
    const rows = await db.all(`SELECT punch_hash FROM biometric_punches WHERE punch_hash IN (${ph})`, ...slice);
    for (const r of rows) existingHash.add(r.punch_hash);
  }

  // 4. Partition into duplicates vs new (new requires a resolvable employee + shift).
  const newRows = [];
  const touchedBios = new Set();
  for (const c of candidates) {
    if (existingHash.has(c.hash)) {
      out.duplicatePunches += 1;
      out.duplicateList.push({ biometricUserId: c.biometricUserId, punchTime: c.punchTime });
      continue;
    }
    const emp = empByBio.get(String(c.biometricUserId));
    if (!emp || !emp.shift_id) { out.recordsSkipped += 1; continue; }
    newRows.push(c);
    touchedBios.add(String(c.biometricUserId));
  }

  // 5. Bulk insert new raw punches (ON CONFLICT guards any race with the read above).
  const now = Date.now();
  let seq = 0;
  for (const slice of chunk(newRows, IN_CHUNK)) {
    const tuples = slice.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const params = [];
    for (const c of slice) {
      params.push(`punch_${now}_${seq++}`, c.hash, deviceId, String(c.biometricUserId), c.punchTime,
        c.verificationMode || 'FINGERPRINT', c.inOutMode || 'AUTO', importBatch, sourceId);
    }
    const res = await db.run(`
      INSERT INTO biometric_punches (id, punch_hash, device_id, biometric_user_id, punch_time, verification_mode, in_out_mode, import_batch, source_id)
      VALUES ${tuples.join(',')}
      ON CONFLICT (punch_hash) DO NOTHING
    `, ...params);
    out.newPunches += (res.changes || 0);
  }

  // 6. Device heartbeat.
  await db.run(`UPDATE devices SET last_heartbeat = ?, status = 'ONLINE' WHERE id = ?`, new Date().toISOString(), deviceId);

  // 7. Rebuild derived attendance only for staff whose punches actually changed.
  out.affectedEmployees = bios.filter(b => touchedBios.has(b)).map(b => empByBio.get(b)).filter(Boolean);
  out.overtimeDays = [];
  if (out.affectedEmployees.length) {
    const rebuild = await rebuildAttendanceForEmployees(out.affectedEmployees);
    out.overtimeDays = rebuild.overtimeDays || [];
    out.daysUpserted = rebuild.daysUpserted;
  }

  return out;
}

module.exports = {
  ingestPunch,
  resolveDutyDate,
  generatePunchHash,
  recomputeAttendance,
  computeEarlyMinutes,
  computeDayMetrics,
  rebuildAttendanceForEmployees,
  bulkIngestPunches
};