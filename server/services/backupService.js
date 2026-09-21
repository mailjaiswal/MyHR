// server/services/backupService.js
// Disaster-recovery backups. Produces a portable logical SQL dump of the whole
// `public` schema (Supabase/Postgres), uploads it to a private Supabase Storage
// bucket, and records metadata in the `backups` table. Restores are replayed in
// a single transaction with FK/triggers deferred. Never assumes `pg_dump`/disk
// availability, so it works inside Vercel serverless.

const crypto = require('crypto');
const { db, pool } = require('../db/database');

const EXCLUDED_TABLES = new Set(['backups']); // don't dump the backup ledger itself
const CHUNK = 1000; // rows per SELECT page

// ── Configuration ────────────────────────────────────────────────────────────
async function getBackupConfig() {
  const s = await db.get(`SELECT backup_enabled, backup_retention_count FROM notification_settings WHERE id = 'main'`);
  let retention = parseInt(s && s.backup_retention_count, 10);
  if (!Number.isFinite(retention) || retention < 1) retention = 14;
  return {
    url: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    bucket: process.env.BACKUP_BUCKET || 'myhr-backups',
    enabled: !s || Number(s.backup_enabled ?? 1) === 1,
    retention
  };
}

function storageConfigured(cfg) {
  return Boolean(cfg.url && cfg.key && cfg.bucket);
}

// ── SQL literal helpers ──────────────────────────────────────────────────────
function sqlIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (Buffer.isBuffer(v)) return `'\\x${v.toString('hex')}'`;
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Array.isArray(v) || typeof v === 'object') {
    return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

// ── Table discovery + FK-safe ordering (parents first) ───────────────────────
async function orderedTables() {
  const rows = await db.all(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );
  const tables = rows.map(r => r.tablename).filter(t => !EXCLUDED_TABLES.has(t));
  const set = new Set(tables);

  // Edges: child depends on parent.
  let edges = [];
  try {
    edges = await db.all(`
      SELECT tc.table_name AS child, ccu.table_name AS parent
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public' AND ccu.table_schema = 'public'
    `);
  } catch { edges = []; }

  const parents = {}; // child -> Set(parents)
  for (const e of edges) {
    if (!set.has(e.child) || !set.has(e.parent)) continue;
    if (e.child === e.parent) continue; // self-ref handled by deferred FKs
    (parents[e.child] = parents[e.child] || new Set()).add(e.parent);
  }

  const ordered = [];
  const placed = new Set();
  const visit = (t, stack) => {
    if (placed.has(t) || stack.has(t)) return; // already done or cycle -> break
    stack.add(t);
    for (const p of (parents[t] || [])) visit(p, stack);
    stack.delete(t);
    if (!placed.has(t)) { ordered.push(t); placed.add(t); }
  };
  for (const t of tables) visit(t, new Set());
  return ordered; // any leftovers are appended by the traversal
}

// ── Build the dump ────────────────────────────────────────────────────────────
async function buildDump() {
  const tables = await orderedTables();
  const counts = {};
  const parts = [];
  const stamp = new Date().toISOString();
  parts.push(`-- myHR logical backup\n-- generated ${stamp}\nBEGIN;`);
  // Defer FK/triggers so insert order and self/mutual references never conflict.
  parts.push(`SET LOCAL session_replication_role = replica;`);

  if (tables.length) {
    const trunc = tables.map(t => `public.${sqlIdent(t)}`).join(', ');
    parts.push(`TRUNCATE TABLE ${trunc} RESTART IDENTITY CASCADE;`);
  }

  for (const t of tables) {
    const cols = await db.all(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ? ORDER BY ordinal_position`, t
    );
    if (!cols.length) { counts[t] = 0; continue; }
    const colNames = cols.map(c => c.column_name);
    const colList = colNames.map(sqlIdent).join(', ');
    parts.push(`-- table ${t}`);
    let offset = 0;
    let total = 0;
    for (;;) {
      const rows = await db.all(`SELECT * FROM public.${sqlIdent(t)} LIMIT ? OFFSET ?`, CHUNK, offset);
      if (!rows.length) break;
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const values = batch.map(r => `(${colNames.map(c => sqlValue(r[c])).join(', ')})`).join(',\n');
        parts.push(`INSERT INTO public.${sqlIdent(t)} (${colList}) VALUES\n${values};`);
      }
      total += rows.length;
      if (rows.length < CHUNK) break;
      offset += CHUNK;
    }
    counts[t] = total;
  }

  parts.push(`COMMIT;`);
  return { sql: parts.join('\n') + '\n', counts };
}

// ── Supabase Storage I/O (global fetch, Node 18+) ────────────────────────────
async function storageUpload(cfg, key, body) {
  const res = await fetch(`${cfg.url}/storage/v1/object/${cfg.bucket}/${key}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      apikey: cfg.key,
      'content-type': 'application/sql',
      'x-upsert': 'true'
    },
    body
  });
  if (!res.ok) throw new Error(`Storage upload failed (${res.status}): ${await res.text()}`);
}

