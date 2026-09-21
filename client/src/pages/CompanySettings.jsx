import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useOrganization } from '../context/OrganizationContext';
import { useAuth } from '../context/AuthContext';
import {
  Building2, Save, CheckCircle2, XCircle, Loader2, Globe2, UserCog, FileCheck2, Phone
} from 'lucide-react';

const emptyForm = {
  name: '', tagline: '', industry_label: 'Workforce',
  address: '', gstin: '', registration_no: '',
  contact_person: '', contact_phone: '', contact_email: '',
  director_name: '', director_title: 'Managing Director'
};

export default function CompanySettings() {
  const { isDark } = useTheme();
  const { currentRole } = useAuth();
  const { org, refreshOrg } = useOrganization();
  const [form, setForm] = useState(emptyForm);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (org) {
      setForm({
        name: org.name || '', tagline: org.tagline || '', industry_label: org.industry_label || 'Workforce',
        address: org.address || '', gstin: org.gstin || '', registration_no: org.registration_no || '',
        contact_person: org.contact_person || '', contact_phone: org.contact_phone || '', contact_email: org.contact_email || '',
        director_name: org.director_name || '', director_title: org.director_title || 'Managing Director'
      });
      setLoaded(true);
    }
  }, [org]);

  const notify = (msg, isErr = false) => {
    setError(isErr ? msg : null);
    setMessage(isErr ? null : msg);
    setTimeout(() => { setMessage(null); setError(null); }, 6000);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/v1/organization/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.success) {
        notify('Company settings saved. Branding will update across the app.', false);
        if (data.settings) {
          setForm({
            name: data.settings.name, tagline: data.settings.tagline, industry_label: data.settings.industry_label,
            address: data.settings.address, gstin: data.settings.gstin, registration_no: data.settings.registration_no,
            contact_person: data.settings.contact_person, contact_phone: data.settings.contact_phone,
            contact_email: data.settings.contact_email, director_name: data.settings.director_name,
            director_title: data.settings.director_title || 'Managing Director'
          });
        }
        refreshOrg();
      } else {
        notify(data.error || 'Failed to save settings', true);
      }
    } catch (err) {
      notify(`Error: ${err.message}`, true);
    } finally {
      setSaving(false);
    }
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

  const fieldGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '900px' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.35rem' }}>
          <span className="pill-badge pill-indigo" style={{ fontSize: '0.6875rem' }}>GENERIC PRODUCT</span>
          <span className="eyebrow-italic">Company Identity & Branding</span>
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-heading)', letterSpacing: '-0.03em' }}>
          Company <em style={{ fontStyle: 'italic', color: isDark ? 'var(--brand-cyan)' : 'var(--brand-indigo)' }}>Settings</em>
        </h1>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
          These details drive every branded surface — the app title in the sidebar & top bar, payslip letterhead,
          bank NEFT narration and export file names. Any industry works: hospital, IT services, agencies, manufacturing.
        </p>
      </div>

      {currentRole !== 'SUPER_ADMIN' && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '0.75rem', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', fontSize: '0.8125rem', color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <XCircle size={16} /> Only a Super Admin can edit company settings.
        </div>
      )}

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

      <form onSubmit={handleSave} style={{
        background: isDark ? '#111318' : '#ffffff', border: '1px solid var(--border-color)', borderRadius: '0.875rem',
        display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '1rem' }}>
            <Building2 size={16} color="#6366f1" /> Company Identity
          </div>
          <div style={fieldGrid}>
            <div>
              <label style={labelStyle}>Company Name</label>
              <input style={inputStyle} required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. TechNova Solutions Pvt Ltd" />
            </div>
            <div>
              <label style={labelStyle}>Industry Label</label>
              <input style={inputStyle} value={form.industry_label} onChange={e => setForm({ ...form, industry_label: e.target.value })} placeholder="e.g. IT Services / Healthcare / Logistics" />
            </div>
            <div>
              <label style={labelStyle}>Tagline</label>
              <input style={inputStyle} value={form.tagline} onChange={e => setForm({ ...form, tagline: e.target.value })} placeholder="e.g. Biometric Workforce & Payroll Suite" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Registered Address</label>
              <input style={inputStyle} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Street, City, State, PIN" />
            </div>
            <div>
              <label style={labelStyle}>GSTIN</label>
              <input style={inputStyle} value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value })} placeholder="e.g. 29ABCDE1234F1Z5" />
            </div>
            <div>
              <label style={labelStyle}>Registration No.</label>
              <input style={inputStyle} value={form.registration_no} onChange={e => setForm({ ...form, registration_no: e.target.value })} placeholder="e.g. CIN / MSME Reg." />
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '1rem' }}>
            <UserCog size={16} color="#10b981" /> Signatories & Contact
          </div>
          <div style={fieldGrid}>
            <div>
              <label style={labelStyle}>Director / Owner Name</label>
              <input style={inputStyle} value={form.director_name} onChange={e => setForm({ ...form, director_name: e.target.value })} placeholder="e.g. A. Sharma" />
            </div>
            <div>
              <label style={labelStyle}>Director Title</label>
              <input style={inputStyle} value={form.director_title} onChange={e => setForm({ ...form, director_title: e.target.value })} placeholder="e.g. Chief Executive Officer" />
            </div>
            <div>
              <label style={labelStyle}>Contact Person (HR)</label>
              <input style={inputStyle} value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} placeholder="e.g. HR Manager" />
            </div>
            <div>
              <label style={labelStyle}>Contact Phone <Phone size={11} style={{ verticalAlign: '-1px' }} /></label>
              <input style={inputStyle} value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} placeholder="+91 ..." />
            </div>
            <div>
              <label style={labelStyle}>Contact Email</label>
              <input style={inputStyle} type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} placeholder="hr@company.com" />
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <FileCheck2 size={14} />
            Previews on the payslip letterhead, bank NEFT narration & export file names.
          </div>
          <button
            type="submit"
            className="btn-swaniki"
            style={{
              padding: '0.6rem 1.4rem', fontSize: '0.8125rem', fontWeight: 700, border: 'none', borderRadius: '0.5rem',
              cursor: 'pointer', background: isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)',
              color: isDark ? '#0a0c10' : '#ffffff', display: 'flex', alignItems: 'center', gap: '0.4rem'
            }}
            disabled={saving || !loaded}
          >
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}