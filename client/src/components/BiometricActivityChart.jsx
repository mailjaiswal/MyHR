import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { MoreVertical } from 'lucide-react';
import { rampAt } from '../utils/chartPalette';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* One curve, one shape, both themes. The previous build drew three neon glowing
   waves in dark mode and a single indigo area in light mode - same card, two
   different charts, two different titles and two different x-axes. */
export default function BiometricActivityChart() {
  const { isDark } = useTheme();
  const line = rampAt(3, isDark);
  const peak = rampAt(0, isDark);

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
            Biometric activity
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Device punch volume across the rota week
          </p>
        </div>
        <button style={{ background: 'transparent', border: 'none', color: 'var(--text-caption)', cursor: 'pointer' }}>
          <MoreVertical size={16} />
        </button>
      </div>

      <div style={{ padding: '0.5rem 0' }}>
        <div style={{ position: 'relative', width: '100%', height: '140px' }}>
          <svg width="100%" height="140" viewBox="0 0 320 140" preserveAspectRatio="none" role="img" aria-label="Punch volume trend across the week">
            <defs>
              <linearGradient id="punchArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={line} stopOpacity="0.26" />
                <stop offset="100%" stopColor={line} stopOpacity="0.02" />
              </linearGradient>
            </defs>

            <line x1="0" y1="35" x2="320" y2="35" stroke="var(--border-subtle)" strokeDasharray="3" />
            <line x1="0" y1="70" x2="320" y2="70" stroke="var(--border-subtle)" strokeDasharray="3" />
            <line x1="0" y1="105" x2="320" y2="105" stroke="var(--border-subtle)" strokeDasharray="3" />

            <path
              d="M 0 50 C 40 40, 80 80, 120 70 C 160 60, 200 110, 240 30 C 280 50, 300 90, 320 120 L 320 140 L 0 140 Z"
              fill="url(#punchArea)"
            />
            <path
              d="M 0 50 C 40 40, 80 80, 120 70 C 160 60, 200 110, 240 30 C 280 50, 300 90, 320 120"
              fill="none"
              stroke={line}
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* Busiest day */}
            <circle cx="240" cy="30" r="4.5" fill={peak} stroke="var(--bg-surface)" strokeWidth="2" />
          </svg>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.6875rem', color: 'var(--text-caption)' }}>
          {DAYS.map((d) => <span key={d}>{d}</span>)}
        </div>
      </div>
    </div>
  );
}
