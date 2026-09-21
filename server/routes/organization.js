const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const config = require('../config');
const { getSettings, updateSettings, SETTINGS_FIELDS } = require('../services/settingsService');
const { requireAuth } = require('../middleware/authGuard');
const { accessGuard, requirePerm, scopeFilter } = require('../middleware/accessGuard');

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
    return res.json({ success: true, message: 'Company settings updated', settings });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Departments
router.get('/departments', async (req, res) => {
  try {
    const departments = await db.all('SELECT * FROM departments');
    return res.json({ success: true, departments });
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

// 4b. Update Device Model & Settings
router.put('/devices/:id', async (req, res) => {
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
router.get('/employees', requireAuth, accessGuard, requirePerm('EMPLOYEES_VIEW'), async (req, res) => {
  try {
    const { departmentId, search, from, to } = req.query;
    const ctx = req.accessCtx;
    const empScope = scopeFilter(ctx, 'e.id');

    let sql = `
      SELECT e.*, d.name as department_name, s.name as shift_name
      FROM employees e
      JOIN departments d ON e.department_id = d.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE e.status = 'ACTIVE' ${empScope.clause}
    `;
    const params = [...empScope.params];

    if (departmentId) {
      sql += ` AND e.department_id = ?`;
      params.push(departmentId);
    }

    if (search) {
      sql += ` AND (e.full_name LIKE ? OR e.employee_code LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY e.employee_code ASC`;

    const employees = await db.all(sql, ...params);
    return res.json({ success: true, count: employees.length, employees });
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

    return res.json({ success: true, employee, personal, documents, attendance });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 7. Update an employee (role, shift assignment, designation, status) - Admin
router.put('/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.get('SELECT * FROM employees WHERE id = ?', id);
    if (!existing) return res.status(404).json({ error: 'Employee not found' });

    const { role, shift_id, designation, department_id, status } = req.body;
    if (role && !['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'].includes(role)) {
      return res.status(400).json({ error: "role must be SUPER_ADMIN, ADMIN or EMPLOYEE" });
    }
    if (shift_id) {
      const shift = await db.get('SELECT id FROM shifts WHERE id = ?', shift_id);
      if (!shift) return res.status(404).json({ error: 'Shift not found' });
    }
    if (department_id) {
      const dept = await db.get('SELECT id FROM departments WHERE id = ?', department_id);
      if (!dept) return res.status(404).json({ error: 'Department not found' });
    }

    await db.run(`
      UPDATE employees SET
        role = coalesce(?, role),
        shift_id = coalesce(?, shift_id),
        designation = coalesce(?, designation),
        department_id = coalesce(?, department_id),
        status = coalesce(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, role ?? null, shift_id ?? null, designation ?? null, department_id ?? null, status ?? null, id);

    const updated = await db.get(`
      SELECT e.*, d.name as department_name, s.name as shift_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE e.id = ?
    `, id);
    return res.json({ success: true, message: `Employee '${updated.full_name}' updated`, employee: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;