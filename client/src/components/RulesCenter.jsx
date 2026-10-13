// client/src/components/RulesCenter.jsx
// The "Rules" heart of the Admin Panel (PagarGuru-style): per-company policies
// for attendance, overtime, holidays and statutory math. Each section owns its
// own fetch/save lifecycle so the hub stays responsive and Settings.jsx doesn't
// grow any bigger. Empty numeric field => company default (shown in the hint).
import React, { useState, useEffect, useCallback } from 'react';
import {
  Save, Loader2, Check, Plus, Trash2, CalendarDays, Timer, Scale, Gavel, X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { dialogConfirm } from '../utils/dialog';

function useRuleApi() {
  const { authFetch } = useAuth();
  return useCallback((path, opts = {}) =>
    authFetch(path, opts)
      .then(r => r.json())
      .then(d => (d.success !== false ? d : Promise.reject(new Error(d.error || 'Request failed'))))
      .catch(e => ({ __error: e.message })), [authFetch]);
}

const inputStyle = { fontSize: '0.8125rem' };

function NumField({ label, hint, value, onChange, step = '1', min, max, disabled }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <input className="input" style={inputStyle} type="number" step={step} min={min} max={max}
        value={value} disabled={disabled} onChange={e => onChange(e.target.value)} />
      {hint && <span style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>{hint}</span>}
    </div>
  );
}

function SectionShell({ icon: Icon, title, subtitle, children, onSave, saving, saved, saveLabel = 'Save rules' }) {
  return (
    <section className="section-card">
      <div className="section-head">
        <span className="section-title"><Icon size={16} /> {title}</span>
        {onSave && (
          <button className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 size={15} className="spin" /> : saved ? <Check size={15} /> : <Save size={15} />} {saved ? 'Saved' : saveLabel}
          </button>
        )}
      </div>
      <div className="section-body">
        {subtitle && <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '0 0 1rem', maxWidth: '52rem', lineHeight: 1.6 }}>{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}

const Err = ({ msg }) => msg && (
  <div className="demo-banner" style={{ borderColor: 'rgba(239,68,68,.4)', background: 'rgba(239,68,68,.08)', color: 'var(--danger, #b91c1c)', marginBottom: '0.875rem' }}>{msg}</div>
);

// ═══════════════════════ ATTENDANCE RULES ═══════════════════════
export function AttendanceRulesSection() {
  const api = useRuleApi();
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState({ late_grace_minutes: '', half_day_min_hours: '', full_day_min_hours: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/api/v1/rules/attendance').then(d => {
      if (d.__error) return setError(d.__error);
      setMeta(d);
      setForm({
        late_grace_minutes: d.stored.late_grace_minutes ?? '',
        half_day_min_hours: d.stored.half_day_min_hours ?? '',
        full_day_min_hours: d.stored.full_day_min_hours ?? ''
      });
    });
  }, [api]);
  useEffect(load, [load]);

  const save = async () => {
    setSaving(true); setSaved(false); setError('');
    const body = {};
    for (const [k, v] of Object.entries(form)) body[k] = v === '' ? null : Number(v);
    const d = await api('/api/v1/rules/attendance', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false);
    if (d.__error) { setError(d.__error); return; }
    setSaved(true); load();
    setTimeout(() => setSaved(false), 2500);
  };

  if (!meta) return <div className="loading-state"><Loader2 size={22} className="spin" /></div>;
  return (
    <SectionShell icon={Timer} title="Attendance rules"
      subtitle="How a day is judged once punches land. Leave a field empty to keep the shipped default; changes apply to all future recomputes (Attendance → Recompute)."
      onSave={save} saving={saving} saved={saved}>
      <Err msg={error} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.875rem' }}>
        <NumField label="Late grace (minutes)" step="1" min="0" max="120"
          hint={`Default: ${meta.defaults.late_grace_minutes} min · currently effective: ${meta.effective.late_grace_minutes} min`}
          value={form.late_grace_minutes} onChange={v => setForm({ ...form, late_grace_minutes: v })} />
        <NumField label="Half-day minimum hours" step="0.05" min="0" max="24"
          hint={`Default: ${meta.defaults.half_day_min_hours} h · effective: ${meta.effective.half_day_min_hours} h (below = Absent)`}
          value={form.half_day_min_hours} onChange={v => setForm({ ...form, half_day_min_hours: v })} />
        <NumField label="Full-day minimum hours" step="0.05" min="0" max="24"
          hint={`Default: ${meta.defaults.full_day_min_hours} h · effective: ${meta.effective.full_day_min_hours} h (below = Half-day)`}
          value={form.full_day_min_hours} onChange={v => setForm({ ...form, full_day_min_hours: v })} />
      </div>
    </SectionShell>
  );
}

