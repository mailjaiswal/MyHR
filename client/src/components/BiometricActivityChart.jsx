import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { MoreVertical } from 'lucide-react';

export default function BiometricActivityChart() {
  const { isDark } = useTheme();

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
            {isDark ? 'Attendance Analytics' : 'Biometric Activity'}
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            {isDark ? 'Real-time hardware punch density curve' : 'eSSL Hardware Scans • 102% target shift presence achieved'}
          </p>
        </div>
        <button style={{ background: 'transparent', border: 'none', color: 'var(--text-caption)', cursor: 'pointer' }}>
          <MoreVertical size={16} />
        </button>
      </div>

      {isDark ? (
        /* Dark Mode: Glowing Multi-Wave Analytics (Ronas IT Dribbble #26327753) */
        <div style={{ padding: '0.5rem 0' }}>
          <div style={{ position: 'relative', width: '100%', height: '140px' }}>
            <svg width="100%" height="140" viewBox="0 0 320 140" preserveAspectRatio="none">
              <defs>
                <linearGradient id="neonCyanGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00f2fe" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#00f2fe" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="neonPurpleGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="0" y1="35" x2="320" y2="35" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
              <line x1="0" y1="70" x2="320" y2="70" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
              <line x1="0" y1="105" x2="320" y2="105" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />

              {/* Curve 1: Staff Presence (Cyan) */}
              <path
                d="M 0 120 C 40 100, 60 20, 100 35 C 140 50, 160 120, 200 65 C 240 20, 270 90, 320 70 L 320 140 L 0 140 Z"
                fill="url(#neonCyanGlow)"
              />
              <path
                d="M 0 120 C 40 100, 60 20, 100 35 C 140 50, 160 120, 200 65 C 240 20, 270 90, 320 70"
                fill="none"
                stroke="#00f2fe"
                strokeWidth="2.5"
                style={{ filter: 'drop-shadow(0 0 6px rgba(0, 242, 254, 0.6))' }}
              />

              {/* Curve 2: Punch Velocity (Purple) */}
              <path
                d="M 0 130 C 50 110, 80 80, 120 75 C 160 70, 190 40, 230 55 C 270 70, 290 30, 320 40"
                fill="none"
                stroke="#8b5cf6"
                strokeWidth="2.5"
                style={{ filter: 'drop-shadow(0 0 6px rgba(139, 92, 246, 0.6))' }}
              />

              {/* Curve 3: Overtime Surge (Lime) */}
              <path
                d="M 0 135 C 60 125, 110 110, 150 95 C 190 80, 240 85, 320 80"
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                style={{ filter: 'drop-shadow(0 0 5px rgba(16, 185, 129, 0.5))' }}
              />
            </svg>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.6875rem', color: 'var(--text-caption)' }}>
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>
        </div>
      ) : (
        /* Light Mode: Smooth Area Curve (Marta Buchner Dribbble #25157900) */
        <div style={{ padding: '0.5rem 0' }}>
          <div style={{ position: 'relative', width: '100%', height: '140px' }}>
            <svg width="100%" height="140" viewBox="0 0 320 140" preserveAspectRatio="none">
              <defs>
                <linearGradient id="lightBlueArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              <line x1="0" y1="35" x2="320" y2="35" stroke="#f1f5f9" strokeDasharray="3" />
              <line x1="0" y1="70" x2="320" y2="70" stroke="#f1f5f9" strokeDasharray="3" />
              <line x1="0" y1="105" x2="320" y2="105" stroke="#f1f5f9" strokeDasharray="3" />

              <path
                d="M 0 50 C 40 40, 80 80, 120 70 C 160 60, 200 110, 240 30 C 280 50, 300 90, 320 120 L 320 140 L 0 140 Z"
                fill="url(#lightBlueArea)"
              />
              <path
                d="M 0 50 C 40 40, 80 80, 120 70 C 160 60, 200 110, 240 30 C 280 50, 300 90, 320 120"
                fill="none"
                stroke="#4f46e5"
                strokeWidth="2.5"
              />

              {/* Peak Indicator Point */}
              <circle cx="240" cy="30" r="4.5" fill="#4f46e5" stroke="#ffffff" strokeWidth="2" />
            </svg>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.6875rem', color: 'var(--text-caption)' }}>
            <span>Jan</span>
            <span>Feb</span>
            <span>Mar</span>
            <span>Apr</span>
            <span>May</span>
            <span>Jun</span>
          </div>
        </div>
      )}
    </div>
  );
}
