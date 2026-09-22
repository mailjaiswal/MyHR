import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import useEscapeClose from '../hooks/useEscapeClose';
import {
  X,
  FileText,
  Download,
  Printer,
  Calendar,
  Filter,
  CheckCircle2,
  Building2,
  Table,
  Sparkles,
  Layers
} from 'lucide-react';

export default function CustomReportModal({ isOpen, onClose }) {
  const { isDark } = useTheme();
  const { user } = useAuth();

  const [reportType, setReportType] = useState('MUSTER');
  const [durationPreset, setDurationPreset] = useState('MONTH');
  const [startDate, setStartDate] = useState('2026-09-01');
  const [endDate, setEndDate] = useState('2026-09-30');
  const [department, setDepartment] = useState('ALL');
  const [generatedReport, setGeneratedReport] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEscapeClose(isOpen, onClose);

  if (!isOpen) return null;

  const reportTypes = [
    { id: 'MUSTER', label: 'Attendance Muster Roll', desc: 'Daily punch logs, hours rendered, and 7.45h threshold compliance' },
    { id: 'STATUTORY', label: 'Statutory EPF & ESIC Register', desc: 'Indian statutory wage ceilings, 12% EPF, and 0.75% ESIC computation' },
    { id: 'OVERTIME', label: 'Overtime & Shift Allowance', desc: '1.5x hourly rate overtime hours and night duty shift allowances' },
    { id: 'GRACE', label: 'Punctuality & Grace Audit', desc: '15-minute grace period tracking and shift punctuality analysis' },
    { id: 'WARD_COVERAGE', label: 'Ward Staffing & Roster Audit', desc: 'Minimum staffing ratio audits for ICU, OT, and Emergency wards' }
  ];

  const handlePresetChange = (preset) => {
    setDurationPreset(preset);
    const today = new Date('2026-09-15');
    if (preset === 'TODAY') {
      setStartDate('2026-09-15');
      setEndDate('2026-09-15');
    } else if (preset === 'WEEK') {
      setStartDate('2026-09-08');
      setEndDate('2026-09-15');
    } else if (preset === 'MONTH') {
      setStartDate('2026-09-01');
      setEndDate('2026-09-30');
    } else if (preset === 'LAST_MONTH') {
      setStartDate('2026-08-01');
      setEndDate('2026-08-31');
    } else if (preset === 'QUARTER') {
      setStartDate('2026-07-01');
      setEndDate('2026-09-30');
    }
  };

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      // Generate realistic sample records based on the filter
      const sampleStaff = [
        { id: 'DNH-101', name: 'Sneha Goswami', role: 'Senior Staff Nurse', dept: 'ICU Ward', daysPresent: 28, daysHalf: 1, daysAbsent: 1, totalHours: '232.5h', otHours: '14.5h', epfWages: '₹15,000', epfDeduction: '₹1,800', esic: '₹0', netPay: '₹30,157' },
        { id: 'DNH-102', name: 'Dr. Priya Sharma', role: 'HR & Medical Supt', dept: 'Administration', daysPresent: 26, daysHalf: 0, daysAbsent: 0, totalHours: '208.0h', otHours: '4.0h', epfWages: '₹15,000', epfDeduction: '₹1,800', esic: '₹0', netPay: '₹62,400' },
        { id: 'DNH-103', name: 'Rajesh Patel', role: 'ICU Staff Nurse', dept: 'ICU Ward', daysPresent: 25, daysHalf: 2, daysAbsent: 1, totalHours: '205.0h', otHours: '8.0h', epfWages: '₹14,200', epfDeduction: '₹1,704', esic: '₹195', netPay: '₹24,850' },
        { id: 'DNH-104', name: 'Anjali Verma', role: 'OT Staff Nurse', dept: 'Operation OT', daysPresent: 27, daysHalf: 0, daysAbsent: 1, totalHours: '216.0h', otHours: '6.5h', epfWages: '₹15,000', epfDeduction: '₹1,800', esic: '₹0', netPay: '₹27,620' },
        { id: 'DNH-105', name: 'Vikas Deshmukh', role: 'OT Technician', dept: 'Operation OT', daysPresent: 26, daysHalf: 1, daysAbsent: 1, totalHours: '209.5h', otHours: '2.5h', epfWages: '₹13,500', epfDeduction: '₹1,620', esic: '₹165', netPay: '₹20,410' },
        { id: 'DNH-106', name: 'Sunita Yadav', role: 'General Ward Nurse', dept: 'Inpatient Wards', daysPresent: 24, daysHalf: 3, daysAbsent: 1, totalHours: '198.0h', otHours: '0.0h', epfWages: '₹12,800', epfDeduction: '₹1,536', esic: '₹152', netPay: '₹18,920' },
        { id: 'DNH-107', name: 'Manoj Kumar', role: 'Ward Attendant', dept: 'Emergency', daysPresent: 26, daysHalf: 0, daysAbsent: 2, totalHours: '208.0h', otHours: '10.0h', epfWages: '₹11,000', epfDeduction: '₹1,320', esic: '₹120', netPay: '₹14,750' }
      ];

      const filtered = department === 'ALL'
        ? sampleStaff
        : sampleStaff.filter(s => s.dept.toLowerCase().includes(department.toLowerCase()));

      setGeneratedReport({
        type: reportTypes.find(r => r.id === reportType)?.label,
        dateRange: `${startDate} to ${endDate}`,
        generatedAt: new Date().toLocaleString('en-IN'),
        generatedBy: user?.name || 'Super Admin',
        records: filtered,
        summary: {
          totalStaff: filtered.length,
          totalShifts: filtered.reduce((acc, r) => acc + r.daysPresent, 0),
          totalOTHours: filtered.reduce((acc, r) => acc + parseFloat(r.otHours), 0).toFixed(1) + ' hrs',
          totalEPF: '₹' + filtered.reduce((acc, r) => acc + parseInt(r.epfDeduction.replace(/[^0-9]/g, '') || 0), 0).toLocaleString('en-IN')
        }
      });
      setIsGenerating(false);
    }, 400);
  };

  const handleDownloadCSV = () => {
    if (!generatedReport) return;
    const headers = ['Staff ID', 'Name', 'Role', 'Department', 'Days Present', 'Half Days', 'Absent Days', 'Total Hours', 'Overtime Hours', 'EPF Deduction', 'Net Pay'];
    const rows = generatedReport.records.map(r => [
      r.id,
      r.name,
      r.role,
      r.dept,
      r.daysPresent,
      r.daysHalf,
      r.daysAbsent,
      r.totalHours,
      r.otHours,
      r.epfDeduction,
      r.netPay
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Attendance_${reportType}_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      zIndex: 110,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div
        className="swaniki-card"
        style={{
          width: '100%',
          maxWidth: '1020px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderRadius: '1.25rem',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '1.25rem 1.75rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-surface-subtle)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <FileText size={20} color="var(--brand-primary)" />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
                Executive Custom Report Generator
              </h2>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Create audit-ready reports for any time window • Statutory Compliance & Biometric Reconciliation
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-heading)',
              borderRadius: '0.625rem',
              width: '2rem',
              height: '2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Controls Body */}
        <div style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Form Filter Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1.25rem',
            padding: '1.25rem',
            borderRadius: '1rem',
            background: 'var(--bg-surface-subtle)',
            border: '1px solid var(--border-color)'
          }}>
            {/* 1. Report Type */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '0.4rem' }}>
                Report Type
              </label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-heading)',
                  fontSize: '0.8125rem',
                  outline: 'none'
                }}
              >
                {reportTypes.map(rt => (
                  <option key={rt.id} value={rt.id}>{rt.label}</option>
                ))}
              </select>
            </div>

            {/* 2. Duration Preset */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '0.4rem' }}>
                Period Preset
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                {[
                  { id: 'TODAY', label: 'Today' },
                  { id: 'WEEK', label: 'This Week' },
                  { id: 'MONTH', label: 'Sep 2026' },
                  { id: 'LAST_MONTH', label: 'Aug 2026' },
                  { id: 'CUSTOM', label: 'Custom' }
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => handlePresetChange(p.id)}
                    style={{
                      padding: '0.3rem 0.6rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.72rem',
                      fontWeight: 500,
                      border: '1px solid var(--border-color)',
                      background: durationPreset === p.id
                        ? (isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)')
                        : 'var(--bg-surface)',
                      color: durationPreset === p.id
                        ? (isDark ? '#0a0c10' : '#ffffff')
                        : 'var(--text-body)',
                      cursor: 'pointer'
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Date Inputs */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '0.4rem' }}>
                Date Range
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setDurationPreset('CUSTOM'); }}
                  style={{
                    flex: 1,
                    padding: '0.45rem 0.5rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-heading)',
                    fontSize: '0.75rem',
                    outline: 'none'
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setDurationPreset('CUSTOM'); }}
                  style={{
                    flex: 1,
                    padding: '0.45rem 0.5rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-heading)',
                    fontSize: '0.75rem',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* 4. Department Filter */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '0.4rem' }}>
                Ward / Department
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-heading)',
                  fontSize: '0.8125rem',
                  outline: 'none'
                }}
              >
                <option value="ALL">All Departments</option>
                <option value="ICU">ICU Ward</option>
                <option value="Emergency">Emergency Casualty</option>
                <option value="Operation OT">Operation OT</option>
                <option value="Inpatient">General Inpatient Wards</option>
                <option value="Administration">Administration & Labs</option>
              </select>
            </div>
          </div>

          {/* Action Trigger Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="btn-swaniki btn-swaniki-primary"
              style={{
                padding: '0.625rem 1.5rem',
                fontSize: '0.875rem',
                background: isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)',
                color: isDark ? '#0a0c10' : '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <Sparkles size={16} />
              <span>{isGenerating ? 'Compiling Report...' : 'Generate Audit Report'}</span>
            </button>
          </div>

          {/* Generated Report Preview */}
          {generatedReport && (
            <div style={{
              border: '1px solid var(--border-color)',
              borderRadius: '1rem',
              padding: '1.25rem',
              background: 'var(--bg-surface)'
            }}>
              {/* Report Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.875rem', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-heading)' }}>
                    {generatedReport.type}
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Duration: {generatedReport.dateRange} • Generated: {generatedReport.generatedAt}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={handleDownloadCSV}
                    className="btn-swaniki btn-swaniki-ghost"
                    style={{ padding: '0.4rem 0.85rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    <Download size={14} />
                    <span>Download CSV</span>
                  </button>
                  <button
                    onClick={handlePrint}
                    className="btn-swaniki btn-swaniki-ghost"
                    style={{ padding: '0.4rem 0.85rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    <Printer size={14} />
                    <span>Print PDF</span>
                  </button>
                </div>
              </div>

              {/* Report Summary Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1rem'
              }}>
                <div style={{ padding: '0.75rem', background: 'var(--bg-surface-subtle)', borderRadius: '0.5rem' }}>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>Covered Staff</div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-heading)' }}>{generatedReport.summary.totalStaff}</div>
                </div>
                <div style={{ padding: '0.75rem', background: 'var(--bg-surface-subtle)', borderRadius: '0.5rem' }}>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>Total Shift Punches</div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--brand-primary)' }}>{generatedReport.summary.totalShifts}</div>
                </div>
                <div style={{ padding: '0.75rem', background: 'var(--bg-surface-subtle)', borderRadius: '0.5rem' }}>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>Overtime Logged</div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--brand-amber)' }}>{generatedReport.summary.totalOTHours}</div>
                </div>
                <div style={{ padding: '0.75rem', background: 'var(--bg-surface-subtle)', borderRadius: '0.5rem' }}>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>Total EPF Contribution</div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--brand-cyan)' }}>{generatedReport.summary.totalEPF}</div>
                </div>
              </div>

              {/* Table Data */}
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '0.625rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface-subtle)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Staff Name</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Ward</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Present</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Half Day</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Hours</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>OT</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>EPF</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Net Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generatedReport.records.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '0.6rem 0.8rem', fontWeight: 600, color: 'var(--text-heading)' }}>
                          {row.name}
                        </td>
                        <td style={{ padding: '0.6rem 0.8rem', color: 'var(--text-body)' }}>{row.dept}</td>
                        <td style={{ padding: '0.6rem 0.8rem', color: 'var(--brand-primary)', fontWeight: 600 }}>{row.daysPresent}d</td>
                        <td style={{ padding: '0.6rem 0.8rem', color: 'var(--brand-amber)' }}>{row.daysHalf}d</td>
                        <td style={{ padding: '0.6rem 0.8rem', fontWeight: 600 }}>{row.totalHours}</td>
                        <td style={{ padding: '0.6rem 0.8rem', color: 'var(--brand-rose)' }}>{row.otHours}</td>
                        <td style={{ padding: '0.6rem 0.8rem' }}>{row.epfDeduction}</td>
                        <td style={{ padding: '0.6rem 0.8rem', fontWeight: 600, color: 'var(--text-heading)' }}>{row.netPay}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '1rem 1.75rem',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-surface-subtle)'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Super Admin & HR Privileged Export
          </div>
          <button
            onClick={onClose}
            className="btn-swaniki btn-swaniki-ghost"
            style={{ padding: '0.45rem 1.1rem', fontSize: '0.8125rem' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
