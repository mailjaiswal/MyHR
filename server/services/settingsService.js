const { db } = require('../db/database');
const config = require('../config');

// Generic company/branding settings. DB row 'org_main' overrides the product
// defaults so every deployment (manufacturing / IT / agency) can re-brand.
const SETTINGS_FIELDS = [
  'name', 'address', 'gstin', 'registration_no', 'contact_person',
  'industry_label', 'tagline', 'director_name', 'director_title',
  'contact_phone', 'contact_email'
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
    contact_email: ''
  };
}

async function getSettings() {
  const defaults = defaultSettings();
  const row = await db.get('SELECT * FROM organizations WHERE id = ?', 'org_main');
  if (!row) return { ...defaults };

  const out = {};
  for (const f of SETTINGS_FIELDS) {
    const v = row[f];
    out[f] = (v === null || v === undefined || String(v).trim() === '') ? defaults[f] : v;
  }
  return out;
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
  await db.run(`
    INSERT INTO organizations (${cols}, id, created_at)
    VALUES (${placeholders}, 'org_main', CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET ${setClause}
  `, ...SETTINGS_FIELDS.map(f => merged[f] ?? ''));

  return getSettings();
}

module.exports = {
  SETTINGS_FIELDS,
  defaultSettings,
  getSettings,
  updateSettings
};