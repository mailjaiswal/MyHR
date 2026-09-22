import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2, Save, Loader2, Settings2, Hourglass, Cpu, Pencil, X, Check, Plus,
  CalendarClock, ShieldCheck, Users, ChevronRight, Layers, KeyRound, Trash2, Network,
  Bell, Mail, Send, Inbox,
  DatabaseBackup, Play, Download, RotateCcw
} from 'lucide-react';
import { useOrganization } from '../context/OrganizationContext';
import { useAuth } from '../context/AuthContext';
import useEscapeClose from '../hooks/useEscapeClose';

const FIELDS = ['name', 'tagline', 'industry_label', 'address', 'contact_person', 'director_name', 'director_title', 'contact_phone', 'contact_email', 'gstin', 'registration_no'];
const ROLES = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', EMPLOYEE: 'Employee' };
const DATA_SCOPES = ['SELF', 'TEAM', 'DEPARTMENT', 'ALL'];
const ALL_PERMS = [
  'DASHBOARD_VIEW', 'ATTENDANCE_VIEW', 'ATTENDANCE_EDIT', 'REGULARIZATION_APPROVE',
  'PAYROLL_VIEW', 'PAYROLL_MANAGE', 'EMPLOYEES_VIEW', 'EMPLOYEES_EDIT',
  'LEAVES_VIEW', 'LEAVES_REQUEST', 'LEAVES_APPROVE', 'ROSTER_VIEW', 'ROSTER_EDIT',
  'SETTINGS_VIEW', 'SETTINGS_EDIT', 'ACCESS_MANAGE', 'EXPORTS', 'DEMO_LAB', 'AUDIT_VIEW'
];

const TABS = [
  { key: 'company', label: 'Company', icon: Building2 },
  { key: 'roster', label: 'Shift Roster', icon: Hourglass },
  { key: 'roles', label: 'Roles', icon: ShieldCheck },
  { key: 'leaves', label: 'Leave Policy', icon: CalendarClock },
  { key: 'access', label: 'Access Management', icon: Network, perm: 'ACCESS_MANAGE' },
  { key: 'notifications', label: 'Notifications & Audit', icon: Bell, perm: 'SETTINGS_VIEW' },
  { key: 'backup', label: 'Backup & Recovery', icon: DatabaseBackup, perm: 'SETTINGS_VIEW' }
];

