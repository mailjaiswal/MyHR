const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const config = require('../config');
const { getSettings, updateSettings, SETTINGS_FIELDS } = require('../services/settingsService');
const { requireAuth } = require('../middleware/authGuard');
const { accessGuard, requirePerm, scopeFilter } = require('../middleware/accessGuard');
const { audit, diffFields } = require('../services/auditService');
const { generateEmployeeCode } = require('../services/employeeCodeService');

const ORG_ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];
const EMPLOYEE_STATUSES = ['ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE'];
// SUPER_ADMIN is intentionally NOT assignable through any company-facing API —
// exactly one platform owner holds it (created via the owner seed / Master Admin console).
const ASSIGNABLE_ROLES = ['ADMIN', 'MANAGER', 'EMPLOYEE'];
const ROLE_ID_BY_KEY = { ADMIN: 'role_admin', MANAGER: 'role_manager', EMPLOYEE: 'role_employee' };

function isOrgAdminReq(req) {
  return ORG_ADMIN_ROLES.includes(req.currentUser?.role);
}

// The platform owner (the single SUPER_ADMIN) is not company staff: it must not
// appear in — or be operable from — any company management screen unless the
// actor is the owner themselves.
const actorIsOwner = (req) => req.currentUser?.role === 'SUPER_ADMIN';

// Friendly duplicate-ID lookup shared by create/edit UI.
async function findIdHolder(field, value, excludeId) {
  const col = field === 'biometric_user_id' ? 'biometric_user_id' : 'employee_code';
  const holder = await db.get(
    `SELECT id, employee_code, full_name FROM employees WHERE ${col} = ? AND id <> ?`,
    value, excludeId || ''
  );
  return holder || null;
}

