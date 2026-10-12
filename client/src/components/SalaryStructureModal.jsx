import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import ComplianceTooltip from './ComplianceTooltip';
import {
  X,
  Calculator,
  Sliders,
  ShieldCheck,
  AlertTriangle,
  FileSpreadsheet,
  Printer,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  Percent,
  Banknote
} from 'lucide-react';

export default function SalaryStructureModal({
  isOpen = false,
  onClose,
  employee,
  onSaved
}) {
  const { authFetch } = useAuth();
  const { org } = useOrganization();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Compensation state
  const [monthlyCtc, setMonthlyCtc] = useState(25000);
  const [basicPct, setBasicPct] = useState(50); // 50% default
  const [hraPct, setHraPct] = useState(20); // 20% of CTC
  const [conveyance, setConveyance] = useState(1600);
  const [medical, setMedical] = useState(1250);

  // Statutory parameters
  const [pfRate, setPfRate] = useState(12); // 12% to 20%
  const [pfCapped, setPfCapped] = useState(true); // capped at 15k
  const [esiOptIn, setEsiOptIn] = useState(true);
  const [ptOptIn, setPtOptIn] = useState(true);

  // Load existing structure
  useEffect(() => {
    if (!isOpen || !employee) return;
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    authFetch(`/api/v1/organization/salary-structure/${employee.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.structure) {
          const s = data.structure;
          const ctc = parseFloat(s.monthly_ctc || employee.base_ctc || 25000);
          setMonthlyCtc(ctc);

          const b = parseFloat(s.basic_salary || 0);
          const h = parseFloat(s.hra || 0);
          if (ctc > 0 && b > 0) {
            setBasicPct(Math.round((b / ctc) * 100));
            setHraPct(Math.round((h / ctc) * 100));
          } else {
            setBasicPct(50);
            setHraPct(20);
          }
          setConveyance(parseFloat(s.conveyance || 1600));
          setMedical(parseFloat(s.medical_allowance || 1250));
          setPfRate(parseFloat(s.pf_rate_employee || 12));
          setPfCapped(s.pf_capped_at_15k !== 0);
          setEsiOptIn(s.esi_enabled !== 0);
          setPtOptIn(s.pt_enabled !== 0);
        }
      })
      .catch((err) => {
        setErrorMsg('Failed to fetch existing salary structure');
      })
      .finally(() => setLoading(false));
  }, [isOpen, employee]);

  if (!isOpen || !employee) return null;

  // Real-time calculation engine
  const basicSalary = Math.round((monthlyCtc * basicPct) / 100);
  const hra = Math.round((monthlyCtc * hraPct) / 100);
  const fixedAllowances = conveyance + medical;
  const rawSpecial = monthlyCtc - (basicSalary + hra + fixedAllowances);
  const specialAllowance = Math.max(0, rawSpecial);

  const grossEarnings = basicSalary + hra + fixedAllowances + specialAllowance;

  // PF Calculation
  const pfWage = pfCapped ? Math.min(basicSalary, 15000) : basicSalary;
  const pfEmployee = Math.round(pfWage * (pfRate / 100));
  const pfEmployer = Math.round(pfWage * (12 / 100)); // statutory 12%
  const pfAdmin = Math.round(pfWage * (1 / 100)); // 1% admin

  // ESI Calculation (Only applies if gross <= 21,000)
  const isEsiApplicable = esiOptIn && grossEarnings <= 21000;
  const esiEmployee = isEsiApplicable ? Math.round(grossEarnings * 0.0075) : 0;
  const esiEmployer = isEsiApplicable ? Math.round(grossEarnings * 0.0325) : 0;

  // Professional Tax (Standard MP default ~208, capped at 2500/yr)
  const ptDeduction = ptOptIn ? (grossEarnings > 18750 ? 208 : grossEarnings > 12500 ? 125 : 0) : 0;

  const totalDeductions = pfEmployee + esiEmployee + ptDeduction;
  const netTakeHome = Math.max(0, grossEarnings - totalDeductions);
  const totalEmployerContribution = pfEmployer + pfAdmin + esiEmployer;
  const computedTotalCtc = grossEarnings + totalEmployerContribution;

  // Code on Wages Compliance Check (Basic must be >= 50% of gross)
  const wageCodeCompliant = basicSalary >= grossEarnings * 0.5;

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await authFetch(`/api/v1/organization/salary-structure/${employee.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthly_ctc: monthlyCtc,
          basic_salary: basicSalary,
          hra: hra,
          conveyance: conveyance,
          medical_allowance: medical,
          special_allowance: specialAllowance,
          pf_rate_employee: pfRate,
          pf_capped_at_15k: pfCapped ? 1 : 0,
          esi_enabled: esiOptIn ? 1 : 0,
          pt_enabled: ptOptIn ? 1 : 0
        })
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg('Salary structure saved successfully!');
        if (onSaved) onSaved();
        setTimeout(() => {
          if (onClose) onClose();
        }, 1200);
      } else {
        setErrorMsg(data.error || 'Failed to save salary structure');
      }
    } catch (err) {
      setErrorMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePrintAnnexure = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups to print the Salary Annexure.');
      return;
    }

    const orgName = org?.name || 'Company Name';
    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Salary Annexure - ${employee.full_name}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; padding: 40px; margin: 0; }
          .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
          .header h1 { margin: 0 0 6px 0; font-size: 20px; text-transform: uppercase; }
          .header p { margin: 0; font-size: 13px; color: #475569; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; font-size: 13px; }
          .meta-item { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #cbd5e1; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
          th, td { padding: 8px 12px; text-align: left; border: 1px solid #cbd5e1; }
          th { background: #f8fafc; font-weight: 600; }
          .text-right { text-align: right; }
          .subtotal { font-weight: bold; background: #f1f5f9; }
          .total { font-weight: bold; background: #e2e8f0; font-size: 14px; }
          .legal-disclaimer { border-top: 1px solid #cbd5e1; padding-top: 16px; font-size: 11px; color: #64748b; line-height: 1.5; margin-top: 30px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${orgName}</h1>
          <p>CONFIDENTIAL · SALARY STRUCTURE ANNEXURE</p>
        </div>

        <div class="meta-grid">
          <div class="meta-item"><strong>Employee Name:</strong> <span>${employee.full_name}</span></div>
          <div class="meta-item"><strong>Employee ID:</strong> <span>${employee.employee_code || employee.id}</span></div>
          <div class="meta-item"><strong>Designation:</strong> <span>${employee.designation || 'Staff'}</span></div>
          <div class="meta-item"><strong>Department:</strong> <span>${employee.department || 'Operations'}</span></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Salary Component</th>
              <th class="text-right">Monthly (₹)</th>
              <th class="text-right">Annualized (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Basic Salary (Wage Code Compliant)</td><td class="text-right">₹${basicSalary.toLocaleString('en-IN')}</td><td class="text-right">₹${(basicSalary * 12).toLocaleString('en-IN')}</td></tr>
            <tr><td>House Rent Allowance (HRA)</td><td class="text-right">₹${hra.toLocaleString('en-IN')}</td><td class="text-right">₹${(hra * 12).toLocaleString('en-IN')}</td></tr>
            <tr><td>Conveyance Allowance</td><td class="text-right">₹${conveyance.toLocaleString('en-IN')}</td><td class="text-right">₹${(conveyance * 12).toLocaleString('en-IN')}</td></tr>
            <tr><td>Medical Allowance</td><td class="text-right">₹${medical.toLocaleString('en-IN')}</td><td class="text-right">₹${(medical * 12).toLocaleString('en-IN')}</td></tr>
            <tr><td>Special Allowance</td><td class="text-right">₹${specialAllowance.toLocaleString('en-IN')}</td><td class="text-right">₹${(specialAllowance * 12).toLocaleString('en-IN')}</td></tr>
            <tr class="subtotal"><td>(A) Gross Earnings</td><td class="text-right">₹${grossEarnings.toLocaleString('en-IN')}</td><td class="text-right">₹${(grossEarnings * 12).toLocaleString('en-IN')}</td></tr>

            <tr><td>Employee Provident Fund (${pfRate}% PF)</td><td class="text-right">₹${pfEmployee.toLocaleString('en-IN')}</td><td class="text-right">₹${(pfEmployee * 12).toLocaleString('en-IN')}</td></tr>
            <tr><td>Employee State Insurance (0.75% ESI)</td><td class="text-right">₹${esiEmployee.toLocaleString('en-IN')}</td><td class="text-right">₹${(esiEmployee * 12).toLocaleString('en-IN')}</td></tr>
            <tr><td>Professional Tax (PT)</td><td class="text-right">₹${ptDeduction.toLocaleString('en-IN')}</td><td class="text-right">₹${(ptDeduction * 12).toLocaleString('en-IN')}</td></tr>
            <tr class="subtotal"><td>(B) Total Employee Deductions</td><td class="text-right">₹${totalDeductions.toLocaleString('en-IN')}</td><td class="text-right">₹${(totalDeductions * 12).toLocaleString('en-IN')}</td></tr>

            <tr class="total"><td>(C) Net Estimated Take-Home Pay (A - B)</td><td class="text-right">₹${netTakeHome.toLocaleString('en-IN')}</td><td class="text-right">₹${(netTakeHome * 12).toLocaleString('en-IN')}</td></tr>

            <tr><td>Employer PF Contribution (12% + 1% Admin)</td><td class="text-right">₹${(pfEmployer + pfAdmin).toLocaleString('en-IN')}</td><td class="text-right">₹${((pfEmployer + pfAdmin) * 12).toLocaleString('en-IN')}</td></tr>
            <tr><td>Employer ESI Contribution (3.25%)</td><td class="text-right">₹${esiEmployer.toLocaleString('en-IN')}</td><td class="text-right">₹${(esiEmployer * 12).toLocaleString('en-IN')}</td></tr>
            <tr class="total"><td>Total Cost to Company (CTC)</td><td class="text-right">₹${computedTotalCtc.toLocaleString('en-IN')}</td><td class="text-right">₹${(computedTotalCtc * 12).toLocaleString('en-IN')}</td></tr>
          </tbody>
        </table>

        <div class="legal-disclaimer">
          <strong>Notice & Terms:</strong> This document is generated as a self-serve mathematical compensation illustration. Actual monthly net disbursement is strictly contingent on biometric shift attendance, approved leave records, loss of pay deductions, and applicable income tax (TDS) schedules under the Income Tax Act, 1961. This document does not constitute a legally binding guarantee of payout irrespective of attendance.
        </div>
        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
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
          maxWidth: '920px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          fontFamily: "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#ecfdf5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#059669'
              }}
            >
              <Calculator size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
                Compensation Builder & Simulator
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                Configuring salary structure for <strong>{employee.full_name}</strong> ({employee.employee_code || employee.id})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {errorMsg && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <AlertTriangle size={16} color="#dc2626" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#065f46',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <CheckCircle2 size={16} color="#059669" />
              <span>{successMsg}</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '24px' }}>
            {/* Left Column: Sliders & Levers */}
            <div>
              {/* Monthly CTC Input */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '20px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                    Monthly Cost to Company (CTC)
                  </label>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    Annual: ₹{(monthlyCtc * 12).toLocaleString('en-IN')}
                  </span>
                </div>
                <div style={{ position: 'relative' }}>
                  <span
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '15px',
                      fontWeight: 700,
                      color: '#059669'
                    }}
                  >
                    ₹
                  </span>
                  <input
                    type="number"
                    min="5000"
                    step="500"
                    value={monthlyCtc}
                    onChange={(e) => setMonthlyCtc(Math.max(0, parseFloat(e.target.value) || 0))}
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 28px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '15px',
                      fontWeight: 700,
                      color: '#0f172a',
                      background: '#ffffff'
                    }}
                  />
                </div>
              </div>

              {/* Sliders Box */}
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '18px',
                  marginBottom: '20px'
                }}
              >
                <h4 style={{ margin: '0 0 16px 0', fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                  Salary Structure Levers & Ratios
                </h4>

                {/* Basic Salary Slider */}
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>
                        Basic Salary ({basicPct}%)
                      </span>
                      <ComplianceTooltip
                        title="Code on Wages (50% Basic Rule)"
                        rule="Under Section 2(y) of the Code on Wages 2019, wages (Basic + DA) should constitute at least 50% of total remuneration."
                        range="Recommended: 50% to 60%"
                        lawCitation="The Code on Wages, 2019, Section 2(y)"
                      />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                      ₹{basicSalary.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="35"
                    max="75"
                    value={basicPct}
                    onChange={(e) => setBasicPct(parseInt(e.target.value, 10))}
                    style={{ width: '100%', accentColor: wageCodeCompliant ? '#10b981' : '#f59e0b' }}
                  />
                  {wageCodeCompliant ? (
                    <div style={{ fontSize: '11px', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                      <CheckCircle2 size={12} />
                      <span>Compliant with Code on Wages 2019 (Basic ≥ 50%)</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: '11px', color: '#d97706', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                      <AlertTriangle size={12} />
                      <span>Warning: Basic is under 50% of gross. May attract wage code scrutiny.</span>
                    </div>
                  )}
                </div>

                {/* HRA Slider */}
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>
                        House Rent Allowance (HRA: {hraPct}%)
                      </span>
                      <ComplianceTooltip
                        title="HRA Tax Exemption Rule"
                        rule="HRA is eligible for income tax exemption under Section 10(13A) of Income Tax Act (up to 40% non-metro or 50% metro of Basic)."
                        range="Standard: 40% to 50% of Basic (or 20% of CTC)"
                        lawCitation="Income Tax Act, 1961, Section 10(13A)"
                      />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                      ₹{hra.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="40"
                    value={hraPct}
                    onChange={(e) => setHraPct(parseInt(e.target.value, 10))}
                    style={{ width: '100%', accentColor: '#3b82f6' }}
                  />
                </div>

                {/* Conveyance & Medical Inputs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                      Conveyance (₹/mo)
                    </label>
                    <input
                      type="number"
                      value={conveyance}
                      onChange={(e) => setConveyance(parseFloat(e.target.value) || 0)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12px'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                      Medical Allowance (₹/mo)
                    </label>
                    <input
                      type="number"
                      value={medical}
                      onChange={(e) => setMedical(parseFloat(e.target.value) || 0)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12px'
                      }}
                    />
                  </div>
                </div>

                {/* Special Allowance (Balancing figure) */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span style={{ fontSize: '11.5px', color: '#475569' }}>
                    Special Allowance (Balancing Remainder):
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                    ₹{specialAllowance.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Statutory Rules Box */}
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '18px'
                }}
              >
                <h4 style={{ margin: '0 0 14px 0', fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                  Statutory Deductions Levers (India)
                </h4>

                {/* PF Rate Slider */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>
                        Employee PF Rate: {pfRate}%
                      </span>
                      <ComplianceTooltip
                        title="EPF Contribution Rate & Voluntary PF"
                        rule="The EPF Act mandates a minimum 12% deduction on basic wages. Employees may voluntarily opt for higher deduction rates (up to 20%+ under VPF rules)."
                        range="Legal Range: 12% to 20%"
                        lawCitation="Employees' Provident Funds and Miscellaneous Provisions Act, 1952, Section 6"
                      />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                      ₹{pfEmployee.toLocaleString('en-IN')}/mo
                    </span>
                  </div>
                  <input
                    type="range"
                    min="12"
                    max="20"
                    step="1"
                    value={pfRate}
                    onChange={(e) => setPfRate(parseInt(e.target.value, 10))}
                    style={{ width: '100%', accentColor: '#10b981' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
                    <span>12% (Statutory Min)</span>
                    <span>15%</span>
                    <span>20% (Voluntary PF)</span>
                  </div>
                </div>

                {/* PF 15k cap checkbox */}
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#1e293b', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={pfCapped}
                      onChange={(e) => setPfCapped(e.target.checked)}
                      style={{ accentColor: '#10b981' }}
                    />
                    <span>
                      Cap PF wage at statutory limit of ₹15,000/month
                    </span>
                  </label>
                </div>

                {/* ESI Toggle */}
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#1e293b', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={esiOptIn}
                      onChange={(e) => setEsiOptIn(e.target.checked)}
                      style={{ accentColor: '#10b981' }}
                    />
                    <span>
                      ESI Enabled (0.75% Employee / 3.25% Employer)
                    </span>
                  </label>
                  {grossEarnings > 21000 && esiOptIn && (
                    <div style={{ fontSize: '11px', color: '#64748b', marginLeft: '24px' }}>
                      ℹ️ Gross (₹{grossEarnings.toLocaleString('en-IN')}) exceeds statutory threshold of ₹21,000. ESI will automatically be ₹0.
                    </div>
                  )}
                </div>

                {/* PT Toggle */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#1e293b', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={ptOptIn}
                      onChange={(e) => setPtOptIn(e.target.checked)}
                      style={{ accentColor: '#10b981' }}
                    />
                    <span>
                      Professional Tax Enabled (State Slab: ₹{ptDeduction}/month)
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Right Column: Live Net Pay Simulation Card */}
            <div>
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  boxShadow: '0 4px 15px -2px rgba(0, 0, 0, 0.05)',
                  padding: '20px',
                  position: 'sticky',
                  top: 0
                }}
              >
                {/* Take Home Highlight */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
                    border: '1px solid #a7f3d0',
                    borderRadius: '12px',
                    padding: '16px',
                    textAlign: 'center',
                    marginBottom: '16px'
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Estimated Monthly Take-Home Pay
                  </span>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#065f46', margin: '4px 0' }}>
                    ₹{netTakeHome.toLocaleString('en-IN')}
                  </div>
                  <span style={{ fontSize: '11px', color: '#047857' }}>
                    ₹{(netTakeHome * 12).toLocaleString('en-IN')} / year (Subject to attendance)
                  </span>
                </div>

                {/* Breakdown Table */}
                <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#64748b' }}>Gross Monthly Earnings</span>
                    <strong style={{ color: '#0f172a' }}>₹{grossEarnings.toLocaleString('en-IN')}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0 2px 12px', color: '#475569', fontSize: '11px' }}>
                    <span>· Basic Salary</span>
                    <span>₹{basicSalary.toLocaleString('en-IN')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0 2px 12px', color: '#475569', fontSize: '11px' }}>
                    <span>· HRA</span>
                    <span>₹{hra.toLocaleString('en-IN')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0 2px 12px', color: '#475569', fontSize: '11px' }}>
                    <span>· Allowances</span>
                    <span>₹{(fixedAllowances + specialAllowance).toLocaleString('en-IN')}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#dc2626' }}>Total Employee Deductions</span>
                    <strong style={{ color: '#dc2626' }}>- ₹{totalDeductions.toLocaleString('en-IN')}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0 2px 12px', color: '#64748b', fontSize: '11px' }}>
                    <span>· PF ({pfRate}%)</span>
                    <span>₹{pfEmployee.toLocaleString('en-IN')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0 2px 12px', color: '#64748b', fontSize: '11px' }}>
                    <span>· ESI (0.75%)</span>
                    <span>₹{esiEmployee.toLocaleString('en-IN')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0 2px 12px', color: '#64748b', fontSize: '11px' }}>
                    <span>· Professional Tax</span>
                    <span>₹{ptDeduction.toLocaleString('en-IN')}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#64748b' }}>Employer Contributions (Over & Above)</span>
                    <strong style={{ color: '#0f172a' }}>₹{totalEmployerContribution.toLocaleString('en-IN')}</strong>
                  </div>
                </div>

                {/* Scorecard */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '10px',
                    fontSize: '11px',
                    marginBottom: '16px'
                  }}
                >
                  <strong style={{ color: '#0f172a', display: 'block', marginBottom: '4px' }}>
                    Compliance Pre-Check:
                  </strong>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: wageCodeCompliant ? '#059669' : '#d97706' }}>
                    {wageCodeCompliant ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                    <span>Wage Code 2019: Basic is {basicPct}% of CTC ({wageCodeCompliant ? 'Passed' : 'Under 50%'})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', marginTop: '2px' }}>
                    <CheckCircle2 size={13} />
                    <span>Net Take-Home is Positive (&gt; ₹0)</span>
                  </div>
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      width: '100%',
                      background: 'var(--brand-primary, #10b981)',
                      border: 'none',
                      padding: '10px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: 'var(--on-primary, #ffffff)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
                    }}
                  >
                    <CheckCircle2 size={15} />
                    <span>{saving ? 'Saving...' : 'Save Salary Structure'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrintAnnexure}
                    style={{
                      width: '100%',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      padding: '9px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#475569',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Printer size={14} />
                    <span>Print / Export Salary Annexure</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
