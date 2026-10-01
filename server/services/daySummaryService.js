// Day-handling summary for ingestion runs.
// After an import/sync finishes, this answers the admin's question "how were the
// overlapping days treated?" — for every duty date the batch touched it reports
// whether the derived attendance day was newly built, extended by later punches,
// left unchanged (pure duplicate overlap), protected (manual REGULARIZED edit)
// or still open (waiting for the day's OUT punch). Stored as JSON on
// sync_logs.day_summary and shown in the import-result UI.
const { db } = require('../db/database');
const { resolveDutyDate } = require('./attendanceEngine');

const MAX_DAY_ROWS = 60; // keep the stored JSON bounded

// Collect the punches processed by one run (both newly inserted and
// dedup-ignored, so pure-overlap days are counted too) and classify the
// derived attendance day for each affected employee/date.
async function buildDaySummary({ batchId, duplicatePunches = [], startedAtIso }) {
  const totals = {
    daysTouched: 0,
    staffDayRecords: 0,
    mergedDays: 0,
    duplicateOnlyDays: 0,
    protectedDays: 0,
    openDays: 0,
    newPunches: 0,
    duplicatePunches: duplicatePunches.length
  };

  // Pre-group this run's dedup-ignored punches by biometric id (pure overlap).
  const dupByBio = new Map();
  for (const dp of duplicatePunches) {
    const bio = String(dp.biometricUserId);
    if (!dupByBio.has(bio)) dupByBio.set(bio, []);
    dupByBio.get(bio).push(dp.punchTime);
  }

  // Set-based: fetch every batch-inserted (new) punch in ONE query, grouped in
  // memory. Staff touched = anyone with a freshly-inserted punch PLUS anyone
  // whose punches this run were all dedup-ignored (unchanged days must count).
  const insertedRows = await db.all(
    'SELECT biometric_user_id, punch_time FROM biometric_punches WHERE import_batch = ?', batchId
  );
  const insertedByBio = new Map();
  for (const r of insertedRows) {
    const bio = String(r.biometric_user_id);
    if (!insertedByBio.has(bio)) insertedByBio.set(bio, []);
    insertedByBio.get(bio).push(r.punch_time);
  }
  totals.newPunches = insertedRows.length;

  const allBios = [...new Set([...insertedByBio.keys(), ...dupByBio.keys()])].filter(Boolean);
  if (!allBios.length) {
    return { generatedAt: new Date().toISOString(), totals, days: [], truncated: false };
  }

  // Employees + shifts for the touched staff (batched IN).
  const CH = 500;
  const empRows = [];
  for (let i = 0; i < allBios.length; i += CH) {
    const slice = allBios.slice(i, i + CH);
    const placeholders = slice.map(() => '?').join(',');
    const rows = await db.all(`
      SELECT e.biometric_user_id, e.id AS employee_id, e.full_name,
             s.id AS shift_id, s.start_time, s.end_time, s.duration_hours, s.is_cross_midnight
      FROM employees e
      LEFT JOIN shifts s ON s.id = e.shift_id
      WHERE e.biometric_user_id IN (${placeholders})
    `, ...slice);
    empRows.push(...rows);
  }

  // Derived attendance for the affected employees in ONE batched read (was a
  // query per employee-day). Keyed by `${employee_id}|${duty_date}`.
  const empIds = [...new Set(empRows.map(e => e.employee_id))];
  const attMap = new Map();
  for (let i = 0; i < empIds.length; i += CH) {
    const slice = empIds.slice(i, i + CH);
    const placeholders = slice.map(() => '?').join(',');
    const rows = await db.all(`
      SELECT employee_id, duty_date, status, first_in_time, last_out_time
      FROM attendance_records WHERE employee_id IN (${placeholders})
    `, ...slice);
    for (const a of rows) attMap.set(`${a.employee_id}|${String(a.duty_date).slice(0, 10)}`, a);
  }

  const startedMs = startedAtIso ? new Date(startedAtIso).getTime() : 0; // reserved for future open-day timing checks
  void startedMs;
  const byDate = {};
  const localDay = (iso) => {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  for (const emp of empRows) {
    const bio = String(emp.biometric_user_id);
    // This run's punches = inserted (new) + dedup-ignored (overlap), grouped by
    // logical duty date. No shift config → duty date unresolvable, use local day.
    const runPunches = [
      ...(insertedByBio.get(bio) || []).map(iso => ({ iso, dup: false })),
      ...(dupByBio.get(bio) || []).map(iso => ({ iso, dup: true }))
    ];
    const groups = {};
    for (const { iso, dup } of runPunches) {
      const d = new Date(iso);
      let dd;
      if (emp.shift_id) {
        dd = resolveDutyDate({ id: emp.employee_id }, {
          start_time: emp.start_time, end_time: emp.end_time,
          duration_hours: emp.duration_hours, is_cross_midnight: emp.is_cross_midnight
        }, d);
      } else {
        dd = localDay(iso);
      }
      (groups[dd] = groups[dd] || []).push({ iso, ms: d.getTime(), dup });
    }

    for (const [dutyDate, list] of Object.entries(groups)) {
      const row = byDate[dutyDate] = byDate[dutyDate] || {
        duty_date: dutyDate, employees: 0, new_in: 0, dup: 0,
        minMs: Infinity, maxMs: -Infinity, flags: new Set()
      };
      row.employees += 1;
      row.dup += list.filter(p => p.dup).length;
      row.new_in += list.filter(p => !p.dup).length;
      for (const p of list) { if (p.ms < row.minMs) row.minMs = p.ms; if (p.ms > row.maxMs) row.maxMs = p.ms; }
      totals.staffDayRecords += 1;

      const att = attMap.get(`${emp.employee_id}|${dutyDate}`);
      const hadNew = list.some(p => !p.dup);
      if (att && String(att.status).toUpperCase() === 'REGULARIZED') {
        // Manually regularized day: reported as protected (not counted as merged).
        row.flags.add('protected'); totals.protectedDays += 1; continue;
      }
      if (hadNew) { totals.mergedDays += 1; }
      else { totals.duplicateOnlyDays += 1; }
      // Open day: derived record has no OUT yet (first_in == last_out or null)
      const noOut = !att || !att.last_out_time ||
        new Date(att.last_out_time).getTime() === new Date(att.first_in_time).getTime();
      if (noOut) {
        const inFuture = row.maxMs > Date.now() + 12 * 3600 * 1000; // cross-midnight tolerance
        if (!inFuture) { row.flags.add('open'); totals.openDays += 1; }
      }
    }
  }
  totals.daysTouched = Object.keys(byDate).length;

  const days = Object.values(byDate)
    .sort((a, b) => a.duty_date < b.duty_date ? 1 : -1)
    .slice(0, MAX_DAY_ROWS)
    .map(r => ({
      dutyDate: r.duty_date,
      employees: r.employees,
      newPunches: r.new_in,
      dupPunches: r.dup,
      from: isFinite(r.minMs) ? new Date(r.minMs).toISOString() : null,
      to: isFinite(r.maxMs) ? new Date(r.maxMs).toISOString() : null,
      flags: [...r.flags]
    }));

  return {
    generatedAt: new Date().toISOString(),
    totals,
    days,
    truncated: totals.daysTouched > days.length
  };
}

// Compute + persist the summary for one finished sync run. Best-effort:
// a failure here must never fail the import itself.
async function attachDaySummary(logId, { batchId = logId, duplicatePunches = [], startedAtIso }) {
  try {
    const summary = await buildDaySummary({ batchId, duplicatePunches, startedAtIso });
    await db.run('UPDATE sync_logs SET day_summary = ? WHERE id = ?', JSON.stringify(summary), logId);
    return summary;
  } catch (e) {
    console.error(`[daySummary] failed for run ${logId}: ${e.message}`);
    return null;
  }
}

module.exports = { buildDaySummary, attachDaySummary };