export default function Settings() {
  const { org, refreshOrg } = useOrganization();
  const { user, authFetch, hasPerm } = useAuth();
  const api = useCallback((path, opts = {}) => authFetch(path, opts).then(r => r.json()).then(d => (d.success ? d : { success: false, error: d.error })), [authFetch]);
  const [tab, setTab] = useState('company');

  const [settings, setSettings] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [devices, setDevices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [balances, setBalances] = useState([]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState(null);
  const [editingShiftId, setEditingShiftId] = useState(null);
  const [shiftForm, setShiftForm] = useState({});
  const [busy, setBusy] = useState(null);
  const [balanceType, setBalanceType] = useState('');

  const load = useCallback(() => {
    api('/api/v1/organization/settings').then(d => d.success && setSettings(d.settings));
    api('/api/v1/organization/departments').then(d => d.success && setDepartments(d.departments));
    api('/api/v1/organization/shifts').then(d => d.success && setShifts(d.shifts));
    api('/api/v1/biometrics/devices').then(d => d.success && setDevices(d.devices));
    api('/api/v1/organization/employees').then(d => d.success && setEmployees(d.employees)).catch(() => {});
    api('/api/v1/leaves/types').then(d => d.success && setLeaveTypes(d.types));
    api('/api/v1/leaves/balances?year=2026').then(d => d.success && setBalances(d.balances));
  }, [api]);
  useEffect(load, [load]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 3500); };

  const saveSettings = async () => {
    setSaving(true); setSaved(false);
    try {
      const body = {};
      FIELDS.forEach(f => { if (settings[f] !== undefined) body[f] = settings[f]; });
      const d = await api('/api/v1/organization/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (d.success) { setSettings(d.settings); setSaved(true); refreshOrg(); flash('Company settings saved'); }
      else alert(d.error || 'Failed to save');
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  // ── Shift timings (Company tab) ──
  const startEditShift = (s) => {
    setEditingShiftId(s.id);
    setShiftForm({ name: s.name, start_time: s.start_time, end_time: s.end_time, duration_hours: s.duration_hours, is_cross_midnight: s.is_cross_midnight, grace_minutes: s.grace_minutes });
  };
  const saveShift = async (id) => {
    try {
      const d = await api(`/api/v1/organization/shifts/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shiftForm)
      });
      if (d.success) load(); else alert(d.error || 'Failed to update shift');
    } catch (err) { alert(err.message); }
    finally { setEditingShiftId(null); }
  };
  const addShift = async () => {
    try {
      const d = await api('/api/v1/organization/shifts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Shift', start_time: '09:00', end_time: '18:00', duration_hours: 8 })
      });
      if (d.success) load(); else alert(d.error || 'Failed to create shift');
    } catch (err) { alert(err.message); }
  };

  // ── Roster tab: employee ↔ shift assignment ──
  const changeEmployeeShift = async (empId, shiftId) => {
    setBusy(empId);
    try {
      const d = await api(`/api/v1/organization/employees/${empId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: shiftId || null })
      });
      if (d.success) { flash(`Shift updated for ${d.employee.full_name}`); load(); }
      else alert(d.error || 'Failed to update shift');
    } catch (err) { alert(err.message); }
    finally { setBusy(null); }
  };

  // ── Roles tab ──
  const changeRole = async (empId, role) => {
    setBusy(empId);
    try {
      const d = await api(`/api/v1/organization/employees/${empId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      if (d.success) { flash(`Role set to ${ROLES[role]} for ${d.employee.full_name}`); load(); }
      else alert(d.error || 'Failed to update role');
    } catch (err) { alert(err.message); }
    finally { setBusy(null); }
  };

  // ── Leave Policy tab ──
  const [typeForm, setTypeForm] = useState({});
  const editType = (t) => setTypeForm({ ...typeForm, [t.id]: { name: t.name, code: t.code, annual_allowance: t.annual_allowance, paid: !!t.paid, color_code: t.color_code } });
  const saveType = async (t) => {
    const f = typeForm[t.id];
    setBusy(t.id);
    try {
      const d = await api(`/api/v1/leaves/types/${t.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: f.name, code: f.code, annual_allowance: Number(f.annual_allowance), paid: f.paid ? 1 : 0, color_code: f.color_code })
      });
      if (d.success) { flash(`Leave type '${d.type.name}' updated`); load(); }
      else alert(d.error || 'Failed to update type');
    } catch (err) { alert(err.message); }
    finally { setBusy(null); }
  };
  const pushAllowance = async (t) => {
    setBusy(t.id + ':all');
    try {
      const d = await api('/api/v1/leaves/balances/set-all', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leave_type_id: t.id, year: 2026, accumulated: Number(typeForm[t.id]?.annual_allowance ?? t.annual_allowance) })
      });
      if (d.success) { flash(d.message); load(); } else alert(d.error || 'Failed');
    } catch (err) { alert(err.message); }
    finally { setBusy(null); }
  };
  const [newType, setNewType] = useState({ code: '', name: '', annual_allowance: 0 });
  const addType = async () => {
    if (!newType.code || !newType.name) { alert('Provide code and name'); return; }
    try {
      const d = await api('/api/v1/leaves/types', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newType.code, name: newType.name, annual_allowance: Number(newType.annual_allowance) })
      });
      if (d.success) { flash(d.message); setNewType({ code: '', name: '', annual_allowance: 0 }); load(); }
      else alert(d.error || 'Failed');
    } catch (err) { alert(err.message); }
  };
  const [balEdit, setBalEdit] = useState({});
  const saveBalance = async (b) => {
    const v = Number(balEdit[b.id]);
    setBusy(b.id);
    try {
      const d = await api(`/api/v1/leaves/balances/${b.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accumulated: v })
      });
      if (d.success) { flash(`Opening balance updated for ${b.full_name}`); load(); }
      else alert(d.error || 'Failed');
    } catch (err) { alert(err.message); }
    finally { setBusy(null); }
  };

  const employeesByShift = (shiftId) => employees.filter(e => (e.shift_id || null) === shiftId);
  const filteredBalances = balanceType ? balances.filter(b => b.leave_type_id === balanceType) : balances;

  // ── Access Management tab (RBAC) ──
  const [roles, setRoles] = useState([]);
  const [hierarchy, setHierarchy] = useState([]);
  const [expandedRole, setExpandedRole] = useState(null);
  const [roleMembers, setRoleMembers] = useState([]);
  const [newRole, setNewRole] = useState({ name: '', technical_key: '', data_scope: 'SELF' });
  const [resetResult, setResetResult] = useState(null);

  const loadAccess = useCallback(() => {
    if (!hasPerm('ACCESS_MANAGE')) return;
    api('/api/v1/access/roles').then(d => d.success && setRoles(d.roles));
    api('/api/v1/access/hierarchy').then(d => d.success && setHierarchy(d.hierarchy));
  }, [hasPerm, api]);
  useEffect(loadAccess, [loadAccess]);

  const parsePerms = (r) => {
    let p = r.permissions;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = []; } }
    return Array.isArray(p) ? p : [];
  };

  const toggleRolePerm = async (role, perm) => {
    const cur = parsePerms(role);
    const next = cur.includes(perm) ? cur.filter(x => x !== perm) : [...cur, perm];
    const d = await api(`/api/v1/access/roles/${role.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: next })
    });
    if (d.success) setRoles(rs => rs.map(r => r.id === role.id ? { ...r, permissions: next } : r));
    else alert(d.error || 'Failed');
  };

  const updateRoleScope = async (role, data_scope) => {
    const d = await api(`/api/v1/access/roles/${role.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data_scope })
    });
    if (d.success) setRoles(rs => rs.map(r => r.id === role.id ? { ...r, data_scope } : r));
    else alert(d.error || 'Failed');
  };

  const createRole = async () => {
    if (!newRole.name || !newRole.technical_key) { alert('Name and technical key required'); return; }
    const d = await api('/api/v1/access/roles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newRole, permissions: [] })
    });
    if (d.success) { setNewRole({ name: '', technical_key: '', data_scope: 'SELF' }); loadAccess(); }
    else alert(d.error || 'Failed to create role');
  };

  const deleteRole = async (role) => {
    if (!window.confirm(`Delete role '${role.name}'?`)) return;
    const d = await api(`/api/v1/access/roles/${role.id}`, { method: 'DELETE' });
    if (d.success) loadAccess(); else alert(d.error || 'Failed to delete role');
  };

  const openRoleMembers = async (role) => {
    if (expandedRole === role.id) { setExpandedRole(null); return; }
    setExpandedRole(role.id);
    const d = await api(`/api/v1/access/roles/${role.id}/members`);
    setRoleMembers(d.success ? d.members : []);
  };

  const assignRole = async (empId, roleId) => {
    const d = await api(`/api/v1/access/employees/${empId}/role`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: roleId })
    });
    if (d.success) { flash('Role assigned'); loadAccess(); } else alert(d.error || 'Failed');
  };

  const setManager = async (empId, managerId) => {
    const d = await api(`/api/v1/access/employees/${empId}/manager`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manager_id: managerId || null })
    });
    if (d.success) { flash('Reporting line updated'); loadAccess(); } else alert(d.error || 'Failed');
  };

  const resetPassword = async (empId) => {
    const d = await api('/api/v1/auth/reset-password', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: empId })
    });
    if (d.success) setResetResult(d); else alert(d.error || 'Failed');
  };

  // ── Notifications & Audit tab ──
  const canEditNotif = hasPerm('SETTINGS_EDIT');
  const [notif, setNotif] = useState(null); // { smtp:{host,port,user,password,from,secure}, email_enabled, event_prefs, events, smtp_from_env }
  const [outbox, setOutbox] = useState([]);
  const [outboxCounts, setOutboxCounts] = useState({ pending: 0, sent: 0, failed: 0 });
  const [outboxFilter, setOutboxFilter] = useState('');
  const [retention, setRetention] = useState(365);
  const [testTo, setTestTo] = useState('');
  const [notifBusy, setNotifBusy] = useState(null);

  const loadNotif = useCallback(async () => {
    const d = await api('/api/v1/notifications/settings');
    if (d.success) setNotif({ smtp: d.smtp, email_enabled: d.email_enabled, event_prefs: d.event_prefs || {}, events: d.events || [], smtp_from_env: d.smtp_from_env });
    api('/api/v1/audit/settings').then(a => a.success && setRetention(a.audit_retention_days));
  }, [api]);

  const loadOutbox = useCallback(async (status = '') => {
    const d = await api(`/api/v1/notifications/outbox?limit=50${status ? `&status=${status}` : ''}`);
    if (d.success) { setOutbox(d.entries); setOutboxCounts(d.counts); }
  }, [api]);

  useEffect(() => { if (tab === 'notifications' && hasPerm('SETTINGS_VIEW')) { loadNotif(); loadOutbox(outboxFilter); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  const toggleEvent = (ev) => setNotif(n => n ? { ...n, event_prefs: { ...n.event_prefs, [ev]: !(n.event_prefs[ev] !== false) } } : n);

  const saveNotif = async () => {
    setNotifBusy('save');
    try {
      const d = await api('/api/v1/notifications/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smtp: notif.smtp, email_enabled: notif.email_enabled, event_prefs: notif.event_prefs })
      });
      if (d.success) flash('Notification settings saved'); else alert(d.error || 'Failed to save');
    } catch (err) { alert(err.message); } finally { setNotifBusy(null); }
  };

  const sendTest = async () => {
    if (!testTo) { alert('Enter a recipient address'); return; }
    setNotifBusy('test');
    try {
      const d = await api('/api/v1/notifications/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: testTo })
      });
      if (d.success) { flash(d.message || 'Test email sent'); loadOutbox(outboxFilter); } else alert(d.message || d.error || 'Send failed');
    } catch (err) { alert(err.message); } finally { setNotifBusy(null); }
  };

  const flushNow = async () => {
    setNotifBusy('flush');
    try {
      const d = await api('/api/v1/notifications/flush-now', { method: 'POST' });
      if (d.success) { flash(`Flushed: ${d.sent} sent, ${d.failed} failed, ${d.pending} pending`); loadOutbox(outboxFilter); } else alert(d.error || 'Flush failed');
    } catch (err) { alert(err.message); } finally { setNotifBusy(null); }
  };

  const saveRetention = async () => {
    setNotifBusy('retention');
    try {
      const d = await api('/api/v1/audit/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audit_retention_days: Number(retention) })
      });
      if (d.success) { setRetention(d.audit_retention_days); flash(`Audit retention set to ${d.audit_retention_days} days`); } else alert(d.error || 'Failed');
    } catch (err) { alert(err.message); } finally { setNotifBusy(null); }
  };

  const OUTBOX_PILL = { SENT: 'status-ok', FAILED: 'status-bad', PENDING: 'status-warn' };

  // ── Backup & Recovery tab ──
  const [backup, setBackup] = useState(null); // { backup_enabled, backup_retention_count, bucket, configured }
  const [backups, setBackups] = useState([]);
  const [backupCounts, setBackupCounts] = useState({ ok: 0, failed: 0 });
  const [backupBusy, setBackupBusy] = useState(null);
  const [restoreTarget, setRestoreTarget] = useState(null); // { id, confirm }

  // Escape closes the restore-confirmation popup.
  useEscapeClose(!!restoreTarget, () => setRestoreTarget(null));

  const loadBackup = useCallback(async () => {
    const s = await api('/api/v1/backup/settings');
    if (s.success) setBackup(s);
    const l = await api('/api/v1/backup');
    if (l.success) { setBackups(l.entries); setBackupCounts(l.counts); }
  }, [api]);
  useEffect(() => { if (tab === 'backup' && hasPerm('SETTINGS_VIEW')) loadBackup(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  const saveBackupSettings = async () => {
    setBackupBusy('save');
    try {
      const d = await api('/api/v1/backup/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup_enabled: backup.backup_enabled, backup_retention_count: Number(backup.backup_retention_count) })
      });
      if (d.success) { flash('Backup settings saved'); loadBackup(); } else alert(d.error || d.message || 'Failed to save');
    } catch (err) { alert(err.message); } finally { setBackupBusy(null); }
  };

  const runBackupNow = async () => {
    setBackupBusy('run');
    try {
      const d = await api('/api/v1/backup/run-manual', { method: 'POST' });
      if (d.success) { flash('Backup completed'); loadBackup(); }
      else { alert(d.backup?.error || d.message || 'Backup failed'); loadBackup(); }
    } catch (err) { alert(err.message); } finally { setBackupBusy(null); }
  };

  const downloadBackup = async (id) => {
    setBackupBusy('dl' + id);
    try {
      const res = await authFetch(`/api/v1/backup/${id}/download`);
      if (!res.ok) { alert('Download failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `myhr_backup_${id}.sql`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(err.message); } finally { setBackupBusy(null); }
  };

  const doRestore = async () => {
    if (!restoreTarget) return;
    setBackupBusy('restore');
    try {
      const d = await api(`/api/v1/backup/${restoreTarget.id}/restore`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: restoreTarget.id })
      });
      if (d.success) { flash('Database restored from backup'); setRestoreTarget(null); loadBackup(); }
      else alert(d.message || d.error || 'Restore failed');
    } catch (err) { alert(err.message); } finally { setBackupBusy(null); }
  };

  const fmtBytes = (n) => { n = Number(n) || 0; return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'; };
  const BACKUP_PILL = { SUCCESS: 'status-ok', FAILED: 'status-bad', PENDING: 'status-warn' };

  return (
    <div className="page">
      {msg && <div className="demo-banner" style={{ borderColor: 'rgba(16,185,129,.4)', background: 'var(--brand-primary-light)', color: 'var(--brand-primary)' }}>{msg}</div>}

      <div className="page-head">
        <div className="page-title-wrap">
          <h1>Admin Panel</h1>
          <span className="page-desc">Shift rostering, employee roles, leave policy control and company settings.</span>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={saveSettings} disabled={saving || !settings}>
            {saving ? <Loader2 size={15} className="spin" /> : saved ? <Check size={15} /> : <Save size={15} />} {saved ? 'Saved' : 'Save company'}
          </button>
        </div>
      </div>

      <div className="seg">
        {TABS.filter(t => !t.perm || hasPerm(t.perm)).map(t => (
          <button key={t.key} className={`seg-btn ${tab === t.key ? 'seg-btn-active' : ''}`} onClick={() => setTab(t.key)}>
            <t.icon size={15} style={{ verticalAlign: '-3px', marginRight: '0.375rem' }} />{t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Company ── */}
      {tab === 'company' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <section className="section-card">
            <div className="section-head"><span className="section-title"><Building2 size={16} /> Company details</span></div>
            {!settings ? <div className="loading-state"><Loader2 size={22} className="spin" /></div> : (
              <div className="section-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.875rem' }}>
                {FIELDS.map(f => (
                  <div className="field" key={f}>
                    <label className="field-label" style={{ textTransform: 'capitalize' }}>{f.replace(/_/g, ' ')}</label>
                    <input className="input" value={settings[f] || ''} onChange={e => setSettings({ ...settings, [f]: e.target.value })} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="dash-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <section className="section-card">
              <div className="section-head"><span className="section-title"><Layers size={16} /> Departments</span><span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{departments.length}</span></div>
              <div className="section-body" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {departments.map(d => <span key={d.id} className="status-pill status-muted" style={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem' }}>{d.name}</span>)}
              </div>
            </section>

            <section className="section-card">
              <div className="section-head"><span className="section-title"><Cpu size={16} /> Devices</span><span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{devices.length} connected</span></div>
              <div className="table-wrap">
                <table className="swaniki-table">
                  <thead><tr><th>Device</th><th>Model</th><th>Status</th></tr></thead>
                  <tbody>
                    {devices.map(d => (
                      <tr key={d.id}>
                        <td className="mono" style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{d.device_name}</td>
                        <td>{d.model}</td>
                        <td><span className={`status-pill ${d.is_active ? 'status-ok' : 'status-muted'}`}>{d.is_active ? 'Active' : 'Inactive'}</span></td>
                      </tr>
                    ))}
                    {devices.length === 0 && <tr><td colSpan={3}><div className="empty-state"><p>No devices.</p></div></td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="section-card">
            <div className="section-head">
              <span className="section-title"><Settings2 size={16} /> Shift timings</span>
              <button className="btn btn-ghost btn-sm" onClick={addShift}><Plus size={14} /> Add shift</button>
            </div>
            <div className="table-wrap">
              <table className="swaniki-table">
                <thead><tr><th>Shift</th><th>Start</th><th>End</th><th>Hours</th><th>Grace</th><th>Cross-midnight</th><th></th></tr></thead>
                <tbody>
                  {shifts.map(s => (
                    <tr key={s.id}>
                      {editingShiftId === s.id ? (
                        <>
                          <td><input className="input" value={shiftForm.name || ''} onChange={e => setShiftForm({ ...shiftForm, name: e.target.value })} /></td>
                          <td><input type="time" className="input" value={shiftForm.start_time || ''} onChange={e => setShiftForm({ ...shiftForm, start_time: e.target.value })} /></td>
                          <td><input type="time" className="input" value={shiftForm.end_time || ''} onChange={e => setShiftForm({ ...shiftForm, end_time: e.target.value })} /></td>
                          <td><input type="number" step="0.5" className="input" style={{ width: 80 }} value={shiftForm.duration_hours} onChange={e => setShiftForm({ ...shiftForm, duration_hours: e.target.value })} /></td>
                          <td><input type="number" className="input" style={{ width: 80 }} value={shiftForm.grace_minutes} onChange={e => setShiftForm({ ...shiftForm, grace_minutes: e.target.value })} /></td>
                          <td><input type="checkbox" checked={!!shiftForm.is_cross_midnight} onChange={e => setShiftForm({ ...shiftForm, is_cross_midnight: e.target.checked ? 1 : 0 })} /></td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.375rem' }}>
                              <button className="btn btn-ghost btn-sm" onClick={saveShift}><Check size={14} /> Save</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setEditingShiftId(null)}><X size={14} /></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{s.name}</td>
                          <td className="mono">{s.start_time?.slice(0, 5)}</td>
                          <td className="mono">{s.end_time?.slice(0, 5)}</td>
                          <td className="mono">{s.duration_hours}h</td>
                          <td className="mono">{s.grace_minutes}m</td>
                          <td>{s.is_cross_midnight ? 'Yes' : 'No'}</td>
                          <td><button className="btn btn-ghost btn-sm" onClick={() => startEditShift(s)}><Pencil size={13} /> Edit</button></td>
                        </>
                      )}
                    </tr>
                  ))}
                  {shifts.length === 0 && <tr><td colSpan={7}><div className="empty-state"><p>No shifts defined.</p></div></td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ── Tab: Shift Roster ── */}
      {tab === 'roster' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="demo-banner" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-surface-subtle)', color: 'var(--text-muted)' }}>
            <Hourglass size={16} />
            <span>Assign an employee to a shift using the dropdown on each roster tile. Shift timings are configured under Company → Shift timings.</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {shifts.map(sv => {
              const staff = employeesByShift(sv.id);
              return (
                <section className="section-card" key={sv.id}>
                  <div className="section-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.375rem' }}>
                    <span className="section-title">{sv.name} · {sv.start_time?.slice(0, 5)} − {sv.end_time?.slice(0, 5)} ({sv.duration_hours}h)</span>
                    <span className="status-pill status-muted" style={{ textTransform: 'none', fontWeight: 600 }}>{staff.length} covering</span>
                  </div>
                  <div className="section-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    {staff.map(e => (
                      <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <span className="avatar-sq">{e.full_name?.charAt(0)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--text-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.full_name}</div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>{e.designation} · {e.employee_code}</div>
                        </div>
                        <select
                          className="input"
                          style={{ width: 110, padding: '0.3rem 0.5rem', fontSize: '0.6875rem' }}
                          value={e.shift_id || ''}
                          disabled={busy === `shift:${e.id}`}
                          onChange={ev => changeEmployeeShift(e.id, ev.target.value || '')}
                        >
                          <option value="">—</option>
                          {shifts.map(sh => <option key={sh.id} value={sh.id}>{sh.name}</option>)}
                        </select>
                      </div>
                    ))}
                    {staff.length === 0 && <p>No employees covering this shift yet.</p>}
                  </div>
                </section>
              );
            })}
            {employees.filter(e => !e.shift_id).length > 0 && (
              <section className="section-card">
                <div className="section-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.375rem' }}>
                  <span className="section-title">Unassigned</span>
                  <span className="status-pill status-warn" style={{ textTransform: 'none', fontWeight: 600 }}>{employees.filter(e => !e.shift_id).length} not on any shift</span>
                </div>
                <div className="section-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {employees.filter(e => !e.shift_id).map(e => (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                      <span className="avatar-sq">{e.full_name?.charAt(0)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--text-heading)' }}>{e.full_name}</div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>{e.designation}</div>
                      </div>
                      <select className="input" style={{ width: 110, padding: '0.3rem 0.5rem', fontSize: '0.6875rem' }} value="" onChange={ev => changeEmployeeShift(e.id, ev.target.value)}>
                        <option value="">—</option>
                        {shifts.map(sh => <option key={sh.id} value={sh.id}>{sh.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Roles ── */}
      {tab === 'roles' && (
        <section className="section-card">
          <div className="section-head">
            <span className="section-title"><ShieldCheck size={16} /> Role assignment</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{employees.length} employees</span>
          </div>
          <div className="table-wrap">
            <table className="swaniki-table">
              <thead><tr><th>Employee</th><th>Department</th><th>Designation</th><th>Current role</th><th>Set role</th></tr></thead>
              <tbody>
                {employees.map(e => {
                  const isSelf = user?.id === e.id;
                  return (
                    <tr key={e.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                          <span className="avatar-sq">{e.full_name?.charAt(0)}</span>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{e.full_name}{isSelf && <span className="status-pill status-muted" style={{ marginLeft: '0.5rem' }}>you</span>}</div>
                            <div className="mono" style={{ fontSize: '0.6563rem', color: 'var(--text-caption)' }}>{e.employee_code}</div>
                          </div>
                        </div>
                      </td>
                      <td>{e.department_name}</td>
                      <td>{e.designation}</td>
                      <td><span className={`status-pill ${e.role === 'SUPER_ADMIN' ? 'status-bad' : e.role === 'ADMIN' ? 'status-warn' : 'status-ok'}`}>{ROLES[e.role] || e.role}</span></td>
                      <td>
                        <select className="input" style={{ width: 150 }} value={e.role} disabled={isSelf || busy === e.id}
                          onChange={ev => changeRole(e.id, ev.target.value)}>
                          {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Tab: Leave Policy ── */}
      {tab === 'leaves' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="demo-banner" style={{ borderColor: 'rgba(245,158,11,.4)', background: 'var(--brand-amber-light)', color: '#b45309' }}>
            <CalendarClock size={16} />
            <span>Override the system defaults: edit the yearly allowance of each leave type and push it to all employees, or adjust individual balances below.</span>
          </div>

          <section className="section-card">
            <div className="section-head"><span className="section-title"><CalendarClock size={16} /> Leave types · yearly allowance</span></div>
            <div className="section-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '1rem' }}>
              {leaveTypes.map(t => {
                const f = typeForm[t.id];
                return (
                  <div key={t.id} className="swaniki-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '0.75rem', height: '0.75rem', borderRadius: '9999px', background: t.color_code || '#22c55e', flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-heading)' }}>{f ? f.name : t.name}</span>
                      <span className="status-pill status-muted" style={{ textTransform: 'none' }}>{f ? f.code : t.code}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
                      <div className="field" style={{ gridColumn: '1 / -1' }}>
                        <label className="field-label">Name</label>
                        <input className="input" value={f?.name ?? t.name} onChange={e => !f ? editType(t) : setTypeForm({ ...typeForm, [t.id]: { ...f, name: e.target.value } })} />
                      </div>
                      <div className="field">
                        <label className="field-label">Code</label>
                        <input className="input" value={f?.code ?? t.code} disabled={!f} onChange={e => f && setTypeForm({ ...typeForm, [t.id]: { ...f, code: e.target.value } })} />
                      </div>
                      <div className="field">
                        <label className="field-label">Yearly days</label>
                        <input type="number" className="input" value={f?.annual_allowance ?? t.annual_allowance} onChange={e => !f ? editType(t) : setTypeForm({ ...typeForm, [t.id]: { ...f, annual_allowance: e.target.value } })} />
                      </div>
                      <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.375rem' }}>
                        <input type="checkbox" checked={f ? f.paid : !!t.paid} onChange={e => !f ? editType(t) : setTypeForm({ ...typeForm, [t.id]: { ...f, paid: e.target.checked } })} />
                        <span className="field-label" style={{ margin: 0 }}>Paid</span>
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} disabled={!f || busy === t.id} onClick={() => saveType(t)}>
                        {busy === t.id ? <Loader2 size={13} className="spin" /> : <Save size={13} />} Save type
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} disabled={busy === t.id + ':all'} onClick={() => pushAllowance(t)}>
                        {busy === t.id + ':all' ? <Loader2 size={13} className="spin" /> : <Users size={13} />} Apply to all
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="swaniki-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem', borderStyle: 'dashed' }}>
                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-heading)' }}>Add a new leave type</span>
                <input className="input" placeholder="Code (e.g. PL)" value={newType.code} onChange={e => setNewType({ ...newType, code: e.target.value.toUpperCase() })} />
                <input className="input" placeholder="Name (e.g. Privilege Leave)" value={newType.name} onChange={e => setNewType({ ...newType, name: e.target.value })} />
                <input type="number" className="input" placeholder="Yearly days" value={newType.annual_allowance} onChange={e => setNewType({ ...newType, annual_allowance: e.target.value })} />
                <button className="btn btn-primary btn-sm" onClick={addType}><Plus size={14} /> Create type</button>
              </div>
            </div>
          </section>

          <section className="section-card">
            <div className="section-head">
              <span className="section-title"><Users size={16} /> Employee balances · 2026</span>
              <div className="section-action">
                <select className="input" style={{ width: 200 }} value={balanceType} onChange={e => setBalanceType(e.target.value)}>
                  <option value="">All leave types</option>
                  {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <div className="table-wrap">
              <table className="swaniki-table">
                <thead><tr><th>Employee</th><th>Leave type</th><th>Opening (editable)</th><th>Used</th><th>Pending</th><th>Remaining</th><th></th></tr></thead>
                <tbody>
                  {filteredBalances.map(b => (
                    <tr key={b.id}>
                      <td>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{b.full_name}</div>
                          <div className="mono" style={{ fontSize: '0.6563rem', color: 'var(--text-caption)' }}>{b.employee_id}</div>
                        </div>
                      </td>
                      <td><span style={{ color: b.color_code || 'inherit' }}>{b.leave_name}</span></td>
                      <td>
                        <input
                          type="number"
                          className="input"
                          style={{ width: 84, padding: '0.3rem 0.5rem' }}
                          defaultValue={b.accumulated}
                          onChange={e => setBalEdit({ ...balEdit, [b.id]: e.target.value })}
                        />
                      </td>
                      <td className="mono">{b.used}</td>
                      <td className="mono">{b.pending}</td>
                      <td className="mono" style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>{Number(b.accumulated || 0) - Number(b.used || 0) - Number(b.pending || 0)}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" disabled={balEdit[b.id] === undefined || busy === b.id} onClick={() => saveBalance(b)}>
                          {busy === b.id ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Save
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredBalances.length === 0 && <tr><td colSpan={7}><div className="empty-state"><p>No balances for this filter.</p></div></td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ── Tab: Access Management ── */}
      {tab === 'access' && hasPerm('ACCESS_MANAGE') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="demo-banner" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-surface-subtle)', color: 'var(--text-muted)' }}>
            <ShieldCheck size={16} />
            <span>Define what each role can see and do. Data scope decides <em>whose</em> records a role can access (Self · Team · Department · All); permissions decide <em>which</em> actions they can perform.</span>
          </div>

          {resetResult && (
            <div className="demo-banner" style={{ borderColor: 'rgba(16,185,129,.4)', background: 'var(--brand-primary-light)', color: 'var(--brand-primary)' }}>
              <KeyRound size={16} />
              <span>{resetResult.message} <strong className="mono" style={{ userSelect: 'all' }}>{resetResult.tempPassword}</strong></span>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setResetResult(null)}><X size={14} /></button>
            </div>
          )}

          <section className="section-card">
            <div className="section-head">
              <span className="section-title"><ShieldCheck size={16} /> Roles &amp; permissions</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{roles.length} roles</span>
            </div>
            <div className="section-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {roles.map(role => {
                const perms = parsePerms(role);
                const isOpen = expandedRole === role.id;
                return (
                  <div key={role.id} className="swaniki-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-heading)' }}>{role.name}</div>
                      <span className="mono" style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>{role.technical_key}</span>
                      {role.is_system ? <span className="status-pill status-muted">System</span> : (
                        <button className="btn btn-ghost btn-sm" onClick={() => deleteRole(role)}><Trash2 size={13} /> Delete</button>
                      )}
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.6875rem', color: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase' }}>Scope</label>
                        <select className="input" style={{ width: 140, padding: '0.3rem 0.5rem' }} value={role.data_scope} onChange={e => updateRoleScope(role, e.target.value)}>
                          {DATA_SCOPES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button className="btn btn-ghost btn-sm" onClick={() => openRoleMembers(role)}>
                          <Users size={13} /> Members <ChevronRight size={13} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem' }}>
                      {ALL_PERMS.map(p => (
                        <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7188rem', color: 'var(--text-body)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={perms.includes(p)} onChange={() => toggleRolePerm(role, p)} />
                          <span className="mono">{p}</span>
                        </label>
                      ))}
                    </div>
                    {isOpen && (
                      <div className="table-wrap" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                        <table className="swaniki-table">
                          <thead><tr><th>Member</th><th>Designation</th><th>Department</th><th>Assigned role</th><th></th></tr></thead>
                          <tbody>
                            {roleMembers.map(m => (
                              <tr key={m.id}>
                                <td>
                                  <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{m.full_name}</div>
                                  <div className="mono" style={{ fontSize: '0.6563rem', color: 'var(--text-caption)' }}>{m.employee_code}</div>
                                </td>
                                <td>{m.designation}</td>
                                <td>{m.department_name || '—'}</td>
                                <td>
                                  <select className="input" style={{ width: 170, padding: '0.3rem 0.5rem' }} defaultValue={role.id} onChange={e => assignRole(m.id, e.target.value)}>
                                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                  </select>
                                </td>
                                <td><button className="btn btn-ghost btn-sm" onClick={() => resetPassword(m.id)}><KeyRound size={13} /> Reset password</button></td>
                              </tr>
                            ))}
                            {roleMembers.length === 0 && <tr><td colSpan={5}><div className="empty-state"><p>No members in this role.</p></div></td></tr>}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="swaniki-card" style={{ padding: '1rem', display: 'flex', gap: '0.625rem', alignItems: 'end', flexWrap: 'wrap', borderStyle: 'dashed' }}>
                <div className="field" style={{ flex: 1, minWidth: 160 }}>
                  <label className="field-label">New role name</label>
                  <input className="input" placeholder="e.g. Finance Officer" value={newRole.name} onChange={e => setNewRole({ ...newRole, name: e.target.value })} />
                </div>
                <div className="field" style={{ width: 160 }}>
                  <label className="field-label">Technical key</label>
                  <input className="input" placeholder="FINANCE" value={newRole.technical_key} onChange={e => setNewRole({ ...newRole, technical_key: e.target.value.toUpperCase().replace(/\s+/g, '_') })} />
                </div>
                <div className="field" style={{ width: 140 }}>
                  <label className="field-label">Scope</label>
                  <select className="input" value={newRole.data_scope} onChange={e => setNewRole({ ...newRole, data_scope: e.target.value })}>
                    {DATA_SCOPES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <button className="btn btn-primary" onClick={createRole}><Plus size={15} /> Create role</button>
              </div>
            </div>
          </section>

          <section className="section-card">
            <div className="section-head">
              <span className="section-title"><Network size={16} /> Organisation hierarchy &amp; reporting lines</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{hierarchy.length} active employees</span>
            </div>
            <div className="table-wrap">
              <table className="swaniki-table">
                <thead><tr><th>Employee</th><th>Designation</th><th>Department</th><th>Role</th><th>Reports to</th></tr></thead>
                <tbody>
                  {hierarchy.map(emp => (
                    <tr key={emp.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{emp.full_name}</div>
                        <div className="mono" style={{ fontSize: '0.6563rem', color: 'var(--text-caption)' }}>{emp.designation}</div>
                      </td>
                      <td>{emp.designation}</td>
                      <td>{emp.department_name || '—'}</td>
                      <td><span className="status-pill status-muted" style={{ textTransform: 'none' }}>{emp.role_name || '—'}</span></td>
                      <td>
                        <select className="input" style={{ width: 210, padding: '0.3rem 0.5rem' }} value={emp.manager_id || ''} disabled={busy === emp.id}
                          onChange={e => { setBusy(emp.id); setManager(emp.id, e.target.value); }}>
                          <option value="">— none (top of tree) —</option>
                          {hierarchy.filter(m => m.id !== emp.id).map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {hierarchy.length === 0 && <tr><td colSpan={5}><div className="empty-state"><p>No hierarchy data.</p></div></td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ── Tab: Notifications & Audit ── */}
      {tab === 'notifications' && hasPerm('SETTINGS_VIEW') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {!notif ? <div className="loading-state"><Loader2 size={22} className="spin" /></div> : (
            <>
              {notif.smtp_from_env && (
                <div className="demo-banner" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-surface-subtle)', color: 'var(--text-muted)' }}>
                  <Mail size={16} />
                  <span>SMTP is overridden by environment variables (<strong>SMTP_HOST</strong> etc.) on the server, so the fields below are saved but may not take effect until those secrets are removed.</span>
                </div>
              )}

              <section className="section-card">
                <div className="section-head">
                  <span className="section-title"><Mail size={16} /> Email notifications</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 600, cursor: canEditNotif ? 'pointer' : 'default' }}>
                    <input type="checkbox" disabled={!canEditNotif} checked={!!notif.email_enabled} onChange={e => setNotif({ ...notif, email_enabled: e.target.checked })} /> Enabled
                  </label>
                </div>
                <div className="section-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.875rem' }}>
                  <div className="field"><label className="field-label">SMTP host</label><input className="input" disabled={!canEditNotif} value={notif.smtp.host || ''} onChange={e => setNotif({ ...notif, smtp: { ...notif.smtp, host: e.target.value } })} /></div>
                  <div className="field"><label className="field-label">Port</label><input className="input" type="number" disabled={!canEditNotif} value={notif.smtp.port ?? ''} onChange={e => setNotif({ ...notif, smtp: { ...notif.smtp, port: e.target.value } })} /></div>
                  <div className="field"><label className="field-label">Username</label><input className="input" disabled={!canEditNotif} value={notif.smtp.user || ''} onChange={e => setNotif({ ...notif, smtp: { ...notif.smtp, user: e.target.value } })} /></div>
                  <div className="field"><label className="field-label">Password</label><input className="input" type="password" disabled={!canEditNotif} placeholder={notif.smtp.password ? '••••••••' : 'not set'} value={notif.smtp.password || ''} onChange={e => setNotif({ ...notif, smtp: { ...notif.smtp, password: e.target.value } })} /></div>
                  <div className="field"><label className="field-label">From address</label><input className="input" disabled={!canEditNotif} placeholder="hr@company.com" value={notif.smtp.from || ''} onChange={e => setNotif({ ...notif, smtp: { ...notif.smtp, from: e.target.value } })} /></div>
                  <div className="field"><label className="field-label">Connection</label>
                    <select className="input" disabled={!canEditNotif} value={notif.smtp.secure ? 'true' : 'false'} onChange={e => setNotif({ ...notif, smtp: { ...notif.smtp, secure: e.target.value === 'true' } })}>
                      <option value="true">TLS (secure / 465)</option>
                      <option value="false">STARTTLS (587 / non-secure)</option>
                    </select>
                  </div>
                </div>

                <div className="section-body" style={{ borderTop: '1px solid var(--border-color)', marginTop: '0.5rem', paddingTop: '0.875rem' }}>
                  <div className="field-label" style={{ marginBottom: '0.5rem' }}>Notify on these events</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1.1rem' }}>
                    {notif.events.map(ev => {
                      const on = notif.event_prefs[ev] !== false;
                      return (
                        <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7188rem', color: 'var(--text-body)', cursor: canEditNotif ? 'pointer' : 'default' }}>
                          <input type="checkbox" disabled={!canEditNotif} checked={on} onChange={() => toggleEvent(ev)} />
                          <span className="mono">{ev}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {canEditNotif && (
                  <div className="section-body" style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--border-color)', marginTop: '0.5rem', paddingTop: '0.875rem' }}>
                    <button className="btn btn-primary btn-sm" onClick={saveNotif} disabled={notifBusy === 'save'}>
                      {notifBusy === 'save' ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Save settings
                    </button>
                    <span style={{ width: 12 }} />
                    <input className="input" style={{ width: 220 }} type="email" placeholder="Send test email to…" value={testTo} onChange={e => setTestTo(e.target.value)} />
                    <button className="btn btn-ghost btn-sm" onClick={sendTest} disabled={notifBusy === 'test'}>
                      {notifBusy === 'test' ? <Loader2 size={14} className="spin" /> : <Send size={14} />} Test email
                    </button>
                  </div>
                )}
              </section>

              <section className="section-card">
                <div className="section-head">
                  <span className="section-title"><ShieldCheck size={16} /> Audit retention</span>
                </div>
                <div className="section-body" style={{ display: 'flex', gap: '0.625rem', alignItems: 'end', flexWrap: 'wrap' }}>
                  <div className="field" style={{ width: 180 }}>
                    <label className="field-label">Keep entries for (days)</label>
                    <input className="input" type="number" min="1" max="3650" disabled={!canEditNotif} value={retention} onChange={e => setRetention(e.target.value)} />
                  </div>
                  {canEditNotif && (
                    <button className="btn btn-ghost btn-sm" onClick={saveRetention} disabled={notifBusy === 'retention'}>
                      {notifBusy === 'retention' ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Save
                    </button>
                  )}
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>Default is 365 days (1 year). Older audit entries are purged automatically.</span>
                </div>
              </section>
            </>
          )}

          <section className="section-card">
            <div className="section-head">
              <span className="section-title"><Inbox size={16} /> Notification log</span>
              <div className="section-action" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-caption)' }}>
                  {outboxCounts.pending} pending · {outboxCounts.sent} sent · {outboxCounts.failed} failed
                </span>
                <select className="input" style={{ width: 130, padding: '0.3rem 0.5rem' }} value={outboxFilter} onChange={e => { setOutboxFilter(e.target.value); loadOutbox(e.target.value); }}>
                  <option value="">All</option><option value="PENDING">Pending</option><option value="SENT">Sent</option><option value="FAILED">Failed</option>
                </select>
                {canEditNotif && <button className="btn btn-ghost btn-sm" onClick={flushNow} disabled={notifBusy === 'flush'}>{notifBusy === 'flush' ? <Loader2 size={13} className="spin" /> : <Send size={13} />} Flush</button>}
              </div>
            </div>
            <div className="table-wrap">
              <table className="swaniki-table">
                <thead><tr><th>When</th><th>Event</th><th>To</th><th>Subject</th><th>Status</th></tr></thead>
                <tbody>
                  {outbox.map(o => (
                    <tr key={o.id}>
                      <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: '0.72rem' }}>{o.sent_at ? new Date(o.sent_at).toLocaleString() : new Date(o.created_at).toLocaleString()}</td>
                      <td><span className="mono" style={{ fontSize: '0.72rem' }}>{o.event}</span></td>
                      <td>
                        <div style={{ fontSize: '0.78rem' }}>{o.to_name || o.to_email}</div>
                        <div className="mono" style={{ fontSize: '0.66rem', color: 'var(--text-caption)' }}>{o.to_email}</div>
                      </td>
                      <td style={{ maxWidth: 280 }}>{o.subject}</td>
                      <td>
                        <span className={`status-pill ${OUTBOX_PILL[o.status] || 'status-muted'}`} title={o.last_error || ''}>{o.status}{o.attempts > 1 ? ` ×${o.attempts}` : ''}</span>
                      </td>
                    </tr>
                  ))}
                  {outbox.length === 0 && <tr><td colSpan={5}><div className="empty-state"><p>No emails queued or sent yet.</p></div></td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ── Tab: Backup & Recovery ── */}
      {tab === 'backup' && hasPerm('SETTINGS_VIEW') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {!backup ? <div className="loading-state"><Loader2 size={22} className="spin" /></div> : (
            <>
              {!backup.configured && (
                <div className="demo-banner" style={{ borderColor: 'rgba(245,158,11,.4)', background: 'var(--brand-amber-light)', color: '#b45309' }}>
                  <DatabaseBackup size={16} />
                  <span>Backups are not wired to storage yet. Set <strong>SUPABASE_URL</strong> and <strong>SUPABASE_SERVICE_ROLE_KEY</strong> (and create a private <strong>{backup.bucket}</strong> bucket) on the server to enable off-site dumps.</span>
                </div>
              )}

              <section className="section-card">
                <div className="section-head">
                  <span className="section-title"><DatabaseBackup size={16} /> Backup settings</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 600, cursor: canEditNotif ? 'pointer' : 'default' }}>
                    <input type="checkbox" disabled={!canEditNotif} checked={!!backup.backup_enabled} onChange={e => setBackup({ ...backup, backup_enabled: e.target.checked })} /> Daily backups enabled
                  </label>
                </div>
                <div className="section-body" style={{ display: 'flex', gap: '0.625rem', alignItems: 'end', flexWrap: 'wrap' }}>
                  <div className="field" style={{ width: 200 }}>
                    <label className="field-label">Keep last N backups</label>
                    <input className="input" type="number" min="1" max="365" disabled={!canEditNotif} value={backup.backup_retention_count ?? 14} onChange={e => setBackup({ ...backup, backup_retention_count: e.target.value })} />
                  </div>
                  {canEditNotif && (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={saveBackupSettings} disabled={backupBusy === 'save'}>
                        {backupBusy === 'save' ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Save
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={runBackupNow} disabled={backupBusy === 'run'}>
                        {backupBusy === 'run' ? <Loader2 size={14} className="spin" /> : <Play size={14} />} Run backup now
                      </button>
                    </>
                  )}
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>Bucket: <span className="mono">{backup.bucket}</span> · {backupCounts.ok} stored · {backupCounts.failed} failed</span>
                </div>
              </section>

              <section className="section-card">
                <div className="section-head">
                  <span className="section-title"><Inbox size={16} /> Recent backups</span>
                </div>
                <div className="table-wrap">
                  <table className="swaniki-table">
                    <thead><tr><th>When</th><th>Kind</th><th>Status</th><th>Size</th><th>Tables</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                    <tbody>
                      {backups.map(b => (
                        <tr key={b.id}>
                          <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: '0.72rem' }}>{new Date(b.ts).toLocaleString()}</td>
                          <td><span className="status-pill status-muted" style={{ textTransform: 'none' }}>{b.kind}</span></td>
                          <td><span className={`status-pill ${BACKUP_PILL[b.status] || 'status-muted'}`} title={b.error || ''}>{b.status}</span></td>
                          <td className="mono">{b.status === 'SUCCESS' ? fmtBytes(b.size_bytes) : '—'}</td>
                          <td className="mono" style={{ fontSize: '0.72rem' }}>{b.status === 'SUCCESS' ? `${Object.keys(b.table_counts || {}).length}` : '—'}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {b.status === 'SUCCESS' && canEditNotif && (
                              <>
                                <button className="btn btn-ghost btn-sm" onClick={() => downloadBackup(b.id)} disabled={backupBusy === 'dl' + b.id}>
                                  {backupBusy === 'dl' + b.id ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
                                </button>{' '}
                                <button className="btn btn-ghost btn-sm" onClick={() => setRestoreTarget({ id: b.id, confirm: '' })}>
                                  <RotateCcw size={13} /> Restore
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                      {backups.length === 0 && <tr><td colSpan={6}><div className="empty-state"><p>No backups yet. Run one now or wait for the daily job.</p></div></td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {/* Restore confirmation modal */}
      {restoreTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setRestoreTarget(null)}>
          <div className="section-card" style={{ width: 'min(480px, 100%)', padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: 'var(--brand-rose)' }}>Restore this backup?</h3>
            <p style={{ fontSize: '0.82rem', marginBottom: '0.75rem' }}>This overwrites <strong>all current data</strong> (employees, attendance, payroll, leaves, audit) with the selected backup. This cannot be undone. Type the backup id below to confirm:</p>
            <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-caption)', marginBottom: '0.4rem', wordBreak: 'break-all' }}>{restoreTarget.id}</div>
            <input className="input" style={{ marginBottom: '0.75rem' }} placeholder="paste backup id to confirm" value={restoreTarget.confirm} onChange={e => setRestoreTarget({ ...restoreTarget, confirm: e.target.value })} />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setRestoreTarget(null)}>Cancel</button>
              <button className="btn btn-rose btn-sm" disabled={restoreTarget.confirm !== restoreTarget.id || backupBusy === 'restore'} onClick={doRestore}>
                {backupBusy === 'restore' ? <Loader2 size={14} className="spin" /> : <RotateCcw size={14} />} Restore now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
