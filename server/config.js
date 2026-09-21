const path = require('path');

module.exports = {
  PORT: process.env.PORT || 4010,
  DB_PATH: process.env.DB_PATH || path.join(__dirname, 'db', 'dubey_nursing_home.sqlite'),
  DATABASE_URL: process.env.DATABASE_URL || '',
  ANUBHAV_PARTNER_API_KEY: process.env.ANUBHAV_API_KEY || 'ANUBHAV_DNH_SECRET_2026',
  JWT_SECRET: process.env.JWT_SECRET || 'dubey-nursing-home-super-secret-key-2026',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dubey-nursing-home-refresh-secret-key-2026',
  // Comma-separated list of allowed browser origins (empty => allow all, dev-friendly)
  CORS_ORIGINS: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  
  // Hospital Shift & Attendance Rules
  ATTENDANCE_RULES: {
    GRACE_PERIOD_MINUTES: 15,          // 15 mins late allowed without penalty
    HALF_DAY_MIN_HOURS: 3.45,          // 3.45h to 7.45h = Half Day (< 3.45h = Absent)
    FULL_DAY_MIN_HOURS: 7.45,          // >= 7.45h = Full Day
    OVERTIME_THRESHOLD_HOURS: 8.0,     // Beyond standard shift duration counts as Overtime
    OVERTIME_MULTIPLIER: 1.5,          // 1.5x of hourly basic rate
    NIGHT_SHIFT_CROSS_MIDNIGHT: true   // Automatic duty date anchoring
  },

  // Indian Statutory Rates (Govt of India & Madhya Pradesh Slabs)
  STATUTORY_RULES: {
    EPF_EMPLOYEE_RATE: 0.12,           // 12% of Basic
    EPF_EMPLOYER_RATE: 0.12,           // 12% of Basic
    EPF_WAGE_CEILING: 15000,           // Cap at ₹15,000 for standard EPF
    ESIC_EMPLOYEE_RATE: 0.0075,        // 0.75% of Gross
    ESIC_EMPLOYER_RATE: 0.0325,        // 3.25% of Gross
    ESIC_WAGE_LIMIT: 21000,            // Applicable only if Gross <= ₹21,000
    
    // Madhya Pradesh Professional Tax Slabs (Monthly)
    MP_PT_SLABS: [
      { minGross: 0, maxGross: 18750, tax: 0 },
      { minGross: 18751, maxGross: 25000, tax: 125 },
      { minGross: 25001, maxGross: Infinity, tax: 208 }
    ]
  },

  // Organization Metadata (Dynamic defaults, editable via DB)
  ORGANIZATION: {
    NAME: 'ABC Pvt Ltd',
    ADDRESS: 'Parasia Road, Near Bus Stand, Chhindwara, Madhya Pradesh - 480001',
    GSTIN: '23AABCD1234F1Z5',
    REGISTRATION_NO: 'MP-CHH-CORP-2018/889'
  },

  // Supported Biometric Hardware Device Models (Choosable list for Phase 2 with Anubhav Infotech)
  SUPPORTED_DEVICE_MODELS: [
    'eSSL uFace 302 (Face + Fingerprint + RFID)',
    'eSSL K90 Pro (Fingerprint + Battery Backup)',
    'eSSL SilkBio-101TC (SilkID Optical Sensor)',
    'ZKTeco MB20 (Face Recognition & RFID)',
    'ZKTeco SpeedFace-V5L (Visible Light AI Face + Palm)',
    'Biomax Bio-Face 100 (Dual Camera Facial Recognition)',
    'Realtime T502 (Fingerprint Attendance Terminal)'
  ]
};
