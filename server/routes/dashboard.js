// server/routes/dashboard.js
// Scope-aware dashboard endpoints.
const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/authGuard');
const { accessGuard, scopeFilter } = require('../middleware/accessGuard');

router.use(requireAuth, accessGuard);

// --- SUMMARY (stats for visible scope within date range) ---
router.get('/summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    const ctx = req.accessCtx;
    const scope = scopeFilter(ctx, 'a.employee_id');

    const dateFilter = from && to ? `AND a.duty_date BETWEEN ? AND ?` : '';
    const dateParams = from && to ? [from, to] : [];

    // Attendance stats
    const stats = await db.get(`
      SELECT
        count(*) as total_records,
        count(*) FILTER (WHERE a.status IN ('PRESENT','OVERTIME','REGULARIZED')) as present,
        count(*) FILTER (WHERE a.status = 'ABSENT') as absent,
        count(*) FILTER (WHERE a.status = 'HALF_DAY') as half_day,
        count(*) FILTER (WHERE a.late_minutes > 0) as late,
        round(coalesce(sum(a.total_hours), 0)::numeric, 1) as total_hours
      FROM attendance_records a
      WHERE 1=1 ${scope.clause} ${dateFilter}
    `, ...scope.params, ...dateParams);

    // Staff count in visible scope
    const empScope = scopeFilter(ctx, 'e.id');
    const staffCount = await db.get(`
      SELECT count(*) as n FROM employees e WHERE e.status = 'ACTIVE' ${empScope.clause}
    `, ...empScope.params);

    // Department breakdown
    const deptStats = await db.all(`
      SELECT d.id, d.name,
        count(a.id) FILTER (WHERE a.status IN ('PRESENT','OVERTIME','REGULARIZED')) as present_count,
        count(a.id) as total_count
      FROM departments d
      JOIN employees e ON e.department_id = d.id AND e.status = 'ACTIVE' ${empScope.clause}
      LEFT JOIN attendance_records a ON a.employee_id = e.id ${dateFilter}
      GROUP BY d.id, d.name
      ORDER BY present_count DESC
    `, ...empScope.params, ...dateParams);

    return res.json({
      success: true,
      stats: {
        totalStaff: staffCount.n,
        presentCount: stats.present,
        absentCount: stats.absent,
        halfDayCount: stats.half_day,
        lateCount: stats.late,
        totalHours: Number(stats.total_hours),
        dataScope: ctx.dataScope
      },
      deptStats
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- MY ATTENDANCE (personal punch history in range) ---
router.get('/my-attendance', async (req, res) => {
  try {
    const { from, to } = req.query;
    const employeeId = req.currentUser.id;

    let query = `
      SELECT a.duty_date, a.first_in_time, a.last_out_time, a.total_hours, a.status, a.overtime_hours,
             s.name as shift_name
      FROM attendance_records a
      LEFT JOIN shifts s ON a.shift_id = s.id
      WHERE a.employee_id = ?
    `;
    const params = [employeeId];

    if (from && to) {
      query += ` AND a.duty_date BETWEEN ? AND ?`;
      params.push(from, to);
    }
    query += ` ORDER BY a.duty_date DESC LIMIT 60`;

    const records = await db.all(query, ...params);
    return res.json({ success: true, records });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- PENDING ACTIONS (approvals waiting on this user) ---
router.get('/pending-actions', async (req, res) => {
  try {
    const ctx = req.accessCtx;
    const scope = scopeFilter(ctx, 'e.id');

    // Pending leave requests for visible employees
    const pendingLeaves = await db.all(`
      SELECT lr.id, lr.employee_id, e.full_name, lr.from_date, lr.to_date, lr.days, lr.reason, lt.name as leave_type_name
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lr.status = 'PENDING' ${scope.clause}
      ORDER BY lr.created_at DESC
      LIMIT 20
    `, ...scope.params);

    // Pending corrections
    const pendingCorrections = await db.all(`
      SELECT ac.id, ac.employee_id, e.full_name, ac.duty_date, ac.original_hours, ac.requested_hours, ac.reason
      FROM attendance_corrections ac
      JOIN employees e ON ac.employee_id = e.id
      WHERE ac.status = 'PENDING' ${scope.clause}
      ORDER BY ac.created_at DESC
      LIMIT 20
    `, ...scope.params);

    return res.json({
      success: true,
      pendingLeaves,
      pendingCorrections,
      totalPending: pendingLeaves.length + pendingCorrections.length
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- TREND (attendance hours over time for visible scope) ---
router.get('/trend', async (req, res) => {
  try {
    const { from, to } = req.query;
    const ctx = req.accessCtx;
    const scope = scopeFilter(ctx, 'a.employee_id');

    const dateFilter = from && to ? `AND a.duty_date BETWEEN ? AND ?` : '';
    const dateParams = from && to ? [from, to] : [];

    const trend = await db.all(`
      SELECT to_char(a.duty_date, 'YYYY-MM-DD') as day,
        to_char(a.duty_date, 'DD Mon') as label,
        count(*) FILTER (WHERE a.status IN ('PRESENT','OVERTIME','REGULARIZED')) as present,
        count(*) FILTER (WHERE a.status = 'HALF_DAY') as half_day,
        count(*) FILTER (WHERE a.status = 'ABSENT') as absent,
        round(coalesce(sum(a.total_hours), 0)::numeric, 0) as hours
      FROM attendance_records a
      WHERE 1=1 ${scope.clause} ${dateFilter}
      GROUP BY a.duty_date
      ORDER BY a.duty_date ASC
    `, ...scope.params, ...dateParams);

    return res.json({ success: true, trend });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
