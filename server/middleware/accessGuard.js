// server/middleware/accessGuard.js
// Resolves role permissions and data scope; attaches req.accessCtx.
// Runs AFTER authGuard (expects req.currentUser).
const { db } = require('../db/database');

// Simple in-memory cache for roles (invalidated on role edits via clearRoleCache)
let _roleCache = {};
function clearRoleCache() { _roleCache = {}; }

async function getRole(roleId) {
  if (_roleCache[roleId]) return _roleCache[roleId];
  const role = await db.get('SELECT * FROM roles WHERE id = ?', roleId);
  if (role) {
    // permissions may come as JSONB string or already-parsed array from pg
    role.permissions = typeof role.permissions === 'string'
      ? JSON.parse(role.permissions)
      : (role.permissions || []);
    _roleCache[roleId] = role;
  }
  return role;
}

async function computeVisibleEmployeeIds(currentUser, dataScope) {
  switch (dataScope) {
    case 'ALL':
      return null; // null means no filter needed

    case 'SELF':
      return [currentUser.id];

    case 'DEPARTMENT': {
      const rows = await db.all(
        `SELECT id FROM employees WHERE department_id = ? AND status = 'ACTIVE'`,
        currentUser.department_id
      );
      return rows.map(r => r.id);
    }

    case 'TEAM': {
      // Recursive CTE: current user + all descendants in manager_id tree
      const rows = await db.all(`
        WITH RECURSIVE team AS (
          SELECT id FROM employees WHERE id = ?
          UNION ALL
          SELECT e.id FROM employees e JOIN team t ON e.manager_id = t.id
          WHERE e.status = 'ACTIVE'
        )
        SELECT id FROM team
      `, currentUser.id);
      return rows.map(r => r.id);
    }

    default:
      return [currentUser.id];
  }
}

async function accessGuard(req, res, next) {
  try {
    if (!req.currentUser) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const role = await getRole(req.currentUser.role_id);
    if (!role) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'No role assigned' });
    }

    const visibleEmployeeIds = await computeVisibleEmployeeIds(req.currentUser, role.data_scope);

    req.accessCtx = {
      role,
      permissions: role.permissions || [],
      dataScope: role.data_scope,
      visibleEmployeeIds // null = all, array = filtered set
    };

    next();
  } catch (err) {
    return res.status(500).json({ error: 'ACCESS_CHECK_FAILED', message: err.message });
  }
}

// Helper: middleware factory that 403s if user lacks a permission
function requirePerm(permKey) {
  return (req, res, next) => {
    if (!req.accessCtx) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    if (!req.accessCtx.permissions.includes(permKey)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: `Missing permission: ${permKey}` });
    }
    next();
  };
}

// Helper: assert an employee id is within the caller's visible scope.
// No-op for ALL-scope roles (visibleEmployeeIds === null). Returns true when
// allowed; otherwise writes a 403 and returns false so the caller can bail.
function assertScope(req, employeeId) {
  const ctx = req.accessCtx;
  if (!ctx) { req.res.status(401).json({ error: 'UNAUTHORIZED' }); return false; }
  if (ctx.visibleEmployeeIds === null) return true; // ALL scope
  if (employeeId && ctx.visibleEmployeeIds.includes(employeeId)) return true;
  req.res.status(403).json({ error: 'FORBIDDEN', message: 'Record is outside your access scope' });
  return false;
}

// Helper: build SQL WHERE fragment to scope results to visible employees
// Returns { clause: 'AND e.id = ANY($1)', params: [[ids]] } or empty if ALL
function scopeFilter(accessCtx, colName = 'e.id') {
  if (!accessCtx.visibleEmployeeIds) {
    return { clause: '', params: [] };
  }
  // For IN clause approach (compatible with the prepare/parameterized style)
  const ids = accessCtx.visibleEmployeeIds;
  if (ids.length === 0) {
    return { clause: `AND ${colName} = '__NONE__'`, params: [] };
  }
  const placeholders = ids.map(() => '?').join(',');
  return { clause: `AND ${colName} IN (${placeholders})`, params: ids };
}

module.exports = { accessGuard, requirePerm, clearRoleCache, scopeFilter, assertScope };
