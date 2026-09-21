// Neutral demo-company seed for PostgreSQL (MyHR v2).
// Repoints an empty Supabase schema into a working demo:
// org profile -> departments -> shifts -> ot policy -> leave types -> holidays ->
// devices -> employees (personas + staff) -> punched history -> attendance -> payroll.
// Run manually:  node db/seedPg.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { db, pool } = require('./database');
const { ingestPunch } = require('../services/attendanceEngine');
const { runMonthlyPayroll } = require('../services/payrollEngine');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const T = (d) => d.toISOString();
const pad = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

async function clearAll() {
  await db.run('TRUNCATE employee_documents, employee_personal_details, payslips, payroll_runs, leave_requests, leave_balances, employee_shifts, attendance_records, biometric_punches, sync_logs, data_sources, holidays, leave_types, ot_policy, employees, devices, shifts, departments, roles, organizations');
}

async function seedOrg() {
  await db.run(`INSERT INTO organizations (id, name, address, gstin, registration_no, contact_person, industry_label, tagline, director_name, director_title, contact_phone, contact_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'org_main',
    'Novaven Workforce Services',
    'Plot 21, Midland Industrial Estate, Chhindwara, Madhya Pradesh - 480001',
    '23AAACN0000A1Z6',
    'MP-CHW-SRV-2021/117',
    'Priya Sharma (HR Manager)',
    'Facility & Healthcare Staffing',
    'Biometric Attendance, Leave & Payroll',
    'Aarav Mehta',
    'Managing Director',
    '+91 7162 240 000',
    'hr@novaven.example');
}

async function seedDepartments() {
  const depts = [
    ['dept_nursing', 'NURSING', 'Nursing & Care', 'Anita Nair'],
    ['dept_housekeeping', 'HOUSEKEEPING', 'Housekeeping', 'Salma Begum'],
    ['dept_kitchen', 'KITCHEN', 'Kitchen & Dietetics', 'Nilesh Wankhede'],
    ['dept_admin', 'ADMIN', 'Administration', 'Aarav Mehta'],
    ['dept_finance', 'FINANCE', 'Accounts & Finance', 'Farhan Ali'],
    ['dept_it', 'IT', 'IT & HR', 'Rohit Meshram'],
    ['dept_security', 'SECURITY', 'Security', 'Ganesh Deshmukh'],
    ['dept_facilities', 'FACILITIES', 'Facilities & Maintenance', 'Vikram Pal']
  ];
  for (const [id, code, name, hod] of depts) {
    await db.run(`INSERT INTO departments (id, code, name, head_of_department) VALUES (?, ?, ?, ?)`, id, code, name, hod);
  }
}

async function seedShifts() {
  const shifts = [
    ['shift_day', 'Day (07:00 - 15:00)', '07:00', '15:00', 8, 15, 30, '#6366f1', 0],
    ['shift_eve', 'Evening (15:00 - 23:00)', '15:00', '23:00', 8, 15, 30, '#f59e0b', 0],
    ['shift_night', 'Night (23:00 - 07:00)', '23:00', '07:00', 8, 15, 30, '#8b5cf6', 1],
    ['shift_gen', 'General (09:30 - 18:30)', '09:30', '18:30', 8, 15, 45, '#10b981', 0]
  ];
  for (const [id, name, st, et, dur, grace, brk, color, xmid] of shifts) {
    await db.run(`INSERT INTO shifts (id, name, start_time, end_time, duration_hours, grace_minutes, break_duration_minutes, color_code, is_cross_midnight) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, name, st, et, dur, grace, brk, color, xmid);
  }
}

