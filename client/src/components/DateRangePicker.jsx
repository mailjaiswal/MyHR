import React from 'react';
import { CalendarDays } from 'lucide-react';

const MODES = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom' }
];

export default function DateRangePicker({ dateRange, setMode, setCustom }) {
  return (
    <div className="date-range-picker">
      <div className="seg">
        {MODES.map(m => (
          <button
            key={m.key}
            className={`seg-btn ${dateRange.mode === m.key ? 'seg-btn-active' : ''}`}
            onClick={() => setMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {dateRange.mode === 'custom' && (
        <div className="custom-dates">
          <input
            type="date"
            value={dateRange.from}
            onChange={e => setCustom(e.target.value, dateRange.to)}
          />
          <CalendarDays size={14} style={{ color: 'var(--text-caption)' }} />
          <input
            type="date"
            value={dateRange.to}
            onChange={e => setCustom(dateRange.from, e.target.value)}
          />
        </div>
      )}

      <span className="date-range-label">{dateRange.label}</span>
    </div>
  );
}
