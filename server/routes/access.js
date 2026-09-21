// server/routes/access.js
// Admin endpoints for managing roles, permissions, hierarchy, and employee role assignment.
const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/authGuard');
const { accessGuard, requirePerm, clearRoleCache } = require('../middleware/accessGuard');
const { audit } = require('../services/auditService');
const { notify } = require('../services/notificationService');

// All endpoints require auth + ACCESS_MANAGE permission
router.use(requireAuth, accessGuard, requirePerm('ACCESS_MANAGE'));

// --- LIST ALL ROLES ---
router.get('/roles', async (req, res) => {
  try {
    const roles = await db.all('SELECT * FROM roles ORDER BY sort_order ASC');
    return res.json({ success: true, roles });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- CREATE CUSTOM ROLE ---
router.post('/roles', async (req, res) => {
  try {
    const { name, technical_key, data_scope, permissions } = req.body;
    if (!name || !technical_key) {
      return res.status(400).json({ error: 'name and technical_key are required' });
    }

    // Check uniqueness
    const existing = await db.get('SELECT id FROM roles WHERE technical_key = ? OR name = ?', technical_key.toUpperCase(), name);
    if (existing) {
      return res.status(409).json({ error: 'A role with this name or key already exists' });
    }

    const id = `role_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await db.run(`
      INSERT INTO roles (id, name, technical_key, data_scope, permissions, is_system, sort_order)
      VALUES (?, ?, ?, ?, ?::jsonb, 0, (SELECT COALESCE(MAX(sort_order)+1, 10) FROM roles))
    `, id, name, technical_key.toUpperCase(), data_scope || 'SELF', JSON.stringify(permissions || []));

    clearRoleCache();
    const created = await db.get('SELECT * FROM roles WHERE id = ?', id);
    await audit(req, 'access.role_create', {
      entityType: 'role', entityId: id,
      summary: `Role '${name}' (${data_scope || 'SELF'}) created with ${(permissions || []).length} permission(s)`,
      details: { name, technical_key: technical_key.toUpperCase(), data_scope: data_scope || 'SELF', permissions: permissions || [] }
    });
    return res.status(201).json({ success: true, role: created });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- EDIT ROLE (name, scope, permissions) ---
router.patch('/roles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, data_scope, permissions } = req.body;

    const role = await db.get('SELECT * FROM roles WHERE id = ?', id);
    if (!role) return res.status(404).json({ error: 'Role not found' });

    const updates = [];
    const params = [];
    if (name) { updates.push('name = ?'); params.push(name); }
    if (data_scope) { updates.push('data_scope = ?'); params.push(data_scope); }
    if (permissions) { updates.push('permissions = ?::jsonb'); params.push(JSON.stringify(permissions)); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    await db.run(`UPDATE roles SET ${updates.join(', ')} WHERE id = ?`, ...params);

    clearRoleCache();
    const updated = await db.get('SELECT * FROM roles WHERE id = ?', id);
    let oldPerms = []; try { oldPerms = typeof role.permissions === 'string' ? JSON.parse(role.permissions) : (role.permissions || []); } catch {}
    await audit(req, 'access.role_update', {
      entityType: 'role', entityId: id,
      summary: `Role '${updated.name}' updated${permissions ? ` (now ${permissions.length} permission(s))` : ''}`,
      details: {
        before: { name: role.name, data_scope: role.data_scope, permissions: oldPerms },
        after: { name: updated.name, data_scope: updated.data_scope, permissions: typeof updated.permissions === 'string' ? JSON.parse(updated.permissions) : updated.permissions }
      }
    });
    return res.json({ success: true, role: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- DELETE NON-SYSTEM ROLE ---
router.delete('/roles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const role = await db.get('SELECT * FROM roles WHERE id = ?', id);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.is_system) return res.status(400).json({ error: 'Cannot delete a system role' });

    // Check if any employees are assigned to this role
    const assigned = await db.get('SELECT count(*) as n FROM employees WHERE role_id = ?', id);
    if (assigned.n > 0) {
      return res.status(400).json({ error: `Cannot delete: ${assigned.n} employees still assigned to this role` });
    }

    await db.run('DELETE FROM roles WHERE id = ?', id);
    clearRoleCache();
    await audit(req, 'access.role_delete', { entityType: 'role', entityId: id, summary: `Role '${role.name}' (${role.technical_key}) deleted`, details: { name: role.name, technical_key: role.technical_key, data_scope: role.data_scope } });
    return res.json({ success: true, message: 'Role deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- LIST ROLE MEMBERS ---
router.get('/roles/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const members = await db.all(`
      SELECT e.id, e.full_name, e.employee_code, e.designation, e.email, d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.role_id = ? AND e.status = 'ACTIVE'
      ORDER BY e.full_name
    `, id);
    return res.json({ success: true, members });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- ASSIGN ROLE TO EMPLOYEE ---
router.patch('/employees/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { role_id } = req.body;
    if (!role_id) return res.status(400).json({ error: 'role_id is required' });

    const emp = await db.get('SELECT id, full_name, role_id FROM employees WHERE id = ?', id);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const role = await db.get('SELECT id, name FROM roles WHERE id = ?', role_id);
    if (!role) return res.status(400).json({ error: 'Role not found' });

    const prevRole = emp.role_id ? await db.get('SELECT name FROM roles WHERE id = ?', emp.role_id) : null;
    await db.run('UPDATE employees SET role_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', role_id, id);
    await audit(req, 'access.employee_role_assign', {
      entityType: 'employee', entityId: id,
      summary: `Role for '${emp.full_name}' changed from '${prevRole?.name || 'none'}' to '${role.name}'`,
      details: { from: prevRole?.name || null, to: role.name }
    });
    await notify('employee.role_changed', { employeeId: id, roleName: role.name, actorName: req.currentUser?.full_name });
    return res.json({ success: true, message: 'Role assigned' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- GET ORG HIERARCHY (full tree) ---
router.get('/hierarchy', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT e.id, e.full_name, e.designation, e.department_id, e.manager_id, e.role_id,
             r.name as role_name, r.technical_key as role_key, d.name as department_name
      FROM employees e
      LEFT JOIN roles r ON e.role_id = r.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.status = 'ACTIVE'
      ORDER BY e.designation
    `);
    return res.json({ success: true, hierarchy: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- SET EMPLOYEE MANAGER ---
router.patch('/employees/:id/manager', async (req, res) => {
  try {
    const { id } = req.params;
    const { manager_id } = req.body;

    const emp = await db.get('SELECT id, full_name, manager_id FROM employees WHERE id = ?', id);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    let mgr = null;
    if (manager_id) {
      mgr = await db.get('SELECT id, full_name FROM employees WHERE id = ?', manager_id);
      if (!mgr) return res.status(400).json({ error: 'Manager not found' });
      // Prevent self-reference
      if (manager_id === id) return res.status(400).json({ error: 'Cannot be own manager' });
    }

    await db.run('UPDATE employees SET manager_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', manager_id || null, id);
    await audit(req, 'access.employee_manager_assign', {
      entityType: 'employee', entityId: id,
      summary: `Reporting manager for '${emp.full_name}' set to '${mgr?.full_name || '(none)'}'`,
      details: { from: emp.manager_id || null, to: manager_id || null }
    });
    await notify('employee.manager_changed', { employeeId: id, managerName: mgr?.full_name || null, actorName: req.currentUser?.full_name });
    return res.json({ success: true, message: 'Manager updated' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
