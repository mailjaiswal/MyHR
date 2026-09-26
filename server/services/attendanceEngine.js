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

async function ingestPunch({ deviceId, biometricUserId, punchTime, verificationMode = 'FINGERPRINT', inOutMode = 'AUTO' }) {
  const punchDate = new Date(punchTime || new Date().toISOString());
  const punchIso = punchDate.toISOString();
  const punchHash = generatePunchHash(deviceId, biometricUserId, punchIso);

  // 1. Check for duplicate punch
  const existingPunch = await db.get('SELECT id FROM biometric_punches WHERE punch_hash = ?', punchHash);
  if (existingPunch) {
    return {
      status: 'DUPLICATE_IGNORED',
      message: 'Biometric punch tap already recorded within the same minute window',
      punchId: existingPunch.id
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
    INSERT INTO biometric_punches (id, punch_hash, device_id, biometric_user_id, punch_time, verification_mode, in_out_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, punchId, punchHash, deviceId, biometricUserId, punchIso, verificationMode, inOutMode);

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
      SET first_in_time = ?, last_out_time = ?, total_hours = ?, late_minutes = ?, overtime_hours = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, firstIn, lastOut, totalHours, lateMinutes, overtimeHours, status, attendance.id);
  } else {
    await db.run(`
      INSERT INTO attendance_records (id, duty_date, employee_id, shift_id, first_in_time, last_out_time, total_hours, late_minutes, overtime_hours, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, attendanceId, dutyDate, employee.id, shift.id, firstIn, lastOut, totalHours, lateMinutes, overtimeHours, status);
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

module.exports = {
  ingestPunch,
  resolveDutyDate,
  generatePunchHash
};