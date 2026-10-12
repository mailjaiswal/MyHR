// server/routes/rules.js
// Rules Center APIs — per-company policy overrides surfaced in the Admin Panel
// "Rules" section (PagarGuru-style). Reads return BOTH the effective values
// (DB override ?? shipped default) and what is explicitly stored, so the UI can
// show "Default (15)" vs a custom number. Money-critical engines consume these
// via the rulesService snapshot, refreshed on every write.
const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/authGuard');
const { accessGuard, requirePerm } = require('../middleware/accessGuard');
const { audit } = require('../services/auditService');
const rulesService = require('../services/rulesService');

router.use(requireAuth, accessGuard, requirePerm('SETTINGS_VIEW'));

// --- helper: org_main must always exist for rule UPDATEs ---
async function ensureOrgRow() {
  await db.run(`INSERT INTO organizations (id, name) VALUES ('org_main', 'My Company') ON CONFLICT (id) DO NOTHING`);
}

async function getStoredRules() {
  return (await db.get(`SELECT * FROM organizations WHERE id = 'org_main'`)) || {};
}

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ===================== ATTENDANCE RULES =====================
const ATTENDANCE_COLS = ['late_grace_minutes', 'half_day_min_hours', 'full_day_min_hours'];

router.get('/attendance', async (req, res) => {
  try {
    await rulesService.ensureFresh();
    const stored = await getStoredRules();
    const eff = rulesService.getRules().attendance;
    const def = rulesService.shippedDefaults().attendance;
    return res.json({
      success: true,
      effective: {
        late_grace_minutes: eff.GRACE_PERIOD_MINUTES,
        half_day_min_hours: eff.HALF_DAY_MIN_HOURS,
        full_day_min_hours: eff.FULL_DAY_MIN_HOURS
      },
      defaults: {
        late_grace_minutes: def.GRACE_PERIOD_MINUTES,
        half_day_min_hours: def.HALF_DAY_MIN_HOURS,
        full_day_min_hours: def.FULL_DAY_MIN_HOURS
      },
      stored: {
        late_grace_minutes: stored.late_grace_minutes ?? null,
        half_day_min_hours: stored.half_day_min_hours ?? null,
        full_day_min_hours: stored.full_day_min_hours ?? null
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/attendance', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const b = req.body || {};
    await ensureOrgRow();
    const sets = [];
    const params = [];
    for (const col of ATTENDANCE_COLS) {
      if (b[col] === undefined) continue; // field not touched
      const v = toNum(b[col]);
      sets.push(`${col} = ?`);
      params.push(v); // null clears the override => shipped default applies
    }
    if (!sets.length) return res.status(400).json({ error: 'No valid rule fields provided' });
    await db.run(`UPDATE organizations SET ${sets.join(', ')} WHERE id = 'org_main'`, ...params);
    rulesService.invalidate();
    await rulesService.refresh(true);

    await audit(req, 'rules.attendance_update', {
      entityType: 'rules', entityId: 'attendance',
      summary: `Attendance rules updated (${sets.length} field(s))`,
      details: { changed: b }
    });
    return res.json({ success: true, message: 'Attendance rules updated' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ===================== OVERTIME POLICY (ot_policy) =====================
const OT_DEFAULTS = {
  name: 'Standard Overtime Policy',
  tier1_threshold_hours: 8.0,
  tier2_threshold_hours: 12.0,
  tier1_multiplier: 1.5,
  tier2_multiplier: 2.0,
  weekend_multiplier: 2.0,
  holiday_multiplier: 2.0,
  night_allowance_multiplier: 1.0
};

router.get('/overtime', async (req, res) => {
  try {
    const policy = await db.get('SELECT * FROM ot_policy ORDER BY created_at ASC LIMIT 1');
    return res.json({ success: true, policy: policy || { ...OT_DEFAULTS, id: null } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/overtime', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || OT_DEFAULTS.name).trim();
    const vals = {
      tier1_threshold_hours: toNum(b.tier1_threshold_hours) ?? OT_DEFAULTS.tier1_threshold_hours,
      tier2_threshold_hours: toNum(b.tier2_threshold_hours) ?? OT_DEFAULTS.tier2_threshold_hours,
      tier1_multiplier: toNum(b.tier1_multiplier) ?? OT_DEFAULTS.tier1_multiplier,
      tier2_multiplier: toNum(b.tier2_multiplier) ?? OT_DEFAULTS.tier2_multiplier,
      weekend_multiplier: toNum(b.weekend_multiplier) ?? OT_DEFAULTS.weekend_multiplier,
      holiday_multiplier: toNum(b.holiday_multiplier) ?? OT_DEFAULTS.holiday_multiplier,
      night_allowance_multiplier: toNum(b.night_allowance_multiplier) ?? OT_DEFAULTS.night_allowance_multiplier
    };
    if (vals.tier2_threshold_hours < vals.tier1_threshold_hours) {
      return res.status(400).json({ error: 'Tier-2 threshold cannot be lower than tier-1 threshold' });
    }
    for (const k of ['tier1_multiplier', 'tier2_multiplier', 'weekend_multiplier', 'holiday_multiplier', 'night_allowance_multiplier']) {
      if (vals[k] < 1) return res.status(400).json({ error: `${k} must be at least 1.0` });
    }

    const existing = await db.get('SELECT id FROM ot_policy ORDER BY created_at ASC LIMIT 1');
    if (existing) {
      await db.run(`UPDATE ot_policy SET name = ?, tier1_threshold_hours = ?, tier2_threshold_hours = ?,
        tier1_multiplier = ?, tier2_multiplier = ?, weekend_multiplier = ?, holiday_multiplier = ?,
        night_allowance_multiplier = ? WHERE id = ?`,
        name, vals.tier1_threshold_hours, vals.tier2_threshold_hours, vals.tier1_multiplier,
        vals.tier2_multiplier, vals.weekend_multiplier, vals.holiday_multiplier,
        vals.night_allowance_multiplier, existing.id);
    } else {
      const id = `ot_${Date.now()}`;
      await db.run(`INSERT INTO ot_policy (id, name, tier1_threshold_hours, tier2_threshold_hours,
        tier1_multiplier, tier2_multiplier, weekend_multiplier, holiday_multiplier, night_allowance_multiplier, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        id, name, vals.tier1_threshold_hours, vals.tier2_threshold_hours, vals.tier1_multiplier,
        vals.tier2_multiplier, vals.weekend_multiplier, vals.holiday_multiplier, vals.night_allowance_multiplier);
    }
    rulesService.invalidate();
    await rulesService.refresh(true);

    await audit(req, 'rules.overtime_update', {
      entityType: 'rules', entityId: 'ot_policy',
      summary: `Overtime policy updated — tier1 ${vals.tier1_multiplier}x after ${vals.tier1_threshold_hours}h`,
      details: { ...vals, name }
    });
    return res.json({ success: true, message: 'Overtime policy updated' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ===================== HOLIDAY CALENDAR =====================
const HOLIDAY_TYPES = ['PUBLIC', 'COMPANY', 'REGIONAL'];

router.get('/holidays', async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10);
    let sql = 'SELECT * FROM holidays';
    const params = [];
    if (Number.isFinite(year)) {
      sql += ' WHERE holiday_date >= ? AND holiday_date <= ?';
      params.push(`${year}-01-01`, `${year}-12-31`);
    }
    sql += ' ORDER BY holiday_date ASC';
    const holidays = await db.all(sql, ...params);
    return res.json({ success: true, holidays });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/holidays', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    const date = String(b.holiday_date || '').slice(0, 10);
    const type = HOLIDAY_TYPES.includes(b.holiday_type) ? b.holiday_type : 'PUBLIC';
    if (!name) return res.status(400).json({ error: 'Holiday name is required' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'holiday_date must be YYYY-MM-DD' });

    const clash = await db.get('SELECT id FROM holidays WHERE holiday_date = ? AND LOWER(name) = LOWER(?)', date, name);
    if (clash) return res.status(409).json({ error: 'A holiday with this name already exists on that date' });

    const id = `hol_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await db.run(
      `INSERT INTO holidays (id, name, holiday_date, is_regional, region, holiday_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id, name, date, b.is_regional ? 1 : 0,
      b.is_regional ? String(b.region || '').trim() || null : null, type
    );
    await audit(req, 'rules.holiday_create', {
      entityType: 'holiday', entityId: id,
      summary: `Holiday '${name}' added on ${date} (${type})`,
      details: { name, date, type, region: b.region || null }
    });
    const created = await db.get('SELECT * FROM holidays WHERE id = ?', id);
    return res.status(201).json({ success: true, holiday: created });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/holidays/:id', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const existing = await db.get('SELECT * FROM holidays WHERE id = ?', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Holiday not found' });
    const b = req.body || {};
    const name = b.name !== undefined ? String(b.name).trim() : existing.name;
    const date = b.holiday_date !== undefined ? String(b.holiday_date).slice(0, 10) : String(existing.holiday_date).slice(0, 10);
    const type = HOLIDAY_TYPES.includes(b.holiday_type) ? b.holiday_type : existing.holiday_type;
    if (!name) return res.status(400).json({ error: 'Holiday name is required' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'holiday_date must be YYYY-MM-DD' });

    await db.run(
      `UPDATE holidays SET name = ?, holiday_date = ?, holiday_type = ?, is_regional = ?, region = ? WHERE id = ?`,
      name, date, type, b.is_regional ? 1 : 0,
      b.is_regional ? String(b.region || '').trim() || null : null, req.params.id
    );
    await audit(req, 'rules.holiday_update', {
      entityType: 'holiday', entityId: req.params.id,
      summary: `Holiday '${name}' (${date}) updated`,
      details: { before: { name: existing.name, date: String(existing.holiday_date).slice(0, 10), type: existing.holiday_type }, after: { name, date, type } }
    });
    const updated = await db.get('SELECT * FROM holidays WHERE id = ?', req.params.id);
    return res.json({ success: true, holiday: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/holidays/:id', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const existing = await db.get('SELECT * FROM holidays WHERE id = ?', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Holiday not found' });
    await db.run('DELETE FROM holidays WHERE id = ?', req.params.id);
    await audit(req, 'rules.holiday_delete', {
      entityType: 'holiday', entityId: req.params.id,
      summary: `Holiday '${existing.name}' (${String(existing.holiday_date).slice(0, 10)}) removed`,
      details: { name: existing.name, date: String(existing.holiday_date).slice(0, 10) }
    });
    return res.json({ success: true, message: 'Holiday removed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ===================== STATUTORY RATES =====================
const STAT_COLS = ['epf_employee_rate', 'epf_employer_rate', 'epf_wage_ceiling', 'esic_employee_rate', 'esic_employer_rate', 'esic_wage_limit'];

router.get('/statutory', async (req, res) => {
  try {
    await rulesService.ensureFresh();
    const stored = await getStoredRules();
    const eff = rulesService.getRules().statutory;
    const def = rulesService.shippedDefaults().statutory;
    const shape = (s) => ({
      epf_employee_rate: s.EPF_EMPLOYEE_RATE, epf_employer_rate: s.EPF_EMPLOYER_RATE, epf_wage_ceiling: s.EPF_WAGE_CEILING,
      esic_employee_rate: s.ESIC_EMPLOYEE_RATE, esic_employer_rate: s.ESIC_EMPLOYER_RATE, esic_wage_limit: s.ESIC_WAGE_LIMIT,
      pt_slabs: s.MP_PT_SLABS.map(x => ({ ...x, maxGross: x.maxGross === Infinity ? null : x.maxGross }))
    });
    return res.json({
      success: true,
      effective: shape(eff),
      defaults: shape(def),
      stored: Object.fromEntries(STAT_COLS.map(c => [c, stored[c] ?? null]))
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/statutory', requirePerm('SETTINGS_EDIT'), async (req, res) => {
  try {
    const b = req.body || {};
    await ensureOrgRow();
    const sets = [];
    const params = [];
    for (const col of STAT_COLS) {
      if (b[col] === undefined) continue;
      const v = toNum(b[col]);
      if (v !== null && (v < 0 || v > 1)) {
        if (col.endsWith('_rate')) return res.status(400).json({ error: `${col} must be a fraction between 0 and 1 (e.g. 0.12 for 12%)` });
      }
      sets.push(`${col} = ?`);
      params.push(v);
    }
    if (b.pt_slabs !== undefined) {
      if (b.pt_slabs === null || (Array.isArray(b.pt_slabs) && b.pt_slabs.length === 0)) {
        sets.push('pt_slabs_json = ?'); params.push(null);
      } else if (Array.isArray(b.pt_slabs)) {
        let prevMax = 0;
        const clean = b.pt_slabs.map((s) => {
          const minGross = Number(s.minGross ?? prevMax);
          const maxGross = (s.maxGross === null || s.maxGross === undefined || s.maxGross === '') ? Infinity : Number(s.maxGross);
          const slab = { minGross, maxGross, tax: Number(s.tax ?? 0) };
          prevMax = Number.isFinite(maxGross) ? maxGross + 1 : Infinity;
          return slab;
        });
        if (clean.some(s => !Number.isFinite(s.minGross) || !Number.isFinite(s.tax) || s.tax < 0)) {
          return res.status(400).json({ error: 'Each PT slab needs a numeric maxGross and a non-negative tax' });
        }
        sets.push('pt_slabs_json = ?');
        params.push(JSON.stringify(clean));
      } else {
        return res.status(400).json({ error: 'pt_slabs must be an array' });
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'No valid statutory fields provided' });
    await db.run(`UPDATE organizations SET ${sets.join(', ')} WHERE id = 'org_main'`, ...params);
    rulesService.invalidate();
    await rulesService.refresh(true);

    await audit(req, 'rules.statutory_update', {
      entityType: 'rules', entityId: 'statutory',
      summary: `Statutory rates updated (${sets.length} field(s))`,
      details: { changed: b }
    });
    return res.json({ success: true, message: 'Statutory rules updated' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
