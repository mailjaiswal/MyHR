import React, { useState, useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import CalendarRangePicker from './CalendarRangePicker';

const MODES = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom' }
];

export default function DateRangePicker({ dateRange, setMode, setCustom }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  return (
    <div className="date-range-picker" style={{ position: 'relative' }} ref={wrapRef}>
      <div className="seg">
        {MODES.map(m => (
          <button
            key={m.key}
            className={`seg-btn ${dateRange.mode === m.key ? 'seg-btn-active' : ''}`}
            onClick={() => {
              setMode(m.key);
              if (m.key === 'custom') setOpen(o => !o);
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {dateRange.mode === 'custom' && (
        <button className="island-btn" style={{ marginLeft: '0.5rem' }} onClick={() => setOpen(o => !o)}>
          <span className="icon-orb"><CalendarDays size={13} /></span>
          {dateRange.from && dateRange.to && dateRange.from === dateRange.to
            ? dateRange.from
            : `${dateRange.from || '…'} → ${dateRange.to || '…'}`}
        </button>
      )}

      {open && dateRange.mode === 'custom' && (
        <div style={{ position: 'absolute', top: 'calc(100% + 0.25rem)', left: 0, zIndex: 40 }}>
          <CalendarRangePicker
            from={dateRange.from}
            to={dateRange.to}
            onApply={(from, to) => { setCustom(from, to); setOpen(false); }}
            onClose={() => setOpen(false)}
          />
        </div>
      )}

      <span className="date-range-label">{dateRange.label}</span>
    </div>
  );
}
