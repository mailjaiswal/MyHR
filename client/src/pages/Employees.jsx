import React, { useState, useEffect, useCallback } from 'react';
import { Search, Users, IdCard, FileText, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDateRange } from '../hooks/useDateRange';
import DateRangePicker from '../components/DateRangePicker';

function AttendanceStats({ a }) {
  if (!a) return <div className="loading-state"><Loader2 size={20} className="spin" /></div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.75rem' }}>
      <div className="stat-card" style={{ gap: '0.25rem', padding: '0.875rem 1rem' }}>
        <span className="stat-label">Present</span><span className="stat-value" style={{ fontSize: '1.25rem', color: 'var(--brand-primary)' }}>{a.present_days}</span>
      </div>
      <div className="stat-card" style={{ gap: '0.25rem', padding: '0.875rem 1rem' }}>
        <span className="stat-label">Half day</span><span className="stat-value" style={{ fontSize: '1.25rem', color: '#d97706' }}>{a.half_days}</span>
      </div>
      <div className="stat-card" style={{ gap: '0.25rem', padding: '0.875rem 1rem' }}>
        <span className="stat-label">Absent</span><span className="stat-value" style={{ fontSize: '1.25rem', color: 'var(--brand-rose)' }}>{a.absent_days}</span>
      </div>
      <div className="stat-card" style={{ gap: '0.25rem', padding: '0.875rem 1rem' }}>
        <span className="stat-label">Log hrs</span><span className="stat-value" style={{ fontSize: '1.25rem' }}>{a.total_hours || 0}h</span>
      </div>
    </div>
  );
}

