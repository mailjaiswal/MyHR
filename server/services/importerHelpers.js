// Shared helpers for biometric file importers (SQL dumps, ATTLOG .dat, CSV).
// Centralises device/employee auto-provisioning so every ingestion path
// (API sync, SQL import, ATTLOG import) produces consistent master data.
const crypto = require('crypto');
const { db } = require('../db/database');

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
  if (counters.createdDeviceIds) counters.createdDeviceIds.push(id);
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
  // employees.first_name is NOT NULL; use the full name as first name for auto-created staff.
  await db.run(`
    INSERT INTO employees (id, employee_code, biometric_user_id, first_name, full_name, designation, department_id, shift_id, gender, date_of_joining, base_ctc, role, status)
    VALUES (?, ?, ?, ?, ?, 'Imported Employee', ?, ?, 'Other', ?, 0, 'EMPLOYEE', 'ACTIVE')
  `, id, `IMP-${biometricUserId}`, biometricUserId, name, name, departmentId, shiftId, new Date().toISOString().slice(0, 10));
  counters.employeesCreated += 1;
  if (counters.createdNames) counters.createdNames.push(name);
  if (counters.createdEmployeeIds) counters.createdEmployeeIds.push(id);
  return db.get('SELECT * FROM employees WHERE id = ?', id);
}

// Resolve a device id for a punch: named serial → existing row → (auto-create) →
// oldest known device. Throws only when nothing at all exists.
async function resolveDeviceId(deviceSerial, { createDevices = true, counters } = {}) {
  if (deviceSerial) {
    if (createDevices) return ensureDevice(deviceSerial, counters || { devicesCreated: 0 });
    const row = await db.get('SELECT id FROM devices WHERE serial_number = ?', String(deviceSerial));
    if (row) return row.id;
  }
  const fallback = await db.get('SELECT id FROM devices ORDER BY created_at ASC LIMIT 1');
  if (fallback) return fallback.id;
  if (createDevices) return ensureDevice(deviceSerial || null, counters || { devicesCreated: 0 });
  throw new Error('No biometric device exists; create a device first or enable auto-create devices.');
}

// Set of biometric_user_ids that already resolve to an employee row. Used by the
// preview endpoint to flag, per parsed row, whether it will match an existing staff
// member or auto-create a new one — so admins can eyeball before importing.
async function knownBiometricIds() {
  const rows = await db.all('SELECT biometric_user_id FROM employees WHERE biometric_user_id IS NOT NULL');
  return new Set(rows.map(r => String(r.biometric_user_id)));
}

module.exports = { slugId, ensureDevice, ensureEmployee, defaultShiftId, defaultDepartmentId, resolveDeviceId, knownBiometricIds };