// 1. Organization & System Meta (public — used for branding/login page)
router.get('/info', async (req, res) => {
  try {
    const settings = await getSettings();
    const hrAdmin = await db.get(`SELECT full_name, designation FROM employees WHERE role = 'ADMIN' LIMIT 1`);
    const superAdmin = await db.get(`SELECT full_name, designation FROM employees WHERE role = 'SUPER_ADMIN' LIMIT 1`);

    return res.json({
      success: true,
      organization: {
        ...config.ORGANIZATION,
        ...settings,
        CONTACT_PERSON: settings.contact_person || (hrAdmin ? `${hrAdmin.full_name} (${hrAdmin.designation})` : 'HR Administrator'),
        DIRECTOR: superAdmin ? `${superAdmin.full_name} (${superAdmin.designation})` : (settings.director_name ? `${settings.director_name} (${settings.director_title})` : 'Management')
      },
      branding: {
        name: settings.name,
        tagline: settings.tagline,
        industryLabel: settings.industry_label,
        directorTitle: settings.director_title
      },
      rules: {
        attendance: config.ATTENDANCE_RULES,
        statutory: config.STATUTORY_RULES
      },
      partner: {
        name: 'Anubhav Infotech',
        role: 'Biometric Hardware Installation & Support Partner',
        location: 'Bhopal / Chhindwara, MP',
        apiKey: config.ANUBHAV_PARTNER_API_KEY
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 1b. Read current company settings (all roles can view)
router.get('/settings', async (req, res) => {
  try {
    return res.json({ success: true, settings: await getSettings() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 1c. Update company settings (requires SETTINGS_EDIT)
router.put('/settings', requireAuth, accessGuard, requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const picked = {};
    for (const f of SETTINGS_FIELDS) {
      if (req.body && req.body[f] !== undefined) picked[f] = req.body[f];
    }
    if (Object.keys(picked).length === 0) {
      return res.status(400).json({ error: 'No valid settings fields provided' });
    }
    const settings = await updateSettings(picked);
    await audit(req, 'settings.company_update', {
      entityType: 'settings', entityId: 'org_main',
      summary: `Company settings updated (${Object.keys(picked).join(', ')})`,
      details: { changed: picked }
    });
    return res.json({ success: true, message: 'Company settings updated', settings });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Departments
router.get('/departments', async (req, res) => {
  try {
    const departments = await db.all(`
      SELECT d.*, COALESCE(COUNT(e.id), 0)::int as employee_count
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id
      GROUP BY d.id
      ORDER BY d.name ASC
    `);
    return res.json({ success: true, departments });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 2b. Create Department (requires SETTINGS_EDIT)
router.post('/departments', requireAuth, accessGuard, requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const { name, code, head_of_department } = req.body || {};
    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      return res.status(400).json({ error: 'Department name is required' });
    }

    const genCode = String(code || trimmedName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)).toUpperCase();
    const existing = await db.get('SELECT id FROM departments WHERE LOWER(name) = LOWER(?) OR (code IS NOT NULL AND LOWER(code) = LOWER(?))', trimmedName, genCode);
    if (existing) {
      return res.status(409).json({ error: 'A department with this name or code already exists' });
    }

    const id = `dept_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await db.run(
      'INSERT INTO departments (id, code, name, head_of_department) VALUES (?, ?, ?, ?)',
      id, genCode, trimmedName, head_of_department ? String(head_of_department).trim() : null
    );

    const created = await db.get('SELECT d.*, 0 as employee_count FROM departments d WHERE d.id = ?', id);
    await audit(req, 'department.create', {
      entityType: 'department', entityId: id,
      summary: `Department '${trimmedName}' (${genCode}) created`,
      details: { name: trimmedName, code: genCode, head_of_department }
    });
    return res.status(201).json({ success: true, message: `Department '${trimmedName}' created`, department: created });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 2c. Update Department (requires SETTINGS_EDIT)
router.put('/departments/:id', requireAuth, accessGuard, requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, head_of_department } = req.body || {};

    const existing = await db.get('SELECT * FROM departments WHERE id = ?', id);
    if (!existing) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const updatedName = name !== undefined ? String(name).trim() : existing.name;
    const updatedCode = code !== undefined ? String(code).trim().toUpperCase() : existing.code;
    const updatedHod = head_of_department !== undefined ? (head_of_department ? String(head_of_department).trim() : null) : existing.head_of_department;

    if (!updatedName) {
      return res.status(400).json({ error: 'Department name cannot be empty' });
    }

    // Check duplicate name or code for other departments
    const dup = await db.get(
      'SELECT id FROM departments WHERE id <> ? AND (LOWER(name) = LOWER(?) OR (code IS NOT NULL AND LOWER(code) = LOWER(?)))',
      id, updatedName, updatedCode
    );
    if (dup) {
      return res.status(409).json({ error: 'Another department already uses this name or code' });
    }

    await db.run(
      'UPDATE departments SET name = ?, code = ?, head_of_department = ? WHERE id = ?',
      updatedName, updatedCode, updatedHod, id
    );

    const updated = await db.get(`
      SELECT d.*, COALESCE(COUNT(e.id), 0)::int as employee_count
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id
      WHERE d.id = ?
      GROUP BY d.id
    `, id);

    await audit(req, 'department.update', {
      entityType: 'department', entityId: id,
      summary: `Department '${updated.name}' updated`,
      details: { changes: diffFields(existing, updated) }
    });

    return res.json({ success: true, message: `Department '${updated.name}' updated`, department: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 2d. Delete Department (requires SETTINGS_EDIT, protected if employees assigned)
router.delete('/departments/:id', requireAuth, accessGuard, requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.get('SELECT * FROM departments WHERE id = ?', id);
    if (!existing) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const empCount = await db.get('SELECT count(*)::int as c FROM employees WHERE department_id = ?', id);
    if (empCount && empCount.c > 0) {
      return res.status(400).json({
        error: 'CANNOT_DELETE_ACTIVE_DEPARTMENT',
        message: `Cannot delete department '${existing.name}': ${empCount.c} employee(s) are currently assigned to it. Please reassign them first.`
      });
    }

    await db.run('DELETE FROM departments WHERE id = ?', id);
    await audit(req, 'department.delete', {
      entityType: 'department', entityId: id,
      summary: `Department '${existing.name}' deleted`,
      details: { deleted: existing }
    });

    return res.json({ success: true, message: `Department '${existing.name}' deleted successfully` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. Shifts (Configurable by Super Admin)
router.get('/shifts', async (req, res) => {
  try {
    const shifts = await db.all('SELECT * FROM shifts');
    return res.json({ success: true, shifts });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 3b. Update Shift Timings (requires ROSTER_EDIT)
router.put('/shifts/:id', requireAuth, accessGuard, requirePerm('ROSTER_EDIT'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, start_time, end_time, duration_hours, is_cross_midnight, grace_minutes, break_duration_minutes, color_code } = req.body;

    const existing = await db.get('SELECT * FROM shifts WHERE id = ?', id);
    if (!existing) {
      return res.status(404).json({ error: 'Shift not found' });
    }

    await db.run(`
      UPDATE shifts
      SET name = coalesce(?, name),
          start_time = coalesce(?, start_time),
          end_time = coalesce(?, end_time),
          duration_hours = coalesce(?, duration_hours),
          is_cross_midnight = coalesce(?, is_cross_midnight),
          grace_minutes = coalesce(?, grace_minutes),
          break_duration_minutes = coalesce(?, break_duration_minutes),
          color_code = coalesce(?, color_code)
      WHERE id = ?
    `,
      name ?? null,
      start_time ?? null,
      end_time ?? null,
      duration_hours ?? null,
      is_cross_midnight ?? null,
      grace_minutes ?? null,
      break_duration_minutes ?? null,
      color_code ?? null,
      id
    );

    const updated = await db.get('SELECT * FROM shifts WHERE id = ?', id);
    await audit(req, 'shift.update', {
      entityType: 'shift', entityId: id,
      summary: `Shift '${updated.name}' updated`,
      details: { changes: diffFields(existing, updated) }
    });
    return res.json({
      success: true,
      message: `Shift '${updated.name}' timings updated successfully`,
      shift: updated
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 3c. Create a new shift (requires ROSTER_EDIT)
router.post('/shifts', requireAuth, accessGuard, requirePerm('ROSTER_EDIT'), async (req, res) => {
  try {
    const { name, start_time, end_time, duration_hours, is_cross_midnight = 0, grace_minutes = 15, break_duration_minutes = 30, color_code = '#6366f1' } = req.body;
    if (!name || !start_time || !end_time) {
      return res.status(400).json({ error: 'name, start_time and end_time are required' });
    }
    const id = `shift_${Date.now()}`;
    await db.run(`
      INSERT INTO shifts (id, name, start_time, end_time, duration_hours, is_cross_midnight, grace_minutes, break_duration_minutes, color_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, name, start_time, end_time, duration_hours || 8, is_cross_midnight, grace_minutes, break_duration_minutes, color_code);
    const created = await db.get('SELECT * FROM shifts WHERE id = ?', id);
    await audit(req, 'shift.create', { entityType: 'shift', entityId: id, summary: `Shift '${name}' created (${start_time}-${end_time})`, details: { name, start_time, end_time, duration_hours: created.duration_hours, is_cross_midnight } });
    return res.status(201).json({ success: true, shift: created });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. Choosable Biometric Hardware Device Models
router.get('/devices/models', (req, res) => {
  return res.json({
    success: true,
    models: config.SUPPORTED_DEVICE_MODELS
  });
});

// 4b. Update Device Model & Settings (authenticated admin/partner action)
router.put('/devices/:id', requireAuth, accessGuard, requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const { id } = req.params;
    const { model, device_name, location, ip_address, protocol } = req.body;

    const dev = await db.get('SELECT * FROM devices WHERE id = ?', id);
    if (!dev) {
      return res.status(404).json({ error: 'Device not found' });
    }

    await db.run(`
      UPDATE devices
      SET model = coalesce(?, model),
          device_name = coalesce(?, device_name),
          location = coalesce(?, location),
          ip_address = coalesce(?, ip_address),
          protocol = coalesce(?, protocol)
      WHERE id = ?
    `,
      model ?? null,
      device_name ?? null,
      location ?? null,
      ip_address ?? null,
      protocol ?? null,
      id
    );

    const updated = await db.get('SELECT * FROM devices WHERE id = ?', id);
    await audit(req, 'device.update', {
      entityType: 'device', entityId: id,
      summary: `Device '${updated.device_name}' updated`,
      details: { changes: diffFields(dev, updated) }
    });
    return res.json({
      success: true,
      message: `Device '${updated.device_name}' updated successfully to model ${updated.model}`,
      device: updated
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. Employee Directory (requires auth + EMPLOYEES_VIEW, scope-aware)
//    ?status= ACTIVE (default) | INACTIVE | ALL — the latter two are org-admin only.
router.get('/employees', requireAuth, accessGuard, requirePerm('EMPLOYEES_VIEW'), async (req, res) => {
  try {
    const { departmentId, search, from, to, status } = req.query;
    const ctx = req.accessCtx;
    const empScope = scopeFilter(ctx, 'e.id');

    let sql = `
      SELECT e.*, d.name as department_name, s.name as shift_name
      FROM employees e
      JOIN departments d ON e.department_id = d.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE 1=1 ${empScope.clause}
    `;
    const params = [...empScope.params];

    if (!actorIsOwner(req)) sql += ` AND e.role <> 'SUPER_ADMIN'`;

    const statusSel = String(status || 'ACTIVE').toUpperCase();
    if (statusSel === 'ALL' && isOrgAdminReq(req)) {
      // everything visible to this scope
    } else if (statusSel === 'INACTIVE' && isOrgAdminReq(req)) {
      sql += ` AND e.status <> 'ACTIVE'`;
    } else {
      sql += ` AND e.status = 'ACTIVE'`;
    }

    if (departmentId) {
      sql += ` AND e.department_id = ?`;
      params.push(departmentId);
    }

    if (search) {
      sql += ` AND (e.full_name LIKE ? OR e.employee_code LIKE ? OR e.biometric_user_id LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY e.employee_code ASC`;

    const employees = await db.all(sql, ...params);
    return res.json({ success: true, count: employees.length, employees });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 5b. Unique-ID availability probe (Employee code / Biometric ID). Must stay
//     registered before '/employees/:id' so the literal path isn't captured.
router.get('/employees/check-id', requireAuth, accessGuard, requirePerm('EMPLOYEES_VIEW'), async (req, res) => {
  try {
    const { field, value, excludeId } = req.query;
    if (!['employee_code', 'biometric_user_id'].includes(field)) {
      return res.status(400).json({ error: "field must be employee_code or biometric_user_id" });
    }
    if (!value) return res.status(400).json({ error: 'value is required' });
    const holder = await findIdHolder(field, value, excludeId);
    return res.json({ success: true, available: !holder, holder });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 5c. Create employee — code is ALWAYS system-generated (admin picks nothing).
router.post('/employees', requireAuth, accessGuard, requirePerm('EMPLOYEES_EDIT'), async (req, res) => {
  try {
    const b = req.body || {};
    const firstName = String(b.first_name || '').trim();
    if (!firstName) return res.status(400).json({ error: 'first_name is required' });
    if (!b.department_id) return res.status(400).json({ error: 'department_id is required' });

    const dept = await db.get('SELECT id FROM departments WHERE id = ?', b.department_id);
    if (!dept) return res.status(404).json({ error: 'Department not found' });
    if (b.shift_id) {
      const shift = await db.get('SELECT id FROM shifts WHERE id = ?', b.shift_id);
      if (!shift) return res.status(404).json({ error: 'Shift not found' });
    }
    const role = ASSIGNABLE_ROLES.includes(b.role) ? b.role : 'EMPLOYEE';

    const bioId = b.biometric_user_id != null ? String(b.biometric_user_id).trim() : '';
    if (bioId) {
      const holder = await findIdHolder('biometric_user_id', bioId);
      if (holder) return res.status(409).json({ error: `Biometric ID ${bioId} is already assigned to ${holder.full_name} (${holder.employee_code})` });
    }

    let code = await generateEmployeeCode();
    if (!code) {
      // No prefix configured — keep a readable E0001-style ramp as fallback.
      const cnt = await db.get('SELECT count(*)::int AS c FROM employees');
      code = `E${String(cnt.c + 1).padStart(4, '0')}`;
      for (let guard = 0; guard < 500 && await findIdHolder('employee_code', code); guard++) {
        code = `E${String(parseInt(code.slice(1), 10) + 1).padStart(4, '0')}`;
      }
    }

    const fullName = [firstName, b.last_name].filter(Boolean).join(' ').trim();
    const id = `emp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    // Every FIELD_SPEC enrichment column is accepted here too, so the manual add form has
    // parity with the fields the roster importer and prefilled template track (blank -> NULL).
    await db.run(`
      INSERT INTO employees (id, employee_code, biometric_user_id, first_name, last_name, full_name,
        gender, designation, department_id, shift_id, date_of_joining, mobile, email,
        employment_type, base_ctc, role, role_id, status,
        card_no, date_of_birth, nationality, city, contact_tel, office_tel, verify_mode, esi_ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE',
        ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, code, bioId || null, firstName, b.last_name || null, fullName,
      b.gender || null, b.designation || null, b.department_id, b.shift_id || null,
      b.date_of_joining || new Date().toISOString().slice(0, 10), b.mobile || null, b.email || null,
      b.employment_type || 'REGULAR', Number(b.base_ctc) || 0, role, ROLE_ID_BY_KEY[role] || 'role_employee',
      b.card_no || null, b.date_of_birth || null, b.nationality || null, b.city || null,
      b.contact_tel || null, b.office_tel || null, b.verify_mode || 'FINGERPRINT', b.esi_ip || null);

    const created = await db.get(`
      SELECT e.*, d.name as department_name, s.name as shift_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE e.id = ?
    `, id);

    // Auto-dispatch Onboarding & Offer Letter email if requested & recipient email exists
    let emailQueued = false;
    if (b.send_welcome_email !== false && b.email && String(b.email).includes('@')) {
      try {
        const { notify } = require('../services/notificationService');
        await notify('employee.onboarding_welcome', { employeeId: id, force: true });
        emailQueued = true;
      } catch (err) {
        console.error('Failed to queue onboarding welcome email:', err.message);
      }
    }

    await audit(req, 'employee.create', {
      entityType: 'employee', entityId: id,
      summary: `Employee '${fullName}' (${code}) added${emailQueued ? ' and onboarding offer letter emailed' : ''}`,
      details: { employee_code: code, biometric_user_id: bioId || null, department_id: b.department_id, role, emailQueued }
    });
    return res.status(201).json({
      success: true,
      message: `Employee '${fullName}' added as ${code}${emailQueued ? ' (Offer letter sent)' : ''}`,
      employee: created,
      emailQueued
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 5b. Resend / Send Onboarding Offer Letter & Checklist Pack (requires EMPLOYEES_EDIT)
router.post('/employees/:id/send-onboarding', requireAuth, accessGuard, requirePerm('EMPLOYEES_EDIT'), async (req, res) => {
  try {
    const emp = await db.get('SELECT id, full_name, email FROM employees WHERE id = ?', req.params.id);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    if (!emp.email || !String(emp.email).includes('@')) {
      return res.status(400).json({ error: `Cannot send onboarding pack: No valid email address configured for ${emp.full_name}.` });
    }

    const { notify } = require('../services/notificationService');
    const result = await notify('employee.onboarding_welcome', { employeeId: emp.id, force: true });

    await audit(req, 'employee.onboarding_email', {
      entityType: 'employee', entityId: emp.id,
      summary: `Onboarding offer letter and checklist emailed to ${emp.full_name} (${emp.email})`,
      details: { email: emp.email, result }
    });

    return res.json({
      success: true,
      message: `Onboarding offer letter & document checklist sent to ${emp.email}`
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 6. Single Employee Directory Entry (requires auth, scope-checked)
router.get('/employees/:id', requireAuth, accessGuard, requirePerm('EMPLOYEES_VIEW'), async (req, res) => {
  try {
    // Scope check
    if (req.accessCtx.visibleEmployeeIds && !req.accessCtx.visibleEmployeeIds.includes(req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const employee = await db.get(`
      SELECT e.*, d.name as department_name, s.name as shift_name,
             s.start_time as shift_start, s.end_time as shift_end
      FROM employees e
      JOIN departments d ON e.department_id = d.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE e.id = ?
    `, req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    // The platform owner is invisible to company management screens.
    if (employee.role === 'SUPER_ADMIN' && !actorIsOwner(req)) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    // Archived staff dossiers are org-admin only (5c/5d decision).
    if (employee.status !== 'ACTIVE' && !isOrgAdminReq(req)) {
      return res.status(403).json({ error: 'Only admins can view archived employee records' });
    }

    const personal = await db.get('SELECT * FROM employee_personal_details WHERE employee_id = ?', employee.id);
    const documents = await db.all('SELECT * FROM employee_documents WHERE employee_id = ?', employee.id);
    const { from, to } = req.query;
    let attSql = `
      SELECT
        count(*) FILTER (WHERE status IN ('PRESENT','OVERTIME','REGULARIZED')) as present_days,
        count(*) FILTER (WHERE status = 'HALF_DAY') as half_days,
        count(*) FILTER (WHERE status = 'ABSENT') as absent_days,
        round(sum(coalesce(total_hours, 0))::numeric, 1) as total_hours,
        round(sum(coalesce(overtime_hours, 0))::numeric, 1) as overtime_hours
      FROM attendance_records WHERE employee_id = ?
    `;
    const attParams = [employee.id];
    if (from && to) { attSql += ` AND duty_date BETWEEN ? AND ?`; attParams.push(from, to); }
    const attendance = await db.get(attSql, ...attParams);

    // Dossier extras: tenure + payroll + leave history (works for archived too).
    const [lastActivity, payrollHistory, leaveHistory, leavesSummary] = await Promise.all([
      db.get(`SELECT max(duty_date) AS last_day FROM attendance_records WHERE employee_id = ?`, employee.id),
      db.all(`
        SELECT month_year, gross_earnings, total_deductions, net_salary
        FROM payslips WHERE employee_id = ? ORDER BY month_year DESC LIMIT 36
      `, employee.id),
      db.all(`
        SELECT lr.id, lr.from_date, lr.to_date, lr.days, lr.status, lt.name as leave_type
        FROM leave_requests lr LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
        WHERE lr.employee_id = ? ORDER BY lr.from_date DESC LIMIT 36
      `, employee.id),
      db.all(`
        SELECT lb.leave_type_id, lt.name as leave_type, lb.year, lb.accumulated, lb.used, lb.pending
        FROM leave_balances lb LEFT JOIN leave_types lt ON lb.leave_type_id = lt.id
        WHERE lb.employee_id = ? ORDER BY lb.year DESC, lt.name ASC
      `, employee.id)
    ]);

    return res.json({
      success: true, employee, personal, documents, attendance,
      archived: employee.status !== 'ACTIVE',
      tenure: {
        from: employee.date_of_joining || null,
        to: employee.status !== 'ACTIVE' ? (lastActivity && lastActivity.last_day) || null : null,
        lastActivityDay: (lastActivity && lastActivity.last_day) || null
      },
      payrollHistory: payrollHistory || [],
      leaveHistory: leaveHistory || [],
      leavesSummary: leavesSummary || []
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 7. Update an employee (profile fields, role, shift, status/archive) - Admin
router.put('/employees/:id', requireAuth, accessGuard, requirePerm('EMPLOYEES_EDIT'), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.get('SELECT * FROM employees WHERE id = ?', id);
    if (!existing) return res.status(404).json({ error: 'Employee not found' });
    // Company screens cannot edit the platform owner's record.
    if (existing.role === 'SUPER_ADMIN' && !actorIsOwner(req)) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const {
      role, shift_id, designation, department_id, status,
      first_name, last_name, gender, date_of_joining, mobile, email,
      employment_type, base_ctc, bank_name, bank_account, bank_ifsc, pan, uan, biometric_user_id,
      card_no, date_of_birth, nationality, city, contact_tel, office_tel, verify_mode, esi_ip
    } = req.body;
    if (role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'SUPER_ADMIN cannot be assigned or changed here — it is held exclusively by the platform owner.' });
    }
    if (role && !ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of ${ASSIGNABLE_ROLES.join(', ')}` });
    }
    if (status && !EMPLOYEE_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${EMPLOYEE_STATUSES.join(', ')}` });
    }
    if (shift_id) {
      const shift = await db.get('SELECT id FROM shifts WHERE id = ?', shift_id);
      if (!shift) return res.status(404).json({ error: 'Shift not found' });
    }
    if (department_id) {
      const dept = await db.get('SELECT id FROM departments WHERE id = ?', department_id);
      if (!dept) return res.status(404).json({ error: 'Department not found' });
    }
    // Biometric ID reassignment gets the same friendly conflict check as create.
    if (biometric_user_id != null && String(biometric_user_id).trim() !== existing.biometric_user_id) {
      const bio = String(biometric_user_id).trim();
      if (bio) {
        const holder = await findIdHolder('biometric_user_id', bio, id);
        if (holder) return res.status(409).json({ error: `Biometric ID ${bio} is already assigned to ${holder.full_name} (${holder.employee_code})` });
      }
    }
    const nextFirst = first_name !== undefined ? String(first_name).trim() : existing.first_name;
    if (!nextFirst) return res.status(400).json({ error: 'first_name cannot be empty' });
    const nextLast = last_name !== undefined ? last_name : existing.last_name;
    const nextFullName = [nextFirst, nextLast].filter(Boolean).join(' ').trim();

    await db.run(`
      UPDATE employees SET
        role = coalesce(?, role),
        role_id = coalesce(?, role_id),
        shift_id = coalesce(?, shift_id),
        designation = coalesce(?, designation),
        department_id = coalesce(?, department_id),
        status = coalesce(?, status),
        first_name = ?,
        last_name = coalesce(?, last_name),
        full_name = ?,
        gender = coalesce(?, gender),
        date_of_joining = coalesce(?, date_of_joining),
        mobile = coalesce(?, mobile),
        email = coalesce(?, email),
        employment_type = coalesce(?, employment_type),
        base_ctc = coalesce(?, base_ctc),
        bank_name = coalesce(?, bank_name),
        bank_account = coalesce(?, bank_account),
        bank_ifsc = coalesce(?, bank_ifsc),
        pan = coalesce(?, pan),
        uan = coalesce(?, uan),
        card_no = coalesce(?, card_no),
        date_of_birth = coalesce(?, date_of_birth),
        nationality = coalesce(?, nationality),
        city = coalesce(?, city),
        contact_tel = coalesce(?, contact_tel),
        office_tel = coalesce(?, office_tel),
        verify_mode = coalesce(?, verify_mode),
        esi_ip = coalesce(?, esi_ip),
        biometric_user_id = coalesce(?, biometric_user_id),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, role ?? null, role ? (ROLE_ID_BY_KEY[role] || null) : null, shift_id ?? null, designation ?? null, department_id ?? null, status ?? null,
      nextFirst, nextLast ?? null, nextFullName, gender ?? null, date_of_joining ?? null,
      mobile ?? null, email ?? null, employment_type ?? null, base_ctc != null ? Number(base_ctc) : null,
      bank_name ?? null, bank_account ?? null, bank_ifsc ?? null, pan ?? null, uan ?? null,
      card_no ?? null, date_of_birth ?? null, nationality ?? null, city ?? null,
      contact_tel ?? null, office_tel ?? null, verify_mode ?? null, esi_ip ?? null,
      biometric_user_id != null ? String(biometric_user_id).trim() || null : null, id);
    const changed = diffFields(
      { role: existing.role, shift_id: existing.shift_id, designation: existing.designation, department_id: existing.department_id, status: existing.status, mobile: existing.mobile, email: existing.email },
      {
        role: role ?? existing.role, shift_id: shift_id ?? existing.shift_id, designation: designation ?? existing.designation,
        department_id: department_id ?? existing.department_id, status: status ?? existing.status,
        mobile: mobile ?? existing.mobile, email: email ?? existing.email
      }
    );

    const updated = await db.get(`
      SELECT e.*, d.name as department_name, s.name as shift_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE e.id = ?
    `, id);
    await audit(req, 'employee.update', {
      entityType: 'employee', entityId: id,
      summary: `Employee '${updated.full_name}' (${updated.employee_code}) updated`,
      details: { changes: changed }
    });
    return res.json({ success: true, message: `Employee '${updated.full_name}' updated`, employee: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 6. Mandatory Onboarding Terms & Self-Serve Calculation Disclaimer Acceptance
router.post('/accept-terms', requireAuth, accessGuard, requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const { terms_version, headcount_band, pf_enabled, esi_enabled, pt_enabled, pt_state } = req.body || {};
    const fwd = req.headers['x-forwarded-for'];
    const ip = (fwd ? String(fwd).split(',')[0].trim() : req.socket?.remoteAddress) || '127.0.0.1';
    const email = req.currentUser?.email || req.currentUser?.full_name || 'admin';
    const version = terms_version || '2026.1-CALC-UTILITY';
    const band = headcount_band || '20_PLUS';

    await db.run(`
      UPDATE organizations SET
        terms_accepted_at = CURRENT_TIMESTAMP,
        terms_accepted_by = ?,
        terms_accepted_ip = ?,
        terms_version = ?,
        headcount_band = ?,
        pf_enabled = COALESCE(?, pf_enabled),
        esi_enabled = COALESCE(?, esi_enabled),
        pt_enabled = COALESCE(?, pt_enabled),
        pt_state = COALESCE(?, pt_state)
      WHERE id = 'org_main'
    `, email, ip, version, band, pf_enabled, esi_enabled, pt_enabled, pt_state);

    await audit(req, 'compliance.terms_accepted', {
      entityType: 'organization', entityId: 'org_main',
      summary: `Self-serve calculation terms & legal disclaimer accepted by ${email}`,
      details: { email, ip, version, headcount_band: band, pf_enabled, esi_enabled, pt_enabled }
    });

    const settings = await getSettings();
    return res.json({
      success: true,
      message: 'Self-serve calculation agreement and legal disclaimers signed successfully',
      settings
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 7. Update Statutory Compliance Settings
router.post('/compliance', requireAuth, accessGuard, requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const { headcount_band, pf_enabled, esi_enabled, pt_enabled, pt_state, lwf_enabled } = req.body || {};
    await db.run(`
      UPDATE organizations SET
        headcount_band = COALESCE(?, headcount_band),
        pf_enabled = COALESCE(?, pf_enabled),
        esi_enabled = COALESCE(?, esi_enabled),
        pt_enabled = COALESCE(?, pt_enabled),
        pt_state = COALESCE(?, pt_state),
        lwf_enabled = COALESCE(?, lwf_enabled)
      WHERE id = 'org_main'
    `, headcount_band, pf_enabled, esi_enabled, pt_enabled, pt_state, lwf_enabled);

    await audit(req, 'compliance.settings_update', {
      entityType: 'organization', entityId: 'org_main',
      summary: `Statutory compliance rules updated`,
      details: { headcount_band, pf_enabled, esi_enabled, pt_enabled, pt_state, lwf_enabled }
    });

    const settings = await getSettings();
    return res.json({ success: true, message: 'Compliance settings updated', settings });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 8. Employee Salary Structure — Read & Update
router.get('/salary-structure/:employeeId', requireAuth, accessGuard, requirePerm('PAYROLL_VIEW'), async (req, res) => {
  try {
    const { employeeId } = req.params;
    const emp = await db.get('SELECT id, full_name, employee_code, base_ctc, uan, esi_ip FROM employees WHERE id = ?', employeeId);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    let struct = await db.get(`
      SELECT * FROM employee_salary_structures
      WHERE employee_id = ?
      ORDER BY effective_from DESC, updated_at DESC
      LIMIT 1
    `, employeeId);

    // If no custom structure yet, synthesize from employee base_ctc
    if (!struct) {
      const ctc = Number(emp.base_ctc || 0);
      const basic = Math.round(ctc * 0.50);
      const hra = Math.round(ctc * 0.20);
      const medical = Math.round(ctc * 0.10);
      const special = Math.max(0, ctc - (basic + hra + medical));
      struct = {
        employee_id: employeeId,
        effective_from: new Date().toISOString().slice(0, 10),
        base_ctc: ctc,
        monthly_gross: ctc,
        basic_pct: 50.0,
        basic_amount: basic,
        hra_pct: 20.0,
        hra_amount: hra,
        conveyance_amount: 0,
        medical_amount: medical,
        special_allowance: special,
        pf_opt_in: emp.uan ? 1 : 1,
        pf_custom_rate: 12.0,
        pf_cap_ceiling: 1,
        esi_opt_in: ctc <= 21000 ? 1 : 0,
        pt_opt_in: 1,
        tds_mode: 'NEW_REGIME',
        tds_fixed_monthly: 0,
        employer_pf_in_ctc: 1,
        employer_esi_in_ctc: 1,
        gratuity_in_ctc: 1,
        is_default: true
      };
    }

    const normalized = struct ? {
      ...struct,
      monthly_ctc: struct.base_ctc,
      basic_salary: struct.basic_amount,
      hra: struct.hra_amount,
      conveyance: struct.conveyance_amount,
      medical_allowance: struct.medical_amount,
      pf_rate_employee: struct.pf_custom_rate,
      pf_capped_at_15k: struct.pf_cap_ceiling,
      esi_enabled: struct.esi_opt_in,
      pt_enabled: struct.pt_opt_in
    } : null;

    return res.json({ success: true, employee: emp, structure: normalized });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/salary-structure/:employeeId', requireAuth, accessGuard, requirePerm('PAYROLL_MANAGE'), async (req, res) => {
  try {
    const { employeeId } = req.params;
    const emp = await db.get('SELECT id, full_name, employee_code FROM employees WHERE id = ?', employeeId);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const b = req.body || {};
    const base_ctc = Number(b.base_ctc ?? b.monthly_ctc ?? 0);
    const basic_amount = Number(b.basic_amount ?? b.basic_salary ?? Math.round(base_ctc * 0.5));
    const hra_amount = Number(b.hra_amount ?? b.hra ?? 0);
    const conveyance_amount = Number(b.conveyance_amount ?? b.conveyance ?? 0);
    const medical_amount = Number(b.medical_amount ?? b.medical_allowance ?? 0);
    const special_allowance = Number(b.special_allowance ?? 0);
    const pf_opt_in = (b.pf_opt_in ?? b.pf_enabled ?? 1) !== 0 ? 1 : 0;
    const pf_custom_rate = Number(b.pf_custom_rate ?? b.pf_rate_employee ?? 12.0);
    const pf_cap_ceiling = (b.pf_cap_ceiling ?? b.pf_capped_at_15k ?? 1) !== 0 ? 1 : 0;
    const esi_opt_in = (b.esi_opt_in ?? b.esi_enabled ?? 1) !== 0 ? 1 : 0;
    const pt_opt_in = (b.pt_opt_in ?? b.pt_enabled ?? 1) !== 0 ? 1 : 0;
    const monthly_gross = basic_amount + hra_amount + conveyance_amount + medical_amount + special_allowance;
    const effective_from = b.effective_from || new Date().toISOString().slice(0, 10);
    const structId = `sal_${employeeId}_${Date.now()}`;

    // Insert or update salary structure
    await db.run(`
      INSERT INTO employee_salary_structures (
        id, employee_id, effective_from, base_ctc, monthly_gross,
        basic_pct, basic_amount, hra_pct, hra_amount,
        conveyance_amount, medical_amount, special_allowance,
        pf_opt_in, pf_custom_rate, pf_cap_ceiling, esi_opt_in, pt_opt_in,
        tds_mode, tds_fixed_monthly, employer_pf_in_ctc, employer_esi_in_ctc,
        gratuity_in_ctc, updated_at, created_by
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, CURRENT_TIMESTAMP, ?
      )
      ON CONFLICT (employee_id, effective_from) DO UPDATE SET
        base_ctc = EXCLUDED.base_ctc,
        monthly_gross = EXCLUDED.monthly_gross,
        basic_pct = EXCLUDED.basic_pct,
        basic_amount = EXCLUDED.basic_amount,
        hra_pct = EXCLUDED.hra_pct,
        hra_amount = EXCLUDED.hra_amount,
        conveyance_amount = EXCLUDED.conveyance_amount,
        medical_amount = EXCLUDED.medical_amount,
        special_allowance = EXCLUDED.special_allowance,
        pf_opt_in = EXCLUDED.pf_opt_in,
        pf_custom_rate = EXCLUDED.pf_custom_rate,
        pf_cap_ceiling = EXCLUDED.pf_cap_ceiling,
        esi_opt_in = EXCLUDED.esi_opt_in,
        pt_opt_in = EXCLUDED.pt_opt_in,
        tds_mode = EXCLUDED.tds_mode,
        tds_fixed_monthly = EXCLUDED.tds_fixed_monthly,
        employer_pf_in_ctc = EXCLUDED.employer_pf_in_ctc,
        employer_esi_in_ctc = EXCLUDED.employer_esi_in_ctc,
        gratuity_in_ctc = EXCLUDED.gratuity_in_ctc,
        updated_at = CURRENT_TIMESTAMP
    `,
      structId, employeeId, effective_from, base_ctc, monthly_gross,
      b.basic_pct || 50.0, basic_amount, b.hra_pct || 20.0, hra_amount,
      conveyance_amount, medical_amount, special_allowance,
      b.pf_opt_in !== 0 ? 1 : 0, Number(b.pf_custom_rate || 12.0), b.pf_cap_ceiling !== 0 ? 1 : 0,
      b.esi_opt_in !== 0 ? 1 : 0, b.pt_opt_in !== 0 ? 1 : 0,
      b.tds_mode || 'NEW_REGIME', Number(b.tds_fixed_monthly || 0),
      b.employer_pf_in_ctc !== 0 ? 1 : 0, b.employer_esi_in_ctc !== 0 ? 1 : 0,
      b.gratuity_in_ctc !== 0 ? 1 : 0, req.currentUser?.email || 'admin'
    );

    // Keep employees.base_ctc in sync
    await db.run('UPDATE employees SET base_ctc = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', base_ctc, employeeId);

    await audit(req, 'employee.salary_structure_update', {
      entityType: 'employee_salary_structure', entityId: employeeId,
      summary: `Salary structure configured for ${emp.full_name}: ₹${base_ctc.toLocaleString('en-IN')} CTC`,
      details: { base_ctc, monthly_gross, basic_amount, hra_amount, pf_rate: b.pf_custom_rate }
    });

    return res.json({ success: true, message: `Salary structure updated for ${emp.full_name}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;