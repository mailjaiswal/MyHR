import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { ArrowUpRight, ArrowDownRight, ChevronRight, CornerDownRight } from 'lucide-react';

export default function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'emerald',
  badgeText,
  progressPercentage = null,
  trend = null,
  onClick = null
}) {
  const { isDark } = useTheme();

  const colorStyles = {
    emerald: {
      accent: 'var(--brand-primary)',
      bg: 'var(--brand-primary-light)',
      border: isDark ? 'rgba(16, 185, 129, 0.3)' : '#e5e7eb',
      glow: 'rgba(16, 185, 129, 0.4)',
      gradient: ['#10b981', '#34d399']
    },
    cyan: {
      accent: 'var(--brand-cyan)',
      bg: 'var(--brand-cyan-light)',
      border: isDark ? 'rgba(0, 242, 254, 0.3)' : '#e5e7eb',
      glow: 'rgba(0, 242, 254, 0.4)',
      gradient: ['#00f2fe', '#4facfe']
    },
    blue: {
      accent: 'var(--brand-blue)',
      bg: 'var(--brand-blue-light)',
      border: isDark ? 'rgba(56, 189, 248, 0.3)' : '#e5e7eb',
      glow: 'rgba(56, 189, 248, 0.4)',
      gradient: ['#38bdf8', '#60a5fa']
    },
    indigo: {
      accent: 'var(--brand-indigo)',
      bg: 'var(--brand-indigo-light)',
      border: isDark ? 'rgba(139, 92, 246, 0.3)' : '#e5e7eb',
      glow: 'rgba(139, 92, 246, 0.4)',
      gradient: ['#8b5cf6', '#a78bfa']
    },
    amber: {
      accent: 'var(--brand-amber)',
      bg: 'var(--brand-amber-light)',
      border: isDark ? 'rgba(251, 191, 36, 0.3)' : '#e5e7eb',
      glow: 'rgba(251, 191, 36, 0.4)',
      gradient: ['#fbbf24', '#f59e0b']
    },
    rose: {
      accent: 'var(--brand-rose)',
      bg: 'var(--brand-rose-light)',
      border: isDark ? 'rgba(244, 63, 94, 0.3)' : '#e5e7eb',
      glow: 'rgba(244, 63, 94, 0.4)',
      gradient: ['#f43f5e', '#fb7185']
    }
  };

  const scheme = colorStyles[color] || colorStyles.emerald;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const pct = progressPercentage !== null ? Math.min(100, Math.max(0, progressPercentage)) : 75;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div
      className={`swaniki-card ${onClick ? 'interactive-card' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        padding: '1.25rem 1.5rem',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        borderRadius: '1rem',
        background: 'var(--bg-surface)'
      }}
      title={onClick ? `Click to drill down into ${title}` : undefined}
    >
      {/* Top Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: 'var(--text-muted)',
          letterSpacing: '-0.01em'
        }}>
          {title}
        </span>
        {onClick && (
          <span className="drilldown-indicator">
            <span>Drilldown</span>
            <ChevronRight size={13} />
          </span>
        )}
      </div>

      {/* Center Body: Circular Gauge in Dark Mode OR Clean Number in Light Mode */}
      {isDark && progressPercentage !== null ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.75rem 0', position: 'relative' }}>
          <div className="circle-gauge-container" style={{ width: '100px', height: '100px' }}>
            <svg className="circle-gauge-svg" width="100" height="100" viewBox="0 0 100 100">
              <circle
                className="circle-gauge-track"
                cx="50"
                cy="50"
                r={radius}
              />
              <circle
                className="circle-gauge-fill"
                cx="50"
                cy="50"
                r={radius}
                stroke={scheme.gradient[0]}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                style={{
                  filter: `drop-shadow(0 0 8px ${scheme.glow})`
                }}
              />
            </svg>
            <div style={{
              position: 'absolute',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center'
            }}>
              <span style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                letterSpacing: '-0.025em',
                color: 'var(--text-heading)',
                lineHeight: 1
              }}>
                {value}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0.35rem 0 0.75rem' }}>
          <div style={{
            fontSize: '1.875rem',
            fontWeight: 600,
            letterSpacing: '-0.03em',
            color: 'var(--text-heading)',
            lineHeight: 1
          }}>
            {value}
          </div>

          {trend && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.2rem 0.5rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: trend.positive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              color: trend.positive ? '#10b981' : '#ef4444'
            }}>
              {trend.positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              <span>{trend.value}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer Info / Subtitle */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '0.5rem',
        paddingTop: '0.5rem',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: '0.75rem'
      }}>
        <span style={{ color: 'var(--text-caption)' }}>
          {subtitle || 'vs. last month'}
        </span>

        {isDark ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: scheme.gradient[0] }}></span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 700 }}>
              {badgeText || `${pct}% Active`}
            </span>
          </div>
        ) : (
          progressPercentage !== null && (
            <div style={{ width: '65px' }}>
              <div className="stat-bar-track" style={{ height: '4px' }}>
                <div
                  className="stat-bar-fill"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${scheme.gradient[0]}, ${scheme.gradient[1]})`
                  }}
                />
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
