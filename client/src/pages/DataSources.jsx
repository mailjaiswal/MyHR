import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import useEscapeClose from '../hooks/useEscapeClose';
import {
  Database, PlugZap, UploadCloud, RefreshCw, Trash2, Pencil, CheckCircle2,
  XCircle, Loader2, Server, FileText, Clock3, Settings2, Wifi, HardDrive, Link2,
  Eye, X, Users, Table2
} from 'lucide-react';

const STATUS_COLOR = {
  SUCCESS: { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
  FAILED: { bg: 'rgba(244, 63, 94, 0.12)', color: '#f43f5e', border: 'rgba(244,63,94,0.3)' },
  PARTIAL: { bg: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  RUNNING: { bg: 'rgba(79, 70, 229, 0.12)', color: '#6366f1', border: 'rgba(79,70,229,0.3)' },
  ACTIVE: { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
  ERROR: { bg: 'rgba(244, 63, 94, 0.12)', color: '#f43f5e', border: 'rgba(244,63,94,0.3)' },
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
  const { authFetch: fetch } = useAuth();
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

  const loadAll = useCallback(() => {
    fetch('/api/v1/ingestion/sources').then(r => r.json()).then(d => { if (d.success) setSources(d.sources); }).catch(() => {});
    fetch('/api/v1/ingestion/summary').then(r => r.json()).then(d => { if (d.success) setSummary(d.summary); }).catch(() => {});
    fetch('/api/v1/ingestion/logs?limit=30').then(r => r.json()).then(d => { if (d.success) setLogs(d.logs); }).catch(() => {});
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
                {['Time', 'Source', 'Type', 'Status', 'Found', 'Imported', 'Skipped', 'Message'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '0.6rem 0.9rem', color: 'var(--text-caption)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.625rem', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan="8" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>No sync activity yet.</td></tr>
              )}
              {logs.map(l => (
                <tr key={l.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.6rem 0.9rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{l.started_at ? new Date(l.started_at).toLocaleString('en-IN') : '—'}</td>
                  <td style={{ padding: '0.6rem 0.9rem', fontWeight: 600, color: 'var(--text-heading)', whiteSpace: 'nowrap' }}>{l.source_name}</td>
                  <td style={{ padding: '0.6rem 0.9rem' }}><StatusBadge status={l.sync_type === 'MANUAL' ? 'PARTIAL' : l.sync_type === 'API_PULL' ? 'ACTIVE' : 'ERROR'} /></td>
                  <td style={{ padding: '0.6rem 0.9rem' }}><StatusBadge status={l.status} /></td>
                  <td style={{ padding: '0.6rem 0.9rem', textAlign: 'center' }}>{l.records_found}</td>
                  <td style={{ padding: '0.6rem 0.9rem', textAlign: 'center', fontWeight: 700, color: '#10b981' }}>{l.records_imported}</td>
                  <td style={{ padding: '0.6rem 0.9rem', textAlign: 'center', color: 'var(--text-muted)' }}>{l.records_skipped}</td>
                  <td style={{ padding: '0.6rem 0.9rem', color: 'var(--text-muted)', maxWidth: '320px' }}>{l.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full-screen preview shown before the admin confirms the import */}
      {preview && (
        <FilePreviewModal
          preview={preview}
          uploading={uploading}
          onClose={() => { if (!uploading) setPreview(null); }}
          onConfirm={performImport}
        />
      )}
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

  const fmt = (v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return null; // handled specially
    return String(v);
  };

  const renderCell = (col, row) => {
    const v = row[col.key];
    if (col.key === 'known') {
      return (
        <span style={{
          fontSize: '0.62rem', fontWeight: 700, padding: '0.12rem 0.45rem', borderRadius: '9999px', textTransform: 'uppercase',
          background: v ? 'rgba(16,185,129,0.14)' : 'rgba(245,158,11,0.14)',
          color: v ? '#10b981' : '#f59e0b', border: `1px solid ${v ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`
        }}>{v ? 'Matched' : 'New'}</span>
      );
    }
    return <span style={{ fontFamily: 'ui-monospace, monospace' }}>{fmt(v)}</span>;
  };

  const tableFor = (columns, rows) => (
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
                <td key={c.key} style={{ padding: '0.4rem 0.8rem', color: 'var(--text-body)', whiteSpace: 'nowrap' }}>{renderCell(c, row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

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
            ? tableFor(empColumns, preview.employees)
            : tableFor(preview.columns, preview.rows)}
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