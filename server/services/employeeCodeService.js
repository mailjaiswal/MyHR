// server/services/employeeCodeService.js
// Configurable, system-generated employee codes (e.g. BGL0001).
// Admin chooses only prefix + padding in Company Settings; the sequence is
// allocated here and NEVER reused, even after an employee is archived.
const { pool } = require('../db/database');
const { getSettings } = require('./settingsService');

// Dedicated advisory-lock key so concurrent inserts can't race on max(seq).
const CODE_LOCK_KEY = 727273001;

function zeroPad(n, padding) {
  return String(n).padStart(padding, '0');
}

/**
 * Generates the next employee code for the configured prefix.
 * Returns null when no prefix is configured — callers then fall back to
 * their legacy behaviour (IMP-/API- codes) so old deployments are untouched.
 */
async function generateEmployeeCode() {
  const settings = await getSettings();
  const prefix = String(settings.emp_code_prefix || '').trim().toUpperCase();
  if (!prefix) return null;
  const padding = Math.min(6, Math.max(3, parseInt(settings.emp_code_padding, 10) || 4));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [CODE_LOCK_KEY]);

    // Max numeric suffix among codes that match the CURRENT prefix.
    // Escaping LIKE wildcards in the prefix is intentional: prefixes are
    // short alphanumerics, but a stray '%' should not widen the match.
    const likePrefix = prefix.replace(/[\\%_]/g, '') + '%';
    const res = await client.query(
      `SELECT employee_code FROM employees WHERE employee_code LIKE $1 ORDER BY length(employee_code) DESC, employee_code DESC LIMIT 1`,
      [likePrefix]
    );
    let nextSeq = 1;
    if (res.rowCount > 0) {
      const m = res.rows[0].employee_code.slice(prefix.length).match(/(\d+)\s*$/);
      if (m) nextSeq = parseInt(m[1], 10) + 1;
    }

    // Skip anything already taken (e.g. a manual code colliding with the ramp).
    let code = `${prefix}${zeroPad(nextSeq, padding)}`;
    for (let guard = 0; guard < 500; guard++) {
      const dup = await client.query('SELECT 1 FROM employees WHERE employee_code = $1', [code]);
      if (dup.rowCount === 0) break;
      nextSeq += 1;
      code = `${prefix}${zeroPad(nextSeq, padding)}`;
    }
    await client.query('COMMIT');
    return code;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Resolves a usable code for auto-created employees (importers/sync):
 * configured-prefix code when available, else the given legacy fallback.
 */
async function employeeCodeOrFallback(legacyFallback) {
  try {
    const code = await generateEmployeeCode();
    return code || legacyFallback;
  } catch (err) {
    return legacyFallback;
  }
}

module.exports = { generateEmployeeCode, employeeCodeOrFallback };
