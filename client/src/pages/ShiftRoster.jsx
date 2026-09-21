import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useOrganization } from '../context/OrganizationContext';
import { Clock, ShieldCheck, AlertCircle, Moon, Sun, Sunrise, Sunset, Edit3, Save, X, Check, Calendar } from 'lucide-react';
import Shift24HourTimeline from '../components/Shift24HourTimeline';

export default function ShiftRoster() {
  const { org } = useOrganization();
  const { authFetch: fetch, hasPerm } = useAuth();
  const { isDark } = useTheme();
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [editingShift, setEditingShift] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    start_time: '',
    end_time: '',
    duration_hours: 8.0,
    is_cross_midnight: 0
  });
  const [saveStatus, setSaveStatus] = useState(null);

  const loadData = () => {
    fetch('/api/v1/organization/shifts')
      .then(r => r.json())
      .then(d => { if (d.success) setShifts(d.shifts); });

    fetch('/api/v1/organization/employees')
      .then(r => r.json())
      .then(d => { if (d.success) setEmployees(d.employees); });
  };

  useEffect(() => {
    loadData();
  }, []);

  const getShiftIcon = (name) => {
    if (name.includes('Morning')) return <Sunrise size={18} color="#fbbf24" />;
    if (name.includes('Evening')) return <Sunset size={18} color="#f97316" />;
    if (name.includes('Night')) return <Moon size={18} color={isDark ? '#00f2fe' : '#8b5cf6'} />;
    return <Sun size={18} color="#38bdf8" />;
  };

  const handleStartEdit = (shift) => {
    setEditingShift(shift.id);
    setEditForm({
      name: shift.name,
      start_time: shift.start_time,
      end_time: shift.end_time,
      duration_hours: shift.duration_hours,
      is_cross_midnight: shift.is_cross_midnight
    });
    setSaveStatus(null);
  };

  const handleSaveShift = async (shiftId) => {
    try {
      const res = await fetch(`/api/v1/organization/shifts/${shiftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus(`Shift '${editForm.name}' updated successfully!`);
        setEditingShift(null);
        loadData();
      } else {
        alert(data.error || 'Failed to update shift');
      }
    } catch (err) {
      alert(`Error saving shift: ${err.message}`);
    }
  };

  const isSuperAdmin = hasPerm('ROSTER_EDIT');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.35rem' }}>
            <span className="pill-badge pill-indigo">ROSTER CONFIGURATION</span>
            <span className="eyebrow-italic">24×7 Workforce Continuity</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--text-heading)', letterSpacing: '-0.025em' }}>
            24×7 <em style={{ fontStyle: 'italic', color: isDark ? 'var(--brand-cyan)' : 'var(--brand-indigo)' }}>Rotational Shift Roster</em>
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Flexible shift configuration for Super Admin with dynamic cross-midnight duty date resolution.
          </p>
        </div>

        {isSuperAdmin && (
          <span className="pill-badge pill-rose" style={{ padding: '0.35rem 0.75rem' }}>
            SUPER ADMIN SHIFT EDITING ENABLED
          </span>
        )}
      </div>

      {saveStatus && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '0.75rem',
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.8125rem',
          color: '#10b981',
          fontWeight: 600
        }}>
          <Check size={16} />
          <span>{saveStatus}</span>
        </div>
      )}

      {/* Visual 24-Hour Coverage Matrix with Overlaps */}
      <Shift24HourTimeline />

      {/* Threshold Policies Banner */}
      <div className="swaniki-card" style={{
        padding: '1.5rem',
        background: isDark
          ? 'linear-gradient(135deg, rgba(0, 242, 254, 0.08), rgba(18, 22, 32, 0.95))'
          : 'linear-gradient(135deg, rgba(79, 70, 229, 0.05), var(--bg-surface))',
        border: `1px solid ${isDark ? 'rgba(0, 242, 254, 0.3)' : '#c7d2fe'}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <ShieldCheck size={20} color={isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)'} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-heading)' }}>
            Active Biometric Threshold Policies
          </h3>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Calculated automatically from first and last punch times with strict 7.45h / 3.45h rules.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '0.75rem' }}>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase' }}>FULL DAY THRESHOLD</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 900, color: '#10b981', marginTop: '0.25rem' }}>≥ 7.45 Hours</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Full day shift credited (PRESENT)</p>
          </div>

          <div style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '0.75rem' }}>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase' }}>HALF DAY WINDOW</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f59e0b', marginTop: '0.25rem' }}>3.45 – 7.44 Hours</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Half day deduction (HALF_DAY)</p>
          </div>

          <div style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '0.75rem' }}>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase' }}>ABSENT CUTOFF</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 900, color: '#ef4444', marginTop: '0.25rem' }}>&lt; 3.45 Hours</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Marked absent (ABSENT)</p>
          </div>

          <div style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '0.75rem' }}>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase' }}>CROSS-MIDNIGHT SHIFT</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 900, color: isDark ? 'var(--brand-cyan)' : 'var(--brand-indigo)', marginTop: '0.25rem' }}>20:00 – 08:00</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Anchored to duty date without split</p>
          </div>
        </div>
      </div>

      {/* Shifts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        {shifts.map(shift => {
          const isEditing = editingShift === shift.id;

          return (
            <div key={shift.id} className="swaniki-card" style={{ padding: '1.5rem', position: 'relative' }}>
              {isEditing ? (
                /* Inline Edit Form for Super Admin */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: '0.875rem', color: 'var(--text-heading)' }}>
                      Edit Shift: {shift.name}
                    </strong>
                    <button
                      onClick={() => setEditingShift(null)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.6875rem', color: 'var(--text-caption)', fontWeight: 700 }}>SHIFT NAME</label>
                    <input
                      type="text"
                      className="input-field"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ fontSize: '0.6875rem', color: 'var(--text-caption)', fontWeight: 700 }}>START TIME</label>
                      <input
                        type="time"
                        className="input-field"
                        value={editForm.start_time}
                        onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.6875rem', color: 'var(--text-caption)', fontWeight: 700 }}>END TIME</label>
                      <input
                        type="time"
                        className="input-field"
                        value={editForm.end_time}
                        onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ fontSize: '0.6875rem', color: 'var(--text-caption)', fontWeight: 700 }}>DURATION (HRS)</label>
                      <input
                        type="number"
                        step="0.5"
                        className="input-field"
                        value={editForm.duration_hours}
                        onChange={(e) => setEditForm({ ...editForm, duration_hours: parseFloat(e.target.value) || 8.0 })}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <label style={{ fontSize: '0.6875rem', color: 'var(--text-caption)', fontWeight: 700 }}>CROSS-MIDNIGHT</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-heading)', marginTop: '0.35rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={editForm.is_cross_midnight === 1}
                          onChange={(e) => setEditForm({ ...editForm, is_cross_midnight: e.target.checked ? 1 : 0 })}
                        />
                        <span>Night Rota</span>
                      </label>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSaveShift(shift.id)}
                    className="btn-swaniki btn-swaniki-primary"
                    style={{ marginTop: '0.5rem', width: '100%', fontSize: '0.75rem' }}
                  >
                    <Save size={14} />
                    <span>Save Shift Timings</span>
                  </button>
                </div>
              ) : (
                /* Normal Display View */
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {getShiftIcon(shift.name)}
                      <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-heading)' }}>
                        {shift.name}
                      </h3>
                    </div>
                    {shift.is_cross_midnight === 1 && (
                      <span className="pill-badge pill-indigo" style={{ fontSize: '0.625rem' }}>
                        Cross-Midnight
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1.35rem', fontWeight: 900, color: isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)' }}>
                      {shift.start_time} – {shift.end_time}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      ({shift.duration_hours}h duration)
                    </span>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.75rem' }}>
                    <p>Full Day Threshold: <strong style={{ color: 'var(--text-heading)' }}>≥ 7.45 hrs</strong></p>
                    <p>Half Day Minimum: <strong style={{ color: 'var(--text-heading)' }}>3.45 hrs</strong></p>
                    <p>Assigned Staff: <strong style={{ color: isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)' }}>
                      {employees.filter(e => e.shift_id === shift.id).length} staff members
                    </strong></p>
                  </div>

                  {isSuperAdmin && (
                    <button
                      onClick={() => handleStartEdit(shift)}
                      className="btn-swaniki btn-swaniki-ghost"
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', width: '100%' }}
                    >
                      <Edit3 size={14} />
                      <span>Configure Timings</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Staff Shift Mapping Table */}
      <div className="swaniki-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-heading)' }}>
              {org ? `${org.name} Roster Staff Assignments` : 'Roster Staff Assignments'}
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              Real-time assignment across ICU, Emergency, OT, and Inpatient units
            </p>
          </div>
          <span className="pill-badge pill-emerald">50 ACTIVE PERSONNEL</span>
        </div>

        <div className="table-wrapper">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Employee Code &amp; Name</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Assigned Roster Shift</th>
                <th>Duty Timings</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                const isSneha = emp.full_name?.includes('Sneha Goswami');
                return (
                  <tr key={emp.id} style={{ background: isSneha ? (isDark ? 'rgba(0, 242, 254, 0.08)' : 'rgba(79, 70, 229, 0.05)') : undefined }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ color: 'var(--text-heading)' }}>{emp.full_name}</strong>
                        {isSneha && (
                          <span className="pill-badge pill-emerald" style={{ fontSize: '0.5625rem', padding: '0.05rem 0.35rem' }}>
                            DEMO NURSE
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{emp.employee_code}</span>
                    </td>
                    <td style={{ color: 'var(--text-body)' }}>{emp.department_name}</td>
                    <td style={{ color: 'var(--text-body)' }}>{emp.designation}</td>
                    <td>
                      <span className={`pill-badge ${emp.shift_name?.includes('Night') ? 'pill-indigo' : 'pill-emerald'}`}>
                        {emp.shift_name}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {emp.shift_name?.includes('Night') ? '20:00 – 08:00 (12h)' : '08:00 – 16:00 (8h)'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
