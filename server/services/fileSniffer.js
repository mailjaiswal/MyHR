// Format-agnostic tabular reader. Turns any uploaded roster/punch file — CSV, TSV,
// .xlsx, legacy .xls, or .ods (Google-Sheets export) — into structured sheets that the
// smart-ingest engine can map. Uses SheetJS (xlsx) which reads all of these from a raw
// Buffer; the ATTLOG .dat path is handled separately by attlogImporter, so this module
// is only reached for spreadsheet/text tables.
const XLSX = require('xlsx');

// A cell is "filled" if it is a non-empty string, a number, a Date, or a boolean.
function isFilled(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v === 'number') return true;
  if (typeof v === 'boolean') return true;
  if (v instanceof Date) return !isNaN(v.getTime());
  return String(v).trim() !== '';
}

// Pick the header row: within the first ~15 rows, the one with the most filled cells.
// Falls back to the first non-empty row. Skips stray title/blank rows above a table.
function findHeaderRow(aoa) {
  let best = -1, bestCount = -1;
  const limit = Math.min(aoa.length, 15);
  for (let i = 0; i < limit; i++) {
    const row = aoa[i] || [];
    const count = row.filter(isFilled).length;
    // Header rows are label-like: many filled cells. Require at least 2 columns.
    if (count >= 2 && count > bestCount) { bestCount = count; best = i; }
  }
  if (best === -1) {
    for (let i = 0; i < aoa.length; i++) if ((aoa[i] || []).some(isFilled)) { best = i; break; }
  }
  return best;
}

function sheetNameToFormat(name, fallback) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  if (['xlsx', 'xls', 'ods', 'csv', 'tsv', 'txt'].includes(ext)) return ext;
  return fallback;
}

// Read a Buffer into a workbook and normalize each sheet into { columns, rows }.
// Returns { format, sheets:[{ name, columns:[{index, header, normalized}], rows:[[...cell] ],
//   dataRowCount }], bestSheetIndex }.
function sniff(buffer, fileName) {
  if (!buffer || !buffer.length) throw new Error('Empty file — nothing to read.');

  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, dense: false, raw: false });
  } catch (e) {
    throw new Error(`Could not parse this file as a spreadsheet/table (${e.message}). Supported: CSV, TSV, XLSX, XLS, ODS.`);
  }

  const fallback = sheetNameToFormat(fileName, 'unknown');
  const sheets = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false, raw: true });
    const headerIdx = findHeaderRow(aoa);
    if (headerIdx === -1) { sheets.push({ name, columns: [], rows: [], dataRowCount: 0 }); continue; }

    const headerCells = aoa[headerIdx] || [];
    const columns = headerCells.map((h, index) => {
      const header = String(h ?? '').trim();
      return { index, header, normalized: header.toLowerCase().replace(/[()\[\]{}_.\-:\s]+/g, '') };
    });

    const rows = aoa.slice(headerIdx + 1)
      .map(r => columns.map(c => (r[c.index] ?? '')))           // align each row to the header columns
      .filter(r => r.some(isFilled));                            // drop fully-blank rows

    sheets.push({ name, columns, rows, dataRowCount: rows.length });
  }

  // Best sheet = the one with the most data rows (ties → earlier sheet).
  let bestSheetIndex = 0, bestCount = -1;
  sheets.forEach((s, i) => { if (s.dataRowCount > bestCount) { bestCount = s.dataRowCount; bestSheetIndex = i; } });

  return { format: fallback, sheets, bestSheetIndex, sheetNames: sheets.map(s => s.name) };
}

module.exports = { sniff, isFilled };
