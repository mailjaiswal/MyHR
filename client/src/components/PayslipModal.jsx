import React, { useState, useEffect } from 'react';
import { X, Printer, Download, ShieldCheck, Activity, History } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import useEscapeClose from '../hooks/useEscapeClose';
import { formatMonthYear } from '../utils/format';

export default function PayslipModal({ isOpen, onClose, payslipData, employeeId, onViewPayslip }) {
  const { authFetch } = useAuth();
  const [history, setHistory] = useState([]);

  useEscapeClose(isOpen, onClose);

  // Load this employee's payslip history so prior months can be viewed from here.
  useEffect(() => {
    let active = true;
    if (isOpen && employeeId) {
      authFetch(`/api/v1/payroll/employee/${employeeId}/history`)
        .then(r => r.json())
        .then(d => { if (active && d.success) setHistory(d.history || []); })
        .catch(() => { /* non-critical */ });
    } else if (!isOpen) {
      setHistory([]);
    }
    return () => { active = false; };
  }, [isOpen, employeeId, authFetch]);

  if (!isOpen || !payslipData) return null;

  const { hospital, payslip } = payslipData;

  const currentMonth = payslip?.month_year;

  const handleMonthChange = (e) => {
    const selected = e.target.value;
    if (selected && onViewPayslip && employeeId) {
      onViewPayslip(employeeId, selected);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 60,
      padding: '1.5rem',
      overflowY: 'auto'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '48rem',
        background: '#ffffff',
        color: '#1e293b',
        borderRadius: '1rem',
        padding: '2rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        position: 'relative',
        maxHeight: '90vh',
        overflowY: 'auto'
      }} id="printable-payslip">
        
        {/* Action Controls (Hidden when printing) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid #e2e8f0'
        }} className="no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.25rem 0.625rem',
              borderRadius: '9999px',
              background: '#ecfdf5',
              color: '#059669',
              border: '1px solid #a7f3d0'
            }}>
              CONFIDENTIAL SALARY STATEMENT
            </span>
            {history.length > 1 && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                <History size={14} color="#059669" />
                <select
                  value={currentMonth || ''}
                  onChange={handleMonthChange}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '0.375rem',
                    padding: '0.3rem 0.5rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#0f172a',
                    background: '#ffffff',
                    cursor: 'pointer'
                  }}
                >
                  {history.map(h => (
                    <option key={h.month_year} value={h.month_year}>
                      {formatMonthYear(h.month_year)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={handlePrint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                background: '#10b981',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.8125rem',
                cursor: 'pointer'
              }}
            >
              <Printer size={16} />
              <span>Print / Save PDF</span>
            </button>
            <button
              onClick={onClose}
              style={{
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '0.5rem',
                color: '#64748b',
                padding: '0.5rem',
                cursor: 'pointer'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Company Letterhead Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem', borderBottom: '2px solid #0f172a', paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <Activity size={24} color="#059669" />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a' }}>
              {hospital?.NAME || 'Your Company Pvt Ltd'}
            </h2>
          </div>
          <p style={{ fontSize: '0.8125rem', color: '#475569' }}>
            {hospital?.ADDRESS}
          </p>
          <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Reg. No: <strong>{hospital?.REGISTRATION_NO}</strong> • GSTIN: <strong>{hospital?.GSTIN}</strong>
          </p>
          <div style={{
            display: 'inline-block',
            marginTop: '0.75rem',
            padding: '0.25rem 1rem',
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            fontWeight: 700,
            color: '#0f172a'
          }}>
            PAYSLIP FOR THE MONTH OF: {formatMonthYear(payslip?.month_year)}
          </div>
        </div>

        {/* Employee Profile & Biometric Hours Summary */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1.25rem',
          background: '#f8fafc',
          padding: '1rem',
          borderRadius: '0.5rem',
          border: '1px solid #e2e8f0',
          marginBottom: '1.5rem',
          fontSize: '0.8125rem'
        }}>
          <div>
            <p style={{ marginBottom: '0.25rem' }}>Employee Name: <strong style={{ color: '#0f172a' }}>{payslip?.full_name}</strong></p>
            <p style={{ marginBottom: '0.25rem' }}>Employee ID: <strong>{payslip?.employee_code}</strong></p>
            <p style={{ marginBottom: '0.25rem' }}>Designation: <strong>{payslip?.designation}</strong></p>
            <p style={{ marginBottom: '0.25rem' }}>Department: <strong>{payslip?.department_name}</strong></p>
            <p>Assigned Shift: <strong>{payslip?.shift_name}</strong></p>
          </div>

          <div>
            <p style={{ marginBottom: '0.25rem' }}>Bank Name: <strong>{payslip?.bank_name}</strong></p>
            <p style={{ marginBottom: '0.25rem' }}>Account No: <strong>{payslip?.bank_account}</strong></p>
            <p style={{ marginBottom: '0.25rem' }}>IFSC Code: <strong>{payslip?.bank_ifsc}</strong></p>
            <p style={{ marginBottom: '0.25rem' }}>PF UAN: <strong>{payslip?.uan || 'N/A'}</strong></p>
            <p>ESIC IP No: <strong>{payslip?.esi_ip || 'Exempt (> ₹21k)'}</strong></p>
          </div>
        </div>

        {/* Biometric Attendance Strip */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderRadius: '0.5rem',
          padding: '0.75rem',
          textAlign: 'center',
          marginBottom: '1.5rem',
          fontSize: '0.8125rem'
        }}>
          <div>
            <span style={{ color: '#047857', fontSize: '0.6875rem', fontWeight: 600 }}>CALENDAR DAYS</span>
            <p style={{ fontWeight: 800, fontSize: '1rem', color: '#065f46' }}>{payslip?.calendar_days}</p>
          </div>
          <div>
            <span style={{ color: '#047857', fontSize: '0.6875rem', fontWeight: 600 }}>PAYABLE DAYS</span>
            <p style={{ fontWeight: 800, fontSize: '1rem', color: '#065f46' }}>{payslip?.payable_days}</p>
          </div>
          <div>
            <span style={{ color: '#047857', fontSize: '0.6875rem', fontWeight: 600 }}>ABSENT DAYS</span>
            <p style={{ fontWeight: 800, fontSize: '1rem', color: '#b91c1c' }}>{payslip?.absent_days}</p>
          </div>
          <div>
            <span style={{ color: '#047857', fontSize: '0.6875rem', fontWeight: 600 }}>BIOMETRIC HOURS</span>
            <p style={{ fontWeight: 800, fontSize: '1rem', color: '#065f46' }}>{payslip?.total_hours_worked}h</p>
          </div>
          <div>
            <span style={{ color: '#047857', fontSize: '0.6875rem', fontWeight: 600 }}>OVERTIME LOGGED</span>
            <p style={{ fontWeight: 800, fontSize: '1rem', color: '#4338ca' }}>{payslip?.overtime_hours}h</p>
          </div>
        </div>

        {/* Dual Column: Earnings vs Deductions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {/* Earnings */}
          <div style={{ border: '1px solid #cbd5e1', borderRadius: '0.5rem', overflow: 'hidden' }}>
            <div style={{ background: '#f1f5f9', padding: '0.5rem 0.75rem', fontWeight: 700, fontSize: '0.8125rem', borderBottom: '1px solid #cbd5e1' }}>
              EARNINGS (INR)
            </div>
            <div style={{ padding: '0.75rem', fontSize: '0.8125rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Basic Salary (45%)</span>
                <strong>₹{payslip?.basic?.toLocaleString('en-IN')}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>House Rent Allowance (HRA 20%)</span>
                <strong>₹{payslip?.hra?.toLocaleString('en-IN')}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Medical Allowance</span>
                <strong>₹{payslip?.medical_allowance?.toLocaleString('en-IN')}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Special Allowance</span>
                <strong>₹{payslip?.special_allowance?.toLocaleString('en-IN')}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4338ca' }}>
                <span>Overtime Allowance (1.5x)</span>
                <strong>₹{payslip?.overtime_pay?.toLocaleString('en-IN')}</strong>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '0.5rem',
                borderTop: '2px solid #cbd5e1',
                fontWeight: 800,
                color: '#0f172a'
              }}>
                <span>GROSS EARNINGS</span>
                <span>₹{payslip?.gross_earnings?.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Deductions */}
          <div style={{ border: '1px solid #cbd5e1', borderRadius: '0.5rem', overflow: 'hidden' }}>
            <div style={{ background: '#f1f5f9', padding: '0.5rem 0.75rem', fontWeight: 700, fontSize: '0.8125rem', borderBottom: '1px solid #cbd5e1' }}>
              STATUTORY DEDUCTIONS (INR)
            </div>
            <div style={{ padding: '0.75rem', fontSize: '0.8125rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Provident Fund (EPF 12%)</span>
                <strong>₹{payslip?.epf_deduction?.toLocaleString('en-IN')}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>ESIC Employee (0.75%)</span>
                <strong>₹{payslip?.esic_deduction?.toLocaleString('en-IN')}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>MP Professional Tax (PT)</span>
                <strong>₹{payslip?.pt_deduction?.toLocaleString('en-IN')}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Income Tax (TDS)</span>
                <strong>₹{payslip?.tds_deduction?.toLocaleString('en-IN')}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span>Other Deductions</span>
                <strong>₹0</strong>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '0.5rem',
                borderTop: '2px solid #cbd5e1',
                fontWeight: 800,
                color: '#b91c1c'
              }}>
                <span>TOTAL DEDUCTIONS</span>
                <span>₹{payslip?.total_deductions?.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Net Salary in Figures and Words */}
        <div style={{
          background: '#0f172a',
          color: '#ffffff',
          borderRadius: '0.5rem',
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem'
        }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>NET TAKE-HOME SALARY</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34d399' }}>
              ₹{payslip?.net_salary?.toLocaleString('en-IN')}
            </div>
          </div>
          <div style={{ textAlign: 'right', maxWidth: '60%' }}>
            <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>AMOUNT IN WORDS:</span>
            <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#f8fafc' }}>
              {payslip?.netSalaryInWords}
            </p>
          </div>
        </div>

        {/* Signatures & Disclaimers (Dynamic from DB mock data) */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '2rem',
          paddingTop: '1.5rem',
          borderTop: '1px dashed #cbd5e1',
          fontSize: '0.75rem',
          color: '#64748b'
        }}>
          <div>
            <p>Prepared by: <strong>{hospital?.CONTACT_PERSON || 'HR Administrator'}</strong></p>
            <p>{hospital?.INDUSTRY_LABEL ? 'HR & Administration' : 'HR & Administration'}</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p>Verified by: <strong>{hospital?.DIRECTOR || 'Management'}</strong></p>
            <p>{hospital?.DIRECTOR_TITLE || 'Management'}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p>Employee Signature: <strong>{payslip?.full_name}</strong></p>
            <p>Computer Generated Salary Voucher</p>
          </div>
        </div>

      </div>
    </div>
  );
}
