// Prepopulated, gap-highlighted Employee Master (.xlsx) — the "give me my current data,
// tell me what's missing, let me fix it and upload it straight back" export.
//
// Written with exceljs (SheetJS can't do fills + dropdown data-validation). Three sheets:
//   • Employees           — one row per ACTIVE employee, current values filled in; every
//                            still-blank cell gets an amber fill; required headers a red tone;
//                            Department/Shift/Gender/Employment-Type/Status/Verify get live
//                            dropdowns so re-uploaded values always map cleanly.
//   • Complete These Fields — per-employee list of the required + enrichment fields still
//                            missing, plus a coverage summary line up top.
//   • Reference           — valid department & shift names, the dropdown source ranges, and
//                            the legend + "edit in place & re-upload" instruction.
//
// The whole file is generated from FIELD_SPEC so the template columns, the ingestion engine
// and the completion report can never drift apart.
const ExcelJS = require('exceljs');
const { db } = require('../db/database');
const { FIELD_SPEC, STATIC_OPTIONS } = require('./fieldSpec');

const AMBER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };   // please fill
const CORE_HDR = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2E1' } }; // required-ish
const ENR_HDR = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FF' } };  // enrichment
const THIN = { style: 'thin', color: { argb: 'FFCBD5E1' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const asOfDate = (v) => (v instanceof Date ? v : (v ? new Date(String(v)) : null));

// Map a DB employee row → { fieldKey: printableValue } (department/shift resolved to names).
function employeeToValues(emp, deptById, shiftById) {
  const v = {};
  for (const f of FIELD_SPEC) {
    if (f.key === 'department') { v[f.key] = (deptById[emp.department_id] || {}).name || ''; continue; }
    if (f.key === 'shift') { v[f.key] = (shiftById[emp.shift_id] || {}).name || ''; continue; }
    if (!f.dbCol) { v[f.key] = ''; continue; }
    const raw = emp[f.dbCol];
    v[f.key] = raw === null || raw === undefined ? '' : String(raw);
  }
  return v;
}

// select-fields pull their dropdown values from the Reference sheet ranges (computed below).
function selectSourceColumns() {
  // Reference layout: A=Departments, B=Shifts, C=Genders, D=Employment Types, E=Status, F=Verify modes
  return {
    departments: { col: 'A', label: 'Department' },
    shifts: { col: 'B', label: 'Shift' },
    genders: { col: 'C', label: 'Gender' },
    employmentTypes: { col: 'D', label: 'Employment Type' },
    statuses: { col: 'E', label: 'Status' },
    verifyModes: { col: 'F', label: 'Verify Mode' }
  };
}

async function buildPrefilledTemplate() {
  const employees = await db.all(`SELECT * FROM employees WHERE status = 'ACTIVE' ORDER BY full_name NULLS LAST, employee_code`);
  const departments = await db.all('SELECT id, name FROM departments ORDER BY name');
  const shifts = await db.all('SELECT id, name FROM shifts ORDER BY name');
  const deptById = Object.fromEntries(departments.map(d => [d.id, d]));
  const shiftById = Object.fromEntries(shifts.map(s => [s.id, s]));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'myHR';
  wb.created = new Date();

  // ── Reference sheet (built first so the Employees dropdowns can point at its ranges) ──
  const ref = wb.addWorksheet('Reference');
  const SRC = selectSourceColumns();
  ref.getCell('A1').value = 'Departments'; ref.getCell('B1').value = 'Shifts'; ref.getCell('C1').value = 'Gender';
  ref.getCell('D1').value = 'Employment Type'; ref.getCell('E1').value = 'Status'; ref.getCell('F1').value = 'Verify Mode';
  departments.forEach((d, i) => { ref.getCell(`A${i + 2}`).value = d.name; });
  shifts.forEach((s, i) => { ref.getCell(`B${i + 2}`).value = s.name; });
  STATIC_OPTIONS.genders.forEach((g, i) => { ref.getCell(`C${i + 2}`).value = g; });
  STATIC_OPTIONS.employmentTypes.forEach((t, i) => { ref.getCell(`D${i + 2}`).value = t; });
  STATIC_OPTIONS.statuses.forEach((s, i) => { ref.getCell(`E${i + 2}`).value = s; });
  STATIC_OPTIONS.verifyModes.forEach((m, i) => { ref.getCell(`F${i + 2}`).value = m; });
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach(c => { ref.getColumn(c).width = 24; });
  ['A1', 'B1', 'C1', 'D1', 'E1', 'F1'].forEach(c => { ref.getCell(c).font = { bold: true }; });

  const legendRow = 2;
  const lastUsedRow = Math.max(departments.length, shifts.length) + 2;
  ref.getCell(`H${legendRow}`).value = 'LEGEND'; ref.getCell(`H${legendRow}`).font = { bold: true };
  ref.getCell(`H${legendRow + 1}`).value = 'Amber cell = detail still missing for that employee — please fill it.';
  ref.getCell(`H${legendRow + 2}`).value = 'Red header = identity / required field. Blue header = enrichment field.';
  ref.getCell(`H${legendRow + 3}`).value = 'This is YOUR CURRENT DATA. Edit in place and re-upload it in Data Sources → Employee / Roster Master.';
  ref.getCell(`H${legendRow + 4}`).value = 'Do not change the Biometric ID or Employee Code columns — they are how rows are matched back.';
  ref.getCell(`H${legendRow + 1}`).fill = AMBER;
  ref.getColumn('H').width = 90;

  const rangeFor = (colLetter, count) => count > 0
    ? `'Reference'!$${colLetter}$2:$${colLetter}$${count + 1}`
    : null;

  // ── Employees sheet ────────────────────────────────────────────────────
  const ws = wb.addWorksheet('Employees', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
  ws.columns = FIELD_SPEC.map(f => ({ header: f.label + (f.required ? ' *' : ''), key: f.key, width: Math.max(14, Math.min(30, f.label.length + 6)) }));
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 28;
  FIELD_SPEC.forEach((f, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.fill = f.group === 'core' ? CORE_HDR : ENR_HDR;
    cell.border = BORDER;
  });

  const colIndexOf = {}; FIELD_SPEC.forEach((f, i) => { colIndexOf[f.key] = i + 1; });
  const optionsFor = (key) => {
    const f = FIELD_SPEC.find(x => x.key === key);
    if (!f || f.type !== 'select') return null;
    if (f.optionsSource === 'departments') return { count: departments.length, col: SRC.departments.col };
    if (f.optionsSource === 'shifts') return { count: shifts.length, col: SRC.shifts.col };
    if (f.optionsSource === 'genders') return { count: STATIC_OPTIONS.genders.length, col: SRC.genders.col };
    if (f.optionsSource === 'employmentTypes') return { count: STATIC_OPTIONS.employmentTypes.length, col: SRC.employmentTypes.col };
    if (f.optionsSource === 'statuses') return { count: STATIC_OPTIONS.statuses.length, col: SRC.statuses.col };
    if (f.optionsSource === 'verifyModes') return { count: STATIC_OPTIONS.verifyModes.length, col: SRC.verifyModes.col };
    return null;
  };

  const selectFields = FIELD_SPEC.filter(f => f.type === 'select');
  employees.forEach((emp, r) => {
    const values = employeeToValues(emp, deptById, shiftById);
    const excelRow = ws.getRow(r + 2);
    FIELD_SPEC.forEach((f, i) => {
      const cell = excelRow.getCell(i + 1);
      const raw = values[f.key];
      const filled = String(raw || '').trim() !== '';
      if (filled) {
        if (f.type === 'date') { const d = asOfDate(raw); if (d && !isNaN(d.getTime())) { cell.value = d; cell.numFmt = 'yyyy-mm-dd'; } else cell.value = raw; }
        else if (f.type === 'number') { const n = Number(String(raw).replace(/[^0-9.\-]/g, '')); cell.value = Number.isFinite(n) ? n : raw; }
        else cell.value = raw;
      } else {
        cell.fill = AMBER; // the gap we want the admin to close
      }
      cell.border = BORDER;
    });
    excelRow.commit && excelRow.commit();
  });

  // Apply dropdowns to every data cell of the select columns (blank cells included so a
  // freshly-filled value is always a valid option).
  if (employees.length) {
    const lastRow = employees.length + 1;
    for (const f of selectFields) {
      const opt = optionsFor(f.key);
      if (!opt) continue;
      const formula = rangeFor(opt.col, opt.count);
      if (!formula) continue;
      const col = colIndexOf[f.key];
      for (let r = 2; r <= lastRow; r++) {
        ws.getCell(r, col).dataValidation = { type: 'list', allowBlank: true, formula };
      }
    }
  }

  // ── "Complete These Fields" sheet (the actionable gap list) ─────────────
  const gap = wb.addWorksheet('Complete These Fields');
  const gapHeader = gap.getRow(1);
  gapHeader.values = ['Employee', 'Biometric ID', 'Employee Code', 'Missing required', 'Missing enrichment', 'Gaps'];
  gapHeader.font = { bold: true };
  gapHeader.eachCell(c => { c.fill = ENR_HDR; c.border = BORDER; });
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach(c => { gap.getColumn(c).width = c === 'D' || c === 'E' ? 42 : 20; });

  const coverage = {}; FIELD_SPEC.forEach(f => { coverage[f.key] = 0; });
  let gapRowIndex = 2;
  const gapRows = [];
  employees.forEach((emp) => {
    const values = employeeToValues(emp, deptById, shiftById);
    const missCore = [];
    const missEnr = [];
    for (const f of FIELD_SPEC) {
      if (String(values[f.key] || '').trim() !== '') coverage[f.key] += 1;
      if (f.key === 'biometricUserId') continue; // can't fix a missing device id from here
      if (String(values[f.key] || '').trim() === '') (f.group === 'core' ? missCore : missEnr).push(f.label);
    }
    if (missCore.length || missEnr.length) gapRows.push({ emp, missCore, missEnr });
  });
  gapRows.forEach(({ emp, missCore, missEnr }) => {
    const row = gap.getRow(gapRowIndex++);
    row.values = [
      emp.full_name || emp.first_name || '', emp.biometric_user_id || '', emp.employee_code || '',
      missCore.join(', '), missEnr.join(', '), missCore.length + missEnr.length
    ];
    row.eachCell(c => { c.border = BORDER; c.alignment = { wrapText: true, vertical: 'top' }; });
    if (missCore.length) row.getCell(4).fill = CORE_HDR;
    if (missEnr.length) row.getCell(5).fill = AMBER;
  });
  if (!gapRows.length) {
    gap.getRow(2).getCell(1).value = 'All tracked fields are complete for every active employee. 🎉';
  }
  // Coverage summary written at the top of a short block under the table.
  const sumStart = gapRowIndex + 1;
  gap.getCell(`A${sumStart}`).value = `Coverage across ${employees.length} active employee(s):`;
  gap.getCell(`A${sumStart}`).font = { bold: true };
  FIELD_SPEC.forEach((f, i) => {
    const rr = sumStart + 1 + i;
    gap.getCell(`A${rr}`).value = f.label;
    gap.getCell(`B${rr}`).value = `${coverage[f.key]} / ${employees.length}`;
    if (coverage[f.key] < employees.length) gap.getCell(`B${rr}`).fill = AMBER;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

module.exports = { buildPrefilledTemplate };
