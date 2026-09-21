import React, { useState, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  Cpu,
  Flame,
  ArrowUpRight,
  Filter,
  ShieldCheck,
  Building2,
  HeartPulse,
  Syringe,
  Activity
} from 'lucide-react';

export default function DataDrilldownModal({ isOpen, onClose, type = 'ATTENDANCE', period = 'day' }) {
  const { isDark } = useTheme();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  if (!isOpen) return null;

  // Mock comprehensive data set for drill-downs based on Dubey Nursing Home records
  const staffData = [
    { id: 'DNH-101', name: 'Sneha Goswami', role: 'Senior Staff Nurse', dept: 'ICU Ward', shift: 'Night (20:00 - 08:00)', in: '19:54', out: '08:06', hours: '12.2h', status: 'PRESENT', ot: '4.2h', grace: '0m' },
    { id: 'DNH-102', name: 'Dr. Priya Sharma', role: 'HR & Medical Supt', dept: 'Administration', shift: 'General (09:00 - 17:00)', in: '09:05', out: '17:15', hours: '8.1h', status: 'PRESENT', ot: '0.1h', grace: '5m' },
    { id: 'DNH-103', name: 'Rajesh Patel', role: 'ICU Staff Nurse', dept: 'ICU Ward', shift: 'Evening (14:00 - 22:00)', in: '13:58', out: '22:12', hours: '8.2h', status: 'PRESENT', ot: '0.2h', grace: '0m' },
    { id: 'DNH-104', name: 'Anjali Verma', role: 'OT Staff Nurse', dept: 'Operation OT', shift: 'Morning (08:00 - 16:00)', in: '07:55', out: '16:05', hours: '8.1h', status: 'PRESENT', ot: '0.1h', grace: '0m' },
    { id: 'DNH-105', name: 'Vikas Deshmukh', role: 'OT Technician', dept: 'Operation OT', shift: 'Morning (08:00 - 16:00)', in: '08:12', out: '16:10', hours: '7.9h', status: 'PRESENT', ot: '0.0h', grace: '12m' },
    { id: 'DNH-106', name: 'Sunita Yadav', role: 'General Ward Nurse', dept: 'Inpatient Wards', shift: 'Morning (08:00 - 16:00)', in: '08:02', out: '16:00', hours: '7.9h', status: 'PRESENT', ot: '0.0h', grace: '2m' },
    { id: 'DNH-107', name: 'Manoj Kumar', role: 'Ward Boy / Attendant', dept: 'Emergency', shift: 'Evening (14:00 - 22:00)', in: '14:20', out: '22:05', hours: '7.7h', status: 'PRESENT', ot: '0.0h', grace: '20m (Grace Exceeded)' },
    { id: 'DNH-108', name: 'Kavita Chouksey', role: 'Staff Nurse', dept: 'Emergency', shift: 'Morning (08:00 - 16:00)', in: '08:00', out: '13:00', hours: '5.0h', status: 'HALF_DAY', ot: '0.0h', grace: '0m' },
    { id: 'DNH-109', name: 'Sunil Pawar', role: 'Security & Helper', dept: 'Administration', shift: 'Night (20:00 - 08:00)', in: '--', out: '--', hours: '0.0h', status: 'ABSENT', ot: '0.0h', grace: '--' },
    { id: 'DNH-110', name: 'Pooja Tiwari', role: 'Dialysis Nurse', dept: 'Inpatient Wards', shift: 'Morning (08:00 - 16:00)', in: '08:04', out: '16:18', hours: '8.2h', status: 'PRESENT', ot: '0.2h', grace: '4m' },
    { id: 'DNH-111', name: 'Deepak Sahu', role: 'Lab Technician', dept: 'Administration', shift: 'General (09:00 - 17:00)', in: '08:58', out: '17:30', hours: '8.5h', status: 'PRESENT', ot: '0.5h', grace: '0m' },
    { id: 'DNH-112', name: 'Meena Thakur', role: 'ANM Staff Nurse', dept: 'Inpatient Wards', shift: 'Evening (14:00 - 22:00)', in: '--', out: '--', hours: '0.0h', status: 'ABSENT', ot: '0.0h', grace: '--' }
  ];

  const wardData = [
    { name: 'ICU Ward', icon: HeartPulse, color: '#00f2fe', required: 4, active: 4, ratio: '1:1 Critical', lead: 'Sneha Goswami', status: '100% Fully Covered' },
    { name: 'Emergency Casualty', icon: Activity, color: '#f43f5e', required: 3, active: 3, ratio: '1:3 Emergency', lead: 'Dr. Priya Sharma', status: 'Safe Coverage' },
    { name: 'Operation OT', icon: Syringe, color: '#8b5cf6', required: 3, active: 3, ratio: 'Ready for Surgeries', lead: 'Anjali Verma', status: '100% Prepared' },
    { name: 'General Inpatient Wards', icon: Building2, color: '#10b981', required: 6, active: 5, ratio: '1:6 General', lead: 'Sunita Yadav', status: '1 Nurse on Leave' }
  ];

  const hardwareData = [
    { serial: 'DNH-E-01', model: 'eSSL uFace 302', location: 'ICU & Emergency Entrance', ip: '192.168.1.201', port: 4370, status: 'ONLINE', ping: '12ms', punchesToday: 184, firmware: 'Ver 8.2.1 Pro' },
    { serial: 'DNH-E-02', model: 'eSSL K90 Pro', location: 'Operation Theatre Clean Room', ip: '192.168.1.202', port: 4370, status: 'ONLINE', ping: '14ms', punchesToday: 112, firmware: 'Ver 6.8.0 Std' },
    { serial: 'DNH-E-03', model: 'ZKTeco SpeedFace-V5L', location: 'Main Hospital Reception', ip: '192.168.1.203', port: 4370, status: 'ONLINE', ping: '16ms', punchesToday: 246, firmware: 'Ver 11.4 AI' }
  ];

  const filteredStaff = useMemo(() => {
    return staffData.filter(staff => {
      const matchesSearch = staff.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            staff.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            staff.dept.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || staff.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [searchTerm, statusFilter]);

  const getTitleInfo = () => {
    switch (type) {
      case 'ATTENDANCE':
        return {
          title: 'Hospital Attendance & Duty Drilldown',
          desc: `Granular view of staff punch records, hours rendered, and attendance status (${period.toUpperCase()} view)`
        };
      case 'WARD_STAFFING':
        return {
          title: 'Ward Coverage & Clinical Ratio Drilldown',
          desc: 'Real-time nurse-to-patient coverage and shift leaders across hospital units'
        };
      case 'HARDWARE':
        return {
          title: 'Biometric Gateway & Terminal Telemetry',
          desc: 'Connected eSSL & ZKTeco biometric edge hardware with ping and sync metrics'
        };
      case 'PUNCTUALITY':
        return {
          title: 'Punctuality, Grace Periods & Overtime Audit',
          desc: 'Detailed breakdown of 15m grace period usage and 1.5x overtime hours'
        };
      default:
        return {
          title: 'Data Drilldown Analysis',
          desc: `Interactive breakdown of hospital operational records (${period.toUpperCase()} view)`
        };
    }
  };

  const titleInfo = getTitleInfo();

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      zIndex: 200,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div
        className="swaniki-card"
        style={{
          width: '100%',
          maxWidth: '960px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderRadius: '1.25rem',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '1.25rem 1.75rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-surface-subtle)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
                {titleInfo.title}
              </h2>
              <span style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                padding: '0.15rem 0.5rem',
                borderRadius: '9999px',
                background: isDark ? 'rgba(0, 242, 254, 0.15)' : 'var(--brand-primary-light)',
                color: isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)',
                textTransform: 'uppercase'
              }}>
                {period} View
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              {titleInfo.desc}
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-heading)',
              borderRadius: '0.625rem',
              width: '2rem',
              height: '2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {type === 'ATTENDANCE' || type === 'PUNCTUALITY' ? (
            <>
              {/* Search & Filter Controls */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{
                  position: 'relative',
                  flex: 1,
                  minWidth: '220px',
                  maxWidth: '380px'
                }}>
                  <Search size={15} color="var(--text-caption)" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    placeholder="Search by staff name, ID or ward..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                      background: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '0.625rem',
                      color: 'var(--text-heading)',
                      fontSize: '0.8125rem',
                      outline: 'none'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {['ALL', 'PRESENT', 'HALF_DAY', 'ABSENT'].map(status => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '0.5rem',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: '1px solid var(--border-color)',
                        background: statusFilter === status
                          ? (isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)')
                          : 'var(--bg-surface-subtle)',
                        color: statusFilter === status
                          ? (isDark ? '#0a0c10' : '#ffffff')
                          : 'var(--text-body)'
                      }}
                    >
                      {status.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table Records */}
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '0.75rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface-subtle)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Staff Member</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Ward / Shift</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Punch In / Out</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Duty Hours</th>
                      <th style={{ padding: '0.75rem 1rem' }}>{type === 'PUNCTUALITY' ? 'Grace / OT' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStaff.map((staff, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.15s' }}>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{staff.name}</div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>{staff.id} • {staff.role}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{ color: 'var(--text-body)', fontWeight: 500 }}>{staff.dept}</span>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{staff.shift}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: 'var(--text-heading)' }}>
                          {staff.in} → {staff.out}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-heading)' }}>
                          {staff.hours}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {type === 'PUNCTUALITY' ? (
                            <div>
                              <div style={{ fontSize: '0.75rem', color: staff.grace.includes('Exceeded') ? 'var(--brand-rose)' : 'var(--text-body)' }}>
                                Grace: {staff.grace}
                              </div>
                              <div style={{ fontSize: '0.6875rem', color: 'var(--brand-primary)', fontWeight: 600 }}>
                                OT: {staff.ot}
                              </div>
                            </div>
                          ) : (
                            <span style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '9999px',
                              fontSize: '0.6875rem',
                              fontWeight: 600,
                              background: staff.status === 'PRESENT'
                                ? 'rgba(16, 185, 129, 0.12)'
                                : staff.status === 'HALF_DAY'
                                ? 'rgba(245, 158, 11, 0.12)'
                                : 'rgba(239, 68, 68, 0.12)',
                              color: staff.status === 'PRESENT'
                                ? '#10b981'
                                : staff.status === 'HALF_DAY'
                                ? '#f59e0b'
                                : '#ef4444'
                            }}>
                              {staff.status === 'PRESENT' ? 'Full Day (≥7.45h)' : staff.status === 'HALF_DAY' ? 'Half Day (3.45-7.44h)' : 'Absent (<3.45h)'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : type === 'WARD_STAFFING' ? (
            /* Ward Coverage View */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {wardData.map((ward, idx) => {
                const Icon = ward.icon;
                return (
                  <div key={idx} style={{
                    padding: '1.25rem',
                    borderRadius: '1rem',
                    background: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <div style={{
                          width: '2.25rem',
                          height: '2.25rem',
                          borderRadius: '0.5rem',
                          background: `${ward.color}20`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: ward.color
                        }}>
                          <Icon size={18} />
                        </div>
                        <div>
                          <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-heading)' }}>
                            {ward.name}
                          </h4>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            Lead: {ward.lead}
                          </span>
                        </div>
                      </div>
                      <span style={{
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '9999px',
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: '#10b981'
                      }}>
                        {ward.status}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Staffing Ratio</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{ward.ratio}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Active Nurses on Duty</span>
                      <span style={{ fontWeight: 600, color: ward.color }}>{ward.active} / {ward.required} Required</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Hardware Terminals View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {hardwareData.map((hw, idx) => (
                <div key={idx} style={{
                  padding: '1.25rem',
                  borderRadius: '1rem',
                  background: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '1rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                    <div style={{
                      width: '2.5rem',
                      height: '2.5rem',
                      borderRadius: '0.625rem',
                      background: 'rgba(0, 242, 254, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--brand-cyan)'
                    }}>
                      <Cpu size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-heading)', fontSize: '0.9375rem' }}>
                        {hw.model} <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)', fontWeight: 400 }}>({hw.serial})</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {hw.location} • LAN: {hw.ip}:{hw.port}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>Punches Ingested</div>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-heading)' }}>{hw.punchesToday}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>Ping Latency</div>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--brand-primary)' }}>{hw.ping}</div>
                    </div>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.25rem 0.65rem',
                      borderRadius: '9999px',
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: '#10b981',
                      fontSize: '0.72rem',
                      fontWeight: 600
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                      {hw.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '1rem 1.75rem',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-surface-subtle)'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            ABC Pvt Ltd • Telemetry synchronized live with Anubhav Infotech Webhook
          </div>
          <button
            onClick={onClose}
            className="btn-swaniki btn-swaniki-primary"
            style={{
              padding: '0.45rem 1.1rem',
              fontSize: '0.8125rem',
              background: isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)',
              color: isDark ? '#0a0c10' : '#ffffff'
            }}
          >
            Close Drilldown
          </button>
        </div>
      </div>
    </div>
  );
}
