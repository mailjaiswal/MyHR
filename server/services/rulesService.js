// server/services/rulesService.js
// Rules Center: per-company policy overrides for attendance + statutory math.
// Engines (attendanceEngine / payrollEngine) are synchronous deep in the call
// stack, so they read a module-level SNAPSHOT via getRules(); async entry
// points (route/engine heads) call ensureFresh() first. config.js remains the
// fallback for anything the company hasn't overridden (NULL columns).
const { db } = require('../db/database');
const config = require('../config');

const TTL_MS = 30000; // one extra organizations read per instance per 30s

function shippedDefaults() {
  return {
    attendance: {
      GRACE_PERIOD_MINUTES: config.ATTENDANCE_RULES.GRACE_PERIOD_MINUTES ?? 15,
      HALF_DAY_MIN_HOURS: config.ATTENDANCE_RULES.HALF_DAY_MIN_HOURS ?? 3.45,
      FULL_DAY_MIN_HOURS: config.ATTENDANCE_RULES.FULL_DAY_MIN_HOURS ?? 7.45,
      OVERTIME_MULTIPLIER: config.ATTENDANCE_RULES.OVERTIME_MULTIPLIER ?? 1.5
    },
    statutory: {
      EPF_EMPLOYEE_RATE: config.STATUTORY_RULES.EPF_EMPLOYEE_RATE ?? 0.12,
      EPF_EMPLOYER_RATE: config.STATUTORY_RULES.EPF_EMPLOYER_RATE ?? 0.12,
      EPF_WAGE_CEILING: config.STATUTORY_RULES.EPF_WAGE_CEILING ?? 15000,
      ESIC_EMPLOYEE_RATE: config.STATUTORY_RULES.ESIC_EMPLOYEE_RATE ?? 0.0075,
      ESIC_EMPLOYER_RATE: config.STATUTORY_RULES.ESIC_EMPLOYER_RATE ?? 0.0325,
      ESIC_WAGE_LIMIT: config.STATUTORY_RULES.ESIC_WAGE_LIMIT ?? 21000,
      MP_PT_SLABS: (config.STATUTORY_RULES.MP_PT_SLABS || []).map(s => ({ ...s }))
    }
  };
}

// '' / null / undefined => fall back to the shipped default.
function num(v, fallback) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

let snapshot = shippedDefaults();
let fetchedAt = 0;

async function refresh(force = false) {
  if (!force && Date.now() - fetchedAt < TTL_MS) return snapshot;
  const defaults = shippedDefaults();
  try {
    const row = await db.get(
      `SELECT late_grace_minutes, half_day_min_hours, full_day_min_hours,
              epf_employee_rate, epf_employer_rate, epf_wage_ceiling,
              esic_employee_rate, esic_employer_rate, esic_wage_limit, pt_slabs_json
       FROM organizations WHERE id = 'org_main'`
    );
    if (row) {
      defaults.attendance.GRACE_PERIOD_MINUTES = num(row.late_grace_minutes, defaults.attendance.GRACE_PERIOD_MINUTES);
      defaults.attendance.HALF_DAY_MIN_HOURS = num(row.half_day_min_hours, defaults.attendance.HALF_DAY_MIN_HOURS);
      defaults.attendance.FULL_DAY_MIN_HOURS = num(row.full_day_min_hours, defaults.attendance.FULL_DAY_MIN_HOURS);

      defaults.statutory.EPF_EMPLOYEE_RATE = num(row.epf_employee_rate, defaults.statutory.EPF_EMPLOYEE_RATE);
      defaults.statutory.EPF_EMPLOYER_RATE = num(row.epf_employer_rate, defaults.statutory.EPF_EMPLOYER_RATE);
      defaults.statutory.EPF_WAGE_CEILING = num(row.epf_wage_ceiling, defaults.statutory.EPF_WAGE_CEILING);
      defaults.statutory.ESIC_EMPLOYEE_RATE = num(row.esic_employee_rate, defaults.statutory.ESIC_EMPLOYEE_RATE);
      defaults.statutory.ESIC_EMPLOYER_RATE = num(row.esic_employer_rate, defaults.statutory.ESIC_EMPLOYER_RATE);
      defaults.statutory.ESIC_WAGE_LIMIT = num(row.esic_wage_limit, defaults.statutory.ESIC_WAGE_LIMIT);

      if (row.pt_slabs_json) {
        try {
          const slabs = JSON.parse(row.pt_slabs_json);
          if (Array.isArray(slabs) && slabs.length) {
            defaults.statutory.MP_PT_SLABS = slabs.map(s => ({
              minGross: Number(s.minGross ?? 0),
              maxGross: (s.maxGross === null || s.maxGross === undefined || s.maxGross === Infinity) ? Infinity : Number(s.maxGross),
              tax: Number(s.tax ?? 0)
            }));
          }
        } catch { /* keep defaults on malformed JSON */ }
      }
    }

    // Overtime rate single-source: the ot_policy row wins over config default.
    const ot = await db.get(`SELECT tier1_multiplier FROM ot_policy ORDER BY created_at ASC LIMIT 1`);
    if (ot) defaults.attendance.OVERTIME_MULTIPLIER = num(ot.tier1_multiplier, defaults.attendance.OVERTIME_MULTIPLIER);
  } catch (err) {
    // Never break money/attendance math on a lookup failure — defaults stand.
    console.warn('[rulesService] refresh failed, using shipped defaults:', err.message);
  }
  snapshot = defaults;
  fetchedAt = Date.now();
  return snapshot;
}

function getRules() {
  return snapshot;
}

// Engine/route heads await this before computing; TTL-collapses to a no-op
// for warm instances so it is cheap on every request.
async function ensureFresh() {
  if (Date.now() - fetchedAt >= TTL_MS) await refresh();
}

function invalidate() {
  fetchedAt = 0;
  snapshot = shippedDefaults();
}

module.exports = { getRules, refresh, ensureFresh, invalidate, shippedDefaults };
