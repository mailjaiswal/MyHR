// server/middleware/authGuard.js
// Extracts Bearer token, verifies JWT, attaches req.currentUser.
const { verifyAccessToken } = require('../services/authService');
const { db } = require('../db/database');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'No token provided' });
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Token invalid or expired' });
    }

    // Fetch user fresh from DB to get latest role_id, department, manager etc.
    const user = await db.get(`
      SELECT e.id, e.email, e.full_name, e.first_name, e.last_name, e.designation,
             e.department_id, e.manager_id, e.role, e.role_id, e.status,
             e.must_change_password, e.shift_id
      FROM employees e
      WHERE e.id = ? AND e.status = 'ACTIVE'
    `, payload.sub);

    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User not found or inactive' });
    }

    // Until the user sets their own password, only the password-change / session
    // endpoints are reachable. Everything else is blocked (defense-in-depth).
    if (user.must_change_password) {
      const allowed = ['/api/v1/auth/change-password', '/api/v1/auth/logout', '/api/v1/auth/me'];
      if (!allowed.includes(req.originalUrl.split('?')[0])) {
        return res.status(403).json({ error: 'PASSWORD_CHANGE_REQUIRED', message: 'You must change your password before continuing.' });
      }
    }

    req.currentUser = user;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'AUTH_CHECK_FAILED', message: err.message });
  }
}

module.exports = { requireAuth };