async function seedOtPolicy() {
  await db.run(`INSERT INTO ot_policy (id, name, tier1_threshold_hours, tier2_threshold_hours, tier1_multiplier, tier2_multiplier, weekend_multiplier, holiday_multiplier) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    'ot_default', 'Standard 1.5x / 2.0x', 8, 12, 1.5, 2.0, 2.0, 2.0);
}

async function seedLeaveTypes() {
  const leaves = [
    ['lt_annual', 'ANNUAL', 'Annual / Privilege Leave', 20, 'FRONTLOADED', 10, 1, 1, 0, 1, '#22c55e'],
    ['lt_sick', 'SICK', 'Sick Leave', 12, 'YEARLY', 0, 0, 1, 1, 1, '#ef4444'],
    ['lt_casual', 'CASUAL', 'Casual Leave', 10, 'YEARLY', 0, 0, 1, 0, 1, '#3b82f6'],
    ['lt_comp', 'COMPOFF', 'Compensatory Off', 0, 'MONTHLY', 0, 0, 1, 0, 1, '#a855f7'],
    ['lt_bereavement', 'BEREAVEMENT', 'Bereavement Leave', 3, 'YEARLY', 0, 0, 1, 0, 1, '#64748b']
  ];
  for (const [id, code, name, allow, accrual, cfl, encash, paid, reqDoc, active, color] of leaves) {
    await db.run(`INSERT INTO leave_types (id, code, name, annual_allowance, accrual_basis, carry_forward_limit, encashable, paid, requires_document, approval_steps, color_code, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, code, name, allow, accrual, cfl, encash, paid, reqDoc, 1, color, active);
  }
}

async function seedHolidays() {
  const hols = [
    ['Republic Day', '2026-01-26', 0],
    ['Holi', '2026-03-04', 1],
    ['Mahavir Jayanti', '2026-04-02', 1],
    ['Eid-ul-Fitr', '2026-03-31', 1],
    ['Independence Day', '2026-08-15', 0],
    ['Gandhi Jayanti', '2026-10-02', 0],
    ['Diwali (Lakshmi Pujan)', '2026-11-08', 1],
    ['Christmas Day', '2026-12-25', 0]
  ];
  for (const [name, dt, regional] of hols) {
    await db.run(`INSERT INTO holidays (id, name, holiday_date, is_regional, region, holiday_type) VALUES (?, ?, ?, ?, 'MP', ?)`,
      `hol_${dt}_${name.replace(/[^A-Za-z0-9]/g, '_')}`, name, dt, regional, regional ? 'REGIONAL' : 'PUBLIC');
  }
}

async function seedDevices() {
  const devs = [
    ['dev_1', 'UL30201234', 'eSSL uFace 302 (Face + Fingerprint + RFID)', 'Reception Lobby', '192.168.1.51'],
    ['dev_2', 'ZF05500024', 'ZKTeco SpeedFace-V5L (Visible Light AI Face + Palm)', 'Staff Wing', '192.168.1.52'],
    ['dev_3', 'EK90B00210', 'eSSL K90 Pro (Fingerprint + Battery Backup)', 'Back Office', '192.168.1.53'],
    ['dev_4', 'ZM20B0187', 'ZKTeco MB20 (Face Recognition & RFID)', 'Stores & Stores', '192.168.1.54']
  ];
  for (const [id, serial, model, loc, ip] of devs) {
    await db.run(`INSERT INTO devices (id, serial_number, model, device_name, location, ip_address, port, protocol, status) VALUES (?, ?, ?, ?, ?, ?, 4370, 'PUSH_ADMS', 'ONLINE')`,
      id, serial, model, `Terminal — ${loc}`, loc, ip);
  }
}

const ALL_PERMS = [
  'DASHBOARD_VIEW','ATTENDANCE_VIEW','ATTENDANCE_EDIT','REGULARIZATION_APPROVE',
  'PAYROLL_VIEW','PAYROLL_MANAGE','EMPLOYEES_VIEW','EMPLOYEES_EDIT',
  'LEAVES_VIEW','LEAVES_REQUEST','LEAVES_APPROVE','ROSTER_VIEW','ROSTER_EDIT',
  'SETTINGS_VIEW','SETTINGS_EDIT','ACCESS_MANAGE','EXPORTS','DEMO_LAB','AUDIT_VIEW'
];

