// server/scripts/migrateCompensation.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.pruirlouwmhlpdzuukrk:Swaniki2026@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';

async function migrate() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Applying compensation and legal acceptance schema migrations...');
    await pool.query(`
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS headcount_band TEXT DEFAULT '20_PLUS';
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pf_enabled INTEGER DEFAULT 1;
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS esi_enabled INTEGER DEFAULT 1;
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pt_enabled INTEGER DEFAULT 1;
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pt_state TEXT DEFAULT 'MP';
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS lwf_enabled INTEGER DEFAULT 0;
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS statutory_rules JSONB DEFAULT '{}';
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS terms_accepted_by TEXT;
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS terms_accepted_ip TEXT;
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS terms_version TEXT DEFAULT '2026.1-CALC-UTILITY';

      ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS approved_by TEXT;
      ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
      ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS approval_notes TEXT;
      ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS disclaimer_acknowledged INTEGER DEFAULT 0;
      ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS disclaimer_ack_ip TEXT;
      ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS snapshot_data JSONB;

      CREATE TABLE IF NOT EXISTS employee_salary_structures (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
        base_ctc REAL NOT NULL DEFAULT 0,
        monthly_gross REAL NOT NULL DEFAULT 0,
        basic_pct REAL DEFAULT 50.0,
        basic_amount REAL NOT NULL DEFAULT 0,
        hra_pct REAL DEFAULT 20.0,
        hra_amount REAL NOT NULL DEFAULT 0,
        conveyance_amount REAL DEFAULT 0,
        medical_amount REAL DEFAULT 0,
        special_allowance REAL DEFAULT 0,
        pf_opt_in INTEGER DEFAULT 1,
        pf_custom_rate REAL DEFAULT 12.0,
        pf_cap_ceiling INTEGER DEFAULT 1,
        esi_opt_in INTEGER DEFAULT 1,
        pt_opt_in INTEGER DEFAULT 1,
        tds_mode TEXT DEFAULT 'NEW_REGIME',
        tds_fixed_monthly REAL DEFAULT 0,
        employer_pf_in_ctc INTEGER DEFAULT 1,
        employer_esi_in_ctc INTEGER DEFAULT 1,
        gratuity_in_ctc INTEGER DEFAULT 1,
        updated_at TIMESTAMPTZ DEFAULT now(),
        created_by TEXT,
        UNIQUE(employee_id, effective_from)
      );
      CREATE INDEX IF NOT EXISTS idx_salary_struct_emp ON employee_salary_structures(employee_id);
    `);
    console.log('✓ Migration applied successfully!');
  } finally {
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
