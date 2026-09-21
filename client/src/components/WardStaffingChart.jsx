import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { MoreVertical } from 'lucide-react';

export default function WardStaffingChart() {
  const { isDark } = useTheme();

  // Data for Light Mode: Stacked weekly ward staffing
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const barData = [
    { day: 'Mon', segments: [28, 22, 18, 16] },
    { day: 'Tue', segments: [32, 20, 16, 14] },
    { day: 'Wed', segments: [35, 24, 18, 12] },
    { day: 'Thu', segments: [30, 22, 16, 15] },
    { day: 'Fri', segments: [36, 26, 18, 10] },
    { day: 'Sat', segments: [28, 18, 14, 12] },
    { day: 'Sun', segments: [24, 16, 12, 10] }
  ];

  const lightColors = ['#312e81', '#4f46e5', '#34d399', '#fbbf24'];

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
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-heading)' }}>
            {isDark ? 'Ward Staffing Distribution' : 'Ward Coverage'}
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            {isDark ? 'Shift deployment across 24x7 rotas' : 'Consistent hospital employee punch presence'}
          </p>
        </div>
        <button style={{ background: 'transparent', border: 'none', color: 'var(--text-caption)', cursor: 'pointer' }}>
          <MoreVertical size={16} />
        </button>
      </div>

      {isDark ? (
        /* Dark Mode: Glowing Donut Ring Chart (Ronas IT Dribbble #26327753) */
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '1rem 0' }}>
          <div style={{ position: 'relative', width: '130px', height: '130px' }}>
            <svg width="130" height="130" viewBox="0 0 130 130" style={{ transform: 'rotate(-90deg)' }}>
              {/* Segment 1: Morning Shift (Cyan) */}
              <circle
                cx="65"
                cy="65"
                r="45"
                fill="none"
                stroke="#00f2fe"
                strokeWidth="16"
                strokeDasharray="283"
                strokeDashoffset="127"
                style={{ filter: 'drop-shadow(0 0 8px rgba(0, 242, 254, 0.45))' }}
              />
              {/* Segment 2: Evening Shift (Purple) */}
              <circle
                cx="65"
                cy="65"
                r="45"
                fill="none"
                stroke="#8b5cf6"
                strokeWidth="16"
                strokeDasharray="283"
                strokeDashoffset="198"
                style={{ filter: 'drop-shadow(0 0 8px rgba(139, 92, 246, 0.45))', transform: 'rotate(198deg)', transformOrigin: '65px 65px' }}
              />
              {/* Segment 3: Night Duty Rota (Emerald) */}
              <circle
                cx="65"
                cy="65"
                r="45"
                fill="none"
                stroke="#10b981"
                strokeWidth="16"
                strokeDasharray="283"
                strokeDashoffset="226"
                style={{ filter: 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.45))', transform: 'rotate(270deg)', transformOrigin: '65px 65px' }}
              />
            </svg>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#ffffff' }}>50</span>
              <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>Staff</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00f2fe', boxShadow: '0 0 6px #00f2fe' }}></span>
              <span style={{ color: 'var(--text-body)' }}>Morning Rota (55%)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8b5cf6', boxShadow: '0 0 6px #8b5cf6' }}></span>
              <span style={{ color: 'var(--text-body)' }}>Evening Shift (25%)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }}></span>
              <span style={{ color: 'var(--text-body)' }}>Night Duty (20%)</span>
            </div>
          </div>
        </div>
      ) : (
        /* Light Mode: Stacked Bar Chart (Marta Buchner Dribbble #25157900) */
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '140px', padding: '0 0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
            {barData.map((b, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '28px' }}>
                <div style={{ display: 'flex', flexDirection: 'column-reverse', width: '14px', height: '110px', borderRadius: '4px', overflow: 'hidden', background: '#f1f5f9' }}>
                  {b.segments.map((seg, sIdx) => (
                    <div
                      key={sIdx}
                      style={{
                        height: `${seg}px`,
                        background: lightColors[sIdx]
                      }}
                    />
                  ))}
                </div>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>{b.day}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: lightColors[0] }}></span>
              <span>ICU Ward</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: lightColors[1] }}></span>
              <span>Emergency</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: lightColors[2] }}></span>
              <span>Operation OT</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: lightColors[3] }}></span>
              <span>General Inpatient</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
