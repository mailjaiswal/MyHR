// Canonical employee field model — the single source of truth shared by the smart
// ingestion engine (column mapping + normalization), the prepopulated Excel template,
// and the "captured vs not-captured" report. Keeping it in one place guarantees all
// three agree on which fields exist, which are required, and how each is displayed.
//
// Each entry:
//   key        – logical id used across client/server (camelCase)
//   dbCol      – employees table column it writes to (null = resolved/derived, e.g. dept/shift)
//   label      – human header used in the template + mapping UI
//   group      – 'core' (identity/essential) | 'enrichment' (often missing → highlighted)
//   required   – part of the completeness check (a gap is called out to the admin)
//   type       – drives normalization + template data-validation:
//                text | name | gender | date | number | email | phone | select
//   optionsSource – for select fields: where the admin-facing dropdown values come from
//   synonyms   – header fragments used to auto-detect this column in a messy sheet
//   aliases    – exact normalized header names that map with full confidence

const FIELD_SPEC = [
  // ── Identity / core ────────────────────────────────────────────────────
  { key: 'biometricUserId', dbCol: 'biometric_user_id', label: 'Biometric ID', group: 'core', required: true, type: 'text',
    synonyms: ['biometricid', 'biometricuserid', 'biometric', 'userid', 'userno', 'pin', 'cardno', 'cardid', 'badgeno', 'badgeid', 'iotno'],
    aliases: ['biometricid', 'biometricuserid', 'userid', 'pin', 'cardno'] },
  { key: 'employeeCode', dbCol: 'employee_code', label: 'Employee Code', group: 'core', required: true, type: 'text',
    synonyms: ['employeecode', 'empcode', 'employeeid', 'empid', 'empno', 'payrollno', 'personnelno', 'code'],
    aliases: ['employeecode', 'empcode', 'employeeid', 'empno'] },
  { key: 'fullName', dbCol: 'full_name', label: 'Full Name', group: 'core', required: true, type: 'name',
    synonyms: ['fullname', 'name', 'employeename', 'staffname', 'employee', 'personname'],
    aliases: ['fullname', 'name', 'employeename', 'staffname'] },
  { key: 'firstName', dbCol: 'first_name', label: 'First Name', group: 'core', required: false, type: 'name',
    synonyms: ['firstname', 'givenname', 'fname'], aliases: ['firstname', 'givenname'] },
  { key: 'lastName', dbCol: 'last_name', label: 'Last Name', group: 'core', required: false, type: 'name',
    synonyms: ['lastname', 'surname', 'lname', 'familyname'], aliases: ['lastname', 'surname'] },
  { key: 'gender', dbCol: 'gender', label: 'Gender', group: 'core', required: false, type: 'gender',
    synonyms: ['gender', 'sex'], aliases: ['gender', 'sex'] },
  { key: 'dateOfBirth', dbCol: 'date_of_birth', label: 'Date of Birth', group: 'core', required: false, type: 'date',
    synonyms: ['dateofbirth', 'dob', 'birthdate', 'born'], aliases: ['dateofbirth', 'dob', 'birthdate'] },
  { key: 'mobile', dbCol: 'mobile', label: 'Mobile', group: 'core', required: false, type: 'phone',
    synonyms: ['mobile', 'mobileno', 'phone', 'phoneno', 'contact', 'contactno', 'cell'], aliases: ['mobile', 'phone', 'contact', 'mobileno'] },
  { key: 'email', dbCol: 'email', label: 'Email', group: 'core', required: false, type: 'email',
    synonyms: ['email', 'emailid', 'emailaddress', 'workemail'], aliases: ['email', 'emailid'] },
  { key: 'designation', dbCol: 'designation', label: 'Designation', group: 'core', required: false, type: 'text',
    synonyms: ['designation', 'jobtitle', 'title', 'post', 'position', 'role'], aliases: ['designation', 'jobtitle', 'post'] },
  { key: 'department', dbCol: null, label: 'Department', group: 'core', required: false, type: 'select', optionsSource: 'departments',
    synonyms: ['department', 'dept', 'unit', 'ward', 'departmentname'], aliases: ['department', 'dept', 'unit', 'ward'] },
  { key: 'shift', dbCol: null, label: 'Shift', group: 'core', required: false, type: 'select', optionsSource: 'shifts',
    synonyms: ['shift', 'shiftname', 'roster', 'shifttiming'], aliases: ['shift', 'shiftname', 'roster'] },
  { key: 'dateOfJoining', dbCol: 'date_of_joining', label: 'Date of Joining', group: 'core', required: false, type: 'date',
    synonyms: ['dateofjoining', 'doj', 'joiningdate', 'dateofjoin', 'joinedon', 'startdate'], aliases: ['dateofjoining', 'doj', 'joiningdate'] },
  { key: 'baseCtc', dbCol: 'base_ctc', label: 'Base Salary / CTC', group: 'core', required: false, type: 'number',
    synonyms: ['basectc', 'ctc', 'salary', 'basesalary', 'grosssalary', 'wage', 'pay'], aliases: ['basectc', 'ctc', 'salary', 'basesalary'] },

  // ── Enrichment (commonly absent → the gap-analysis + highlighted template focus) ──
  { key: 'cardNo', dbCol: 'card_no', label: 'Access Card No', group: 'enrichment', required: false, type: 'text',
    synonyms: ['cardno', 'accesscard', 'rcfcarno', 'proximitycard'], aliases: ['cardno'] },
  { key: 'employmentType', dbCol: 'employment_type', label: 'Employment Type', group: 'enrichment', required: false, type: 'select',
    optionsSource: 'employmentTypes', synonyms: ['employmenttype', 'employementtype', 'type', 'contracttype'], aliases: ['employmenttype'] },
  { key: 'nationality', dbCol: 'nationality', label: 'Nationality', group: 'enrichment', required: false, type: 'text',
    synonyms: ['nationality', 'nation', 'citizenship'], aliases: ['nationality'] },
  { key: 'city', dbCol: 'city', label: 'City', group: 'enrichment', required: false, type: 'text',
    synonyms: ['city', 'town', 'location', 'address'], aliases: ['city', 'town'] },
  { key: 'contactTel', dbCol: 'contact_tel', label: 'Contact Tel', group: 'enrichment', required: false, type: 'phone',
    synonyms: ['contacttel', 'landline', 'homephone', 'residencephone'], aliases: ['contacttel', 'landline'] },
  { key: 'officeTel', dbCol: 'office_tel', label: 'Office Tel', group: 'enrichment', required: false, type: 'phone',
    synonyms: ['officetele', 'officenumber', 'extension'], aliases: ['officetel'] },
  { key: 'uan', dbCol: 'uan', label: 'UAN (PF)', group: 'enrichment', required: false, type: 'text',
    synonyms: ['uan', 'pfno', 'providentfund', 'epf'], aliases: ['uan', 'pfno'] },
  { key: 'esiIp', dbCol: 'esi_ip', label: 'ESI IP', group: 'enrichment', required: false, type: 'text',
    synonyms: ['esiip', 'esino', 'esi'], aliases: ['esiip', 'esino'] },
  { key: 'pan', dbCol: 'pan', label: 'PAN', group: 'enrichment', required: false, type: 'text',
    synonyms: ['pan', 'panno', 'incomeTaxpan'], aliases: ['pan', 'panno'] },
  { key: 'bankName', dbCol: 'bank_name', label: 'Bank Name', group: 'enrichment', required: false, type: 'text',
    synonyms: ['bankname', 'bank'], aliases: ['bankname', 'bank'] },
  { key: 'bankAccount', dbCol: 'bank_account', label: 'Bank Account', group: 'enrichment', required: false, type: 'text',
    synonyms: ['bankaccount', 'accountno', 'accno', 'bankacno'], aliases: ['bankaccount', 'accountno'] },
  { key: 'bankIfsc', dbCol: 'bank_ifsc', label: 'Bank IFSC', group: 'enrichment', required: false, type: 'text',
    synonyms: ['bankifsc', 'ifsc', 'ifsccode'], aliases: ['bankifsc', 'ifsc'] },
  { key: 'verifyMode', dbCol: 'verify_mode', label: 'Verify Mode', group: 'enrichment', required: false, type: 'select',
    optionsSource: 'verifyModes', synonyms: ['verifymode', 'verificationmode', 'authmode', 'biometrictype'], aliases: ['verifymode'] },
  { key: 'status', dbCol: 'status', label: 'Status', group: 'enrichment', required: false, type: 'select',
    optionsSource: 'statuses', synonyms: ['status', 'employmentstatus', 'workerstatus'], aliases: ['status'] }
];

// Select-field option lists that are static (the DB-backed ones — departments/shifts —
// are looked up live by the template service).
const STATIC_OPTIONS = {
  employmentTypes: ['REGULAR', 'PROBATION', 'CONTRACT', 'INTERN'],
  verifyModes: ['FINGERPRINT', 'FACE', 'CARD', 'PASSWORD'],
  statuses: ['ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE'],
  genders: ['Male', 'Female', 'Other']
};

const byKey = Object.fromEntries(FIELD_SPEC.map(f => [f.key, f]));
const CORE_KEYS = FIELD_SPEC.filter(f => f.group === 'core').map(f => f.key);
const ENRICHMENT_KEYS = FIELD_SPEC.filter(f => f.group === 'enrichment').map(f => f.key);
const REQUIRED_KEYS = FIELD_SPEC.filter(f => f.required).map(f => f.key);

module.exports = { FIELD_SPEC, byKey, STATIC_OPTIONS, CORE_KEYS, ENRICHMENT_KEYS, REQUIRED_KEYS };