export default function Employees() {
  const { authFetch } = useAuth();
  const { dateRange, setMode, setCustom, from, to } = useDateRange('month');
  const api = useCallback((path) => authFetch(path).then(r => r.json()).then(d => (d.success ? d : { success: false, error: d.error })), [authFetch]);

  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);

  const loadList = useCallback(() => {
    const qs = new URLSearchParams();
    if (departmentId) qs.set('departmentId', departmentId);
    if (search.trim()) qs.set('search', search.trim());
    api(`/api/v1/organization/employees?${qs}`).then(d => d.success && setEmployees(d.employees));
  }, [departmentId, search, api]);

  useEffect(() => { api('/api/v1/organization/departments').then(d => d.success && setDepartments(d.departments)); }, [api]);
  useEffect(loadList, [loadList]);

  const loadDetail = useCallback((id) => {
    setSelectedId(id);
    setDetail(null);
    api(`/api/v1/organization/employees/${id}?from=${from}&to=${to}`).then(d => setDetail(d));
  }, [api, from, to]);

  // Refresh open profile's attendance stats when the date range changes
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title-wrap">
          <h1>Employees</h1>
          <span className="page-desc">{employees.length} active employees. Select one to view their profile.</span>
        </div>
        <div className="page-actions">
          <DateRangePicker dateRange={dateRange} setMode={setMode} setCustom={setCustom} />
          <select className="input" style={{ width: 190 }} value={departmentId} onChange={e => setDepartmentId(e.target.value)}>
            <option value="">All departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <div className="search-box">
            <Search size={15} className="search-icon" />
            <input className="input" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="dash-grid" style={{ gridTemplateColumns: '1.1fr 1fr', alignItems: 'start' }}>
        <section className="section-card">
          <div className="section-head">
            <span className="section-title"><Users size={16} /> Directory</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{employees.length} shown</span>
          </div>
          <div className="table-wrap">
            <table className="swaniki-table">
              <thead>
                <tr><th>Employee</th><th>Designation</th><th>Department</th><th>Shift</th><th>Status</th></tr>
              </thead>
              <tbody>
                {employees.map(e => (
                  <tr key={e.id} onClick={() => loadDetail(e.id)} className={selectedId === e.id ? 'file-row-active' : ''} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <span className="avatar-sq">{e.full_name?.charAt?.(0) || '?'}</span>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{e.full_name}</div>
                          <div className="mono" style={{ fontSize: '0.6563rem', color: 'var(--text-caption)' }}>{e.employee_code}</div>
                        </div>
                      </div>
                    </td>
                    <td>{e.designation}</td>
                    <td>{e.department_name}</td>
                    <td>{e.shift_name || '—'}</td>
                    <td><span className="status-pill status-ok">{e.status}</span></td>
                  </tr>
                ))}
                {employees.length === 0 && <tr><td colSpan={5}><div className="empty-state"><p>No employees found.</p></div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section-card">
          <div className="section-head">
            <span className="section-title"><IdCard size={16} /> Profile</span>
          </div>
          {!selectedId && (
            <div className="empty-state" style={{ padding: '4rem 1.5rem' }}>
              <Users size={30} className="empty-icon" />
              <p>Select an employee from the directory to view their profile, documents and attendance.</p>
            </div>
          )}
          {selectedId && !detail && <div className="loading-state"><Loader2 size={24} className="spin" /><p>Loading profile…</p></div>}
          {detail && (
            <div className="section-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                <span className="avatar-sq" style={{ width: '3.25rem', height: '3.25rem', fontSize: '1.25rem' }}>{detail.employee.full_name.charAt(0)}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.0625rem', color: 'var(--text-heading)' }}>{detail.employee.full_name}</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{detail.employee.designation} · {detail.employee.department_name}</div>
                  <div className="mono" style={{ fontSize: '0.6563rem', color: 'var(--text-caption)' }}>{detail.employee.employee_code}{detail.employee.biometric_user_id ? ` · Bio ID ${detail.employee.biometric_user_id}` : ''}</div>
                </div>
              </div>

              <div className="kv-grid">
                <div className="kv"><span className="k">Mobile</span><span className="v">{detail.employee.mobile_no || '—'}</span></div>
                <div className="kv"><span className="k">Email</span><span className="v">{detail.employee.email || '—'}</span></div>
                <div className="kv"><span className="k">Date of joining</span><span className="v">{detail.employee.date_of_joining || '—'}</span></div>
                <div className="kv"><span className="k">PAN</span><span className="v">{detail.employee.pan || '—'}</span></div>
                <div className="kv"><span className="k">UAN (EPF)</span><span className="v">{detail.employee.uan || '—'}</span></div>
                <div className="kv"><span className="k">ESI IP</span><span className="v">{detail.employee.esi_ip || '—'}</span></div>
                <div className="kv"><span className="k">Bank</span><span className="v">{detail.employee.bank_name || '—'}</span></div>
                <div className="kv"><span className="k">Account</span><span className="v">{detail.employee.bank_account || '—'}</span></div>
                <div className="kv"><span className="k">IFSC</span><span className="v">{detail.employee.bank_ifsc || '—'}</span></div>
              </div>

              <div>
                <div className="section-title" style={{ marginBottom: '0.5rem', fontSize: '0.8125rem' }}>Attendance scorecard · {dateRange.label}</div>
                <AttendanceStats a={detail.attendance} />
              </div>

              <div>
                <div className="section-title" style={{ marginBottom: '0.5rem', fontSize: '0.8125rem' }}>Address & documents</div>
                {detail.personal ? (
                  <div className="kv-grid">
                    <div className="kv"><span className="k">Address</span><span className="v">{detail.personal.current_address || '—'}</span></div>
                    <div className="kv"><span className="k">Emergency contact</span><span className="v">{detail.personal.emergency_contact_name || '—'} {detail.personal.emergency_contact_number || ''}</span></div>
                  </div>
                ) : <p>No personal details filed.</p>}
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {(detail.documents || []).map(doc => (
                    <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7813rem', color: 'var(--text-muted)' }}>
                      <FileText size={14} />
                      <span>{doc.document_type}</span>
                      <span className="mono" style={{ color: 'var(--text-caption)' }}>{doc.document_no}</span>
                      <span className={`status-pill ${(doc.verified_at || doc.verification_status === 'VERIFIED') ? 'status-ok' : 'status-warn'}`}>{doc.verified_at ? 'Verified' : 'Pending'}</span>
                    </div>
                  ))}
                  {(!detail.documents || detail.documents.length === 0) && <p>No documents filed yet.</p>}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}