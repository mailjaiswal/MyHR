const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/authGuard');
const { accessGuard, requirePerm, scopeFilter, assertScope } = require('../middleware/accessGuard');
const { audit } = require('../services/auditService');
const { notify } = require('../services/notificationService');
const { computeEarlyMinutes } = require('../services/attendanceEngine');

// All attendance endpoints require authentication + access scope
router.use(requireAuth, accessGuard);

// 1. Today Overview (scope-aware, accepts ?date= or defaults to today)
router.get('/today', async (req, res) => {
  try {
    const today = req.query.date || new Date().toISOString().slice(0, 10);
    const ctx = req.accessCtx;
    const empScope = scopeFilter(ctx, 'e.id');

    const totalStaff = await db.get(`SELECT count(*) as count FROM employees e WHERE e.status = 'ACTIVE' ${empScope.clause}`, ...empScope.params);
    const recordsToday = await db.all(`
      SELECT a.*, e.full_name, e.employee_code, e.designation, d.name as department_name, s.name as shift_name
      FROM attendance_records a
      JOIN employees e ON a.employee_id = e.id
      JOIN departments d ON e.department_id = d.id
      JOIN shifts s ON a.shift_id = s.id
      WHERE a.duty_date = ? ${empScope.clause}
      ORDER BY a.first_in_time DESC
    `, today, ...empScope.params);

    const presentCount = recordsToday.filter(r => r.status === 'PRESENT' || r.status === 'OVERTIME').length;
    const lateCount = recordsToday.filter(r => r.late_minutes > 0).length;
    const overtimeCount = recordsToday.filter(r => r.overtime_hours > 0).length;
    const currentlyActive = recordsToday.filter(r => r.first_in_time && !r.last_out_time).length;

    const deptStats = await db.all(`
      SELECT d.id, d.name, count(a.id) as present_count
      FROM departments d
      LEFT JOIN employees e ON e.department_id = d.id ${empScope.clause ? 'AND ' + empScope.clause.replace('AND ', '') : ''}
      LEFT JOIN attendance_records a ON a.employee_id = e.id AND a.duty_date = ? AND a.status IN ('PRESENT', 'OVERTIME')
      GROUP BY d.id
    `, ...empScope.params, today);

    return res.json({
      success: true,
      dutyDate: today,
      stats: {
        totalStaff: totalStaff.count,
        presentCount,
        absentCount: Math.max(0, totalStaff.count - presentCount),
        lateCount,
        overtimeCount,
        currentlyActive
      },
      deptStats,
      recentRecords: recordsToday.slice(0, 15)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Attendance Records (scope-aware, filterable: range, dept, shift, search,
//    status, employees/excluded, designation, late-by, OT-only, incl. archived)
const RECORD_STATUSES = ['PRESENT', 'OVERTIME', 'REGULARIZED', 'HALF_DAY', 'ABSENT', 'ON_LEAVE'];

function csvList(v) {
  return v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : [];
}

function isOrgAdmin(req) {
  return ['ADMIN', 'SUPER_ADMIN'].includes(req.currentUser?.role);
}

// Shared SQL builder for /records and /export so the file always matches the view.
function buildRecordsSql(q, req) {
  const ctx = req.accessCtx;
  const empScope = scopeFilter(ctx, 'e.id');

  let sql = `
    SELECT a.*, e.full_name, e.employee_code, e.designation, e.status as employee_status,
           e.biometric_user_id,
           d.name as department_name, s.name as shift_name, s.end_time as shift_end_time,
           s.is_cross_midnight as shift_cross_midnight
    FROM attendance_records a
    JOIN employees e ON a.employee_id = e.id
    JOIN departments d ON e.department_id = d.id
    JOIN shifts s ON a.shift_id = s.id
    WHERE 1=1 ${empScope.clause}
  `;
  const params = [...empScope.params];

  // Archived staff stay out of reports unless an org admin explicitly opts in.
  if (!(q.includeInactive === '1' && isOrgAdmin(req))) {
    sql += ` AND e.status = 'ACTIVE'`;
  }

  if (q.from && q.to) {
    sql += ` AND a.duty_date BETWEEN ? AND ?`;
    params.push(q.from, q.to);
  } else if (q.date) {
    sql += ` AND a.duty_date = ?`;
    params.push(q.date);
  }

  const deptIds = csvList(q.departmentId);
  if (deptIds.length) {
    sql += ` AND e.department_id IN (${deptIds.map(() => '?').join(',')})`;
    params.push(...deptIds);
  }

  if (q.shiftId) {
    sql += ` AND a.shift_id = ?`;
    params.push(q.shiftId);
  }

  if (q.search) {
    sql += ` AND (e.full_name ILIKE ? OR e.employee_code ILIKE ? OR e.biometric_user_id ILIKE ?)`;
    params.push(`%${q.search}%`, `%${q.search}%`, `%${q.search}%`);
  }

  const statuses = csvList(q.status).filter(s => RECORD_STATUSES.includes(s));
  if (statuses.length) {
    sql += ` AND a.status IN (${statuses.map(() => '?').join(',')})`;
    params.push(...statuses);
  }

  const empIds = csvList(q.employeeIds);
  if (empIds.length) {
    sql += ` AND e.id IN (${empIds.map(() => '?').join(',')})`;
    params.push(...empIds);
  }
  const empId = csvList(q.employeeId); // dossier: one person
  if (empId.length) {
    sql += ` AND e.id IN (${empId.map(() => '?').join(',')})`;
    params.push(...empId);
  }

  const excl = csvList(q.excludeEmployeeIds);
  if (excl.length) {
    sql += ` AND e.id NOT IN (${excl.map(() => '?').join(',')})`;
    params.push(...excl);
  }

  const desigs = csvList(q.designation);
  if (desigs.length) {
    sql += ` AND e.designation IN (${desigs.map(() => '?').join(',')})`;
    params.push(...desigs);
  }

  const lateBy = parseInt(q.lateBy, 10);
  if (Number.isFinite(lateBy) && lateBy > 0) {
    sql += ` AND a.late_minutes >= ?`;
    params.push(lateBy);
  }

  if (q.otOnly === '1') sql += ` AND a.overtime_hours > 0`;

  sql += ` ORDER BY e.employee_code ASC, a.duty_date DESC`;
  return { sql, params };
}

// Attach a display-ready early_minutes: stored value when the engine wrote it,
// otherwise derived on read for legacy rows; null when it can't be known.
function attachEarlyMinutes(rows) {
  return rows.map(r => {
    let early = null;
    if (r.last_out_time) {
      const stored = Number(r.undertime_minutes || 0);
      early = stored > 0 ? stored : computeEarlyMinutes(
        String(r.duty_date).slice(0, 10), r.last_out_time,
        { end_time: r.shift_end_time, is_cross_midnight: r.shift_cross_midnight }
      );
    }
    return { ...r, early_minutes: early };
  });
}

router.get('/records', async (req, res) => {
  try {
    const { sql, params } = buildRecordsSql(req.query, req);
    const records = attachEarlyMinutes(await db.all(sql, ...params));
    return res.json({ success: true, count: records.length, records });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 2b. Filtered attendance export (CSV / XLSX) — same filters as /records.
const EXPORT_HEADERS = ['Date', 'Employee Code', 'Employee', 'Biometric ID', 'Department', 'Designation', 'Shift', 'Status', 'First In', 'Last Out', 'Late (min)', 'Early-out (min)', 'Regular h', 'OT h', 'Total h'];

function fmtExportTime(t) {
  if (!t) return '';
  const d = new Date(t);
  return isNaN(d) ? '' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
}

router.get('/export', requirePerm('EXPORTS'), async (req, res) => {
  try {
    const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const { sql, params } = buildRecordsSql(req.query, req);
    const records = attachEarlyMinutes(await db.all(sql, ...params));

    const body = records.map(r => [
      String(r.duty_date).slice(0, 10), r.employee_code, r.full_name, r.biometric_user_id || '',
      r.department_name, r.designation || '', r.shift_name, r.status,
      fmtExportTime(r.first_in_time), fmtExportTime(r.last_out_time),
      Number(r.late_minutes || 0), Number(r.early_minutes || 0),
      Number(r.regular_hours || 0).toFixed(1), Number(r.overtime_hours || 0).toFixed(1),
      Number(r.total_hours || 0).toFixed(1)
    ]);

    const from = String(req.query.from || req.query.date || '').slice(0, 10) || 'all';
    const to = String(req.query.to || '').slice(0, 10) || 'all';
    const fileName = `Attendance_${from}_to_${to}`;

    if (format === 'csv') {
      const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = '\uFEFF' + [EXPORT_HEADERS, ...body].map(row => row.map(esc).join(',')).join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}.csv"`);
      return res.send(csv);
    }

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'myHR by Swaniki';
    const ws = wb.addWorksheet('Attendance');
    ws.columns = EXPORT_HEADERS.map(h => ({ header: h, key: h, width: Math.max(12, h.length + 2) }));
    body.forEach(row => ws.addRow(Object.fromEntries(EXPORT_HEADERS.map((h, i) => [h, row[i]]))));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF7F2' } }; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. Monthly Muster Roll & Total Logged Hours Summary (scope-aware)
router.get('/summary/monthly', async (req, res) => {
  try {
    const { monthYear = new Date().toISOString().slice(0, 7), from, to } = req.query;
    const ctx = req.accessCtx;
    const empScope = scopeFilter(ctx, 'e.id');

    const dateClause = from && to
      ? `AND a.duty_date BETWEEN ? AND ?`
      : `AND to_char(a.duty_date, 'YYYY-MM') = ?`;
    const dateParam = from && to ? [from, to] : [monthYear];

    const summary = await db.all(`
      SELECT
        e.id as employee_id,
        e.employee_code,
        e.full_name,
        e.designation,
        d.name as department_name,
        count(a.id) as days_logged,
        sum(case when a.status in ('PRESENT', 'OVERTIME', 'REGULARIZED') then 1 else 0 end) as present_days,
        sum(case when a.status = 'HALF_DAY' then 1 else 0 end) as half_days,
        sum(case when a.status = 'ABSENT' then 1 else 0 end) as absent_days,
        round(sum(coalesce(a.total_hours, 0))::numeric, 1) as total_logged_hours,
        round(sum(coalesce(a.overtime_hours, 0))::numeric, 1) as total_overtime_hours
      FROM employees e
      JOIN departments d ON e.department_id = d.id
      LEFT JOIN attendance_records a ON a.employee_id = e.id ${dateClause}
      WHERE e.status = 'ACTIVE' ${empScope.clause}
      GROUP BY e.id, e.employee_code, e.full_name, e.designation, d.name
      ORDER BY total_logged_hours DESC
    `, ...dateParam, ...empScope.params);

    return res.json({
      success: true,
      monthYear,
      summary
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. Daily trend (present / absent / half-day) — scope-aware, supports from/to or days
router.get('/trend', async (req, res) => {
  try {
    const { days = 14, from, to } = req.query;
    const ctx = req.accessCtx;
    const scope = scopeFilter(ctx, 'a.employee_id');

    let trend;
    if (from && to) {
      trend = await db.all(`
        SELECT to_char(a.duty_date, 'YYYY-MM-DD') as day,
          to_char(a.duty_date, 'DD Mon') as label,
          count(*) FILTER (WHERE a.status IN ('PRESENT','OVERTIME','REGULARIZED')) as present,
          count(*) FILTER (WHERE a.status = 'HALF_DAY') as half_day,
          count(*) FILTER (WHERE a.status = 'ABSENT') as absent,
          round(sum(coalesce(a.total_hours, 0))::numeric, 0) as hours
        FROM attendance_records a
        WHERE a.duty_date BETWEEN ? AND ? ${scope.clause}
        GROUP BY a.duty_date
        ORDER BY a.duty_date ASC
      `, from, to, ...scope.params);
    } else {
      const d = Math.min(Number(days) || 14, 90);
      const anchor = await db.get(`SELECT COALESCE(max(duty_date), CURRENT_DATE) as max_day FROM attendance_records`);
      trend = await db.all(`
        SELECT to_char(a.duty_date, 'YYYY-MM-DD') as day,
          to_char(a.duty_date, 'DD Mon') as label,
          count(*) FILTER (WHERE a.status IN ('PRESENT','OVERTIME','REGULARIZED')) as present,
          count(*) FILTER (WHERE a.status = 'HALF_DAY') as half_day,
          count(*) FILTER (WHERE a.status = 'ABSENT') as absent,
          round(sum(coalesce(a.total_hours, 0))::numeric, 0) as hours
        FROM attendance_records a
        WHERE a.duty_date >= (?::date - (?::int - 1)) ${scope.clause}
        GROUP BY a.duty_date
        ORDER BY a.duty_date ASC
      `, anchor.max_day, d, ...scope.params);
    }
    return res.json({ success: true, trend });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. Regularization of Missed Punches (HR Workflow)
router.post('/regularize', requirePerm('REGULARIZATION_APPROVE'), async (req, res) => {
  try {
    const { attendanceId, action = 'APPROVE', notes } = req.body;

    if (!attendanceId) {
      return res.status(400).json({ error: 'Missing attendanceId' });
    }

    const rec = await db.get('SELECT * FROM attendance_records WHERE id = ?', attendanceId);
    if (!rec) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    if (!assertScope(req, rec.employee_id)) return;

    const newStatus = action === 'APPROVE' ? 'REGULARIZED' : rec.status;
    const regStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    await db.run(`
      UPDATE attendance_records
      SET status = ?, regularization_status = ?, regularization_notes = ?, total_hours = GREATEST(total_hours, 8.0), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, newStatus, regStatus, notes || 'Regularized by HR Administrator', attendanceId);

    await audit(req, 'attendance.regularize', {
      entityType: 'attendance', entityId: attendanceId,
      summary: `Attendance ${regStatus.toLowerCase()} for record ${attendanceId} (employee ${rec.employee_id}, ${rec.duty_date})`,
      details: { action, notes: notes || null, previous_status: rec.status, new_status: newStatus, duty_date: rec.duty_date }
    });
    if (action === 'APPROVE') {
      await notify('attendance.regularized', {
        employeeId: rec.employee_id,
        dutyDate: String(rec.duty_date).slice(0, 10),
        hours: 'regularized to full day',
        actorName: req.currentUser?.full_name
      });
    }

    return res.json({
      success: true,
      message: `Punch regularization ${regStatus.toLowerCase()} successfully`,
      updatedRecordId: attendanceId
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── 6. Manual hours override (corrections) — manager requests, admin approves ──
// GET  /corrections            list corrections (filter: status)
// POST /corrections            submit an override request for a punch entry
// PUT  /corrections/:id/decide admin approves/rejects the override

router.get('/corrections', requirePerm('ATTENDANCE_VIEW'), async (req, res) => {
  try {
    const { status } = req.query;
    const empScope = scopeFilter(req.accessCtx, 'e.id');
    let sql = `
      SELECT c.*, e.full_name, e.employee_code, e.designation, d.name as department_name,
             a.shift_id, s.name as shift_name, a.total_hours as logged_hours
      FROM attendance_corrections c
      JOIN attendance_records a ON c.attendance_id = a.id
      JOIN employees e ON c.employee_id = e.id
      JOIN departments d ON e.department_id = d.id
      LEFT JOIN shifts s ON a.shift_id = s.id
      WHERE 1=1 ${empScope.clause}
    `;
    const params = [...empScope.params];
    if (status) { sql += ` AND c.status = ?`; params.push(status); }
    sql += ` ORDER BY c.created_at DESC`;
    const corrections = await db.all(sql, ...params);
    return res.json({ success: true, corrections });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/corrections', requirePerm('ATTENDANCE_VIEW'), async (req, res) => {
  try {
    const { attendance_id, requested_hours, reason, submitted_by } = req.body;
    if (!attendance_id || !requested_hours) {
      return res.status(400).json({ error: 'attendance_id and requested_hours are required' });
    }
    const hours = Number(requested_hours);
    if (!(hours > 0) || hours > 24) {
      return res.status(400).json({ error: 'requested_hours must be between 0 and 24' });
    }
    const rec = await db.get('SELECT * FROM attendance_records WHERE id = ?', attendance_id);
    if (!rec) return res.status(404).json({ error: 'Attendance record not found' });
    if (!assertScope(req, rec.employee_id)) return;

    const existing = await db.get('SELECT id FROM attendance_corrections WHERE attendance_id = ? AND status = ?', attendance_id, 'PENDING');
    if (existing) return res.status(400).json({ error: 'A pending correction already exists for this entry' });

    const id = `cr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await db.run(`
      INSERT INTO attendance_corrections (id, attendance_id, employee_id, duty_date, original_hours, requested_hours, reason, submitted_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, id, rec.id, rec.employee_id, rec.duty_date, rec.total_hours || 0, hours, reason || null, submitted_by || null);

    const created = await db.get('SELECT * FROM attendance_corrections WHERE id = ?', id);
    await audit(req, 'correction.create', {
      entityType: 'attendance_correction', entityId: id,
      summary: `Correction requested for ${rec.employee_id} on ${rec.duty_date}: ${rec.total_hours || 0}h -> ${hours}h`,
      details: { attendance_id: rec.id, original_hours: rec.total_hours || 0, requested_hours: hours, reason: reason || null }
    });
    await notify('correction.requested', {
      employeeId: rec.employee_id,
      dutyDate: String(rec.duty_date).slice(0, 10),
      originalHours: rec.total_hours || 0,
      requestedHours: hours,
      reason: reason || null
    });
    return res.status(201).json({ success: true, message: 'Correction request submitted for admin approval', correction: created });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/corrections/:id/decide', requirePerm('REGULARIZATION_APPROVE'), async (req, res) => {
  try {
    const { id } = req.params;
    const { action, decided_by } = req.body;
    if (!['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({ error: "action must be APPROVE or REJECT" });
    }
    const cor = await db.get('SELECT * FROM attendance_corrections WHERE id = ?', id);
    if (!cor) return res.status(404).json({ error: 'Correction request not found' });
    if (!assertScope(req, cor.employee_id)) return;
    if (cor.status !== 'PENDING') return res.status(400).json({ error: `Request already ${cor.status.toLowerCase()}` });

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    if (action === 'APPROVE') {
      await db.run(`
        UPDATE attendance_records
        SET total_hours = ?,
            regularization_status = 'APPROVED',
            regularization_notes = ?,
            status = CASE WHEN status = 'ABSENT' THEN 'REGULARIZED' ELSE status END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, cor.requested_hours, `Manual hours override approved by ${decided_by || 'Admin'} — ${cor.reason || 'Punch not logged correctly'}`, cor.attendance_id);
    }

    await db.run(`
      UPDATE attendance_corrections SET status = ?, decided_at = CURRENT_TIMESTAMP, decided_by = ?
      WHERE id = ?
    `, newStatus, decided_by || 'Admin', id);

    const updated = await db.get('SELECT * FROM attendance_corrections WHERE id = ?', id);
    await audit(req, `correction.${action === 'APPROVE' ? 'approve' : 'reject'}`, {
      entityType: 'attendance_correction', entityId: id,
      summary: `Correction for ${cor.employee_id} on ${cor.duty_date} ${newStatus.toLowerCase()}`,
      details: { decision: newStatus, original_hours: cor.original_hours, requested_hours: cor.requested_hours, reason: cor.reason }
    });
    await notify('correction.decided', {
      employeeId: cor.employee_id,
      dutyDate: String(cor.duty_date).slice(0, 10),
      decision: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      decidedByName: req.currentUser?.full_name,
      note: cor.reason
    });
    return res.json({ success: true, message: `Correction ${newStatus.toLowerCase()}`, correction: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;