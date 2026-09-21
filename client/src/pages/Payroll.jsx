import React, { useState, useEffect, useCallback } from 'react';
import { Banknote, FileText, Download, Play, Loader2, Zap } from 'lucide-react';
import { useOrganization } from '../context/OrganizationContext';
import { useAuth } from '../context/AuthContext';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function Payroll({ onOpenPayslip }) {
  const { org } = useOrganization();
  const { authFetch, hasPerm } = useAuth();
  const canView = hasPerm('PAYROLL_VIEW');
  const canProcess = hasPerm('PAYROLL_MANAGE');
  const canExport = hasPerm('EXPORTS');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [runs, setRuns] = useState([]);
  const [slips, setSlips] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState(null);

  const api = useCallback((path, opts = {}) => authFetch(path, opts).then(r => r.json()).then(d => (d.success ? d : { success: false, error: d.error })), [authFetch]);

  const download = useCallback(async (path, filename) => {
    try {
      const res = await authFetch(path);
      if (!res.ok) { alert('Export failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(err.message); }
  }, [authFetch]);

  const loadAll = useCallback(() => {
    if (!canView) return;
    api('/api/v1/payroll/runs').then(d => d.success && setRuns(d.runs));
    api(`/api/v1/payroll/slips/${month}`).then(d => d.success && setSlips(d.slips));
  }, [month, canView, api]);

  useEffect(loadAll, [loadAll]);

  const process = async () => {
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
    } catch (err) { alert(err.message); }
    finally { setProcessing(false); }
  };

  const currentRun = runs.find(r => r.month_year === month);
  const totalNet = slips.reduce((acc, s) => acc + Number(s.net_salary || 0), 0);
  const monthLabel = new Date(month + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title-wrap">
          <h1>Payroll</h1>
          <span className="page-desc">Monthly statutory payroll for {org?.name || 'your organisation'}.</span>
        </div>
        <div className="page-actions">
          <input type="month" className="input" style={{ width: 185 }} value={month} onChange={e => setMonth(e.target.value)} />
          {canProcess && (
            <button className="btn btn-primary" onClick={process} disabled={processing}>
              {processing ? <Loader2 size={15} className="spin" /> : <Play size={15} />} Process {monthLabel}
            </button>
          )}
        </div>
      </div>

      {message && <div className="demo-banner" style={{ borderColor: 'rgba(16,185,129,.4)', background: 'var(--brand-primary-light)', color: 'var(--brand-primary)' }}>{message}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label"><Banknote size={14} style={{ color: 'var(--brand-primary)' }} /> Net payout · {monthLabel}</span>
          <span className="stat-value">{inr(totalNet)}</span>
          <span className="stat-hint">{slips.length} employees</span>
        </div>
        <div className="stat-card">
          <span className="stat-label"><Zap size={14} style={{ color: '#d97706' }} /> Last run</span>
          <span className="stat-value">{runs[0] ? runs[0].month_year : '—'}</span>
          <span className="stat-hint">{runs[0] ? (runs[0].status || 'COMPLETED') : 'No payroll processed yet'}</span>
        </div>
      </div>

      <section className="section-card">
        <div className="section-head">
          <span className="section-title"><FileText size={16} /> Salary register · {monthLabel}</span>
          <div className="section-action">
            {canExport && (
              <>
                <button className="btn btn-ghost btn-sm" disabled={!currentRun} onClick={() => download(`/api/v1/payroll/export/bank/${month}`, `bank_neft_${month}.csv`)}>
                  <Download size={14} /> Bank NEFT
                </button>
                <button className="btn btn-ghost btn-sm" disabled={!currentRun} onClick={() => download(`/api/v1/payroll/export/tally/${month}`, `tally_jv_${month}.xml`)}>
                  <Download size={14} /> Tally JV
                </button>
              </>
            )}
          </div>
        </div>
        <div className="table-wrap">
          <table className="swaniki-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Payable days</th>
                <th>Gross</th>
                <th>Deductions</th>
                <th>Net</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {slips.map(s => (
                <tr key={s.id}>
                  <td>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{s.full_name}</div>
                      <div className="mono" style={{ fontSize: '0.6563rem', color: 'var(--text-caption)' }}>{s.employee_code}</div>
                    </div>
                  </td>
                  <td>{s.department_name}</td>
                  <td className="mono">{s.payable_days}</td>
                  <td className="mono">{inr(s.gross_earnings)}</td>
                  <td className="mono" style={{ color: 'var(--brand-rose)' }}>−{inr(s.total_deductions)}</td>
                  <td className="mono" style={{ fontWeight: 700, color: 'var(--text-heading)' }}>{inr(s.net_salary)}</td>
                  <td><span className="status-pill status-ok">{s.status || 'COMPUTED'}</span></td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => onOpenPayslip(s.employee_id, month)}>
                      <FileText size={13} /> Payslip
                    </button>
                  </td>
                </tr>
              ))}
              {slips.length === 0 && (
                <tr><td colSpan={8}><div className="empty-state"><p>No payslips for {monthLabel}. Press “Process {monthLabel}” to compute payroll.</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section-card">
        <div className="section-head">
          <span className="section-title"><Banknote size={16} /> Run history</span>
        </div>
        <div className="table-wrap">
          <table className="swaniki-table">
            <thead><tr><th>Month</th><th>Employees</th><th>Net payroll</th><th>Status</th><th>Processed at</th></tr></thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id}>
                  <td className="mono" style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{r.month_year}</td>
                  <td>{r.employee_count}</td>
                  <td className="mono">{inr(r.net_payroll)}</td>
                  <td><span className="status-pill status-ok">{r.status || 'COMPLETED'}</span></td>
                  <td className="mono">{r.processed_at ? new Date(r.processed_at).toLocaleString('en-IN') : '—'}</td>
                </tr>
              ))}
              {runs.length === 0 && <tr><td colSpan={5}><div className="empty-state"><p>No payroll runs yet.</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}