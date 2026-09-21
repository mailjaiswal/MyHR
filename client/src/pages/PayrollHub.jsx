import React, { useState, useEffect } from 'react';
import MetricCard from '../components/MetricCard';
import { FileSpreadsheet, Download, RefreshCw, CheckCircle, IndianRupee, Landmark, FileCode, ArrowUpRight } from 'lucide-react';

export default function PayrollHub({ onOpenPayslip }) {
  const [selectedMonth, setSelectedMonth] = useState('2026-08');
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState(null);

  const fetchSalaryRegister = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/payroll/slips/${selectedMonth}`);
      const data = await res.json();
      if (data.success) {
        setSlips(data.slips);
      } else {
        setSlips([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalaryRegister();
  }, [selectedMonth]);

  const handleProcessPayroll = async () => {
    setProcessing(true);
    setMessage(null);
    try {
      const res = await fetch('/api/v1/payroll/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthYear: selectedMonth })
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`Payroll processed successfully for ${selectedMonth}!`);
        fetchSalaryRegister();
      }
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const totalGross = slips.reduce((sum, s) => sum + s.gross_earnings, 0);
  const totalEpf = slips.reduce((sum, s) => sum + s.epf_deduction, 0);
  const totalEsic = slips.reduce((sum, s) => sum + s.esic_deduction, 0);
  const totalPt = slips.reduce((sum, s) => sum + s.pt_deduction, 0);
  const totalNet = slips.reduce((sum, s) => sum + s.net_salary, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Header & 1-Click Action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>
            Automated Statutory Payroll Hub
          </h2>
          <p style={{ marginTop: '0.2rem' }}>
            Directly computed from biometric logged hours, payable days, EPF 12%, ESIC 0.75%, and MP Professional Tax
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <select
            className="input-clean"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ width: 'auto', fontWeight: 800 }}
          >
            <option value="2026-08">August 2026 (Finalized)</option>
            <option value="2026-09">September 2026 (Run Live)</option>
          </select>

          <button
            onClick={handleProcessPayroll}
            disabled={processing}
            className="btn-swaniki btn-swaniki-primary"
          >
            <RefreshCw size={15} className={processing ? 'animate-spin' : ''} />
            <span>{processing ? 'Calculating...' : '1-Click Run Payroll'}</span>
          </button>
        </div>
      </div>

      {message && (
        <div style={{
          padding: '0.875rem 1.25rem',
          borderRadius: '0.75rem',
          background: 'var(--brand-primary-light)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.8125rem',
          color: 'var(--brand-primary)',
          fontWeight: 700
        }}>
          <CheckCircle size={18} />
          <span>{message}</span>
        </div>
      )}

      {/* Financial KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
        <MetricCard
          title="Total Gross Payout"
          value={`₹${Math.round(totalGross).toLocaleString('en-IN')}`}
          subtitle="Basic, HRA & OT"
          icon={IndianRupee}
          color="blue"
        />
        <MetricCard
          title="Total EPF (12%)"
          value={`₹${Math.round(totalEpf).toLocaleString('en-IN')}`}
          subtitle="Employee PF Contribution"
          icon={Landmark}
          color="amber"
        />
        <MetricCard
          title="Total ESIC (0.75%)"
          value={`₹${Math.round(totalEsic).toLocaleString('en-IN')}`}
          subtitle="Gross <= ₹21,000 Staff"
          icon={FileSpreadsheet}
          color="indigo"
        />
        <MetricCard
          title="MP Professional Tax"
          value={`₹${Math.round(totalPt).toLocaleString('en-IN')}`}
          subtitle="State Statutory Slabs"
          icon={FileSpreadsheet}
          color="amber"
        />
        <MetricCard
          title="Net Take-Home Disbursal"
          value={`₹${Math.round(totalNet).toLocaleString('en-IN')}`}
          subtitle="Direct Bank NEFT Amount"
          icon={IndianRupee}
          color="emerald"
          badgeText="Disbursal Ready"
        />
      </div>

      {/* Banking & Exports Bar */}
      <div className="swaniki-card-flat" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', padding: '1.25rem 1.5rem' }}>
        <div>
          <h4 style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'var(--text-heading)' }}>
            Financial Disbursal Soft Files
          </h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Pre-formatted bulk payment files for SBI Corporate Net Banking and Tally Prime / ERP 9 XML
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <a
            href={`/api/v1/payroll/export/bank/${selectedMonth}`}
            className="btn-swaniki btn-swaniki-ghost"
            style={{ fontSize: '0.75rem' }}
          >
            <Download size={15} />
            <span>Export Bank NEFT (.csv)</span>
          </a>
          <a
            href={`/api/v1/payroll/export/tally/${selectedMonth}`}
            className="btn-swaniki btn-swaniki-ghost"
            style={{ fontSize: '0.75rem' }}
          >
            <FileCode size={15} />
            <span>Export Tally JV (.xml)</span>
          </a>
        </div>
      </div>

      {/* Salary Register Table */}
      <div className="swaniki-card">
        <div className="table-wrapper">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Staff Code &amp; Name</th>
                <th>Department</th>
                <th>Payable Days</th>
                <th>Total Hours</th>
                <th>Gross Earnings</th>
                <th>EPF (12%)</th>
                <th>ESIC (0.75%)</th>
                <th>MP PT</th>
                <th>Net Take-Home</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((s) => {
                const isSneha = s.full_name?.includes('Sneha Goswami');
                return (
                  <tr key={s.id} style={{ background: isSneha ? 'var(--brand-primary-light)' : undefined }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ color: isSneha ? 'var(--brand-primary)' : 'var(--text-heading)' }}>
                          {s.full_name}
                        </strong>
                        {isSneha && (
                          <span className="pill-badge pill-emerald" style={{ fontSize: '0.5625rem', padding: '0.05rem 0.35rem' }}>
                            DEMO NURSE
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{s.employee_code} • {s.designation}</span>
                    </td>
                    <td>{s.department_name}</td>
                    <td><strong style={{ color: 'var(--text-heading)' }}>{s.payable_days}</strong> / {s.calendar_days}</td>
                    <td>{s.total_hours_worked}h</td>
                    <td>₹{s.gross_earnings?.toLocaleString('en-IN')}</td>
                    <td>₹{s.epf_deduction?.toLocaleString('en-IN')}</td>
                    <td>{s.esic_deduction > 0 ? `₹${s.esic_deduction}` : '—'}</td>
                    <td>₹{s.pt_deduction}</td>
                    <td>
                      <strong style={{ color: 'var(--brand-primary)', fontSize: '0.9375rem' }}>
                        ₹{s.net_salary?.toLocaleString('en-IN')}
                      </strong>
                    </td>
                    <td>
                      <button
                        onClick={() => onOpenPayslip(s.employee_id, s.month_year)}
                        className="btn-swaniki btn-swaniki-primary"
                        style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                      >
                        View Slip
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
