import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, CheckCircle, XCircle, Clock, Loader2, Inbox } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDateRange } from '../hooks/useDateRange';
import DateRangePicker from '../components/DateRangePicker';

const STATUS_META = {
  PENDING: { pill: 'pill-amber' },
  APPROVED: { pill: 'pill-emerald' },
  REJECTED: { pill: 'pill-rose' }
};

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' }
];

export default function Regularization() {
  const { authFetch, hasPerm, user } = useAuth();
  const canApprove = hasPerm('REGULARIZATION_APPROVE');
  const { dateRange, setMode, setCustom, from, to } = useDateRange('month');

  const api = useCallback((path, opts = {}) => authFetch(path, opts).then(r => r.json()).then(d => (d.success ? d : { success: false, error: d.error })), [authFetch]);

  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = filter ? `?status=${filter}` : '';
    api(`/api/v1/attendance/corrections${qs}`)
      .then(d => { if (d.success) setRequests(d.corrections); })
      .finally(() => setLoading(false));
  }, [filter, api]);

  useEffect(load, [load]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 3500); };

  const decide = async (id, action) => {
    setBusy(id);
    const d = await api(`/api/v1/attendance/corrections/${id}/decide`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, decided_by: user?.full_name || 'Supervisor' })
    });
    if (d.success) { flash(d.message || 'Done'); load(); }
    else alert(d.error || 'Failed');
    setBusy(null);
  };

  // Filter to the selected date range on the client (by duty date)
  const visible = requests.filter(r => {
    const dd = (r.duty_date || '').slice(0, 10);
    return dd >= from && dd <= to;
  });

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title-wrap">
          <h1>Regularization</h1>
          <span className="page-desc">Missed-punch and hours-correction approval workflow for {user?.full_name || 'your team'}.</span>
        </div>
        <div className="page-actions">
          <DateRangePicker dateRange={dateRange} setMode={setMode} setCustom={setCustom} />
        </div>
      </div>

      {msg && <div className="demo-banner" style={{ borderColor: 'rgba(16,185,129,.4)', background: 'var(--brand-primary-light)', color: 'var(--brand-primary)' }}>{msg}</div>}

      <div className="seg" style={{ alignSelf: 'flex-start' }}>
        {FILTERS.map(f => (
          <button key={f.key} className={`seg-btn ${filter === f.key ? 'seg-btn-active' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="loading-state"><Loader2 size={24} className="spin" /><p>Loading regularization requests…</p></div>
      ) : visible.length === 0 ? (
        <div className="empty-state" style={{ padding: '3rem 1.5rem' }}>
          <Inbox size={30} className="empty-icon" />
          <p>No correction requests in this period.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {visible.map(r => {
            const meta = STATUS_META[r.status] || STATUS_META.PENDING;
            return (
              <div key={r.id} className="swaniki-card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <strong style={{ fontSize: '1rem', color: 'var(--text-heading)' }}>{r.full_name}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({r.employee_code})</span>
                      <span className={`status-pill ${r.status === 'PENDING' ? 'status-warn' : r.status === 'APPROVED' ? 'status-ok' : 'status-bad'}`}>{r.status}</span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.designation} · {r.department_name}</p>

                    <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--text-body)' }}>
                      <p><strong>Duty date:</strong> {r.duty_date} · <strong>Logged:</strong> {Number(r.logged_hours || r.original_hours || 0).toFixed(1)}h · <strong>Requested:</strong> {Number(r.requested_hours || 0).toFixed(1)}h</p>
                      {r.reason && <p style={{ marginTop: '0.25rem', color: 'var(--text-muted)' }}><em>"{r.reason}"</em></p>}
                      {r.decided_by && <p style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-caption)' }}>Decided by {r.decided_by}</p>}
                    </div>
                  </div>

                  {canApprove && r.status === 'PENDING' && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-primary btn-sm" disabled={busy === r.id} onClick={() => decide(r.id, 'APPROVE')}>
                        {busy === r.id ? <Loader2 size={15} className="spin" /> : <CheckCircle size={15} />} Approve
                      </button>
                      <button className="btn btn-rose btn-sm" disabled={busy === r.id} onClick={() => decide(r.id, 'REJECT')}>
                        <XCircle size={15} /> Reject
                      </button>
                    </div>
                  )}
                  {!canApprove && r.status === 'PENDING' && (
                    <span className="status-pill status-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Clock size={13} /> Awaiting approval</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