// ═══════════════════════ OVERTIME POLICY ═══════════════════════
export function OvertimeRulesSection() {
  const api = useRuleApi();
  const FIELDS = ['tier1_threshold_hours', 'tier2_threshold_hours', 'tier1_multiplier', 'tier2_multiplier', 'weekend_multiplier', 'holiday_multiplier', 'night_allowance_multiplier'];
  const LABELS = {
    tier1_threshold_hours: ['Tier-1 OT starts after (hours)', 'OT counts beyond this many worked hours on a normal day'],
    tier2_threshold_hours: ['Tier-2 OT starts after (hours)', 'The heavier rate kicks in beyond this many hours'],
    tier1_multiplier: ['Tier-1 multiplier (×)', 'Applied to the hourly basic rate for tier-1 OT'],
    tier2_multiplier: ['Tier-2 multiplier (×)', 'Applied beyond the tier-2 threshold'],
    weekend_multiplier: ['Week-off day multiplier (×)', 'For hours worked on the employee\u2019s weekly off'],
    holiday_multiplier: ['Public holiday multiplier (×)', 'For hours worked on dates in the Holiday Calendar'],
    night_allowance_multiplier: ['Night shift allowance (×)', 'Reserved for night-shift premium rules']
  };
  const [policy, setPolicy] = useState(null);
  const [form, setForm] = useState({ name: '', ...Object.fromEntries(FIELDS.map(f => [f, ''])) });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/api/v1/rules/overtime').then(d => {
      if (d.__error) return setError(d.__error);
      setPolicy(d.policy);
      setForm({ name: d.policy.name || '', ...Object.fromEntries(FIELDS.map(f => [f, d.policy[f] ?? ''])) });
    });
  }, [api]);
  useEffect(load, [load]);

  const save = async () => {
    setSaving(true); setSaved(false); setError('');
    const body = { name: form.name };
    FIELDS.forEach(f => { body[f] = form[f] === '' ? null : Number(form[f]); });
    const d = await api('/api/v1/rules/overtime', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false);
    if (d.__error) { setError(d.__error); return; }
    setSaved(true); load();
    setTimeout(() => setSaved(false), 2500);
  };

  if (!policy) return <div className="loading-state"><Loader2 size={22} className="spin" /></div>;
  return (
    <SectionShell icon={Gavel} title="Overtime policy"
      subtitle="Rates pay on top of the salary structure. The tier-1 multiplier is what payroll currently applies per OT hour; the remaining tiers feed the statutory OT register and future payslip lines."
      onSave={save} saving={saving} saved={saved}>
      <Err msg={error} />
      <div className="field" style={{ marginBottom: '0.875rem', maxWidth: '320px' }}>
        <label className="field-label">Policy name</label>
        <input className="input" style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '0.875rem' }}>
        {FIELDS.map(f => (
          <NumField key={f} label={LABELS[f][0]} hint={LABELS[f][1]} step="0.25" min="0"
            value={form[f]} onChange={v => setForm({ ...form, [f]: v })} />
        ))}
      </div>
    </SectionShell>
  );
}

// ═══════════════════════ HOLIDAY CALENDAR ═══════════════════════
const HOLIDAY_TYPES = ['PUBLIC', 'COMPANY', 'REGIONAL'];

