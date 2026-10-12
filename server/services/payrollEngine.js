// server/services/payrollEngine.js
// Enterprise Self-Serve Statutory Payroll Calculation Engine for Indian Establishments.
// Supports custom salary structures, configurable EPF/VPF rates (12% - 100%),
// Wage Code 50% rules, ESI thresholds, state-specific PT, and immutable JSON Vault snapshots.

const { db } = require('../db/database');
const config = require('../config');
const rulesService = require('./rulesService');

/**
 * Calculates Indian Statutory Payroll for a specific employee for a given month/year
 */
async function calculateEmployeeSalary(employee, monthYear) {
  await rulesService.ensureFresh();
  const RULES = rulesService.getRules();
  const [yearStr, monthStr] = monthYear.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const calendarDays = new Date(year, month, 0).getDate();

  // 1. Fetch organization-level statutory toggles
  const org = (await db.get('SELECT * FROM organizations WHERE id = ?', 'org_main')) || {};
  const pfOrgEnabled = org.pf_enabled !== 0;
  const esiOrgEnabled = org.esi_enabled !== 0;
  const ptOrgEnabled = org.pt_enabled !== 0;
  const ptState = org.pt_state || 'MP';

  // 2. Fetch employee custom salary structure (if defined)
  const struct = await db.get(`
    SELECT * FROM employee_salary_structures
    WHERE employee_id = ?
    ORDER BY effective_from DESC, updated_at DESC
    LIMIT 1
  `, employee.id);

  // 3. Fetch all daily attendance records for this employee in the month
  const attendanceRecords = await db.all(`
    SELECT * FROM attendance_records
    WHERE employee_id = ? AND to_char(duty_date, 'YYYY-MM') = ?
  `, employee.id, monthYear);

  let presentDays = 0;
  let halfDays = 0;
  let absentDays = 0;
  let totalHoursWorked = 0;
  let overtimeHours = 0;

  attendanceRecords.forEach(record => {
    totalHoursWorked += Number(record.total_hours) || 0;
    overtimeHours += Number(record.overtime_hours) || 0;

    if (record.status === 'PRESENT' || record.status === 'OVERTIME' || record.status === 'REGULARIZED') {
      presentDays += 1;
    } else if (record.status === 'HALF_DAY') {
      halfDays += 1;
    } else {
      absentDays += 1;
    }
  });

  // Standard 4 weekly off / rest days for rostered staff
  const weeklyOffs = 4;
  let payableDays = attendanceRecords.length > 0
    ? Math.min(calendarDays, presentDays + (halfDays * 0.5) + weeklyOffs)
    : calendarDays;

  absentDays = Math.max(0, calendarDays - payableDays);
  const prorationFactor = payableDays / calendarDays;

  // 4. Determine Nominal Earnings (from custom structure or default 50/20/10/20 split)
  const baseCtc = Number(struct?.base_ctc || employee.base_ctc || 0);
  let nominalBasic = 0;
  let nominalHra = 0;
  let nominalMedical = 0;
  let nominalConveyance = 0;
  let nominalSpecial = 0;

  if (struct && struct.basic_amount > 0) {
    nominalBasic = Number(struct.basic_amount);
    nominalHra = Number(struct.hra_amount || 0);
    nominalMedical = Number(struct.medical_amount || 0);
    nominalConveyance = Number(struct.conveyance_amount || 0);
    nominalSpecial = Number(struct.special_allowance || 0);
  } else {
    // Default 50% Basic (Code on Wages compliant), 20% HRA, 10% Medical, remainder Special Allowance
    nominalBasic = Math.round(baseCtc * 0.50);
    nominalHra = Math.round(baseCtc * 0.20);
    nominalMedical = Math.round(baseCtc * 0.10);
    nominalSpecial = Math.max(0, baseCtc - (nominalBasic + nominalHra + nominalMedical));
  }

  // 5. Prorated earnings based on attendance
  const earnedBasic = Math.round(nominalBasic * prorationFactor);
  const earnedHra = Math.round(nominalHra * prorationFactor);
  const earnedMedical = Math.round(nominalMedical * prorationFactor);
  const earnedConveyance = Math.round(nominalConveyance * prorationFactor);
  const earnedSpecial = Math.round(nominalSpecial * prorationFactor);

  // Overtime Calculation: 1.5x of hourly basic rate
  const hourlyBasicRate = (nominalBasic / 26) / 8;
  const overtimeMultiplier = RULES.attendance.OVERTIME_MULTIPLIER || 1.5;
  const overtimePay = Math.round(hourlyBasicRate * overtimeMultiplier * overtimeHours);

  const grossEarnings = earnedBasic + earnedHra + earnedMedical + earnedConveyance + earnedSpecial + overtimePay;

  // 6. Statutory Deductions:
  // A. Employee Provident Fund (EPF & VPF): customizable rate (12% to 100%)
  let epfDeduction = 0;
  let employerEpf = 0;
  let employerEps = 0;

  const pfRate = Number(struct?.pf_custom_rate || 12.0) / 100;
  const pfOptIn = struct ? struct.pf_opt_in !== 0 : !!employee.uan;
  const pfCapCeiling = struct ? struct.pf_cap_ceiling !== 0 : true;

  if (pfOrgEnabled && pfOptIn) {
    const ceiling = RULES.statutory.EPF_WAGE_CEILING || 15000;
    const pfBasis = pfCapCeiling ? Math.min(earnedBasic, ceiling) : earnedBasic;
    epfDeduction = Math.round(pfBasis * pfRate);

    // Employer share: 12% of basis (split into 8.33% EPS capped at ₹1,250 on ₹15k, rest 3.67% EPF)
    const epsWage = Math.min(pfBasis, ceiling);
    employerEps = Math.round(epsWage * 0.0833);
    employerEpf = Math.max(0, Math.round(pfBasis * 0.12) - employerEps);
  }

  // B. ESIC Deduction: 0.75% of Gross (Applicable if gross <= ₹21,000)
  let esicDeduction = 0;
  let employerEsic = 0;
  const esiOptIn = struct ? struct.esi_opt_in !== 0 : !!employee.esi_ip;
  const esiLimit = RULES.statutory.ESIC_WAGE_LIMIT || 21000;

  if (esiOrgEnabled && esiOptIn && grossEarnings <= esiLimit) {
    esicDeduction = Math.ceil(grossEarnings * (RULES.statutory.ESIC_EMPLOYEE_RATE || 0.0075));
    employerEsic = Math.ceil(grossEarnings * (RULES.statutory.ESIC_EMPLOYER_RATE || 0.0325));
  }

  // C. Professional Tax (State specific slabs)
  let ptDeduction = 0;
  if (ptOrgEnabled && (struct ? struct.pt_opt_in !== 0 : true)) {
    if (ptState === 'MP') {
      const slabs = (RULES.statutory.MP_PT_SLABS && RULES.statutory.MP_PT_SLABS.length) ? RULES.statutory.MP_PT_SLABS : [
        { minGross: 0, maxGross: 18750, tax: 0 },
        { minGross: 18751, maxGross: 25000, tax: 125 },
        { minGross: 25001, maxGross: Infinity, tax: 208 }
      ];
      for (const slab of slabs) {
        if (grossEarnings >= slab.minGross && grossEarnings <= slab.maxGross) {
          ptDeduction = slab.tax;
          break;
        }
      }
    } else if (ptState === 'MH') {
      // Maharashtra PT standard: ₹200/mo (₹300 in Feb) if gross > ₹10,000 (male) or > ₹25,000
      ptDeduction = grossEarnings > 10000 ? (month === 2 ? 300 : 200) : 0;
    } else if (ptState === 'KA') {
      // Karnataka PT standard: ₹200 if gross >= ₹15,000
      ptDeduction = grossEarnings >= 15000 ? 200 : 0;
    } else {
      ptDeduction = grossEarnings > 15000 ? 200 : 0;
    }
  }

  // D. TDS (Income Tax withholding)
  let tdsDeduction = 0;
  if (struct && struct.tds_fixed_monthly > 0) {
    tdsDeduction = Math.round(Number(struct.tds_fixed_monthly));
  } else if (grossEarnings > 75000) {
    tdsDeduction = Math.round(grossEarnings * 0.10);
  }

  // Payment of Wages Act: Total deductions cannot exceed 50% of gross
  let totalDeductions = epfDeduction + esicDeduction + ptDeduction + tdsDeduction;
  const maxAllowedDeductions = Math.round(grossEarnings * 0.50);
  let deductionCapped = false;
  if (totalDeductions > maxAllowedDeductions && grossEarnings > 0) {
    deductionCapped = true;
  }

  const netSalary = Math.max(0, grossEarnings - totalDeductions);

  // Gratuity accrual (4.81% of basic for employer cost calculation)
  const gratuityAccrual = Math.round(earnedBasic * (15 / (26 * 12)));

  return {
    employeeId: employee.id,
    monthYear,
    calendarDays,
    payableDays: Math.round(payableDays * 10) / 10,
    absentDays: Math.round(absentDays * 10) / 10,
    totalHoursWorked: Math.round(totalHoursWorked * 10) / 10,
    overtimeHours: Math.round(overtimeHours * 10) / 10,

    // Earnings
    basic: earnedBasic,
    hra: earnedHra,
    medicalAllowance: earnedMedical,
    conveyanceAllowance: earnedConveyance,
    specialAllowance: earnedSpecial,
    overtimePay,
    grossEarnings,

    // Deductions
    epfDeduction,
    esicDeduction,
    ptDeduction,
    tdsDeduction,
    totalDeductions,
    deductionCapped,

    // Net
    netSalary,

    // Employer Overhead & Provisions
    employerEpf,
    employerEps,
    employerEsic,
    gratuityAccrual,
    totalEmployerCost: grossEarnings + employerEpf + employerEps + employerEsic + gratuityAccrual
  };
}

