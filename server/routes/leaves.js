const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/authGuard');
const { accessGuard, requirePerm, scopeFilter } = require('../middleware/accessGuard');

// All leave endpoints require authentication + scope
router.use(requireAuth, accessGuard);

// ── 1. Leave types (configurable, e.g. Annual / Sick / Casual) ───────────
router.get('/types', async (req, res) => {
  try {
    const types = await db.all(`SELECT * FROM leave_types ORDER BY is_active DESC, name ASC`);
    return res.json({ success: true, types });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── 2. Leave balances for a year (scope-aware) ───
router.get('/balances', async (req, res) => {
  try {
    const { employeeId, year = new Date().getFullYear() } = req.query;
    const ctx = req.accessCtx;
    const scope = scopeFilter(ctx, 'lb.employee_id');

    let sql = `
      SELECT lb.id, lb.employee_id, e.full_name, lb.leave_type_id, lt.code, lt.name as leave_name,
             lt.color_code, lt.paid, lb.year, lb.accumulated, lb.used, lb.pending,
             lb.carried_forward, lb.encashed
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      JOIN employees e ON lb.employee_id = e.id
      WHERE lb.year = ? ${scope.clause}
    `;
    const params = [Number(year) || new Date().getFullYear(), ...scope.params];
    if (employeeId) {
      sql += ` AND lb.employee_id = ?`;
      params.push(employeeId);
    }
    sql += ` ORDER BY e.full_name ASC, lt.name ASC`;
    const balances = await db.all(sql, ...params);
    return res.json({ success: true, year: Number(year) || new Date().getFullYear(), balances });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── 3. Leave requests (scope-aware) ─────────────────────────────────────────
router.get('/requests', async (req, res) => {
  try {
    const { employeeId, status, from, to } = req.query;
    const ctx = req.accessCtx;
    const scope = scopeFilter(ctx, 'lr.employee_id');

    let sql = `
      SELECT lr.*, e.full_name, e.employee_code, lt.name as leave_name, lt.code as leave_code,
             lt.color_code
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE 1=1 ${scope.clause}
    `;
    const params = [...scope.params];
    if (employeeId) { sql += ` AND lr.employee_id = ?`; params.push(employeeId); }
    if (status) { sql += ` AND lr.status = ?`; params.push(status); }
    if (from && to) { sql += ` AND lr.from_date BETWEEN ? AND ?`; params.push(from, to); }
    sql += ` ORDER BY lr.created_at DESC`;
    const requests = await db.all(sql, ...params);
    return res.json({ success: true, requests });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── 4. Apply for leave (EMPLOYEE / via HR on behalf) ─────────────────────
router.post('/requests', async (req, res) => {
  try {
    const { employee_id, leave_type_id, from_date, to_date, reason, document_ref } = req.body;
    if (!employee_id || !leave_type_id || !from_date || !to_date) {
      return res.status(400).json({ error: 'employee_id, leave_type_id, from_date and to_date are required' });
    }
    const lt = await db.get('SELECT * FROM leave_types WHERE id = ?', leave_type_id);
    if (!lt) return res.status(404).json({ error: 'Leave type not found' });
    const emp = await db.get('SELECT id FROM employees WHERE id = ?', employee_id);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const start = new Date(from_date);
    const end = new Date(to_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return res.status(400).json({ error: 'Invalid date range' });
    }
    const days = Math.round(((end - start) / (24 * 60 * 60 * 1000)) + 1);
    const id = `lr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const request_no = `LV-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;

    await db.run(`
      INSERT INTO leave_requests (id, request_no, employee_id, leave_type_id, from_date, to_date, days, reason, document_ref, status, current_step)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 1)
    `, id, request_no, employee_id, leave_type_id, from_date, to_date, days, reason || null, document_ref || null);

    const created = await db.get('SELECT * FROM leave_requests WHERE id = ?', id);
    return res.status(201).json({ success: true, request: created });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── 5. Approve / reject a request (HR / Admin) ───────────────────────────
router.put('/requests/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, decided_by, notes } = req.body;
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: "status must be APPROVED or REJECTED" });
    }
    const existing = await db.get('SELECT * FROM leave_requests WHERE id = ?', id);
    if (!existing) return res.status(404).json({ error: 'Leave request not found' });
    if (existing.status !== 'PENDING') {
      return res.status(400).json({ error: `Request already ${existing.status.toLowerCase()}` });
    }

    await db.run(`
      UPDATE leave_requests SET status = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, status, decided_by || null, id);

    if (status === 'APPROVED') {
      await db.run(`
        UPDATE leave_balances
        SET pending = GREATEST(pending - ?, 0), used = used + ?
        WHERE employee_id = ? AND leave_type_id = ? AND year = ?
      `, existing.days, existing.days, existing.employee_id, existing.leave_type_id, new Date(existing.from_date).getFullYear());
    }

    const updated = await db.get('SELECT * FROM leave_requests WHERE id = ?', id);
    return res.json({ success: true, request: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── 6. Admin: leave policy control (override system defaults) ─────────────
// A: create a new leave type
router.post('/types', async (req, res) => {
  try {
    const {
      code, name, annual_allowance = 0, accrual_basis = 'YEARLY', carry_forward_limit = 0,
      encashable = 0, paid = 1, requires_document = 0, color_code = '#22c55e'
    } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'code and name are required' });
    const collision = await db.get('SELECT id FROM leave_types WHERE code = ?', code);
    if (collision) return res.status(400).json({ error: `Leave code '${code}' already exists` });

    const id = `lt_${Date.now()}`;
    await db.run(`
      INSERT INTO leave_types (id, code, name, annual_allowance, accrual_basis, carry_forward_limit, encashable, paid, requires_document, color_code, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, id, code, name, annual_allowance, accrual_basis, carry_forward_limit, encashable, paid, requires_document, color_code);
    const created = await db.get('SELECT * FROM leave_types WHERE id = ?', id);
    return res.status(201).json({ success: true, message: `Leave type '${name}' created`, type: created });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// B: update a leave type (name / allowance / paid / carry etc.)
router.put('/types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.get('SELECT * FROM leave_types WHERE id = ?', id);
    if (!existing) return res.status(404).json({ error: 'Leave type not found' });
    const {
      name, code, annual_allowance, accrual_basis, carry_forward_limit,
      encashable, paid, requires_document, color_code, is_active
    } = req.body;

    await db.run(`
      UPDATE leave_types SET
        code = coalesce(?, code),
        name = coalesce(?, name),
        annual_allowance = coalesce(?, annual_allowance),
        accrual_basis = coalesce(?, accrual_basis),
        carry_forward_limit = coalesce(?, carry_forward_limit),
        encashable = coalesce(?, encashable),
        paid = coalesce(?, paid),
        requires_document = coalesce(?, requires_document),
        color_code = coalesce(?, color_code),
        is_active = coalesce(?, is_active)
      WHERE id = ?
    `, code ?? null, name ?? null, annual_allowance ?? null, accrual_basis ?? null,
      carry_forward_limit ?? null, encashable ?? null, paid ?? null, requires_document ?? null,
      color_code ?? null, is_active ?? null, id);

    const updated = await db.get('SELECT * FROM leave_types WHERE id = ?', id);
    return res.json({ success: true, message: `Leave type '${updated.name}' updated`, type: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// C: override a single employee's balance for a leave type & year
router.put('/balances/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { accumulated, used, pending, carried_forward, encashed } = req.body;
    const existing = await db.get('SELECT * FROM leave_balances WHERE id = ?', id);
    if (!existing) return res.status(404).json({ error: 'Balance record not found' });
    if (accumulated === undefined && used === undefined && pending === undefined && carried_forward === undefined && encashed === undefined) {
      return res.status(400).json({ error: 'Provide at least one field to update' });
    }
    await db.run(`
      UPDATE leave_balances SET
        accumulated = coalesce(?, accumulated),
        used = coalesce(?, used),
        pending = coalesce(?, pending),
        carried_forward = coalesce(?, carried_forward),
        encashed = coalesce(?, encashed)
      WHERE id = ?
    `, accumulated ?? null, used ?? null, pending ?? null, carried_forward ?? null, encashed ?? null, id);
    const updated = await db.get('SELECT * FROM leave_balances WHERE id = ?', id);
    return res.json({ success: true, message: 'Balance updated', balance: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// D: push an annual allowance to all employees for a leave type & year
router.post('/balances/set-all', async (req, res) => {
  try {
    const { leave_type_id, year = new Date().getFullYear(), accumulated } = req.body;
    if (!leave_type_id || accumulated === undefined) {
      return res.status(400).json({ error: 'leave_type_id and accumulated are required' });
    }
    const lt = await db.get('SELECT * FROM leave_types WHERE id = ?', leave_type_id);
    if (!lt) return res.status(404).json({ error: 'Leave type not found' });

    const result = await db.run(`
      INSERT INTO leave_balances (id, employee_id, leave_type_id, year, accumulated)
      SELECT 'lb_' || e.id || '_' || ?::int, e.id, ?, ?, ?
      FROM employees e
      WHERE e.status = 'ACTIVE'
      ON CONFLICT (employee_id, leave_type_id, year)
      DO UPDATE SET accumulated = EXCLUDED.accumulated
    `, year, leave_type_id, year, Number(accumulated));

    return res.json({
      success: true,
      message: `Annual allowance of ${accumulated} days applied for '${lt.name}' ${year} to all active employees`,
      affected: result.changes
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;