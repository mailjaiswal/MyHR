// One-shot: wipe ALL demo data from PostgreSQL and load the client's real
// biometric ATTLOG export end-to-end (devices → employees → punches →
// attendance via the production engine → payroll for the punched month).
//
//   node server/scripts/wipeAndImportAttlog.js ["<path to *_attlog.dat>"]
//
// Defaults to the file the client dropped in "Biometric Machines data/".
// Login after wipe: admin email below with password Welcome@123 (must change).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
// Match device wall clocks (IST) so the attendance engine's local-time math works.
process.env.TZ = 'Asia/Kolkata';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { db, pool, migrate } = require('../db/db');
const attlog = require('../services/attlogImporter');
const { runMonthlyPayroll } = require('../services/payrollEngine');

const ADMIN_EMAIL = process.env.WIPE_ADMIN_EMAIL || 'admin@dubeynursinghome.in';
const ADMIN_PASSWORD = 'Welcome@123';

function fileFromArgv() {
  const arg = process.argv[2];
  if (arg) return path.resolve(arg);
  const dir = path.join(__dirname, '..', '..', 'Biometric Machines data');
  const hit = fs.readdirSync(dir).find(f => /_attlog\.dat$/i.test(f));
  if (!hit) throw new Error(`No *_attlog.dat found in ${dir} — pass the file path as argument`);
  return path.join(dir, hit);
}

async function wipe() {
  console.log('· Wiping all demo transactional + master data…');
  await db.run(`TRUNCATE employee_documents, employee_personal_details, payslips, payroll_runs,
      leave_requests, leave_balances, employee_shifts, attendance_records, biometric_punches,
      sync_logs, data_sources, holidays, leave_types, ot_policy, employees, devices, shifts,
      departments, roles, organizations CASCADE`);
  await db.run(`DELETE FROM audit_logs`);
  await db.run(`DELETE FROM email_outbox`);
  await db.run(`DELETE FROM backups`);
}