async function seedRoles() {
  const roles = [
    { id: 'role_super', name: 'Super Admin', technical_key: 'SUPER_ADMIN', data_scope: 'ALL', permissions: ALL_PERMS, is_system: 1, sort_order: 1 },
    { id: 'role_admin', name: 'HR Admin', technical_key: 'ADMIN', data_scope: 'ALL', permissions: ALL_PERMS.filter(p => p !== 'ACCESS_MANAGE'), is_system: 1, sort_order: 2 },
    { id: 'role_manager', name: 'Manager', technical_key: 'MANAGER', data_scope: 'TEAM', permissions: ['DASHBOARD_VIEW','ATTENDANCE_VIEW','ATTENDANCE_EDIT','REGULARIZATION_APPROVE','LEAVES_VIEW','LEAVES_REQUEST','LEAVES_APPROVE','ROSTER_VIEW','ROSTER_EDIT','EXPORTS','PAYROLL_VIEW','EMPLOYEES_VIEW'], is_system: 1, sort_order: 3 },
    { id: 'role_employee', name: 'Employee', technical_key: 'EMPLOYEE', data_scope: 'SELF', permissions: ['DASHBOARD_VIEW','ATTENDANCE_VIEW','LEAVES_VIEW','LEAVES_REQUEST','PAYROLL_VIEW','ROSTER_VIEW'], is_system: 1, sort_order: 4 }
  ];
  for (const r of roles) {
    await db.run(`INSERT INTO roles (id, name, technical_key, data_scope, permissions, is_system, sort_order) VALUES (?, ?, ?, ?, ?::jsonb, ?, ?)`,
      r.id, r.name, r.technical_key, r.data_scope, JSON.stringify(r.permissions), r.is_system, r.sort_order);
  }
  console.log('Seeded 4 system roles.');
}

// Helper: role_id lookup from technical_key
const ROLE_MAP = { SUPER_ADMIN: 'role_super', ADMIN: 'role_admin', MANAGER: 'role_manager', EMPLOYEE: 'role_employee' };

const STAFF = [
  { code: 'EMP-001', bio: '101', first: 'Aarav', last: 'Mehta', gender: 'Male', dept: 'dept_admin', shift: 'shift_gen', desig: 'Managing Director', role: 'SUPER_ADMIN', ctc: 140000, join: '2018-04-02', mobile: '9826000001', city: 'Chhindwara' },
  { code: 'EMP-002', bio: '102', first: 'Priya', last: 'Sharma', gender: 'Female', dept: 'dept_it', shift: 'shift_gen', desig: 'HR Manager', role: 'ADMIN', ctc: 68000, join: '2019-06-17', mobile: '9826000002', city: 'Chhindwara' },
  { code: 'EMP-003', bio: '103', first: 'Anita', last: 'Nair', gender: 'Female', dept: 'dept_nursing', shift: 'shift_day', desig: 'Head Nurse', role: 'MANAGER', ctc: 52000, join: '2020-01-06', mobile: '9826000003', city: 'Chhindwara', mgr: 'emp_102' },
  { code: 'EMP-004', bio: '104', first: 'Ramesh', last: 'Yadav', gender: 'Male', dept: 'dept_nursing', shift: 'shift_day', desig: 'Staff Nurse', role: 'EMPLOYEE', ctc: 32000, join: '2021-08-11', mobile: '9826000004', city: 'Chhindwara', mgr: 'emp_103' },
  { code: 'EMP-005', bio: '105', first: 'Sunita', last: 'Kapse', gender: 'Female', dept: 'dept_nursing', shift: 'shift_eve', desig: 'Staff Nurse', role: 'EMPLOYEE', ctc: 33000, join: '2021-09-01', mobile: '9826000005', city: 'Chhindwara', mgr: 'emp_103' },
  { code: 'EMP-006', bio: '106', first: 'Deepak', last: 'Lodhi', gender: 'Male', dept: 'dept_nursing', shift: 'shift_night', desig: 'Nursing Assistant', role: 'EMPLOYEE', ctc: 24000, join: '2022-02-14', mobile: '9826000006', city: 'Chhindwara', mgr: 'emp_103' },
  { code: 'EMP-007', bio: '107', first: 'Kavita', last: 'Patil', gender: 'Female', dept: 'dept_nursing', shift: 'shift_night', desig: 'Nursing Assistant', role: 'EMPLOYEE', ctc: 24500, join: '2022-03-21', mobile: '9826000007', city: 'Chhindwara', mgr: 'emp_103' },
  { code: 'EMP-008', bio: '108', first: 'Mahesh', last: 'Ghodke', gender: 'Male', dept: 'dept_facilities', shift: 'shift_day', desig: 'Care Assistant', role: 'EMPLOYEE', ctc: 19000, join: '2022-07-05', mobile: '9826000008', city: 'Chhindwara', mgr: 'emp_103' },
  { code: 'EMP-009', bio: '109', first: 'Salma', last: 'Begum', gender: 'Female', dept: 'dept_housekeeping', shift: 'shift_day', desig: 'Housekeeping Supervisor', role: 'MANAGER', ctc: 21000, join: '2021-11-15', mobile: '9826000009', city: 'Chhindwara', mgr: 'emp_102' },
  { code: 'EMP-010', bio: '110', first: 'Vikram', last: 'Pal', gender: 'Male', dept: 'dept_housekeeping', shift: 'shift_eve', desig: 'Housekeeping Staff', role: 'EMPLOYEE', ctc: 16500, join: '2023-01-09', mobile: '9826000010', city: 'Chhindwara', mgr: 'emp_109' },
  { code: 'EMP-011', bio: '111', first: 'Nilesh', last: 'Wankhede', gender: 'Male', dept: 'dept_kitchen', shift: 'shift_day', desig: 'Chef', role: 'MANAGER', ctc: 28000, join: '2020-10-19', mobile: '9826000011', city: 'Chhindwara', mgr: 'emp_102' },
  { code: 'EMP-012', bio: '112', first: 'Farhan', last: 'Ali', gender: 'Male', dept: 'dept_finance', shift: 'shift_gen', desig: 'Accountant', role: 'EMPLOYEE', ctc: 38000, join: '2019-12-02', mobile: '9826000012', city: 'Chhindwara', mgr: 'emp_101' },
  { code: 'EMP-013', bio: '113', first: 'Ganesh', last: 'Deshmukh', gender: 'Male', dept: 'dept_security', shift: 'shift_night', desig: 'Security Guard', role: 'EMPLOYEE', ctc: 16000, join: '2023-04-03', mobile: '9826000013', city: 'Pandhurna', mgr: 'emp_102' },
  { code: 'EMP-014', bio: '114', first: 'Rohit', last: 'Meshram', gender: 'Male', dept: 'dept_it', shift: 'shift_gen', desig: 'IT Executive', role: 'EMPLOYEE', ctc: 30000, join: '2022-05-16', mobile: '9826000014', city: 'Nagpur', mgr: 'emp_102' },
  { code: 'EMP-015', bio: '115', first: 'Sneha', last: 'Kale', gender: 'Female', dept: 'dept_admin', shift: 'shift_gen', desig: 'Front Office Executive', role: 'EMPLOYEE', ctc: 22000, join: '2023-08-07', mobile: '9826000015', city: 'Chhindwara', mgr: 'emp_102' }
];

