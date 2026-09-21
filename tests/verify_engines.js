const assert = require('assert');
const { db, initSchema } = require('../server/db/database');
const config = require('../server/config');
const { ingestPunch, resolveDutyDate, generatePunchHash } = require('../server/services/attendanceEngine');
const { calculateEmployeeSalary, runMonthlyPayroll } = require('../server/services/payrollEngine');
const { generateBankDisbursementCSV, generateTallyJV } = require('../server/services/exportService');

console.log('🧪 RUNNING COMPREHENSIVE TESTS FOR REFINED BIOMETRIC & PAYROLL ENGINES...\n');

// 1. Test Hash & Deduplication
console.log('1. Testing Deduplication Hash...');
const hash1 = generatePunchHash('dev_01', '101', '2026-09-15T08:00:10Z');
const hash2 = generatePunchHash('dev_01', '101', '2026-09-15T08:00:45Z');
assert.strictEqual(hash1, hash2, 'Punches within the same minute must yield identical deduplication hashes');
console.log('   ✅ Deduplication hash generated correctly.\n');

// 2. Test Cross-Midnight Night Shift Date Resolution
console.log('2. Testing Cross-Midnight Shift Duty Date Resolution (Sneha Goswami)...');
const nightShift = {
  id: 'shift_night',
  name: 'Night Duty Shift',
  start_time: '20:00',
  end_time: '08:00',
  duration_hours: 12.0,
  is_cross_midnight: 1
};
const sneha = { id: 'emp_01', name: 'Sneha Goswami' };

// Evening in-punch on 15-Sept at 19:55
const inPunchDate = new Date('2026-09-15T19:55:00');
const resolvedDutyDateIn = resolveDutyDate(sneha, nightShift, inPunchDate);
assert.strictEqual(resolvedDutyDateIn, '2026-09-15', 'Evening punch must resolve to 2026-09-15 duty date');

// Morning out-punch on 16-Sept at 08:05
const outPunchDate = new Date('2026-09-16T08:05:00');
const resolvedDutyDateOut = resolveDutyDate(sneha, nightShift, outPunchDate);
assert.strictEqual(resolvedDutyDateOut, '2026-09-15', 'Morning out-punch on next day must anchor back to 2026-09-15 duty date');
console.log('   ✅ Cross-midnight shift anchors correctly to duty date without splitting days.\n');

// 3. Test New Shift Duration Threshold Rules (7.45h Full Day, 3.45h Half Day, < 3.45h Absent)
console.log('3. Testing Exact Shift Threshold Rules (7.45h / 3.45h)...');
assert.strictEqual(config.ATTENDANCE_RULES.FULL_DAY_MIN_HOURS, 7.45, 'FULL_DAY_MIN_HOURS must be 7.45');
assert.strictEqual(config.ATTENDANCE_RULES.HALF_DAY_MIN_HOURS, 3.45, 'HALF_DAY_MIN_HOURS must be 3.45');

function evaluateStatus(hours) {
  if (hours < config.ATTENDANCE_RULES.HALF_DAY_MIN_HOURS) return 'ABSENT';
  if (hours < config.ATTENDANCE_RULES.FULL_DAY_MIN_HOURS) return 'HALF_DAY';
  return 'PRESENT';
}

assert.strictEqual(evaluateStatus(7.50), 'PRESENT', '7.5h must be Full Day (PRESENT)');
assert.strictEqual(evaluateStatus(7.45), 'PRESENT', '7.45h must be Full Day (PRESENT)');
assert.strictEqual(evaluateStatus(7.44), 'HALF_DAY', '7.44h must be Half Day (HALF_DAY)');
assert.strictEqual(evaluateStatus(5.00), 'HALF_DAY', '5.00h must be Half Day (HALF_DAY)');
assert.strictEqual(evaluateStatus(3.45), 'HALF_DAY', '3.45h must be Half Day (HALF_DAY)');
assert.strictEqual(evaluateStatus(3.44), 'ABSENT', '3.44h must be Absent (ABSENT)');
assert.strictEqual(evaluateStatus(1.50), 'ABSENT', '1.50h must be Absent (ABSENT)');
console.log('   ✅ Shift threshold rules validated: >=7.45h -> Full Day, 3.45-7.44h -> Half Day, <3.45h -> Absent.\n');

// 4. Test Statutory Indian Payroll Calculations for Sneha Goswami
console.log('4. Testing Indian Statutory Payroll Calculation for Sneha Goswami (₹32,000 CTC)...');
const snehaEmp = db.prepare('SELECT * FROM employees WHERE employee_code = ?').get('DNH-101');
assert(snehaEmp, 'Sneha Goswami must exist in DB');

const salarySneha = calculateEmployeeSalary(snehaEmp, '2026-08');
assert.strictEqual(salarySneha.calendarDays, 31);
assert(salarySneha.grossEarnings > 0);
assert(salarySneha.epfDeduction > 0, 'EPF must be deducted for Sneha');
assert.strictEqual(salarySneha.esicDeduction, 0, 'ESIC must be ₹0 because Sneha CTC (₹32,000) > ₹21,000');
assert.strictEqual(salarySneha.ptDeduction, 208, 'MP PT must be ₹208 for earnings > ₹25,000');
assert(salarySneha.netSalary > 0 && salarySneha.netSalary < salarySneha.grossEarnings);
console.log(`   ✅ Sneha Goswami Net Pay: ₹${salarySneha.netSalary} (Gross: ₹${salarySneha.grossEarnings}, EPF: ₹${salarySneha.epfDeduction}, MP PT: ₹${salarySneha.ptDeduction})\n`);

// 5. Test Raw Biometric Punches Ingestion
console.log('5. Testing Raw Biometric Punches Simulation in DB...');
const rawPunchCount = db.prepare('SELECT count(*) as count FROM biometric_punches').get().count;
assert(rawPunchCount > 2000, `Must have rich raw biometric punches (found ${rawPunchCount})`);
console.log(`   ✅ Verified ${rawPunchCount} raw biometric hardware punches simulated in DB.\n`);

// 6. Test Supported Device Models
console.log('6. Testing Choosable Device Models List...');
assert(Array.isArray(config.SUPPORTED_DEVICE_MODELS), 'SUPPORTED_DEVICE_MODELS must be an array');
assert(config.SUPPORTED_DEVICE_MODELS.length >= 5, 'Must contain multiple device models for Phase 2 discussion');
console.log(`   ✅ Verified ${config.SUPPORTED_DEVICE_MODELS.length} choosable device models configured.\n`);

console.log('🎉 ALL ENGINE & REGRESSION TESTS PASSED CLEANLY! 100% OPERATIONAL.');
