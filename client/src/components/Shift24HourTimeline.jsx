import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  Clock,
  Users,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  ChevronRight,
  HeartPulse,
  Syringe,
  Activity,
  Building2
} from 'lucide-react';

export default function Shift24HourTimeline() {
  const { isDark } = useTheme();
  const [selectedShift, setSelectedShift] = useState(null);
  const [activeWardFilter, setActiveWardFilter] = useState('ALL');

  // 24 Hour timeline hours (every 2 hours)
  const hours = ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00', '24:00'];

  // Shifts definition with start/end percentages across 0h to 24h
  // 24h = 100% (1h = 4.166%)
  const shifts = [
    {
      id: 'morning',
      name: 'Morning Shift (A)',
      time: '08:00 — 16:00 (8h)',
      color: '#0284c7',
      bg: isDark ? 'rgba(2, 132, 199, 0.22)' : 'rgba(2, 132, 199, 0.12)',
      border: '#0284c7',
      startPct: (8 / 24) * 100,      // 33.33%
      widthPct: (8 / 24) * 100,      // 33.33%
      staffCount: 16,
      leads: ['Dr. Priya Sharma', 'Anjali Verma (OT)', 'Vikas Deshmukh', 'Sunita Yadav'],
      desc: 'Daytime OPD peak, scheduled OT surgeries & morning bedside rounds'
    },
    {
      id: 'general',
      name: 'General Day Shift',
      time: '09:00 — 17:00 (8h)',
      color: '#3b82f6',
      bg: isDark ? 'rgba(59, 130, 246, 0.22)' : 'rgba(59, 130, 246, 0.12)',
      border: '#3b82f6',
      startPct: (9 / 24) * 100,      // 37.5%
      widthPct: (8 / 24) * 100,      // 33.33%
      staffCount: 8,
      leads: ['Deepak Sahu (Lab)', 'Pooja Tiwari', 'Accounts & Admin'],
      desc: 'Diagnostics lab processing, pharmacy, billing & administrative duties'
    },
    {
      id: 'evening',
      name: 'Evening Shift (B)',
      time: '14:00 — 22:00 (8h)',
      color: '#10b981',
      bg: isDark ? 'rgba(16, 185, 129, 0.22)' : 'rgba(16, 185, 129, 0.12)',
      border: '#10b981',
      startPct: (14 / 24) * 100,     // 58.33%
      widthPct: (8 / 24) * 100,      // 33.33%
      staffCount: 14,
      leads: ['Rajesh Patel (ICU)', 'Manoj Kumar (ER)', 'Meena Thakur'],
      desc: 'Post-op patient monitoring, evening visitor management & emergency admissions'
    },
    {
      id: 'night_part1',
      name: 'Night Shift (C) • Evening Leg',
      time: '20:00 — 24:00 (4h before midnight)',
      color: '#8b5cf6',
      bg: isDark ? 'rgba(139, 92, 246, 0.22)' : 'rgba(139, 92, 246, 0.12)',
      border: '#8b5cf6',
      startPct: (20 / 24) * 100,     // 83.33%
      widthPct: (4 / 24) * 100,      // 16.67%
      staffCount: 12,
      leads: ['Sneha Goswami (Sr ICU Nurse)', 'Dr. Verma (On-Call Resident)', 'Sunil Pawar'],
      desc: 'Cross-midnight ICU ventilator monitoring, emergency casualty coverage'
    },
    {
      id: 'night_part2',
      name: 'Night Shift (C) • Post-Midnight Leg',
      time: '00:00 — 08:00 (8h post midnight)',
      color: '#8b5cf6',
      bg: isDark ? 'rgba(139, 92, 246, 0.22)' : 'rgba(139, 92, 246, 0.12)',
      border: '#8b5cf6',
      startPct: 0,                   // 0%
      widthPct: (8 / 24) * 100,      // 33.33%
      staffCount: 12,
      leads: ['Sneha Goswami (Sr ICU Nurse)', 'Dr. Verma (On-Call Resident)', 'Night Care Staff'],
      desc: 'Continuous duty date anchoring (no fragmented calendar split)'
    }
  ];

  // Clinical Handover Overlaps
  const overlaps = [
    {
      label: 'Clinical Handover: Shift A ↔ Shift B',
      window: '14:00 — 16:00 (2 Hours)',
      startPct: (14 / 24) * 100,
      widthPct: (2 / 24) * 100,
      staffOverlap: '30 Staff Present (Peak Coverage)',
      activity: 'Detailed Bedside Vitals Exchange, Medication Chart Handover & Surgeon Briefing'
    },
    {
      label: 'Critical Care Handover: Shift B ↔ Shift C',
      window: '20:00 — 22:00 (2 Hours)',
      startPct: (20 / 24) * 100,
      widthPct: (2 / 24) * 100,
      staffOverlap: '26 Staff Present (Double Coverage)',
      activity: 'Senior Nurse Sneha Goswami takes charge of ICU ventilators & ER resuscitation kits'
    }
  ];

  // Staffing density across 2-hour segments
  const densityProfile = [
    { time: '00-02', count: 12, level: 'Normal Night' },
    { time: '02-04', count: 12, level: 'Normal Night' },
    { time: '04-06', count: 12, level: 'Normal Night' },
    { time: '06-08', count: 14, level: 'Shift Transition' },
    { time: '08-10', count: 24, level: 'Morning Peak' },
    { time: '10-12', count: 24, level: 'OPD & Surgery' },
    { time: '12-14', count: 24, level: 'Standard Shift' },
    { time: '14-16', count: 30, level: 'Overlap Peak (A+B)' },
    { time: '16-18', count: 22, level: 'Evening Shift' },
    { time: '18-20', count: 14, level: 'Evening Shift' },
    { time: '20-22', count: 26, level: 'Overlap Peak (B+C)' },
    { time: '22-24', count: 12, level: 'Night Locked' }
  ];

  return (
    <div className="swaniki-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={18} color="var(--brand-primary)" />
            <h3 style={{ fontSize: '1.0625rem', fontWeight: 600, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
              24-Hour Hospital Shift Coverage Matrix
            </h3>
            <span style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              padding: '0.15rem 0.5rem',
              borderRadius: '9999px',
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#10b981'
            }}>
              Zero Coverage Gaps
            </span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Visual representation of 24h hospital coverage including 2-hour clinical handover overlap windows
          </p>
        </div>

        {/* Legend Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.72rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#0284c7' }}></span>
            <span style={{ color: 'var(--text-body)' }}>Morning (08-16)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#10b981' }}></span>
            <span style={{ color: 'var(--text-body)' }}>Evening (14-22)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#8b5cf6' }}></span>
            <span style={{ color: 'var(--text-body)' }}>Night Cross-Midnight (20-08)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#f59e0b' }}></span>
            <span style={{ color: 'var(--brand-amber)', fontWeight: 600 }}>Overlap Zones</span>
          </div>
        </div>
      </div>

      {/* Main 24-Hour Timeline Canvas */}
      <div style={{
        position: 'relative',
        background: 'var(--bg-surface-subtle)',
        border: '1px solid var(--border-color)',
        borderRadius: '1rem',
        padding: '1.25rem 1rem',
        overflowX: 'auto'
      }}>
        {/* Time Labels Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(12, 1fr)',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '0.5rem',
          marginBottom: '1rem',
          minWidth: '680px'
        }}>
          {hours.slice(0, 12).map((hr, idx) => (
            <div key={idx} className="timeline-hour-mark">
              {hr}
            </div>
          ))}
        </div>

        {/* Handover Overlap Bands (Visual Highlight Behind Shift Bars) */}
        <div style={{ position: 'relative', minWidth: '680px', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {/* Overlap Highlights Indicators */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, pointerEvents: 'none' }}>
            {overlaps.map((ov, idx) => (
              <div
                key={idx}
                className="overlap-striped-band"
                style={{
                  position: 'absolute',
                  left: `${ov.startPct}%`,
                  width: `${ov.widthPct}%`,
                  top: 0,
                  bottom: 0,
                  zIndex: 1
                }}
                title={`${ov.label} (${ov.window})`}
              />
            ))}
          </div>

          {/* Shift 1: Morning Shift (A) */}
          <div style={{ position: 'relative', zIndex: 2, height: '42px' }}>
            <div
              onClick={() => setSelectedShift(shifts[0])}
              style={{
                position: 'absolute',
                left: `${shifts[0].startPct}%`,
                width: `${shifts[0].widthPct}%`,
                height: '100%',
                background: shifts[0].bg,
                border: `1.5px solid ${shifts[0].border}`,
                borderRadius: '0.625rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 0.875rem',
                cursor: 'pointer',
                transition: 'all 0.18s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-heading)' }}>
                  {shifts[0].name}
                </span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  {shifts[0].time}
                </span>
              </div>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: shifts[0].color, background: 'var(--bg-surface)', padding: '0.15rem 0.45rem', borderRadius: '9999px' }}>
                {shifts[0].staffCount} Staff
              </span>
            </div>
          </div>

          {/* Shift 2: General Day Shift */}
          <div style={{ position: 'relative', zIndex: 2, height: '36px' }}>
            <div
              onClick={() => setSelectedShift(shifts[1])}
              style={{
                position: 'absolute',
                left: `${shifts[1].startPct}%`,
                width: `${shifts[1].widthPct}%`,
                height: '100%',
                background: shifts[1].bg,
                border: `1.5px solid ${shifts[1].border}`,
                borderRadius: '0.625rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 0.875rem',
                cursor: 'pointer',
                transition: 'all 0.18s ease'
              }}
            >
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-heading)' }}>
                {shifts[1].name} ({shifts[1].time})
              </span>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: shifts[1].color, background: 'var(--bg-surface)', padding: '0.15rem 0.45rem', borderRadius: '9999px' }}>
                {shifts[1].staffCount} Staff
              </span>
            </div>
          </div>

          {/* Shift 3: Evening Shift (B) */}
          <div style={{ position: 'relative', zIndex: 2, height: '42px' }}>
            <div
              onClick={() => setSelectedShift(shifts[2])}
              style={{
                position: 'absolute',
                left: `${shifts[2].startPct}%`,
                width: `${shifts[2].widthPct}%`,
                height: '100%',
                background: shifts[2].bg,
                border: `1.5px solid ${shifts[2].border}`,
                borderRadius: '0.625rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 0.875rem',
                cursor: 'pointer',
                transition: 'all 0.18s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-heading)' }}>
                  {shifts[2].name}
                </span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  {shifts[2].time}
                </span>
              </div>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: shifts[2].color, background: 'var(--bg-surface)', padding: '0.15rem 0.45rem', borderRadius: '9999px' }}>
                {shifts[2].staffCount} Staff
              </span>
            </div>
          </div>

          {/* Shift 4: Night Shift (C) - Cross-Midnight Visual (Split Across Canvas) */}
          <div style={{ position: 'relative', zIndex: 2, height: '46px' }}>
            {/* Post-midnight leg (00:00 - 08:00) */}
            <div
              onClick={() => setSelectedShift(shifts[3])}
              style={{
                position: 'absolute',
                left: `${shifts[4].startPct}%`,
                width: `${shifts[4].widthPct}%`,
                height: '100%',
                background: shifts[4].bg,
                border: `1.5px solid ${shifts[4].border}`,
                borderRadius: '0.625rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 0.875rem',
                cursor: 'pointer'
              }}
            >
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-heading)' }}>
                🌙 Night (C) • Morning Handover (00-08)
              </span>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#8b5cf6', background: 'var(--bg-surface)', padding: '0.15rem 0.45rem', borderRadius: '9999px' }}>
                12 Staff
              </span>
            </div>

            {/* Pre-midnight leg (20:00 - 24:00) */}
            <div
              onClick={() => setSelectedShift(shifts[3])}
              style={{
                position: 'absolute',
                left: `${shifts[3].startPct}%`,
                width: `${shifts[3].widthPct}%`,
                height: '100%',
                background: shifts[3].bg,
                border: `1.5px solid ${shifts[3].border}`,
                borderRadius: '0.625rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 0.875rem',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-heading)' }}>
                  🌙 Night (20-24)
                </span>
              </div>
              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#8b5cf6', background: 'var(--bg-surface)', padding: '0.15rem 0.4rem', borderRadius: '9999px' }}>
                Sneha Goswami
              </span>
            </div>
          </div>
        </div>

        {/* Handover Overlap Legend Callouts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', minWidth: '680px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-heading)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Documented Clinical Handover Windows (Zero-Gap Protocol)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
            {overlaps.map((ov, idx) => (
              <div key={idx} style={{
                padding: '0.75rem',
                borderRadius: '0.625rem',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-amber)' }}>
                    ⚡ {ov.label}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-caption)', fontFamily: 'monospace' }}>
                    {ov.window}
                  </span>
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-body)', lineHeight: 1.3 }}>
                  {ov.activity}
                </p>
                <div style={{ fontSize: '0.6875rem', color: 'var(--brand-primary)', fontWeight: 600 }}>
                  ✓ {ov.staffOverlap}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Selected Shift Detail Drawer (If clicked) */}
      {selectedShift && (
        <div style={{
          padding: '1rem 1.25rem',
          borderRadius: '0.75rem',
          background: 'var(--bg-surface-subtle)',
          border: `1px solid ${selectedShift.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-heading)', fontSize: '0.875rem' }}>{selectedShift.name}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({selectedShift.time})</span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-body)', marginTop: '0.2rem' }}>
              {selectedShift.desc}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-caption)' }}>Active Staff Leads:</span>
              {selectedShift.leads.map((lead, idx) => (
                <span key={idx} style={{
                  fontSize: '0.6875rem',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '0.375rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-heading)'
                }}>
                  {lead}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={() => setSelectedShift(null)}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              cursor: 'pointer'
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
