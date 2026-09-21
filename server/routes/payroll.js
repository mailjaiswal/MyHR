const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const config = require('../config');
const { runMonthlyPayroll } = require('../services/payrollEngine');
const { generateBankDisbursementCSV, generateTallyJV } = require('../services/exportService');
const { getSettings } = require('../services/settingsService');
const { requireAuth } = require('../middleware/authGuard');
const { accessGuard, requirePerm, scopeFilter } = require('../middleware/accessGuard');
const { audit } = require('../services/auditService');
const { notify } = require('../services/notificationService');

// '2026-08' -> 'Aug 2026' for human-friendly emails/audit summaries.
function monthLabel(monthYear) {
  const [y, m] = String(monthYear).split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(m, 10) - 1] || m} ${y}`;
}
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

// All payroll endpoints require auth + access scope
router.use(requireAuth, accessGuard);

// Helper to convert number to Indian words
function numberToWordsINR(amount) {
  const words = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertChunk(n) {
    let str = '';
    if (n >= 100) {
      str += words[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    }
    if (n > 0) {
      str += words[n] + ' ';
    }
    return str.trim();
  }

  const num = Math.round(amount);
  if (num === 0) return 'Zero Rupees Only';

  let result = '';
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const remainder = num % 1000;

  if (crore > 0) result += convertChunk(crore) + ' Crore ';
  if (lakh > 0) result += convertChunk(lakh) + ' Lakh ';
  if (thousand > 0) result += convertChunk(thousand) + ' Thousand ';
  if (remainder > 0) result += convertChunk(remainder) + ' ';

  return (result.trim() + ' Rupees Only');
}

// 1. 1-Click Monthly Payroll Calculation (requires PAYROLL_MANAGE)
router.post('/process', requirePerm('PAYROLL_MANAGE'), async (req, res) => {
  try {
    const { monthYear = new Date().toISOString().slice(0, 7) } = req.body;
    const summary = await runMonthlyPayroll(monthYear);

    await audit(req, 'payroll.process', {
      entityType: 'payroll_run', entityId: summary.runId,
      summary: `Payroll processed for ${monthLabel(monthYear)}: ${summary.totalEmployees} employee(s), net ${inr(summary.totalNet)}`,
      details: { monthYear, totalEmployees: summary.totalEmployees, totalGross: summary.totalGross, totalNet: summary.totalNet }
    });
    await notify('payroll.completed', {
      monthLabel: monthLabel(monthYear),
      count: summary.totalEmployees,
      gross: inr(summary.totalGross),
      net: inr(summary.totalNet),
      dedupeKey: `payroll_completed|${monthYear}|${summary.runId}`
    });
    // Per-employee "payslip ready" fan-out (dedup keeps re-clicking process from
    // double-emailing the same month).
    const slips = await db.all('SELECT employee_id, net_salary FROM payslips WHERE month_year = ?', monthYear);
    for (const s of slips) {
      await notify('payslip.generated', {
        employeeId: s.employee_id,
        monthLabel: monthLabel(monthYear),
        net: inr(s.net_salary),
        dedupeKey: `payslip|${monthYear}|${s.employee_id}`
      });
    }

    return res.json({
      success: true,
      message: `Payroll processed successfully for ${monthYear}`,
      summary
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. List Payroll Runs History (requires PAYROLL_VIEW)
router.get('/runs', requirePerm('PAYROLL_VIEW'), async (req, res) => {
  try {
    const runs = await db.all('SELECT * FROM payroll_runs ORDER BY month_year DESC');
    return res.json({ success: true, runs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. Salary Register for a Month (scope-aware)
router.get('/slips/:monthYear', requirePerm('PAYROLL_VIEW'), async (req, res) => {
  try {
    const { monthYear } = req.params;
    const ctx = req.accessCtx;
    const scope = scopeFilter(ctx, 'p.employee_id');

    const slips = await db.all(`
      SELECT p.*, e.full_name, e.employee_code, e.designation, d.name as department_name, e.uan, e.esi_ip, e.bank_account
      FROM payslips p
      JOIN employees e ON p.employee_id = e.id
      JOIN departments d ON e.department_id = d.id
      WHERE p.month_year = ? ${scope.clause}
      ORDER BY e.employee_code ASC
    `, monthYear, ...scope.params);

    return res.json({ success: true, monthYear, count: slips.length, slips });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 3b. All Payslips for a Single Employee (Payslip History) — scoped
router.get('/employee/:employeeId/history', requirePerm('PAYROLL_VIEW'), async (req, res) => {
  try {
    const { employeeId } = req.params;
    const ctx = req.accessCtx;
    // Verify employee is in visible set
    if (ctx.visibleEmployeeIds && !ctx.visibleEmployeeIds.includes(employeeId)) {
      return res.status(403).json({ error: 'Access denied to this employee records' });
    }
    const history = await db.all(`
      SELECT p.month_year, p.net_salary, p.gross_earnings as gross_salary, p.payable_days, p.total_deductions,
             r.processed_at, r.status
      FROM payslips p
      LEFT JOIN payroll_runs r ON p.month_year = r.month_year
      WHERE p.employee_id = ?
      ORDER BY p.month_year DESC
    `, employeeId);

    return res.json({ success: true, employeeId, count: history.length, history });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. Single Employee Comprehensive Payslip (Company Branded) — scope-checked
router.get('/payslip/:employeeId/:monthYear', requirePerm('PAYROLL_VIEW'), async (req, res) => {
  try {
    const { employeeId, monthYear } = req.params;
    const ctx = req.accessCtx;
    // Verify requested employee is in visible set
    if (ctx.visibleEmployeeIds && !ctx.visibleEmployeeIds.includes(employeeId)) {
      return res.status(403).json({ error: 'Access denied to this employee payslip' });
    }

    const slip = await db.get(`
      SELECT p.*, e.full_name, e.employee_code, e.designation, e.gender, e.date_of_joining,
             e.pan, e.uan, e.esi_ip, e.bank_name, e.bank_account, e.bank_ifsc,
             d.name as department_name, s.name as shift_name
      FROM payslips p
      JOIN employees e ON p.employee_id = e.id
      JOIN departments d ON e.department_id = d.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE p.employee_id = ? AND p.month_year = ?
    `, employeeId, monthYear);

    if (!slip) {
      return res.status(404).json({ error: `Payslip not found for employee ${employeeId} in month ${monthYear}` });
    }

    // Dynamically resolve HR Admin and Director from database
    const hrAdmin = await db.get(`SELECT full_name, designation FROM employees WHERE role = 'ADMIN' LIMIT 1`);
    const superAdmin = await db.get(`SELECT full_name, designation FROM employees WHERE role = 'SUPER_ADMIN' LIMIT 1`);
    const settings = await getSettings();

    return res.json({
      success: true,
      hospital: {
        ...config.ORGANIZATION,
        ...settings,
        CONTACT_PERSON: settings.contact_person || (hrAdmin ? `${hrAdmin.full_name} (${hrAdmin.designation})` : 'HR Administrator'),
        DIRECTOR: superAdmin ? `${superAdmin.full_name} (${superAdmin.designation})` : `${settings.director_name} (${settings.director_title})`,
        DIRECTOR_TITLE: settings.director_title,
        INDUSTRY_LABEL: settings.industry_label
      },
      payslip: {
        ...slip,
        netSalaryInWords: numberToWordsINR(slip.net_salary)
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. Download Bank Disbursement CSV (NEFT/RTGS format)
router.get('/export/bank/:monthYear', requirePerm('EXPORTS'), async (req, res) => {
  try {
    const { monthYear } = req.params;
    const csvContent = await generateBankDisbursementCSV(monthYear);
    const settings = await getSettings();
    await audit(req, 'payroll.export_bank', { entityType: 'payroll_run', entityId: monthYear, summary: `Bank NEFT disbursement CSV exported for ${monthLabel(monthYear)}` });
    const fileBase = settings.name.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileBase}_Bank_NEFT_${monthYear}.csv"`);
    return res.send(csvContent);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 6. Download Tally ERP Journal Voucher XML
router.get('/export/tally/:monthYear', requirePerm('EXPORTS'), async (req, res) => {
  try {
    const { monthYear } = req.params;
    const xmlContent = await generateTallyJV(monthYear);
    const settings = await getSettings();
    await audit(req, 'payroll.export_tally', { entityType: 'payroll_run', entityId: monthYear, summary: `Tally journal voucher exported for ${monthLabel(monthYear)}` });
    const fileBase = settings.name.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${fileBase}_Tally_JV_${monthYear}.xml"`);
    return res.send(xmlContent);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;