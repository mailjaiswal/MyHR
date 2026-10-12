// Attendance "In / Out" matrix export (.xlsx) — reproduces the client's
// `Employee attendence export format.xls` sheet layout (typos corrected):
//
//   Row 1  : "Employee Attendance In Out Report"            (merged title)
//   Row 2  : "Date : dd/MM/yyyy To dd/MM/yyyy"              (period)
//   Row 3  : headers — Sr No · name · Code · Branch/location · Department ·
//            Designation · Days · <one column per day> · <total columns>
//   Data   : a 9-row block per employee (In Time / Out Time / Status /
//            Break Hour / Duration / Late Hour / Early Hour / OT Duration /
//            Tot Duration). Identity + total cells are merged vertically so
//            they read once per employee.
//
// Data availability rules agreed with the admin:
//   • Break Hour is blank unless `attendance_break_enabled` is on; when on it
//     uses the employee's shift `break_duration_minutes` for present days.
//   • "Total Weekly Off" = days in range with no attendance record whose
//     weekday is in `weekly_off_days` (default Sun + Sat).
const ExcelJS = require('exceljs');

const MAX_DAYS = 62; // guard against a runaway year-long export
const METRIC_ROWS = ['In Time', 'Out Time', 'Status', 'Break Hour', 'Duration', 'Late Hour', 'Early Hour', 'OT Duration', 'Tot Duration'];
const STATUS_CODE = { PRESENT: 'P', OVERTIME: 'OT', HALF_DAY: 'H', ABSENT: 'A', REGULARIZED: 'R', ON_LEAVE: 'L' };
const PRESENT_STATUSES = ['PRESENT', 'OVERTIME', 'REGULARIZED'];

const TOTAL_HEADERS = ['Total Present', 'Total Absent', 'Total Half Days', 'Total Weekly Off',
  'Total Working Hours', 'Break Hours', 'Net Working Hours', 'Late Hours', 'Early Hours', 'OT Day', 'OT Hour'];

// ── formatting helpers ────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');

// A clock time (Asia/Kolkata, 24h) from a Date / ISO string, else ''.
function fmtClock(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
}

// Minutes → "H:MM" (hours may exceed 24 for cumulative durations). '' for null/undefined.
function minutesToHM(mins) {
  if (mins === null || mins === undefined || mins === '') return '';
  const m = Math.round(Number(mins) || 0);
  if (m === 0) return '0:00';
  const sign = m < 0 ? '-' : '';
  const abs = Math.abs(m);
  return `${sign}${Math.floor(abs / 60)}:${pad2(abs % 60)}`;
}

// Minutes → "6d 04:10" style used by the template's Late/Early totals.
function minutesToDayHM(mins) {
  const m = Math.round(Number(mins) || 0);
  if (m === 0) return '0:00';
  const days = Math.floor(m / 1440);
  const rem = m % 1440;
  const hm = `${Math.floor(rem / 60)}:${pad2(rem % 60)}`;
  return days > 0 ? `${days}d ${hm}` : hm;
}

const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const parseDay = (s) => { const [y, m, dd] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, dd); };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Gross "In → Out" span in minutes, tolerant of cross-midnight shifts and a
// missing punch (falls back to the engine's computed total_hours).
function durationMinutes(r) {
  if (r.first_in_time && r.last_out_time) {
    const inD = new Date(r.first_in_time), outD = new Date(r.last_out_time);
    let mins = Math.round((outD - inD) / 60000);
    if (mins < 0) mins += 1440; // crossed midnight
    return mins;
  }
  return Math.round((Number(r.total_hours) || 0) * 60);
}

