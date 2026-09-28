import React, { useState } from 'react';
import {
  Clock,
  Users,
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { rampAt } from '../utils/chartPalette';

/* Renders the real 24h coverage from the org's configured shifts and the staff
   actually assigned to each. Everything here is derived from live data - no mock
   staff counts or invented nurse names. A shift that genuinely has nobody on it
   now correctly shows "0 Staff", and any uncovered hour is flagged honestly. */

// "08:30" -> 8.5 (hours as a fraction across the 24h track)
const toHour = (t) => {
  const [h, m] = String(t || '0').split(':');
  return (parseInt(h, 10) || 0) + (parseInt(m, 10) || 0) / 60;
};

// A shift becomes a set of left/width segments on the 0-24 track. Cross-midnight
// shifts (or anything whose end <= start) split into an evening leg + a morning leg.
const segmentsFor = (start, end, crossMidnight) => {
  if (crossMidnight) {
    const evening = Math.max(0, ((24 - start) / 24) * 100);
    const morning = Math.max(0, (end / 24) * 100);
    const segs = [];
    if (evening > 0) segs.push({ left: (start / 24) * 100, width: evening });
    if (morning > 0) segs.push({ left: 0, width: morning });
    return segs.length ? segs : [{ left: (start / 24) * 100, width: 4 }];
  }
  return [{ left: (start / 24) * 100, width: Math.max(1.5, ((end - start) / 24) * 100) }];
};

export default function Shift24HourTimeline({ shifts = [], employees = [], loading = false }) {
  const { isDark } = useTheme();
  const [selected, setSelected] = useState(null);

  const hours = ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];

  const rows = shifts.map((s, i) => {
    const start = toHour(s.start_time);
    const rawEnd = toHour(s.end_time);
    const crossMidnight = Number(s.is_cross_midnight) === 1 || rawEnd <= start;
    const end = crossMidnight ? rawEnd : rawEnd;
    const staff = employees.filter((e) => e.shift_id === s.id);
    return {
      id: s.id,
      name: s.name,
      start,
      end,
      crossMidnight,
      startLabel: (s.start_time || '').slice(0, 5),
      endLabel: (s.end_time || '').slice(0, 5),
      duration: s.duration_hours,
      color: rampAt(i, isDark),
      staffCount: staff.length,
      names: staff.map((e) => ({ id: e.id, name: e.full_name, role: e.designation, dept: e.department_name })),
      segments: segmentsFor(start, end, crossMidnight),
    };
  });

  // Hour-by-hour coverage (handles wrap) to surface real gaps, not a fixed "zero gaps" claim.
  const covered = new Array(24).fill(0);
  rows.forEach((r) => {
    for (let h = 0; h < 24; h++) {
      const within = r.crossMidnight ? (h >= Math.floor(r.start) || h < Math.ceil(r.end)) : (h >= Math.floor(r.start) && h < Math.ceil(r.end));
      if (within) covered[h] += 1;
    }
  });
  const uncoveredHours = covered.filter((c) => c === 0).length;
  const overlapHours = covered.filter((c) => c >= 2).length;
  const totalAssigned = employees.filter((e) => e.shift_id).length;

  return (
    <div className="swaniki-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Clock size={18} color="var(--brand-primary-ink)" />
            <h3 style={{ fontSize: '1.0625rem', fontWeight: 600, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
              24-Hour Shift Coverage Matrix
            </h3>
            {rows.length > 0 && (
              uncoveredHours === 0 ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '9999px', background: 'var(--brand-primary-light)', color: 'var(--brand-primary-ink)' }}>
                  <ShieldCheck size={12} /> Fully covered
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '9999px', background: 'var(--brand-amber-light)', color: 'var(--warning-ink)' }}>
                  <ShieldAlert size={12} /> {uncoveredHours}h uncovered
                </span>
              )
            )}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Live view of configured shifts and the staff assigned to each across the day.
          </p>
        </div>

        {/* Summary */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          <span><strong style={{ color: 'var(--text-heading)' }}>{rows.length}</strong> shifts</span>
          <span><strong style={{ color: 'var(--text-heading)' }}>{totalAssigned}</strong> / {employees.length} staff assigned</span>
          {overlapHours > 0 && <span><strong style={{ color: 'var(--text-heading)' }}>{overlapHours}h</strong> handover overlap</span>}
        </div>
      </div>

      {/* Empty state */}
      {!loading && rows.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
          No shifts configured yet. Add shifts to see the coverage matrix.
        </div>
      )}

      {/* Main timeline canvas */}
      {rows.length > 0 && (
        <div style={{
          position: 'relative',
          background: 'var(--bg-surface-subtle)',
          border: '1px solid var(--border-color)',
          borderRadius: '1rem',
          padding: '1.25rem 1rem',
          overflowX: 'auto'
        }}>
          {/* Time labels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.875rem', minWidth: '680px' }}>
            {hours.map((hr, idx) => (<div key={idx} className="timeline-hour-mark">{hr}</div>))}
          </div>

          <div style={{ minWidth: '680px', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {rows.map((r) => (
              <div key={r.id} style={{ position: 'relative', height: '44px' }}>
                {r.segments.map((seg, si) => (
                  <div
                    key={si}
                    onClick={() => setSelected(r)}
                    title={`${r.name} · ${r.startLabel}–${r.endLabel}${r.crossMidnight ? ' (cross-midnight)' : ''}`}
                    style={{
                      position: 'absolute',
                      left: `${seg.left}%`,
                      width: `${seg.width}%`,
                      top: 0,
                      height: '100%',
                      background: `${r.color}22`,
                      border: `1.5px solid ${r.color}`,
                      borderRadius: '0.625rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                      padding: '0 0.75rem',
                      cursor: 'pointer',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      overflow: 'hidden',
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-heading)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.name}
                      </span>
                      {si === 0 && (
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {r.startLabel}–{r.endLabel}
                        </span>
                      )}
                    </div>
                    <span style={{ flexShrink: 0, fontSize: '0.6875rem', fontWeight: 600, color: 'var(--brand-primary-ink)', background: 'var(--bg-surface)', padding: '0.15rem 0.45rem', borderRadius: '9999px', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Users size={11} /> {r.staffCount}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected shift detail - real assigned staff */}
      {selected && (
        <div style={{ padding: '1rem 1.25rem', borderRadius: '0.75rem', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: selected.color }} />
              <strong style={{ fontSize: '0.9rem', color: 'var(--text-heading)' }}>{selected.name}</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {selected.startLabel} – {selected.endLabel}{selected.duration ? ` (${selected.duration}h)` : ''}{selected.crossMidnight ? ' · cross-midnight' : ''}
              </span>
            </div>
            <button onClick={() => setSelected(null)} className="btn-swaniki btn-swaniki-ghost" style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }}>
              <span>Dismiss</span>
            </button>
          </div>

          {selected.names.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--warning-ink)', fontWeight: 600, margin: 0 }}>
              No staff currently assigned to this shift.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: 'var(--text-caption)' }}>
                <ChevronRight size={13} /> {selected.staffCount} assigned
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {selected.names.map((p) => (
                  <span key={p.id} title={[p.role, p.dept].filter(Boolean).join(' · ')} style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '0.4rem', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-heading)' }}>
                    {p.name}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
