// The deterministic "smart ingestion engine": maps arbitrary messy column headers onto
// the canonical FIELD_SPEC, normalizes each value (dates, gender, phone, salary, names),
// and reports which fields were captured vs left blank. No external model / no network —
// pure, repeatable heuristics (safe for payroll data and keeps employee info on-box).
const { FIELD_SPEC, byKey, CORE_KEYS, ENRICHMENT_KEYS } = require('./fieldSpec');

// ── text helpers ────────────────────────────────────────────────────────
const normHeader = (s) => String(s ?? '').toLowerCase().replace(/[()\[\]{}_.\-:\s]+/g, '');

// Levenshtein ratio in [0,1] — 1.0 identical. Bounded (short headers), so O(n·m) is fine.
function similarity(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const row = [i];
    for (let j = 1; j <= n; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  const dist = prev[n];
  return 1 - dist / Math.max(m, n);
}

// Score one normalized header against one field spec.
function scoreHeader(headerNorm, field) {
  if (!headerNorm) return 0;
  if (field.aliases.includes(headerNorm)) return 1;
  let best = 0;
  for (const syn of field.synonyms) {
    if (headerNorm === syn) best = Math.max(best, 0.95);
    else if (headerNorm.includes(syn) || syn.includes(headerNorm)) best = Math.max(best, 0.8);
    else best = Math.max(best, similarity(headerNorm, syn) >= 0.82 ? 0.65 : 0);
  }
  // exact label match is a strong signal too
  const labelNorm = normHeader(field.label);
  if (headerNorm === labelNorm) best = Math.max(best, 0.98);
  return best;
}

// Greedy best-match mapping with conflict resolution (each column serves one field).
// Returns { fieldKey: { column, header, confidence } } (confidence high|medium|low) and
// the columns that matched nothing (so the admin sees what was ignored).
function mapColumns(columns) {
  const pairs = [];
  for (const field of FIELD_SPEC) {
    for (const col of columns) {
      if (!col.normalized) continue;
      const score = scoreHeader(col.normalized, field);
      if (score >= 0.6) pairs.push({ field: field.key, column: col.index, header: col.header, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const fieldToCol = {}; const usedCol = new Set();
  for (const p of pairs) {
    if (fieldToCol[p.field] || usedCol.has(p.column)) continue; // one col ↔ one field, best first
    fieldToCol[p.field] = p; usedCol.add(p.column);
  }
  const mapping = {};
  for (const field of FIELD_SPEC) {
    const hit = fieldToCol[field.key];
    mapping[field.key] = hit
      ? { column: hit.column, header: hit.header, confidence: hit.score >= 0.9 ? 'high' : hit.score >= 0.75 ? 'medium' : 'low' }
      : { column: null, header: null, confidence: 'none' };
  }
  const unmappedColumns = columns.filter(c => c.header && !usedCol.has(c.index)).map(c => ({ index: c.index, header: c.header }));
  return { mapping, unmappedColumns };
}

// ── value normalization ─────────────────────────────────────────────────
function titleCase(s) {
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/(^|[\s\-/])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

function normalizeGender(v) {
  const t = String(v).trim().toLowerCase();
  if (/^(m|male|boy|M\b)/.test(t) || t === 'male') return 'Male';
  if (/^f/.test(t) || t === 'female' || t === 'woman') return 'Female';
  if (t) return 'Other';
  return '';
}

// Accept Date objects (SheetJS cellDates), ISO, DD/MM/YYYY (Indian-first), DD-MM-YYYY,
// MM/DD/YYYY, "D MMM YYYY", with optional time. Return 'YYYY-MM-DD' or '' if unparsable.
function normalizeDate(v) {
  if (v === '' || v == null) return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  if (!s) return '';
  // ISO first (YYYY-MM-DD or YYYY/MM/DD, optional time)
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;
  // D[M]M[/ -]YYYY[...] — day-first by default (Indian format)
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/.exec(s);
  if (m) {
    let d = +m[1], mo = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    // If the "month" slot is >12 the file is month-first; otherwise trust day-first.
    if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return '';
  }
  // "DD Mon YYYY" / "Mon DD, YYYY"
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  return '';
}

function normalizeNumber(v) {
  if (v === '' || v == null) return '';
  if (typeof v === 'number') return String(v);
  const cleaned = String(v).replace(/[^0-9.\-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : '';
}

function normalizePhone(v) {
  if (v === '' || v == null) return '';
  const digits = String(v).replace(/[^\d+]/g, '');
  return digits.replace(/(?!^\+)\D/g, '');
}

function normalizeEmail(v) {
  return String(v ?? '').trim().toLowerCase();
}

// Normalize one raw cell for a given field spec.
function normalizeValue(field, raw) {
  if (raw === '' || raw == null) return '';
  switch (field.type) {
    case 'name': return titleCase(String(raw));
    case 'gender': return normalizeGender(raw);
    case 'date': return normalizeDate(raw);
    case 'number': return normalizeNumber(raw);
    case 'phone': return normalizePhone(raw);
    case 'email': return normalizeEmail(raw);
    case 'select': return String(raw).trim();
    default: return String(raw).trim();
  }
}

// Turn a sniffed sheet + a (possibly admin-corrected) mapping into canonical rows keyed
// by FIELD_SPEC.key. Also composes fullName from first+last when only parts are given.
function buildEmployeeRows(sheet, mapping) {
  const fields = FIELD_SPEC;
  const rows = [];
  for (const cellArr of sheet.rows) {
    const rec = {};
    for (const f of fields) {
      const col = mapping[f.key]?.column;
      rec[f.key] = (col == null) ? '' : normalizeValue(f, cellArr[col]);
    }
    if (!rec.fullName && (rec.firstName || rec.lastName)) {
      rec.fullName = titleCase([rec.firstName, rec.lastName].filter(Boolean).join(' '));
    }
    // Drop rows that identify nobody, and template guidance/comment rows (whose first
    // filled cell starts with '#', a '#', or is a single '#') regardless of column order.
    const idt = rec.biometricUserId || rec.employeeCode || rec.email || rec.fullName;
    if (!idt) continue;
    const firstFilled = (cellArr.find(c => String(c ?? '').trim() !== '') || '');
    if (String(firstFilled).trim().startsWith('#')) continue;
    if (String(rec.biometricUserId).startsWith('#')) continue;
    // Biometric ID is matched as text — keep it verbatim (only trimmed by normalizeValue).
    rows.push(rec);
  }
  return rows;
}

// Per-field "how many rows actually carried a value" — feeds the capture report.
function fieldCoverage(rows) {
  const coverage = {};
  for (const f of FIELD_SPEC) coverage[f.key] = 0;
  for (const r of rows) for (const f of FIELD_SPEC) if (r[f.key]) coverage[f.key] += 1;
  return { coverage, total: rows.length };
}

module.exports = { normHeader, similarity, scoreHeader, mapColumns, normalizeValue, normalizeDate, buildEmployeeRows, fieldCoverage, CORE_KEYS, ENRICHMENT_KEYS };