async function seedEmployees() {
  // Default temp password for all demo accounts: "Welcome@123"
  const demoHash = await bcrypt.hash('Welcome@123', 12);
  for (const s of STAFF) {
    const id = `emp_${s.bio}`;
    const roleId = ROLE_MAP[s.role] || 'role_employee';
    await db.run(`
      INSERT INTO employees (id, employee_code, biometric_user_id, first_name, last_name, full_name, card_no, gender, city, mobile, email, verify_mode, employment_type, designation, department_id, manager_id, shift_id, date_of_joining, base_ctc, uan, esi_ip, bank_name, bank_account, bank_ifsc, pan, role, role_id, password_hash, must_change_password, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FINGERPRINT', 'REGULAR', ?, ?, ?, ?, ?, ?, 'UAN0000000', 'ESI-MP-0000000', 'State Bank of India', ?, 'SBIN0000354', ?, ?, ?, ?, 0, 'ACTIVE')
    `,
      id, s.code, s.bio, s.first, s.last, `${s.first} ${s.last}`, `CARD${s.bio}`,
      s.gender, s.city, s.mobile, `${s.first.toLowerCase()}.${s.last.toLowerCase()}@novaven.example`,
      s.desig, s.dept, s.mgr || null, s.shift, s.join, s.ctc,
      `ACC${String(Math.floor(100000 + Math.random() * 900000))}${s.bio}`,
      `ABCDP${String(1200 + parseInt(s.bio, 10))}C`,
      s.role, roleId, demoHash
    );

    await db.run(`INSERT INTO employee_personal_details (employee_id, religion, marital_status, father_name, blood_group, address_line1, state, pincode, emergency_contact_name, emergency_contact_phone, emergency_contact_relation) VALUES (?, 'Hindu', 'Married', ?, 'B+', 'Residential Colony, Chhindwara', 'Madhya Pradesh', '480001', ?, '9826000000', 'Spouse')`,
      id, `${s.first} Sr.`, s.first === 'Priya' ? 'Rahul' : `${s.first} Sr.`);

    await db.run(`INSERT INTO employee_documents (id, employee_id, doc_type, file_name, notes) VALUES (?, ?, 'ID_PROOF', 'employee_card.pdf', 'Scanned on onboarding')`,
      `doc_${s.bio}_1`, id);
  }
  console.log('Seeded employees with password hashes and role_ids.');
}

