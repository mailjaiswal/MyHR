import React, { useState, useEffect, useCallback } from 'react';
import {
  Banknote,
  FileText,
  Download,
  Play,
  Loader2,
  Zap,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Lock,
  Unlock,
  CheckCircle2,
  ChevronDown,
  Building2,
  FileSpreadsheet,
  Mail,
  Eye,
  X,
  History,
  Archive,
  Scale
} from 'lucide-react';
import { useOrganization } from '../context/OrganizationContext';
import { useAuth } from '../context/AuthContext';
import { formatMonthYear } from '../utils/format';
import ComplianceTooltip from '../components/ComplianceTooltip';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function Payroll({ onOpenPayslip }) {
  const { org } = useOrganization();
  const { authFetch, hasPerm, user } = useAuth();
  const canView = hasPerm('PAYROLL_VIEW');
  const canProcess = hasPerm('PAYROLL_MANAGE');
  const canExport = hasPerm('EXPORTS');

  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [runs, setRuns] = useState([]);
  const [slips, setSlips] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState(null);

  // Anomaly Radar state
  const [anomalies, setAnomalies] = useState([]);
  const [checkingAnomalies, setCheckingAnomalies] = useState(false);
  const [showAnomalyDrawer, setShowAnomalyDrawer] = useState(false);

  // Lock & Sign-Off Modal state
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockNotes, setLockNotes] = useState('');
  const [ackDisclaimer, setAckDisclaimer] = useState(false);
  const [locking, setLocking] = useState(false);

  // Vault Modal state
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [vaultData, setVaultData] = useState(null);
  const [loadingVault, setLoadingVault] = useState(false);

  // Bank Export Menu state
  const [showBankMenu, setShowBankMenu] = useState(false);

  const api = useCallback(
    (path, opts = {}) =>
      authFetch(path, opts)
        .then((r) => r.json())
        .then((d) => (d.success ? d : { success: false, error: d.error })),
    [authFetch]
  );

  const download = useCallback(
    async (path, filename) => {
      try {
        const res = await authFetch(path);
        if (!res.ok) {
          alert('Export failed');
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        alert(err.message);
      }
    },
    [authFetch]
  );

  const loadAll = useCallback(() => {
    if (!canView) return;
    api('/api/v1/payroll/runs').then((d) => d.success && setRuns(d.runs));
    api(`/api/v1/payroll/slips/${month}`).then((d) => d.success && setSlips(d.slips));
    // Fetch anomalies for this month
    setCheckingAnomalies(true);
    api(`/api/v1/payroll/anomalies/${month}`)
      .then((d) => {
        if (d.success) setAnomalies(d.anomalies || []);
      })
      .finally(() => setCheckingAnomalies(false));
  }, [month, canView, api]);

  useEffect(loadAll, [loadAll]);

  const processPayroll = async () => {
    setProcessing(true);
    setMessage(null);
    try {
      const d = await api('/api/v1/payroll/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthYear: month })
      });
      if (d.success) {
        setMessage(d.message);
        loadAll();
      } else {
        alert(d.error || 'Payroll processing failed');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleLockPayroll = async () => {
    if (!ackDisclaimer) {
      alert('Please confirm the verification checkbox to lock and finalize payroll.');
      return;
    }
    setLocking(true);
    try {
      const d = await api('/api/v1/payroll/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthYear: month,
          notes: lockNotes,
          disclaimerAcknowledged: 1
        })
      });
      if (d.success) {
        setMessage(`✓ Payroll for ${month} locked successfully. Immutable snapshot saved to Vault.`);
        setShowLockModal(false);
        loadAll();
      } else {
        alert(d.error || 'Failed to lock payroll');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLocking(false);
    }
  };

  const openVault = async () => {
    setShowVaultModal(true);
    setLoadingVault(true);
    try {
      const d = await api(`/api/v1/payroll/vault/${month}`);
      if (d.success) {
        setVaultData(d.snapshot);
      } else {
        setVaultData(null);
      }
    } catch (err) {
      setVaultData(null);
    } finally {
      setLoadingVault(false);
    }
  };

  const currentRun = runs.find((r) => r.month_year === month);
  const isLocked = currentRun?.status === 'LOCKED';
  const totalNet = slips.reduce((acc, s) => acc + Number(s.net_salary || 0), 0);
  const totalGross = slips.reduce((acc, s) => acc + Number(s.gross_earnings || 0), 0);
  const totalDeductions = slips.reduce((acc, s) => acc + Number(s.total_deductions || 0), 0);
  const monthLabel = new Date(month + '-01T00:00:00').toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="page" style={{ fontFamily: "'Space Grotesk', -apple-system, sans-serif" }}>
      {/* Page Header */}
      <div className="page-head">
        <div className="page-title-wrap">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ margin: 0 }}>Statutory Payroll & Payouts</h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                background: '#ecfdf5',
                color: '#065f46',
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid #a7f3d0'
              }}
            >
              SELF-SERVE ENGINE
            </span>
          </div>
          <span className="page-desc">
            Indian statutory compliance, attendance-driven wages, and bank payout batches for {org?.name || 'your organisation'}.
          </span>
        </div>

        <div className="page-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="month"
            className="input"
            style={{ width: 175, background: '#ffffff' }}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />

          {canProcess && !isLocked && (
            <button className="btn btn-primary" onClick={processPayroll} disabled={processing}>
              {processing ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
              <span>Compute {monthLabel}</span>
            </button>
          )}

          {canProcess && slips.length > 0 && !isLocked && (
            <button
              type="button"
              onClick={() => {
                setAckDisclaimer(false);
                setShowLockModal(true);
              }}
              style={{
                background: '#ffffff',
                border: '1px solid #10b981',
                color: '#047857',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Lock size={14} />
              <span>Lock & Finalize</span>
            </button>
          )}

          {isLocked && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#334155'
              }}
            >
              <Lock size={13} color="#059669" />
              <span>LOCKED & FROZEN</span>
            </div>
          )}

          {currentRun && (
            <button
              type="button"
              onClick={openVault}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#475569',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="View immutable JSON snapshot in Payroll Vault"
            >
              <Archive size={14} />
              <span>Vault Snapshot</span>
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className="demo-banner"
          style={{
            borderColor: 'rgba(16,185,129,.4)',
            background: 'var(--brand-primary-light)',
            color: 'var(--brand-primary-ink)'
          }}
        >
          {message}
        </div>
      )}

      {/* Pre-Flight Anomaly Banner */}
      {anomalies.length > 0 && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fef3c7',
            borderLeft: '4px solid #f59e0b',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={20} color="#d97706" style={{ flexShrink: 0 }} />
            <div>
              <strong style={{ fontSize: '13px', color: '#92400e' }}>
                Pre-Flight Anomaly Radar: {anomalies.length} potential issue{anomalies.length !== 1 ? 's' : ''} detected
              </strong>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#b45309' }}>
                Screened for negative net wages, zero attendance, missing IFSC codes, and wage code threshold gaps.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAnomalyDrawer(!showAnomalyDrawer)}
            style={{
              background: '#ffffff',
              border: '1px solid #fcd34d',
              color: '#92400e',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {showAnomalyDrawer ? 'Hide Details' : `Review ${anomalies.length} Items`}
          </button>
        </div>
      )}

      {/* Expanded Anomaly Drawer */}
      {showAnomalyDrawer && anomalies.length > 0 && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #fed7aa',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '1.25rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#9a3412' }}>
              Detailed Pre-Flight Anomaly Log ({monthLabel})
            </h4>
            <span style={{ fontSize: '11px', color: '#78716c' }}>Self-Serve Pre-Disbursement Verification</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {anomalies.map((a, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: a.severity === 'CRITICAL' ? '#fef2f2' : '#f8fafc',
                  border: a.severity === 'CRITICAL' ? '1px solid #fecaca' : '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      background: a.severity === 'CRITICAL' ? '#dc2626' : '#f59e0b',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px'
                    }}
                  >
                    {a.severity}
                  </span>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{a.employee_name}</span>
                  <span style={{ color: '#64748b', fontSize: '11px' }}>({a.employee_code})</span>
                  <span style={{ color: '#475569' }}>— {a.issue}</span>
                </div>
                {a.type === 'WAGE_CODE_RATIO' && (
                  <ComplianceTooltip
                    title="Code on Wages 50% Rule"
                    rule={a.issue}
                    range="Basic >= 50% Gross"
                    lawCitation="Code on Wages 2019, Section 2(y)"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Stats Strip */}
      <div className="stat-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card">
          <span className="stat-label">
            <Banknote size={14} style={{ color: 'var(--brand-primary-ink)' }} /> Net Payout · {monthLabel}
          </span>
          <span className="stat-value">{inr(totalNet)}</span>
          <span className="stat-hint">{slips.length} employees calculated</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            <Scale size={14} style={{ color: '#2563eb' }} /> Gross Remuneration
          </span>
          <span className="stat-value">{inr(totalGross)}</span>
          <span className="stat-hint">Deductions: −{inr(totalDeductions)}</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            <Zap size={14} style={{ color: '#d97706' }} /> Run Status
          </span>
          <span className="stat-value">{isLocked ? 'Finalized & Locked' : currentRun ? 'Computed Draft' : 'Unprocessed'}</span>
          <span className="stat-hint">
            {currentRun?.approved_by ? `Approved by ${currentRun.approved_by}` : 'Requires admin verification'}
          </span>
        </div>
      </div>

      {/* Main Register Section */}
      <section className="section-card" style={{ marginBottom: '1.25rem' }}>
        <div className="section-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={16} />
            <span className="section-title">Salary Register · {monthLabel}</span>
          </div>

          {/* Action exports */}
          <div className="section-action" style={{ position: 'relative' }}>
            {canExport && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {/* Multi-bank dropdown */}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!currentRun}
                    onClick={() => setShowBankMenu(!showBankMenu)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Download size={13} />
                    <span>Bank Batch NEFT</span>
                    <ChevronDown size={13} />
                  </button>

                  {showBankMenu && (
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 'calc(100% + 4px)',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                        zIndex: 100,
                        width: '240px',
                        overflow: 'hidden'
                      }}
                    >
                      <div style={{ padding: '8px 12px', background: '#f8fafc', fontSize: '11px', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                        SELECT BANK CSV FORMAT
                      </div>
                      {[
                        { id: 'GENERIC_NEFT', label: 'Generic RBI NEFT (Standard)', desc: 'Beneficiary, IFSC, Account, Amount' },
                        { id: 'HDFC_CMS', label: 'HDFC Bank CMS Format', desc: 'Corporate NetBanking bulk salary' },
                        { id: 'ICICI_CIB', label: 'ICICI Bank CIB Format', desc: 'Corporate Internet Banking upload' },
                        { id: 'SBI_CMP', label: 'State Bank of India (CMP)', desc: 'SBI Corporate Cash Management' }
                      ].map((b) => (
                        <div
                          key={b.id}
                          onClick={() => {
                            setShowBankMenu(false);
                            download(
                              `/api/v1/payroll/export/bank-batch/${month}?format=${b.id}`,
                              `salary_batch_${b.id.toLowerCase()}_${month}.csv`
                            );
                          }}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid #f1f5f9',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                        >
                          <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>{b.label}</div>
                          <div style={{ fontSize: '10.5px', color: '#64748b' }}>{b.desc}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  className="btn btn-ghost btn-sm"
                  disabled={!currentRun}
                  onClick={() => download(`/api/v1/payroll/export/tally/${month}`, `tally_jv_${month}.xml`)}
                >
                  <Download size={13} /> Tally JV (XML)
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="table-wrap">
          <table className="swaniki-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Payable Days</th>
                <th>Gross Earnings</th>
                <th>Deductions</th>
                <th>Net Take-Home</th>
                <th>Bank & IFSC</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {slips.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{s.full_name}</div>
                      <div className="mono" style={{ fontSize: '0.6563rem', color: 'var(--text-caption)' }}>
                        {s.employee_code}
                      </div>
                    </div>
                  </td>
                  <td>{s.department_name}</td>
                  <td className="mono">{s.payable_days}</td>
                  <td className="mono">{inr(s.gross_earnings)}</td>
                  <td className="mono" style={{ color: 'var(--danger-ink)' }}>
                    −{inr(s.total_deductions)}
                  </td>
                  <td className="mono" style={{ fontWeight: 700, color: '#059669' }}>
                    {inr(s.net_salary)}
                  </td>
                  <td className="mono" style={{ fontSize: '11px', color: '#64748b' }}>
                    {s.bank_account ? (
                      <span>
                        {s.bank_account.slice(-4).padStart(s.bank_account.length, '•')} · {s.bank_ifsc || 'NO IFSC'}
                      </span>
                    ) : (
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>MISSING BANK</span>
                    )}
                  </td>
                  <td>
                    <span className="status-pill status-ok">{s.status || 'COMPUTED'}</span>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => onOpenPayslip(s.employee_id, month)}>
                      <FileText size={13} /> Payslip
                    </button>
                  </td>
                </tr>
              ))}
              {slips.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <p>No payslips calculated for {monthLabel}. Click “Compute {monthLabel}” to process wages.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Historical Runs */}
      <section className="section-card">
        <div className="section-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={16} />
            <span className="section-title">Payroll Audit History</span>
          </div>
          <span className="page-desc" style={{ fontSize: '0.75rem' }}>
            Click any month to inspect its salary register, locked snapshot, and payout files.
          </span>
        </div>
        <div className="table-wrap">
          <table className="swaniki-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Headcount</th>
                <th>Net Disbursement</th>
                <th>Status</th>
                <th>Finalized By</th>
                <th>Audit Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setMonth(r.month_year)}
                  style={{ cursor: 'pointer' }}
                  title={`View ${formatMonthYear(r.month_year)}`}
                >
                  <td className="mono" style={{ fontWeight: 600, color: 'var(--brand-primary-ink)' }}>
                    {formatMonthYear(r.month_year)}
                  </td>
                  <td>{r.employee_count} staff</td>
                  <td className="mono" style={{ fontWeight: 600 }}>{inr(r.net_payroll)}</td>
                  <td>
                    <span className={`status-pill ${r.status === 'LOCKED' ? 'status-ok' : 'status-warn'}`}>
                      {r.status || 'COMPLETED'}
                    </span>
                  </td>
                  <td>{r.approved_by || 'System Auto'}</td>
                  <td className="mono">
                    {r.processed_at ? new Date(r.processed_at).toLocaleString('en-IN') : '—'}
                  </td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <p>No historical payroll runs found.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── MODAL: Lock & Finalize Payroll with Legal Declaration ── */}
      {showLockModal && (
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
            padding: '16px'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '560px',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#ecfdf5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#059669'
                  }}
                >
                  <Lock size={18} />
                </div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#0f172a' }}>
                  Lock & Finalize Payroll ({monthLabel})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLockModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Payout Summary Box */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '14px',
                marginBottom: '16px'
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Staff Headcount</span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>{slips.length}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Gross Earnings</span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>{inr(totalGross)}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#059669' }}>Total Net Payout</span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#059669' }}>{inr(totalNet)}</div>
                </div>
              </div>
            </div>

            {/* Legal Notice */}
            <div
              style={{
                background: '#fef3c7',
                border: '1px solid #fde68a',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '11.5px',
                color: '#92400e',
                lineHeight: 1.5,
                marginBottom: '16px'
              }}
            >
              <strong>Self-Serve Legal Declaration:</strong> Once locked, this payroll run is permanently frozen. An immutable JSON audit snapshot will be preserved in the Vault. Calculations are generated via self-serve formulas and remain the sole legal responsibility of the organization.
            </div>

            {/* Mandatory Checkbox */}
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                fontSize: '12px',
                color: '#0f172a',
                cursor: 'pointer',
                marginBottom: '16px'
              }}
            >
              <input
                type="checkbox"
                checked={ackDisclaimer}
                onChange={(e) => setAckDisclaimer(e.target.checked)}
                style={{ accentColor: '#10b981', width: '16px', height: '16px', marginTop: '2px' }}
              />
              <span>
                I confirm that I have reviewed the pre-flight anomalies, attendance data, and salary figures for {monthLabel}. Our organization approves this disbursement.
              </span>
            </label>

            {/* Optional Notes */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                Approval Notes / Reference (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Approved post-management review"
                value={lockNotes}
                onChange={(e) => setLockNotes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12.5px'
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowLockModal(false)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLockPayroll}
                disabled={locking || !ackDisclaimer}
                style={{
                  background: !ackDisclaimer ? '#cbd5e1' : 'var(--brand-primary, #10b981)',
                  border: 'none',
                  padding: '9px 20px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: !ackDisclaimer ? '#64748b' : 'var(--on-primary, #ffffff)',
                  cursor: !ackDisclaimer ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <CheckCircle2 size={15} />
                <span>{locking ? 'Locking Snapshot...' : 'Confirm & Freeze Payroll'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Immutable Payroll Vault Viewer ── */}
      {showVaultModal && (
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
            padding: '16px'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '680px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Archive size={20} color="#059669" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
                  Payroll Vault Snapshot · {monthLabel}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowVaultModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {loadingVault ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <Loader2 size={24} className="spin" style={{ margin: '0 auto 10px' }} />
                  <p style={{ fontSize: '13px', color: '#64748b' }}>Loading frozen Vault snapshot...</p>
                </div>
              ) : vaultData ? (
                <div>
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '14px',
                      marginBottom: '16px'
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '12px' }}>
                      <div>
                        <span style={{ color: '#64748b' }}>Snapshot Generated At:</span>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>
                          {vaultData.generated_at ? new Date(vaultData.generated_at).toLocaleString('en-IN') : '—'}
                        </div>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Vault Storage Engine:</span>
                        <div style={{ fontWeight: 600, color: '#059669' }}>Compact Immutable JSON (~15 KB)</div>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Approved By:</span>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{vaultData.approved_by || 'HR Administrator'}</div>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Legal Disclaimer Status:</span>
                        <div style={{ fontWeight: 600, color: '#059669' }}>✓ Formally Acknowledged</div>
                      </div>
                    </div>
                  </div>

                  {/* Totals */}
                  <div style={{ marginBottom: '16px' }}>
                    <h5 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                      Frozen Payout Metrics
                    </h5>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Employees</span>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{vaultData.totals?.employee_count || 0}</div>
                      </div>
                      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Gross Wages</span>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{inr(vaultData.totals?.total_gross)}</div>
                      </div>
                      <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                        <span style={{ fontSize: '11px', color: '#065f46' }}>Net Payout</span>
                        <div style={{ fontWeight: 800, color: '#065f46' }}>{inr(vaultData.totals?.total_net)}</div>
                      </div>
                    </div>
                  </div>

                  <p style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', margin: 0 }}>
                    This snapshot is protected from tampering and provides the definitive statutory record for labor inspectorates and CA auditing.
                  </p>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px' }}>
                  <p style={{ fontSize: '13px', color: '#64748b' }}>
                    No locked snapshot found for {monthLabel}. Lock the payroll run to generate an immutable Vault record.
                  </p>
                </div>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowVaultModal(false)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  padding: '6px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}