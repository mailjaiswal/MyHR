-- MyHR v2 PostgreSQL schema
-- Mirrors the ZKTeco employee-master fields so vendor SQL/API data maps 1:1,
-- plus the HRMS modules: onboarding, rostering, leaves, payroll, ingestion.

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  gstin TEXT,
  registration_no TEXT,
  contact_person TEXT,
  industry_label TEXT DEFAULT 'Workforce',
  tagline TEXT DEFAULT 'Biometric & Payroll Platform',
  director_name TEXT DEFAULT 'Management',
  director_title TEXT DEFAULT 'Managing Director',
  contact_phone TEXT,
  contact_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  head_of_department TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,              -- '08:00'
  end_time TEXT NOT NULL,                -- '16:00'
  duration_hours REAL NOT NULL,
  grace_minutes INTEGER DEFAULT 15,      -- late allowed w/o penalty
  break_duration_minutes INTEGER DEFAULT 30,
  color_code TEXT DEFAULT '#6366f1',
  is_cross_midnight INTEGER DEFAULT 0,
  window_start_offset_mins INTEGER DEFAULT 120,
  window_end_offset_mins INTEGER DEFAULT 180,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_shifts (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  shift_id TEXT NOT NULL,
  duty_date DATE NOT NULL,
  notes TEXT,
  UNIQUE (employee_id, duty_date)
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  employee_code TEXT UNIQUE NOT NULL,
  biometric_user_id TEXT UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  nickname TEXT,
  full_name TEXT,
  card_no TEXT,
  gender TEXT,
  date_of_birth DATE,
  nationality TEXT,
  city TEXT,
  mobile TEXT,
  contact_tel TEXT,
  office_tel TEXT,
  email TEXT,
  photo_url TEXT,
  verify_mode TEXT DEFAULT 'FINGERPRINT',  -- FINGERPRINT | FACE | CARD | PASSWORD
  employment_type TEXT DEFAULT 'REGULAR',  -- REGULAR | PROBATION | CONTRACT | INTERN
  designation TEXT,
  department_id TEXT,
  manager_id TEXT,
  shift_id TEXT,                        -- default shift (roster table overrides per-day)
  date_of_joining DATE,
  base_ctc REAL,
  uan TEXT,
  esi_ip TEXT,
  bank_name TEXT DEFAULT 'State Bank of India',
  bank_account TEXT,
  bank_ifsc TEXT DEFAULT 'SBIN0000354',
  pan TEXT,
  role TEXT DEFAULT 'EMPLOYEE',           -- SUPER_ADMIN | ADMIN | EMPLOYEE
  status TEXT DEFAULT 'ACTIVE',           -- ACTIVE | INACTIVE | TERMINATED | ON_LEAVE
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_personal_details (
  employee_id TEXT PRIMARY KEY,
  religion TEXT,
  marital_status TEXT,
  father_name TEXT,
  mother_name TEXT,
  spouse_name TEXT,
  aadhaar_no TEXT,
  passport_no TEXT,
  passport_expiry DATE,
  blood_group TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  state TEXT,
  pincode TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relation TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_documents (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,   -- RESUME | ID_PROOF | PAN | AADHAAR | PASSPORT | MEDICAL_CERT | EDUCATION_CERT | EXPERIENCE_LETTER
  file_name TEXT,
  mime_type TEXT,
  file_path TEXT,
  notes TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  serial_number TEXT UNIQUE NOT NULL,
  model TEXT NOT NULL,
  device_name TEXT NOT NULL,
  location TEXT NOT NULL,
  ip_address TEXT,
  port INTEGER DEFAULT 4370,
  protocol TEXT DEFAULT 'PUSH_ADMS',
  last_heartbeat TIMESTAMPTZ,
  status TEXT DEFAULT 'ONLINE'
);

CREATE TABLE IF NOT EXISTS biometric_punches (
  id TEXT PRIMARY KEY,
  punch_hash TEXT UNIQUE NOT NULL,
  device_id TEXT NOT NULL,
  biometric_user_id TEXT NOT NULL,
  punch_time TIMESTAMPTZ NOT NULL,
  verification_mode TEXT DEFAULT 'FINGERPRINT',
  in_out_mode TEXT DEFAULT 'AUTO',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  duty_date DATE NOT NULL,
  employee_id TEXT NOT NULL,
  shift_id TEXT NOT NULL,
  first_in_time TIMESTAMPTZ,
  last_out_time TIMESTAMPTZ,
  total_hours REAL DEFAULT 0,
  regular_hours REAL DEFAULT 0,
  late_minutes INTEGER DEFAULT 0,
  undertime_minutes INTEGER DEFAULT 0,
  overtime_hours REAL DEFAULT 0,
  ot_hours_tier1 REAL DEFAULT 0,
  ot_hours_tier2 REAL DEFAULT 0,
  ot_multiplier_tier1 REAL DEFAULT 1.5,
  ot_multiplier_tier2 REAL DEFAULT 2.0,
  status TEXT DEFAULT 'ABSENT',  -- PRESENT | HALF_DAY | ABSENT | REGULARIZED
  regularization_status TEXT DEFAULT 'NONE',
  regularization_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (duty_date, employee_id)
);

CREATE TABLE IF NOT EXISTS ot_policy (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tier1_threshold_hours REAL DEFAULT 8.0,   -- 1st OT starts after N worked hours
  tier2_threshold_hours REAL DEFAULT 12.0,  -- 2nd OT starts after N worked hours
  tier1_multiplier REAL DEFAULT 1.5,
  tier2_multiplier REAL DEFAULT 2.0,
  weekend_multiplier REAL DEFAULT 2.0,
  holiday_multiplier REAL DEFAULT 2.0,
  night_allowance_multiplier REAL DEFAULT 1.0,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leave_types (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  annual_allowance REAL DEFAULT 0,
  accrual_basis TEXT DEFAULT 'YEARLY',    -- MONTHLY | YEARLY | FRONTLOADED
  carry_forward_limit REAL DEFAULT 0,
  encashable INTEGER DEFAULT 0,
  paid INTEGER DEFAULT 1,
  requires_document INTEGER DEFAULT 0,
  approval_steps INTEGER DEFAULT 1,       -- Phase 2 workflow steps
  color_code TEXT DEFAULT '#22c55e',
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  leave_type_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  accumulated REAL DEFAULT 0,
  used REAL DEFAULT 0,
  pending REAL DEFAULT 0,
  carried_forward REAL DEFAULT 0,
  encashed REAL DEFAULT 0,
  UNIQUE (employee_id, leave_type_id, year)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  request_no TEXT UNIQUE,
  employee_id TEXT NOT NULL,
  leave_type_id TEXT NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  days REAL NOT NULL,
  reason TEXT,
  document_ref TEXT,                 -- medical certificate path/ref
  status TEXT DEFAULT 'PENDING',     -- PENDING | APPROVED | REJECTED | CANCELLED
  current_step INTEGER DEFAULT 1,
  approver_id TEXT,
  delegate_id TEXT,
  decided_at TIMESTAMPTZ,
  decided_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id TEXT PRIMARY KEY,
  attendance_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  duty_date DATE NOT NULL,
  original_hours REAL DEFAULT 0,
  requested_hours REAL NOT NULL,
  reason TEXT,
  submitted_by TEXT,
  status TEXT DEFAULT 'PENDING',    -- PENDING | APPROVED | REJECTED
  decided_at TIMESTAMPTZ,
  decided_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (attendance_id)
);

CREATE TABLE IF NOT EXISTS holidays (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  is_regional INTEGER DEFAULT 0,
  region TEXT,
  holiday_type TEXT DEFAULT 'PUBLIC',  -- PUBLIC | COMPANY | REGIONAL
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (holiday_date, name)
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id TEXT PRIMARY KEY,
  month_year TEXT UNIQUE NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now(),
  total_employees INTEGER NOT NULL,
  total_gross REAL NOT NULL,
  total_epf REAL NOT NULL,
  total_esic REAL NOT NULL,
  total_pt REAL NOT NULL,
  total_net REAL NOT NULL,
  status TEXT DEFAULT 'FINALIZED'
);

CREATE TABLE IF NOT EXISTS payslips (
  id TEXT PRIMARY KEY,
  payroll_run_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  month_year TEXT NOT NULL,
  calendar_days INTEGER NOT NULL,
  payable_days REAL NOT NULL,
  absent_days REAL NOT NULL,
  total_hours_worked REAL NOT NULL,
  overtime_hours REAL NOT NULL,
  ot_hours_tier1 REAL DEFAULT 0,
  ot_hours_tier2 REAL DEFAULT 0,
  ot_pay_tier1 REAL DEFAULT 0,
  ot_pay_tier2 REAL DEFAULT 0,
  basic REAL NOT NULL,
  hra REAL NOT NULL,
  medical_allowance REAL NOT NULL,
  special_allowance REAL NOT NULL,
  overtime_pay REAL NOT NULL,
  gross_earnings REAL NOT NULL,
  epf_deduction REAL NOT NULL,
  esic_deduction REAL NOT NULL,
  pt_deduction REAL NOT NULL,
  tds_deduction REAL DEFAULT 0,
  total_deductions REAL NOT NULL,
  net_salary REAL NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (payroll_run_id, employee_id)
);

CREATE TABLE IF NOT EXISTS data_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,            -- API | SQL_FILE
  vendor TEXT DEFAULT 'ZKTeco',
  base_url TEXT,
  username TEXT,
  password_enc TEXT,
  token_type TEXT DEFAULT 'JWT',
  options TEXT DEFAULT '{}',
  sync_frequency_minutes INTEGER DEFAULT 60,
  last_sync_at TIMESTAMPTZ,
  status TEXT DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  source_name TEXT,
  sync_type TEXT NOT NULL,              -- API_PULL | FILE_IMPORT | MANUAL
  status TEXT NOT NULL,                 -- RUNNING | SUCCESS | PARTIAL | FAILED
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  records_found INTEGER DEFAULT 0,
  records_imported INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  employees_created INTEGER DEFAULT 0,
  employees_matched INTEGER DEFAULT 0,
  devices_created INTEGER DEFAULT 0,
  message TEXT
);

CREATE INDEX IF NOT EXISTS idx_punches_user_time ON biometric_punches (biometric_user_id, punch_time);
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance_records (employee_id, duty_date);
CREATE INDEX IF NOT EXISTS idx_emp_shifts_date ON employee_shifts (employee_id, duty_date);
CREATE INDEX IF NOT EXISTS idx_leave_req_status ON leave_requests (status, employee_id);

-- ============================================================
-- ACCESS MANAGEMENT: Roles table + authentication columns
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  technical_key TEXT NOT NULL UNIQUE,
  data_scope TEXT NOT NULL DEFAULT 'SELF',
  permissions JSONB NOT NULL DEFAULT '[]',
  is_system INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Authentication & password management columns on employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS must_change_password INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS role_id TEXT REFERENCES roles(id);

-- Unique partial index for login email (active employees only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_emp_email ON employees (LOWER(email)) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_emp_manager ON employees (manager_id);
CREATE INDEX IF NOT EXISTS idx_emp_dept ON employees (department_id);
CREATE INDEX IF NOT EXISTS idx_emp_role_id ON employees (role_id);

-- ============================================================
-- NOTIFICATIONS & AUDIT: outbox, settings, audit trail
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id TEXT,                       -- employee id of the acting user (null = system/anonymous)
  actor_name TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,                -- e.g. 'leave.approve', 'employee.update'
  entity_type TEXT,                    -- employee | leave_request | attendance | role | payroll_run | ...
  entity_id TEXT,
  summary TEXT,                        -- human-readable one-liner
  details JSONB DEFAULT '{}',          -- structured diff / payload snapshot
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs (ts);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action, ts);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs (actor_id, ts);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,                 -- catalog key, e.g. 'leave.requested'
  dedup_key TEXT,                      -- optional: one queued email per (event, dedup_key)
  to_email TEXT NOT NULL,
  to_name TEXT,
  subject TEXT NOT NULL,
  html TEXT,
  text TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | SENT | FAILED
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON email_outbox (status, created_at);

CREATE TABLE IF NOT EXISTS notification_settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_user TEXT,
  smtp_password TEXT,
  smtp_from TEXT,
  smtp_secure INTEGER DEFAULT 1,
  email_enabled INTEGER DEFAULT 1,
  event_prefs JSONB DEFAULT '{}',       -- { 'leave.requested': false, ... } admin overrides
  audit_retention_days INTEGER DEFAULT 365,
  backup_enabled INTEGER DEFAULT 1,
  backup_retention_count INTEGER DEFAULT 14,
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO notification_settings (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

-- Idempotent column adds for databases created before the backup feature.
ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS backup_enabled INTEGER DEFAULT 1;
ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS backup_retention_count INTEGER DEFAULT 14;

-- Daily off-site backups (logical SQL dumps pushed to Supabase Storage).
CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT NOT NULL DEFAULT 'AUTO',          -- AUTO | MANUAL
  status TEXT NOT NULL DEFAULT 'PENDING',     -- SUCCESS | FAILED
  storage_path TEXT,                          -- object key inside the bucket
  bucket TEXT,
  size_bytes BIGINT DEFAULT 0,
  table_counts JSONB DEFAULT '{}',            -- { 'employees': 42, ... }
  error TEXT,
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_backups_ts ON backups (ts DESC);
CREATE INDEX IF NOT EXISTS idx_backups_status ON backups (status, ts DESC);

-- Grant the new audit permission to org-wide admin roles (guarded, idempotent).
UPDATE roles
SET permissions = permissions || '["AUDIT_VIEW"]'::jsonb
WHERE data_scope = 'ALL'
  AND NOT permissions @> '"AUDIT_VIEW"'::jsonb;