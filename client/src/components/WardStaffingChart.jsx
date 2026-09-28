import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { MoreVertical } from 'lucide-react';
import { ramp } from '../utils/chartPalette';

const WARDS = ['ICU Ward', 'Emergency', 'Operation OT', 'General Inpatient'];

// Weekly deployment per ward (staff-days). Same chart in both themes - the old
// build drew a neon donut in dark and stacked bars in light, so the same data
// appeared as two different shapes under two different titles.
const BAR_DATA = [
  { day: 'Mon', segments: [28, 22, 18, 16] },
  { day: 'Tue', segments: [32, 20, 16, 14] },
  { day: 'Wed', segments: [35, 24, 18, 12] },
  { day: 'Thu', segments: [30, 22, 16, 15] },
  { day: 'Fri', segments: [36, 26, 18, 10] },
  { day: 'Sat', segments: [28, 18, 14, 12] },
  { day: 'Sun', segments: [24, 16, 12, 10] }
];

export default function WardStaffingChart() {
  const { isDark } = useTheme();
  const colors = ramp(isDark);

  return (
    <div
      className="swaniki-card"
      style={{
        padding: '1.5rem',
        borderRadius: '1rem',
        background: 'var(--bg-surface)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flex: 1
      }}
    >
      {/* Chart Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
            Ward coverage
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Staff-days by ward across the rota week
          </p>
        </div>
        <button style={{ background: 'transparent', border: 'none', color: 'var(--text-caption)', cursor: 'pointer' }}>
          <MoreVertical size={16} />
        </button>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '140px', padding: '0 0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
          {BAR_DATA.map((b, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '28px' }}>
              <div
                title={WARDS.map((w, i) => `${w}: ${b.segments[i]}`).join(' · ')}
                style={{
                  display: 'flex', flexDirection: 'column-reverse', width: '14px', height: '110px',
                  borderRadius: '4px', overflow: 'hidden', background: 'var(--bg-surface-subtle)'
                }}
              >
                {b.segments.map((seg, sIdx) => (
                  <div key={sIdx} style={{ height: `${seg}px`, background: colors[sIdx] }} />
                ))}
              </div>
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>{b.day}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          {WARDS.map((ward, i) => (
            <div key={ward} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: colors[i] }}></span>
              <span>{ward}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
