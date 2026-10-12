// server/services/backupService.js
// Disaster-recovery backups. Produces a portable logical SQL dump (optionally
// scoped to the data categories the client opted into) and pushes it to the
// CLIENT'S OWN S3-compatible bucket — AWS S3, Cloudflare R2, MinIO, Backblaze
// B2, Wasabi, or a Supabase Storage bucket they created. We deliberately do
// NOT keep copies on our servers; the platform's own SUPABASE_* env is only a
// legacy fallback when the client hasn't supplied storage yet. Restores are
// replayed in a single transaction with FK/triggers deferred. Never assumes
// `pg_dump`/disk availability, so it works inside Vercel serverless.

const crypto = require('crypto');
const { db, pool } = require('../db/database');

const EXCLUDED_TABLES = new Set(['backups']); // don't dump the backup ledger itself
const CHUNK = 1000; // rows per SELECT page

// ── Data categories the client can opt in/out of, per their demand ──────────
// Every dump always includes the app "brain" (org, roles, rules, shifts,
// notification settings) — a backup without them can't be restored into a
// working product. The toggles only ever REMOVE tables from the scope.
const CATEGORIES = [
  { key: 'employee_info', label: 'Employee information', desc: 'Profiles, personal details, roles, department & shift mapping.', tables: ['employees', 'employee_personal_details', 'employee_shifts', 'departments', 'roles'] },
  { key: 'biometric', label: 'Biometric & attendance data', desc: 'Raw device punches, daily attendance and corrections.', tables: ['devices', 'biometric_punches', 'attendance_records', 'attendance_corrections'] },
  { key: 'payroll', label: 'Payslips & payroll', desc: 'Payroll runs and every generated payslip.', tables: ['payroll_runs', 'payslips'] },
  { key: 'leave_holidays', label: 'Leave & holiday records', desc: 'Leave types, balances, requests and the holiday calendar.', tables: ['leave_types', 'leave_balances', 'leave_requests', 'holidays', 'ot_policy'] },
  { key: 'documents', label: 'Employee documents', desc: 'Uploaded document records and metadata.', tables: ['employee_documents'] },
  { key: 'emails', label: 'Offer letters & email history', desc: 'Offer-letter / notification templates and the sent-mail log.', tables: ['email_templates', 'email_outbox'] },
  { key: 'audit', label: 'Audit trail', desc: 'Who-did-what log and sync history.', tables: ['audit_logs', 'data_sources', 'sync_logs'] },
];
const CORE_TABLES = ['organizations', 'shifts', 'notification_settings'];

