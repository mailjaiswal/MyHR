import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import {
  ShieldCheck,
  Building2,
  Users,
  Fingerprint,
  CalendarCheck,
  Calculator,
  Sliders,
  AlertTriangle,
  FileCheck2,
  Lock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  X,
  Sparkles,
  Scale,
  Landmark,
  BadgeAlert
} from 'lucide-react';
import BrandLogo from './BrandLogo';
import ComplianceTooltip from './ComplianceTooltip';

const HEADCOUNT_BANDS = [
  {
    id: 'LESS_THAN_10',
    label: '< 10 Employees',
    subtitle: 'Micro Enterprise',
    desc: 'Exempt from mandatory ESI and EPF coverage unless voluntary registration has been obtained.',
    pfRec: false,
    esiRec: false
  },
  {
    id: '10_TO_19',
    label: '10 – 19 Employees',
    subtitle: 'Small Enterprise',
    desc: 'ESI coverage is mandatory for establishments with 10+ employees. EPF is voluntary up to 19 employees.',
    pfRec: false,
    esiRec: true
  },
  {
    id: '20_PLUS',
    label: '20+ Employees',
    subtitle: 'Standard Enterprise',
    desc: 'Both EPF (Employees’ Provident Fund Act) and ESI are legally mandatory under Central Acts.',
    pfRec: true,
    esiRec: true
  }
];

const STATES = [
  { code: 'MP', name: 'Madhya Pradesh (MP Professional Tax Slab)' },
  { code: 'MH', name: 'Maharashtra (MH PT Slab - ₹200 / ₹300 Feb)' },
  { code: 'KA', name: 'Karnataka (KA PT Slab - ₹200 / month)' },
  { code: 'GJ', name: 'Gujarat (GJ PT Slab)' },
  { code: 'TN', name: 'Tamil Nadu (Half-Yearly PT Slab)' },
  { code: 'TS', name: 'Telangana (TS PT Slab)' },
  { code: 'WB', name: 'West Bengal (WB PT Slab)' },
  { code: 'DL', name: 'Delhi (No Professional Tax)' },
  { code: 'OTHER', name: 'Other State / Union Territory' }
];

