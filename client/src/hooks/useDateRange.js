// client/src/hooks/useDateRange.js
import { useState, useCallback } from 'react';

function pad(n) { return String(n).padStart(2, '0'); }
function toStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function getRange(mode) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (mode) {
    case 'day':
      return { from: toStr(now), to: toStr(now), label: now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) };

    case 'week': {
      const day = now.getDay() || 7; // Mon=1..Sun=7
      const mon = new Date(now); mon.setDate(now.getDate() - day + 1);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { from: toStr(mon), to: toStr(sun), label: `Week of ${mon.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` };
    }

    case 'month': {
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      return { from: toStr(first), to: toStr(last), label: now.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) };
    }

    case 'quarter': {
      const qStart = new Date(y, Math.floor(m / 3) * 3, 1);
      const qEnd = new Date(y, Math.floor(m / 3) * 3 + 3, 0);
      return { from: toStr(qStart), to: toStr(qEnd), label: `Q${Math.floor(m / 3) + 1} ${y}` };
    }

    case 'year': {
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: `${y}` };
    }

    default:
      return { from: toStr(now), to: toStr(now), label: 'Today' };
  }
}

export function useDateRange(defaultMode = 'month') {
  const [dateRange, setDateRange] = useState(() => ({ mode: defaultMode, ...getRange(defaultMode) }));

  const setMode = useCallback((mode) => {
    if (mode === 'custom') {
      setDateRange(prev => ({ ...prev, mode: 'custom' }));
    } else {
      setDateRange({ mode, ...getRange(mode) });
    }
  }, []);

  const setCustom = useCallback((from, to) => {
    setDateRange({ mode: 'custom', from, to, label: `${from} to ${to}` });
  }, []);

  return { dateRange, setDateRange, setMode, setCustom, from: dateRange.from, to: dateRange.to };
}
