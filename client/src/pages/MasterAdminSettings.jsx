import React, { useState, useEffect, useCallback } from 'react';
import {
  Crown, Plus, Building2, Mail, Phone, MapPin, Users, Briefcase, Loader2,
  Check, X, Search, ChevronRight, Shield, Trash2, Power, PowerOff,
  Globe, Hash, UserPlus, Clock, AlertTriangle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// ─── Status pill colours ───────────────────────────────────────────
const STATUS_PILL = { ACTIVE: 'status-ok', SUSPENDED: 'status-bad' };

export default function MasterAdminSettings() {
  const { authFetch, user } = useAuth();
  const api = useCallback(
    (path, opts = {}) =>
      authFetch(path, opts)
        .then(r => r.json())
        .then(d => (d.success ? d : { success: false, error: d.error || d.message })),
    [authFetch]
  );

  // ── State ──────────────────────────────────────────────────────────
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const blankForm = {
    companyName: '', industry: '', adminEmail: '', adminName: '',
    phone: '', address: '', employeeCount: ''
  };
  const [form, setForm] = useState(blankForm);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 4000); };
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  // ── Data loading ───────────────────────────────────────────────────
  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api('/api/v1/tenant/list');
      if (d.success) setTenants(d.tenants || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [api]);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  // ── Actions ────────────────────────────────────────────────────────
  const createTenant = async (e) => {
    e.preventDefault();
    if (!form.companyName.trim()) return;
    setSaving(true);
    try {
      const d = await api('/api/v1/tenant/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (d.success) {
        flash(`✓ "${form.companyName}" provisioned successfully`);
        setForm(blankForm);
        setShowForm(false);
        loadTenants();
      } else {
        alert(d.error || 'Failed to create tenant');
      }
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (tenant) => {
    const newStatus = tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setBusyId(tenant.id);
    try {
      const d = await api(`/api/v1/tenant/${tenant.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (d.success) {
        flash(`${tenant.company_name} is now ${newStatus.toLowerCase()}`);
        loadTenants();
      } else alert(d.error || 'Failed');
    } catch (err) { alert(err.message); }
    finally { setBusyId(null); }
  };

  const deleteTenant = async (tenant) => {
    setBusyId(tenant.id);
    try {
      const d = await api(`/api/v1/tenant/${tenant.id}`, { method: 'DELETE' });
      if (d.success) {
        flash(`"${tenant.company_name}" removed`);
        setConfirmDelete(null);
        loadTenants();
      } else alert(d.error || 'Failed');
    } catch (err) { alert(err.message); }
    finally { setBusyId(null); }
  };

  // ── Filtered list ──────────────────────────────────────────────────
  const q = search.toLowerCase();
  const filtered = tenants.filter(t =>
    (t.company_name || '').toLowerCase().includes(q) ||
    (t.admin_email || '').toLowerCase().includes(q) ||
    (t.industry || '').toLowerCase().includes(q)
  );

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="page">
      {msg && (
        <div className="demo-banner" style={{ borderColor: 'rgba(16,185,129,.4)', background: 'var(--brand-primary-light)', color: 'var(--brand-primary-ink)' }}>
          {msg}
        </div>
      )}

      {/* ── Page header ── */}
      <div className="page-head">
        <div className="page-title-wrap">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Crown size={22} style={{ color: 'var(--amber-500, #f59e0b)' }} />
            Master Admin Settings
          </h1>
          <span className="page-desc">
            Provision new companies, manage client deployments, and control platform access.
          </span>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
            {showForm ? <X size={15} /> : <Plus size={15} />}
            {showForm ? 'Cancel' : 'New Client'}
          </button>
        </div>
      </div>

      {/* ── Platform stats strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div className="section-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 40, height: 40, borderRadius: '0.75rem', background: 'linear-gradient(135deg, var(--brand-primary-light) 0%, var(--brand-primary) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
            <Building2 size={18} />
          </div>
          <div>
            <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, lineHeight: 1 }}>{tenants.length}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-caption)', marginTop: 2 }}>Total Clients</div>
          </div>
        </div>
        <div className="section-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 40, height: 40, borderRadius: '0.75rem', background: 'linear-gradient(135deg, #d1fae5 0%, #10b981 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
            <Power size={18} />
          </div>
          <div>
            <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, lineHeight: 1 }}>{tenants.filter(t => t.status === 'ACTIVE').length}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-caption)', marginTop: 2 }}>Active</div>
          </div>
        </div>
        <div className="section-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 40, height: 40, borderRadius: '0.75rem', background: 'linear-gradient(135deg, #fee2e2 0%, #ef4444 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
            <PowerOff size={18} />
          </div>
          <div>
            <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, lineHeight: 1 }}>{tenants.filter(t => t.status === 'SUSPENDED').length}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-caption)', marginTop: 2 }}>Suspended</div>
          </div>
        </div>
        <div className="section-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 40, height: 40, borderRadius: '0.75rem', background: 'linear-gradient(135deg, #e0e7ff 0%, #6366f1 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
            <Shield size={18} />
          </div>
          <div>
            <div className="mono" style={{ fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.2, wordBreak: 'break-all' }}>{user?.email}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-caption)', marginTop: 2 }}>Master Admin</div>
          </div>
        </div>
      </div>

      {/* ── New client form ── */}
      {showForm && (
        <section className="section-card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--brand-primary)' }}>
          <div className="section-head">
            <span className="section-title"><UserPlus size={16} /> Provision New Client</span>
          </div>
          <form onSubmit={createTenant}>
            <div className="section-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.875rem' }}>
              <div className="field">
                <label className="field-label"><Building2 size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Company Name *</label>
                <input className="input" placeholder="e.g. Acme Healthcare Pvt Ltd" value={form.companyName} onChange={set('companyName')} required autoFocus />
              </div>
              <div className="field">
                <label className="field-label"><Briefcase size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Industry</label>
                <input className="input" placeholder="e.g. Hospital & Healthcare" value={form.industry} onChange={set('industry')} />
              </div>
              <div className="field">
                <label className="field-label"><Mail size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Admin Email</label>
                <input className="input" type="email" placeholder="admin@company.com" value={form.adminEmail} onChange={set('adminEmail')} />
              </div>
              <div className="field">
                <label className="field-label"><Users size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Admin Name</label>
                <input className="input" placeholder="HR Admin full name" value={form.adminName} onChange={set('adminName')} />
              </div>
              <div className="field">
                <label className="field-label"><Phone size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Phone</label>
                <input className="input" placeholder="+91 98765 43210" value={form.phone} onChange={set('phone')} />
              </div>
              <div className="field">
                <label className="field-label"><MapPin size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Address</label>
                <input className="input" placeholder="City, State" value={form.address} onChange={set('address')} />
              </div>
              <div className="field">
                <label className="field-label"><Hash size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Est. Employee Count</label>
                <input className="input" type="number" min="0" placeholder="50" value={form.employeeCount} onChange={set('employeeCount')} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', padding: '0.75rem 1rem 0.5rem' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowForm(false); setForm(blankForm); }}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !form.companyName.trim()}>
                {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Deploy Client
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ── Search bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <div className="login-field" style={{ flex: 1, maxWidth: 380, margin: 0 }}>
          <Search size={15} className="login-field-icon" />
          <input type="text" placeholder="Search clients by name, email, or industry…" value={search} onChange={e => setSearch(e.target.value)} style={{ background: 'transparent', border: 'none', outline: 'none', width: '100%', padding: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-primary)' }} />
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>
          {filtered.length} of {tenants.length} client{tenants.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Client list ── */}
      {loading ? (
        <div className="loading-state"><Loader2 size={24} className="spin" /><p>Loading clients…</p></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state" style={{ padding: '3rem 1rem' }}>
          <Globe size={36} style={{ color: 'var(--text-caption)', marginBottom: '0.75rem' }} />
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            {tenants.length === 0
              ? 'No clients provisioned yet. Click "New Client" to deploy your first company.'
              : 'No clients match your search.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {filtered.map(t => {
            const isExpanded = expandedId === t.id;
            const isBusy = busyId === t.id;
            return (
              <section key={t.id} className="section-card" style={{ overflow: 'hidden', transition: 'box-shadow 0.2s', ...(isExpanded ? { boxShadow: '0 0 0 2px var(--brand-primary)' } : {}) }}>
                {/* Summary row */}
                <button
                  type="button"
                  className="section-head"
                  onClick={() => setExpandedId(isExpanded ? null : t.id)}
                  style={{ cursor: 'pointer', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: '0.625rem', background: t.status === 'ACTIVE' ? 'linear-gradient(135deg, #d1fae5 0%, #10b981 100%)' : 'linear-gradient(135deg, #fee2e2 0%, #ef4444 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, fontSize: '0.8rem', fontWeight: 700 }}>
                    {(t.company_name || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', lineHeight: 1.3, color: 'var(--text-primary)' }}>{t.company_name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-caption)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: 2 }}>
                      {t.industry && <span>{t.industry}</span>}
                      {t.admin_email && <span><Mail size={11} style={{ verticalAlign: '-1px' }} /> {t.admin_email}</span>}
                      {t.address && <span><MapPin size={11} style={{ verticalAlign: '-1px' }} /> {t.address}</span>}
                    </div>
                  </div>
                  <span className={`status-pill ${STATUS_PILL[t.status] || 'status-muted'}`} style={{ flexShrink: 0, textTransform: 'capitalize' }}>
                    {(t.status || 'unknown').toLowerCase()}
                  </span>
                  <ChevronRight size={16} style={{ color: 'var(--text-caption)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none', flexShrink: 0 }} />
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '1rem', background: 'var(--surface-raised, var(--bg-card))', animation: 'fadeIn 0.15s ease' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                      <div>
                        <span className="field-label" style={{ fontSize: '0.7rem' }}>Tenant ID</span>
                        <div className="mono" style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}>{t.id}</div>
                      </div>
                      <div>
                        <span className="field-label" style={{ fontSize: '0.7rem' }}>Admin Name</span>
                        <div style={{ fontSize: '0.8125rem' }}>{t.admin_name || '—'}</div>
                      </div>
                      <div>
                        <span className="field-label" style={{ fontSize: '0.7rem' }}>Phone</span>
                        <div style={{ fontSize: '0.8125rem' }}>{t.phone || '—'}</div>
                      </div>
                      <div>
                        <span className="field-label" style={{ fontSize: '0.7rem' }}>Est. Employees</span>
                        <div style={{ fontSize: '0.8125rem' }}>{t.employee_count || '—'}</div>
                      </div>
                      <div>
                        <span className="field-label" style={{ fontSize: '0.7rem' }}>Created</span>
                        <div style={{ fontSize: '0.8125rem' }}><Clock size={12} style={{ verticalAlign: '-1px', marginRight: 3 }} />{t.created_at ? new Date(t.created_at).toLocaleString() : '—'}</div>
                      </div>
                      <div>
                        <span className="field-label" style={{ fontSize: '0.7rem' }}>Last Updated</span>
                        <div style={{ fontSize: '0.8125rem' }}>{t.updated_at ? new Date(t.updated_at).toLocaleString() : '—'}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button
                        className={`btn btn-sm ${t.status === 'ACTIVE' ? 'btn-ghost' : 'btn-primary'}`}
                        onClick={() => toggleStatus(t)}
                        disabled={isBusy}
                      >
                        {isBusy ? <Loader2 size={13} className="spin" /> : t.status === 'ACTIVE' ? <PowerOff size={13} /> : <Power size={13} />}
                        {t.status === 'ACTIVE' ? ' Suspend' : ' Reactivate'}
                      </button>

                      {confirmDelete === t.id ? (
                        <>
                          <span style={{ fontSize: '0.78rem', color: 'var(--danger-ink, #ef4444)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <AlertTriangle size={13} /> Confirm delete?
                          </span>
                          <button className="btn btn-rose btn-sm" onClick={() => deleteTenant(t)} disabled={isBusy}>
                            {isBusy ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />} Yes, delete
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger-ink, #ef4444)' }} onClick={() => setConfirmDelete(t.id)}>
                          <Trash2 size={13} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
