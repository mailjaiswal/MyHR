import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import useEscapeClose from '../hooks/useEscapeClose';
import {
  Database, PlugZap, UploadCloud, RefreshCw, Trash2, Pencil, CheckCircle2,
  XCircle, Loader2, Server, FileText, Clock3, Settings2, Wifi, HardDrive, Link2,
  Eye, X, Users, Table2, Calculator, Undo2, IdCard
} from 'lucide-react';

const STATUS_COLOR = {
  SUCCESS: { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
  FAILED: { bg: 'rgba(244, 63, 94, 0.12)', color: '#f43f5e', border: 'rgba(244,63,94,0.3)' },
  PARTIAL: { bg: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  RUNNING: { bg: 'rgba(79, 70, 229, 0.12)', color: '#6366f1', border: 'rgba(79,70,229,0.3)' },
  ACTIVE: { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
  ERROR: { bg: 'rgba(244, 63, 94, 0.12)', color: '#f43f5e', border: 'rgba(244,63,94,0.3)' },
  REVERTED: { bg: 'rgba(100, 116, 139, 0.16)', color: '#94a3b8', border: 'rgba(100,116,139,0.35)' },
  FILE_IMPORT: { bg: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  API_PULL: { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
  MANUAL: { bg: 'rgba(79, 70, 229, 0.12)', color: '#6366f1', border: 'rgba(79,70,229,0.3)' },
  PAUSED: { bg: 'rgba(100, 116, 139, 0.12)', color: '#64748b', border: 'rgba(100,116,139,0.3)' }
};

function StatusBadge({ status }) {
  const s = STATUS_COLOR[status] || STATUS_COLOR.PARTIAL;
  return (
    <span style={{
      fontSize: '0.6875rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '9999px',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`, textTransform: 'uppercase', letterSpacing: '0.03em'
    }}>
      {status}
    </span>
  );
}

const emptyForm = {
  name: '', source_type: 'API', vendor: 'ZKTeco', base_url: '', username: '', password: '',
  token_type: 'JWT', sync_frequency_minutes: 60, backfillDays: 7, empCode: '',
  syncEmployees: false, autoFetch: false, columnMapJson: ''
};

export default function DataSources() {
  const { isDark } = useTheme();
  const { authFetch: fetch, hasPerm } = useAuth();
  const [sources, setSources] = useState([]);
  const [summary, setSummary] = useState({});
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [testResult, setTestResult] = useState(null);

  // Upload state
  const [file, setFile] = useState(null);
  const [importName, setImportName] = useState('');
  const [importVendor, setImportVendor] = useState('ZKTeco');
  const [createEmployees, setCreateEmployees] = useState(true);
  const [importResult, setImportResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  // Preview state (parse-only, shown before the admin confirms the import)
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  // Maintenance: attendance recompute + per-import revert
  const canEdit = hasPerm('SETTINGS_EDIT');
  const canEditEmployees = hasPerm('EMPLOYEES_EDIT');
  const [recFrom, setRecFrom] = useState('');
  const [recTo, setRecTo] = useState('');

  // Roster / employee-name CSV upload
  const [rosterRows, setRosterRows] = useState(null);
  const [rosterName, setRosterName] = useState('');
  const [rosterPreview, setRosterPreview] = useState(null);
  const [rosterBusy, setRosterBusy] = useState(false);
  // Department / shift labels the roster CSV may use
  const [setup, setSetup] = useState({ departments: [], shifts: [] });

  const loadAll = useCallback(() => {
    fetch('/api/v1/ingestion/sources').then(r => r.json()).then(d => { if (d.success) setSources(d.sources); }).catch(() => {});
    fetch('/api/v1/ingestion/summary').then(r => r.json()).then(d => { if (d.success) setSummary(d.summary); }).catch(() => {});
    fetch('/api/v1/ingestion/logs?limit=30').then(r => r.json()).then(d => { if (d.success) setLogs(d.logs); }).catch(() => {});
    fetch('/api/v1/ingestion/setup').then(r => r.json()).then(d => { if (d.success) setSetup({ departments: d.departments || [], shifts: d.shifts || [] }); }).catch(() => {});
  }, []);

  useEffect(() => {
    loadAll();
    setLoading(false);
  }, [loadAll]);

  const notify = (msg, isErr = false) => {
    if (isErr) { setError(msg); setMessage(null); }
    else { setMessage(msg); setError(null); }
    setTimeout(() => { setMessage(null); setError(null); }, 6000);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setBusy('SAVE');
    setTestResult(null);

    let columnMap = null;
    if (form.columnMapJson && form.columnMapJson.trim()) {
      try {
        columnMap = JSON.parse(form.columnMapJson);
      } catch {
        notify('Advanced column map must be valid JSON', true);
        setBusy(null);
        return;
      }
    }

    const isApi = form.source_type === 'API';
    const payload = {
      name: form.name,
      source_type: form.source_type,
      vendor: form.vendor,
      base_url: form.base_url,
      username: isApi ? form.username : (form.username || ''),
      password: form.password || undefined,
      token_type: isApi ? form.token_type : 'NONE',
      sync_frequency_minutes: Number(form.sync_frequency_minutes) || 60,
      status: 'ACTIVE',
      options: {
        backfillDays: Number(form.backfillDays) || 7,
        empCode: form.empCode || null,
        syncEmployees: !!form.syncEmployees,
        autoFetch: !!form.autoFetch,
        ...(columnMap ? { columnMap } : {})
      }
    };
    try {
      const res = await fetch(editingId ? `/api/v1/ingestion/sources/${editingId}` : '/api/v1/ingestion/sources', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        notify(editingId ? 'Source updated' : 'Source created');
        setShowForm(false); setForm(emptyForm); setEditingId(null);
        loadAll();
      } else {
        notify(data.error || 'Failed to save source', true);
      }
    } catch (err) {
      notify(`Error: ${err.message}`, true);
    } finally {
      setBusy(null);
    }
  };

  const openEdit = (src) => {
    let opts = {};
    try { opts = JSON.parse(src.options || '{}'); } catch (e) {}
    setEditingId(src.id);
    setForm({
      name: src.name, source_type: src.source_type || 'API', vendor: src.vendor || 'ZKTeco',
      base_url: src.base_url || '', username: src.username || '', password: '',
      token_type: src.token_type || 'JWT', sync_frequency_minutes: src.sync_frequency_minutes || 60,
      backfillDays: opts.backfillDays || 7, empCode: opts.empCode || '',
      syncEmployees: !!opts.syncEmployees, autoFetch: !!opts.autoFetch,
      columnMapJson: opts.columnMap ? JSON.stringify(opts.columnMap, null, 2) : ''
    });
    setTestResult(null);
    setShowForm(true);
  };

  const handleDelete = async (src) => {
    if (!window.confirm(`Delete data source "${src.name}" and its sync history?`)) return;
    setBusy(`DEL_${src.id}`);
    try {
      const res = await fetch(`/api/v1/ingestion/sources/${src.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { notify('Source deleted'); loadAll(); }
      else notify(data.error || 'Delete failed', true);
    } catch (err) { notify(err.message, true); }
    finally { setBusy(null); }
  };

  const handleTest = async (src) => {
    setBusy(`TEST_${src.id}`);
    setTestResult(null);
    try {
      const res = await fetch(`/api/v1/ingestion/sources/${src.id}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult({ id: src.id, ok: data.success, data });
      notify(data.success ? `Connection OK — ${data.devicesFound} device(s) reachable` : data.error, !data.success);
    } catch (err) { notify(err.message, true); }
    finally { setBusy(null); }
  };

  const handleSync = async (src) => {
    setBusy(`SYNC_${src.id}`);
    try {
      const res = await fetch(`/api/v1/ingestion/sources/${src.id}/sync`, { method: 'POST' });
      const data = await res.json();
      if (data.success) notify(`Sync complete — ${data.recordsImported} of ${data.recordsFound} records imported`);
      else notify(data.error || 'Sync failed', true);
      loadAll();
    } catch (err) { notify(err.message, true); }
    finally { setBusy(null); }
  };

  const uploadHeaders = () => ({
    'Content-Type': 'application/octet-stream',
    'X-Source-Name': importName || file.name,
    'X-File-Name': file.name,
    'X-Vendor': importVendor,
    'X-Options': JSON.stringify({ createEmployees })
  });

  // Step 1: parse the selected file and show a full preview table (nothing is written yet).
  const handlePreview = async (e) => {
    e.preventDefault();
    if (!file) { notify('Select an ATTLOG .dat / .db / .sql file first', true); return; }
    setPreviewing(true);
    setImportResult(null);
    setPreview(null);
    try {
      const buf = await file.arrayBuffer();
      const res = await fetch('/api/v1/ingestion/preview', { method: 'POST', headers: uploadHeaders(), body: buf });
      const data = await res.json();
      if (data.success) {
        setPreview(data.preview);
      } else {
        notify(data.error || 'Preview failed', true);
      }
    } catch (err) {
      notify(`Preview failed: ${err.message}`, true);
    } finally {
      setPreviewing(false);
    }
  };

  // Step 2: import only after the admin confirms the preview.
  const performImport = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const res = await fetch('/api/v1/ingestion/upload', { method: 'POST', headers: uploadHeaders(), body: buf });
      const data = await res.json();
      if (data.success) {
        setImportResult(data);
        setPreview(null);
        setFile(null);
        notify(`Import complete — ${data.import.recordsImported} punches imported`);
        loadAll();
      } else {
        notify(data.error || 'Import failed', true);
      }
    } catch (err) {
      notify(`Upload failed: ${err.message}`, true);
    } finally {
      setUploading(false);
    }
  };

  // ── Maintenance: rebuild attendance from the punches already stored, using each
  // employee's CURRENT shift (e.g. after fixing a shift). Nothing is deleted.
  const handleRecompute = async () => {
    if (recFrom && recTo && recFrom > recTo) { notify("'From' date is after 'To' date", true); return; }
    setBusy('RECOMPUTE');
    try {
      const res = await fetch('/api/v1/ingestion/recompute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: recFrom || undefined, to: recTo || undefined })
      });
      const data = await res.json();
      if (data.success) {
        const r = data.result;
        notify(`Attendance recomputed — ${r.employees} employee(s), ${r.daysWritten} day(s) rebuilt, ${r.daysDeleted} stale day(s) cleared`);
      } else notify(data.error || 'Recompute failed', true);
    } catch (err) { notify(err.message, true); }
    finally { setBusy(null); }
  };

  // ── Undo one completed import: remove its punches, rebuild affected attendance,
  // and drop the employees/devices that import auto-created (only if unused).
  const handleRevert = async (l) => {
    const ok = window.confirm(
      `Undo "${l.source_name}" (${new Date(l.started_at).toLocaleString('en-IN')})?\n\n` +
      `This deletes the ${l.records_imported || 0} punch(es) that import added and rebuilds their attendance. ` +
      `Employees/devices it auto-created are removed only if nothing else references them. This cannot be undone.`
    );
    if (!ok) return;
    setBusy(`REVERT_${l.id}`);
    try {
      const res = await fetch(`/api/v1/ingestion/logs/${l.id}/revert`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const r = data.result;
        notify(`Import reverted — ${r.punchesRemoved} punch(es) removed, ${r.attendanceRebuilt} employee(s) rebuilt` +
          (r.employeesRemoved ? `, ${r.employeesRemoved} employee(s) dropped` : ''));
        loadAll();
      } else notify(data.error || 'Revert failed', true);
    } catch (err) { notify(err.message, true); }
    finally { setBusy(null); }
  };

  // ── Roster / employee-name CSV: parse locally, preview server-side, then apply.
  const parseDelimited = (text) => {
    const source = text.replace(/^\uFEFF/, '');
    const delim = (source.split('\n').find(l => l.trim()) || '').includes('\t') ? '\t' : ',';
    const lines = source.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return null;
    const cells = (line) => {
      const out = [];
      let cur = '', q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (q && line[i + 1] === '"') { cur += '"'; i++; }
          else q = !q;
        } else if (ch === delim && !q) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out.map(s => s.trim());
    };
    const header = cells(lines[0]).map(h => h.toLowerCase().replace(/[()\[\]_.\-\s]+/g, ''));
    const pick = (...keys) => {
      for (const k of keys) {
        const i = header.indexOf(k);
        if (i !== -1) return i;
      }
      return -1;
    };
    const idx = {
      biometricUserId: pick('biometricuserid', 'biouserid', 'pin', 'userid', 'bioid', 'biometricid', 'employeebioid', 'cardno'),
      employeeCode: pick('employeecode', 'empcode', 'code', 'employeeid', 'ecode'),
      fullName: pick('fullname', 'name', 'employeename', 'employee', 'staffname'),
      designation: pick('designation', 'title', 'post', 'jobtitle'),
      department: pick('department', 'dept', 'unit', 'ward'),
      shift: pick('shift', 'shiftname', 'roster'),
      email: pick('email', 'emailid', 'workemail'),
      mobile: pick('mobile', 'phone', 'contact', 'contactno', 'mobileno'),
      baseCtc: pick('basectc', 'ctc', 'salary', 'basesalary', 'grosssalary', 'wage'),
      dateOfJoining: pick('dateofjoining', 'doj', 'joiningdate', 'dateofjoin'),
      gender: pick('gender', 'sex')
    };
    if (idx.biometricUserId === -1 && idx.employeeCode === -1 && idx.fullName === -1) {
      return { error: 'Could not find a usable column. Include at least a Name plus a Biometric ID / PIN or Employee Code.' };
    }
    const rows = lines.slice(1).map(line => {
      const c = cells(line);
      const at = (i) => (i >= 0 ? (c[i] || '') : '');
      return {
        biometricUserId: at(idx.biometricUserId),
        employeeCode: at(idx.employeeCode),
        fullName: at(idx.fullName),
        designation: at(idx.designation),
        department: at(idx.department),
        shift: at(idx.shift),
        email: at(idx.email),
        mobile: at(idx.mobile),
        baseCtc: at(idx.baseCtc),
        dateOfJoining: at(idx.dateOfJoining),
        gender: at(idx.gender)
      };
    }).filter(r => r.biometricUserId || r.employeeCode || r.fullName);
    return { rows };
  };

  const handleRosterFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setRosterPreview(null);
    setRosterName(f.name);
    try {
      const parsed = parseDelimited(await f.text());
      if (!parsed) { notify('That file looks empty', true); setRosterRows(null); return; }
      if (parsed.error) { notify(parsed.error, true); setRosterRows(null); return; }
      if (!parsed.rows.length) { notify('No data rows found', true); setRosterRows(null); return; }
      setRosterRows(parsed.rows);
    } catch (err) {
      notify(`Could not read CSV: ${err.message}`, true);
      setRosterRows(null);
    }
  };

  const previewRoster = async () => {
    if (!rosterRows?.length) { notify('Choose a roster CSV first', true); return; }
    setRosterBusy(true);
    try {
      const res = await fetch('/api/v1/ingestion/roster/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: rosterRows })
      });
      const data = await res.json();
      if (data.success) setRosterPreview(data.preview);
      else notify(data.error || 'Roster preview failed', true);
    } catch (err) { notify(`Roster preview failed: ${err.message}`, true); }
    finally { setRosterBusy(false); }
  };

  const applyRoster = async () => {
    if (!rosterRows?.length) return;
    setRosterBusy(true);
    try {
      const res = await fetch('/api/v1/ingestion/roster/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: rosterRows })
      });
      const data = await res.json();
      if (data.success) {
        const s = data.result;
        setRosterPreview(null);
        setRosterRows(null);
        setRosterName('');
        notify(`Roster applied — ${s.updated} employee(s) updated, ${s.created} created` +
          (data.recompute ? `, attendance rebuilt for ${data.recompute.employees} employee(s)` : '') +
          (s.errors ? `, ${s.errors} row(s) skipped` : ''));
        loadAll();
      } else notify(data.error || 'Roster import failed', true);
    } catch (err) { notify(`Roster import failed: ${err.message}`, true); }
    finally { setRosterBusy(false); }
  };

  const card = {
    background: isDark ? '#111318' : '#ffffff',
    border: '1px solid var(--border-color)',
    borderRadius: '0.875rem'
  };

  const inputStyle = {
    width: '100%',
    background: isDark ? '#0d0f13' : '#f8fafc',
    border: '1px solid var(--border-color)',
    borderRadius: '0.5rem',
    padding: '0.55rem 0.75rem',
    fontSize: '0.8125rem',
    color: 'var(--text-heading)',
    outline: 'none'
  };

  const labelStyle = {
    fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-caption)',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', display: 'block'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.35rem' }}>
            <span className="pill-badge pill-indigo" style={{ fontSize: '0.6875rem' }}>
              DATA INGESTION
            </span>
            <span className="eyebrow-italic">
              Vendor APIs + SQL File Extraction
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-heading)', letterSpacing: '-0.03em' }}>
            Data Sources <em style={{ fontStyle: 'italic', color: isDark ? 'var(--brand-cyan)' : 'var(--brand-indigo)' }}>&amp; Integrations</em>
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Extract punches from biometric SQL database files or pull directly from vendor web-app APIs (ZKTeco BioTime 8.0 / eSSL / Realtime).
          </p>
        </div>

        <button
          className="btn-swaniki btn-swaniki-primary"
          style={{ padding: '0.5rem 1rem', fontSize: '0.8125rem', background: isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)', color: isDark ? '#0a0c10' : '#ffffff' }}
          onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); setTestResult(null); }}
        >
          <PlugZap size={16} />
          <span>Add Data Source</span>
        </button>
      </div>

      {(message || error) && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '0.75rem',
          background: error ? 'rgba(244, 63, 94, 0.12)' : 'rgba(16, 185, 129, 0.12)',
          border: `1px solid ${error ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.3)'}`,
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          fontSize: '0.8125rem', color: error ? '#f43f5e' : '#10b981', fontWeight: 600
        }}>
          {error ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{error || message}</span>
        </div>
      )}

      {/* Summary metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem' }}>
        {[
          { label: 'Total Sources', value: summary.total_sources || 0, icon: Database, color: '#6366f1' },
          { label: 'API Sources', value: summary.api_sources || 0, icon: Link2, color: '#00f2fe' },
          { label: 'Sync Runs', value: summary.total_runs || 0, icon: RefreshCw, color: '#10b981' },
          { label: 'Failed Runs', value: summary.failed_runs || 0, icon: XCircle, color: '#f43f5e' },
          { label: 'Punches Ingested', value: (summary.total_punches || 0).toLocaleString('en-IN'), icon: HardDrive, color: '#f59e0b' }
        ].map(m => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="swaniki-card" style={{
              display: 'flex', flexDirection: 'column', gap: '0.6rem',
              padding: '1rem 1.25rem', minHeight: '5.5rem', borderRadius: '0.875rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icon size={15} color={m.color} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label}</span>
              </div>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-heading)', letterSpacing: '-0.02em', lineHeight: 1.15 }}>{m.value}</span>
            </div>
          );
        })}
      </div>

      {/* Add / Edit API source form */}
      {showForm && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-heading)' }}>
              <Settings2 size={16} color="var(--brand-primary)" />
              {editingId ? 'Edit Data Source' : 'Connect a Data Source'}
            </div>
            <button onClick={() => setShowForm(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <XCircle size={18} />
            </button>
          </div>

          <form onSubmit={handleSave} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Integration type selector */}
            <div>
              <label style={labelStyle}>Integration Type</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {[
                  { k: 'API', t: 'Vendor API (auto-poll)' },
                  { k: 'SQL_FILE', t: 'SQL File (upload / auto-fetch)' }
                ].map(o => (
                  <button
                    type="button" key={o.k} className={`demo-tab ${form.source_type === o.k ? 'demo-tab-active' : ''}`}
                    onClick={() => setForm({ ...form, source_type: o.k })}
                  >
                    {o.t}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Source Name</label>
                <input style={inputStyle} required placeholder="e.g. Hospital Reception BioTime" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Vendor Platform</label>
                <select style={inputStyle} value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })}>
                  <option>ZKTeco (BioTime 8.0 / ETP)</option>
                  <option>eSSL</option>
                  <option>Realtime</option>
                  <option>Biomax</option>
                  <option>Other</option>
                </select>
              </div>
              {form.source_type === 'API' && (
                <div>
                  <label style={labelStyle}>Token Type</label>
                  <select style={inputStyle} value={form.token_type} onChange={e => setForm({ ...form, token_type: e.target.value })}>
                    <option value="JWT">JWT Token (/jwt-api-token-auth/)</option>
                    <option value="GENERAL">General Token (/api-token-auth/)</option>
                  </select>
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>{form.source_type === 'API' ? 'Vendor Web App Base URL' : 'SQL File Download URL (optional)'}</label>
              <input style={inputStyle} required={form.source_type === 'API'}
                placeholder={form.source_type === 'API' ? 'http://192.168.1.50:8090' : 'https://vendor.example.com/exports/attendance.sqlite'}
                value={form.base_url} onChange={e => setForm({ ...form, base_url: e.target.value })} />
              {form.source_type !== 'API' && (
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  Leave blank for manual uploads only, or set a download URL to enable automatic / scheduled fetching (accepts a SQLite <code>.db</code> or a MySQL / SQL Server <code>.sql</code> text dump).
                </p>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Username {form.source_type !== 'API' && <em style={{ textTransform: 'none', fontWeight: 500 }}>(optional)</em>}</label>
                <input style={inputStyle} required={form.source_type === 'API'}
                  placeholder={form.source_type === 'API' ? 'BioTime admin login' : 'Basic-auth user'} value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Password {editingId && <em style={{ textTransform: 'none', fontWeight: 500 }}>(leave blank to keep)</em>}</label>
                <input style={inputStyle} type="password" required={form.source_type === 'API' && !editingId} placeholder="••••••••" value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Sync Frequency (minutes)</label>
                <input style={inputStyle} type="number" min="5" value={form.sync_frequency_minutes}
                  onChange={e => setForm({ ...form, sync_frequency_minutes: e.target.value })} />
              </div>
              {form.source_type === 'API' && (
                <>
                  <div>
                    <label style={labelStyle}>Backfill Window (days)</label>
                    <input style={inputStyle} type="number" min="1" value={form.backfillDays} placeholder="7"
                      onChange={e => setForm({ ...form, backfillDays: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Employee Code Filter</label>
                    <input style={inputStyle} placeholder="(optional) pull single employee" value={form.empCode}
                      onChange={e => setForm({ ...form, empCode: e.target.value })} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.15rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--text-body)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.syncEmployees}
                        onChange={e => setForm({ ...form, syncEmployees: e.target.checked })} />
                      Mirror vendor employee roster
                    </label>
                  </div>
                </>
              )}
              {form.source_type !== 'API' && (
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.15rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--text-body)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.autoFetch} disabled={!form.base_url}
                      onChange={e => setForm({ ...form, autoFetch: e.target.checked })} />
                    Auto-fetch from URL on schedule
                  </label>
                </div>
              )}
            </div>

            {form.source_type !== 'API' && (
              <div>
                <label style={labelStyle}>Advanced column mapping (optional JSON)</label>
                <textarea style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', minHeight: '5.5rem', resize: 'vertical' }}
                  placeholder={'{"punchTable":"att_log","userCol":"PIN","timeCol":"ATTDate","stateCol":"INOUT","serialCol":"CSN","empTable":"USER_INFO","empUserCol":"PIN","empNameCol":"NAME"}'}
                  value={form.columnMapJson} onChange={e => setForm({ ...form, columnMapJson: e.target.value })} />
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  Only needed when a vendor uses non-standard names. Keys: punchTable, userCol, timeCol, stateCol, verifyCol, serialCol, empTable, empUserCol, empNameCol.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="submit" className="btn-swaniki" style={{ background: isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)', color: isDark ? '#0a0c10' : '#fff', padding: '0.55rem 1.25rem', fontSize: '0.8125rem', fontWeight: 700, border: 'none', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {busy === 'SAVE' ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
                {editingId ? 'Save Changes' : 'Create Source'}
              </button>
              {editingId && (
                <button type="button" className="btn-swaniki" style={{ background: 'transparent', color: 'var(--text-muted)', padding: '0.55rem 1rem', fontSize: '0.8125rem', fontWeight: 600, border: '1px solid var(--border-color)', borderRadius: '0.5rem', cursor: 'pointer' }} onClick={() => { setShowForm(false); setForm(emptyForm); setEditingId(null); }}>
                  Cancel
                </button>
              )}
            </div>

            {testResult && testResult.id === editingId && (
              <div style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 600, background: testResult.ok ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', color: testResult.ok ? '#10b981' : '#f43f5e', border: `1px solid ${testResult.ok ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}` }}>
                {testResult.ok ? `Connection OK • auth ${testResult.data.tokenType} • ${testResult.data.devicesFound} device(s) found on vendor server.` : `Connection failed: ${testResult.data.error}`}
              </div>
            )}
          </form>
        </div>
      )}

      {/* Sources list + SQL upload, side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.25rem' }}>
        {/* Source cards */}
        <div style={card}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-heading)' }}>
            <Server size={16} color="var(--brand-primary)" />
            Connected Data Sources ({sources.length})
          </div>
          <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto' }}>
            {loading && <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Loading sources...</p>}
            {!loading && sources.length === 0 && (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>
                No data sources configured yet. Add a vendor API source or upload a SQL file.
              </p>
            )}
            {sources.map(src => {
              const isApi = src.source_type === 'API';
              let opts = {};
              try { opts = JSON.parse(src.options || '{}'); } catch (e) {}
              const canSync = isApi || (!!src.base_url && !!opts.autoFetch);
              const testFor = testResult && testResult.id === src.id ? testResult : null;
              return (
                <div key={src.id} style={{ padding: '0.9rem 1rem', borderRadius: '0.625rem', border: '1px solid var(--border-color)', background: isDark ? '#0d0f13' : '#f8fafc', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                      {isApi ? <Link2 size={17} color="#00f2fe" style={{ flexShrink: 0 }} /> : <FileText size={17} color="#f59e0b" style={{ flexShrink: 0 }} />}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-heading)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{src.name}</div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{src.vendor} • {isApi ? src.base_url : (src.base_url ? 'SQL_FILE • auto-fetch' : 'SQL_FILE • upload only')}</div>
                      </div>
                    </div>
                    <StatusBadge status={src.status} />
                  </div>

                  {(isApi || (src.base_url && opts.autoFetch)) && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span><Clock3 size={11} style={{ verticalAlign: '-1px' }} /> every {src.sync_frequency_minutes}m</span>
                    {isApi && <span><Wifi size={11} style={{ verticalAlign: '-1px' }} /> {src.token_type || 'JWT'} auth</span>}
                    {src.last_sync_at && <span>last sync {new Date(src.last_sync_at).toLocaleString('en-IN')}</span>}
                  </div>}
                  {src.last_message && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{src.last_message}</div>}

                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {isApi && (
                      <button className="btn-swaniki" style={{ ...miniBtn, color: '#10b981', border: '1px solid rgba(16,185,129,0.35)' }} disabled={busy} onClick={() => handleTest(src)}>
                        {busy === `TEST_${src.id}` ? <Loader2 size={13} className="spin" /> : <Wifi size={13} />} Test
                      </button>
                    )}
                    {canSync && (
                      <button className="btn-swaniki" style={{ ...miniBtn, color: 'var(--brand-primary)', border: '1px solid rgba(79,70,229,0.35)' }} disabled={busy} onClick={() => handleSync(src)}>
                        {busy === `SYNC_${src.id}` ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} {isApi ? 'Sync Now' : 'Fetch Now'}
                      </button>
                    )}
                    <button className="btn-swaniki" style={{ ...miniBtn, color: 'var(--text-muted)', border: '1px solid var(--border-color)' }} disabled={busy} onClick={() => openEdit(src)}>
                      <Pencil size={13} /> Edit
                    </button>
                    <button className="btn-swaniki" style={{ ...miniBtn, color: '#f43f5e', border: '1px solid rgba(244,63,94,0.35)' }} disabled={busy} onClick={() => handleDelete(src)}>
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>

                  {testFor && (
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: testFor.ok ? '#10b981' : '#f43f5e' }}>
                      {testFor.ok ? `✓ Reachable — ${testFor.data.devicesFound} device(s)` : `✗ ${testFor.data.error}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* SQL file upload */}
        <div style={card}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-heading)' }}>
            <UploadCloud size={16} color="#f59e0b" />
            Import Biometric Machine File (ATTLOG .dat / SQL)
          </div>
          <form onSubmit={handlePreview} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Upload the machine's export file: a <strong>ZKTeco-family ATTLOG text export ({'*_attlog.dat'})</strong>, a
              <strong> SQLite database ({'*.db'})</strong>, or a <strong>MySQL / SQL Server text dump ({'*.sql'})</strong> from your
              biometric machine software (e.g. <em>checkinout / att_log / userinfo</em> tables). We automatically detect the
              format and show a <strong>full preview of every decoded row</strong> — you confirm before anything is written to the database.
            </p>

            <div>
              <label style={labelStyle}>SQL Database File</label>
              <label style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', justifyContent: 'center',
                padding: '1.75rem 1rem', borderRadius: '0.625rem', border: `2px dashed ${file ? 'rgba(16,185,129,0.5)' : 'var(--border-color)'}`,
                background: file ? 'rgba(16,185,129,0.06)' : 'transparent', cursor: 'pointer', textAlign: 'center'
              }}>
                <HardDrive size={26} color={file ? '#10b981' : 'var(--text-caption)'} />
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-heading)', fontWeight: 600 }}>
                  {file ? file.name : 'Click to choose _attlog.dat / .db / .sqlite / .sql file'}
                </span>
                {file && <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</span>}
                <input type="file" accept=".db,.sqlite,.sqlite3,.sql,.dat,.csv" style={{ display: 'none' }}
                  onChange={e => setFile(e.target.files[0] || null)} />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Import Label</label>
                <input style={inputStyle} placeholder="e.g. Backdated attendance dump" value={importName}
                  onChange={e => setImportName(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Vendor</label>
                <select style={inputStyle} value={importVendor} onChange={e => setImportVendor(e.target.value)}>
                  <option>ZKTeco</option>
                  <option>eSSL</option>
                  <option>Realtime</option>
                  <option>Biomax</option>
                  <option>Other</option>
                </select>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--text-body)', cursor: 'pointer' }}>
              <input type="checkbox" checked={createEmployees} onChange={e => setCreateEmployees(e.target.checked)} />
              Auto-create employee records for unknown biometric IDs
            </label>

            <button
              type="submit"
              disabled={previewing || uploading || !file}
              className="btn-swaniki"
              style={{
                padding: '0.6rem 1.25rem', fontSize: '0.8125rem', fontWeight: 700, border: 'none', borderRadius: '0.5rem', cursor: previewing || !file ? 'not-allowed' : 'pointer',
                background: isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)', color: isDark ? '#0a0c10' : '#fff', opacity: !file || previewing ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: '0.4rem', width: 'max-content'
              }}
            >
              {previewing ? <Loader2 size={16} className="spin" /> : <Eye size={16} />}
              {previewing ? 'Reading file…' : 'Preview data'}
            </button>

            {importResult && (
              <div style={{ padding: '1rem', borderRadius: '0.625rem', border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.07)', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-body)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981', fontWeight: 700 }}>
                  <CheckCircle2 size={15} /> Import successful
                </div>
                <div>Punches found: <strong>{importResult.import.recordsFound}</strong> • Imported: <strong>{importResult.import.recordsImported}</strong> • Skipped: <strong>{importResult.import.recordsSkipped}</strong></div>
                <div>Employees auto-created: <strong>{importResult.import.employeesCreated}</strong> • Devices auto-created: <strong>{importResult.import.devicesCreated}</strong></div>
                {importResult.detectedTables?.length ? <div>Detected tables: <strong style={{ color: 'var(--text-heading)' }}>{importResult.detectedTables.join(', ')}</strong></div> : null}
                {importResult.import.message && <div style={{ color: 'var(--text-muted)' }}>{importResult.import.message}</div>}
                {importResult.import.status === 'PARTIAL' && <div style={{ color: '#f59e0b' }}>{importResult.import.message}</div>}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Roster / employee-name CSV — attaches real names, department and shift to auto-created "Staff #NN" records */}
      <div style={card}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-heading)' }}>
          <IdCard size={16} color="#10b981" />
          Roster / Employee Name CSV
        </div>
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
            Biometric exports only carry numeric user IDs, so unknown staff land up as <strong>Staff #NN</strong>. Upload a small
            CSV to attach their real names, plus a department / shift / salary — matched on <strong>Biometric ID</strong> (or
            Employee Code / email). Changing someone's shift automatically rebuilds their attendance.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1rem', borderRadius: '0.5rem',
              border: `2px dashed ${rosterRows ? 'rgba(16,185,129,0.5)' : 'var(--border-color)'}`,
              background: rosterRows ? 'rgba(16,185,129,0.06)' : 'transparent',
              fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-heading)', cursor: 'pointer'
            }}>
              <UploadCloud size={16} color={rosterRows ? '#10b981' : 'var(--text-caption)'} />
              {rosterName || 'Choose roster .csv file'}
              <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleRosterFile} />
            </label>
            {rosterRows && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{rosterRows.length} row(s) read</span>}
            {rosterRows && (
              <button
                className="btn-swaniki"
                onClick={() => { setRosterRows(null); setRosterName(''); setRosterPreview(null); }}
                style={{ ...miniBtn, color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}
              >
                <X size={13} /> Clear
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              className="btn-swaniki"
              onClick={previewRoster}
              disabled={rosterBusy || !rosterRows}
              style={{
                padding: '0.55rem 1.1rem', fontSize: '0.8125rem', fontWeight: 700, border: 'none', borderRadius: '0.5rem',
                cursor: !rosterRows || rosterBusy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                background: isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)',
                color: isDark ? '#0a0c10' : '#fff', opacity: !rosterRows || rosterBusy ? 0.5 : 1
              }}
            >
              {rosterBusy ? <Loader2 size={15} className="spin" /> : <Eye size={15} />}
              {rosterBusy ? 'Checking…' : 'Preview roster match'}
            </button>
            {canEditEmployees && rosterRows && (
              <button
                className="btn-swaniki"
                onClick={applyRoster}
                disabled={rosterBusy}
                style={{
                  padding: '0.55rem 1.1rem', fontSize: '0.8125rem', fontWeight: 700, borderRadius: '0.5rem',
                  cursor: rosterBusy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                  background: 'rgba(16,185,129,0.14)', color: '#10b981', opacity: rosterBusy ? 0.6 : 1,
                  border: '1px solid rgba(16,185,129,0.35)'
                }}
              >
                {rosterBusy ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                Apply without preview
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Expected headers (any order): Biometric ID / PIN, Name, Designation, Department, Shift, Email, Mobile, Base CTC, DOJ, Gender
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-caption)', textTransform: 'uppercase' }}>Departments</span>
              {setup.departments.map(d => (
                <code key={d.id} className="mono" style={{ fontSize: '0.6875rem', padding: '0.1rem 0.4rem', borderRadius: '0.35rem', background: isDark ? '#0d0f13' : '#f1f5f9', color: 'var(--text-body)', border: '1px solid var(--border-color)' }}>{d.name}</code>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-caption)', textTransform: 'uppercase' }}>Shifts</span>
              {setup.shifts.map(s => (
                <code key={s.id} className="mono" style={{ fontSize: '0.6875rem', padding: '0.1rem 0.4rem', borderRadius: '0.35rem', background: isDark ? '#0d0f13' : '#f1f5f9', color: 'var(--text-body)', border: '1px solid var(--border-color)' }}>{String(s.name).split(' (')[0]}</code>
              ))}
            </div>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>
              Department / shift matching is forgiving — “Nursing” lands on “Nursing &amp; Care”, “Night” on “Night (19:00 - 07:00)”. Unmatched names are flagged in the preview and left unchanged.
            </span>
          </div>
        </div>
      </div>

      {/* Sync logs */}
      <div style={card}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-heading)' }}>
          <RefreshCw size={16} color="var(--brand-primary)" />
          Recent Sync Activity
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <thead>
              <tr style={{ background: isDark ? '#0d0f13' : '#f8fafc' }}>
                {['Time', 'Source', 'Type', 'Status', 'Found', 'Imported', 'Skipped', 'Message', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '0.6rem 0.9rem', color: 'var(--text-caption)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.625rem', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan="9" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>No sync activity yet.</td></tr>
              )}
              {logs.map(l => (
                <tr key={l.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.6rem 0.9rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{l.started_at ? new Date(l.started_at).toLocaleString('en-IN') : '—'}</td>
                  <td style={{ padding: '0.6rem 0.9rem', fontWeight: 600, color: 'var(--text-heading)', whiteSpace: 'nowrap' }}>{l.source_name}</td>
                  <td style={{ padding: '0.6rem 0.9rem' }}><StatusBadge status={l.sync_type} /></td>
                  <td style={{ padding: '0.6rem 0.9rem' }}><StatusBadge status={l.status} /></td>
                  <td style={{ padding: '0.6rem 0.9rem', textAlign: 'center' }}>{l.records_found}</td>
                  <td style={{ padding: '0.6rem 0.9rem', textAlign: 'center', fontWeight: 700, color: '#10b981' }}>{l.records_imported}</td>
                  <td style={{ padding: '0.6rem 0.9rem', textAlign: 'center', color: 'var(--text-muted)' }}>{l.records_skipped}</td>
                  <td style={{ padding: '0.6rem 0.9rem', color: 'var(--text-muted)', maxWidth: '320px' }}>{l.message}</td>
                  <td style={{ padding: '0.6rem 0.9rem', whiteSpace: 'nowrap' }}>
                    {l.reverted_at
                      ? <span style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>reverted {new Date(l.reverted_at).toLocaleDateString('en-IN')}</span>
                      : (canEdit && (l.tagged_punches || 0) > 0 ? (
                        <button
                          className="btn-swaniki"
                          style={{ ...miniBtn, color: '#f43f5e', border: '1px solid rgba(244,63,94,0.35)' }}
                          disabled={Boolean(busy)}
                          onClick={() => handleRevert(l)}
                          title={`Undo this import — removes its ${l.tagged_punches} tagged punch(es) and rebuilds attendance`}
                        >
                          {busy === `REVERT_${l.id}` ? <Loader2 size={13} className="spin" /> : <Undo2 size={13} />} Undo {l.tagged_punches}
                        </button>
                      ) : ((l.records_imported || 0) > 0 ? (
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }} title="This run was imported before punch batch-tagging existed, so its rows can't be singled out for removal">
                          not tagged
                        </span>
                      ) : null))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Maintenance: recompute attendance from stored punches */}
      {canEdit && (
        <div style={card}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-heading)' }}>
            <Calculator size={16} color="#6366f1" />
            Recompute Attendance
          </div>
          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              Rebuilds daily attendance from the punches already stored, using each employee's <strong>current</strong> shift and the
              half-day / full-day thresholds — ideal after a shift correction or a roster CSV. Raw punches are untouched, and
              manually <strong>REGULARIZED</strong> days are preserved. Undo works the other way round — it removes an import's
              punches (see the <strong>Undo</strong> action on each reversible run below).
            </p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div>
                <label style={labelStyle}>From (blank = all history)</label>
                <input style={{ ...inputStyle, width: '180px' }} type="date" value={recFrom} onChange={e => setRecFrom(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>To</label>
                <input style={{ ...inputStyle, width: '180px' }} type="date" value={recTo} onChange={e => setRecTo(e.target.value)} />
              </div>
              <button
                className="btn-swaniki"
                onClick={handleRecompute}
                disabled={busy === 'RECOMPUTE'}
                style={{
                  padding: '0.55rem 1.1rem', fontSize: '0.8125rem', fontWeight: 700, border: 'none', borderRadius: '0.5rem',
                  cursor: busy === 'RECOMPUTE' ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                  background: isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)',
                  color: isDark ? '#0a0c10' : '#fff', opacity: busy === 'RECOMPUTE' ? 0.6 : 1
                }}
              >
                {busy === 'RECOMPUTE' ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                {busy === 'RECOMPUTE' ? 'Recomputing…' : 'Recompute now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen preview shown before the admin confirms the import */}
      {preview && (
        <FilePreviewModal
          preview={preview}
          uploading={uploading}
          onClose={() => { if (!uploading) setPreview(null); }}
          onConfirm={performImport}
        />
      )}

      {rosterPreview && (
        <RosterPreviewModal
          preview={rosterPreview}
          busy={rosterBusy}
          canApply={canEditEmployees}
          onClose={() => { if (!rosterBusy) setRosterPreview(null); }}
          onApply={applyRoster}
        />
      )}
    </div>
  );
}

// Editable preview table shared by the punch-file and roster modals.
function PreviewTable({ columns, rows }) {
  const { isDark } = useTheme();
  const headBg = isDark ? '#0d0f13' : '#f8fafc';
  return (
    <div style={{ overflow: 'auto', maxHeight: '52vh', border: '1px solid var(--border-color)', borderRadius: '0.625rem' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
        <thead style={{ position: 'sticky', top: 0, background: headBg, zIndex: 1 }}>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.55rem 0.8rem', color: 'var(--text-caption)', fontWeight: 700, fontSize: '0.62rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>#</th>
            {columns.map(c => (
              <th key={c.key} style={{ textAlign: 'left', padding: '0.55rem 0.8rem', color: 'var(--text-caption)', fontWeight: 700, fontSize: '0.62rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border-color)', background: i % 2 && isDark ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
              <td style={{ padding: '0.4rem 0.8rem', color: 'var(--text-caption)', fontFamily: 'ui-monospace, monospace' }}>{i + 1}</td>
              {columns.map(c => (
                <td key={c.key} style={{ padding: '0.4rem 0.8rem', color: 'var(--text-body)', whiteSpace: 'nowrap' }}>
                  {c.render ? c.render(row[c.key], row) : renderPreviewCell(c, row[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderPreviewCell(col, v) {
  if (col.key === 'known') {
    return <ActionPill label={v ? 'Matched' : 'New'} tone={v ? 'green' : 'amber'} />;
  }
  return <span style={{ fontFamily: 'ui-monospace, monospace' }}>{v === null || v === undefined || v === '' ? '—' : String(v)}</span>;
}

const ACTION_TONE = {
  green: { bg: 'rgba(16,185,129,0.14)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
  amber: { bg: 'rgba(245,158,11,0.14)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  red: { bg: 'rgba(244,63,94,0.14)', color: '#f43f5e', border: 'rgba(244,63,94,0.3)' },
  slate: { bg: 'rgba(100,116,139,0.14)', color: '#94a3b8', border: 'rgba(100,116,139,0.3)' }
};

function ActionPill({ label, tone }) {
  const t = ACTION_TONE[tone] || ACTION_TONE.slate;
  return (
    <span style={{
      fontSize: '0.62rem', fontWeight: 700, padding: '0.12rem 0.45rem', borderRadius: '9999px', textTransform: 'uppercase',
      background: t.bg, color: t.color, border: `1px solid ${t.border}`
    }}>{label}</span>
  );
}

function actionTone(status) {
  const s = String(status || '').toLowerCase();
  if (s.startsWith('error')) return 'red';
  if (s.startsWith('update')) return 'green';
  if (s.startsWith('new')) return 'amber';
  return 'slate';
}

// Server-classified roster preview: which employees will be updated / created / rejected.
function RosterPreviewModal({ preview, busy, canApply, onClose, onApply }) {
  const { isDark } = useTheme();
  const bg = isDark ? '#111318' : '#ffffff';
  const headBg = isDark ? '#0d0f13' : '#f8fafc';
  useEscapeClose(!busy, onClose);

  const columns = preview.columns.map(c => (c.key === 'status'
    ? { ...c, render: (v) => <ActionPill label={v} tone={actionTone(v)} /> }
    : c));

  const stats = [
    { label: 'Rows', value: preview.summary.total, color: '#6366f1' },
    { label: 'Will update', value: preview.summary.willUpdate, color: '#10b981' },
    { label: 'Will create', value: preview.summary.willCreate, color: '#f59e0b' },
    { label: 'Errors', value: preview.summary.errors, color: preview.summary.errors ? '#f43f5e' : '#10b981' }
  ];

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(1100px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: bg, border: '1px solid var(--border-color)', borderRadius: '1rem', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="pill-badge pill-indigo" style={{ fontSize: '0.62rem' }}>ROSTER CSV</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Review before applying · nothing has been written yet</span>
            </div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-heading)' }}>Roster match preview</h2>
          </div>
          <button onClick={onClose} disabled={busy} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: busy ? 'not-allowed' : 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', padding: '1rem 1.4rem', borderBottom: '1px solid var(--border-color)' }}>
          {stats.map(s => (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</span>
              <span style={{ fontSize: '1.35rem', fontWeight: 800, color: s.color, lineHeight: 1 }}>{Number(s.value || 0).toLocaleString('en-IN')}</span>
            </div>
          ))}
        </div>

        <div style={{ padding: '1rem 1.4rem', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {/\(unknown\)/.test(JSON.stringify(preview.rows)) && (
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600 }}>
              Some department / shift names were not found in the setup — those cells will be left unchanged on apply.
            </p>
          )}
          <PreviewTable columns={columns} rows={preview.rows} />
        </div>

        <div style={{ padding: '1rem 1.4rem', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', background: headBg }}>
          <span style={{ marginRight: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Applying updates {preview.summary.willUpdate} employee record(s) and creates {preview.summary.willCreate}. Any changed shift triggers an attendance rebuild.
          </span>
          <button className="btn-swaniki" onClick={onClose} disabled={busy} style={{ background: 'transparent', color: 'var(--text-muted)', padding: '0.5rem 1rem', fontSize: '0.8125rem', fontWeight: 600, border: '1px solid var(--border-color)', borderRadius: '0.5rem', cursor: busy ? 'not-allowed' : 'pointer' }}>
            Cancel
          </button>
          {canApply && (
            <button className="btn-swaniki" onClick={onApply} disabled={busy} style={{ background: isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)', color: isDark ? '#0a0c10' : '#fff', padding: '0.5rem 1.25rem', fontSize: '0.8125rem', fontWeight: 700, border: 'none', borderRadius: '0.5rem', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: busy ? 0.6 : 1 }}>
              {busy ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
              {busy ? 'Applying…' : 'Confirm & Apply'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Full-page preview table for a parsed (but not yet imported) biometric file.
function FilePreviewModal({ preview, uploading, onClose, onConfirm }) {
  const { isDark } = useTheme();
  const [sheet, setSheet] = useState('punches');
  const hasEmployees = Array.isArray(preview.employees) && preview.employees.length > 0;
  useEscapeClose(!uploading, onClose);

  const bg = isDark ? '#111318' : '#ffffff';
  const headBg = isDark ? '#0d0f13' : '#f8fafc';

  const stats = [
    { label: 'Rows', value: preview.totalRows, color: '#6366f1' },
    { label: 'Distinct users', value: preview.distinctUsers, color: '#00f2fe' },
    { label: 'Matched employees', value: preview.knownUsers, color: '#10b981' },
    { label: 'New (will be created)', value: preview.newUsers, color: preview.newUsers > 0 ? '#f59e0b' : '#10b981' }
  ];
  if (preview.skippedRows) stats.push({ label: 'Skipped rows', value: preview.skippedRows, color: '#f43f5e' });

  const empColumns = [{ key: 'biometricUserId', label: 'User ID' }, { key: 'fullName', label: 'Name' }, { key: 'known', label: 'Employee' }];

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(1100px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: bg, border: '1px solid var(--border-color)', borderRadius: '1rem', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
        {/* Header */}
        <div style={{ padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="pill-badge pill-indigo" style={{ fontSize: '0.62rem' }}>{preview.format === 'ATTLOG' ? 'ATTLOG .dat' : 'SQL FILE'}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Review before import · nothing has been written yet</span>
            </div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-heading)' }}>
              {preview.fileName || (preview.punchTable ? `Punches from ${preview.punchTable}` : 'File preview')}
            </h2>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {preview.deviceSerial && <span>Device: <strong className="mono">{preview.deviceSerial}</strong></span>}
              {preview.punchTable && <span>Punch table: <strong className="mono">{preview.punchTable}</strong></span>}
              {preview.dateFrom && <span>{String(preview.dateFrom).slice(0, 10)} → {String(preview.dateTo).slice(0, 10)}</span>}
              {preview.detectedTables?.length ? <span>Tables: {preview.detectedTables.join(', ')}</span> : null}
            </div>
          </div>
          <button onClick={onClose} disabled={uploading} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: uploading ? 'not-allowed' : 'pointer' }}><X size={20} /></button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(140px, 1fr))`, gap: '0.75rem', padding: '1rem 1.4rem', borderBottom: '1px solid var(--border-color)' }}>
          {stats.map(s => (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</span>
              <span style={{ fontSize: '1.35rem', fontWeight: 800, color: s.color, lineHeight: 1 }}>{Number(s.value || 0).toLocaleString('en-IN')}</span>
            </div>
          ))}
        </div>

        {/* Sheet toggle (punches / employees) when the file also carried a roster */}
        {hasEmployees && (
          <div style={{ padding: '0.75rem 1.4rem 0', display: 'flex', gap: '0.5rem' }}>
            <button className={`demo-tab ${sheet === 'punches' ? 'demo-tab-active' : ''}`} onClick={() => setSheet('punches')}><Table2 size={14} /> Punches ({preview.totalRows})</button>
            <button className={`demo-tab ${sheet === 'employees' ? 'demo-tab-active' : ''}`} onClick={() => setSheet('employees')}><Users size={14} /> Employee roster ({preview.employeeTotal})</button>
          </div>
        )}

        {/* Table */}
        <div style={{ padding: '1rem 1.4rem', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {preview.shownRows < preview.totalRows && (
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600 }}>
              Showing the first {preview.shownRows.toLocaleString('en-IN')} of {preview.totalRows.toLocaleString('en-IN')} rows — all {preview.totalRows.toLocaleString('en-IN')} will be imported on confirm.
            </p>
          )}
          {sheet === 'employees' && hasEmployees
            ? <PreviewTable columns={empColumns} rows={preview.employees} />
            : <PreviewTable columns={preview.columns} rows={preview.rows} />}
        </div>

        {/* Footer actions */}
        <div style={{ padding: '1rem 1.4rem', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', background: headBg }}>
          <span style={{ marginRight: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Importing will add {preview.totalRows.toLocaleString('en-IN')} punch{preview.totalRows === 1 ? '' : 'es'}{preview.newUsers > 0 ? ` and create ${preview.newUsers} new employee record${preview.newUsers === 1 ? '' : 's'}` : ''}.
          </span>
          <button className="btn-swaniki" onClick={onClose} disabled={uploading} style={{ background: 'transparent', color: 'var(--text-muted)', padding: '0.5rem 1rem', fontSize: '0.8125rem', fontWeight: 600, border: '1px solid var(--border-color)', borderRadius: '0.5rem', cursor: uploading ? 'not-allowed' : 'pointer' }}>
            Cancel
          </button>
          <button className="btn-swaniki" onClick={onConfirm} disabled={uploading} style={{ background: isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)', color: isDark ? '#0a0c10' : '#fff', padding: '0.5rem 1.25rem', fontSize: '0.8125rem', fontWeight: 700, border: 'none', borderRadius: '0.5rem', cursor: uploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: uploading ? 0.6 : 1 }}>
            {uploading ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
            {uploading ? 'Importing…' : 'Confirm & Import'}
          </button>
        </div>
      </div>
    </div>
  );
}

const miniBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
  padding: '0.3rem 0.65rem', borderRadius: '0.45rem', background: 'transparent',
  fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer'
};