// Build the inclusive list of day columns for the requested period.
function buildDayColumns(from, to, records) {
  let startStr = from, endStr = to;
  if (!startStr && records.length) startStr = String(records[0].duty_date).slice(0, 10);
  records.forEach(r => { const d = String(r.duty_date).slice(0, 10); if (!startStr || d < startStr) startStr = d; if (!endStr || d > endStr) endStr = d; });
  if (!startStr) { const now = new Date(); startStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`; endStr = dateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)); }
  if (!endStr) endStr = startStr;
  const start = parseDay(startStr), end = parseDay(endStr);
  const days = [];
  for (let d = start; d <= end && days.length < MAX_DAYS + 1; d = addDays(d, 1)) days.push(new Date(d));
  if (days.length > MAX_DAYS) {
    throw new Error(`Date range spans ${days.length} days — the In/Out report supports up to ${MAX_DAYS}. Please narrow the range.`);
  }
  return { days, startStr: String(startStr).slice(0, 10), endStr: String(endStr).slice(0, 10) };
}

/**
 * @param {object[]} records  attendance rows (one per employee-day), pre-sorted by
 *                            employee_code, carrying early_minutes + city + shift break.
 * @param {object} settings   getSettings() result (attendance_break_enabled, weekly_off_days).
 * @param {{from?:string,to?:string}} period  requested date range (YYYY-MM-DD).
 * @returns {Promise<Buffer>} .xlsx bytes.
 */
async function buildAttendanceMatrixXlsx(records, settings = {}, period = {}) {
  const breakEnabled = Number(settings.attendance_break_enabled) === 1;
  const weeklyOffDays = new Set(String(settings.weekly_off_days ?? '0,6').split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n)));

  const { days, startStr, endStr } = buildDayColumns(period.from, period.to, records);

  // Group rows by employee (preserving the query's employee_code order).
  const order = [];
  const byEmp = new Map();
  for (const r of records) {
    const key = r.employee_id ?? r.employee_code;
    if (!byEmp.has(key)) {
      byEmp.set(key, {
        fullName: r.full_name || '', code: r.employee_code || '',
        branch: r.city || '', department: r.department_name || '', designation: r.designation || '',
        days: new Map()
      });
      order.push(key);
    }
    byEmp.get(key).days.set(String(r.duty_date).slice(0, 10), r);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'myHR by Swaniki';
  wb.created = new Date();
  const ws = wb.addWorksheet('Attendance Report', { views: [{ state: 'frozen', xSplit: 7, ySplit: 3 }] });

  // Column layout: 6 identity + 1 "Days" label + N day cols + TOTAL_HEADERS.length totals.
  const ID_COLS = 7;
  const dayColStart = ID_COLS + 1;
  const totalColStart = dayColStart + days.length;
  const lastCol = totalColStart + TOTAL_HEADERS.length - 1;

  const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF7F2' } };
  const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5EFE0' } };
  const THIN = { style: 'thin', color: { argb: 'FFCBD5E1' } };
  const borderAll = { top: THIN, left: THIN, bottom: THIN, right: THIN };

  // Row 1 — title (merged across the whole width).
  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = 'Employee Attendance In Out Report';
  title.font = { bold: true, size: 15 };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 24;

  // Row 2 — period (merged).
  ws.mergeCells(2, 1, 2, lastCol);
  const periodCell = ws.getCell(2, 1);
  const fmtDmy = (s) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
  periodCell.value = `Date : ${fmtDmy(startStr)} To ${fmtDmy(endStr)}`;
  periodCell.font = { bold: true, size: 11 };
  periodCell.alignment = { horizontal: 'left', vertical: 'middle' };

  // Row 3 — header.
  const header = ws.getRow(3);
  const identity = ['Sr No', 'Description / name', 'Code', 'Branch/location', 'Department', 'Designation', 'Days'];
  identity.forEach((h, i) => { header.getCell(i + 1).value = h; });
  days.forEach((d, i) => { header.getCell(dayColStart + i).value = `${d.getDate()}\n${WEEKDAYS[d.getDay()]}`; });
  TOTAL_HEADERS.forEach((h, i) => { header.getCell(totalColStart + i).value = h; });
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 34;
  header.eachCell((c, col) => { c.fill = col >= totalColStart ? TOTAL_FILL : HEADER_FILL; c.border = borderAll; });

  // Column widths.
  [10, 26, 14, 16, 18, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.getColumn(7).width = 14;
  for (let i = 0; i < days.length; i++) ws.getColumn(dayColStart + i).width = 7;
  TOTAL_HEADERS.forEach((h, i) => { ws.getColumn(totalColStart + i).width = Math.max(11, Math.min(16, h.length * 0.7)); });

  // Per-employee blocks.
  let rowIdx = 4;
  order.forEach((key, si) => {
    const emp = byEmp.get(key);
    const blockStart = rowIdx;

    // Per-day metric values first, so totals can reuse the computed minutes.
    let sumDuration = 0, sumLate = 0, sumEarly = 0, sumOt = 0;
    let present = 0, absent = 0, half = 0, weeklyOff = 0, otDays = 0, sumBreak = 0;

    const dayMetrics = days.map((d) => {
      const dk = dateKey(d);
      const r = emp.days.get(dk);
      if (!r) {
        if (weeklyOffDays.has(d.getDay())) weeklyOff += 1;
        return null; // no record → all metric cells blank (weekly-off day marked below)
      }
      const st = r.status;
      if (PRESENT_STATUSES.includes(st)) present += 1;
      else if (st === 'ABSENT') absent += 1;
      else if (st === 'HALF_DAY') half += 1;

      const dur = durationMinutes(r);
      const brk = breakEnabled ? (Number(r.shift_break_minutes) || 0) : 0;
      const late = Number(r.late_minutes) || 0;
      const early = Number(r.early_minutes) || 0;
      const ot = Math.round((Number(r.overtime_hours) || 0) * 60);
      sumDuration += dur; sumLate += late; sumEarly += early; sumOt += ot; sumBreak += brk;
      if (ot > 0) otDays += 1;

      return {
        in: fmtClock(r.first_in_time),
        out: fmtClock(r.last_out_time),
        status: STATUS_CODE[st] || (st || ''),
        break: breakEnabled ? minutesToHM(brk) : '',
        duration: minutesToHM(dur),
        late: minutesToHM(late),
        early: minutesToHM(early),
        ot: minutesToHM(ot),
        totDuration: breakEnabled ? minutesToHM(Math.max(0, dur - brk)) : minutesToHM(dur),
        isWeeklyOff: false
      };
    });

    // Fill the 9 metric rows × day columns.
    for (let mi = 0; mi < METRIC_ROWS.length; mi++) {
      const row = ws.getRow(blockStart + mi);
      row.getCell(7).value = METRIC_ROWS[mi]; // "Days" label column
      row.getCell(7).font = { bold: true, size: 9 };
      row.getCell(7).alignment = { vertical: 'middle' };
      for (let di = 0; di < days.length; di++) {
        const m = dayMetrics[di];
        const cell = row.getCell(dayColStart + di);
        if (!m) {
          if (mi === 2 && weeklyOffDays.has(days[di].getDay())) cell.value = 'W'; // weekly-off marker on Status row
        } else {
          cell.value = m[['in', 'out', 'status', 'break', 'duration', 'late', 'early', 'ot', 'totDuration'][mi]];
        }
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = borderAll;
        cell.font = { size: 9 };
      }
      row.eachCell({ includeEmpty: false }, (c, col) => { if (col < dayColStart) c.border = borderAll; });
    }

    const blockEnd = blockStart + METRIC_ROWS.length - 1;

    // Identity columns, merged vertically across the block.
    const idVals = [String(si + 1), emp.fullName, emp.code, emp.branch, emp.department, emp.designation];
    idVals.forEach((val, ci) => {
      ws.mergeCells(blockStart, ci + 1, blockEnd, ci + 1);
      const c = ws.getCell(blockStart, ci + 1);
      c.value = val;
      c.alignment = { vertical: 'middle', horizontal: ci === 0 ? 'center' : 'left', wrapText: true };
      c.font = { size: 9, bold: ci === 1 };
      for (let rr = blockStart; rr <= blockEnd; rr++) ws.getCell(rr, ci + 1).border = borderAll;
    });

    // Totals, merged vertically across the block.
    const netWorking = breakEnabled ? Math.max(0, sumDuration - sumBreak) : sumDuration;
    const totals = [
      present, absent, half, weeklyOff,
      minutesToHM(sumDuration),
      breakEnabled ? minutesToHM(sumBreak) : '',
      minutesToHM(netWorking),
      minutesToDayHM(sumLate), minutesToDayHM(sumEarly),
      otDays, minutesToHM(sumOt)
    ];
    totals.forEach((val, ti) => {
      const col = totalColStart + ti;
      ws.mergeCells(blockStart, col, blockEnd, col);
      const c = ws.getCell(blockStart, col);
      c.value = val === '' ? '' : val;
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.font = { size: 9, bold: true };
      for (let rr = blockStart; rr <= blockEnd; rr++) { ws.getCell(rr, col).border = borderAll; ws.getCell(rr, col).fill = TOTAL_FILL; }
    });

    rowIdx = blockEnd + 1;
  });

  if (!order.length) {
    ws.mergeCells(4, 1, 4, lastCol);
    ws.getCell(4, 1).value = 'No attendance records found for the selected filters / period.';
    ws.getCell(4, 1).alignment = { horizontal: 'center' };
    ws.getCell(4, 1).font = { italic: true, color: { argb: 'FF64748B' } };
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

module.exports = { buildAttendanceMatrixXlsx, MAX_DAYS };
