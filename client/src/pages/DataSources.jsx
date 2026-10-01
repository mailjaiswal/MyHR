import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import useEscapeClose from '../hooks/useEscapeClose';
import {
  Database, PlugZap, UploadCloud, RefreshCw, Trash2, Pencil, CheckCircle2,
  XCircle, Loader2, Server, FileText, Clock3, Settings2, Wifi, HardDrive, Link2,
  Eye, X, Users, Table2, Calculator, Undo2, IdCard, TriangleAlert, Download, CalendarRange, ChevronRight
} from 'lucide-react';

// Status semantics only: emerald = healthy, amber = partial, rose = failed,
// slate = inert. Text always uses an AA-safe ink, never the bright fill.
const STATUS_COLOR = {
  SUCCESS: { bg: 'rgba(16, 185, 129, 0.12)', color: 'var(--brand-primary-ink)', border: 'rgba(4, 120, 87, 0.30)' },
  FAILED: { bg: 'rgba(185, 28, 28, 0.10)', color: 'var(--danger-ink)', border: 'rgba(185, 28, 28, 0.26)' },
  PARTIAL: { bg: 'rgba(180, 83, 9, 0.12)', color: 'var(--warning-ink)', border: 'rgba(180, 83, 9, 0.26)' },
  RUNNING: { bg: 'rgba(13, 148, 136, 0.12)', color: 'var(--brand-primary-ink)', border: 'rgba(13, 148, 136, 0.32)' },
  ACTIVE: { bg: 'rgba(16, 185, 129, 0.12)', color: 'var(--brand-primary-ink)', border: 'rgba(4, 120, 87, 0.30)' },
  ERROR: { bg: 'rgba(185, 28, 28, 0.10)', color: 'var(--danger-ink)', border: 'rgba(185, 28, 28, 0.26)' },
  REVERTED: { bg: 'rgba(100, 116, 139, 0.14)', color: 'var(--text-muted)', border: 'rgba(100, 116, 139, 0.32)' },
  FILE_IMPORT: { bg: 'rgba(13, 148, 136, 0.12)', color: 'var(--brand-primary-ink)', border: 'rgba(13, 148, 136, 0.28)' },
  API_PULL: { bg: 'rgba(16, 185, 129, 0.12)', color: 'var(--brand-primary-ink)', border: 'rgba(4, 120, 87, 0.30)' },
  MANUAL: { bg: 'rgba(6, 95, 70, 0.10)', color: 'var(--brand-primary-ink)', border: 'rgba(6, 95, 70, 0.26)' },
  PAUSED: { bg: 'rgba(100, 116, 139, 0.12)', color: 'var(--text-muted)', border: 'rgba(100, 116, 139, 0.28)' }
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

// Day-handling summary: how each duty date touched by an import/sync run was
// treated (merged delta, newly built, duplicate overlap, protected, still open).
// Renders nothing for legacy runs without a stored summary.
const DAY_FLAG_META = {
  open: { label: 'open — awaiting OUT', color: 'var(--warning-ink)' },
  protected: { label: 'regularized — untouched', color: 'var(--text-muted)' }
};

function DayHandlingSummary({ summary, compact = false, onNavigate }) {
  const [showAll, setShowAll] = useState(false);
  if (!summary || !summary.totals) return null;
  const t = summary.totals;
  if (!t.daysTouched && !t.duplicatePunches) return null;
  const fmtDay = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
  const days = compact && !showAll ? summary.days.slice(0, 5) : summary.days;
  const num = (n) => (Number(n) || 0).toLocaleString('en-IN');
  // One scannable metric cell: emphasised number + label + muted caption.
  const cell = (label, value, caption, color = 'var(--text-heading)') => (
    <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', padding: '0.55rem 0.65rem', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', borderRadius: '0.55rem' }}>
      <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', fontWeight: 700, color, lineHeight: 1, letterSpacing: '-0.02em' }}>{num(value)}</span>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-heading)' }}>{label}</span>
      {caption && <span style={{ fontSize: '0.66rem', color: 'var(--text-caption)', lineHeight: 1.35 }}>{caption}</span>}
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, color: 'var(--text-heading)' }}>
        <CalendarRange size={14} /> Days handled <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>({t.daysTouched} date{t.daysTouched === 1 ? '' : 's'} · {t.staffDayRecords || 0} staff-day{t.staffDayRecords === 1 ? '' : 's'})</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem' }}>
        {cell('New punches merged', t.mergedDays, 'days that gained fresh punches (delta added)', t.mergedDays > 0 ? 'var(--brand-primary-ink)' : 'var(--text-muted)')}
        {cell('Unchanged days', t.duplicateOnlyDays, 'pure duplicate overlap — nothing overwritten', 'var(--text-muted)')}
        {cell('Protected days', t.protectedDays, 'regularized left untouched', t.protectedDays > 0 ? 'var(--text-heading)' : 'var(--text-muted)')}
        {cell('Open days', t.openDays, 'awaiting OUT — completes on next batch', t.openDays > 0 ? 'var(--warning-ink)' : 'var(--text-muted)')}
      </div>
      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0.1rem 0.1rem' }}>
        <span><strong style={{ color: t.newPunches > 0 ? 'var(--brand-primary-ink)' : 'var(--text-heading)' }}>{num(t.newPunches)}</strong> new punch{t.newPunches === 1 ? '' : 'es'} inserted</span>
        <span><strong style={{ color: 'var(--text-heading)' }}>{num(t.duplicatePunches)}</strong> already-known punch{t.duplicatePunches === 1 ? '' : 'es'} deduplicated</span>
      </div>
      {days.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-caption)' }}>
              <th style={{ padding: '0.25rem 0.5rem 0.25rem 0', fontWeight: 600 }}>Date</th>
              <th style={{ padding: '0.25rem 0.5rem', fontWeight: 600 }}>Staff</th>
              <th style={{ padding: '0.25rem 0.5rem', fontWeight: 600 }}>Window (IST)</th>
              <th style={{ padding: '0.25rem 0.5rem', fontWeight: 600 }}>New</th>
              <th style={{ padding: '0.25rem 0.5rem', fontWeight: 600 }}>Dup</th>
              <th style={{ padding: '0.25rem 0', fontWeight: 600 }}>Treatment</th>
            </tr>
          </thead>
          <tbody>
            {days.map(d => (
              <tr key={d.dutyDate} style={{ borderTop: '1px solid var(--border-color)' }}>
                <td style={{ padding: '0.25rem 0.5rem 0.25rem 0', fontWeight: 600, color: 'var(--text-heading)', whiteSpace: 'nowrap' }}>{fmtDay(d.dutyDate)}</td>
                <td style={{ padding: '0.25rem 0.5rem' }}>{d.employees}</td>
                <td style={{ padding: '0.25rem 0.5rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtTime(d.from)} → {fmtTime(d.to)}</td>
                <td style={{ padding: '0.25rem 0.5rem' }}>{d.newPunches}</td>
                <td style={{ padding: '0.25rem 0.5rem', color: 'var(--text-muted)' }}>{d.dupPunches}</td>
                <td style={{ padding: '0.25rem 0' }}>
                  {d.flags.length
                    ? d.flags.map(f => <span key={f} style={{ color: DAY_FLAG_META[f]?.color || 'var(--text-muted)', fontWeight: 600, marginRight: '0.4rem' }}>{DAY_FLAG_META[f]?.label || f}</span>)
                    : <span style={{ color: d.newPunches > 0 ? 'var(--brand-primary-ink)' : 'var(--text-muted)' }}>{d.newPunches > 0 ? 'delta merged' : 'no change (overlap)'}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {compact && summary.days.length > 5 && !showAll && (
        <button onClick={() => setShowAll(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, color: 'var(--brand-primary-ink)', width: 'max-content' }}>
          Show all {summary.days.length} day(s)
        </button>
      )}
      {summary.truncated && <div style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>Only the most recent {summary.days.length} of {t.daysTouched} affected date(s) are listed.</div>}
      {typeof onNavigate === 'function' && (
        <button
          onClick={() => onNavigate('attendance')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, color: 'var(--brand-primary-ink)', width: 'max-content' }}
        >
          <CalendarRange size={13} /> Review &amp; edit these days in Attendance →
        </button>
      )}
    </div>
  );
}

const emptyForm = {
  name: '', source_type: 'API', vendor: 'ZKTeco', base_url: '', username: '', password: '',
  token_type: 'JWT', sync_frequency_minutes: 60, backfillDays: 7, empCode: '',
  syncEmployees: false, autoFetch: false, columnMapJson: ''
};

export default function DataSources({ onNavigate }) {
  const { authFetch: fetch, hasPerm } = useAuth();
  const [sources, setSources] = useState([]);
  const [summary, setSummary] = useState({});
  const [logs, setLogs] = useState([]);
  const [expandedLogId, setExpandedLogId] = useState(null);
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
  // Guided import run: preview -> processing -> done | error (all inside one modal)
  const [runStage, setRunStage] = useState('preview');
  const [runOutcome, setRunOutcome] = useState(null);
  const [runError, setRunError] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  // Live ingest counts streamed from the server while the import runs: { found, imported }
  const [progress, setProgress] = useState(null);
  // Guided run for the manual Sync buttons (API / auto-fetched SQL file) — same modal as upload.
  const [syncRun, setSyncRun] = useState(null);

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
  // First-time-onboarding guardrail: pending rows waiting for an explicit confirm
  const [rosterGate, setRosterGate] = useState(null);
  const [rosterAck, setRosterAck] = useState(false);
  // Department / shift labels the roster CSV may use + how many staff already exist
  const [setup, setSetup] = useState({ departments: [], shifts: [], employeeCount: 0 });

  const loadAll = useCallback(() => {
    fetch('/api/v1/ingestion/sources').then(r => r.json()).then(d => { if (d.success) setSources(d.sources); }).catch(() => {});
    fetch('/api/v1/ingestion/summary').then(r => r.json()).then(d => { if (d.success) setSummary(d.summary); }).catch(() => {});
    fetch('/api/v1/ingestion/logs?limit=30').then(r => r.json()).then(d => { if (d.success) setLogs(d.logs); }).catch(() => {});
    fetch('/api/v1/ingestion/setup').then(r => r.json()).then(d => {
      if (d.success) setSetup({ departments: d.departments || [], shifts: d.shifts || [], employeeCount: Number(d.employeeCount) || 0 });
    }).catch(() => {});
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

  // Manual sync (API source or auto-fetched SQL file) reuses the guided upload modal so
  // the operator sees the identical live progress bar → completion report → Close flow.
  const handleSync = async (src) => {
    if (syncRun?.stage === 'processing') return;
    const preview = { fileName: src.name, totalRows: 0, distinctUsers: 0, format: 'SYNC' };
    setSyncRun({ src, preview, stage: 'processing', outcome: null, runError: null, elapsedMs: 0, progress: { found: 0, imported: 0 } });
    const t0 = Date.now();
    const tick = setInterval(() => setSyncRun(r => r ? { ...r, elapsedMs: Date.now() - t0 } : r), 100);
    let busy = false;
    const poll = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await fetch('/api/v1/ingestion/progress');
        const d = await r.json();
        if (d.success && d.progress) setSyncRun(r2 => r2 ? { ...r2, progress: { found: d.progress.recordsFound, imported: d.progress.recordsImported } } : r2);
      } catch { /* transient poll error; final result comes from the sync response */ }
      finally { busy = false; }
    }, 350);
    try {
      const res = await fetch(`/api/v1/ingestion/sources/${src.id}/sync`, { method: 'POST' });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        const hint = res.status >= 500 ? ' The sync may have timed out on the server — try a narrower backfill window.' : '';
        throw new Error(`Sync failed (HTTP ${res.status}).${hint}`);
      }
      const data = await res.json();
      if (data.success) {
        setSyncRun(r => ({ ...r, stage: 'done', outcome: { import: data, durationMs: data.durationMs ?? (Date.now() - t0) }, progress: { found: data.recordsFound || 0, imported: data.recordsImported || 0 } }));
        loadAll();
      } else {
        setSyncRun(r => ({ ...r, stage: 'error', runError: data.error || 'Sync failed' }));
      }
    } catch (err) {
      setSyncRun(r => ({ ...(r || { preview, outcome: null, elapsedMs: Date.now() - t0 }), stage: 'error', runError: err.message || 'Sync failed' }));
    } finally {
      clearInterval(tick);
      clearInterval(poll);
    }
  };

  const closeSyncRun = () => setSyncRun(null);

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
    setRunStage('preview');
    setRunOutcome(null);
    setRunError(null);
    setProgress(null);
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

  // Step 2: import only after the admin confirms the preview. All feedback stays
  // INSIDE the modal (processing → complete/error) so nothing is silently lost.
  const performImport = async () => {
    if (!file) return;
    setUploading(true);
    setRunError(null);
    setRunStage('processing');
    const t0 = Date.now();
    setElapsedMs(0);
    // Seed an optimistic denominator from the preview so the bar has scale instantly,
    // then let the server-poll refine it. `imported` climbs as chunks commit.
    setProgress({ found: preview?.totalRows || 0, imported: 0 });
    const tick = setInterval(() => setElapsedMs(Date.now() - t0), 100);
    let pollBusy = false;
    const poll = setInterval(async () => {
      if (pollBusy) return; // don't stack requests if one is slow
      pollBusy = true;
      try {
        const r = await fetch('/api/v1/ingestion/progress');
        const d = await r.json();
        if (d.success && d.progress) setProgress({ found: d.progress.recordsFound, imported: d.progress.recordsImported });
      } catch { /* transient poll errors are fine; final result comes from /upload */ }
      finally { pollBusy = false; }
    }, 350);
    try {
      const buf = await file.arrayBuffer();
      const res = await fetch('/api/v1/ingestion/upload', { method: 'POST', headers: uploadHeaders(), body: buf });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        const hint = res.status === 413 ? ' The file is too large for one upload.'
          : res.status >= 500 ? ' The import may have timed out on the server — try again, or import a shorter date range.' : '';
        throw new Error(`Import failed (HTTP ${res.status}).${hint}`);
      }
      const data = await res.json();
      if (data.success) {
        const durMs = data.import?.durationMs ?? (Date.now() - t0);
        setRunOutcome({ ...data, durationMs: durMs });
        setRunStage('done');
        setImportResult(data);
        loadAll();
      } else {
        setRunError(data.error || 'Import failed');
        setRunStage('error');
      }
    } catch (err) {
      setRunError(err.message || 'Upload failed');
      setRunStage('error');
    } finally {
      clearInterval(tick);
      clearInterval(poll);
      setElapsedMs(Date.now() - t0);
      setUploading(false);
    }
  };

  // Close the guided run modal from any finished stage; resets for the next file.
  const closeRun = () => {
    if (uploading) return;
    setPreview(null);
    setFile(null);
    setRunStage('preview');
    setRunOutcome(null);
    setRunError(null);
    setProgress(null);
    setElapsedMs(0);
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
      // Guardrail: bulk upload is meant for first-time onboarding only.
      if (setup.employeeCount > 0 && !rosterAck) {
        setRosterGate(parsed.rows);
        return;
      }
      setRosterRows(parsed.rows);
    } catch (err) {
      notify(`Could not read CSV: ${err.message}`, true);
      setRosterRows(null);
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const confirmRosterGate = () => {
    setRosterRows(rosterGate);
    setRosterAck(true);
    setRosterGate(null);
  };

  const downloadRosterTemplate = async () => {
    setBusy('TEMPLATE');
    try {
      const res = await fetch('/api/v1/ingestion/roster/template');
      if (!res.ok) { notify('Template download failed', true); return; }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'myHR_Employee_Master_Template.csv';
      a.click();
      URL.revokeObjectURL(a.href);
      notify('Master template downloaded — fill it in and upload it back');
    } catch (err) {
      notify(`Template download failed: ${err.message}`, true);
    } finally {
      setBusy(null);
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
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-color)',
    borderRadius: '0.875rem'
  };

  const inputStyle = {
    width: '100%',
    background: 'var(--bg-surface-subtle)',
    border: '1px solid var(--border-color)',
    borderRadius: '0.5rem',
    padding: '0.55rem 0.75rem',
    fontSize: '0.8125rem',
    color: 'var(--text-heading)',
    outline: 'none'
  };

  const labelStyle = {
    fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-caption)',
    letterSpacing: '0.005em', marginBottom: '0.3rem', display: 'block'
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
          <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--text-heading)', letterSpacing: '-0.03em' }}>
            Data Sources <em className="highlight-italic">&amp; Integrations</em>
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Extract punches from biometric SQL database files or pull directly from vendor web-app APIs (ZKTeco BioTime 8.0 / eSSL / Realtime).
          </p>
        </div>

        <button
          className="btn-swaniki btn-swaniki-primary"
          style={{ padding: '0.5rem 1rem', fontSize: '0.8125rem' }}
          onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); setTestResult(null); }}
        >
          <PlugZap size={16} />
          <span>Add Data Source</span>
        </button>
      </div>

      {(message || error) && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '0.75rem',
          background: error ? 'rgba(185, 28, 28, 0.10)' : 'var(--brand-primary-light)',
          border: `1px solid ${error ? 'rgba(185, 28, 28, 0.26)' : 'rgba(4, 120, 87, 0.28)'}`,
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          fontSize: '0.8125rem', color: error ? 'var(--danger-ink)' : 'var(--brand-primary-ink)', fontWeight: 600
        }}>
          {error ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{error || message}</span>
        </div>
      )}

      {/* Summary metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem' }}>
        {[
          { label: 'Total Sources', value: summary.total_sources || 0, icon: Database, color: 'var(--brand-primary-ink)' },
          { label: 'API Sources', value: summary.api_sources || 0, icon: Link2, color: 'var(--brand-primary-ink)' },
          { label: 'Sync Runs', value: summary.total_runs || 0, icon: RefreshCw, color: 'var(--brand-primary-ink)' },
          { label: 'Failed Runs', value: summary.failed_runs || 0, icon: XCircle, color: 'var(--danger-ink)' },
          { label: 'Punches Ingested', value: (summary.total_punches || 0).toLocaleString('en-IN'), icon: HardDrive, color: 'var(--brand-primary-ink)' }
        ].map(m => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="swaniki-card" style={{
              display: 'flex', flexDirection: 'column', gap: '0.6rem',
              padding: '1rem 1.25rem', minHeight: '5.5rem', borderRadius: '0.875rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icon size={15} color={m.color} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-caption)', letterSpacing: '0.005em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label}</span>
              </div>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-heading)', letterSpacing: '-0.03em', lineHeight: 1.15 }}>{m.value}</span>
            </div>
          );
        })}
      </div>

      {/* Add / Edit API source form */}
      {showForm && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-heading)' }}>
              <Settings2 size={16} color="var(--brand-primary-ink)" />
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
              <button type="submit" className="btn-swaniki" style={{ background: 'var(--brand-primary)', color: 'var(--on-primary)', padding: '0.55rem 1.25rem', fontSize: '0.8125rem', fontWeight: 700, border: 'none', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
              <div style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 600, background: testResult.ok ? 'var(--brand-primary-light)' : 'rgba(185,28,28,0.10)', color: testResult.ok ? 'var(--brand-primary-ink)' : 'var(--danger-ink)', border: `1px solid ${testResult.ok ? 'rgba(4,120,87,0.28)' : 'rgba(185,28,28,0.26)'}` }}>
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
            <Server size={16} color="var(--brand-primary-ink)" />
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
                <div key={src.id} style={{ padding: '0.9rem 1rem', borderRadius: '0.625rem', border: '1px solid var(--border-color)', background: 'var(--bg-surface-subtle)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                      {isApi ? <Link2 size={17} color="var(--brand-primary-ink)" style={{ flexShrink: 0 }} /> : <FileText size={17} color="var(--brand-primary-ink)" style={{ flexShrink: 0 }} />}
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
                      <button className="btn-swaniki" style={{ ...miniBtn, color: 'var(--brand-primary-ink)', border: '1px solid rgba(4,120,87,0.35)' }} disabled={busy} onClick={() => handleTest(src)}>
                        {busy === `TEST_${src.id}` ? <Loader2 size={13} className="spin" /> : <Wifi size={13} />} Test
                      </button>
                    )}
                    {canSync && (
                      <button className="btn-swaniki" style={{ ...miniBtn, color: 'var(--brand-primary-ink)', border: '1px solid rgba(4,120,87,0.35)' }} disabled={busy} onClick={() => handleSync(src)}>
                        {busy === `SYNC_${src.id}` ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} {isApi ? 'Sync Now' : 'Fetch Now'}
                      </button>
                    )}
                    <button className="btn-swaniki" style={{ ...miniBtn, color: 'var(--text-muted)', border: '1px solid var(--border-color)' }} disabled={busy} onClick={() => openEdit(src)}>
                      <Pencil size={13} /> Edit
                    </button>
                    <button className="btn-swaniki" style={{ ...miniBtn, color: 'var(--danger-ink)', border: '1px solid rgba(185,28,28,0.3)' }} disabled={busy} onClick={() => handleDelete(src)}>
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>

                  {testFor && (
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: testFor.ok ? 'var(--brand-primary-ink)' : 'var(--danger-ink)' }}>
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
            <UploadCloud size={16} color="var(--brand-primary-ink)" />
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
                <HardDrive size={26} color={file ? 'var(--brand-primary-ink)' : 'var(--text-caption)'} />
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
                background: 'var(--brand-primary)', color: 'var(--on-primary)', opacity: !file || previewing ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: '0.4rem', width: 'max-content'
              }}
            >
              {previewing ? <Loader2 size={16} className="spin" /> : <Eye size={16} />}
              {previewing ? 'Reading file…' : 'Preview data'}
            </button>

            {importResult && (
              <div style={{ padding: '1rem', borderRadius: '0.625rem', border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.07)', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-body)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--brand-primary-ink)', fontWeight: 700 }}>
                  <CheckCircle2 size={15} /> Import successful
                </div>
                <div>Punches found: <strong>{importResult.import.recordsFound}</strong> • Imported: <strong>{importResult.import.recordsImported}</strong> • Skipped: <strong>{importResult.import.recordsSkipped}</strong></div>
                <div>Employees auto-created: <strong>{importResult.import.employeesCreated}</strong> • Devices auto-created: <strong>{importResult.import.devicesCreated}</strong></div>
                {importResult.detectedTables?.length ? <div>Detected tables: <strong style={{ color: 'var(--text-heading)' }}>{importResult.detectedTables.join(', ')}</strong></div> : null}
                {importResult.import.message && <div style={{ color: 'var(--text-muted)' }}>{importResult.import.message}</div>}
                {importResult.import.status === 'PARTIAL' && <div style={{ color: 'var(--warning-ink)' }}>{importResult.import.message}</div>}
                {importResult.import.daySummary && (
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.6rem', marginTop: '0.2rem' }}>
                    <DayHandlingSummary summary={importResult.import.daySummary} compact onNavigate={onNavigate} />
                  </div>
                )}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Roster / employee-name CSV — attaches real names, department and shift to auto-created "Staff #NN" records */}
      <div style={card}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-heading)' }}>
          <IdCard size={16} color="var(--brand-primary-ink)" />
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
              <UploadCloud size={16} color={rosterRows ? 'var(--brand-primary-ink)' : 'var(--text-caption)'} />
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
            {canEdit && (
              <button className="island-btn" onClick={downloadRosterTemplate} disabled={busy === 'TEMPLATE'}>
                <span className="icon-orb">{busy === 'TEMPLATE' ? <Loader2 size={13} className="spin" /> : <Download size={13} />}</span>
                Master template
              </button>
            )}
          </div>

          {canEdit && setup.employeeCount > 0 && (
            <p style={{ fontSize: '0.72rem', color: 'var(--warning-ink)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <TriangleAlert size={13} /> {setup.employeeCount} employee(s) already on file — bulk upload is for first-time
              onboarding; add or edit individual staff in the Employees panel.
            </p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              className="btn-swaniki"
              onClick={previewRoster}
              disabled={rosterBusy || !rosterRows}
              style={{
                padding: '0.55rem 1.1rem', fontSize: '0.8125rem', fontWeight: 700, border: 'none', borderRadius: '0.5rem',
                cursor: !rosterRows || rosterBusy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                background: 'var(--brand-primary)',
                color: 'var(--on-primary)', opacity: !rosterRows || rosterBusy ? 0.5 : 1
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
                  background: 'rgba(16,185,129,0.14)', color: 'var(--brand-primary-ink)', opacity: rosterBusy ? 0.6 : 1,
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
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-caption)' }}>Departments</span>
              {setup.departments.map(d => (
                <code key={d.id} className="mono" style={{ fontSize: '0.6875rem', padding: '0.1rem 0.4rem', borderRadius: '0.35rem', background: 'var(--bg-surface-subtle)', color: 'var(--text-body)', border: '1px solid var(--border-color)' }}>{d.name}</code>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-caption)' }}>Shifts</span>
              {setup.shifts.map(s => (
                <code key={s.id} className="mono" style={{ fontSize: '0.6875rem', padding: '0.1rem 0.4rem', borderRadius: '0.35rem', background: 'var(--bg-surface-subtle)', color: 'var(--text-body)', border: '1px solid var(--border-color)' }}>{String(s.name).split(' (')[0]}</code>
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
          <RefreshCw size={16} color="var(--brand-primary-ink)" />
          Recent Sync Activity
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-subtle)' }}>
                {['Time', 'Source', 'Type', 'Status', 'Found', 'Imported', 'Skipped', 'Message', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '0.6rem 0.9rem', color: 'var(--text-caption)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.625rem', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan="9" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>No sync activity yet.</td></tr>
              )}
              {logs.map(l => {
                let daySum = null;
                try { daySum = l.day_summary ? JSON.parse(l.day_summary) : null; } catch { /* legacy run */ }
                const expanded = expandedLogId === l.id;
                return (
                  <React.Fragment key={l.id}>
                    <tr style={{ borderTop: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.6rem 0.9rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{l.started_at ? new Date(l.started_at).toLocaleString('en-IN') : '—'}</td>
                      <td style={{ padding: '0.6rem 0.9rem', fontWeight: 600, color: 'var(--text-heading)', whiteSpace: 'nowrap' }}>{l.source_name}</td>
                      <td style={{ padding: '0.6rem 0.9rem' }}><StatusBadge status={l.sync_type} /></td>
                      <td style={{ padding: '0.6rem 0.9rem' }}><StatusBadge status={l.status} /></td>
                      <td style={{ padding: '0.6rem 0.9rem', textAlign: 'center' }}>{l.records_found}</td>
                      <td style={{ padding: '0.6rem 0.9rem', textAlign: 'center', fontWeight: 700, color: 'var(--brand-primary-ink)' }}>{l.records_imported}</td>
                      <td style={{ padding: '0.6rem 0.9rem', textAlign: 'center', color: 'var(--text-muted)' }}>{l.records_skipped}</td>
                      <td style={{ padding: '0.6rem 0.9rem', color: 'var(--text-muted)', maxWidth: '320px' }}>
                        {l.message}
                        {daySum?.totals?.daysTouched ? (
                          <button
                            onClick={() => setExpandedLogId(expanded ? null : l.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', background: 'none', border: 'none', padding: 0, marginLeft: '0.4rem', cursor: 'pointer', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--brand-primary-ink)' }}
                          >
                            <ChevronRight size={12} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                            {expanded ? 'hide' : `${daySum.totals.daysTouched} day(s) handled`}
                          </button>
                        ) : null}
                      </td>
                      <td style={{ padding: '0.6rem 0.9rem', whiteSpace: 'nowrap' }}>
                        {l.reverted_at
                          ? <span style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>reverted {new Date(l.reverted_at).toLocaleDateString('en-IN')}</span>
                          : (canEdit && (l.tagged_punches || 0) > 0 ? (
                            <button
                              className="btn-swaniki"
                              style={{ ...miniBtn, color: 'var(--danger-ink)', border: '1px solid rgba(244,63,94,0.35)' }}
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
                    {expanded && daySum && (
                      <tr style={{ background: 'var(--bg-surface-subtle)' }}>
                        <td colSpan="9" style={{ padding: '0.75rem 0.9rem 0.9rem' }}>
                          <DayHandlingSummary summary={daySum} onNavigate={onNavigate} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Maintenance: recompute attendance from stored punches */}
      {canEdit && (
        <div style={card}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-heading)' }}>
            <Calculator size={16} color="var(--brand-primary-ink)" />
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
                  background: 'var(--brand-primary)',
                  color: 'var(--on-primary)', opacity: busy === 'RECOMPUTE' ? 0.6 : 1
                }}
              >
                {busy === 'RECOMPUTE' ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                {busy === 'RECOMPUTE' ? 'Recomputing…' : 'Recompute now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guided import: preview → confirm → processing → complete (all feedback in one modal) */}
      {preview && (
        <FilePreviewModal
          preview={preview}
          uploading={uploading}
          stage={runStage}
          outcome={runOutcome}
          runError={runError}
          elapsedMs={elapsedMs}
          progress={progress}
          onNavigate={onNavigate}
          onClose={closeRun}
          onConfirm={performImport}
        />
      )}

      {/* Manual sync reuses the same guided modal — skip the preview stage, go straight to progress */}
      {syncRun && (
        <FilePreviewModal
          preview={syncRun.preview}
          uploading={syncRun.stage === 'processing'}
          stage={syncRun.stage}
          outcome={syncRun.outcome}
          runError={syncRun.runError}
          elapsedMs={syncRun.elapsedMs}
          progress={syncRun.progress}
          processingTitle="Syncing your data source…"
          processingNote={<>Pulling the latest punches from <strong>{syncRun.preview.fileName}</strong> and rebuilding attendance. Please keep this window open.</>}
          doneTitle="Sync complete"
          errorTitle="Sync failed"
          onNavigate={onNavigate}
          onClose={closeSyncRun}
          onConfirm={syncRun.src ? () => handleSync(syncRun.src) : undefined}
        />
      )}

      {rosterGate && (
        <div className="modal-overlay" onClick={() => { setRosterGate(null); setRosterName(''); }}>
          <div className="modal-card" style={{ width: '100%', maxWidth: '30rem', padding: 0 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head" style={{ padding: '1rem 1.25rem' }}>
              <div>
                <span className="eyebrow" style={{ color: 'var(--warning-ink)' }}>First-time onboarding check</span>
                <h3 style={{ margin: 0 }}>Bulk roster upload?</h3>
              </div>
              <button className="icon-btn" onClick={() => { setRosterGate(null); setRosterName(''); }}><X size={17} /></button>
            </div>
            <div style={{ padding: '1rem 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
                <TriangleAlert size={17} style={{ color: 'var(--warning-ink)', flex: 'none', marginTop: 2 }} />
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.55, margin: 0 }}>
                  This path is meant for <strong>first-time onboarding</strong>. {setup.employeeCount} employee
                  {setup.employeeCount === 1 ? '' : 's'} already {setup.employeeCount === 1 ? 'exists' : 'exist'} in the
                  directory, so a bulk file can create duplicates or overwrite department / shift / salary values —
                  rows whose Biometric ID or Employee Code is already taken by someone else will be skipped with an error.
                  For one-off changes, use the <strong>Employees</strong> admin panel instead.
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button className="island-btn" onClick={() => { setRosterGate(null); setRosterName(''); }}>Cancel</button>
                <button className="island-btn is-active" onClick={confirmRosterGate}>
                  <UploadCloud size={13} /> Continue with {rosterGate.length} row{rosterGate.length === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          </div>
        </div>
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
  const headBg = 'var(--bg-surface-subtle)';
  return (
    <div style={{ overflow: 'auto', maxHeight: '52dvh', border: '1px solid var(--border-color)', borderRadius: '0.625rem' }}>
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
  green: { bg: 'rgba(16,185,129,0.14)', color: 'var(--brand-primary-ink)', border: 'rgba(4,120,87,0.3)' },
  amber: { bg: 'rgba(180,83,9,0.12)', color: 'var(--warning-ink)', border: 'rgba(180,83,9,0.28)' },
  red: { bg: 'rgba(185,28,28,0.12)', color: 'var(--danger-ink)', border: 'rgba(185,28,28,0.26)' },
  slate: { bg: 'rgba(100,116,139,0.14)', color: 'var(--text-muted)', border: 'rgba(100,116,139,0.3)' }
};

function ActionPill({ label, tone }) {
  const t = ACTION_TONE[tone] || ACTION_TONE.slate;
  return (
    <span style={{
      fontSize: '0.6875rem', fontWeight: 700, padding: '0.12rem 0.45rem', borderRadius: '9999px', textTransform: 'uppercase',
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
  const bg = 'var(--bg-surface)';
  const headBg = 'var(--bg-surface-subtle)';
  useEscapeClose(!busy, onClose);

  const columns = preview.columns.map(c => (c.key === 'status'
    ? { ...c, render: (v) => <ActionPill label={v} tone={actionTone(v)} /> }
    : c));

  const stats = [
    { label: 'Rows', value: preview.summary.total, color: 'var(--text-heading)' },
    { label: 'Will update', value: preview.summary.willUpdate, color: 'var(--brand-primary-ink)' },
    { label: 'Will create', value: preview.summary.willCreate, color: 'var(--warning-ink)' },
    { label: 'Errors', value: preview.summary.errors, color: preview.summary.errors ? 'var(--danger-ink)' : 'var(--text-muted)' }
  ];

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(1100px, 100%)', maxHeight: '92dvh', display: 'flex', flexDirection: 'column', background: bg, border: '1px solid var(--border-color)', borderRadius: '1rem', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="pill-badge pill-indigo" style={{ fontSize: '0.62rem' }}>ROSTER CSV</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Review before applying · nothing has been written yet</span>
            </div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-heading)' }}>Roster match preview</h2>
          </div>
          <button onClick={onClose} disabled={busy} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: busy ? 'not-allowed' : 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', padding: '1rem 1.4rem', borderBottom: '1px solid var(--border-color)' }}>
          {stats.map(s => (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-caption)', letterSpacing: '0.005em' }}>{s.label}</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', fontWeight: 600, color: s.color, lineHeight: 1, letterSpacing: '-0.02em' }}>{Number(s.value || 0).toLocaleString('en-IN')}</span>
            </div>
          ))}
        </div>

        <div style={{ padding: '1rem 1.4rem', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {/\(unknown\)/.test(JSON.stringify(preview.rows)) && (
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--warning-ink)', fontWeight: 600 }}>
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
            <button className="btn-swaniki" onClick={onApply} disabled={busy} style={{ background: 'var(--brand-primary)', color: 'var(--on-primary)', padding: '0.5rem 1.25rem', fontSize: '0.8125rem', fontWeight: 700, border: 'none', borderRadius: '0.5rem', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: busy ? 0.6 : 1 }}>
              {busy ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
              {busy ? 'Applying…' : 'Confirm & Apply'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Format a millisecond duration compactly (ms / s / m+s).
function formatDuration(ms) {
  const n = Math.max(0, Number(ms) || 0);
  if (n < 1000) return `${n} ms`;
  if (n < 60000) return `${(n / 1000).toFixed(1)} s`;
  return `${Math.floor(n / 60000)}m ${Math.round((n % 60000) / 1000)}s`;
}

// Guided import modal: preview (review + confirm) → processing (live progress) →
// done (ingestion summary + Close) | error (reason + retry/Close). All feedback
// lives inside this overlay so nothing is silently shown behind a closed modal.
function FilePreviewModal({ preview, uploading, stage = 'preview', outcome, runError, elapsedMs = 0, progress = null, processingTitle = 'Importing your file…', processingNote = null, doneTitle = 'Ingestion complete', errorTitle = 'Import failed', onNavigate, onClose, onConfirm }) {
  const [sheet, setSheet] = useState('punches');
  const hasEmployees = Array.isArray(preview.employees) && preview.employees.length > 0;
  useEscapeClose(!uploading, onClose);

  const bg = 'var(--bg-surface)';
  const headBg = 'var(--bg-surface-subtle)';
  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' };
  const cardBase = { width: 'min(1100px, 100%)', maxHeight: '92dvh', display: 'flex', flexDirection: 'column', background: bg, border: '1px solid var(--border-color)', borderRadius: '1rem', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' };

  const primaryBtn = (extra = {}) => ({ background: 'var(--brand-primary)', color: 'var(--on-primary)', padding: '0.55rem 1.4rem', fontSize: '0.8125rem', fontWeight: 700, border: 'none', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.45rem', ...extra });
  const ghostBtn = { background: 'transparent', color: 'var(--text-muted)', padding: '0.5rem 1rem', fontSize: '0.8125rem', fontWeight: 600, border: '1px solid var(--border-color)', borderRadius: '0.5rem', cursor: 'pointer' };

  // ── Processing / Done / Error: compact centered panels ────────────────
  if (stage !== 'preview') {
    const imp = outcome?.import || {};
    const dupCount = Array.isArray(imp.duplicatePunches) ? imp.duplicatePunches.length : (imp.daySummary?.totals?.duplicatePunches || 0);
    const durMs = outcome?.durationMs ?? imp.durationMs ?? elapsedMs;
    const statusColor = imp.status === 'PARTIAL' ? 'var(--warning-ink)' : 'var(--brand-primary-ink)';
    const stat = (label, value, color = 'var(--text-heading)') => (
      <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
        <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-caption)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 600, color, lineHeight: 1, letterSpacing: '-0.02em' }}>
          {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
        </span>
      </div>
    );
    return (
      <div onClick={uploading ? undefined : onClose} style={overlay}>
        <div onClick={e => e.stopPropagation()} style={{ ...cardBase, width: 'min(680px, 100%)' }}>
          {/* PROCESSING */}
          {stage === 'processing' && (() => {
            const imported = progress?.imported ?? 0;
            const found = (progress?.found ?? preview.totalRows ?? 0) || 0;
            const pct = found > 0 ? Math.min(100, Math.round((imported / found) * 100)) : 0;
            const barPct = Math.max(pct, imported > 0 ? pct : 5); // a sliver before the first count
            return (
              <div style={{ padding: '2.25rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.15rem', textAlign: 'center' }}>
                <Loader2 size={38} className="spin" style={{ color: 'var(--brand-primary-ink)' }} />
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-heading)' }}>{processingTitle}</h2>
                {/* Big live count */}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.4rem' }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: '2.6rem', fontWeight: 800, color: 'var(--brand-primary-ink)', lineHeight: 1, letterSpacing: '-0.03em' }}>
                    {imported.toLocaleString('en-IN')}
                  </span>
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    / {found.toLocaleString('en-IN')}
                  </span>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.08em', marginLeft: '0.3rem' }}>records</span>
                </div>
                {/* Progress bar */}
                <div style={{ width: '100%', maxWidth: '30rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ width: '100%', height: '0.7rem', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barPct}%`, background: 'linear-gradient(90deg, var(--brand-primary), var(--brand-primary-ink))', borderRadius: '9999px', transition: 'width 0.35s cubic-bezier(0.22, 1, 0.36, 1)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--brand-primary-ink)' }}>{pct}% ingested</span>
                    <span className="mono">{formatDuration(elapsedMs)}</span>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '30rem' }}>
                  {processingNote || <>Writing <strong>{(preview.totalRows || 0).toLocaleString('en-IN')}</strong> punch rows and rebuilding attendance for
                    {' '}{(preview.distinctUsers || 0).toLocaleString('en-IN')} staff. Please keep this window open.</>}
                </p>
              </div>
            );
          })()}

          {/* DONE */}
          {stage === 'done' && (
            <>
              <div style={{ padding: '1.6rem 1.75rem 0.9rem', textAlign: 'center', background: 'rgba(16,185,129,0.07)', borderBottom: '1px solid var(--border-color)' }}>
                <CheckCircle2 size={38} style={{ color: 'var(--brand-primary-ink)' }} />
                <h2 style={{ margin: '0.5rem 0 0.15rem', fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-heading)' }}>{doneTitle}</h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {preview.fileName} · finished in <strong style={{ color: statusColor }}>{formatDuration(durMs)}</strong>
                </div>
              </div>
              <div style={{ padding: '1.1rem 1.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.9rem', borderBottom: '1px solid var(--border-color)' }}>
                {stat('Punches imported', imp.recordsImported || 0, 'var(--brand-primary-ink)')}
                {stat('New punches', imp.newPunches || 0)}
                {stat('Already recorded', dupCount, 'var(--text-muted)')}
                {stat('Skipped', imp.recordsSkipped || 0, imp.recordsSkipped ? 'var(--warning-ink)' : 'var(--text-muted)')}
                {stat('Staff matched', imp.employeesMatched || 0)}
                {stat('Staff auto-created', imp.employeesCreated || 0, imp.employeesCreated ? 'var(--warning-ink)' : 'var(--brand-primary-ink)')}
              </div>
              <div style={{ padding: '0.9rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  {imp.dateFrom && <span>Date range: <strong style={{ color: 'var(--text-heading)' }}>{String(imp.dateFrom).slice(0, 10)} → {String(imp.dateTo).slice(0, 10)}</strong></span>}
                  {imp.devicesCreated ? <span>Devices created: <strong style={{ color: 'var(--text-heading)' }}>{imp.devicesCreated}</strong></span> : null}
                </div>
                {imp.message && <div style={{ fontSize: '0.78rem', color: imp.status === 'PARTIAL' ? 'var(--warning-ink)' : 'var(--text-muted)' }}>{imp.message}</div>}
                {imp.daySummary && (
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.7rem' }}>
                    <DayHandlingSummary summary={imp.daySummary} compact onNavigate={onNavigate} />
                  </div>
                )}
              </div>
              <div style={{ padding: '1rem 1.75rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', background: headBg }}>
                <button className="btn-swaniki" onClick={onClose} style={primaryBtn()}>Close</button>
              </div>
            </>
          )}

          {/* ERROR */}
          {stage === 'error' && (
            <>
              <div style={{ padding: '1.8rem 1.75rem 1rem', textAlign: 'center', background: 'rgba(185,28,28,0.08)', borderBottom: '1px solid var(--border-color)' }}>
                <XCircle size={38} style={{ color: 'var(--danger-ink)' }} />
                <h2 style={{ margin: '0.5rem 0 0.15rem', fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-heading)' }}>{errorTitle}</h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{preview.fileName}</div>
              </div>
              <div style={{ padding: '1.2rem 1.75rem', fontSize: '0.85rem', color: 'var(--danger-ink)', lineHeight: 1.6 }}>
                {runError || 'Something went wrong while importing this file.'}
              </div>
              <div style={{ padding: '1rem 1.75rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', background: headBg }}>
                <button className="btn-swaniki" onClick={onClose} style={{ ...ghostBtn, background: 'transparent' }}>Close</button>
                <button className="btn-swaniki" onClick={onConfirm} style={primaryBtn()}>
                  <RefreshCw size={15} /> Try again
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Preview stage: review the decoded rows before confirming ──────────
  const stats = [
    { label: 'Rows', value: preview.totalRows, color: 'var(--text-heading)' },
    { label: 'Distinct users', value: preview.distinctUsers, color: 'var(--text-heading)' },
    { label: 'Matched employees', value: preview.knownUsers, color: 'var(--brand-primary-ink)' },
    { label: 'New (will be created)', value: preview.newUsers, color: preview.newUsers > 0 ? 'var(--warning-ink)' : 'var(--brand-primary-ink)' }
  ];
  if (preview.skippedRows) stats.push({ label: 'Skipped rows', value: preview.skippedRows, color: 'var(--danger-ink)' });
  const empColumns = [{ key: 'biometricUserId', label: 'User ID' }, { key: 'fullName', label: 'Name' }, { key: 'known', label: 'Employee' }];

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={e => e.stopPropagation()} style={cardBase}>
        {/* Header */}
        <div style={{ padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="pill-badge pill-indigo" style={{ fontSize: '0.62rem' }}>{preview.format === 'ATTLOG' ? 'ATTLOG .dat' : 'SQL FILE'}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Review before import · nothing has been written yet</span>
            </div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-heading)' }}>
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
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-caption)', letterSpacing: '0.005em' }}>{s.label}</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', fontWeight: 600, color: s.color, lineHeight: 1, letterSpacing: '-0.02em' }}>{Number(s.value || 0).toLocaleString('en-IN')}</span>
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
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--warning-ink)', fontWeight: 600 }}>
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
          <button className="btn-swaniki" onClick={onClose} disabled={uploading} style={ghostBtn}>
            Cancel
          </button>
          <button className="btn-swaniki" onClick={onConfirm} disabled={uploading} style={primaryBtn({ opacity: uploading ? 0.6 : 1, cursor: uploading ? 'not-allowed' : 'pointer' })}>
            <CheckCircle2 size={15} /> Confirm &amp; Import
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