/**
 * Executes a full monthly payroll run for all active employees
 * Generates audit trail + immutable JSON Vault Snapshot
 */
async function runMonthlyPayroll(monthYear, options = {}) {
  const employees = await db.all(`
    SELECT e.*, d.name as department_name, s.name as shift_name
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN shifts s ON e.shift_id = s.id
    WHERE e.status = 'ACTIVE'
    ORDER BY e.employee_code ASC
  `);
  if (employees.length === 0) {
    throw new Error('No active employees found to process payroll');
  }

  let totalGross = 0;
  let totalEpf = 0;
  let totalEsic = 0;
  let totalPt = 0;
  let totalNet = 0;
  let totalEmployerCost = 0;

  const runId = `payrun_${monthYear}_${Date.now()}`;

  // Delete prior unfinalized run for this month if re-running
  await db.run(`DELETE FROM payslips WHERE month_year = ?`, monthYear);
  await db.run(`DELETE FROM payroll_runs WHERE month_year = ?`, monthYear);

  // Insert Payroll Run record
  await db.run(`
    INSERT INTO payroll_runs (id, month_year, total_employees, total_gross, total_epf, total_esic, total_pt, total_net, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPUTED')
  `, runId, monthYear, employees.length, 0, 0, 0, 0, 0);

  const insertPayslip = async (slip) => {
    await db.run(`
      INSERT INTO payslips (
        id, payroll_run_id, employee_id, month_year, calendar_days, payable_days, absent_days,
        total_hours_worked, overtime_hours, basic, hra, medical_allowance, special_allowance,
        overtime_pay, gross_earnings, epf_deduction, esic_deduction, pt_deduction, tds_deduction,
        total_deductions, net_salary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      slip.payslipId,
      runId,
      slip.employeeId,
      slip.monthYear,
      slip.calendarDays,
      slip.payableDays,
      slip.absentDays,
      slip.totalHoursWorked,
      slip.overtimeHours,
      slip.basic,
      slip.hra,
      slip.medicalAllowance,
      slip.specialAllowance,
      slip.overtimePay,
      slip.grossEarnings,
      slip.epfDeduction,
      slip.esicDeduction,
      slip.ptDeduction,
      slip.tdsDeduction,
      slip.totalDeductions,
      slip.netSalary
    );
  };

  const calculatedSlips = [];
  for (const emp of employees) {
    const salary = await calculateEmployeeSalary(emp, monthYear);
    const payslipId = `slip_${monthYear}_${emp.id}`;

    await insertPayslip({ payslipId, ...salary });

    totalGross += salary.grossEarnings;
    totalEpf += salary.epfDeduction;
    totalEsic += salary.esicDeduction;
    totalPt += salary.ptDeduction;
    totalNet += salary.netSalary;
    totalEmployerCost += salary.totalEmployerCost;

    calculatedSlips.push({
      employeeId: emp.id,
      employeeCode: emp.employee_code,
      fullName: emp.full_name,
      department: emp.department_name,
      bankAccount: emp.bank_account,
      bankIfsc: emp.bank_ifsc,
      bankName: emp.bank_name,
      gross: salary.grossEarnings,
      deductions: salary.totalDeductions,
      net: salary.netSalary,
      epf: salary.epfDeduction,
      esic: salary.esicDeduction,
      pt: salary.ptDeduction,
      payableDays: salary.payableDays
    });
  }

  // 7. Build Lightweight Immutable "Payroll Vault" JSON Snapshot (~12-15 KB)
  const org = (await db.get('SELECT * FROM organizations WHERE id = ?', 'org_main')) || {};
  const snapshotData = {
    schemaVersion: '2026.1-PAYROLL-VAULT',
    createdAt: new Date().toISOString(),
    monthYear,
    runId,
    organization: {
      name: org.name,
      headcountBand: org.headcount_band,
      pfEnabled: org.pf_enabled,
      esiEnabled: org.esi_enabled,
      ptState: org.pt_state
    },
    totals: {
      employeesCount: employees.length,
      gross: totalGross,
      epf: totalEpf,
      esic: totalEsic,
      pt: totalPt,
      net: totalNet,
      employerCost: totalEmployerCost
    },
    slips: calculatedSlips
  };

  // Update totals and store snapshot in payroll_runs
  await db.run(`
    UPDATE payroll_runs
    SET total_gross = ?, total_epf = ?, total_esic = ?, total_pt = ?, total_net = ?, snapshot_data = ?::jsonb
    WHERE id = ?
  `, totalGross, totalEpf, totalEsic, totalPt, totalNet, JSON.stringify(snapshotData), runId);

  return {
    runId,
    monthYear,
    totalEmployees: employees.length,
    totalGross,
    totalEpf,
    totalEsic,
    totalPt,
    totalNet,
    totalEmployerCost
  };
}

/**
 * Pre-Flight Anomaly Detector: checks draft payroll for operational issues before disbursement
 */
async function detectPayrollAnomalies(monthYear) {
  const slips = await db.all(`
    SELECT p.*, e.full_name, e.employee_code, e.bank_account, e.bank_ifsc, e.base_ctc
    FROM payslips p
    JOIN employees e ON p.employee_id = e.id
    WHERE p.month_year = ?
  `, monthYear);

  const anomalies = [];

  // Check previous month for jump/drop comparison
  const [y, m] = monthYear.split('-').map(Number);
  const prevDate = new Date(y, m - 2, 1);
  const prevMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const prevSlips = await db.all(`SELECT employee_id, net_salary FROM payslips WHERE month_year = ?`, prevMonthKey);
  const prevMap = {};
  prevSlips.forEach(s => { prevMap[s.employee_id] = Number(s.net_salary || 0); });

  for (const s of slips) {
    const net = Number(s.net_salary || 0);
    const gross = Number(s.gross_earnings || 0);
    const basic = Number(s.basic || 0);

    // 1. Negative or zero net pay
    if (net <= 0 && gross > 0) {
      anomalies.push({
        type: 'NEGATIVE_NET',
        severity: 'HIGH',
        employeeId: s.employee_id,
        employeeName: s.full_name,
        code: s.employee_code,
        message: `${s.full_name} has zero or negative take-home pay (Deductions exceed gross earnings).`
      });
    }

    // 2. Missing Bank Details
    if (!s.bank_account || !s.bank_ifsc || String(s.bank_ifsc).trim().length !== 11) {
      anomalies.push({
        type: 'MISSING_BANK_DETAILS',
        severity: 'HIGH',
        employeeId: s.employee_id,
        employeeName: s.full_name,
        code: s.employee_code,
        message: `${s.full_name} is missing a valid bank account or 11-digit IFSC code (NEFT file will fail).`
      });
    }

    // 3. Significant Payout Deviation (> 25% drop or spike vs previous month)
    const prevNet = prevMap[s.employee_id];
    if (prevNet && prevNet > 0 && net > 0) {
      const diffPct = Math.abs((net - prevNet) / prevNet) * 100;
      if (diffPct >= 25) {
        anomalies.push({
          type: 'PAYOUT_SPIKE',
          severity: 'MEDIUM',
          employeeId: s.employee_id,
          employeeName: s.full_name,
          code: s.employee_code,
          message: `${s.full_name}'s net salary changed by ${Math.round(diffPct)}% compared to last month (₹${prevNet.toLocaleString('en-IN')} → ₹${net.toLocaleString('en-IN')}). Verify attendance sync.`
        });
      }
    }

    // 4. Code on Wages 50% Basic Rule
    if (gross > 0 && (basic / gross) < 0.49) {
      anomalies.push({
        type: 'WAGE_CODE_50_PCT',
        severity: 'LOW',
        employeeId: s.employee_id,
        employeeName: s.full_name,
        code: s.employee_code,
        message: `Basic pay for ${s.full_name} constitutes ${Math.round((basic / gross) * 100)}% of gross earnings (Code on Wages recommends ≥ 50%).`
      });
    }

    // 5. Zero attendance days
    if (Number(s.payable_days) <= 0) {
      anomalies.push({
        type: 'ZERO_ATTENDANCE',
        severity: 'MEDIUM',
        employeeId: s.employee_id,
        employeeName: s.full_name,
        code: s.employee_code,
        message: `${s.full_name} has 0 payable attendance days recorded for ${monthYear}.`
      });
    }
  }

  return anomalies;
}

module.exports = {
  calculateEmployeeSalary,
  runMonthlyPayroll,
  detectPayrollAnomalies
};
