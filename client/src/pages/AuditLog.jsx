// client/src/pages/AuditLog.jsx
// Admin-only audit trail viewer: filtered + paginated table of every mutating
// action, a JSON detail viewer, and CSV export. Gated by the AUDIT_VIEW perm.
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollText, Download, Search, X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 50;

// 'leave.approve' -> 'leave' group, shown as a compact badge.
const actionGroup = (action = '') => action.split('.')[0] || 'other';

const GROUP_TONE = {
  auth: 'status-bad', attendance: 'status-ok', leave: 'status-warn', payroll: 'status-ok',
  employee: 'status-warn', access: 'status-bad', settings: 'status-muted', organization: 'status-muted',
  device: 'status-muted', role: 'status-bad', audit: 'status-muted', import: 'status-muted'
};

function fmtTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
}

export default function AuditLog() {
  const { authFetch } = useAuth();
  const api = useCallback((path, opts = {}) => authFetch(path, opts).then(r => r.json()).then(d => (d.success ? d : { success: false, error: d.error || d.message })), [authFetch]);

  const [filters, setFilters] = useState({ from: '', to: '', actor: '', action: '', entityType: '', q: '' });
  const [actions, setActions] = useState([]);
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const load = useCallback(async (off = 0, filterOverride) => {
    setLoading(true);
    const f = filterOverride || filters;
    try {
      const p = new URLSearchParams();
      Object.entries(f).forEach(([k, v]) => v && p.set(k, v));
      p.set('limit', PAGE_SIZE);
      p.set('offset', off);
      const d = await api(`/api/v1/audit?${p}`);
      if (d.success) { setEntries(d.entries); setTotal(d.total); setOffset(d.offset); }
      else alert(d.error || 'Failed to load audit log');
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  }, [api, filters]);

  useEffect(() => { load(0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { api('/api/v1/audit/actions').then(d => d.success && setActions(d.actions)); }, [api]);

  const applyFilters = () => load(0);
  const clearFilters = () => {
    const blank = { from: '', to: '', actor: '', action: '', entityType: '', q: '' };
    setFilters(blank);
    load(0, blank);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const p = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
      const res = await authFetch(`/api/v1/audit/export?${p}`);
      if (!res.ok) { alert('Export failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `myhr_audit_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(err.message); }
    finally { setExporting(false); }
  };

  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title-wrap">
          <h1><ScrollText size={20} style={{ verticalAlign: '-3px', marginRight: 8 }} />Audit Log</h1>
          <span className="page-desc">Every administrative and workflow action &mdash; {total.toLocaleString()} entr{total === 1 ? 'y' : 'ies'} recorded.</span>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={exporting}>
            {exporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />} Export CSV
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <section className="section-card" style={{ padding: '0.9rem 1.1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'end' }}>
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="field-label">From</span>
            <input type="date" className="input" value={filters.from} onChange={e => set('from', e.target.value)} />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="field-label">To</span>
            <input type="date" className="input" value={filters.to} onChange={e => set('to', e.target.value)} />
          </label>
          <label className="field" style={{ marginBottom: 0, minWidth: 140 }}>
            <span className="field-label">Actor</span>
            <input type="text" className="input" placeholder="Name or email" value={filters.actor} onChange={e => set('actor', e.target.value)} onKeyDown={e => e.key === 'Enter' && applyFilters()} />
          </label>
          <label className="field" style={{ marginBottom: 0, minWidth: 160 }}>
            <span className="field-label">Action</span>
            <select className="input" value={filters.action} onChange={e => set('action', e.target.value)}>
              <option value="">All actions</option>
              {actions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="field" style={{ marginBottom: 0, minWidth: 130 }}>
            <span className="field-label">Entity</span>
            <input type="text" className="input" placeholder="e.g. leave, payslip" value={filters.entityType} onChange={e => set('entityType', e.target.value)} onKeyDown={e => e.key === 'Enter' && applyFilters()} />
          </label>
          <label className="field" style={{ marginBottom: 0, flex: '1 1 160px', minWidth: 160 }}>
            <span className="field-label">Search</span>
            <input type="text" className="input" placeholder="Summary text or entity id" value={filters.q} onChange={e => set('q', e.target.value)} onKeyDown={e => e.key === 'Enter' && applyFilters()} />
          </label>
          <button className="btn btn-primary btn-sm" onClick={applyFilters} disabled={loading}>
            {loading ? <Loader2 size={14} className="spin" /> : <Search size={14} />} Filter
          </button>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}><X size={14} /> Clear</button>
          )}
        </div>
      </section>

      {/* Table */}
      <section className="section-card">
        <div className="table-wrap">
          <table className="swaniki-table">
            <thead>
              <tr>
                <th>Timestamp</th><th>Actor</th><th>Action</th><th>Entity</th><th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} onClick={() => setSelected(e)} style={{ cursor: 'pointer' }}>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtTs(e.ts)}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{e.actor_name || '—'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{e.actor_role || 'system'}</div>
                  </td>
                  <td>
                    <span className={`status-pill ${GROUP_TONE[actionGroup(e.action)] || 'status-muted'}`}>{e.action}</span>
                  </td>
                  <td>
                    {e.entity_type || '—'}
                    {e.entity_id && <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-caption)' }}>{String(e.entity_id).slice(0, 24)}</div>}
                  </td>
                  <td style={{ maxWidth: 380 }}>{e.summary || '—'}</td>
                </tr>
              ))}
              {!loading && entries.length === 0 && (
                <tr><td colSpan={5}><div className="empty-state">No audit entries match these filters.</div></td></tr>
              )}
              {loading && entries.length === 0 && (
                <tr><td colSpan={5}><div className="empty-state"><Loader2 size={16} className="spin" /> Loading…</div></td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-caption)' }}>
            {total === 0 ? 'No entries' : `Showing ${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total.toLocaleString()}`}
          </span>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" disabled={offset === 0 || loading} onClick={() => load(Math.max(offset - PAGE_SIZE, 0))}>
              <ChevronLeft size={14} /> Prev
            </button>
            <span style={{ fontSize: '0.8rem' }}>Page {page} / {pages}</span>
            <button className="btn btn-ghost btn-sm" disabled={offset + PAGE_SIZE >= total || loading} onClick={() => load(offset + PAGE_SIZE)}>
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* Detail modal */}
      {selected && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setSelected(null)}
        >
          <div
            className="section-card"
            style={{ width: 'min(640px, 100%)', maxHeight: '80vh', overflow: 'auto', padding: '1.25rem' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
              <div>
                <span className={`status-pill ${GROUP_TONE[actionGroup(selected.action)] || 'status-muted'}`}>{selected.action}</span>
                <h3 style={{ margin: '0.4rem 0 0', fontSize: '1rem' }}>{selected.summary || 'No summary'}</h3>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}><X size={14} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem 1rem', fontSize: '0.82rem', marginBottom: '0.9rem' }}>
              <div><b>When:</b> {fmtTs(selected.ts)}</div>
              <div><b>Actor:</b> {selected.actor_name || '—'} {selected.actor_role ? `(${selected.actor_role})` : ''}</div>
              <div><b>Entity:</b> {selected.entity_type || '—'} {selected.entity_id ? `#${String(selected.entity_id).slice(0, 30)}` : ''}</div>
              <div><b>IP:</b> <span className="mono">{selected.ip || '—'}</span></div>
            </div>
            <div className="field-label" style={{ marginBottom: '0.35rem' }}>Details</div>
            <pre className="mono" style={{ background: 'rgba(127,127,127,0.1)', borderRadius: 10, padding: '0.8rem', fontSize: '0.75rem', overflow: 'auto', margin: 0 }}>
              {(() => { try { return JSON.stringify(typeof selected.details === 'string' ? JSON.parse(selected.details) : (selected.details || {}), null, 2); } catch { return String(selected.details ?? '{}'); } })()}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
