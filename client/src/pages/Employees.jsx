import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, Users, IdCard, FileText, Loader2, UserPlus, Pencil, Archive, ArchiveRestore,
  X, CalendarDays, Wallet, Plane, LayoutGrid, Download, TriangleAlert, Briefcase
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDateRange } from '../hooks/useDateRange';
import useEscapeClose from '../hooks/useEscapeClose';
import DateRangePicker from '../components/DateRangePicker';
import { MonthGrid } from '../components/AttendanceCalendar';

const STATUS_PILL = {
  ACTIVE: 'status-ok', INACTIVE: 'status-warn', TERMINATED: 'status-bad', ON_LEAVE: 'status-muted'
};
const STATUS_LABEL = {
  ACTIVE: 'Active', INACTIVE: 'Inactive', TERMINATED: 'Terminated', ON_LEAVE: 'On leave'
};
const TABS = [
  { key: 'profile', label: 'Profile', Icon: IdCard },
  { key: 'attendance', label: 'Attendance', Icon: CalendarDays },
  { key: 'payroll', label: 'Payroll', Icon: Wallet },
  { key: 'leaves', label: 'Leaves', Icon: Plane }
];

const VERIFY_MODES = ['FINGERPRINT', 'FACE', 'CARD', 'PASSWORD'];
const EMPLOYMENT_TYPES = ['REGULAR', 'PROBATION', 'CONTRACT', 'INTERN'];

// The Add/Edit form carries every field the smart roster importer + prefilled template track,
// so any "details not captured" gap an admin is pointed to can be finished here one-by-one.
const emptyForm = () => ({
  first_name: '', last_name: '', gender: 'Other', department_id: '', designation: '',
  shift_id: '', date_of_joining: '', date_of_birth: '', mobile: '', email: '', biometric_user_id: '',
  employment_type: 'REGULAR', base_ctc: '', card_no: '', verify_mode: 'FINGERPRINT',
  nationality: '', city: '', contact_tel: '', office_tel: '',
  uan: '', esi_ip: '', pan: '', bank_name: '', bank_account: '', bank_ifsc: ''
});

function formFromEmployee(e) {
  return {
    first_name: e.first_name || '', last_name: e.last_name || '', gender: e.gender || 'Other',
    department_id: e.department_id || '', designation: e.designation || '', shift_id: e.shift_id || '',
    date_of_joining: e.date_of_joining ? String(e.date_of_joining).slice(0, 10) : '',
    date_of_birth: e.date_of_birth ? String(e.date_of_birth).slice(0, 10) : '',
    mobile: e.mobile || '', email: e.email || '', biometric_user_id: e.biometric_user_id || '',
    employment_type: e.employment_type || 'REGULAR', base_ctc: e.base_ctc != null ? String(e.base_ctc) : '',
    card_no: e.card_no || '', verify_mode: e.verify_mode || 'FINGERPRINT',
    nationality: e.nationality || '', city: e.city || '', contact_tel: e.contact_tel || '', office_tel: e.office_tel || '',
    uan: e.uan || '', esi_ip: e.esi_ip || '', pan: e.pan || '',
    bank_name: e.bank_name || '', bank_account: e.bank_account || '', bank_ifsc: e.bank_ifsc || ''
  };
}

// Fields the roster importer reports as "often not captured" — a compact per-row gap
// count so the admin can see, at a glance, who still needs details finished manually.
const GAP_FIELDS = ['date_of_birth', 'card_no', 'nationality', 'city', 'contact_tel', 'office_tel', 'uan', 'esi_ip', 'pan', 'bank_account'];
function missingDetailCount(e) {
  return GAP_FIELDS.reduce((n, k) => n + ((e[k] == null || String(e[k]).trim() === '') ? 1 : 0), 0);
}

