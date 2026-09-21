import React, { useState, useEffect, useCallback } from 'react';
import { CalendarClock, Plus, X, Check, ThumbsUp, ThumbsDown, Loader2, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDateRange } from '../hooks/useDateRange';
import DateRangePicker from '../components/DateRangePicker';

const STATUS_META = {
  PENDING: { label: 'Pending', cls: 'status-warn' },
  APPROVED: { label: 'Approved', cls: 'status-ok' },
  REJECTED: { label: 'Rejected', cls: 'status-bad' }
};

export default function Leaves() {
  const { authFetch, hasPerm, user } = useAuth();
  const canApprove = hasPerm('LEAVES_APPROVE');
  const canRequest = hasPerm('LEAVES_REQUEST');
  const { dateRange, setMode, setCustom, from, to } = useDateRange('year');
  const year = new Date().getFullYear();

  const api = useCallback((path, opts = {}) => authFetch(path, opts).then(r => r.json()).then(d => (d.success ? d : { success: false, error: d.error })), [authFetch]);

  const [types, setTypes] = useState([]);
  const [balances, setBalances] = useState([]);
  const [requests, setRequests] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState({ employee_id: '', leave_type_id: '', from_date: '', to_date: '', reason: '' });

  const load = useCallback(() => {
    api('/api/v1/leaves/types').then(d => d.success && setTypes(d.types));
    api(`/api/v1/leaves/balances?year=${year}`).then(d => d.success && setBalances(d.balances));
    api(`/api/v1/leaves/requests?from=${from}&to=${to}`).then(d => d.success && setRequests(d.requests));
    api('/api/v1/organization/employees').then(d => d.success && setEmployees(d.employees)).catch(() => {});
  }, [year, from, to, api]);

  useEffect(load, [load]);

  const openForm = () => {
    setForm({ employee_id: user?.id || '', leave_type_id: '', from_date: '', to_date: '', reason: '' });
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const d = await api('/api/v1/leaves/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    if (d.success) {
      setShowForm(false);
      setForm({ employee_id: user?.id || '', leave_type_id: '', from_date: '', to_date: '', reason: '' });
      load();
    } else alert(d.error || 'Failed to apply');
  };

  const decide = async (id, status) => {
    setBusyId(id);
    try {
      await api(`/api/v1/leaves/requests/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, decided_by: user?.full_name || 'HR Admin' })
      });
      load();
    } catch (err) { alert(err.message); }
    finally { setBusyId(null); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title-wrap">
          <h1>Leaves</h1>
          <span className="page-desc">Leave types, balances and requests for {year}.</span>
        </div>
        <div className="page-actions">
          <DateRangePicker dateRange={dateRange} setMode={setMode} setCustom={setCustom} />
          {canRequest && (
            <button className="btn btn-primary" onClick={openForm}><Plus size={15} /> Apply for leave</button>
          )}
        </div>
      </div>

      <section className="section-card">
        <div className="section-head">
          <span className="section-title"><CalendarClock size={16} /> Leave types</span>
        </div>
        <div className="section-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
            {types.map(t => (
              <div key={t.id} className="stat-card" style={{ gap: '0.25rem' }}>
                <span className="stat-label" style={{ color: t.color_code || 'var(--text-caption)' }}>{t.code}</span>
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-heading)' }}>{t.name}</span>
                <span className="stat-hint">{t.paid ? 'Paid leave' : 'Unpaid'} · {t.max_days || t.accumulates ? 'Accrues' : 'Manual'} </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-card">
        <div className="section-head">
          <span className="section-title"><CalendarClock size={16} /> Balances · {year}</span>
        </div>
        <div className="table-wrap">
          <table className="swaniki-table">
            <thead><tr><th>Employee</th><th>Leave type</th><th>Opening</th><th>Used</th><th>Pending</th><th>Remaining</th></tr></thead>
            <tbody>
              {balances.map(b => (
                <tr key={b.id}>
                  <td><span style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{b.full_name}</span></td>
                  <td><span style={{ color: b.color_code || 'inherit' }}>{b.leave_name}</span></td>
                  <td className="mono">{b.accumulated}</td>
                  <td className="mono">{b.used}</td>
                  <td className="mono">{b.pending}</td>
                  <td className="mono" style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>{Number(b.accumulated || 0) - Number(b.used || 0) - Number(b.pending || 0)}</td>
                </tr>
              ))}
              {balances.length === 0 && <tr><td colSpan={6}><div className="empty-state"><p>No balances seeded yet.</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section-card">
        <div className="section-head">
          <span className="section-title"><CalendarClock size={16} /> Requests · {dateRange.label}</span>
        </div>
        <div className="table-wrap">
          <table className="swaniki-table">
            <thead><tr><th>Employee</th><th>Type</th><th>Period</th><th>Days</th><th>Reason</th><th>Status</th>{canApprove && <th></th>}</tr></thead>
            <tbody>
              {requests.map(r => {
                const st = STATUS_META[r.status] || STATUS_META.PENDING;
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="avatar-sq"><UserRound size={14} /></span>
                        <span style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{r.full_name}</span>
                      </div>
                    </td>
                    <td><span style={{ color: r.color_code || 'inherit' }}>{r.leave_name}</span></td>
                    <td className="mono">{r.from_date} → {r.to_date}</td>
                    <td className="mono">{r.days}</td>
                    <td style={{ maxWidth: 240 }}>{r.reason || '—'}</td>
                    <td><span className={`status-pill ${st.cls}`}>{st.label}</span></td>
                    {canApprove && r.status === 'PENDING' && (
                      <td>
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                          <button className="btn btn-ghost btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, 'APPROVED')}>
                            {busyId === r.id ? <Loader2 size={13} className="spin" /> : <ThumbsUp size={13} />} Approve
                          </button>
                          <button className="btn btn-rose btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, 'REJECTED')}>
                            <ThumbsDown size={13} /> Reject
                          </button>
                        </div>
                      </td>
                    )}
                    {canApprove && r.status !== 'PENDING' && <td><span style={{ color: 'var(--text-caption)', fontSize: '0.75rem' }}>{r.decided_by || ''}</span></td>}
                  </tr>
                );
              })}
              {requests.length === 0 && <tr><td colSpan={7}><div className="empty-state"><p>No leave requests yet.</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="swaniki-card" style={{ width: '100%', maxWidth: 420, padding: '1.5rem', position: 'relative' }}>
            <button className="icon-btn" style={{ position: 'absolute', top: '0.75rem', right: '0.75rem' }} onClick={() => setShowForm(false)}><X size={17} /></button>
            <h3 style={{ marginBottom: '1rem' }}>Apply for leave</h3>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div className="field">
                <label className="field-label">Employee</label>
                <select className="input" required value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}>
                  <option value="">Select employee…</option>
                  {(employees.length ? employees : (user ? [{ id: user.id, full_name: user.full_name, employee_code: user.employee_code }] : []))
                    .map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Leave type</label>
                <select className="input" required value={form.leave_type_id} onChange={e => setForm({ ...form, leave_type_id: e.target.value })}>
                  <option value="">Select type…</option>
                  {types.map(t => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="field">
                  <label className="field-label">From</label>
                  <input type="date" className="input" required value={form.from_date} onChange={e => setForm({ ...form, from_date: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">To</label>
                  <input type="date" className="input" required value={form.to_date} onChange={e => setForm({ ...form, to_date: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label className="field-label">Reason</label>
                <textarea className="input" rows={2} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Optional note…" />
              </div>
              <button type="submit" className="btn btn-primary"><Check size={15} /> Submit request</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}