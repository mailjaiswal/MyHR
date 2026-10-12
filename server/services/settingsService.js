const { db } = require('../db/database');
const config = require('../config');

// Generic company/branding settings. DB row 'org_main' overrides the product
// defaults so every deployment (manufacturing / IT / agency) can re-brand.
const SETTINGS_FIELDS = [
  'name', 'address', 'gstin', 'registration_no', 'contact_person',
  'industry_label', 'tagline', 'director_name', 'director_title',
  'contact_phone', 'contact_email', 'emp_code_prefix', 'emp_code_padding',
  'headcount_band', 'pf_enabled', 'esi_enabled', 'pt_enabled', 'pt_state', 'lwf_enabled',
  'attendance_break_enabled', 'weekly_off_days',
  'terms_accepted_at', 'terms_accepted_by', 'terms_accepted_ip', 'terms_version'
];

function defaultSettings() {
  return {
    name: config.ORGANIZATION.NAME || 'My Company',
    address: config.ORGANIZATION.ADDRESS || '',
    gstin: config.ORGANIZATION.GSTIN || '',
    registration_no: config.ORGANIZATION.REGISTRATION_NO || '',
    contact_person: 'HR Administrator',
    industry_label: 'Workforce',
    tagline: 'Biometric & Payroll Platform',
    director_name: 'Management',
    director_title: 'Managing Director',
    contact_phone: '',
    contact_email: '',
    emp_code_prefix: '',
    emp_code_padding: 4,
    headcount_band: '20_PLUS',
    pf_enabled: 1,
    esi_enabled: 1,
    pt_enabled: 1,
    pt_state: 'MP',
    lwf_enabled: 0,
    attendance_break_enabled: 0,
    weekly_off_days: '0,6',
    terms_accepted_at: null,
    terms_accepted_by: null,
    terms_accepted_ip: null,
    terms_version: '2026.1-CALC-UTILITY'
  };
}

// Organizations/settings are read on almost every request (health, org info,
// engines, branding) but change rarely — a short per-instance TTL cache kills
// a DB round trip on nearly every API call. Writes invalidate immediately.
let settingsCache = null; // { at, value }
const SETTINGS_TTL = 30000;

async function getSettings() {
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL) return { ...settingsCache.value };
  const value = await loadSettings();
  settingsCache = { at: Date.now(), value };
  return { ...value };
}

function invalidateSettings() { settingsCache = null; }

async function loadSettings() {
  const defaults = defaultSettings();
  const row = await db.get('SELECT * FROM organizations WHERE id = ?', 'org_main');
  if (!row) return { ...defaults };

  const out = {};
  for (const f of SETTINGS_FIELDS) {
    const v = row[f];
    out[f] = (v === null || v === undefined) ? defaults[f] : v;
  }
  // Padding must always be a sane integer regardless of what a form stored.
  const pad = parseInt(out.emp_code_padding, 10);
  out.emp_code_padding = Number.isFinite(pad) ? Math.min(6, Math.max(3, pad)) : 4;
  // Weekly-off days are stored as a clean, deduped list of JS weekday numbers (0=Sun…6=Sat).
  out.weekly_off_days = normalizeWeeklyOffDays(out.weekly_off_days);
  out.attendance_break_enabled = (parseInt(out.attendance_break_enabled, 10) === 1) ? 1 : 0;
  return out;
}

// Parse any admin-supplied weekly-off representation into a canonical '0,6' style string.
function normalizeWeeklyOffDays(v) {
  const raw = Array.isArray(v) ? v.join(',') : String(v ?? '');
  const days = [...new Set(raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))]
    .sort((a, b) => a - b);
  return days.length ? days.join(',') : '0,6';
}

async function updateSettings(fields = {}) {
  const cur = (await db.get('SELECT * FROM organizations WHERE id = ?', 'org_main')) || {};
  const next = {};
  for (const f of SETTINGS_FIELDS) {
    if (fields[f] !== undefined) next[f] = String(fields[f] ?? '');
  }

  const merged = { ...cur, ...next, id: 'org_main' };
  const cols = SETTINGS_FIELDS.join(', ');
  const placeholders = SETTINGS_FIELDS.map(() => '?').join(', ');
  const setClause = SETTINGS_FIELDS.map(f => `${f} = excluded.${f}`).join(', ');

  const values = SETTINGS_FIELDS.map(f => {
    const val = merged[f];
    if (f === 'terms_accepted_at') {
      return (val && val !== '') ? val : null;
    }
    if (f === 'attendance_break_enabled') {
      return (val === 1 || val === '1' || val === true || val === 'true') ? 1 : 0;
    }
    if (['pf_enabled', 'esi_enabled', 'pt_enabled', 'lwf_enabled', 'emp_code_padding'].includes(f)) {
      if (val === null || val === undefined || val === '') return f === 'emp_code_padding' ? 4 : 1;
      return parseInt(val, 10);
    }
    return val ?? '';
  });

  await db.run(`
    INSERT INTO organizations (${cols}, id, created_at)
    VALUES (${placeholders}, 'org_main', CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET ${setClause}
  `, ...values);

  invalidateSettings();
  return getSettings();
}

module.exports = {
  SETTINGS_FIELDS,
  defaultSettings,
  getSettings,
  updateSettings,
  invalidateSettings
};