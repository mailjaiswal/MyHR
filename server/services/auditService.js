// server/services/auditService.js
// Central audit trail writer. Every mutating route calls audit(req, action, ...)
// after a successful change. Writes are best-effort: audit failures must never
// break the business operation, so errors are logged and swallowed.
const crypto = require('crypto');
const { db } = require('../db/database');

function actorFromReq(req) {
  const user = req && req.currentUser;
  if (!user) return { actorId: null, actorName: 'System', actorRole: 'SYSTEM' };
  const roleName = (req.accessCtx && req.accessCtx.role && req.accessCtx.role.name) || user.role || 'USER';
  return { actorId: user.id, actorName: user.full_name || user.email || user.id, actorRole: roleName };
}

function ipFromReq(req) {
  const fwd = req.headers && req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.connection && req.connection.remoteAddress) || null;
}

async function writeAudit({ actorId, actorName, actorRole, action, entityType, entityId, summary, details, ip }) {
  try {
    await db.run(`
      INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, entity_type, entity_id, summary, details, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)
    `, crypto.randomUUID(), actorId || null, actorName || 'System', actorRole || 'SYSTEM',
      action, entityType || null, entityId || null,
      String(summary || '').slice(0, 500),
      JSON.stringify(details || {}),
      ip || null);
  } catch (e) {
    console.error('[audit] write failed:', action, e.message);
  }
}

// Main helper: call after a successful mutation inside an authenticated route.
async function audit(req, action, { entityType, entityId, summary, details } = {}) {
  const actor = actorFromReq(req);
  await writeAudit({ ...actor, action, entityType, entityId, summary, details, ip: ipFromReq(req) });
}

// For events without req.currentUser (e.g. failed logins): actor is passed manually.
async function auditSystem({ actorId = null, actorName = 'System', actorRole = 'SYSTEM', action, entityType, entityId, summary, details, ip = null }) {
  await writeAudit({ actorId, actorName, actorRole, action, entityType, entityId, summary, details, ip });
}

// Small utility: build a {field: {from, to}} diff for update-style audit entries.
function diffFields(before = {}, after = {}) {
  const diff = {};
  for (const key of Object.keys(after)) {
    const next = after[key];
    if (next === undefined) continue;
    const prev = before[key];
    if (String(prev ?? '') !== String(next ?? '')) {
      diff[key] = { from: prev ?? null, to: next };
    }
  }
  return diff;
}

module.exports = { audit, auditSystem, diffFields };
