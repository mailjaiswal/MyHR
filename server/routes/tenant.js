// server/routes/tenant.js
// Routes that only the master admin can call – e.g., create a new client/company
const express = require('express');
const router = express.Router();

// Existing auth guard that populates req.currentUser
const { requireAuth } = require('../middleware/authGuard');
// Our new master‑admin guard
const { requireMasterAdmin } = require('../middleware/auth');

// All tenant routes require the user to be logged in first
router.use(requireAuth);

/**
 * POST /api/v1/tenant/create
 * Body: { companyName: string, contacts: [{ name, email, phone }] }
 * Returns a simple success message (real implementation would create DB records).
 */
router.post('/create', requireMasterAdmin, (req, res) => {
  const { companyName, contacts } = req.body;
  if (!companyName) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'companyName is required' });
  }
  // TODO: actually insert the new tenant into DB – stub for now
  console.log('👑 Master admin created tenant:', companyName, contacts);
  res.json({ message: `Tenant "${companyName}" created (stub)` });
});

module.exports = router;
