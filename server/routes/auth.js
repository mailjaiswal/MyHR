// server/routes/auth.js
// Real authentication: login, logout, refresh, me, change-password, reset-password.
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { db } = require('../db/database');
const {
  verifyPassword, hashPassword, generateTempPassword,
  signAccessToken, signRefreshToken, verifyRefreshToken
} = require('../services/authService');
const { requireAuth } = require('../middleware/authGuard');
const { accessGuard, requirePerm } = require('../middleware/accessGuard');
const { audit, auditSystem } = require('../services/auditService');
const { notify } = require('../services/notificationService');

const LOCK_THRESHOLD = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// Throttle credential-stuffing / brute-force against the login endpoint.
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,             // 10 attempts / minute / IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please slow down.' }
});

// Build the refresh-token cookie (Secure only when serving over HTTPS in production).
function refreshCookie(value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  return `refreshToken=${value}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Strict;${secure}`;
}

// --- LOGIN ---
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await db.get(
      `SELECT * FROM employees WHERE LOWER(email) = LOWER(?) AND status = 'ACTIVE'`, email
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remainMin = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
      return res.status(423).json({ error: `Account locked. Try again in ${remainMin} minutes.` });
    }

    // Verify password
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      const attempts = (user.failed_attempts || 0) + 1;
      const updates = { failed_attempts: attempts };
      if (attempts >= LOCK_THRESHOLD) {
        updates.locked_until = new Date(Date.now() + LOCK_DURATION_MS);
        updates.failed_attempts = 0;
        // Security events worth a durable trail + HR admin alert.
        const fwd = req.headers['x-forwarded-for'];
        const ip = (fwd ? String(fwd).split(',')[0].trim() : req.connection?.remoteAddress) || null;
        await auditSystem({
          actorId: user.id, actorName: user.full_name || user.email, actorRole: user.role,
          action: 'auth.lockout', entityType: 'employee', entityId: user.id,
          summary: `Account locked for 30 min after ${attempts} failed login attempts`,
          details: { email: user.email, ip, attempts }, ip
        });
        await notify('auth.lockout', { email: user.email, ip, attempts });
      }
      await db.run(`UPDATE employees SET failed_attempts = ?, locked_until = ? WHERE id = ?`,
        updates.failed_attempts, updates.locked_until || null, user.id);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Reset failed attempts on success
    await db.run(`UPDATE employees SET failed_attempts = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP WHERE id = ?`, user.id);

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    // Set refresh token as httpOnly cookie
    res.setHeader('Set-Cookie', refreshCookie(refreshToken, 604800));

    return res.json({
      success: true,
      token: accessToken,
      mustChangePassword: !!user.must_change_password,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        designation: user.designation,
        department_id: user.department_id,
        role_id: user.role_id,
        role: user.role
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- REFRESH ---
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    const user = await db.get(`SELECT * FROM employees WHERE id = ? AND status = 'ACTIVE'`, payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    const accessToken = signAccessToken(user);
    const newRefresh = signRefreshToken(user);
    res.setHeader('Set-Cookie', refreshCookie(newRefresh, 604800));

    return res.json({ success: true, token: accessToken });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- LOGOUT ---
router.post('/logout', (req, res) => {
  res.setHeader('Set-Cookie', refreshCookie('', 0));
  return res.json({ success: true, message: 'Logged out' });
});

// --- ME (current user + permissions) ---
router.get('/me', requireAuth, accessGuard, async (req, res) => {
  try {
    const { currentUser, accessCtx } = req;
    // Fetch dept name for display
    const dept = currentUser.department_id
      ? await db.get('SELECT name FROM departments WHERE id = ?', currentUser.department_id)
      : null;

    return res.json({
      success: true,
      user: {
        id: currentUser.id,
        email: currentUser.email,
        full_name: currentUser.full_name,
        first_name: currentUser.first_name,
        last_name: currentUser.last_name,
        designation: currentUser.designation,
        department_id: currentUser.department_id,
        department_name: dept?.name || '',
        role_id: currentUser.role_id,
        role: currentUser.role,
        manager_id: currentUser.manager_id,
        shift_id: currentUser.shift_id
      },
      role: {
        name: accessCtx.role.name,
        technical_key: accessCtx.role.technical_key,
        dataScope: accessCtx.dataScope
      },
      permissions: accessCtx.permissions,
      mustChangePassword: !!currentUser.must_change_password
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- CHANGE PASSWORD (self-service) ---
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const user = await db.get('SELECT * FROM employees WHERE id = ?', req.currentUser.id);
    const valid = await verifyPassword(oldPassword || '', user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await hashPassword(newPassword);
    await db.run(`UPDATE employees SET password_hash = ?, must_change_password = 0, failed_attempts = 0, locked_until = NULL WHERE id = ?`,
      newHash, user.id);

    await audit(req, 'auth.password_change_self', { entityType: 'employee', entityId: user.id, summary: 'Password changed (self-service)' });
    return res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- ADMIN RESET PASSWORD ---
router.patch('/reset-password', requireAuth, accessGuard, requirePerm('ACCESS_MANAGE'), async (req, res) => {
  try {
    const { employee_id } = req.body;
    if (!employee_id) {
      return res.status(400).json({ error: 'employee_id is required' });
    }

    const target = await db.get('SELECT id, full_name, email FROM employees WHERE id = ? AND status = ?', employee_id, 'ACTIVE');
    if (!target) {
      return res.status(404).json({ error: 'Employee not found or inactive' });
    }

    const tempPwd = generateTempPassword();
    const hash = await hashPassword(tempPwd);
    await db.run(`UPDATE employees SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?`,
      hash, employee_id);

    await audit(req, 'auth.password_reset_admin', { entityType: 'employee', entityId: employee_id, summary: `Password reset by admin for '${target.full_name}' (${target.email})` });
    await notify('password.admin_reset', { employeeId: employee_id, actorName: req.currentUser?.full_name });
    return res.json({
      success: true,
      message: `Password reset for ${target.full_name}. Share this temp password:`,
      tempPassword: tempPwd
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