async function seedMasters() {
  await db.run(`INSERT INTO organizations (id, name, address, industry_label, tagline, director_name, director_title)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    'org_main', 'Dubey Nursing Home', 'Madhya Pradesh, India',
    'Nursing Home & Hospital Care', 'Biometric Attendance, Leave & Payroll',
    'Management', 'Managing Director');

  const depts = [
    ['dept_nursing', 'NURSING', 'Nursing & Care'],
    ['dept_ward', 'WARD', 'Ward & Patient Support'],
    ['dept_housekeeping', 'HOUSEKEEPING', 'Housekeeping'],
    ['dept_kitchen', 'KITCHEN', 'Kitchen & Dietetics'],
    ['dept_admin', 'ADMIN', 'Administration'],
    ['dept_finance', 'FINANCE', 'Accounts & Finance'],
    ['dept_facilities', 'FACILITIES', 'Facilities & Maintenance'],
    ['dept_security', 'SECURITY', 'Security']
  ];
  for (const [id, code, name] of depts) {
    await db.run(`INSERT INTO departments (id, code, name) VALUES (?, ?, ?)`, id, code, name);
  }

  // Generic 12h day / 12h night + 8h standards; rename once real rosters arrive.
  const shifts = [
    ['shift_day', 'Day (07:00 - 19:00)', '07:00', '19:00', 12, 15, 60, '#6366f1', 0],
    ['shift_night', 'Night (19:00 - 07:00)', '19:00', '07:00', 12, 15, 60, '#8b5cf6', 1],
    ['shift_gen8', 'General (09:30 - 18:30)', '09:30', '18:30', 8, 15, 45, '#10b981', 0],
    ['shift_12', 'Long (08:00 - 20:00)', '08:00', '20:00', 12, 15, 60, '#f59e0b', 0]
  ];
  for (const [id, name, st, et, dur, grace, brk, color, xmid] of shifts) {
    await db.run(`INSERT INTO shifts (id, name, start_time, end_time, duration_hours, grace_minutes, break_duration_minutes, color_code, is_cross_midnight)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, name, st, et, dur, grace, brk, color, xmid);
  }

  await db.run(`INSERT INTO ot_policy (id, name, tier1_threshold_hours, tier2_threshold_hours, tier1_multiplier, tier2_multiplier, weekend_multiplier, holiday_multiplier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 'ot_default', 'Standard 1.5x / 2.0x', 8, 12, 1.5, 2.0, 2.0, 2.0);

  const leaves = [
    ['lt_annual', 'ANNUAL', 'Annual / Privilege Leave', 20, 'FRONTLOADED', 10, 1, 1, 0, '#22c55e'],
    ['lt_sick', 'SICK', 'Sick Leave', 12, 'YEARLY', 0, 0, 1, 1, '#ef4444'],
    ['lt_casual', 'CASUAL', 'Casual Leave', 10, 'YEARLY', 0, 0, 1, 0, '#3b82f6'],
    ['lt_comp', 'COMPOFF', 'Compensatory Off', 0, 'MONTHLY', 0, 0, 1, 0, '#a855f7']
  ];
  for (const [id, code, name, allow, accrual, cfl, encash, paid, reqDoc, color] of leaves) {
    await db.run(`INSERT INTO leave_types (id, code, name, annual_allowance, accrual_basis, carry_forward_limit, encashable, paid, requires_document, color_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, code, name, allow, accrual, cfl, encash, paid, reqDoc, color);
  }

  const ALL_PERMS = [
    'DASHBOARD_VIEW', 'ATTENDANCE_VIEW', 'ATTENDANCE_EDIT', 'REGULARIZATION_APPROVE',
    'PAYROLL_VIEW', 'PAYROLL_MANAGE', 'EMPLOYEES_VIEW', 'EMPLOYEES_EDIT',
    'LEAVES_VIEW', 'LEAVES_REQUEST', 'LEAVES_APPROVE', 'ROSTER_VIEW', 'ROSTER_EDIT',
    'SETTINGS_VIEW', 'SETTINGS_EDIT', 'ACCESS_MANAGE', 'EXPORTS', 'DEMO_LAB', 'AUDIT_VIEW'
  ];
  const roles = [
    ['role_super', 'Super Admin', 'SUPER_ADMIN', 'ALL', ALL_PERMS, 1],
    ['role_admin', 'HR Admin', 'ADMIN', 'ALL', ALL_PERMS.filter(p => p !== 'ACCESS_MANAGE'), 2],
    ['role_manager', 'Manager', 'MANAGER', 'TEAM', ['DASHBOARD_VIEW', 'ATTENDANCE_VIEW', 'ATTENDANCE_EDIT', 'REGULARIZATION_APPROVE', 'LEAVES_VIEW', 'LEAVES_REQUEST', 'LEAVES_APPROVE', 'ROSTER_VIEW', 'ROSTER_EDIT', 'EXPORTS', 'PAYROLL_VIEW', 'EMPLOYEES_VIEW'], 3],
    ['role_employee', 'Employee', 'EMPLOYEE', 'SELF', ['DASHBOARD_VIEW', 'ATTENDANCE_VIEW', 'LEAVES_VIEW', 'LEAVES_REQUEST', 'PAYROLL_VIEW', 'ROSTER_VIEW'], 4]
  ];
  for (const [id, name, key, scope, perms, sort] of roles) {
    await db.run(`INSERT INTO roles (id, name, technical_key, data_scope, permissions, is_system, sort_order)
      VALUES (?, ?, ?, ?, ?::jsonb, 1, ?)`, id, name, key, scope, JSON.stringify(perms), sort);
  }
  console.log('· Masters seeded (org, 8 departments, 4 shifts, OT, leaves, roles).');
}

async function upsertAdmin(bioIds) {
  // Keep the admin login out of the imported staff ids; fall back to an unused one.
  const free = [900, 901, 902].find(n => !bioIds.has(String(n))) || 9999;
  const bio = String(free);
  const id = 'emp_admin';
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
  await db.run(`
    INSERT INTO employees (id, employee_code, biometric_user_id, first_name, last_name, full_name, gender,
      designation, department_id, shift_id, date_of_joining, base_ctc, email, role, role_id,
      password_hash, must_change_password, verify_mode, employment_type, status)
    VALUES (?, 'EMP-000', ?, 'HR', 'Administrator', 'HR Administrator', 'Other',
      'HR Administrator', 'dept_admin', 'shift_gen8', ?, 0, ?, 'SUPER_ADMIN', 'role_super',
      ?, 1, 'PASSWORD', 'REGULAR', 'ACTIVE')
    ON CONFLICT (id) DO NOTHING
  `, id, bio, new Date().toISOString().slice(0, 10), ADMIN_EMAIL, hash);
  return { id, bio };
}

