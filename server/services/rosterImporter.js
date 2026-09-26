// Roster / employee-name CSV importer.
// Biometric punch files carry only numeric user IDs, so auto-created staff show up as
// "Staff #NN". This service lets an admin upload a small CSV to attach real names,
// designations, department, shift, salary, etc. to those employees — matched on the
// biometric user id (or employee code / email). Rows that don't match an existing
// employee can optionally be created so a later punch import links to them.
//
// The client parses the CSV into canonical rows and calls analyzeRoster twice:
//   analyzeRoster(rows, { apply:false }) → preview (classify each row, resolve dept/shift)
//   analyzeRoster(rows, { apply:true })  → write, and report which employees need a
//                                           recompute (their shift changed).
const crypto = require('crypto');
const { db } = require('../db/database');
const { defaultShiftId, defaultDepartmentId } = require('./importerHelpers');

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

// Classify every row (and, when apply=true, write it). Returns table-ready rows + summary.
async function analyzeRoster(rows, { apply = false } = {}) {
  const out = [];
  const summary = { total: rows.length, willUpdate: 0, willCreate: 0, errors: 0, updated: 0, created: 0 };
  const shiftChangedIds = new Set();
  const touchedIds = new Set();

  for (const raw of rows) {
    // Tolerant field pickup, so a slightly different client / hand-built payload still lands.
    const at = (...keys) => {
      for (const k of keys) {
        const v = raw[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
      }
      return '';
    };
    const row = {
      biometricUserId: at('biometricUserId', 'biometric_user_id', 'bioUserId', 'bioId', 'pin', 'userId'),
      employeeCode: at('employeeCode', 'employee_code', 'empCode', 'code'),
      fullName: at('fullName', 'full_name', 'name', 'employeeName'),
      designation: at('designation', 'title', 'post'),
      department: at('department', 'departmentName', 'department_name', 'dept'),
      shift: at('shift', 'shiftName', 'shift_name'),
      email: at('email'),
      mobile: at('mobile', 'phone', 'contact'),
      baseCtc: at('baseCtc', 'base_ctc', 'ctc', 'salary'),
      dateOfJoining: at('dateOfJoining', 'date_of_joining', 'doj'),
      gender: at('gender', 'sex')
    };

    const preview = {
      biometricUserId: row.biometricUserId || '—',
      employeeCode: row.employeeCode || '—',
      fullName: row.fullName || '—',
      designation: row.designation || '—',
      departmentName: row.department || '—',
      shiftName: row.shift || '—',
      status: ''
    };

    // Nothing to key on: a roster row must identify an employee somehow.
    if (!row.biometricUserId && !row.employeeCode && !row.email) {
      preview.status = 'Error: no key';
      summary.errors += 1; out.push(preview); continue;
    }

    const dept = await resolveDepartment(row.department);
    const shift = await resolveShift(row.shift);
    // Show what will actually be written (the canonical setup name), and flag misses.
    if (dept) { preview.departmentName = dept.name; }
    else if (row.department) { preview.departmentName = `${row.department} (unknown)`; }
    if (shift) { preview.shiftName = shift.name; }
    else if (row.shift) { preview.shiftName = `${row.shift} (unknown)`; }

    const emp = await findEmployee(row);

    if (emp) {
      preview.status = 'Update';
      summary.willUpdate += 1;
      const willChangeShift = shift && shift.id !== emp.shift_id;
      if (willChangeShift) shiftChangedIds.add(emp.id);

      if (apply) {
        const sets = [];
        const params = [];
        if (row.fullName) { sets.push('full_name = ?', 'first_name = ?'); params.push(row.fullName, row.fullName); }
        if (row.designation) { sets.push('designation = ?'); params.push(row.designation); }
        if (dept) { sets.push('department_id = ?'); params.push(dept.id); }
        if (shift) { sets.push('shift_id = ?'); params.push(shift.id); }
        if (row.email) { sets.push('email = ?'); params.push(row.email); }
        if (row.mobile) { sets.push('mobile = ?'); params.push(row.mobile); }
        if (row.baseCtc && !Number.isNaN(Number(row.baseCtc))) { sets.push('base_ctc = ?'); params.push(Number(row.baseCtc)); }
        if (row.dateOfJoining) { sets.push('date_of_joining = ?'); params.push(row.dateOfJoining); }
        if (row.gender) { sets.push('gender = ?'); params.push(row.gender); }
        if (row.biometricUserId && !emp.biometric_user_id) { sets.push('biometric_user_id = ?'); params.push(row.biometricUserId); }
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
        const code = row.employeeCode || `IMP-${row.biometricUserId}`;
        await db.run(`
          INSERT INTO employees (id, employee_code, biometric_user_id, first_name, full_name, designation, department_id, shift_id, gender, date_of_joining, base_ctc, email, mobile, role, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EMPLOYEE', 'ACTIVE')
          ON CONFLICT (id) DO NOTHING
        `, id, code, row.biometricUserId, name, name, row.designation || null, departmentId, shiftId,
          row.gender || 'Other', row.dateOfJoining || new Date().toISOString().slice(0, 10),
          (row.baseCtc && !Number.isNaN(Number(row.baseCtc)) ? Number(row.baseCtc) : 0), row.email || null, row.mobile || null);
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
    recomputeEmployeeIds: [...(apply ? shiftChangedIds : new Set())],
    touchedIds: [...touchedIds]
  };
}

module.exports = { analyzeRoster };
