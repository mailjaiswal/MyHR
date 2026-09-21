// PostgreSQL data layer for MyHR.
// Exposes a prepare(sql).get()/.all()/.run() API (async) that mirrors the legacy
// SQLite usage site-wide, translating `?` positional placeholders to PG `$n`.
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const connectionString = process.env.DATABASE_URL || config.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Add it to server/.env or environment.');
}

const useSsl = !process.env.DATABASE_NO_SSL && /supabase\.co|pooler\.supabase\.com|neon\.tech|rds\.amazonaws\.com/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// Normalize numeric/text types that node-postgres returns as strings.
const { types } = require('pg');
types.setTypeParser(20, v => (v === null ? null : parseInt(v, 10)));        // int8 / bigint counts
types.setTypeParser(1082, v => v);                                          // DATE -> 'YYYY-MM-DD'
types.setTypeParser(1700, v => (v === null ? null : parseFloat(v)));        // NUMERIC -> number

// Translate SQLite `?` placeholders to PostgreSQL `$1..$n`.
// Skips single-quoted strings, double-quoted identifiers and dollar-quoted blocks.
function toPgPlaceholders(sql) {
  let out = '';
  let n = 0;
  let inSingle = false;
  let inDouble = false;
  let inDollar = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (inDollar) {
      out += c;
      if (c === '$' && sql[i + 1] === '$') { inDollar = false; out += sql[i + 1]; i++; }
      continue;
    }
    if (inSingle) {
      out += c;
      if (c === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      out += c;
      if (c === '"') inDouble = false;
      continue;
    }
    if (c === "'") { inSingle = true; out += c; }
    else if (c === '"') { inDouble = true; out += c; }
    else if (c === '$' && sql[i + 1] === '$') { inDollar = true; out += c + sql[i + 1]; i++; }
    else if (c === '?') { n += 1; out += `$${n}`; }
    else out += c;
  }
  return out;
}

function prepare(sql) {
  const pgSql = toPgPlaceholders(sql);
  return {
    get: (...params) => pool.query(pgSql, params).then(r => r.rows[0]),
    all: (...params) => pool.query(pgSql, params).then(r => r.rows),
    values: (...params) => pool.query(pgSql, params).then(r => r.rows.map(row => Object.values(row)[0])),
    run: (...params) => pool.query(pgSql, params).then(r => ({ changes: r.rowCount }))
  };
}

const db = {
  prepare,
  get: (sql, ...params) => prepare(sql).get(...params),
  all: (sql, ...params) => prepare(sql).all(...params),
  run: (sql, ...params) => prepare(sql).run(...params),
  pool
};

// Idempotent schema migration — runs server/db/schema_v2.sql
async function migrate() {
  const schemaPath = path.join(__dirname, 'schema_v2.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
}

module.exports = { db, pool, prepare, migrate };