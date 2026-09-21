import React, { useState, useEffect, useCallback } from 'react';
import { Search, CalendarDays, Fingerprint, Check, Loader2, Download, Clock3, ShieldCheck, X, ThumbsUp, ThumbsDown, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDateRange } from '../hooks/useDateRange';
import DateRangePicker from '../components/DateRangePicker';

const STATUS_META = {
  PRESENT: { label: 'Present', cls: 'status-ok' },
  OVERTIME: { label: 'Overtime', cls: 'status-ok' },
  REGULARIZED: { label: 'Regularized', cls: 'status-ok' },
  HALF_DAY: { label: 'Half Day', cls: 'status-warn' },
  ABSENT: { label: 'Absent', cls: 'status-bad' },
  ON_LEAVE: { label: 'On Leave', cls: 'status-muted' }
};

const CORR_META = {
  PENDING: { label: 'Pending', cls: 'status-warn' },
  APPROVED: { label: 'Approved', cls: 'status-ok' },
  REJECTED: { label: 'Rejected', cls: 'status-bad' }
};

function fmtTime(t) {
  if (!t) return '—';
  return t.slice(0, 5);
}

function MusterTable({ records, busy, canManage, onRegularize, onAdjust, onOpen }) {
  return (
    <div className="table-wrap">
      <table className="swaniki-table">
        <thead>
          <tr>
            <th>Employee</th><th>Department</th><th>Shift</th><th>First in</th><th>Last out</th><th>Late</th><th>Hours</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          {records.map(r => {
            const st = STATUS_META[r.status] || STATUS_META.ABSENT;
            const canFix = r.status === 'ABSENT' || r.status === 'HALF_DAY';
            return (
              <tr key={r.id}>
                <td>
                  <div onClick={() => onOpen(r)} title="View detailed attendance" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
                    <span className="avatar-sq">{(r.full_name || '?')[0]}</span>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>{r.full_name}<Info size={12} style={{ opacity: 0.45 }} /></div>
                      <div className="mono" style={{ fontSize: '0.6563rem', color: 'var(--text-caption)' }}>{r.employee_code}</div>
                    </div>
                  </div>
                </td>
                <td>{r.department_name}</td>
                <td>{r.shift_name}</td>
                <td className="mono">{fmtTime(r.first_in_time)}</td>
                <td className="mono">{fmtTime(r.last_out_time)}</td>
                <td className="mono">{Number(r.late_minutes || 0) > 0 ? `${r.late_minutes}m` : '—'}</td>
                <td className="mono">{Number(r.total_hours || 0).toFixed(1)}h</td>
                <td><span className={`status-pill ${st.cls}`}>{st.label}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                    {canFix && (
                      <button className="btn btn-ghost btn-sm" disabled={busy === r.id} onClick={() => onRegularize(r.id)}>
                        {busy === r.id ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Regularize
                      </button>
                    )}
                    {canManage && (
                      <button className="btn btn-ghost btn-sm" onClick={() => onAdjust(r)} title="Override logged hours">
                        <Clock3 size={13} /> Adjust
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {records.length === 0 && (
            <tr><td colSpan={9}><div className="empty-state"><p>No records for the selected filters.</p></div></td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function Attendance() {
  const { authFetch, hasPerm, user } = useAuth();
  const { dateRange, setMode, setCustom, from, to } = useDateRange('month');
  const canManage = hasPerm('ATTENDANCE_EDIT');
  const canExport = hasPerm('EXPORTS');

  const api = useCallback((path, opts = {}) => authFetch(path, opts).then(r => r.json()).then(d => (d.success ? d : { success: false, error: d.error })), [authFetch]);

  const [departmentId, setDepartmentId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [search, setSearch] = useState('');

  const [departments, setDepartments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [summary, setSummary] = useState([]);

  const [corrections, setCorrections] = useState([]);
  const [message, setMessage] = useState(null);
  const [adjustFor, setAdjustFor] = useState(null);
  const [adjHours, setAdjHours] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjSaving, setAdjSaving] = useState(false);
  const [detail, setDetail] = useState(null);

  const loadRecords = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ from, to });
    if (departmentId) qs.set('departmentId', departmentId);
    if (shiftId) qs.set('shiftId', shiftId);
    if (search.trim()) qs.set('search', search.trim());
    api(`/api/v1/attendance/records?${qs}`)
      .then(d => { if (d.success) setRecords(d.records); })
      .finally(() => setLoading(false));
  }, [from, to, departmentId, shiftId, search, api]);

  const loadSummary = useCallback(() => {
    api(`/api/v1/attendance/summary/monthly?from=${from}&to=${to}`)
      .then(d => { if (d.success) setSummary(d.summary); });
  }, [from, to, api]);

  const loadCorrections = useCallback(() => {
    if (!canManage) return;
    api('/api/v1/attendance/corrections').then(d => d.success && setCorrections(d.corrections));
  }, [canManage, api]);

  useEffect(() => { api('/api/v1/organization/departments').then(d => d.success && setDepartments(d.departments)); }, []);
  useEffect(() => { api('/api/v1/organization/shifts').then(d => d.success && setShifts(d.shifts)); }, []);
  useEffect(loadRecords, [loadRecords]);
  useEffect(loadSummary, [loadSummary]);
  useEffect(loadCorrections, [loadCorrections]);

  const regularize = async (id) => {
    setBusy(id);
    try {
      const d = await api('/api/v1/attendance/regularize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendanceId: id, action: 'APPROVE', notes: 'Regularized by HR' })
      });
      if (d.success) { loadRecords(); loadSummary(); flash('Regularized successfully'); }
      else alert(d.error || 'Failed to regularize');
    } catch (err) { alert(err.message); }
    finally { setBusy(null); }
  };

  const openAdjust = (rec) => {
    setAdjustFor(rec);
    setAdjHours(String(Number(rec.total_hours || 0).toFixed(1)));
    setAdjReason('');
  };

  const openDetail = (rec) => {
    const rows = records.filter(r => r.employee_id === rec.employee_id)
      .sort((a, b) => (a.duty_date < b.duty_date ? 1 : -1));
    setDetail({ emp: rec, rows });
  };

  const submitAdjust = async () => {
    const hours = Number(adjHours);
    if (!(hours > 0) || hours > 24) { alert('Hours must be between 0 and 24'); return; }
    setAdjSaving(true);
    try {
      const d = await api('/api/v1/attendance/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendance_id: adjustFor.id, requested_hours: hours, reason: adjReason || 'Incorrectly logged entry', submitted_by: user?.full_name || 'Manager/HR' })
      });
      if (d.success) { flash('Correction request sent for admin approval'); setAdjustFor(null); loadCorrections(); loadRecords(); }
      else alert(d.error || 'Failed to submit');
    } catch (err) { alert(err.message); }
    finally { setAdjSaving(false); }
  };

  const decideCorrection = async (id, action) => {
    setBusy(id);
    try {
      const d = await api(`/api/v1/attendance/corrections/${id}/decide`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, decided_by: user?.full_name || 'HR Admin' })
      });
      if (d.success) { flash(d.message || 'Done'); loadCorrections(); loadRecords(); }
      else alert(d.error || 'Failed');
    } catch (err) { alert(err.message); }
    finally { setBusy(null); }
  };

  const flash = (msg) => { setMessage(msg); setTimeout(() => setMessage(null), 3500); };

  const pendingCorrs = corrections.filter(c => c.status === 'PENDING');

  const exportCsv = () => {
    const rows = [['Employee Code', 'Employee', 'Department', 'Shift', 'Status', 'First In', 'Last Out', 'Late Min', 'Hours']];
    records.forEach(r => rows.push([r.employee_code, r.full_name, r.department_name, r.shift_name, r.status, r.first_in_time || '', r.last_out_time || '', r.late_minutes || 0, Number(r.total_hours || 0).toFixed(1)]));
    const csv = rows.map(x => x.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Muster_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="page">
      {message && <div className="demo-banner" style={{ borderColor: 'rgba(16,185,129,.4)', background: 'var(--brand-primary-light)', color: 'var(--brand-primary)' }}>{message}</div>}

      <div className="page-head">
        <div className="page-title-wrap">
          <h1>Attendance</h1>
          <span className="page-desc">Daily muster, monthly summary and manual hours corrections.</span>
        </div>
        <div className="page-actions">
          {canExport && (
            <button className="btn btn-ghost btn-sm" onClick={exportCsv}><Download size={14} /> CSV</button>
          )}
        </div>
      </div>

      <div className="segment-toolbar" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <DateRangePicker dateRange={dateRange} setMode={setMode} setCustom={setCustom} />
        <div className="field" style={{ width: 190 }}>
          <select className="input" value={departmentId} onChange={e => setDepartmentId(e.target.value)}>
            <option value="">All departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ width: 160 }}>
          <select className="input" value={shiftId} onChange={e => setShiftId(e.target.value)}>
            <option value="">All shifts</option>
            {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="search-box">
          <Search size={15} className="search-icon" />
          <input className="input" placeholder="Search employee…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {canManage && corrections.length > 0 && (
        <section className="section-card">
          <div className="section-head">
            <span className="section-title"><ShieldCheck size={16} /> Hours corrections · admin approval</span>
            {pendingCorrs.length > 0 ? <span className="status-pill status-warn">{pendingCorrs.length} pending</span> : <span className="status-pill status-ok">No pending</span>}
          </div>
          <div className="table-wrap">
            <table className="swaniki-table">
              <thead><tr><th>Employee</th><th>Date</th><th>Logged</th><th>Requested</th><th>Reason</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {corrections.map(c => {
                  const st = CORR_META[c.status] || CORR_META.PENDING;
                  return (
                    <tr key={c.id}>
                      <td>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{c.full_name}</div>
                          <div className="mono" style={{ fontSize: '0.6563rem', color: 'var(--text-caption)' }}>{c.employee_code}</div>
                        </div>
                      </td>
                      <td className="mono">{new Date(c.duty_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                      <td className="mono">{Number(c.logged_hours || c.original_hours || 0).toFixed(1)}h → <b style={{ color: 'var(--brand-primary)' }}>{Number(c.requested_hours).toFixed(1)}h</b></td>
                      <td className="mono">{c.shift_name}</td>
                      <td style={{ maxWidth: 220 }}>{c.reason || '—'}</td>
                      <td><span className={`status-pill ${st.cls}`}>{st.label}</span></td>
                      <td>
                        {c.status === 'PENDING' && (
                          <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" disabled={busy === c.id} onClick={() => decideCorrection(c.id, 'APPROVE')}>
                              {busy === c.id ? <Loader2 size={13} className="spin" /> : <ThumbsUp size={13} />} Approve
                            </button>
                            <button className="btn btn-rose btn-sm" disabled={busy === c.id} onClick={() => decideCorrection(c.id, 'REJECT')}>
                              <ThumbsDown size={13} /> Reject
                            </button>
                          </div>
                        )}
                        {c.status !== 'PENDING' && <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{c.decided_by || ''}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="section-card">
        <div className="section-head">
          <span className="section-title"><Fingerprint size={16} /> Muster · {dateRange.label}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{records.length} records</span>
        </div>
        {loading ? (
          <div className="loading-state"><Loader2 size={24} className="spin" /><p>Loading records…</p></div>
        ) : (
          <MusterTable records={records} busy={busy} canManage={canManage} onRegularize={regularize} onAdjust={openAdjust} onOpen={openDetail} />
        )}
      </section>

      <section className="section-card">
        <div className="section-head">
          <span className="section-title"><CalendarDays size={16} /> Summary · {dateRange.label}</span>
        </div>
        <div className="table-wrap">
          <table className="swaniki-table">
            <thead>
              <tr><th>Employee</th><th>Department</th><th>Present</th><th>Half day</th><th>Absent</th><th>Logged hours</th><th>Overtime</th></tr>
            </thead>
            <tbody>
              {summary.map(s => (
                <tr key={s.employee_id}>
                  <td>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{s.full_name}</div>
                      <div className="mono" style={{ fontSize: '0.6563rem', color: 'var(--text-caption)' }}>{s.employee_code}</div>
                    </div>
                  </td>
                  <td>{s.department_name}</td>
                  <td><span className="status-pill status-ok">{s.present_days}</span></td>
                  <td>{s.half_days}</td>
                  <td><span className="status-pill status-bad">{s.absent_days}</span></td>
                  <td className="mono">{s.total_logged_hours}h</td>
                  <td className="mono">{s.total_overtime_hours}h</td>
                </tr>
              ))}
              {summary.length === 0 && <tr><td colSpan={7}><div className="empty-state"><p>No summary for {dateRange.label} yet. Run attendance ingests or pick another range.</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {adjustFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="swaniki-card" style={{ width: '100%', maxWidth: 420, padding: '1.5rem', position: 'relative' }}>
            <button className="icon-btn" style={{ position: 'absolute', top: '0.75rem', right: '0.75rem' }} onClick={() => setAdjustFor(null)}><X size={17} /></button>
            <h3 style={{ marginBottom: '0.25rem' }}>Override logged hours</h3>
            <p style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>{adjustFor.full_name} · {new Date(adjustFor.duty_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            <div className="section-body" style={{ padding: '0.25rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div className="field">
                <label className="field-label">Current logged hours</label>
                <div className="input" style={{ background: 'var(--bg-surface-subtle)' }}>{Number(adjustFor.total_hours || 0).toFixed(1)}h</div>
              </div>
              <div className="field">
                <label className="field-label">Corrected hours</label>
                <input type="number" step="0.5" min="0" max="24" className="input" value={adjHours} onChange={e => setAdjHours(e.target.value)} placeholder="e.g. 8.0" />
              </div>
              <div className="field">
                <label className="field-label">Reason (why the entry was missed/incorrect)</label>
                <textarea rows={2} className="input" value={adjReason} onChange={e => setAdjReason(e.target.value)} placeholder="e.g. Punch device was offline during entry" />
              </div>
              <p style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>This request goes to the Admin for explicit approval before the hours are changed.</p>
              <button className="btn btn-primary" disabled={adjSaving} onClick={submitAdjust}>
                {adjSaving ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />} Submit for approval
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (() => {
        const rows = detail.rows;
        const emp = detail.emp;
        const present = rows.filter(r => ['PRESENT', 'OVERTIME', 'REGULARIZED'].includes(r.status)).length;
        const half = rows.filter(r => r.status === 'HALF_DAY').length;
        const absent = rows.filter(r => r.status === 'ABSENT').length;
        const totalH = rows.reduce((s, r) => s + Number(r.total_hours || 0), 0);
        const otH = rows.reduce((s, r) => s + Number(r.overtime_hours || 0), 0);
        const lateCount = rows.filter(r => Number(r.late_minutes || 0) > 0).length;
        const chips = [
          ['Present', present, '#10b981'], ['Half day', half, '#f59e0b'], ['Absent', absent, '#ef4444'],
          ['Late', lateCount, 'var(--text-heading)'], ['Hours', `${totalH.toFixed(1)}h`, 'var(--brand-primary)'], ['Overtime', `${otH.toFixed(1)}h`, 'var(--brand-primary)']
        ];
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div className="swaniki-card" style={{ width: '100%', maxWidth: 720, maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'var(--bg-surface-subtle)' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <span className="avatar-sq" style={{ width: 44, height: 44, fontSize: '1.1rem' }}>{(emp.full_name || '?')[0]}</span>
                  <div>
                    <h3 style={{ margin: 0, color: 'var(--text-heading)' }}>{emp.full_name}</h3>
                    <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-caption)' }}>{emp.employee_code} · {emp.designation} · {emp.department_name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-caption)', marginTop: '0.15rem' }}>Shift · {emp.shift_name}</div>
                  </div>
                </div>
                <button className="icon-btn" onClick={() => setDetail(null)}><X size={17} /></button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: '0.6rem', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                {chips.map(([k, v, c]) => (
                  <div key={k} style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', borderRadius: '0.6rem', padding: '0.55rem 0.7rem' }}>
                    <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-caption)' }}>{k}</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: c }}>{v}</div>
                  </div>
                ))}
              </div>

              <div style={{ padding: '0.5rem 1.5rem 1.5rem', overflowY: 'auto' }}>
                <div className="section-title" style={{ margin: '0.85rem 0 0.5rem', fontSize: '0.8rem' }}>Day-by-day · {rows.length} records</div>
                <div className="table-wrap">
                  <table className="swaniki-table">
                    <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Reg h</th><th>OT h</th><th>Late</th><th>Total</th><th>Status</th></tr></thead>
                    <tbody>
                      {rows.map(r => {
                        const st = STATUS_META[r.status] || STATUS_META.ABSENT;
                        return (
                          <tr key={r.id}>
                            <td className="mono">{new Date(r.duty_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                            <td className="mono">{fmtTime(r.first_in_time)}</td>
                            <td className="mono">{fmtTime(r.last_out_time)}</td>
                            <td className="mono">{Number(r.regular_hours || 0).toFixed(1)}</td>
                            <td className="mono">{Number(r.overtime_hours || 0).toFixed(1)}</td>
                            <td className="mono">{Number(r.late_minutes || 0) > 0 ? `${r.late_minutes}m` : '—'}</td>
                            <td className="mono"><b>{Number(r.total_hours || 0).toFixed(1)}h</b></td>
                            <td><span className={`status-pill ${st.cls}`}>{st.label}</span></td>
                          </tr>
                        );
                      })}
                      {rows.length === 0 && <tr><td colSpan={8}><div className="empty-state"><p>No records.</p></div></td></tr>}
                    </tbody>
                  </table>
                </div>
                {rows.some(r => r.regularization_notes) && (
                  <div style={{ marginTop: '0.85rem', fontSize: '0.72rem', color: 'var(--text-caption)' }}>
                    Regularized days: {rows.filter(r => r.regularization_notes).map(r => new Date(r.duty_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })).join(', ')}
                  </div>
                )}
                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDetail(null)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}