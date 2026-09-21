const { db } = require('../db/database');
const config = require('../config');

/**
 * Calculates Indian Statutory Payroll for a specific employee for a given month/year
 */
async function calculateEmployeeSalary(employee, monthYear) {
  const [yearStr, monthStr] = monthYear.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const calendarDays = new Date(year, month, 0).getDate();

  // Fetch all daily attendance records for this employee in the month
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
    totalHoursWorked += record.total_hours || 0;
    overtimeHours += record.overtime_hours || 0;

    if (record.status === 'PRESENT' || record.status === 'OVERTIME' || record.status === 'REGULARIZED') {
      presentDays += 1;
    } else if (record.status === 'HALF_DAY') {
      halfDays += 1;
    } else {
      absentDays += 1;
    }
  });

  // Assume standard 4 weekly off / rest days for rostered healthcare staff
  const weeklyOffs = 4;
  // If records exist, calculate payable days. If starting mid-month or newly seeded, assign realistic payable days
  let payableDays = attendanceRecords.length > 0
    ? Math.min(calendarDays, presentDays + (halfDays * 0.5) + weeklyOffs)
    : calendarDays; // Default to full month if no missing days logged

  absentDays = Math.max(0, calendarDays - payableDays);
  const prorationFactor = payableDays / calendarDays;

  // Earnings structure (based on Monthly Base CTC)
  const nominalBasic = Math.round(employee.base_ctc * 0.45);
  const nominalHra = Math.round(employee.base_ctc * 0.20);
  const nominalMedical = Math.round(employee.base_ctc * 0.10);
  const nominalSpecial = employee.base_ctc - (nominalBasic + nominalHra + nominalMedical);

  // Prorated earnings based on attendance
  const earnedBasic = Math.round(nominalBasic * prorationFactor);
  const earnedHra = Math.round(nominalHra * prorationFactor);
  const earnedMedical = Math.round(nominalMedical * prorationFactor);
  const earnedSpecial = Math.round(nominalSpecial * prorationFactor);

  // Overtime Calculation: 1.5x of hourly basic rate
  const hourlyBasicRate = (nominalBasic / 26) / 8;
  const overtimePay = Math.round(hourlyBasicRate * config.ATTENDANCE_RULES.OVERTIME_MULTIPLIER * overtimeHours);

  const grossEarnings = earnedBasic + earnedHra + earnedMedical + earnedSpecial + overtimePay;

  // Statutory Deductions:
  // 1. Employee Provident Fund (EPF): 12% of Basic, standard statutory cap of ₹1,800 or 12%
  let epfDeduction = 0;
  if (employee.uan) {
    const pfBasis = Math.min(earnedBasic, config.STATUTORY_RULES.EPF_WAGE_CEILING);
    epfDeduction = Math.round(pfBasis * config.STATUTORY_RULES.EPF_EMPLOYEE_RATE);
  }

  // 2. ESIC Deduction: 0.75% of Gross (Applicable only if gross CTC <= ₹21,000)
  let esicDeduction = 0;
  if (employee.base_ctc <= config.STATUTORY_RULES.ESIC_WAGE_LIMIT && employee.esi_ip) {
    esicDeduction = Math.ceil(grossEarnings * config.STATUTORY_RULES.ESIC_EMPLOYEE_RATE);
  }

  // 3. Madhya Pradesh Professional Tax (Monthly Slab)
  let ptDeduction = 0;
  for (const slab of config.STATUTORY_RULES.MP_PT_SLABS) {
    if (grossEarnings >= slab.minGross && grossEarnings <= slab.maxGross) {
      ptDeduction = slab.tax;
      break;
    }
  }

  // 4. TDS (Estimated for higher income brackets like senior doctors)
  let tdsDeduction = 0;
  if (grossEarnings > 75000) {
    tdsDeduction = Math.round(grossEarnings * 0.10);
  }

  const totalDeductions = epfDeduction + esicDeduction + ptDeduction + tdsDeduction;
  const netSalary = Math.max(0, grossEarnings - totalDeductions);

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
    specialAllowance: earnedSpecial,
    overtimePay,
    grossEarnings,
    
    // Deductions
    epfDeduction,
    esicDeduction,
    ptDeduction,
    tdsDeduction,
    totalDeductions,
    
    // Net
    netSalary
  };
}

/**
 * Executes a full monthly payroll run for all active Dubey Nursing Home employees
 */
async function runMonthlyPayroll(monthYear) {
  const employees = await db.all(`SELECT * FROM employees WHERE status = 'ACTIVE'`);
  if (employees.length === 0) {
    throw new Error('No active employees found to process payroll');
  }

  let totalGross = 0;
  let totalEpf = 0;
  let totalEsic = 0;
  let totalPt = 0;
  let totalNet = 0;

  const runId = `payrun_${monthYear}_${Date.now()}`;

  // Delete prior unfinalized run for this month if re-running
  await db.run(`DELETE FROM payslips WHERE month_year = ?`, monthYear);
  await db.run(`DELETE FROM payroll_runs WHERE month_year = ?`, monthYear);

  // Insert Payroll Run record
  await db.run(`
    INSERT INTO payroll_runs (id, month_year, total_employees, total_gross, total_epf, total_esic, total_pt, total_net)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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

  for (const emp of employees) {
    const salary = await calculateEmployeeSalary(emp, monthYear);
    const payslipId = `slip_${monthYear}_${emp.id}`;

    await insertPayslip({ payslipId, ...salary });

    totalGross += salary.grossEarnings;
    totalEpf += salary.epfDeduction;
    totalEsic += salary.esicDeduction;
    totalPt += salary.ptDeduction;
    totalNet += salary.netSalary;
  }

  // Update totals in payroll run
  await db.run(`
    UPDATE payroll_runs
    SET total_gross = ?, total_epf = ?, total_esic = ?, total_pt = ?, total_net = ?
    WHERE id = ?
  `, totalGross, totalEpf, totalEsic, totalPt, totalNet, runId);

  return {
    runId,
    monthYear,
    totalEmployees: employees.length,
    totalGross,
    totalEpf,
    totalEsic,
    totalPt,
    totalNet
  };
}

module.exports = {
  calculateEmployeeSalary,
  runMonthlyPayroll
};
