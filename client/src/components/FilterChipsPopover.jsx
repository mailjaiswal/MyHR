import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal, Search, X } from 'lucide-react';
import useEscapeClose from '../hooks/useEscapeClose';
import useClampedPopover from '../hooks/useClampedPopover';

// Chip-based multi-filter popover for the Attendance page.
// value = { statuses:[], departmentIds:[], designations:[], employeeIds:[], excludeIds:[], lateBy:'', otOnly:false, includeInactive:false }

const STATUS_OPTS = [
  { key: 'PRESENT', label: 'Present' },
  { key: 'OVERTIME', label: 'Overtime' },
  { key: 'REGULARIZED', label: 'Regularized' },
  { key: 'HALF_DAY', label: 'Half day' },
  { key: 'ABSENT', label: 'Absent' },
  { key: 'ON_LEAVE', label: 'On leave' }
];

const LATE_OPTS = ['', 5, 10, 15, 30, 60];

function toggleArr(arr, key) {
  return arr.includes(key) ? arr.filter(k => k !== key) : [...arr, key];
}

export default function FilterChipsPopover({ departments, designations, employees, canViewInactive, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [empQuery, setEmpQuery] = useState('');
  const ref = useRef(null);
  const clampStyle = useClampedPopover(ref, open, 'right');

  useEscapeClose(open, () => setOpen(false));
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const t = setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDoc); };
  }, []);

  const activeCount =
    value.statuses.length + value.departmentIds.length + value.designations.length +
    value.employeeIds.length + value.excludeIds.length +
    (value.lateBy ? 1 : 0) + (value.otOnly ? 1 : 0) + (value.includeInactive ? 1 : 0);

  const empResults = useMemo(() => {
    const q = empQuery.trim().toLowerCase();
    const list = q
      ? employees.filter(e => `${e.full_name} ${e.employee_code} ${e.biometric_user_id || ''}`.toLowerCase().includes(q))
      : employees;
    return list.slice(0, 24);
  }, [empQuery, employees]);

  const set = (patch) => onChange({ ...value, ...patch });

  const empMode = (id) => {
    if (value.employeeIds.includes(id)) return 'in';
    if (value.excludeIds.includes(id)) return 'out';
    return '';
  };
  const cycleEmp = (id) => {
    const mode = empMode(id);
    if (mode === '') set({ employeeIds: [...value.employeeIds, id] });
    else if (mode === 'in') set({ employeeIds: value.employeeIds.filter(x => x !== id), excludeIds: [...value.excludeIds, id] });
    else set({ excludeIds: value.excludeIds.filter(x => x !== id) });
  };

  const section = { marginTop: '0.9rem' };
  const clearAll = () => onChange({ statuses: [], departmentIds: [], designations: [], employeeIds: [], excludeIds: [], lateBy: '', otOnly: false, includeInactive: value.includeInactive });

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className={`island-btn ${activeCount ? 'is-active' : ''}`} onClick={() => setOpen(o => !o)}>
        <span className="icon-orb"><SlidersHorizontal size={13} /></span>
        Filters
        {activeCount > 0 && (
          <span style={{ background: 'var(--brand-primary)', color: '#fff', borderRadius: '999px', fontSize: '0.625rem', fontWeight: 700, padding: '0.05rem 0.45rem', animation: 'tile-check-pop 0.35s var(--ease-spring) both' }}>{activeCount}</span>
        )}
      </button>

      {open && (
        <div className="crp-popover bezel-card" style={{ position: 'absolute', top: 'calc(100% + 0.5rem)', right: 0, zIndex: 60, width: 'min(92vw, 26rem)', ...clampStyle }}>
          <div className="bezel-inner" style={{ padding: '0.75rem 1rem 1rem', maxHeight: 'min(58vh, 32rem)', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="eyebrow">Filter attendance</span>
              {activeCount > 0 && (
                <button className="island-btn anim-fade-in" style={{ padding: '0.25rem 0.7rem', fontSize: '0.6875rem' }} onClick={clearAll}>Clear all</button>
              )}
            </div>

            <div style={section}>
              <div className="eyebrow" style={{ marginBottom: '0.4rem' }}>Status</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {STATUS_OPTS.map(s => (
                  <button key={s.key} className={`chip-toggle ${value.statuses.includes(s.key) ? 'is-on' : ''}`} onClick={() => set({ statuses: toggleArr(value.statuses, s.key) })}>{s.label}</button>
                ))}
              </div>
            </div>

            <div style={section}>
              <div className="eyebrow" style={{ marginBottom: '0.4rem' }}>Department</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {departments.map(d => (
                  <button key={d.id} className={`chip-toggle ${value.departmentIds.includes(String(d.id)) ? 'is-on' : ''}`} onClick={() => set({ departmentIds: toggleArr(value.departmentIds, String(d.id)) })}>{d.name}</button>
                ))}
              </div>
            </div>

            {designations.length > 0 && (
              <div style={section}>
                <div className="eyebrow" style={{ marginBottom: '0.4rem' }}>Designation</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', maxHeight: '6.5rem', overflowY: 'auto' }}>
                  {designations.map(dn => (
                    <button key={dn} className={`chip-toggle ${value.designations.includes(dn) ? 'is-on' : ''}`} onClick={() => set({ designations: toggleArr(value.designations, dn) })}>{dn}</button>
                  ))}
                </div>
              </div>
            )}

            <div style={section}>
              <div className="eyebrow" style={{ marginBottom: '0.4rem' }}>Employees — tap to include, tap again to exclude</div>
              <div className="search-box" style={{ marginBottom: '0.5rem' }}>
                <Search size={14} className="search-icon" />
                <input className="input" placeholder="Search staff…" value={empQuery} onChange={e => setEmpQuery(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', maxHeight: '9.5rem', overflowY: 'auto' }}>
                {empResults.map(e => {
                  const mode = empMode(e.id);
                  return (
                    <button key={e.id} onClick={() => cycleEmp(e.id)} className="emp-rail-item" style={{ padding: '0.35rem 0.5rem' }}>
                      <span className="avatar-sq" style={{ width: 26, height: 26, fontSize: '0.7rem' }}>{(e.full_name || '?')[0]}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.full_name}</span>
                        <span className="mono" style={{ fontSize: '0.625rem', color: 'var(--text-caption)' }}>{e.employee_code}</span>
                      </span>
                      {mode && <span className={`status-pill ${mode === 'in' ? 'status-ok' : 'status-bad'}`} style={{ flex: 'none' }}><span>{mode === 'in' ? 'Only these' : 'Excluded'}</span></span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ ...section, display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: '0.35rem' }}>Late by</div>
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                  {LATE_OPTS.map(v => (
                    <button key={String(v)} className={`chip-toggle ${String(value.lateBy) === String(v) ? 'is-on' : ''}`} onClick={() => set({ lateBy: String(v) })}>{v === '' ? 'Any' : `≥${v}m`}</button>
                  ))}
                </div>
              </div>
              <button className={`chip-toggle ${value.otOnly ? 'is-on' : ''}`} style={{ alignSelf: 'flex-end' }} onClick={() => set({ otOnly: !value.otOnly })}>OT only</button>
            </div>

            {canViewInactive && (
              <div style={{ ...section, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-body)' }}>Include archived staff</span>
                <button className="sw-toggle" role="switch" aria-checked={!!value.includeInactive} onClick={() => set({ includeInactive: !value.includeInactive })}><span className="sw-knob" /></button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ActiveFilterPills({ departments, value, onChange, children }) {
  const pills = [];
  const remove = (patch) => onChange({ ...value, ...patch });
  value.statuses.forEach(s => pills.push({ k: `st-${s}`, label: s.replace('_', ' ').toLowerCase(), x: () => remove({ statuses: value.statuses.filter(y => y !== s) }) }));
  value.departmentIds.forEach(id => {
    const d = departments.find(x => String(x.id) === id);
    pills.push({ k: `dep-${id}`, label: d ? d.name : id, x: () => remove({ departmentIds: value.departmentIds.filter(y => y !== id) }) });
  });
  value.designations.forEach(dn => pills.push({ k: `des-${dn}`, label: dn, x: () => remove({ designations: value.designations.filter(y => y !== dn) }) }));
  value.employeeIds.forEach(id => pills.push({ k: `in-${id}`, label: `Only ${id.slice(-4)}`, x: () => remove({ employeeIds: value.employeeIds.filter(y => y !== id) }) }));
  value.excludeIds.forEach(id => pills.push({ k: `out-${id}`, label: `Not ${id.slice(-4)}`, x: () => remove({ excludeIds: value.excludeIds.filter(y => y !== id) }) }));
  if (value.lateBy) pills.push({ k: 'late', label: `Late ≥${value.lateBy}m`, x: () => remove({ lateBy: '' }) });
  if (value.otOnly) pills.push({ k: 'ot', label: 'OT only', x: () => remove({ otOnly: false }) });

  if (pills.length === 0 && !children) return null;
  return (
    <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.5rem 0 0' }}>
      {pills.map(p => (
        <span key={p.k} className="filter-pill">
          {p.label}
          <button className="pill-x" onClick={p.x} aria-label={`Remove ${p.label}`}><X size={11} /></button>
        </span>
      ))}
      {children}
    </div>
  );
}
