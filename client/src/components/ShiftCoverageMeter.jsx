import React from 'react';
import { CheckCircle2, AlertTriangle, ShieldCheck, HeartPulse, Activity, Syringe, Building2, Users } from 'lucide-react';

// Static fallback ward data — used when backend hasn't returned deptStats yet
const FALLBACK_DEPTS = [
  { id: 1, name: 'ICU Ward',           icon: HeartPulse, color: '#00f2fe', present_count: 4, min_staff_required: 4 },
  { id: 2, name: 'Emergency Casualty', icon: Activity,   color: '#f43f5e', present_count: 3, min_staff_required: 3 },
  { id: 3, name: 'Operation OT',       icon: Syringe,    color: '#8b5cf6', present_count: 3, min_staff_required: 3 },
  { id: 4, name: 'Inpatient Wards',    icon: Building2,  color: '#10b981', present_count: 4, min_staff_required: 6 },
  { id: 5, name: 'Out-Patient (OPD)',  icon: Users,      color: '#f59e0b', present_count: 2, min_staff_required: 4 },
];

export default function ShiftCoverageMeter({ deptStats, style }) {
  const wards = (deptStats && deptStats.length > 0) ? deptStats.map((d, i) => ({
    ...d,
    icon: FALLBACK_DEPTS[i]?.icon || Building2,
    color: FALLBACK_DEPTS[i]?.color || '#10b981',
  })) : FALLBACK_DEPTS;

  const allOk = wards.every(d => d.present_count >= d.min_staff_required);

  return (
    <div
      className="swaniki-card-flat"
      style={{
        padding: '1.25rem',
        borderRadius: '1rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        ...style
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
        <div>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '-0.01em' }}>
            Clinical Shift Coverage
          </h3>
          <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
            Live biometric staffing vs. minimum safety thresholds
          </p>
        </div>
        <span
          className={`pill-badge ${allOk ? 'pill-emerald' : 'pill-rose'}`}
          style={{
            fontSize: '0.625rem',
            padding: '0.15rem 0.55rem',
            background: allOk ? undefined : 'rgba(239, 68, 68, 0.1)',
            color: allOk ? undefined : '#ef4444',
            border: allOk ? undefined : '1px solid rgba(239, 68, 68, 0.25)'
          }}
        >
          {allOk ? <ShieldCheck size={11} /> : <AlertTriangle size={11} color="#ef4444" />}
          <span>{allOk ? 'All Wards Safe' : 'Coverage Alert'}</span>
        </span>
      </div>

      {/* Ward rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', flex: 1, justifyContent: 'space-between' }}>
        {wards.map(dept => {
          const WardIcon = dept.icon;
          const isOk = dept.present_count >= dept.min_staff_required;
          const ratio = Math.min(100, Math.round((dept.present_count / dept.min_staff_required) * 100));
          const accentColor = isOk ? '#10b981' : '#ef4444';

          return (
            <div
              key={dept.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.625rem',
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {/* Left: name + progress bar */}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                  <span style={{
                    width: '7px', height: '7px', borderRadius: '50%',
                    background: dept.color, flexShrink: 0
                  }} />
                  <span style={{
                    fontSize: '0.75rem', fontWeight: 600,
                    color: 'var(--text-heading)', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis'
                  }}>
                    {dept.name.split('(')[0].trim()}
                  </span>
                </div>
                <div className="stat-bar-track" style={{ height: '3px' }}>
                  <div
                    className="stat-bar-fill"
                    style={{
                      width: `${ratio}%`,
                      background: isOk
                        ? `linear-gradient(90deg, ${dept.color}, ${dept.color}aa)`
                        : 'linear-gradient(90deg, #ef4444, #f87171)'
                    }}
                  />
                </div>
              </div>

              {/* Right: count + icon */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                <span style={{
                  fontSize: '0.75rem', fontWeight: 700,
                  color: accentColor, letterSpacing: '-0.02em'
                }}>
                  {dept.present_count}/{dept.min_staff_required}
                </span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-caption)', fontWeight: 500 }}>
                  on duty
                </span>
                {isOk
                  ? <CheckCircle2 size={13} color="#10b981" />
                  : <AlertTriangle size={13} color="#ef4444" />
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