// Infer a plausible shift per biometric ID from its punch clock profile.
// The device file carries no reliable In/Out flag (VERIFYSTATE is constant), so
// attendance pairing across midnight is driven by each staff member's shift.
// We compare core-day (08:00–17:59) vs core-night (22:00–05:59) punches; whoever's
// activity is dominated by the night band → Night (cross-midnight 19:00→07:00),
// otherwise Day (07:00→19:00). A 30% night share tips the balance. Editable in Shift Roster.
async function provisionStaff(punches) {
  const byId = {};
  for (const p of punches) {
    const hr = parseInt(String(p.localTime).slice(11, 13), 10);
    (byId[p.biometricUserId] = byId[p.biometricUserId] || []).push(hr);
  }
  let created = 0;
  let nightCount = 0;
  for (const [bio, hours] of Object.entries(byId)) {
    const coreNight = hours.filter(h => h >= 22 || h <= 5).length;
    const coreDay = hours.filter(h => h >= 8 && h <= 17).length;
    const isNight = coreNight >= (coreDay + coreNight) * 0.30 && coreNight > 0;
    if (isNight) nightCount += 1;
    const shiftId = isNight ? 'shift_night' : 'shift_day';
    const id = `emp_bio${bio}`;
    const name = `Staff #${bio}`;
    await db.run(`
      INSERT INTO employees (id, employee_code, biometric_user_id, first_name, full_name, gender,
        designation, department_id, shift_id, verify_mode, employment_type, date_of_joining, base_ctc, role, role_id, status)
      VALUES (?, ?, ?, ?, ?, 'Other', ?, 'dept_ward', ?, 'FINGERPRINT', 'REGULAR', ?, 0, 'EMPLOYEE', 'role_employee', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET shift_id = EXCLUDED.shift_id
    `, id, `DNH-${bio}`, bio, name, name, 'Staff (Biometric)', shiftId, new Date().toISOString().slice(0, 10));
    created += 1;
  }
  console.log(`· Pre-provisioned ${created} staff: ${created - nightCount} Day / ${nightCount} Night (inferred from punch profile).`);
}

async function main() {
  const filePath = fileFromArgv();
  const fileName = path.basename(filePath);
  console.log(`\n=== myHR wipe + ATTLOG import ===\nFile: ${filePath}\n`);

  const buffer = fs.readFileSync(filePath);
  if (!attlog.looksLikeAttlog(buffer, fileName)) {
    throw new Error('File does not look like a ZKTeco ATTLOG .dat export');
  }
  const preview = attlog.parseAttlog(buffer, fileName);
  const bioIds = new Set(preview.punches.map(p => p.biometricUserId));
  console.log(`· Parsed ${preview.punches.length} punches, ${bioIds.size} unique biometric IDs, ${preview.from.slice(0, 10)} → ${preview.to.slice(0, 10)} (IST), device serial: ${preview.serial}`);

  await migrate();
  await wipe();
  await seedMasters();
  const admin = await upsertAdmin(bioIds);
  console.log(`· Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD} (bio id ${admin.bio}, force-change on first login)`);
  await provisionStaff(preview.punches);

  const summary = await attlog.importAttlog({
    buffer, fileName,
    sourceName: `Client ATTLOG · ${fileName}`,
    options: { createEmployees: true, createDevices: true }
  });
  console.log(`· Import: found ${summary.recordsFound}, imported ${summary.recordsImported}, skipped ${summary.recordsSkipped}, employees created ${summary.employeesCreated}, devices created ${summary.devicesCreated}`);
  if (summary.errors?.length) console.log('  errors:', summary.errors.slice(0, 5));

  const att = await db.get(`SELECT COUNT(*) n, MIN(duty_date) d1, MAX(duty_date) d2 FROM attendance_records`);
  console.log(`· Attendance rows: ${att.n} (${att.d1} → ${att.d2})`);

  // Payroll for the dominant punched month (IST dates)
  const monthRow = await db.get(`SELECT to_char(duty_date, 'YYYY-MM') m, COUNT(*) c FROM attendance_records GROUP BY m ORDER BY c DESC LIMIT 1`);
  if (monthRow) {
    console.log(`· Running payroll for ${monthRow.m}…`);
    const pay = await runMonthlyPayroll(monthRow.m);
    console.log('  payroll:', JSON.stringify(pay));
  }

  console.log('\nDONE — demo data removed, client ATTLOG data loaded.\n');
  await pool.end();
}

main().catch(async (e) => {
  console.error('WIPE/IMPORT FAIL:', e);
  await pool.end().catch(() => {});
  process.exit(1);
});
