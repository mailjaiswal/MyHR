const { db, initSchema } = require('./database');
const config = require('../config');
const { generatePunchHash } = require('../services/attendanceEngine');
const { runMonthlyPayroll } = require('../services/payrollEngine');

function seedDatabase() {
  initSchema();

  console.log('Seeding Dubey Nursing Home database with dynamic mock data...');

  // 0. Clear dependent child tables first to respect foreign keys
  db.prepare(`DELETE FROM payslips`).run();
  db.prepare(`DELETE FROM payroll_runs`).run();
  db.prepare(`DELETE FROM biometric_punches`).run();
  db.prepare(`DELETE FROM attendance_records`).run();
  db.prepare(`DELETE FROM employees`).run();
  db.prepare(`DELETE FROM shifts`).run();
  db.prepare(`DELETE FROM departments`).run();
  db.prepare(`DELETE FROM devices`).run();
  db.prepare(`DELETE FROM organizations`).run();

  // 1. Organization
  db.prepare(`
    INSERT INTO organizations (id, name, address, gstin, registration_no, contact_person)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'org_dubey_nh',
    config.ORGANIZATION.NAME,
    config.ORGANIZATION.ADDRESS,
    config.ORGANIZATION.GSTIN,
    config.ORGANIZATION.REGISTRATION_NO,
    'HR Administrator' // Dynamic reference from DB
  );

  // 2. Departments
  const insertDept = db.prepare(`INSERT INTO departments (id, name, head_of_department, min_staff_required) VALUES (?, ?, ?, ?)`);
  insertDept.run('dept_icu', 'Intensive Care Unit (ICU)', 'Dr. R. K. Dubey', 4);
  insertDept.run('dept_emergency', 'Emergency & Casualty', 'Dr. Alok Verma', 3);
  insertDept.run('dept_opd', 'Out-Patient Department (OPD)', 'Dr. Priya Sharma', 2);
  insertDept.run('dept_ot', 'Operation Theatre (OT)', 'Dr. R. K. Dubey', 3);
  insertDept.run('dept_lab', 'Pathology & Diagnostics', 'Dr. Sunita Sen', 2);
  insertDept.run('dept_pharmacy', 'Pharmacy & Store', 'Amit Patel', 2);
  insertDept.run('dept_admin', 'Administration & HR', 'HR Administrator', 2);
  insertDept.run('dept_wards', 'General & Private Wards', 'Sister Mary Kutty', 5);

  // 3. Shifts (Flexible Hospital Timings, Configurable by Super Admin)
  db.prepare(`DELETE FROM shifts`).run();
  const insertShift = db.prepare(`INSERT INTO shifts (id, name, start_time, end_time, duration_hours, is_cross_midnight) VALUES (?, ?, ?, ?, ?, ?)`);
  insertShift.run('shift_morning', 'Morning Duty Shift', '08:00', '16:00', 8.0, 0);
  insertShift.run('shift_evening', 'Evening Duty Shift', '14:00', '22:00', 8.0, 0);
  insertShift.run('shift_night', 'Night Duty Shift (Cross-Midnight)', '20:00', '08:00', 12.0, 1);
  insertShift.run('shift_general', 'General Hospital Shift', '09:30', '18:30', 9.0, 0);

  // 4. Biometric Devices (Choosable Models for Anubhav Infotech Phase 2)
  db.prepare(`DELETE FROM devices`).run();
  const insertDev = db.prepare(`INSERT INTO devices (id, serial_number, model, device_name, location, ip_address, port, protocol, last_heartbeat, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertDev.run(
    'dev_01',
    'UF302-DNH-001',
    'eSSL uFace 302 (Face + Fingerprint + RFID)',
    'ICU & Critical Care Face Reader',
    '1st Floor ICU Corridor',
    '192.168.1.201',
    4370,
    'PUSH_ADMS',
    new Date().toISOString(),
    'ONLINE'
  );
  insertDev.run(
    'dev_02',
    'K90-DNH-002',
    'eSSL K90 Pro (Fingerprint + Battery Backup)',
    'Main Reception Fingerprint Terminal',
    'Ground Floor Billing Lobby',
    '192.168.1.202',
    4370,
    'PUSH_ADMS',
    new Date().toISOString(),
    'ONLINE'
  );

  // 5. Employees / Mock Staff Data (Roles assumed dynamically from DB)
  db.prepare(`DELETE FROM employees`).run();
  const insertEmp = db.prepare(`
    INSERT INTO employees (
      id, employee_code, biometric_user_id, full_name, email, phone, designation,
      department_id, shift_id, gender, date_of_joining, base_ctc, uan, esi_ip,
      bank_name, bank_account, bank_ifsc, pan, role, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const initialStaff = [
    {
      id: 'emp_01',
      code: 'DNH-101',
      bioId: '101',
      name: 'Sneha Goswami',
      email: 'sneha.goswami@dubeynursing.in',
      phone: '9826189021',
      designation: 'Senior ICU In-Charge Staff Nurse',
      dept: 'dept_icu',
      shift: 'shift_night', // Cross-midnight shift
      gender: 'Female',
      doj: '2021-04-10',
      ctc: 32000,
      uan: '100928374821',
      esi: null,
      bankAc: '38291029381',
      pan: 'ABCPS1289K',
      role: 'EMPLOYEE'
    },
    {
      id: 'emp_02',
      code: 'DNH-102',
      bioId: '102',
      name: 'Dr. R. K. Dubey',
      email: 'dr.dubey@dubeynursing.in',
      phone: '9425112001',
      designation: 'Chief Medical Director & Surgeon',
      dept: 'dept_admin',
      shift: 'shift_general',
      gender: 'Male',
      doj: '2015-01-01',
      ctc: 150000,
      uan: null,
      esi: null,
      bankAc: '20192837461',
      pan: 'AADPD4489J',
      role: 'SUPER_ADMIN'
    },
    {
      id: 'emp_03',
      code: 'DNH-103',
      bioId: '103',
      name: 'Dr. Priya Sharma',
      email: 'dr.priya@dubeynursing.in',
      phone: '9425338192',
      designation: 'Consultant Gynecologist',
      dept: 'dept_opd',
      shift: 'shift_morning',
      gender: 'Female',
      doj: '2019-06-15',
      ctc: 95000,
      uan: null,
      esi: null,
      bankAc: '40192837492',
      pan: 'BJTPS5512L',
      role: 'ADMIN'
    },
    {
      id: 'emp_04',
      code: 'DNH-104',
      bioId: '104',
      name: 'Bhavana Chourase',
      email: 'bhavana.c@dubeynursing.in',
      phone: '7999330261',
      designation: 'HR & Hospital Administrator',
      dept: 'dept_admin',
      shift: 'shift_general',
      gender: 'Female',
      doj: '2020-02-01',
      ctc: 40000,
      uan: '100928374999',
      esi: null,
      bankAc: '33819284719',
      pan: 'ABQPC8832M',
      role: 'ADMIN'
    },
    {
      id: 'emp_05',
      code: 'DNH-105',
      bioId: '105',
      name: 'Rajesh Ahirwar',
      email: 'rajesh.lab@dubeynursing.in',
      phone: '9754129841',
      designation: 'Lead Laboratory Technician',
      dept: 'dept_lab',
      shift: 'shift_morning',
      gender: 'Male',
      doj: '2021-08-10',
      ctc: 24000,
      uan: '100928375111',
      esi: null,
      bankAc: '22839182746',
      pan: 'CRDPA9921B',
      role: 'EMPLOYEE'
    },
    {
      id: 'emp_06',
      code: 'DNH-106',
      bioId: '106',
      name: 'Amit Patel',
      email: 'amit.pharmacy@dubeynursing.in',
      phone: '9131544180',
      designation: 'Chief Pharmacist',
      dept: 'dept_pharmacy',
      shift: 'shift_evening',
      gender: 'Male',
      doj: '2022-01-15',
      ctc: 21000,
      uan: '100928376222',
      esi: '2319283746192',
      bankAc: '11829384728',
      pan: 'BNYPP6632P',
      role: 'EMPLOYEE'
    },
    {
      id: 'emp_07',
      code: 'DNH-107',
      bioId: '107',
      name: 'Sunita Bai',
      email: 'sunita.ward@dubeynursing.in',
      phone: '9826330012',
      designation: 'Ward Attendant / GDA',
      dept: 'dept_wards',
      shift: 'shift_morning',
      gender: 'Female',
      doj: '2022-05-20',
      ctc: 14500,
      uan: '100928377333',
      esi: '2319283746200',
      bankAc: '39281726354',
      pan: 'AZXPB1190K',
      role: 'EMPLOYEE'
    },
    {
      id: 'emp_08',
      code: 'DNH-108',
      bioId: '108',
      name: 'Vikas Sahu',
      email: 'vikas.sahu@dubeynursing.in',
      phone: '9826441199',
      designation: 'Operation Theatre Assistant',
      dept: 'dept_ot',
      shift: 'shift_night',
      gender: 'Male',
      doj: '2022-11-01',
      ctc: 19000,
      uan: '100928378444',
      esi: '2319283746311',
      bankAc: '39281726399',
      pan: 'CVBPS4419Q',
      role: 'EMPLOYEE'
    }
  ];

  // Additional 42 Staff Members
  const firstNames = ['Anjali', 'Kavita', 'Ritu', 'Pooja', 'Neha', 'Deepak', 'Sanjay', 'Rahul', 'Manoj', 'Santosh', 'Priyanka', 'Meena', 'Jyoti', 'Kiran', 'Archana', 'Nitin', 'Alok', 'Mohan', 'Kamal', 'Ravi'];
  const lastNames = ['Verma', 'Mishra', 'Tiwari', 'Shukla', 'Yadav', 'Malviya', 'Sen', 'Pawar', 'Chouhan', 'Deshmukh', 'Gond', 'Thakur', 'Garg', 'Bisen', 'Banjara'];
  const depts = ['dept_icu', 'dept_emergency', 'dept_wards', 'dept_ot', 'dept_lab', 'dept_pharmacy'];
  const shiftList = ['shift_morning', 'shift_evening', 'shift_night', 'shift_general'];

  let currentStaff = [...initialStaff];
  for (let i = 9; i <= 50; i++) {
    const fn = firstNames[(i * 3) % firstNames.length];
    const ln = lastNames[(i * 5) % lastNames.length];
    const isFemale = ['Anjali', 'Kavita', 'Ritu', 'Pooja', 'Neha', 'Priyanka', 'Meena', 'Jyoti', 'Kiran', 'Archana'].includes(fn);
    const dept = depts[i % depts.length];
    const shift = shiftList[i % shiftList.length];
    const ctc = 14000 + ((i * 1100) % 18000);

    currentStaff.push({
      id: `emp_${i < 10 ? '0' + i : i}`,
      code: `DNH-${100 + i}`,
      bioId: `${100 + i}`,
      name: `${fn} ${ln}`,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}@dubeynursing.in`,
      phone: `9826${100000 + i * 137}`.substring(0, 10),
      designation: dept === 'dept_icu' ? 'Staff Nurse (ICU)' : dept === 'dept_wards' ? 'General Staff Nurse' : dept === 'dept_emergency' ? 'Emergency Duty Nurse' : dept === 'dept_ot' ? 'OT Staff' : 'Healthcare Assistant',
      dept,
      shift,
      gender: isFemale ? 'Female' : 'Male',
      doj: '2023-01-10',
      ctc,
      uan: `10092837${8000 + i}`,
      esi: ctc <= 21000 ? `231928374${6000 + i}` : null,
      bankAc: `39281726${300 + i}`,
      pan: `ABCDE${1000 + i}K`,
      role: 'EMPLOYEE'
    });
  }

  currentStaff.forEach(s => {
    insertEmp.run(
      s.id, s.code, s.bioId, s.name, s.email, s.phone, s.designation,
      s.dept, s.shift, s.gender, s.doj, s.ctc, s.uan, s.esi,
      'State Bank of India', s.bankAc, 'SBIN0000354', s.pan, s.role, 'ACTIVE'
    );
  });

  console.log(`Seeded 50 staff members dynamically from mock data.`);

  // 6. Simulate Raw Biometric Punches & Attendance Records
  console.log('Simulating raw biometric punches and attendance records for Phase 1 testing...');
  db.prepare(`DELETE FROM attendance_records`).run();
  db.prepare(`DELETE FROM biometric_punches`).run();

  const insertRawPunch = db.prepare(`
    INSERT INTO biometric_punches (id, punch_hash, device_id, biometric_user_id, punch_time, verification_mode, in_out_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAtt = db.prepare(`
    INSERT INTO attendance_records (
      id, duty_date, employee_id, shift_id, first_in_time, last_out_time,
      total_hours, late_minutes, overtime_hours, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const daysInAug = 31;
  const FULL_DAY_THRESHOLD = config.ATTENDANCE_RULES.FULL_DAY_MIN_HOURS; // 7.45h
  const HALF_DAY_THRESHOLD = config.ATTENDANCE_RULES.HALF_DAY_MIN_HOURS; // 3.45h

  currentStaff.forEach((emp, empIdx) => {
    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(emp.shift);
    const deviceId = shift.id === 'shift_night' || emp.dept === 'dept_icu' ? 'dev_01' : 'dev_02';
    const vMode = empIdx % 2 === 0 ? 'FACE' : 'FINGERPRINT';

    for (let day = 1; day <= daysInAug; day++) {
      const dd = String(day).padStart(2, '0');
      const dutyDate = `2026-08-${dd}`;
      const dayOfWeek = new Date(2026, 7, day).getDay();

      if (dayOfWeek === 0) continue; // Sunday weekly off

      // Realistic variation demonstrating the 7.45h and 3.45h rules
      const isAbsent = (day % 13 === 0 && emp.id !== 'emp_01');
      const isHalfDayShort = (day % 17 === 0); // e.g. works 5.0h (between 3.45h and 7.45h)
      const isLate = (day % 6 === 0);
      const hasOvertime = (day % 4 === 0 && (emp.dept === 'dept_icu' || emp.dept === 'dept_ot'));

      let totalHours = shift.duration_hours;
      let lateMins = 0;
      let otHours = 0;
      let status = 'PRESENT';

      if (isAbsent) {
        status = 'ABSENT';
        totalHours = 0;
      } else if (isHalfDayShort) {
        // Between 3.45h and 7.45h -> counted as HALF DAY per user's rule!
        status = 'HALF_DAY';
        totalHours = 5.2; // < 7.45h but >= 3.45h
      } else {
        if (isLate) lateMins = 20;
        if (hasOvertime) {
          otHours = 2.5;
          totalHours += otHours;
          status = 'OVERTIME';
        } else {
          totalHours = shift.duration_hours; // >= 7.45h -> Full Day
          status = 'PRESENT';
        }
      }

      let inTime = null;
      let outTime = null;

      if (status !== 'ABSENT') {
        inTime = `${dutyDate}T${shift.start_time}:00Z`;
        // Calculate out timestamp based on totalHours
        const inDate = new Date(inTime);
        const outDate = new Date(inDate.getTime() + totalHours * 3600 * 1000);
        outTime = outDate.toISOString();

        // Ingest into raw biometric_punches table to provide authentic hardware raw stream
        const punchInId = `raw_${emp.bioId}_${dutyDate}_in`;
        const punchInHash = generatePunchHash(deviceId, emp.bioId, inTime);
        try {
          insertRawPunch.run(punchInId, punchInHash, deviceId, emp.bioId, inTime, vMode, 'IN');
        } catch (e) {}

        const punchOutId = `raw_${emp.bioId}_${dutyDate}_out`;
        const punchOutHash = generatePunchHash(deviceId, emp.bioId, outTime);
        try {
          insertRawPunch.run(punchOutId, punchOutHash, deviceId, emp.bioId, outTime, vMode, 'OUT');
        } catch (e) {}
      }

      insertAtt.run(
        `att_aug_${emp.id}_${day}`,
        dutyDate,
        emp.id,
        shift.id,
        inTime,
        outTime,
        totalHours,
        lateMins,
        otHours,
        status
      );
    }
  });

  // 7. Seed Today's Live Attendance (2026-09-15)
  console.log("Seeding today's real-time biometric raw scans...");
  const today = '2026-09-15';
  currentStaff.forEach((emp, idx) => {
    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(emp.shift);
    const deviceId = shift.id === 'shift_night' ? 'dev_01' : 'dev_02';

    if (shift.id === 'shift_morning' || shift.id === 'shift_general') {
      const inHour = 8;
      const inMin = 5 + (idx % 25);
      const inIso = `${today}T${String(inHour).padStart(2, '0')}:${String(inMin).padStart(2, '0')}:00Z`;
      
      const punchHash = generatePunchHash(deviceId, emp.bioId, inIso);
      try {
        insertRawPunch.run(`raw_today_${emp.bioId}`, punchHash, deviceId, emp.bioId, inIso, 'FACE', 'IN');
      } catch (e) {}

      insertAtt.run(
        `att_today_${emp.id}`,
        today,
        emp.id,
        shift.id,
        inIso,
        null,
        4.2,
        inMin > 15 ? inMin - 15 : 0,
        0,
        'PRESENT'
      );
    }
  });

  // Specifically seed Sneha Goswami's Night Shift (Cross-Midnight)
  const snehaNightIn = '2026-09-14T19:54:00Z';
  const snehaNightOut = '2026-09-15T08:12:00Z';
  try {
    insertRawPunch.run('raw_sneha_in', generatePunchHash('dev_01', '101', snehaNightIn), 'dev_01', '101', snehaNightIn, 'FACE', 'IN');
    insertRawPunch.run('raw_sneha_out', generatePunchHash('dev_01', '101', snehaNightOut), 'dev_01', '101', snehaNightOut, 'FACE', 'OUT');
  } catch (e) {}

  insertAtt.run(
    `att_today_emp_01`,
    '2026-09-14',
    'emp_01',
    'shift_night',
    snehaNightIn,
    snehaNightOut,
    12.2,
    0,
    0.2,
    'OVERTIME'
  );

  // 8. Run Payroll calculation for August 2026
  console.log('Finalizing August 2026 baseline payroll run with new 7.45h rules...');
  const paySummary = runMonthlyPayroll('2026-08');
  console.log(`August 2026 Payroll Run complete: Gross: ₹${paySummary.totalGross.toLocaleString('en-IN')}, Net: ₹${paySummary.totalNet.toLocaleString('en-IN')}`);

  console.log('Database seeding complete!');
}

if (require.main === module) {
  seedDatabase();
}

module.exports = {
  seedDatabase
};