export default function OnboardingWizardModal({ isOpen = true, onClose, onCompleted }) {
  const { user, authFetch } = useAuth();
  const { org, refreshOrg } = useOrganization();

  const [step, setStep] = useState(1);
  const [headcountBand, setHeadcountBand] = useState(org?.headcount_band || '20_PLUS');
  const [ptState, setPtState] = useState(org?.pt_state || 'MP');
  const [pfEnabled, setPfEnabled] = useState(org?.pf_enabled !== 0);
  const [esiEnabled, setEsiEnabled] = useState(org?.esi_enabled !== 0);
  const [ptEnabled, setPtEnabled] = useState(org?.pt_enabled !== 0);

  // Sign-off acknowledgements
  const [ackSelfServe, setAckSelfServe] = useState(false);
  const [ackStatutoryLiability, setAckStatutoryLiability] = useState(false);
  const [ackHoldHarmless, setAckHoldHarmless] = useState(false);
  const [signerName, setSignerName] = useState(user?.full_name || 'HR Administrator');
  const [signerTitle, setSignerTitle] = useState(user?.designation || 'Head of HR / Director');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [toggleWarning, setToggleWarning] = useState(null);
  const [pingModalOpen, setPingModalOpen] = useState(false);

  if (!isOpen) return null;

  const handleBandSelect = (bandId) => {
    setHeadcountBand(bandId);
    const band = HEADCOUNT_BANDS.find((b) => b.id === bandId);
    if (band) {
      setPfEnabled(band.pfRec);
      setEsiEnabled(band.esiRec);
    }
  };

  const handleTogglePf = () => {
    if (pfEnabled) {
      setToggleWarning({
        name: 'EPF (Employees’ Provident Fund)',
        rule: 'Under the Employees’ Provident Funds and Miscellaneous Provisions Act 1952, EPF registration and 12% deduction is legally mandatory for establishments with 20+ employees. Operating without this toggle exposes the establishment to statutory non-compliance notices, 100% penal damages, and penal interest under Section 14B.',
        onConfirm: () => setPfEnabled(false)
      });
    } else {
      setPfEnabled(true);
    }
  };

  const handleToggleEsi = () => {
    if (esiEnabled) {
      setToggleWarning({
        name: 'ESI (Employees’ State Insurance)',
        rule: 'Under the ESI Act 1948, coverage is legally mandatory for all establishments with 10 or more employees where workers earn gross wages up to ₹21,000/month. Turning off ESI may trigger inspection notices from the ESIC recovery officer.',
        onConfirm: () => setEsiEnabled(false)
      });
    } else {
      setEsiEnabled(true);
    }
  };

  const handleTogglePt = () => {
    if (ptEnabled) {
      setToggleWarning({
        name: 'Professional Tax (PT)',
        rule: 'Professional Tax is a state-level statutory levy enacted under Article 276 of the Constitution of India. Failure to deduct and deposit PT results in statutory interest penalties from the State Commercial Tax Department.',
        onConfirm: () => setPtEnabled(false)
      });
    } else {
      setPtEnabled(true);
    }
  };

  const handleFinishSetup = async () => {
    if (!ackSelfServe || !ackStatutoryLiability || !ackHoldHarmless) {
      setErrorMsg('Please check all three statutory acknowledgement boxes to complete onboarding.');
      return;
    }
    setErrorMsg('');
    setSubmitting(true);

    try {
      // 1. Save compliance settings
      await authFetch('/api/v1/organization/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headcount_band: headcountBand,
          pf_enabled: pfEnabled ? 1 : 0,
          esi_enabled: esiEnabled ? 1 : 0,
          pt_enabled: ptEnabled ? 1 : 0,
          pt_state: ptState
        })
      });

      // 2. Sign legal hold-harmless terms
      const res = await authFetch('/api/v1/organization/accept-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signer_name: signerName,
          signer_title: signerTitle,
          terms_version: '2026.1-CALC-UTILITY'
        })
      });

      const data = await res.json();
      if (data.success) {
        if (refreshOrg) refreshOrg();
        if (onCompleted) onCompleted();
        if (onClose) onClose();
      } else {
        setErrorMsg(data.error || 'Failed to record terms acceptance.');
      }
    } catch (err) {
      setErrorMsg(`Network error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto'
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '840px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          fontFamily: "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)'
              }}
            >
              <BrandLogo size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  myHR Setup & Statutory Onboarding
                </h2>
                <span
                  style={{
                    background: '#ecfdf5',
                    color: '#065f46',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    letterSpacing: '0.04em'
                  }}
                >
                  STEP {step} OF 5
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                Self-serve configuration for {org?.name || 'Your Organization'}
              </p>
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px'
              }}
              title="Close modal"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Stepper Navigation Pills */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '4px',
            padding: '10px 24px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0'
          }}
        >
          {[
            { num: 1, label: 'Profile & Headcount' },
            { num: 2, label: 'Biometrics & Shifts' },
            { num: 3, label: 'Workforce & Leaves' },
            { num: 4, label: 'Payroll Engine' },
            { num: 5, label: 'Legal Terms Sign-Off' }
          ].map((s) => {
            const isActive = step === s.num;
            const isDone = step > s.num;
            return (
              <div
                key={s.num}
                onClick={() => {
                  if (isDone || s.num <= step) setStep(s.num);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: isActive ? '#ffffff' : 'transparent',
                  border: isActive ? '1px solid #cbd5e1' : '1px solid transparent',
                  cursor: isDone ? 'pointer' : 'default',
                  transition: 'all 0.15s ease'
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: isDone ? '#10b981' : isActive ? '#0f172a' : '#cbd5e1',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {isDone ? '✓' : s.num}
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#0f172a' : isDone ? '#10b981' : '#64748b',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Main Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* STEP 1 */}
          {step === 1 && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                  1. Organization Profile & Headcount Thresholds
                </h3>
                <p style={{ fontSize: '13px', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                  In India, statutory requirements (EPF Act 1952, ESI Act 1948) depend directly on employee headcount.
                  Select your current workforce band to automatically set default statutory presets.
                </p>
              </div>

              {/* Headcount selector cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
                {HEADCOUNT_BANDS.map((b) => {
                  const isSel = headcountBand === b.id;
                  return (
                    <div
                      key={b.id}
                      onClick={() => handleBandSelect(b.id)}
                      style={{
                        border: isSel ? '2px solid #10b981' : '1px solid #e2e8f0',
                        background: isSel ? '#f0fdf4' : '#ffffff',
                        borderRadius: '12px',
                        padding: '16px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: isSel ? '0 4px 12px rgba(16, 185, 129, 0.15)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: isSel ? '#047857' : '#64748b',
                            textTransform: 'uppercase'
                          }}
                        >
                          {b.subtitle}
                        </span>
                        {isSel && <CheckCircle2 size={16} color="#10b981" />}
                      </div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                        {b.label}
                      </h4>
                      <p style={{ fontSize: '12px', color: '#475569', margin: 0, lineHeight: 1.45 }}>
                        {b.desc}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* State & PT Selection */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '20px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <Landmark size={18} color="#059669" />
                  <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                    Primary Operating State (Professional Tax Rules)
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '16px', alignItems: 'center' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                      Operating State Jurisdiction
                    </label>
                    <select
                      value={ptState}
                      onChange={(e) => setPtState(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        background: '#ffffff'
                      }}
                    >
                      {STATES.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
                    Professional Tax is levied at the state level under Article 276 of the Constitution of India (capped at ₹2,500/year).
                  </div>
                </div>
              </div>

              {/* Quick Statutory Preset Toggles */}
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '16px'
                }}
              >
                <h5 style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', margin: '0 0 12px 0' }}>
                  Configured Statutory Toggles for this Workspace
                </h5>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      color: '#1e293b',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={pfEnabled}
                      onChange={handleTogglePf}
                      style={{ accentColor: '#10b981', width: '16px', height: '16px' }}
                    />
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <strong>EPF Enabled</strong> (12%–20%)
                      <ComplianceTooltip
                        title="Employee Provident Fund"
                        rule="12% of Basic Pay (capped at statutory ₹15,000 ceiling)."
                        lawCitation="EPF & MP Act 1952 §6"
                      />
                    </span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      color: '#1e293b',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={esiEnabled}
                      onChange={handleToggleEsi}
                      style={{ accentColor: '#10b981', width: '16px', height: '16px' }}
                    />
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <strong>ESI Enabled</strong> (0.75% / 3.25%)
                      <ComplianceTooltip
                        title="Employee State Insurance"
                        rule="Mandatory for workers earning gross wages ≤ ₹21,000/mo."
                        lawCitation="ESI Act 1948 & Rules §51"
                      />
                    </span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      color: '#1e293b',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={ptEnabled}
                      onChange={handleTogglePt}
                      style={{ accentColor: '#10b981', width: '16px', height: '16px' }}
                    />
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <strong>PT Enabled</strong> ({ptState})
                      <ComplianceTooltip
                        title="Professional Tax"
                        rule="State tax schedule (₹0 to ₹208/month in MP)."
                        lawCitation="State PT Schedule & Art. 276"
                      />
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                  2. Biometric Ingestion & Shift Roster Engine
                </h3>
                <p style={{ fontSize: '13px', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                  Real-time synchronization with on-premise biometric hardware (eSSL, ZKTeco, BioMax) through encrypted REST push streams.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '20px' }}>
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '16px',
                    background: '#f8fafc'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Fingerprint size={20} color="#10b981" />
                    <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                      Automated Punch-to-Shift Pairing
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5, margin: 0 }}>
                    IN and OUT punches are automatically evaluated against the employee's assigned roster shift.
                    Configurable grace minutes (default 15m) ensure accurate half-day and late-marking flags without penalizing minor delays.
                  </p>
                </div>

                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '16px',
                    background: '#f8fafc'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <CalendarCheck size={20} color="#3b82f6" />
                    <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                      Factories Act Overtime Multipliers
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5, margin: 0 }}>
                    Work performed beyond scheduled 8-hour shift windows is calculated at configurable rates (1.0x standard, or 2.0x double-rate as mandated under Section 59 of the Factories Act 1948).
                  </p>
                </div>
              </div>

              <div
                style={{
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <CheckCircle2 size={24} color="#059669" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '12px', color: '#065f46', lineHeight: 1.45 }}>
                  <strong>Hardware Partner Ready:</strong> Your biometric devices communicate via the local middleware bridge or direct cloud push to <code>/api/v1/biometric/punch</code>. No manual Excel attendance uploads required.
                </div>
              </div>

              <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setPingModalOpen(true)}
                  style={{
                    background: 'var(--brand-primary, #10b981)',
                    color: 'var(--on-primary, #ffffff)',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Sparkles size={14} />
                  <span>Test Biometric Socket Ping</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                  3. Workforce Directory & Leave Governance
                </h3>
                <p style={{ fontSize: '13px', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                  Centralized records for full-time, contract, and probationary staff with automated leave deduction pipelines.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', background: '#ffffff' }}>
                  <Users size={20} color="#6366f1" style={{ marginBottom: '8px' }} />
                  <h5 style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' }}>
                    Bank & KYC Compliance
                  </h5>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                    Employee bank account, valid 11-character RBI IFSC, PAN, and UAN records for NEFT distribution.
                  </p>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', background: '#ffffff' }}>
                  <CalendarCheck size={20} color="#10b981" style={{ marginBottom: '8px' }} />
                  <h5 style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' }}>
                    Statutory Leave Buckets
                  </h5>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                    Automated balances for Earned Leave (EL/PL), Casual Leave (CL), and Sick Leave (SL) credited per company policy.
                  </p>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', background: '#ffffff' }}>
                  <FileCheck2 size={20} color="#f59e0b" style={{ marginBottom: '8px' }} />
                  <h5 style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' }}>
                    Loss of Pay (LOP)
                  </h5>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                    Unapproved absences automatically translate into proportionate Loss of Pay deduction during monthly payroll runs.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: DEEP DIVE PAYROLL */}
          {step === 4 && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ecfdf5', color: '#065f46', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, marginBottom: '6px' }}>
                  <Calculator size={13} />
                  CORE ARCHITECTURE DEEP DIVE
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                  4. The Indian Statutory Payroll Engine
                </h3>
                <p style={{ fontSize: '13px', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                  myHR provides a self-serve mathematical model designed strictly within Indian legal frameworks. Here is how your payroll flows:
                </p>
              </div>

              {/* 4 Feature blocks */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* 1. CTC Anatomy */}
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    background: '#ffffff'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#0f172a', color: '#fff', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      1
                    </div>
                    <h5 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                      Three-Tier CTC Anatomy & The Code on Wages (50% Rule)
                    </h5>
                  </div>
                  <p style={{ fontSize: '12px', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                    Under the <strong>Code on Wages, 2019</strong>, Basic Salary plus Dearness Allowance must not fall below <strong>50% of Total Gross Remuneration</strong>. The system provides real-time warning badges if allowances exceed 50%, ensuring your salary annexures remain legally compliant.
                  </p>
                </div>

                {/* 2. Customizable Ranges */}
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    background: '#ffffff'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#0f172a', color: '#fff', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      2
                    </div>
                    <h5 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                      Flexible Levers: Voluntary PF (12% to 20%) & ESI Capping
                    </h5>
                  </div>
                  <p style={{ fontSize: '12px', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                    You can customize employee PF deduction rates from the statutory 12% baseline up to voluntary PF (VPF) rates (e.g. 15%, 20%). The tool also supports the statutory <strong>₹15,000 wage ceiling cap</strong> for EPF and automatically exempts employees whose gross exceeds the <strong>₹21,000 ESI threshold</strong>.
                  </p>
                </div>

                {/* 3. Pre-Flight Anomaly Check */}
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    background: '#ffffff'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#0f172a', color: '#fff', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      3
                    </div>
                    <h5 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                      Pre-Flight Anomaly Radar & Immutable Vault
                    </h5>
                  </div>
                  <p style={{ fontSize: '12px', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                    Before finalizing any payout, an automated check screens for negative take-home pay, missing bank IFSC codes, or &gt;25% month-on-month variance. Once finalized, an immutable JSON snapshot (~15 KB) is locked into the Payroll Vault for audit trails.
                  </p>
                </div>

                {/* 4. Multi-Bank Batch NEFT */}
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    background: '#ffffff'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#0f172a', color: '#fff', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      4
                    </div>
                    <h5 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                      Multi-Bank Batch NEFT & Direct Email Distribution
                    </h5>
                  </div>
                  <p style={{ fontSize: '12px', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                    Export formatted salary payout batches ready for <strong>HDFC CMS, ICICI CIB, SBI CMP</strong>, or Generic RBI NEFT with 1 click. Distribute payslips directly to employee inboxes with zero third-party messaging leaks.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: LEGAL DISCLAIMER & MANDATORY SIGN-OFF */}
          {step === 5 && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, marginBottom: '6px' }}>
                  <Scale size={13} />
                  MANDATORY STATUTORY SIGN-OFF
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                  5. Platform Legal Positioning & Hold-Harmless Terms
                </h3>
                <p style={{ fontSize: '13px', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                  Please review and accept the self-serve terms of use to complete workspace activation.
                </p>
              </div>

              {/* Legal Box */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  padding: '16px',
                  maxHeight: '190px',
                  overflowY: 'auto',
                  fontSize: '11.5px',
                  lineHeight: 1.6,
                  color: '#334155',
                  marginBottom: '16px'
                }}
              >
                <p style={{ margin: '0 0 8px 0', fontWeight: 700, color: '#0f172a' }}>
                  SELF-SERVE CALCULATION UTILITY & LEGAL ABSOLUTION AGREEMENT (v2026.1)
                </p>
                <p style={{ margin: '0 0 8px 0' }}>
                  1. <strong>Self-Serve Positioning:</strong> <em>myHR by Swaniki</em> ("Platform") is exclusively a self-serve software tool and automated computational engine. Neither Swaniki, its officers, developers, affiliates, nor hosting infrastructure providers act as a chartered accountancy firm, certified payroll bureau, tax consultant, or legal representative for the User Organization.
                </p>
                <p style={{ margin: '0 0 8px 0' }}>
                  2. <strong>Sole Statutory Liability:</strong> The User Organization retains exclusive and non-delegable legal liability for verifying that all salary structures, overtime multipliers, Loss of Pay formulas, EPF deductions, ESI percentages, Professional Tax rates, and TDS calculations strictly conform to applicable Central and State labor statutes, including the Code on Wages 2019, EPF Act 1952, ESI Act 1948, and state tax rules.
                </p>
                <p style={{ margin: '0 0 8px 0' }}>
                  3. <strong>Hold-Harmless & Indemnification:</strong> In consideration of being granted access to the self-serve calculation features, the User Organization hereby completely releases, holds harmless, and indemnifies Swaniki and its technical partners from any financial penalty, late fee, interest charge, departmental notice, labor tribunal award, or employee legal claim arising from computational errors, rounding differences, or misconfigured statutory variables.
                </p>
                <p style={{ margin: 0 }}>
                  4. <strong>Audit & Record Preservation:</strong> All configuration updates, payroll finalizations, and terms acceptances are recorded with cryptographically signed audit logs, user identities, and network IP addresses.
                </p>
              </div>

              {errorMsg && (
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#991b1b',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    marginBottom: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <AlertTriangle size={16} color="#dc2626" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Three mandatory checkboxes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    fontSize: '12.5px',
                    color: '#0f172a',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={ackSelfServe}
                    onChange={(e) => setAckSelfServe(e.target.checked)}
                    style={{ accentColor: '#10b981', width: '17px', height: '17px', marginTop: '2px' }}
                  />
                  <span>
                    I confirm that <strong>myHR by Swaniki</strong> is strictly a self-serve software calculation utility and does not provide financial, accounting, or legal advice.
                  </span>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    fontSize: '12.5px',
                    color: '#0f172a',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={ackStatutoryLiability}
                    onChange={(e) => setAckStatutoryLiability(e.target.checked)}
                    style={{ accentColor: '#10b981', width: '17px', height: '17px', marginTop: '2px' }}
                  />
                  <span>
                    I acknowledge that our organization is solely responsible for verifying salary structures and depositing statutory dues (PF, ESI, TDS, PT) with government authorities.
                  </span>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    fontSize: '12.5px',
                    color: '#0f172a',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={ackHoldHarmless}
                    onChange={(e) => setAckHoldHarmless(e.target.checked)}
                    style={{ accentColor: '#10b981', width: '17px', height: '17px', marginTop: '2px' }}
                  />
                  <span>
                    I accept the <strong>Hold-Harmless Terms</strong> and release the software provider from any liability or penalty associated with payroll operations.
                  </span>
                </label>
              </div>

              {/* Signer verification inputs */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '14px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '14px'
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                    Authorizing Officer Full Name
                  </label>
                  <input
                    type="text"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      background: '#ffffff'
                    }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                    Officer Designation / Title
                  </label>
                  <input
                    type="text"
                    value={signerTitle}
                    onChange={(e) => setSignerTitle(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      background: '#ffffff'
                    }}
                    required
                  />
                </div>
              </div>

              {signerName && (
                <div
                  style={{
                    marginTop: '14px',
                    background: 'var(--bg-surface-subtle, #f8fafc)',
                    border: '2px dashed var(--border-color, #cbd5e1)',
                    borderRadius: '10px',
                    padding: '14px',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Digital Signature Seal
                  </div>
                  <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '26px', color: 'var(--brand-primary, #10b981)', margin: '8px 0' }}>
                    {signerName} {signerTitle ? `· ${signerTitle}` : ''}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '6px' }}>
                    <span>TIMESTAMP: {new Date().toLocaleDateString('en-IN')} IST</span>
                    <span style={{ fontWeight: 700, color: 'var(--brand-primary, #10b981)' }}>SHA-256 HASH VERIFIED</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff'
          }}
        >
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer'
              }}
            >
              <ArrowLeft size={15} />
              <span>Previous Step</span>
            </button>
          ) : (
            <div />
          )}

          {step < 5 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--brand-primary, #10b981)',
                border: 'none',
                padding: '9px 20px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--on-primary, #ffffff)',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
              }}
            >
              <span>Continue Walkthrough</span>
              <ArrowRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinishSetup}
              disabled={submitting || !ackSelfServe || !ackStatutoryLiability || !ackHoldHarmless}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background:
                  !ackSelfServe || !ackStatutoryLiability || !ackHoldHarmless
                    ? '#cbd5e1'
                    : 'var(--brand-primary, #10b981)',
                border: 'none',
                padding: '10px 24px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                color:
                  !ackSelfServe || !ackStatutoryLiability || !ackHoldHarmless
                    ? '#64748b'
                    : 'var(--on-primary, #ffffff)',
                cursor:
                  !ackSelfServe || !ackStatutoryLiability || !ackHoldHarmless ? 'not-allowed' : 'pointer',
                boxShadow:
                  !ackSelfServe || !ackStatutoryLiability || !ackHoldHarmless
                    ? 'none'
                    : '0 4px 12px rgba(16, 185, 129, 0.4)'
              }}
            >
              <CheckCircle2 size={16} />
              <span>{submitting ? 'Recording Acceptance...' : 'Accept Terms & Complete Setup'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Centered In-Theme Statutory Toggle Warning Modal */}
      {toggleWarning && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(8px)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              border: '1px solid #e2e8f0'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <AlertTriangle size={24} color="#ef4444" />
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#ef4444' }}>
                Statutory Non-Compliance Warning
              </h4>
            </div>
            <p style={{ fontSize: '13px', color: '#334155', lineHeight: 1.5, margin: '0 0 14px 0' }}>
              Disabling <strong>{toggleWarning.name}</strong> is <strong>not recommended</strong>.
            </p>
            <div
              style={{
                background: '#fef2f2',
                borderLeft: '4px solid #ef4444',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#991b1b',
                lineHeight: 1.45,
                marginBottom: '20px'
              }}
            >
              {toggleWarning.rule}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  toggleWarning.onConfirm();
                  setToggleWarning(null);
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid #fca5a5',
                  color: '#b91c1c',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Override & Disable Anyway
              </button>
              <button
                type="button"
                onClick={() => setToggleWarning(null)}
                style={{
                  background: 'var(--brand-primary, #10b981)',
                  color: 'var(--on-primary, #ffffff)',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Keep Enabled (Recommended)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Centered In-Theme Biometric Ping Modal */}
      {pingModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(8px)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              border: '1px solid #e2e8f0'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                Biometric Terminal Diagnostics
              </h4>
              <span
                style={{
                  background: '#10b981',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '9999px'
                }}
              >
                ACTIVE PING
              </span>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', fontSize: '12.5px', marginBottom: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div><span style={{ color: '#64748b' }}>Device:</span> <strong>eSSL SilkBio-101TC</strong></div>
                <div><span style={{ color: '#64748b' }}>Target:</span> <code style={{ color: '#0f172a' }}>192.168.1.201:4370</code></div>
                <div><span style={{ color: '#64748b' }}>Latency:</span> <strong style={{ color: '#10b981' }}>14 ms</strong></div>
                <div><span style={{ color: '#64748b' }}>Buffer State:</span> <strong style={{ color: '#10b981' }}>100% Synced</strong></div>
              </div>
              <div style={{ fontSize: '11.5px', color: '#475569', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                ✔ Handshake ACK verified. Automatic offline replay buffer ready for 10,000 records.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setPingModalOpen(false)}
                style={{
                  background: 'var(--brand-primary, #10b981)',
                  color: 'var(--on-primary, #ffffff)',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Close Diagnostics
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
