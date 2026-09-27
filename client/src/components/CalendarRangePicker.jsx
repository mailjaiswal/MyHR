import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import useEscapeClose from '../hooks/useEscapeClose';
import { useClampedSelfPopover } from '../hooks/useClampedPopover';

function pad(n) { return String(n).padStart(2, '0'); }
function toStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fromStr(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); }

const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function MonthGrid({ base, monthOffset, sel, onPick }) {
  const first = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday-first
  const todayStr = toStr(new Date());
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div style={{ flex: '1 1 0', minWidth: 0 }}>
      <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
        <span className="eyebrow" style={{ color: 'var(--text-heading)', fontWeight: 700 }}>
          {first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '0.25rem' }}>
        {DOW.map(w => <span key={w} className="eyebrow" style={{ textAlign: 'center', fontSize: '0.5625rem' }}>{w}</span>)}
      </div>
      <div className="crp-month">
        {cells.map((d, i) => {
          if (d === null) return <span key={`x${i}`} />;
          const date = new Date(first.getFullYear(), first.getMonth(), d);
          const ds = toStr(date);
          const inRange = sel.start && sel.end && ds >= sel.start && ds <= sel.end;
          const isEdge = sel.start === ds || sel.end === ds;
          const cls = ['crp-day', inRange && 'in-range', isEdge && 'edge', ds === todayStr && 'today'].filter(Boolean).join(' ');
          return (
            <button key={ds} type="button" className={cls} onClick={() => onPick(ds)}>
              <span className="crp-band" />
              <span className="crp-num">{d}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CalendarRangePicker({ from, to, onApply, onClose }) {
  const [base, setBase] = useState(() => {
    const d = from ? fromStr(from) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [sel, setSel] = useState({ start: from || '', end: to || '' });
  const ref = useRef(null);
  const clampStyle = useClampedSelfPopover(ref);
  const monthLabel = base.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

  useEscapeClose(true, onClose);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDoc); };
  }, [onClose]);

  const pick = (ds) => {
    setSel(prev => {
      if (!prev.start || (prev.start && prev.end)) return { start: ds, end: '' };
      if (ds < prev.start) return { start: ds, end: prev.start };
      return { ...prev, end: ds };
    });
  };

  const canApply = sel.start && sel.end;

  return (
    <div ref={ref} className="crp-popover bezel-card" style={{ position: 'absolute', top: 'calc(100% + 0.5rem)', left: 0, zIndex: 60, width: 'min(92vw, 540px)', ...clampStyle }}>
      <div className="bezel-inner" style={{ padding: '1rem 1.125rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <span className="eyebrow">Pick start &amp; end date</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <button className="icon-btn" onClick={() => setBase(new Date(base.getFullYear(), base.getMonth() - 1, 1))}><ChevronLeft size={15} /></button>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-heading)', minWidth: '4.5rem', textAlign: 'center' }}>{monthLabel}</span>
            <button className="icon-btn" onClick={() => setBase(new Date(base.getFullYear(), base.getMonth() + 1, 1))}><ChevronRight size={15} /></button>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button>
          </div>
        </div>

        {/* Two months side-by-side on desktop; second month hidden on small screens via CSS */}
        <div className="crp-months" style={{ display: 'flex', gap: '1.25rem' }}>
          <MonthGrid base={base} monthOffset={0} sel={sel} onPick={pick} />
          <div className="crp-second" style={{ flex: '1 1 0', minWidth: 0 }}><MonthGrid base={base} monthOffset={1} sel={sel} onPick={pick} /></div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.875rem', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.7188rem', color: 'var(--text-muted)' }} className="mono">
            {sel.start || '—'} {sel.end ? `→ ${sel.end}` : '→ pick end date'}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="island-btn" onClick={onClose}>Cancel</button>
            <button
              className="island-btn is-active"
              style={{ visibility: canApply ? 'visible' : 'hidden' }}
              onClick={() => canApply && onApply(sel.start, sel.end)}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 640px) { .crp-second { display: none !important; } }`}</style>
    </div>
  );
}
