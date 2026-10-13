// server/routes/tenant.js
// Master-admin-only platform tenant registry: provision, list, suspend/activate,
// and remove client companies. Backed by the shared PostgreSQL `tenants` table
// (schema V9). All handlers return { success, ... } so the client api() wrapper
// can distinguish success from failure.
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { db } = require('../db/database');
const { requireAuth } = require('../middleware/authGuard');
const { requireMasterAdmin } = require('../middleware/auth');

router.use(requireAuth);
router.use(requireMasterAdmin);

// Coerce an INSERT result into the shape the client table renders.
function cleanTenant(t) {
  if (!t) return t;
  return {
    ...t,
    employee_count: Number(t.employee_count || 0),
    created_at: t.created_at ? new Date(t.created_at).toISOString() : null
  };
}

/**
 * GET /api/v1/tenant/list
 * Returns all provisioned tenants, newest first.
 */
router.get('/list', async (req, res) => {
  try {
    const tenants = await db.all(`SELECT * FROM tenants ORDER BY created_at DESC`);
    res.json({ success: true, tenants: tenants.map(cleanTenant) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/tenant/create
 * Body: { companyName, industry, adminEmail, adminName, phone, address, employeeCount }
 * Persists a new tenant record and returns it.
 */
router.post('/create', async (req, res) => {
  const { companyName, industry, adminEmail, adminName, phone, address, employeeCount } = req.body;
  if (!companyName || !String(companyName).trim()) {
    return res.status(400).json({ success: false, error: 'Company name is required' });
  }
  const name = String(companyName).trim();
  try {
    // Reject duplicate company names (case-insensitive) so the registry stays clean.
    const dup = await db.get(
      `SELECT id FROM tenants WHERE lower(company_name) = lower(?)`, name
    );
    if (dup) {
      return res.status(409).json({ success: false, error: `"${name}" is already provisioned` });
    }

    const tenantId = crypto.randomUUID();
    await db.run(
      `INSERT INTO tenants
         (id, company_name, industry, admin_email, admin_name, phone, address, employee_count, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      tenantId,
      name,
      (industry || '').trim(),
      (adminEmail || '').trim().toLowerCase(),
      (adminName || '').trim(),
      (phone || '').trim(),
      (address || '').trim(),
      parseInt(employeeCount, 10) || 0
    );

    const tenant = cleanTenant(await db.get(`SELECT * FROM tenants WHERE id = ?`, tenantId));
    console.log('👑 Master admin provisioned tenant:', name, tenantId);
    res.json({ success: true, message: `Tenant "${name}" provisioned`, tenant });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/v1/tenant/:id/status
 * Body: { status: 'ACTIVE' | 'SUSPENDED' }
 */
router.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
    return res.status(400).json({ success: false, error: 'status must be ACTIVE or SUSPENDED' });
  }
  try {
    const { changes } = await db.run(
      `UPDATE tenants SET status = ?, updated_at = now() WHERE id = ?`, status, id
    );
    if (!changes) return res.status(404).json({ success: false, error: 'Tenant not found' });
    const tenant = cleanTenant(await db.get(`SELECT * FROM tenants WHERE id = ?`, id));
    res.json({ success: true, tenant });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/v1/tenant/:id
 * Removes the tenant registry record.
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { changes } = await db.run(`DELETE FROM tenants WHERE id = ?`, id);
    if (!changes) return res.status(404).json({ success: false, error: 'Tenant not found' });
    res.json({ success: true, message: 'Tenant removed' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
