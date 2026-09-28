import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react';

/* One hue, several strengths. Anything that used to be "cyan/indigo/blue" is now
   simply a lighter or deeper step of the same emerald ramp, so a row of metric
   cards reads as one family instead of a colour wheel. */
const RAMP = {
  emerald: 'var(--data-4)',
  teal: 'var(--data-3)',
  deep: 'var(--data-2)',
  mint: 'var(--data-5)',
  amber: 'var(--brand-amber)',
  rose: 'var(--brand-rose)',
};

// Legacy colour names still passed by older call sites.
const ALIAS = { cyan: 'mint', blue: 'teal', indigo: 'deep' };

/**
 * Counts a numeric value up on mount while preserving its original formatting
 * ("₹4,52,100", "64.5%", "1,203" all round-trip). Non-numeric values render as-is.
 */
function useCountUp(raw) {
  const match = typeof raw === 'string' || typeof raw === 'number'
    ? String(raw).match(/[-+]?[\d,]*\.?\d+/)
    : null;
  const target = match ? parseFloat(match[0].replace(/,/g, '')) : null;
  const decimals = (match?.[0].split('.')[1] || '').length;
  const grouped = match?.[0].includes(',');
  const reduced = useRef(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );

  const [display, setDisplay] = useState(() => (target === null || reduced.current ? raw : String(raw).replace(match[0], '0')));

  useEffect(() => {
    if (target === null || reduced.current) {
      setDisplay(raw);
      return undefined;
    }
    let frame = 0;
    const start = performance.now();
    const dur = 700;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = target * eased;
      const text = grouped
        ? current.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : current.toFixed(decimals);
      setDisplay(String(raw).replace(match[0], text));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  return display;
}

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
  const accent = RAMP[ALIAS[color] || color] || RAMP.emerald;
  const counted = useCountUp(value);
  const hasProgress = progressPercentage !== null && progressPercentage !== undefined;
  const pct = hasProgress ? Math.min(100, Math.max(0, Number(progressPercentage) || 0)) : 0;

  const handleKey = (event) => {
    if (!onClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick(event);
    }
  };

  return (
    <div
      className={`swaniki-card ${onClick ? 'interactive-card' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={handleKey}
      style={{
        padding: '1.125rem 1.25rem',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '0.5rem',
        borderRadius: '1rem',
        background: 'var(--bg-surface)'
      }}
      title={onClick ? `Drill down into ${title}` : undefined}
    >
      {/* Hairline of accent along the top edge replaces the old coloured icon chip */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0, left: '1.25rem', width: '2.25rem', height: '2px',
          borderRadius: '0 0 2px 2px', background: accent, opacity: 0.85
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.125rem' }}>
        <span className="eyebrow" style={{ fontWeight: 600 }}>
          {title}
        </span>
        {onClick && (
          <span className="drilldown-indicator">
            <span>Details</span>
            <ChevronRight size={13} />
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div className="stat-value" style={{ fontSize: '1.75rem' }}>
          {counted}
        </div>

        {trend && (
          <span
            className="status-pill"
            style={{
              background: trend.positive ? 'var(--brand-primary-light)' : 'var(--brand-rose-light)',
              color: trend.positive ? 'var(--brand-primary-ink)' : 'var(--danger-ink)',
              border: '1px solid transparent'
            }}
          >
            {trend.positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            <span>{trend.value}</span>
          </span>
        )}
      </div>

      {hasProgress && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="stat-bar-track" style={{ flex: 1, height: '4px' }}>
            <div className="stat-bar-fill" style={{ width: `${pct}%`, background: accent }} />
          </div>
          <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-caption)' }}>
            {Math.round(pct)}%
          </span>
        </div>
      )}

      {(subtitle || (badgeText && !hasProgress)) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
          paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.75rem'
        }}>
          <span style={{ color: 'var(--text-caption)' }}>{subtitle}</span>
          {badgeText && !hasProgress && (
            <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)' }}>{badgeText}</span>
          )}
        </div>
      )}
    </div>
  );
}
