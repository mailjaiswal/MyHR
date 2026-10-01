// Roster / employee-master importer — the WRITER half of the smart employee ingestion.
// The smart-ingest engine (fileSniffer + smartIngest) turns any messy spreadsheet into
// canonical rows keyed by FIELD_SPEC.key; this service classifies each row (update vs
// create), resolves department/shift names to ids, persists every known column, and — for
// first-time onboarding — can create the employees. It also reports which fields were
// actually captured vs left blank so the admin knows what to fill in manually.
//
// Safety preserved across all versions:
//   • an update NEVER blanks an existing value — only non-empty cells are written;
//   • idempotent — re-applying the same file creates/overwrites nothing new;
//   • a duplicate employee code names its current holder instead of crashing the batch.
const crypto = require('crypto');
const { db } = require('../db/database');
const { defaultShiftId, defaultDepartmentId } = require('./importerHelpers');
const { employeeCodeOrFallback } = require('./employeeCodeService');
const { FIELD_SPEC, byKey, CORE_KEYS, ENRICHMENT_KEYS, STATIC_OPTIONS } = require('./fieldSpec');

function slugId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 10)}`;
}

const COLUMNS = [
  { key: 'biometricUserId', label: 'Biometric ID' },
  { key: 'employeeCode', label: 'Emp Code' },
  { key: 'fullName', label: 'Name' },
  { key: 'designation', label: 'Designation' },
  { key: 'departmentName', label: 'Department' },
  { key: 'shiftName', label: 'Shift' },
  { key: 'status', label: 'Action' }
];

async function resolveDepartment(term) {
  const t = String(term || '').trim();
  if (!t) return null;
  const exact = await db.get('SELECT id, name FROM departments WHERE id = ? OR name ILIKE ? OR code ILIKE ?', t, t, t);
  if (exact) return exact;
  // Loose match so "nursing" finds "Nursing & Care": strip punctuation/ampersands and
  // compare on the remaining word stems ("nursingcare" vs "nursing").
  const norm = (s) => String(s).toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]/g, '');
  const all = await db.all('SELECT id, name FROM departments');
  const needle = norm(t);
  if (!needle) return null;
  return all.find(d => norm(d.name) === needle)
    || all.find(d => norm(d.name).startsWith(needle))
    || all.find(d => norm(d.name).includes(needle))
    || null;
}

async function resolveShift(term) {
  const t = String(term || '').trim();
  if (!t) return null;
  const exact = await db.get('SELECT id, name FROM shifts WHERE id = ? OR name ILIKE ?', t, t);
  if (exact) return exact;
  // Shift rows are labelled like "Night (19:00 - 07:00)" — drop the parenthetical and
  // match on the leading word, so a CSV can simply say "Night".
  const norm = (s) => String(s).toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]/g, '');
  const all = await db.all('SELECT id, name FROM shifts');
  const needle = norm(t);
  if (!needle) return null;
  return all.find(d => norm(d.name) === needle)
    || all.find(d => norm(d.name).startsWith(needle))
    || all.find(d => norm(d.name).includes(needle))
    || null;
}

async function findEmployee(row) {
  if (row.biometricUserId) {
    const e = await db.get('SELECT * FROM employees WHERE biometric_user_id = ?', row.biometricUserId);
    if (e) return e;
  }
  if (row.employeeCode) {
    const e = await db.get('SELECT * FROM employees WHERE employee_code = ?', row.employeeCode);
    if (e) return e;
  }
  if (row.email) {
    const e = await db.get("SELECT * FROM employees WHERE LOWER(email) = LOWER(?) AND status = 'ACTIVE'", row.email);
    if (e) return e;
  }
  return null;
}

// Coerce a canonical value for its field type before writing (empty → '' so callers skip).
function coerce(field, val) {
  if (val === '' || val == null) return '';
  if (field.type === 'number') {
    const n = Number(String(val).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : '';
  }
  const s = String(val).trim();
  return s;
}

// Canonical keys handled by dedicated logic (name split / dept-shift id / matching key),
// so the generic per-column loop below skips them.
const SPECIAL_KEYS = new Set(['fullName', 'firstName', 'lastName', 'department', 'shift', 'biometricUserId', 'employeeCode']);

// Turn a raw (possibly client-built, possibly engine-normalized) row into one that carries
// every FIELD_SPEC key. Tolerant pickup keeps older direct payloads working.
function toCanonical(raw) {
  const at = (...keys) => {
    for (const k of keys) {
      const v = raw[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  };
  const row = {};
  for (const f of FIELD_SPEC) row[f.key] = at(f.key, f.dbCol);
  // A few extra legacy aliases the pre-engine client used.
  row.biometricUserId = row.biometricUserId || at('bioUserId', 'bioId', 'pin', 'userId');
  row.employeeCode = row.employeeCode || at('empCode', 'code');
  row.designation = row.designation || at('title', 'post');
  row.department = row.department || at('departmentName', 'dept');
  row.shift = row.shift || at('shiftName');
  row.mobile = row.mobile || at('phone', 'contact');
  row.baseCtc = row.baseCtc || at('ctc', 'salary');
  row.dateOfJoining = row.dateOfJoining || at('doj');
  row.gender = row.gender || at('sex');
  row.fullName = row.fullName || at('name', 'employeeName');
  if (!row.fullName && (row.firstName || row.lastName)) row.fullName = [row.firstName, row.lastName].filter(Boolean).join(' ');
  return row;
}

// Which enrichment + core fields did each employee row leave blank? Drives the completion
// report + the "please update manually" note. Capped so the payload stays small.
function buildCaptureReport(rows) {
  const coverage = {}; const gaps = {};
  for (const f of FIELD_SPEC) { coverage[f.key] = 0; gaps[f.key] = []; }
  for (const r of rows) {
    const who = r.fullName || r.employeeCode || r.biometricUserId || '(unnamed)';
    for (const f of FIELD_SPEC) {
      if (String(r[f.key] ?? '').trim() !== '') coverage[f.key] += 1;
      else gaps[f.key].push(who);
    }
  }
  const present = rows.length;
  const labelOf = (k) => byKey[k].label;
  const detail = (keys) => keys
    .map(k => ({ key: k, label: labelOf(k), missingCount: gaps[k].length, sampleMissing: gaps[k].slice(0, 25) }))
    .filter(g => g.missingCount > 0)
    .sort((a, b) => b.missingCount - a.missingCount);
  return {
    total: present,
    coverage,
    coreGaps: detail(CORE_KEYS.filter(k => byKey[k].required || byKey[k].group === 'core')),
    enrichmentGaps: detail(ENRICHMENT_KEYS),
    totalCoveragePct: present ? Math.round((Object.values(coverage).reduce((a, b) => a + b, 0) / (present * FIELD_SPEC.length)) * 100) : 0
  };
}

// Classify every row (and, when apply=true, write it). Returns table-ready rows + summary
// + capture report (what was recorded vs left blank).
async function analyzeRoster(rows, { apply = false, onProgress = null } = {}) {
  const out = [];
  const summary = { total: rows.length, willUpdate: 0, willCreate: 0, errors: 0, updated: 0, created: 0 };
  const shiftChangedIds = new Set();
  const touchedIds = new Set();
  const canonicalForReport = [];
  let processed = 0;

  for (const rawIn of rows) {
    processed += 1;
    // Stream live row counts to the shared sync-log so the guided UI can poll /progress.
    if (onProgress && (processed % 25 === 0 || processed === rows.length)) { try { await onProgress(processed); } catch { /* best-effort */ } }
    const row = toCanonical(rawIn);
    canonicalForReport.push(row);

    const preview = {
      biometricUserId: row.biometricUserId || '—',
      employeeCode: row.employeeCode || '—',
      fullName: row.fullName || '—',
      designation: row.designation || '—',
      departmentName: row.department || '—',
      shiftName: row.shift || '—',
      status: ''
    };

    // Silently skip the guidance rows that ship with the master template.
    if (String(row.biometricUserId).startsWith('#') && !row.fullName && !row.employeeCode) continue;

    // Nothing to key on: a roster row must identify an employee somehow.
    if (!row.biometricUserId && !row.employeeCode && !row.email) {
      preview.status = 'Error: no key';
      summary.errors += 1; out.push(preview); continue;
    }

    const dept = await resolveDepartment(row.department);
    const shift = await resolveShift(row.shift);
    if (dept) { preview.departmentName = dept.name; }
    else if (row.department) { preview.departmentName = `${row.department} (unknown)`; }
    if (shift) { preview.shiftName = shift.name; }
    else if (row.shift) { preview.shiftName = `${row.shift} (unknown)`; }

    const emp = await findEmployee(row);

    // Status is only written when it's one of the known enums (a stray word won't corrupt it).
    const statusVal = row.status && STATIC_OPTIONS.statuses.includes(String(row.status).toUpperCase())
      ? String(row.status).toUpperCase() : '';

    if (emp) {
      preview.status = 'Update';
      summary.willUpdate += 1;
      const willChangeShift = shift && shift.id !== emp.shift_id;
      if (willChangeShift) shiftChangedIds.add(emp.id);

      if (apply) {
        const sets = [];
        const params = [];
        const name = row.fullName || [row.firstName, row.lastName].filter(Boolean).join(' ');
        if (name) { sets.push('full_name = ?', 'first_name = ?'); params.push(name, row.firstName || name); if (row.lastName) { sets.push('last_name = ?'); params.push(row.lastName); } }
        if (dept) { sets.push('department_id = ?'); params.push(dept.id); }
        if (shift) { sets.push('shift_id = ?'); params.push(shift.id); }
        if (row.biometricUserId && !emp.biometric_user_id) { sets.push('biometric_user_id = ?'); params.push(row.biometricUserId); }
        if (statusVal) { sets.push('status = ?'); params.push(statusVal); }
        // Every other known column: write only non-empty cells (never blank an existing value).
        for (const f of FIELD_SPEC) {
          if (SPECIAL_KEYS.has(f.key) || !f.dbCol || f.key === 'status') continue;
          const val = coerce(f, row[f.key]);
          if (val === '') continue;
          sets.push(`${f.dbCol} = ?`); params.push(val);
        }
        if (sets.length) {
          params.push(emp.id);
          await db.run(`UPDATE employees SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...params);
        }
        summary.updated += 1;
        touchedIds.add(emp.id);
      }
    } else {
      preview.status = 'New employee';
      summary.willCreate += 1;
      if (apply) {
        if (!row.biometricUserId) {
          preview.status = 'Error: need Bio ID to create';
          summary.willCreate -= 1; summary.errors += 1; out.push(preview); continue;
        }
        const id = slugId('emp', row.biometricUserId);
        const departmentId = (dept && dept.id) || (await defaultDepartmentId());
        const shiftId = (shift && shift.id) || (await defaultShiftId());
        const name = row.fullName || `Staff #${row.biometricUserId}`;
        // Row-level uniqueness guard: a duplicate code names its holder instead of
        // crashing the whole batch with a raw SQL constraint error.
        let code = row.employeeCode || await employeeCodeOrFallback(`IMP-${row.biometricUserId}`);
        let holder = await db.get('SELECT full_name FROM employees WHERE employee_code = ?', code);
        if (holder && code !== `IMP-${row.biometricUserId}`) {
          code = `IMP-${row.biometricUserId}`;
          holder = await db.get('SELECT full_name FROM employees WHERE employee_code = ?', code);
        }
        if (holder) {
          preview.status = `Error: ${code} already assigned to ${holder.full_name}`;
          summary.willCreate -= 1; summary.errors += 1; out.push(preview); continue;
        }
        // Build the INSERT dynamically so every present column (core + enrichment) lands.
        const cols = {
          id, employee_code: code, biometric_user_id: row.biometricUserId, first_name: name, full_name: name,
          designation: row.designation || null, department_id: departmentId, shift_id: shiftId,
          gender: row.gender || 'Other', date_of_joining: row.dateOfJoining || new Date().toISOString().slice(0, 10),
          base_ctc: coerce(byKey.baseCtc, row.baseCtc) || 0, email: row.email || null, mobile: row.mobile || null,
          role: 'EMPLOYEE', status: statusVal || 'ACTIVE'
        };
        if (row.lastName) cols.last_name = row.lastName;
        if (row.firstName) cols.first_name = row.firstName;
        for (const f of FIELD_SPEC) {
          if (SPECIAL_KEYS.has(f.key) || !f.dbCol || cols[f.dbCol] != null) continue;
          const val = coerce(f, row[f.key]);
          if (val !== '') cols[f.dbCol] = val;
        }
        const keys = Object.keys(cols);
        const colList = keys.join(', ');
        const paramList = keys.map(() => '?').join(', ');
        await db.run(`
          INSERT INTO employees (${colList}) VALUES (${paramList})
          ON CONFLICT (id) DO NOTHING
        `, ...keys.map(k => cols[k]));
        summary.created += 1;
        touchedIds.add(id);
        if (shift) shiftChangedIds.add(id);
      }
    }
    out.push(preview);
  }

  return {
    columns: COLUMNS,
    rows: out,
    summary,
    report: buildCaptureReport(canonicalForReport),
    recomputeEmployeeIds: [...(apply ? shiftChangedIds : new Set())],
    touchedIds: [...touchedIds]
  };
}

module.exports = { analyzeRoster, buildCaptureReport, resolveDepartment, resolveShift };
