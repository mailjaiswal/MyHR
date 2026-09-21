import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Calendar, Clock, ChevronLeft, ChevronRight, MoreVertical, FileText, CheckCircle2 } from 'lucide-react';

export default function ShiftScheduleWidget({ onOpenPayslip, onViewMuster }) {
  const { isDark } = useTheme();
  const [selectedDay, setSelectedDay] = useState(2); // Wednesday (active today)
  const [activeShiftTab, setActiveShiftTab] = useState('active'); // 'active' | 'upcoming' | 'night'

  const days = [
    { day: 'Mon', date: 21 },
    { day: 'Tue', date: 22 },
    { day: 'Wed', date: 23 },
    { day: 'Thu', date: 24 },
    { day: 'Fri', date: 25 },
    { day: 'Sat', date: 26 },
    { day: 'Sun', date: 27 },
  ];

  return (
    <div
      className="swaniki-card"
      style={{
        padding: '1.5rem',
        borderRadius: '1rem',
        background: 'var(--bg-surface)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem'
      }}
    >
      {/* Widget Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-heading)' }}>
            24×7 Shift Schedule
          </h3>
          <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
            Hospital Rota & Critical Care Allocation
          </p>
        </div>
        <button style={{ background: 'transparent', border: 'none', color: 'var(--text-caption)', cursor: 'pointer' }}>
          <MoreVertical size={16} />
        </button>
      </div>

      {/* Horizontal Date Picker Strip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem' }}>
        <button
          style={{ background: 'transparent', border: 'none', color: 'var(--text-caption)', cursor: 'pointer', padding: '0.2rem' }}
          onClick={() => setSelectedDay(prev => Math.max(0, prev - 1))}
        >
          <ChevronLeft size={16} />
        </button>

        <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', padding: '0.2rem 0' }}>
          {days.map((item, idx) => (
            <div
              key={idx}
              className={`date-strip-item ${selectedDay === idx ? 'active' : ''}`}
              onClick={() => setSelectedDay(idx)}
              style={{
                borderRadius: '0.75rem',
                cursor: 'pointer'
              }}
            >
              <span style={{ fontSize: '0.6875rem', opacity: 0.8 }}>{item.day}</span>
              <span style={{ fontSize: '0.9375rem', fontWeight: 800 }}>{item.date}</span>
            </div>
          ))}
        </div>

        <button
          style={{ background: 'transparent', border: 'none', color: 'var(--text-caption)', cursor: 'pointer', padding: '0.2rem' }}
          onClick={() => setSelectedDay(prev => Math.min(days.length - 1, prev + 1))}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Shift Filter Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-subtle)',
        gap: '1.25rem',
        fontSize: '0.8125rem',
        fontWeight: 700
      }}>
        <button
          onClick={() => setActiveShiftTab('active')}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeShiftTab === 'active' ? `2px solid ${isDark ? 'var(--brand-cyan)' : 'var(--brand-indigo)'}` : '2px solid transparent',
            color: activeShiftTab === 'active' ? 'var(--text-heading)' : 'var(--text-muted)',
            padding: '0.5rem 0',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          Active Shifts
        </button>
        <button
          onClick={() => setActiveShiftTab('upcoming')}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeShiftTab === 'upcoming' ? `2px solid ${isDark ? 'var(--brand-cyan)' : 'var(--brand-indigo)'}` : '2px solid transparent',
            color: activeShiftTab === 'upcoming' ? 'var(--text-heading)' : 'var(--text-muted)',
            padding: '0.5rem 0',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          Upcoming Shifts
        </button>
        <button
          onClick={() => setActiveShiftTab('night')}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeShiftTab === 'night' ? `2px solid ${isDark ? 'var(--brand-cyan)' : 'var(--brand-indigo)'}` : '2px solid transparent',
            color: activeShiftTab === 'night' ? 'var(--text-heading)' : 'var(--text-muted)',
            padding: '0.5rem 0',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          Night Duty
        </button>
      </div>

      {/* Shift Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* Featured Card: Sneha Goswami */}
        <div
          style={{
            padding: '1rem',
            borderRadius: '0.875rem',
            background: isDark ? 'rgba(0, 242, 254, 0.04)' : '#f8fafd',
            border: isDark ? '1px solid rgba(0, 242, 254, 0.25)' : '1px solid #e0e7ff',
            boxShadow: isDark ? '0 0 12px 0 rgba(0, 242, 254, 0.1)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <strong style={{ fontSize: '0.875rem', color: 'var(--text-heading)' }}>
                  Sneha Goswami
                </strong>
                <span className="live-beacon" style={{ width: '6px', height: '6px' }}></span>
              </div>
              <p style={{ fontSize: '0.6875rem', color: isDark ? 'var(--brand-cyan)' : 'var(--brand-indigo)', fontWeight: 600 }}>
                Senior ICU In-Charge Staff Nurse
              </p>
            </div>
            <span className="pill-badge pill-emerald" style={{ fontSize: '0.625rem' }}>
              ON DUTY
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.5rem 0' }}>
            <Clock size={13} />
            <span>20:00 – 08:00 (Night Cross-Midnight)</span>
          </div>

          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', margin: '0.5rem 0' }}>
            <span className="badge-category">ICU Care</span>
            <span className="badge-category">eSSL Verified</span>
            <span className="badge-category" style={{ background: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5', color: '#10b981' }}>
              Duty Date Anchored
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
            <button
              onClick={() => onOpenPayslip && onOpenPayslip('emp_01', '2026-08')}
              className="btn-swaniki btn-swaniki-ghost"
              style={{ flex: 1, padding: '0.35rem 0.65rem', fontSize: '0.6875rem' }}
            >
              <FileText size={13} />
              <span>Aug Payslip</span>
            </button>
            <button
              onClick={onViewMuster}
              className="btn-swaniki btn-swaniki-ghost"
              style={{ padding: '0.35rem 0.65rem', fontSize: '0.6875rem' }}
            >
              <span>Logs</span>
            </button>
          </div>
        </div>

        {/* Secondary Doctor Shift Card */}
        <div
          style={{
            padding: '0.875rem',
            borderRadius: '0.875rem',
            background: 'var(--bg-surface-subtle)',
            border: '1px solid var(--border-color)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <strong style={{ fontSize: '0.8125rem', color: 'var(--text-heading)' }}>
                Dr. Sandeep Patel
              </strong>
              <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                Casualty Medical Officer • Emergency
              </p>
            </div>
            <span className="badge-category">08:00 – 16:00</span>
          </div>
        </div>

        {/* Tertiary Ward In-Charge Card */}
        <div
          style={{
            padding: '0.875rem',
            borderRadius: '0.875rem',
            background: 'var(--bg-surface-subtle)',
            border: '1px solid var(--border-color)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <strong style={{ fontSize: '0.8125rem', color: 'var(--text-heading)' }}>
                Bhavana Chourase
              </strong>
              <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                OT Lead Technician • Operation Theater
              </p>
            </div>
            <span className="badge-category">12:00 – 20:00</span>
          </div>
        </div>
      </div>
    </div>
  );
}