// ── Credential encryption at rest (AES-256-GCM, key derived from JWT_SECRET) ─
function encKey() {
  return crypto.createHash('sha256').update(String(process.env.JWT_SECRET || 'myhr-dev-fallback-key')).digest();
}
function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('hex')}:${enc.toString('hex')}:${cipher.getAuthTag().toString('hex')}`;
}
function decryptSecret(stored) {
  const s = String(stored || '');
  if (!s.startsWith('v1:')) return s; // plaintext written before encryption existed
  try {
    const [, ivHex, dataHex, tagHex] = s.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch { return ''; } // wrong key (env rotated) — treat as "re-enter credential"
}

// ── Configuration ────────────────────────────────────────────────────────────
async function getBackupConfig() {
  const s = await db.get(`SELECT * FROM notification_settings WHERE id = 'main'`);
  let retention = parseInt(s && s.backup_retention_count, 10);
  if (!Number.isFinite(retention) || retention < 1) retention = 14;
  let categories = null;
  try { categories = s.backup_categories_json ? JSON.parse(s.backup_categories_json) : null; } catch { categories = null; }
  if (!Array.isArray(categories)) categories = CATEGORIES.map(c => c.key);
  const endpoint = (s && s.backup_storage_endpoint || '').trim();
  const accessKey = (s && s.backup_storage_access_key || '').trim();
  const bucket = (s && s.backup_storage_bucket || '').trim();
  const secret = decryptSecret(s && s.backup_storage_secret_enc);
  // Client-owned S3-compatible storage takes priority over platform Supabase env.
  const s3 = Boolean(endpoint && bucket && accessKey && secret);
  return {
    url: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    bucket: process.env.BACKUP_BUCKET || 'myhr-backups',
    enabled: !s || Number(s.backup_enabled ?? 1) === 1,
    retention,
    categories,
    target: s3 ? 's3' : (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? 'supabase' : 'none'),
    s3config: { endpoint, region: (s && s.backup_storage_region || '').trim() || 'us-east-1', bucket, accessKey, secret }
  };
}

// Which DB tables the opted-in categories map to (intersected with what
// actually exists in the schema by orderedTables()). Null categories => all.
function scopeTables(categories) {
  const allowed = new Set(CORE_TABLES);
  const list = Array.isArray(categories) ? categories : CATEGORIES.map(c => c.key);
  for (const c of CATEGORIES) {
    if (list.includes(c.key)) for (const t of c.tables) allowed.add(t);
  }
  return allowed;
}

function storageConfigured(cfg) {
  return cfg.target !== 'none';
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
async function orderedTables(scope = null) {
  const rows = await db.all(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );
  let tables = rows.map(r => r.tablename).filter(t => !EXCLUDED_TABLES.has(t));
  if (scope) tables = tables.filter(t => scope.has(t));
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
async function buildDump(categories) {
  const scope = scopeTables(categories);
  const tables = await orderedTables(scope);
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

// ── Storage I/O — client S3-compatible bucket (SigV4) or Supabase fallback ──
function storageBucket(cfg) {
  return cfg.target === 's3' ? cfg.s3config.bucket : cfg.bucket;
}

function sha256hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
function hmacBuf(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

// AWS Signature V4 for a single PUT/GET/DELETE with the full payload hashed.
// Path-style addressing works against S3, R2, MinIO, B2, Wasabi, i.e. any
// endpoint that speaks the S3 wire protocol.
function signRequest({ method, endpointUrl, region, accessKey, secretKey, keyPath, payload }) {
  const u = new URL(endpointUrl);
  const host = u.host;
  const canonUri = u.pathname; // already URL-encoded below
  const bodyBuf = payload == null ? Buffer.alloc(0) : Buffer.from(payload);
  const payloadHash = sha256hex(bodyBuf);
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const dateStamp = amzDate.slice(0, 8);

  const q = [...u.searchParams.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)])
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
    .map(([k, v]) => `${k}=${v}`).join('&');

  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const signedHeaderNames = Object.keys(headers).sort();
  const canonHeaders = signedHeaderNames.map((h) => `${h}:${headers[h].trim()}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');

  const canonReq = [method, canonUri, q, canonHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonReq)].join('\n');
  const kDate = hmacBuf(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacBuf(kDate, region);
  const kService = hmacBuf(kRegion, 's3');
  const kSigning = hmacBuf(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  headers['Authorization'] =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

function s3ObjectUrl(sc, key) {
  const base = sc.endpoint.replace(/\/+$/, '');
  return `${base}/${sc.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

async function s3Request(cfg, method, key, body) {
  const sc = cfg.s3config;
  const url = s3ObjectUrl(sc, key);
  const headers = signRequest({
    method, endpointUrl: url, region: sc.region, accessKey: sc.accessKey, secretKey: sc.secret,
    keyPath: key, payload: method === 'PUT' ? body : null
  });
  const res = await fetch(url, { method, headers, body: method === 'PUT' ? body : undefined });
  if (!res.ok) throw new Error(`Storage ${method} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return res;
}

async function storageUpload(cfg, key, body) {
  if (cfg.target === 's3') { await s3Request(cfg, 'PUT', key, body); return; }
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
  if (cfg.target === 's3') return (await s3Request(cfg, 'GET', key)).text();
  const res = await fetch(`${cfg.url}/storage/v1/object/${cfg.bucket}/${key}`, {
    headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key }
  });
  if (!res.ok) throw new Error(`Storage download failed (${res.status}): ${await res.text()}`);
  return res.text();
}

async function storageDelete(cfg, key) {
  try {
    if (cfg.target === 's3') { await s3Request(cfg, 'DELETE', key); return; }
    await fetch(`${cfg.url}/storage/v1/object/${cfg.bucket}/${key}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key }
    });
  } catch { /* best effort */ }
}

// Round-trip probe against the client's bucket: write → read → delete.
async function testStorage(sc) {
  const cfg = { target: 's3', s3config: sc, url: '', key: '', bucket: sc.bucket };
  const probeKey = `myhr/connection_test_${Date.now()}.txt`;
  const marker = `myhr-backup-connection-test ${new Date().toISOString()}`;
  await storageUpload(cfg, probeKey, marker);
  const read = await storageDownload(cfg, probeKey);
  await storageDelete(cfg, probeKey);
  if (!read.includes('myhr-backup-connection-test')) throw new Error('Uploaded object content did not match on read-back.');
  return { ok: true, bucket: sc.bucket, endpoint: sc.endpoint };
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
  if (!storageConfigured(cfg)) {
    const msg = 'No backup destination yet: add your own cloud storage credentials (any S3-compatible bucket) under Backup storage below, and we will deliver daily dumps there.';
    await db.run(
      `INSERT INTO backups (id, kind, status, error, created_by) VALUES (?, ?, 'FAILED', ?, ?)`,
      id, kind, msg, actorId
    );
    return { id, kind, status: 'FAILED', error: msg };
  }
  try {
    const { sql, counts } = await buildDump(cfg.categories);
    const key = backupKey(kind, id);
    await storageUpload(cfg, key, sql);
    const size = Buffer.byteLength(sql, 'utf8');
    await db.run(
      `INSERT INTO backups (id, kind, status, storage_path, bucket, size_bytes, table_counts, created_by)
       VALUES (?, ?, 'SUCCESS', ?, ?, ?, ?::jsonb, ?)`,
      id, kind, key, storageBucket(cfg), size, JSON.stringify(counts), actorId
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
  CATEGORIES,
  getBackupConfig,
  encryptSecret,
  testStorage,
  storageConfigured,
  storageBucket,
  runBackup,
  listBackups,
  getBackup,
  downloadBackup,
  restoreBackup,
  pruneBackups
};