export function HolidaysSection() {
  const api = useRuleApi();
  const [year, setYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', holiday_date: '', holiday_type: 'PUBLIC', is_regional: false, region: '' });
  const [editId, setEditId] = useState(null);

  const load = useCallback(() => {
    api(`/api/v1/rules/holidays?year=${year}`).then(d => {
      if (d.__error) return setError(d.__error);
      setHolidays(d.holidays);
    });
  }, [api, year]);
  useEffect(load, [load]);

  const post = async (url, method, body) => {
    setBusy(true); setError('');
    const d = await api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    if (d.__error) { setError(d.__error); return false; }
    load();
    return true;
  };

  const add = async () => {
    if (!form.name.trim() || !form.holiday_date) return setError('Holiday name and date are required');
    if (await post('/api/v1/rules/holidays', 'POST', form)) {
      setAdding(false);
      setForm({ name: '', holiday_date: '', holiday_type: 'PUBLIC', is_regional: false, region: '' });
    }
  };

  const startEdit = (h) => {
    setEditId(h.id);
    setForm({ name: h.name, holiday_date: String(h.holiday_date).slice(0, 10), holiday_type: h.holiday_type || 'PUBLIC', is_regional: !!h.is_regional, region: h.region || '' });
  };

  const saveEdit = async () => {
    if (await post(`/api/v1/rules/holidays/${editId}`, 'PUT', form)) setEditId(null);
  };

  const remove = async (h) => {
    if (!(await dialogConfirm(`Remove holiday '${h.name}' (${String(h.holiday_date).slice(0, 10)})?`, { title: 'Remove holiday', confirmLabel: 'Remove', tone: 'danger' }))) return;
    await post(`/api/v1/rules/holidays/${h.id}`, 'DELETE', {});
  };

  const editorRow = (onConfirm, confirmLabel) => (
    <tr>
      <td><input className="input" style={inputStyle} placeholder="Holiday name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></td>
      <td><input className="input" style={inputStyle} type="date" value={form.holiday_date} onChange={e => setForm({ ...form, holiday_date: e.target.value })} /></td>
      <td>
        <select className="input" style={inputStyle} value={form.holiday_type} onChange={e => setForm({ ...form, holiday_type: e.target.value })}>
          {HOLIDAY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button className="btn btn-primary" style={{ padding: '0.25rem 0.6rem' }} onClick={onConfirm} disabled={busy}>
          {busy ? <Loader2 size={13} className="spin" /> : <Check size={13} />} {confirmLabel}
        </button>
        <button className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', marginLeft: '0.375rem' }} onClick={() => { setAdding(false); setEditId(null); }}>
          <X size={13} />
        </button>
      </td>
    </tr>
  );

  return (
    <section className="section-card">
      <div className="section-head">
        <span className="section-title"><CalendarDays size={16} /> Holiday calendar</span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="btn btn-ghost" style={{ padding: '0.25rem 0.55rem' }} onClick={() => setYear(y => y - 1)}>‹</button>
          <span style={{ fontWeight: 600, fontSize: '0.875rem', minWidth: '3.5rem', textAlign: 'center' }}>{year}</span>
          <button className="btn btn-ghost" style={{ padding: '0.25rem 0.55rem' }} onClick={() => setYear(y => y + 1)}>›</button>
          {!adding && !editId && (
            <button className="btn btn-primary" style={{ padding: '0.3rem 0.7rem' }} onClick={() => { setAdding(true); setEditId(null); }}>
              <Plus size={14} /> Add holiday
            </button>
          )}
        </div>
      </div>
      <div className="section-body">
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '0 0 1rem', maxWidth: '52rem', lineHeight: 1.6 }}>
          Public, company and regional holidays. These dates drive the holiday OT multiplier and holiday pay on the payslip.
        </p>
        <Err msg={error} />
        {!holidays ? <div className="loading-state"><Loader2 size={22} className="spin" /></div> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Holiday</th><th style={{ width: '110px' }}>Type</th><th style={{ width: '150px' }}></th></tr>
              </thead>
              <tbody>
                {adding && editorRow(add, 'Add')}
                {holidays.length === 0 && !adding && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-caption)', padding: '1.25rem' }}>No holidays configured for {year}.</td></tr>
                )}
                {holidays.map(h => editId === h.id ? (
                  <tr key={h.id}>{editorRow(saveEdit, 'Save')}</tr>
                ) : (
                  <tr key={h.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{String(h.holiday_date).slice(0, 10)}</td>
                    <td>
                      {h.name}
                      {!!h.is_regional && h.region && <span style={{ marginLeft: '0.5rem', fontSize: '0.6875rem', color: 'var(--text-caption)' }}>· {h.region}</span>}
                    </td>
                    <td><span className="status-pill" style={{ fontSize: '0.6875rem' }}>{h.holiday_type || 'PUBLIC'}</span></td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button className="btn btn-ghost" style={{ padding: '0.25rem 0.45rem' }} onClick={() => startEdit(h)} title="Edit"><Save size={13} /></button>
                      <button className="btn btn-ghost" style={{ padding: '0.25rem 0.45rem', marginLeft: '0.25rem', color: 'var(--danger, #b91c1c)' }} onClick={() => remove(h)} title="Delete"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ═══════════════════════ STATUTORY RATES ═══════════════════════
export function StatutorySection() {
  const api = useRuleApi();
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState({
    epf_employee_pct: '', epf_employer_pct: '', epf_wage_ceiling: '',
    esic_employee_pct: '', esic_employer_pct: '', esic_wage_limit: ''
  });
  const [slabs, setSlabs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const pct = (v) => Math.round(Number(v) * 10000) / 100; // 0.12 -> 12

  const load = useCallback(() => {
    api('/api/v1/rules/statutory').then(d => {
      if (d.__error) return setError(d.__error);
      setMeta(d);
      setForm({
        epf_employee_pct: d.stored.epf_employee_rate != null ? pct(d.stored.epf_employee_rate) : '',
        epf_employer_pct: d.stored.epf_employer_rate != null ? pct(d.stored.epf_employer_rate) : '',
        epf_wage_ceiling: d.stored.epf_wage_ceiling ?? '',
        esic_employee_pct: d.stored.esic_employee_rate != null ? pct(d.stored.esic_employee_rate) : '',
        esic_employer_pct: d.stored.esic_employer_rate != null ? pct(d.stored.esic_employer_rate) : '',
        esic_wage_limit: d.stored.esic_wage_limit ?? ''
      });
      setSlabs(d.effective.pt_slabs.map(s => ({ maxGross: s.maxGross === null ? '' : s.maxGross, tax: s.tax, unlimited: s.maxGross === null })));
    });
  }, [api]);
  useEffect(load, [load]);

  const save = async () => {
    setSaving(true); setSaved(false); setError('');
    const body = {
      epf_employee_rate: form.epf_employee_pct === '' ? null : Number(form.epf_employee_pct) / 100,
      epf_employer_rate: form.epf_employer_pct === '' ? null : Number(form.epf_employer_pct) / 100,
      epf_wage_ceiling: form.epf_wage_ceiling === '' ? null : Number(form.epf_wage_ceiling),
      esic_employee_rate: form.esic_employee_pct === '' ? null : Number(form.esic_employee_pct) / 100,
      esic_employer_rate: form.esic_employer_pct === '' ? null : Number(form.esic_employer_pct) / 100,
      esic_wage_limit: form.esic_wage_limit === '' ? null : Number(form.esic_wage_limit),
      pt_slabs: slabs.map(s => ({ maxGross: s.unlimited ? null : (s.maxGross === '' ? null : Number(s.maxGross)), tax: Number(s.tax || 0) }))
    };
    const d = await api('/api/v1/rules/statutory', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false);
    if (d.__error) { setError(d.__error); return; }
    setSaved(true); load();
    setTimeout(() => setSaved(false), 2500);
  };

  if (!meta) return <div className="loading-state"><Loader2 size={22} className="spin" /></div>;
  const e = meta.effective;
  return (
    <SectionShell icon={Scale} title="Statutory rates"
      subtitle="EPF, ESIC and Professional Tax math used by the payroll engine. Empty fields keep the govt-default shown in each hint; PF/ESI/PT on-off switches live under Company → Statutory toggles."
      onSave={save} saving={saving} saved={saved}>
      <Err msg={error} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.875rem' }}>
        <NumField label="EPF employee (%)" step="0.01" min="0" max="100" hint={`Default: ${pct(meta.defaults.epf_employee_rate)}% · effective ${pct(e.epf_employee_rate)}%`}
          value={form.epf_employee_pct} onChange={v => setForm({ ...form, epf_employee_pct: v })} />
        <NumField label="EPF employer (%)" step="0.01" min="0" max="100" hint={`Default: ${pct(meta.defaults.epf_employer_rate)}% · effective ${pct(e.epf_employer_rate)}%`}
          value={form.epf_employer_pct} onChange={v => setForm({ ...form, epf_employer_pct: v })} />
        <NumField label="EPF wage ceiling (₹/month)" hint={`Default: ₹${meta.defaults.epf_wage_ceiling.toLocaleString('en-IN')}`}
          value={form.epf_wage_ceiling} onChange={v => setForm({ ...form, epf_wage_ceiling: v })} />
        <NumField label="ESIC employee (%)" step="0.01" min="0" max="100" hint={`Default: ${pct(meta.defaults.esic_employee_rate)}% · effective ${pct(e.esic_employee_rate)}%`}
          value={form.esic_employee_pct} onChange={v => setForm({ ...form, esic_employee_pct: v })} />
        <NumField label="ESIC employer (%)" step="0.01" min="0" max="100" hint={`Default: ${pct(meta.defaults.esic_employer_rate)}% · effective ${pct(e.esic_employer_rate)}%`}
          value={form.esic_employer_pct} onChange={v => setForm({ ...form, esic_employer_pct: v })} />
        <NumField label="ESIC wage limit (₹/month)" hint={`Default: ₹${meta.defaults.esic_wage_limit.toLocaleString('en-IN')} — ESIC applies only below this gross`}
          value={form.esic_wage_limit} onChange={v => setForm({ ...form, esic_wage_limit: v })} />
      </div>

      <div style={{ marginTop: '1.25rem' }}>
        <div className="field-label" style={{ marginBottom: '0.5rem' }}>Professional Tax slabs (monthly gross → deduction)</div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Up to gross (₹)</th><th style={{ width: '150px' }}>PT (₹/month)</th><th style={{ width: '70px' }}></th></tr></thead>
            <tbody>
              {slabs.map((s, i) => (
                <tr key={i}>
                  <td>
                    {s.unlimited ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>Any amount above ₹{(Number(slabs[i - 1]?.maxGross) || 0).toLocaleString('en-IN')}</span>
                    ) : (
                      <input className="input" style={inputStyle} type="number" min="0" value={s.maxGross}
                        onChange={ev => setSlabs(slabs.map((x, j) => j === i ? { ...x, maxGross: ev.target.value } : x))} />
                    )}
                  </td>
                  <td>
                    <input className="input" style={inputStyle} type="number" min="0" value={s.tax}
                      onChange={ev => setSlabs(slabs.map((x, j) => j === i ? { ...x, tax: ev.target.value } : x))} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {!s.unlimited && i < slabs.length - 1 && (
                      <button className="btn btn-ghost" style={{ padding: '0.25rem 0.45rem', color: 'var(--danger, #b91c1c)' }}
                        onClick={() => setSlabs(slabs.filter((_, j) => j !== i))} title="Remove slab"><Trash2 size={13} /></button>
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={3}>
                  <button className="btn btn-ghost" style={{ padding: '0.3rem 0.7rem' }}
                    onClick={() => setSlabs([...slabs.slice(0, -1), { maxGross: '', tax: 0, unlimited: false }, slabs[slabs.length - 1]])}>
                    <Plus size={14} /> Add slab
                  </button>
                  <button className="btn btn-ghost" style={{ padding: '0.3rem 0.7rem', marginLeft: '0.5rem' }} onClick={() => load()}>Reset to saved</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </SectionShell>
  );
}
