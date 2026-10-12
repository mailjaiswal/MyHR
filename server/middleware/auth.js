// server/middleware/auth.js
// Middleware that ensures the logged‑in user is a master admin
const config = require('../config');

function requireMasterAdmin(req, res, next) {
  // req.currentUser is set by the existing authGuard middleware
  if (!req.currentUser) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User not logged in' });
  }
  // Primary check is the DB-driven role — exactly one SUPER_ADMIN exists (the platform owner).
  // An optional MASTER_ADMIN_EMAILS whitelist can grant the same access for recovery scenarios.
  const email = (req.currentUser.email || '').toLowerCase();
  const whitelisted = (config.MASTER_ADMIN_EMAILS || []).includes(email);
  if (req.currentUser.role !== 'SUPER_ADMIN' && !whitelisted) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Only master admin may access this endpoint' });
  }
  next();
}

module.exports = { requireMasterAdmin };
