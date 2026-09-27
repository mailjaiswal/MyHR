import React, { useMemo, useState } from 'react';
import { Check } from 'lucide-react';

// Shared day-level calendar renderers for the Attendance page:
// MonthGrid (7-col calendar), WeekCards (7 large day cards), YearHeatmap (quarter/year).
// All receive flat attendance rows for ONE employee (duty_date keyed) + a range.

function pad(n) { return String(n).padStart(2, '0'); }
function dstr(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function dayList(from, to) {
  const out = [];
  const [fy, fm, fd] = from.split('-').map(Number);
  const cur = new Date(fy, fm - 1, fd);
  const [ty, tm, td] = to.split('-').map(Number);
  const end = new Date(ty, tm - 1, td);
  while (cur <= end && out.length < 400) { out.push(dstr(cur.getFullYear(), cur.getMonth(), cur.getDate())); cur.setDate(cur.getDate() + 1); }
  return out;
}
function fmtT(t) {
  if (!t) return '—';
  const d = new Date(t);
  return isNaN(d) ? String(t).slice(11, 16) : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
}

const ST_CLASS = {
  PRESENT: 'st-present', OVERTIME: 'st-present', REGULARIZED: 'st-present',
  HALF_DAY: 'st-half', ABSENT: 'st-absent', ON_LEAVE: 'st-leave'
};
const ST_PILL = {
  PRESENT: 'status-ok', OVERTIME: 'status-ok', REGULARIZED: 'status-ok',
  HALF_DAY: 'status-warn', ABSENT: 'status-bad', ON_LEAVE: 'status-muted'
};

function metrics(r) {
  const late = Number(r?.late_minutes || 0);
  const early = r?.early_minutes != null ? Number(r.early_minutes) : null;
  const ot = Number(r?.overtime_hours || 0);
  return { late, early, ot, hours: Number(r?.total_hours || 0) };
}

function DayBody({ r }) {
  const { late, early, ot, hours } = metrics(r);
  return (
    <>
      <span className="cal-time">{fmtT(r.first_in_time)} – {fmtT(r.last_out_time)}</span>
      <span className="cal-metric"><b>{hours.toFixed(1)}h</b>{ot > 0 ? ` · OT ${ot.toFixed(1)}` : ''}</span>
      <span className="cal-metric" style={{ display: 'flex', gap: '0.375rem' }}>
        {late > 0 && <span style={{ color: 'var(--brand-amber)' }}>+{late}m late</span>}
        {early != null && early > 0 && <span style={{ color: 'var(--brand-rose)' }}>-{early}m early</span>}
      </span>
    </>
  );
}

export function MonthGrid({ records, from, to, onSelect }) {
  const byDate = useMemo(() => {
    const m = {};
    records.forEach(r => { m[String(r.duty_date).slice(0, 10)] = r; });
    return m;
  }, [records]);
  const days = useMemo(() => dayList(from, to), [from, to]);
  const [fy, fm] = from.split('-').map(Number);
  const lead = (new Date(fy, fm - 1, 1).getDay() + 6) % 7; // Monday-first ghosts

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.375rem', marginBottom: '0.375rem' }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => <span key={w} className="eyebrow" style={{ textAlign: 'center' }}>{w}</span>)}
      </div>
      <div className="cal-grid">
        {Array.from({ length: lead }).map((_, i) => <div key={`g${i}`} className="cal-cell cal-ghost" />)}
        {days.map(ds => {
          const r = byDate[ds];
          const cls = r ? (ST_CLASS[r.status] || 'st-leave') : 'cal-ghost';
          return (
            <div
              key={ds}
              className={`cal-cell ${cls}`}
              data-clickable={onSelect ? '' : undefined}
              onClick={onSelect ? () => onSelect(r) : undefined}
              title={r ? `${r.shift_name || ''} · ${r.status}` : 'No record'}
            >
              <span className="cal-daynum">{Number(ds.slice(8))}</span>
              {r?.shift_name && <span className="cal-shift-badge">{String(r.shift_name).slice(0, 4)}</span>}
              {r ? <DayBody r={r} /> : <span className="cal-metric" style={{ alignSelf: 'center' }}>—</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WeekCards({ records, from, to, onSelect }) {
  const byDate = useMemo(() => {
    const m = {};
    records.forEach(r => { m[String(r.duty_date).slice(0, 10)] = r; });
    return m;
  }, [records]);
  const days = useMemo(() => dayList(from, to).slice(0, 7), [from, to]);

  return (
    <div className="week-cards">
      {days.map((ds, i) => {
        const r = byDate[ds];
        const wd = new Date(ds + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' });
        return (
          <div key={ds} className="bezel-card view-tile anim-fade-up" style={{ animationDelay: `${i * 60}ms` }} onClick={() => r && onSelect(r)}>
            <div className={`bezel-inner ${r ? ST_CLASS[r.status] || '' : ''}`} style={{ padding: '0.875rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', minHeight: '8.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span className="eyebrow" style={{ color: 'var(--text-heading)' }}>{wd} {Number(ds.slice(8))}</span>
                {r?.shift_name && <span className="cal-shift-badge" style={{ position: 'static' }}>{String(r.shift_name).slice(0, 4)}</span>}
              </div>
              {r ? (
                <>
                  <span className="cal-time">{fmtT(r.first_in_time)}</span>
                  <span className="cal-time">{fmtT(r.last_out_time)}</span>
                  <span className="cal-metric"><b>{metrics(r).hours.toFixed(1)}h</b>{metrics(r).ot > 0 ? ` · OT ${metrics(r).ot.toFixed(1)}h` : ''}</span>
                  <span className="cal-metric" style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                    {metrics(r).late > 0 && <span style={{ color: 'var(--brand-amber)' }}>+{metrics(r).late}m late</span>}
                    {metrics(r).early != null && metrics(r).early > 0 && <span style={{ color: 'var(--brand-rose)' }}>-{metrics(r).early}m early</span>}
                  </span>
                  <span className={`status-pill ${ST_PILL[r.status] || 'status-muted'}`} style={{ alignSelf: 'flex-start', marginTop: 'auto' }}>{r.status.replace('_', ' ')}</span>
                </>
              ) : (
                <span className="cal-metric" style={{ alignSelf: 'center', margin: 'auto' }}>No record</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function YearHeatmap({ records, from, to, onSelect }) {
  const [tip, setTip] = useState(null);
  const byDate = useMemo(() => {
    const m = {};
    records.forEach(r => { m[String(r.duty_date).slice(0, 10)] = r; });
    return m;
  }, [records]);
  const days = useMemo(() => dayList(from, to), [from, to]);

  // Group by month label, keep chronological week-aligned columns per month row.
  const months = useMemo(() => {
    const out = new Map();
    days.forEach(ds => {
      const key = ds.slice(0, 7);
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(ds);
    });
    return [...out.entries()];
  }, [days]);

  const heatOf = (r) => {
    if (!r) return 'heat-none';
    if (r.status === 'ABSENT') return 'heat-r3';
    if (r.status === 'HALF_DAY') return 'heat-r2';
    if (r.status === 'PRESENT') return 'heat-r1';
    return 'heat-r4'; // OVERTIME / REGULARIZED / others
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {months.map(([ym, ds], mi) => {
        const label = new Date(ym + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short' });
        return (
          <div key={ym} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span className="heat-row-label">{label}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, 0.875rem)', gridAutoRows: '0.875rem', gap: '2px' }}>
              {ds.map((d, i) => {
                const r = byDate[d];
                return (
                  <div
                    key={d}
                    className={`heat-sq ${heatOf(r)}`}
                    style={{ animationDelay: `${Math.min(mi * 40 + i * 2, 600)}ms` }}
                    onMouseEnter={() => r && setTip({ d, r, x: i })}
                    onMouseLeave={() => setTip(null)}
                    onClick={() => r && onSelect(r)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
      {tip && (
        <div className="bezel-card anim-fade-in" style={{ position: 'sticky', bottom: '0.5rem', alignSelf: 'flex-start', maxWidth: '18rem' }}>
          <div className="bezel-inner" style={{ padding: '0.625rem 0.875rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span className="eyebrow" style={{ color: 'var(--text-heading)' }}>{new Date(tip.d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <span className="cal-time">{fmtT(tip.r.first_in_time)} – {fmtT(tip.r.last_out_time)} · {metrics(tip.r).hours.toFixed(1)}h</span>
            <span className="cal-metric">{tip.r.status.replace('_', ' ')}{tip.r.shift_name ? ` · ${tip.r.shift_name}` : ''}</span>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.875rem', alignItems: 'center', marginTop: '0.5rem' }}>
        <span className="eyebrow">Less</span>
        {['heat-none', 'heat-r1', 'heat-r2', 'heat-r3', 'heat-r4'].map(c => <span key={c} className={`heat-sq ${c}`} style={{ width: '0.75rem', height: '0.75rem', animation: 'none' }} />)}
        <span className="eyebrow">More</span>
        <span className="cal-metric" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Check size={12} /> click a day for details</span>
      </div>
    </div>
  );
}

export { fmtT as fmtCellTime, ST_CLASS, ST_PILL };