// Generate ~60 days of realistic punches through the real ingestion engine.
async function seedPunches() {
  const now = new Date();
  const days = 60;
  const dayCounters = {};

  for (const s of STAFF) {
    const shift = (await db.get('SELECT * FROM shifts WHERE id = ?', s.shift));
    const deviceId = `dev_${((parseInt(s.bio, 10) - 101) % 4) + 1}`;

    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);
      const key = dateStr(day);

      const r = Math.random();
      const alwaysPresent = [ 'admin', 'it' ].some(t => s.dept.startsWith(t)) && r < 0.94;
      const absent = !alwaysPresent && r < 0.08;             // ~8% absent
      const halfDay = !absent && r < 0.13;                    // additional ~5% half day
      const late = !absent && r < 0.20;                       // late arrivals
      const overtime = !absent && !halfDay && r > 0.72;       // some overtime days

      if (absent) {
        dayCounters[key] = (dayCounters[key] || 0) + 1;
        continue;
      }

      const [sh, sm] = shift.start_time.split(':').map(Number);
      const [eh, em] = shift.end_time.split(':').map(Number);
      const inDelay = late ? 20 + Math.floor(Math.random() * 25) : Math.floor(Math.random() * 9) - 4;
      const inDate = new Date(day);
      inDate.setHours(sh, sm + inDelay, Math.floor(Math.random() * 50), 0);

      let totalMin = halfDay
        ? 300 + Math.floor(Math.random() * 60)                // ~5-6h
        : (overtime ? 8 * 60 + 45 + Math.floor(Math.random() * 60) : 8 * 60 + 5 + Math.floor(Math.random() * 20));
      const outDate = new Date(inDate.getTime() + totalMin * 60 * 1000);

      try {
        await ingestPunch({ deviceId, biometricUserId: s.bio, punchTime: T(inDate) });
        await ingestPunch({ deviceId, biometricUserId: s.bio, punchTime: T(outDate) });
      } catch (e) {
        console.warn(`punch ${s.code} ${key}: ${e.message}`);
      }
    }
  }
  console.log('Punches seeded for', days, 'days across', STAFF.length, 'staff');
}

async function seedLeaves() {
  const balances = STAFF.map(s => `('lb_${s.bio}_annual', 'emp_${s.bio}', 'lt_annual', 2026, 20, ${Math.floor(Math.random() * 3)}, 0, 2, 0)`);
  await db.run(`INSERT INTO leave_balances (id, employee_id, leave_type_id, year, accumulated, used, pending, carried_forward, encashed) VALUES ${balances.join(',')}`);
}

async function main() {
  console.log('Seeding neutral demo company into PostgreSQL…');
  await clearAll();
  await seedOrg();
  await seedDepartments();
  await seedShifts();
  await seedOtPolicy();
  await seedLeaveTypes();
  await seedHolidays();
  await seedDevices();
  await seedRoles();
  await seedEmployees();
  await seedPunches();
  await seedLeaves();

  const empCount = await db.get('SELECT count(*) as n FROM employees');
  const attCount = await db.get('SELECT count(*) as n FROM attendance_records');
  const punchCount = await db.get('SELECT count(*) as n FROM biometric_punches');
  console.log(`Seeded ${empCount.n} employees, ${attCount.n} attendance records, ${punchCount.n} punches.`);

  const month = new Date().toISOString().slice(0, 7);
  console.log(`Running payroll for ${month}…`);
  const summary = await runMonthlyPayroll(month);
  console.log('Payroll summary:', JSON.stringify(summary));
  console.log('Seed complete.');

  await pool.end();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('SEED FAIL:', e);
  await pool.end().catch(() => {});
  process.exit(1);
});