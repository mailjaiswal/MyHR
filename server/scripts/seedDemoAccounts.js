// server/scripts/seedDemoAccounts.js
// Seeds or updates demo accounts (Administrator=ADMIN, Manager=MANAGER,
// Employee=EMPLOYEE, Master Admin=SUPER_ADMIN owner) with Welcome@123.
// Also enforces the one-owner rule: exactly one SUPER_ADMIN (mail.jaiswal@gmail.com).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.pruirlouwmhlpdzuukrk:Swaniki2026@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';

async function seed() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const hash = await bcrypt.hash('Welcome@123', 12);

    const accounts = [
      {
        id: 'emp_admin',
        employee_code: 'EMP-000',
        biometric_user_id: '900',
        first_name: 'HR',
        last_name: 'Administrator',
        full_name: 'HR Administrator',
        email: 'admin@dubeynursinghome.in',
        role: 'ADMIN',
        role_id: 'role_admin',
        designation: 'HR Administrator',
        department_id: 'dept_admin'
      },
      {
        id: 'emp_manager',
        employee_code: 'MGR-001',
        biometric_user_id: '901',
        first_name: 'Operations',
        last_name: 'Manager',
        full_name: 'Operations Manager',
        email: 'manager@dubeynursinghome.in',
        role: 'MANAGER',
        role_id: 'role_manager',
        designation: 'Nursing Supervisor & Ops Manager',
        department_id: 'dept_nursing'
      },
      {
        id: 'emp_staff_demo',
        employee_code: 'EMP-001',
        biometric_user_id: '902',
        first_name: 'Pooja',
        last_name: 'Sharma',
        full_name: 'Pooja Sharma',
        email: 'employee@dubeynursinghome.in',
        role: 'EMPLOYEE',
        role_id: 'role_employee',
        designation: 'Staff Nurse',
        department_id: 'dept_nursing'
      },
      {
        id: 'emp_master_admin',
        employee_code: 'EMP-999',
        biometric_user_id: '999',
        first_name: 'Master',
        last_name: 'Admin',
        full_name: 'Master Admin',
        email: 'mail.jaiswal@gmail.com',
        role: 'SUPER_ADMIN',
        role_id: 'role_super',
        designation: 'System Administrator & Owner',
        department_id: 'dept_admin'
      }
    ];

    for (const acc of accounts) {
      const q = `
        INSERT INTO employees (
          id, employee_code, biometric_user_id, first_name, last_name, full_name,
          email, role, role_id, designation, department_id, password_hash,
          status, must_change_password, failed_attempts, locked_until
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ACTIVE', 0, 0, NULL
        )
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          role = EXCLUDED.role,
          role_id = EXCLUDED.role_id,
          designation = EXCLUDED.designation,
          department_id = EXCLUDED.department_id,
          password_hash = EXCLUDED.password_hash,
          status = 'ACTIVE',
          locked_until = NULL,
          failed_attempts = 0;
      `;
      await pool.query(q, [
        acc.id, acc.employee_code, acc.biometric_user_id, acc.first_name, acc.last_name,
        acc.full_name, acc.email, acc.role, acc.role_id, acc.designation,
        acc.department_id, hash
      ]);
      console.log(`Seeded / updated account: ${acc.email} (${acc.role})`);
    }

    // Ankur Sharma is an ordinary employee (kept login-ready, no admin powers).
    await pool.query(
      `UPDATE employees SET password_hash = $1, status = 'ACTIVE', locked_until = NULL, failed_attempts = 0,
         role = 'EMPLOYEE', role_id = 'role_employee'
       WHERE email = 'AnkurSharma@gmail.com'`,
      [hash]
    );
    console.log('Reset AnkurSharma@gmail.com → ordinary EMPLOYEE');

    // One-owner rule: the Master Admin (mail.jaiswal@gmail.com) is the ONLY Super Admin.
    // Every other lingering SUPER_ADMIN account (e.g. the old Administrator demo, sample
    // "Managing Director" staff) is downgraded to company ADMIN.
    const sweep = await pool.query(
      `UPDATE employees SET role = 'ADMIN', role_id = 'role_admin'
        WHERE role = 'SUPER_ADMIN' AND lower(email) <> 'mail.jaiswal@gmail.com'
        RETURNING full_name, email`
    );
    sweep.rows.forEach(r => console.log(`Downgraded SUPER_ADMIN → ADMIN: ${r.email} (${r.full_name})`));

    // Permission model: Super Admin alone keeps DEMO_LAB (and the Master Admin console);
    // company Admin gains ACCESS_MANAGE (defines Admin/Manager/Employee roles & scopes).
    const ALL_PERMS = [
      'DASHBOARD_VIEW', 'ATTENDANCE_VIEW', 'ATTENDANCE_EDIT', 'REGULARIZATION_APPROVE',
      'PAYROLL_VIEW', 'PAYROLL_MANAGE', 'EMPLOYEES_VIEW', 'EMPLOYEES_EDIT',
      'LEAVES_VIEW', 'LEAVES_REQUEST', 'LEAVES_APPROVE', 'ROSTER_VIEW', 'ROSTER_EDIT',
      'SETTINGS_VIEW', 'SETTINGS_EDIT', 'ACCESS_MANAGE', 'EXPORTS', 'DEMO_LAB', 'AUDIT_VIEW'
    ];
    await pool.query(
      `UPDATE roles SET permissions = $1::jsonb WHERE id = 'role_super'`,
      [JSON.stringify(ALL_PERMS)]
    );
    await pool.query(
      `UPDATE roles SET permissions = $1::jsonb WHERE id = 'role_admin'`,
      [JSON.stringify(ALL_PERMS.filter(p => p !== 'DEMO_LAB'))]
    );
    console.log('Role permissions updated (role_super keeps DEMO_LAB; role_admin gains ACCESS_MANAGE, loses DEMO_LAB).');

    console.log('All demo logins seeded successfully with Welcome@123.');
  } finally {
    await pool.end();
  }
}

seed().catch(err => {
  console.error('Error seeding demo accounts:', err);
  process.exit(1);
});