function AttendanceStats({ a }) {
  if (!a) return <div className="loading-state"><Loader2 size={20} className="spin" /></div>;
  const cards = [
    ['Present', a.present_days, 'var(--brand-primary-ink)'],
    ['Half day', a.half_days, 'var(--warning-ink)'],
    ['Absent', a.absent_days, 'var(--danger-ink)'],
    ['Logged', `${a.total_hours || 0}h`, 'var(--text-heading)'],
    ['Overtime', `${a.overtime_hours || 0}h`, 'var(--brand-primary-ink)']
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: '0.75rem' }}>
      {cards.map(([k, v, c]) => (
        <div key={k} className="stat-card" style={{ gap: '0.25rem', padding: '0.875rem 1rem' }}>
          <span className="stat-label">{k}</span>
          <span className="stat-value" style={{ fontSize: '1.25rem', color: c }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- animated tab bar with sliding indicator ---------- */
function DossierTabs({ tab, setTab }) {
  const wrapRef = useRef(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const el = wrapRef.current?.querySelector('[data-tab="' + tab + '"]');
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab]);

  return (
    <div className="dossier-tabs" ref={wrapRef}>
      {TABS.map(t => (
        <button
          key={t.key}
          data-tab={t.key}
          className={`dossier-tab ${tab === t.key ? 'is-active' : ''}`}
          onClick={() => setTab(t.key)}
        >
          <t.Icon size={13} style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />{t.label}
        </button>
      ))}
      {ind.width > 0 && <span className="dossier-tab-indicator" style={{ transform: `translateX(${ind.left}px)`, width: `${ind.width}px` }} />}
    </div>
  );
}

/* ---------- add / edit form modal ---------- */
function EmployeeFormModal({ mode, form, setForm, departments, shifts, busy, idError, onClose, onSubmit, onChangeField }) {
  useEscapeClose(true, onClose);
  const invalid = !form.first_name.trim() || !form.department_id;

  const field = (label, node, hint) => (
    <div className="field">
      <label className="field-label">{label}</label>
      {node}
      {hint && <span style={{ fontSize: '0.625rem', color: 'var(--text-caption)' }}>{hint}</span>}
    </div>
  );

  const divider = (text) => (
    <div style={{ gridColumn: '1 / -1', marginTop: '0.35rem', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-caption)' }}>
      {text}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ width: '100%', maxWidth: '34rem', padding: 0 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head" style={{ background: 'var(--bg-surface-subtle)', padding: '1rem 1.25rem' }}>
          <div>
            <span className="eyebrow">{mode === 'create' ? 'New record · code is auto-generated' : 'Edit record'}</span>
            <h3 style={{ margin: 0 }}>{mode === 'create' ? 'Add employee' : form.first_name}</h3>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={17} /></button>
        </div>
        <div style={{ padding: '1.125rem 1.25rem 1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.875rem', overflowY: 'auto', maxHeight: 'calc(92dvh - 9rem)' }}>
          {field('First name *', <input className="input" value={form.first_name} onChange={e => onChangeField('first_name', e.target.value)} placeholder="Anita" />)}
          {field('Last name', <input className="input" value={form.last_name} onChange={e => onChangeField('last_name', e.target.value)} placeholder="Sharma" />)}
          {field('Gender', (
            <select className="input" value={form.gender} onChange={e => onChangeField('gender', e.target.value)}>
              <option>Other</option><option>Male</option><option>Female</option>
            </select>
          ))}
          {field('Department *', (
            <select className="input" value={form.department_id} onChange={e => onChangeField('department_id', e.target.value)}>
              <option value="">Select department</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          ))}
          {field('Designation', <input className="input" value={form.designation} onChange={e => onChangeField('designation', e.target.value)} placeholder="Staff Nurse" />)}
          {field('Shift', (
            <select className="input" value={form.shift_id} onChange={e => onChangeField('shift_id', e.target.value)}>
              <option value="">No default shift</option>
              {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ))}
          {field('Date of joining', <input type="date" className="input" value={form.date_of_joining} onChange={e => onChangeField('date_of_joining', e.target.value)} />)}
          {field('Mobile', <input className="input" value={form.mobile} onChange={e => onChangeField('mobile', e.target.value)} placeholder="98…" />)}
          {field('Email', <input type="email" className="input" value={form.email} onChange={e => onChangeField('email', e.target.value)} placeholder="name@hospital.in" />)}
          {field(
            'Biometric ID',
            <input className="input mono" value={form.biometric_user_id} onChange={e => onChangeField('biometric_user_id', e.target.value)} onBlur={() => onChangeField('biometric_user_id', form.biometric_user_id, true)} placeholder="device user id" />,
            'Optional — must be unique on the device'
          )}
          {field('Access card no', <input className="input mono" value={form.card_no} onChange={e => onChangeField('card_no', e.target.value)} placeholder="RCF / proximity card" />)}
          {field('Verify mode', (
            <select className="input" value={form.verify_mode} onChange={e => onChangeField('verify_mode', e.target.value)}>
              {VERIFY_MODES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          ))}

          {divider('Employment & payroll')}
          {field('Employment type', (
            <select className="input" value={form.employment_type} onChange={e => onChangeField('employment_type', e.target.value)}>
              {EMPLOYMENT_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          ))}
          {field('Date of birth', <input type="date" className="input" value={form.date_of_birth} onChange={e => onChangeField('date_of_birth', e.target.value)} />)}
          {field('Base CTC (₹)', <input type="number" min="0" className="input" value={form.base_ctc} onChange={e => onChangeField('base_ctc', e.target.value)} placeholder="18000" />)}
          {field('PAN', <input className="input mono" value={form.pan} onChange={e => onChangeField('pan', e.target.value)} placeholder="ABCDE1234F" style={{ textTransform: 'uppercase' }} />)}
          {field('UAN (EPF)', <input className="input mono" value={form.uan} onChange={e => onChangeField('uan', e.target.value)} placeholder="100xxxxxxxxx" />)}
          {field('ESI IP', <input className="input mono" value={form.esi_ip} onChange={e => onChangeField('esi_ip', e.target.value)} />)}
          {field('Bank name', <input className="input" value={form.bank_name} onChange={e => onChangeField('bank_name', e.target.value)} placeholder="State Bank of India" />)}
          {field('Bank account', <input className="input mono" value={form.bank_account} onChange={e => onChangeField('bank_account', e.target.value)} />)}
          {field('Bank IFSC', <input className="input mono" value={form.bank_ifsc} onChange={e => onChangeField('bank_ifsc', e.target.value)} placeholder="SBIN0000354" style={{ textTransform: 'uppercase' }} />)}

          {divider('Contact & location')}
          {field('Nationality', <input className="input" value={form.nationality} onChange={e => onChangeField('nationality', e.target.value)} placeholder="Indian" />)}
          {field('City', <input className="input" value={form.city} onChange={e => onChangeField('city', e.target.value)} />)}
          {field('Contact tel (home)', <input className="input" value={form.contact_tel} onChange={e => onChangeField('contact_tel', e.target.value)} />)}
          {field('Office tel', <input className="input" value={form.office_tel} onChange={e => onChangeField('office_tel', e.target.value)} />)}
          {idError && (
            <div className="field-error" style={{ gridColumn: '1 / -1' }}>
              <TriangleAlert size={13} style={{ flex: 'none', marginTop: 1 }} />
              <span>{idError}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', padding: '0 1.25rem 1.25rem' }}>
          <button className="island-btn" onClick={onClose}>Cancel</button>
          <button className="island-btn is-active" disabled={invalid || busy} onClick={onSubmit}>
            {busy ? <Loader2 size={14} className="spin" /> : <Users size={14} />}
            {mode === 'create' ? 'Create employee' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Employees() {
  const { authFetch, hasPerm, user } = useAuth();
  const canEdit = hasPerm('EMPLOYEES_EDIT');
  const canExport = hasPerm('EXPORTS');
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role);

  const { dateRange, setMode, setCustom, from, to } = useDateRange('month');
  const api = useCallback((path, opts = {}) => authFetch(path, opts)
    .then(r => r.json())
    .then(d => (d.success || d.employee || d.available != null ? d : { success: false, error: d.error })), [authFetch]);

  const [employees, setEmployees] = useState([]);
  const [listReady, setListReady] = useState(false); // stops a false "0 active employees" flash
  const [departments, setDepartments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [org, setOrg] = useState(null);
  const [departmentId, setDepartmentId] = useState('');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('profile');
  const [attRows, setAttRows] = useState(null); // null = not fetched yet

  const [formMode, setFormMode] = useState(null);           // 'create' | 'edit'
  const [form, setForm] = useState(emptyForm());
  const [idError, setIdError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(null); // employee row
  const [message, setMessage] = useState(null);

  useEscapeClose(!!formMode, () => setFormMode(null));
  useEscapeClose(!!confirmArchive, () => setConfirmArchive(null));
  // The dossier is an inline panel, so Escape (and an explicit close button) is
  // the only way out once someone has picked an employee.
  useEscapeClose(!!selectedId && !formMode && !confirmArchive, () => { setSelectedId(null); setDetail(null); });

  const flash = (msg) => { setMessage(msg); setTimeout(() => setMessage(null), 3500); };

  const loadList = useCallback(() => {
    const qs = new URLSearchParams();
    if (departmentId) qs.set('departmentId', departmentId);
    if (search.trim()) qs.set('search', search.trim());
    if (showInactive && isAdmin) qs.set('status', 'ALL');
    api(`/api/v1/organization/employees?${qs}`)
      .then(d => { if (d.success) setEmployees(d.employees); })
      .finally(() => setListReady(true));
  }, [departmentId, search, showInactive, isAdmin, api]);

  useEffect(() => { api('/api/v1/organization/departments').then(d => d.success && setDepartments(d.departments)); }, [api]);
  useEffect(() => { api('/api/v1/organization/shifts').then(d => d.success && setShifts(d.shifts)); }, [api]);
  useEffect(() => { api('/api/v1/organization/settings').then(d => d.success && setOrg(d.settings)); }, [api]);
  useEffect(loadList, [loadList]);

  const loadDetail = useCallback((id) => {
    setSelectedId(id);
    setDetail(null);
    setAttRows(null);
    api(`/api/v1/organization/employees/${id}?from=${from}&to=${to}`).then(d => setDetail(d.success ? d : null));
  }, [api, from, to]);

  // Refresh the open dossier when the range changes; drop it if the person vanished from the list
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selectedId && !employees.some(e => e.id === selectedId)) { setSelectedId(null); setDetail(null); }
  }, [employees, selectedId]);

  useEffect(() => {
    if (tab !== 'attendance' || !selectedId) return;
    setAttRows(null);
    api(`/api/v1/attendance/records?from=${from}&to=${to}&employeeId=${selectedId}&includeInactive=1`)
      .then(d => setAttRows(d.success ? (d.records || []) : []));
  }, [tab, selectedId, from, to, api]);

  /* ---------- id availability ---------- */
  const checkBio = useCallback(async (value) => {
    setIdError('');
    const v = String(value || '').trim();
    if (!v) return true;
    const qs = new URLSearchParams({ field: 'biometric_user_id', value: v });
    if (formMode === 'edit' && selectedId) qs.set('excludeId', selectedId);
    const d = await api(`/api/v1/organization/employees/check-id?${qs}`);
    if (d.success && d.available === false) {
      const h = d.holder || {};
      setIdError(`Biometric ID ${v} is already assigned to ${h.full_name || 'another employee'}${h.employee_code ? ` (${h.employee_code})` : ''}`);
      return false;
    }
    return true;
  }, [api, formMode, selectedId]);

  const onField = (key, value, alsoCheck) => {
    setForm(f => ({ ...f, [key]: value }));
    if (alsoCheck && key === 'biometric_user_id') checkBio(value);
  };

  /* ---------- CRUD ---------- */
  const openCreate = () => {
    setForm(emptyForm());
    setFormMode('create');
    setIdError('');
  };
  const openEdit = (e) => {
    setForm(formFromEmployee(e));
    setFormMode('edit');
    setIdError('');
  };

  const submitForm = async () => {
    if (!(await checkBio(form.biometric_user_id))) return;
    setSaving(true);
    try {
      // Normalize blank inputs to null: on create the column falls back to its default,
      // on edit coalesce(?, col) leaves the stored value untouched (never blank it, and
      // never send '' into a DATE/REAL column).
      const body = {};
      for (const [k, v] of Object.entries(form)) body[k] = (typeof v === 'string' && v.trim() === '') ? null : v;
      if (body.date_of_joining == null) delete body.date_of_joining;
      const d = formMode === 'create'
        ? await api('/api/v1/organization/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await api(`/api/v1/organization/employees/${selectedId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (d.success) {
        flash(d.message || 'Saved');
        setFormMode(null);
        loadList();
        if (formMode === 'edit') loadDetail(selectedId);
        if (formMode === 'create' && d.employee) loadDetail(d.employee.id);
      } else {
        const msg = d.error || 'Failed to save';
        if (/biometric/i.test(msg)) setIdError(msg); else alert(msg);
      }
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const setStatus = async (emp, status) => {
    setSaving(emp.id);
    try {
      const d = await api(`/api/v1/organization/employees/${emp.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status })
      });
      if (d.success) { flash(`${emp.full_name} → ${STATUS_LABEL[status]}`); setConfirmArchive(null); loadList(); }
      else alert(d.error || 'Failed to update status');
    } catch (err) { alert(err.message); }
    finally { setSaving(null); }
  };

  const exportDossier = async (format) => {
    const qs = new URLSearchParams({ from, to, employeeId: selectedId, format });
    if (detail?.employee?.status !== 'ACTIVE') qs.set('includeInactive', '1');
    try {
      const res = await authFetch(`/api/v1/attendance/export?${qs}`);
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Export failed'); return; }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${detail?.employee?.employee_code || 'employee'}_attendance_${from}_to_${to}.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) { alert(err.message); }
  };

  const emp = detail?.employee;
  const tenure = detail?.tenure || {};
  const bannerSub = useMemo(() => {
    if (!emp) return '';
    const orgName = org?.name || 'the organisation';
    const from_ = tenure.from ? String(tenure.from).slice(0, 10) : 'date on file';
    const to_ = tenure.to ? String(tenure.to).slice(0, 10) : (emp.status === 'ACTIVE' ? 'present' : '—');
    return `Employee at ${orgName} from ${from_} to ${to_} · ${STATUS_LABEL[emp.status] || emp.status}`;
  }, [emp, org, tenure]);

  return (
    <div className="page">
      {message && <div className="demo-banner" style={{ borderColor: 'rgba(16,185,129,.4)', background: 'var(--brand-primary-light)', color: 'var(--brand-primary-ink)' }}>{message}</div>}

      <div className="page-head">
        <div className="page-title-wrap">
          <h1>Employees</h1>
          <span className="page-desc">{listReady ? employees.length : '…'} {showInactive ? 'records (incl. archived)' : 'active employees'}. Select one to open their dossier.</span>
        </div>
        <div className="page-actions">
          <DateRangePicker dateRange={dateRange} setMode={setMode} setCustom={setCustom} />
          <select className="input" style={{ width: 170 }} value={departmentId} onChange={e => setDepartmentId(e.target.value)}>
            <option value="">All departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <div className="search-box">
            <Search size={15} className="search-icon" />
            <input className="input" placeholder="Name / code / biometric ID…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {isAdmin && (
            <span className="island-btn" style={{ gap: '0.625rem' }}>
              <span style={{ fontSize: '0.7188rem' }}>Show archived</span>
              <button className="sw-toggle" role="switch" aria-checked={showInactive} onClick={() => setShowInactive(s => !s)}><span className="sw-knob" /></button>
            </span>
          )}
          {canEdit && (
            <button className="island-btn is-active" onClick={openCreate}>
              <span className="icon-orb"><UserPlus size={14} /></span>Add employee
            </button>
          )}
        </div>
      </div>

      <div className="dash-grid dg-near dg-start">
        <section className="section-card">
          <div className="section-head">
            <span className="section-title"><Users size={16} /> Directory</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{employees.length} shown</span>
          </div>
          <div className="table-wrap">
            <table className="swaniki-table">
              <thead>
                <tr><th>Employee</th><th>Designation</th><th>Department</th><th>Shift</th><th>Status</th>{canEdit && <th></th>}</tr>
              </thead>
              <tbody>
                {employees.map((e, i) => {
                  const inactive = e.status !== 'ACTIVE';
                  const gaps = missingDetailCount(e);
                  return (
                    <tr
                      key={e.id}
                      onClick={() => loadDetail(e.id)}
                      className={`anim-fade-up ${selectedId === e.id ? 'file-row-active' : ''}`}
                      style={{ cursor: 'pointer', animationDelay: `${Math.min(i * 18, 260)}ms`, opacity: inactive ? 0.72 : 1 }}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                          <span className="avatar-sq">{e.full_name?.charAt?.(0) || '?'}</span>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{e.full_name}</div>
                            <div className="mono" style={{ fontSize: '0.6563rem', color: 'var(--text-caption)' }}>
                              {e.employee_code}{e.biometric_user_id ? ` · ${e.biometric_user_id}` : ''}
                            </div>
                            {canEdit && gaps > 0 && (
                              <button
                                onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}
                                title={`${gaps} detail(s) not captured — click to complete`}
                                style={{ marginTop: '0.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(180,83,9,0.10)', color: 'var(--warning-ink)', border: '1px solid rgba(180,83,9,0.26)', borderRadius: '9999px', padding: '0.05rem 0.45rem', fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer' }}
                              >
                                <TriangleAlert size={10} /> {gaps} to fill
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{e.designation || '—'}</td>
                      <td>{e.department_name}</td>
                      <td>{e.shift_name || '—'}</td>
                      <td><span className={`status-pill ${STATUS_PILL[e.status] || 'status-muted'}`}>{STATUS_LABEL[e.status] || e.status}</span></td>
                      {canEdit && (
                        <td onClick={ev => ev.stopPropagation()}>
                          <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => openEdit(e)} title="Edit details">
                              <Pencil size={13} /> Edit
                            </button>
                            {inactive ? (
                              <button className="btn btn-ghost btn-sm" disabled={saving === e.id} onClick={() => setStatus(e, 'ACTIVE')} title="Reactivate">
                                {saving === e.id ? <Loader2 size={13} className="spin" /> : <ArchiveRestore size={13} />} Restore
                              </button>
                            ) : (
                              <button className="btn btn-rose btn-sm" onClick={() => setConfirmArchive(e)} title="Archive (keeps all history)">
                                <Archive size={13} /> Archive
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {employees.length === 0 && (
                  <tr><td colSpan={canEdit ? 6 : 5}><div className="empty-state"><p>No employees found for this search.</p></div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section-card">
          <div className="section-head">
            <span className="section-title"><IdCard size={16} /> Dossier</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              {emp && canExport && (
                <>
                  <button className="island-btn" style={{ padding: '0.3rem 0.7rem', fontSize: '0.6875rem' }} onClick={() => exportDossier('csv')}>
                    <Download size={12} /> CSV
                  </button>
                  <button className="island-btn" style={{ padding: '0.3rem 0.7rem', fontSize: '0.6875rem' }} onClick={() => exportDossier('xlsx')}>
                    <Download size={12} /> Excel
                  </button>
                </>
              )}
              {selectedId && (
                <button className="icon-btn" title="Close dossier" onClick={() => { setSelectedId(null); setDetail(null); }}><X size={16} /></button>
              )}
            </div>
          </div>

          {!selectedId && (
            <div className="empty-state" style={{ padding: '4rem 1.5rem' }}>
              <Users size={30} className="empty-icon" />
              <p>Select an employee to view profile, attendance, payroll and leave history.</p>
            </div>
          )}
          {selectedId && !detail && <div className="loading-state"><Loader2 size={24} className="spin" /><p>Loading dossier…</p></div>}

          {emp && (
            <>
              <div style={{ padding: '1.5rem 1.5rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                  <span className="avatar-sq" style={{ width: '3.25rem', height: '3.25rem', fontSize: '1.25rem' }}>{emp.full_name?.charAt(0)}</span>
                  <div style={{ minWidth: 0 }}>
                    <span className="eyebrow" style={{ color: 'var(--brand-primary-ink)' }}>{emp.designation || 'Employee'} · {emp.department_name}</span>
                    <h2 style={{ margin: '0.2rem 0 0.1rem', fontSize: '1.375rem' }}>{emp.full_name}</h2>
                    <span className="mono" style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>
                      {emp.employee_code}{emp.biometric_user_id ? ` · Bio ID ${emp.biometric_user_id}` : ''}{emp.shift_name ? ` · ${emp.shift_name}` : ''}
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.875rem 0 0' }}>{bannerSub}</p>
                {detail.archived && (
                  <span className="status-pill status-warn" style={{ marginTop: '0.625rem' }}>Archived · history retained</span>
                )}
              </div>

              <DossierTabs tab={tab} setTab={setTab} />

              <div className="section-body anim-fade-up" key={tab} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {tab === 'profile' && (
                  <>
                    <div className="kv-grid">
                      <div className="kv"><span className="k">Mobile</span><span className="v">{emp.mobile || emp.mobile_no || '—'}</span></div>
                      <div className="kv"><span className="k">Email</span><span className="v">{emp.email || '—'}</span></div>
                      <div className="kv"><span className="k">Date of joining</span><span className="v">{emp.date_of_joining ? String(emp.date_of_joining).slice(0, 10) : '—'}</span></div>
                      <div className="kv"><span className="k">Employment type</span><span className="v">{emp.employment_type || '—'}</span></div>
                      <div className="kv"><span className="k">Base CTC</span><span className="v mono">{emp.base_ctc ? `₹${Number(emp.base_ctc).toLocaleString('en-IN')}` : '—'}</span></div>
                      <div className="kv"><span className="k">PAN</span><span className="v">{emp.pan || '—'}</span></div>
                      <div className="kv"><span className="k">UAN (EPF)</span><span className="v">{emp.uan || '—'}</span></div>
                      <div className="kv"><span className="k">ESI IP</span><span className="v">{emp.esi_ip || '—'}</span></div>
                      <div className="kv"><span className="k">Bank</span><span className="v">{emp.bank_name || '—'}</span></div>
                      <div className="kv"><span className="k">Account</span><span className="v">{emp.bank_account || '—'}</span></div>
                      <div className="kv"><span className="k">IFSC</span><span className="v">{emp.bank_ifsc || '—'}</span></div>
                      <div className="kv"><span className="k">Status</span><span className="v">{STATUS_LABEL[emp.status] || emp.status}</span></div>
                    </div>

                    <div>
                      <div className="section-title" style={{ marginBottom: '0.5rem', fontSize: '0.8125rem' }}><Briefcase size={14} /> Address & documents</div>
                      {detail.personal ? (
                        <div className="kv-grid">
                          <div className="kv"><span className="k">Address</span><span className="v">{detail.personal.current_address || '—'}</span></div>
                          <div className="kv"><span className="k">Emergency contact</span><span className="v">{detail.personal.emergency_contact_name || '—'} {detail.personal.emergency_contact_number || ''}</span></div>
                        </div>
                      ) : <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No personal details filed.</p>}
                      <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        {(detail.documents || []).map(doc => (
                          <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7813rem', color: 'var(--text-muted)' }}>
                            <FileText size={14} />
                            <span>{doc.document_type}</span>
                            <span className="mono" style={{ color: 'var(--text-caption)' }}>{doc.document_no}</span>
                            <span className={`status-pill ${(doc.verified_at || doc.verification_status === 'VERIFIED') ? 'status-ok' : 'status-warn'}`}>{doc.verified_at ? 'Verified' : 'Pending'}</span>
                          </div>
                        ))}
                        {(!detail.documents || detail.documents.length === 0) && <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No documents filed yet.</p>}
                      </div>
                    </div>
                  </>
                )}

                {tab === 'attendance' && (
                  <>
                    <div>
                      <div className="section-title" style={{ marginBottom: '0.5rem', fontSize: '0.8125rem' }}>Scorecard · {dateRange.label}</div>
                      <AttendanceStats a={detail.attendance} />
                    </div>
                    <div>
                      <div className="section-title" style={{ marginBottom: '0.5rem', fontSize: '0.8125rem' }}><LayoutGrid size={14} /> Day grid</div>
                      {attRows == null
                        ? <div className="loading-state"><Loader2 size={20} className="spin" /></div>
                        : attRows.length === 0
                        ? <div className="empty-state" style={{ padding: '1.5rem' }}><p>No attendance rows in this range.</p></div>
                        : <MonthGrid records={attRows} from={from} to={to} />}
                    </div>
                  </>
                )}

                {tab === 'payroll' && (
                  <div className="table-wrap">
                    <table className="swaniki-table">
                      <thead><tr><th>Month</th><th>Gross</th><th>Deductions</th><th>Net paid</th></tr></thead>
                      <tbody>
                        {(detail.payrollHistory || []).map(p => (
                          <tr key={p.month_year}>
                            <td className="mono">{p.month_year}</td>
                            <td className="mono">₹{Number(p.gross_earnings || 0).toLocaleString('en-IN')}</td>
                            <td className="mono">₹{Number(p.total_deductions || 0).toLocaleString('en-IN')}</td>
                            <td className="mono" style={{ fontWeight: 600, color: 'var(--brand-primary-ink)' }}>₹{Number(p.net_salary || 0).toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                        {(!detail.payrollHistory || detail.payrollHistory.length === 0) && (
                          <tr><td colSpan={4}><div className="empty-state"><p>No payslips generated for this employee yet.</p></div></td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {tab === 'leaves' && (
                  <>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {(detail.leavesSummary || []).map(lb => (
                        <span key={`${lb.leave_type_id}-${lb.year}`} className="filter-pill">
                          {lb.leave_type} · {lb.year}
                          <b style={{ marginLeft: '0.35rem', color: 'var(--text-heading)' }}>{Number(lb.accumulated || 0) - Number(lb.used || 0)} left</b>
                        </span>
                      ))}
                      {(!detail.leavesSummary || detail.leavesSummary.length === 0) && (
                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No leave balances on file.</span>
                      )}
                    </div>
                    <div className="table-wrap">
                      <table className="swaniki-table">
                        <thead><tr><th>From</th><th>To</th><th>Days</th><th>Type</th><th>Status</th></tr></thead>
                        <tbody>
                          {(detail.leaveHistory || []).map(l => (
                            <tr key={l.id}>
                              <td className="mono">{String(l.from_date).slice(0, 10)}</td>
                              <td className="mono">{String(l.to_date).slice(0, 10)}</td>
                              <td className="mono">{l.days}</td>
                              <td>{l.leave_type || '—'}</td>
                              <td><span className={`status-pill ${l.status === 'APPROVED' ? 'status-ok' : l.status === 'REJECTED' ? 'status-bad' : 'status-warn'}`}>{l.status}</span></td>
                            </tr>
                          ))}
                          {(!detail.leaveHistory || detail.leaveHistory.length === 0) && (
                            <tr><td colSpan={5}><div className="empty-state"><p>No leave requests recorded.</p></div></td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {formMode && (
        <EmployeeFormModal
          mode={formMode}
          form={form}
          setForm={setForm}
          departments={departments}
          shifts={shifts}
          busy={saving}
          idError={idError}
          onClose={() => setFormMode(null)}
          onSubmit={submitForm}
          onChangeField={onField}
        />
      )}

      {confirmArchive && (
        <div className="modal-overlay" onClick={() => setConfirmArchive(null)}>
          <div className="modal-card" style={{ width: '100%', maxWidth: '26rem', padding: 0 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head" style={{ padding: '1rem 1.25rem' }}>
              <div>
                <span className="eyebrow">Status change · no data deleted</span>
                <h3 style={{ margin: 0 }}>Archive {confirmArchive.full_name}?</h3>
              </div>
              <button className="icon-btn" onClick={() => setConfirmArchive(null)}><X size={17} /></button>
            </div>
            <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
                They will disappear from the default directory and attendance filters, but their attendance, payroll
                and leave history stay intact and remain visible through “Show archived”.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button className="island-btn" onClick={() => setConfirmArchive(null)}>Cancel</button>
                <button className="island-btn is-active" disabled={saving === confirmArchive.id} onClick={() => setStatus(confirmArchive, 'INACTIVE')}>
                  {saving === confirmArchive.id ? <Loader2 size={14} className="spin" /> : <Archive size={14} />} Archive employee
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
