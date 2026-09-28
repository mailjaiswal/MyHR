import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { Clock, ShieldCheck, AlertCircle, Moon, Sun, Sunrise, Sunset, Edit3, Save, X, Check, Calendar, Settings2, RefreshCw, FileDown } from 'lucide-react';
import Shift24HourTimeline from '../components/Shift24HourTimeline';
import RosterPrintModal from '../components/RosterPrintModal';

export default function ShiftRoster({ onNavigate }) {
  const { org } = useOrganization();
  const { authFetch: fetch, hasPerm } = useAuth();
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
  const [busyEmp, setBusyEmp] = useState(null);
  const [assignMsg, setAssignMsg] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

  const loadData = async () => {
    setRefreshing(true);
    try {
      const [shiftsRes, empsRes] = await Promise.all([
        fetch('/api/v1/organization/shifts').then(r => r.json()),
        fetch('/api/v1/organization/employees').then(r => r.json()),
      ]);
      if (shiftsRes.success) setShifts(shiftsRes.shifts);
      if (empsRes.success) setEmployees(empsRes.employees);
    } catch (err) {
      console.error('Failed to load roster data:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getShiftIcon = (name) => {
    if (name.includes('Morning')) return <Sunrise size={18} color="var(--brand-primary-ink)" />;
    if (name.includes('Evening')) return <Sunset size={18} color="var(--brand-primary-ink)" />;
    if (name.includes('Night')) return <Moon size={18} color="var(--brand-primary-ink)" />;
    return <Sun size={18} color="var(--brand-primary-ink)" />;
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
  const canAssign = hasPerm('EMPLOYEES_EDIT');
  const shiftById = Object.fromEntries(shifts.map(s => [s.id, s]));

  const changeEmployeeShift = async (empId, shiftId) => {
    setBusyEmp(empId);
    setAssignMsg(null);
    try {
      const res = await fetch(`/api/v1/organization/employees/${empId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: shiftId || null })
      });
      const data = await res.json();
      if (data.success) {
        setEmployees(prev => prev.map(e => e.id === empId ? { ...e, shift_id: data.employee.shift_id, shift_name: data.employee.shift_name } : e));
        setAssignMsg(`Assigned ${data.employee.full_name} to ${data.employee.shift_name || 'no shift'}`);
      } else {
        alert(data.error || 'Failed to update shift');
      }
    } catch (err) {
      alert(`Error updating shift: ${err.message}`);
    } finally {
      setBusyEmp(null);
    }
  };

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
            24-Hour <em className="highlight-italic">Shift Coverage Matrix</em>
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Live shift configuration and staff coverage, with dynamic cross-midnight duty date resolution.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            className="btn-swaniki btn-swaniki-ghost"
            onClick={loadData}
            disabled={refreshing}
            title="Reload shifts and staff assignments from the database"
            style={{ fontSize: '0.75rem', padding: '0.45rem 0.75rem', opacity: refreshing ? 0.6 : 1 }}
          >
            <RefreshCw size={14} style={{ marginRight: '0.35rem', verticalAlign: '-2px', animation: refreshing ? 'rotate 0.8s linear infinite' : 'none' }} />
            <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
          <button
            className="btn-swaniki btn-swaniki-primary"
            onClick={() => setShowPrint(true)}
            title="Preview and print / export the roster for the upcoming period"
            style={{ fontSize: '0.75rem', padding: '0.45rem 0.75rem' }}
          >
            <FileDown size={14} style={{ marginRight: '0.35rem', verticalAlign: '-2px' }} />
            <span>Print / Export Roster</span>
          </button>
          {(canAssign || isSuperAdmin) && onNavigate && (
            <button
              className="btn-swaniki btn-swaniki-ghost"
              onClick={() => onNavigate('settings', 'roster')}
              style={{ fontSize: '0.75rem', padding: '0.45rem 0.75rem' }}
            >
              <Settings2 size={14} style={{ marginRight: '0.35rem', verticalAlign: '-2px' }} />
              <span>Manage in Admin Panel</span>
            </button>
          )}
          {isSuperAdmin && (
            <span className="pill-badge pill-emerald" style={{ padding: '0.35rem 0.75rem' }}>
              SUPER ADMIN SHIFT EDITING ENABLED
            </span>
          )}
        </div>
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
          color: 'var(--brand-primary-ink)',
          fontWeight: 600
        }}>
          <Check size={16} />
          <span>{saveStatus}</span>
        </div>
      )}

      {assignMsg && (
        <div style={{ padding: '0.6rem 1rem', borderRadius: '0.6rem', background: 'var(--brand-primary-light)', border: '1px solid var(--border-color)', fontSize: '0.8125rem', color: 'var(--brand-primary-ink)', fontWeight: 600 }}>
          <Check size={13} style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />{assignMsg}
        </div>
      )}

      {/* Visual 24-Hour Coverage Matrix with Overlaps */}
      <Shift24HourTimeline shifts={shifts} employees={employees} loading={refreshing && !shifts.length} />

      {/* Threshold Policies Banner */}
      <div className="swaniki-card" style={{
        padding: '1.5rem',
        background: 'linear-gradient(135deg, var(--brand-primary-light), var(--bg-surface))'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <ShieldCheck size={20} color="var(--brand-primary-ink)" />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-heading)' }}>
            Active Biometric Threshold Policies
          </h3>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Calculated automatically from first and last punch times with strict 7.45h / 3.45h rules.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '0.75rem' }}>
            <span className="eyebrow">Full day threshold</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--brand-primary-ink)', marginTop: '0.25rem' }}>≥ 7.45 Hours</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Full day shift credited (PRESENT)</p>
          </div>

          <div style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '0.75rem' }}>
            <span className="eyebrow">Half day window</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--warning-ink)', marginTop: '0.25rem' }}>3.45 – 7.44 Hours</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Half day deduction (HALF_DAY)</p>
          </div>

          <div style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '0.75rem' }}>
            <span className="eyebrow">Absent cutoff</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--danger-ink)', marginTop: '0.25rem' }}>&lt; 3.45 Hours</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Marked absent (ABSENT)</p>
          </div>

          <div style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '0.75rem' }}>
            <span className="eyebrow">Cross-midnight shift</span>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-heading)', marginTop: '0.25rem' }}>20:00 – 08:00</p>
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
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-heading)' }}>
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
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--brand-primary-ink)' }}>
                      {shift.start_time} – {shift.end_time}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      ({shift.duration_hours}h duration)
                    </span>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.75rem' }}>
                    <p>Full Day Threshold: <strong style={{ color: 'var(--text-heading)' }}>≥ 7.45 hrs</strong></p>
                    <p>Half Day Minimum: <strong style={{ color: 'var(--text-heading)' }}>3.45 hrs</strong></p>
                    <p>Assigned Staff: <strong style={{ color: 'var(--brand-primary-ink)' }}>
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
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-heading)' }}>
              {org ? `${org.name} Roster Staff Assignments` : 'Roster Staff Assignments'}
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              {canAssign ? 'Use the dropdown on each row to assign a shift — changes save instantly.' : 'The duty shift assigned to each employee.'}
            </p>
          </div>
          <span className="pill-badge pill-emerald">{employees.length} ACTIVE PERSONNEL</span>
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
                  <tr key={emp.id} style={{ background: isSneha ? 'var(--brand-primary-light)' : undefined }}>
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
                      {canAssign ? (
                        <select
                          className="input"
                          style={{ width: 160, padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
                          value={emp.shift_id || ''}
                          disabled={busyEmp === emp.id}
                          onChange={ev => changeEmployeeShift(emp.id, ev.target.value || '')}
                        >
                          <option value="">— Unassigned —</option>
                          {shifts.map(sh => <option key={sh.id} value={sh.id}>{sh.name}</option>)}
                        </select>
                      ) : (
                        <span className={`pill-badge ${emp.shift_name?.includes('Night') ? 'pill-indigo' : 'pill-emerald'}`}>
                          {emp.shift_name || '—'}
                        </span>
                      )}
                    </td>
                    <td className="mono" style={{ color: 'var(--text-muted)' }}>
                      {(() => { const s = shiftById[emp.shift_id]; return s ? `${s.start_time?.slice(0, 5)} – ${s.end_time?.slice(0, 5)} (${s.duration_hours}h)` : '—'; })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showPrint && (
        <RosterPrintModal
          shifts={shifts}
          employees={employees}
          org={org}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  );
}
