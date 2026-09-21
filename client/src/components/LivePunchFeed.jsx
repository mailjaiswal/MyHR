import React, { useState, useEffect } from 'react';
import { Activity, Clock, ScanFace } from 'lucide-react';

export default function LivePunchFeed() {
  const [punches, setPunches] = useState([
    {
      id: 'init_1',
      employeeName: 'Sneha Goswami',
      code: 'DNH-101',
      designation: 'Senior ICU In-Charge Staff Nurse',
      shift: 'Night Duty Shift (Cross-Midnight)',
      device: 'eSSL Face Scanner (ICU)',
      time: 'Just now',
      status: 'OVERTIME',
      hours: '12.2h'
    },
    {
      id: 'init_2',
      employeeName: 'Dr. Priya Sharma',
      code: 'DNH-103',
      designation: 'Consultant Gynecologist',
      shift: 'Morning Duty Shift',
      device: 'eSSL K90 Pro (Reception)',
      time: '12m ago',
      status: 'PRESENT',
      hours: '4.2h'
    },
    {
      id: 'init_3',
      employeeName: 'Rajesh Ahirwar',
      code: 'DNH-105',
      designation: 'Lead Laboratory Technician',
      shift: 'Morning Duty Shift',
      device: 'eSSL K90 Pro (Reception)',
      time: '28m ago',
      status: 'PRESENT',
      hours: '4.5h'
    }
  ]);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const sse = new EventSource('/api/v1/biometrics/stream');

    sse.addEventListener('PUNCH_EVENT', (event) => {
      try {
        const data = JSON.parse(event.data);
        const res = data.result;
        if (res && res.employee) {
          const newPunch = {
            id: res.punchId || String(Date.now()),
            employeeName: res.employee.name,
            code: res.employee.code,
            designation: res.employee.designation,
            shift: res.employee.shift,
            device: 'Anubhav eSSL Biometric Scanner',
            time: 'Just now',
            status: res.dayStatus || 'PRESENT',
            hours: `${res.totalHours || 0}h`
          };

          setPunches(prev => [newPunch, ...prev.slice(0, 6)]);
          setPulse(true);
          setTimeout(() => setPulse(false), 1500);
        }
      } catch (err) {
        console.error('Failed to parse punch SSE event:', err);
      }
    });

    return () => {
      sse.close();
    };
  }, []);

  return (
    <div className="swaniki-card-flat" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span className="live-beacon"></span>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--text-heading)' }}>
            Live Hardware Stream
          </h3>
        </div>
        <span className="pill-badge pill-emerald">
          SSE Connected
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', flex: 1, overflowY: 'auto' }}>
        {punches.map((p, idx) => {
          const isSneha = p.employeeName.includes('Sneha Goswami');
          return (
            <div
              key={p.id || idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                borderRadius: '0.875rem',
                background: isSneha ? 'var(--brand-primary-light)' : 'var(--bg-surface-subtle)',
                border: isSneha ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border-color)',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '2.25rem',
                  height: '2.25rem',
                  borderRadius: '0.625rem',
                  background: isSneha ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem'
                }}>
                  {isSneha ? '👩‍⚕️' : '👤'}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <strong style={{ fontSize: '0.8125rem', color: isSneha ? 'var(--brand-primary)' : 'var(--text-heading)', fontWeight: 800 }}>
                      {p.employeeName}
                    </strong>
                    {isSneha && (
                      <span className="pill-badge pill-emerald" style={{ fontSize: '0.5625rem', padding: '0.05rem 0.35rem' }}>
                        DEMO NURSE
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                    {p.designation} • {p.code}
                  </p>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span className={`pill-badge ${p.status === 'OVERTIME' ? 'pill-indigo' : 'pill-emerald'}`} style={{ fontSize: '0.625rem' }}>
                  {p.status} ({p.hours})
                </span>
                <p style={{ fontSize: '0.6875rem', color: 'var(--text-caption)', marginTop: '0.2rem' }}>
                  {p.time}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
