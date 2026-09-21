// server/scripts/migrateV2.js
// Applies the idempotent schema_v2.sql DDL (roles table + employee auth/RBAC
// columns + indexes) to the configured PostgreSQL database. Safe to re-run:
// every statement uses CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
// Usage:  node scripts/migrateV2.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (check server/.env)');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema_v2.sql'), 'utf8');
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql); // simple protocol -> runs all statements in order
    await client.query('COMMIT');
    // Verify the auth columns now exist
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'employees'
         AND column_name = ANY($1)`,
      [['password_hash', 'must_change_password', 'failed_attempts', 'locked_until', 'last_login_at', 'role_id']]
    );
    console.log('Migration applied. Auth columns present on employees:', cols.rows.map(r => r.column_name).join(', '));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error('MIGRATION FAIL:', err.message || err); console.error(err.stack || ''); process.exit(1); });