async function storageDownload(cfg, key) {
  const res = await fetch(`${cfg.url}/storage/v1/object/${cfg.bucket}/${key}`, {
    headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key }
  });
  if (!res.ok) throw new Error(`Storage download failed (${res.status}): ${await res.text()}`);
  return res.text();
}

async function storageDelete(cfg, key) {
  try {
    await fetch(`${cfg.url}/storage/v1/object/${cfg.bucket}/${key}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key }
    });
  } catch { /* best effort */ }
}

function backupKey(kind, id) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  return `myhr/backup_${ts}_${kind.toLowerCase()}_${id}.sql`;
}

// ── Run a backup ──────────────────────────────────────────────────────────────
async function runBackup(kind = 'AUTO', actorId = null) {
  const cfg = await getBackupConfig();
  const id = crypto.randomUUID();
  const row = { id, kind, status: 'PENDING', size_bytes: 0 };
  if (!storageConfigured(cfg)) {
    const msg = 'Backups not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (and optionally BACKUP_BUCKET).';
    await db.run(
      `INSERT INTO backups (id, kind, status, error, created_by) VALUES (?, ?, 'FAILED', ?, ?)`,
      id, kind, msg, actorId
    );
    return { id, kind, status: 'FAILED', error: msg };
  }
  try {
    const { sql, counts } = await buildDump();
    const key = backupKey(kind, id);
    await storageUpload(cfg, key, sql);
    const size = Buffer.byteLength(sql, 'utf8');
    await db.run(
      `INSERT INTO backups (id, kind, status, storage_path, bucket, size_bytes, table_counts, created_by)
       VALUES (?, ?, 'SUCCESS', ?, ?, ?, ?::jsonb, ?)`,
      id, kind, key, cfg.bucket, size, JSON.stringify(counts), actorId
    );
    return { id, kind, status: 'SUCCESS', size_bytes: size, tables: Object.keys(counts).length };
  } catch (e) {
    await db.run(
      `INSERT INTO backups (id, kind, status, error, created_by) VALUES (?, ?, 'FAILED', ?, ?)`,
      id, kind, String(e.message || e).slice(0, 2000), actorId
    );
    return { id, kind, status: 'FAILED', error: String(e.message || e) };
  }
}

async function listBackups(limit = 50) {
  const rows = await db.all(`SELECT * FROM backups ORDER BY ts DESC LIMIT ?`, Math.min(limit, 200));
  const counts = await db.get(`
    SELECT COUNT(*) FILTER (WHERE status = 'SUCCESS') AS ok,
           COUNT(*) FILTER (WHERE status = 'FAILED') AS failed
    FROM backups
  `);
  return { entries: rows, counts: { ok: Number(counts?.ok || 0), failed: Number(counts?.failed || 0) } };
}

async function getBackup(id) {
  return db.get(`SELECT * FROM backups WHERE id = ?`, id);
}

async function downloadBackup(id) {
  const b = await getBackup(id);
  if (!b) { const e = new Error('Backup not found'); e.code = 404; throw e; }
  if (!b.storage_path) { const e = new Error('This backup has no stored file'); e.code = 404; throw e; }
  const cfg = await getBackupConfig();
  if (!storageConfigured(cfg)) throw new Error('Storage not configured');
  return { backup: b, sql: await storageDownload(cfg, b.storage_path) };
}

// ── Restore (guarded) ───────────────────────────────────────────────────────
async function restoreBackup(id) {
  const b = await getBackup(id);
  if (!b) { const e = new Error('Backup not found'); e.code = 404; throw e; }
  if (!b.storage_path) { const e = new Error('This backup has no stored file'); e.code = 404; throw e; }
  const cfg = await getBackupConfig();
  if (!storageConfigured(cfg)) throw new Error('Storage not configured');
  const sql = await storageDownload(cfg, b.storage_path);
  const client = await pool.connect();
  try {
    // Multi-statement simple query; the dump manages its own BEGIN/COMMIT.
    await client.query(sql);
    return { restored: true, from: id, ts: b.ts };
  } catch (e) {
    const msg = `Restore failed: ${e.message}. You can restore manually with: psql "$DATABASE_URL" < downloaded_backup.sql`;
    throw new Error(msg);
  } finally {
    client.release();
  }
}

// ── Retention pruning ────────────────────────────────────────────────────────
async function pruneBackups() {
  const cfg = await getBackupConfig();
  const keep = Number.isFinite(cfg.retention) ? cfg.retention : 14;
  const stale = await db.all(
    `SELECT id, storage_path FROM backups WHERE status = 'SUCCESS'
     ORDER BY ts DESC OFFSET ?`, keep
  );
  for (const s of stale) {
    if (s.storage_path && storageConfigured(cfg)) await storageDelete(cfg, s.storage_path);
    await db.run(`DELETE FROM backups WHERE id = ?`, s.id);
  }
  return { removed: stale.length, keep };
}

module.exports = {
  getBackupConfig,
  runBackup,
  listBackups,
  getBackup,
  downloadBackup,
  restoreBackup,
  pruneBackups
};
