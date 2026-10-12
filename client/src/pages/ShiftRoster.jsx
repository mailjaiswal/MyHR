import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { useTheme } from '../context/ThemeContext';
import { shiftColor, withAlpha } from '../utils/shiftColors';
import { Clock, ShieldCheck, AlertCircle, Moon, Sun, Sunrise, Sunset, Edit3, Save, X, Check, Calendar, Settings2, RefreshCw, FileDown, ChevronDown, Pencil, Loader2, Search } from 'lucide-react';
import Shift24HourTimeline from '../components/Shift24HourTimeline';
import RosterPrintModal from '../components/RosterPrintModal';

export default function ShiftRoster({ onNavigate }) {
  const { org } = useOrganization();
  const { isDark } = useTheme();
  const { authFetch: fetch, hasPerm } = useAuth();
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [editingShift, setEditingShift] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    start_time: '',
    end_time: '',
    duration_hours: 8.0,
    is_cross_midnight: 0,
    color_code: '#047857'
  });
  const [saveStatus, setSaveStatus] = useState(null);
  const [busyEmp, setBusyEmp] = useState(null);
  const [assignMsg, setAssignMsg] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [shiftFilter, setShiftFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

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

  const getShiftIcon = (name, color = 'var(--brand-primary-ink)') => {
    if (name.includes('Morning')) return <Sunrise size={18} color={color} />;
    if (name.includes('Evening')) return <Sunset size={18} color={color} />;
    if (name.includes('Night')) return <Moon size={18} color={color} />;
    return <Sun size={18} color={color} />;
  };

  const handleStartEdit = (shift) => {
    setEditingShift(shift.id);
    setEditForm({
      name: shift.name,
      start_time: shift.start_time,
      end_time: shift.end_time,
      duration_hours: shift.duration_hours,
      is_cross_midnight: shift.is_cross_midnight,
      color_code: shift.color_code || '#047857'
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
  const shiftColorById = Object.fromEntries(shifts.map((s, i) => [s.id, shiftColor(s, i, isDark)]));

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
        {shifts.map((shift, idx) => {
          const isEditing = editingShift === shift.id;
          const color = shiftColor(shift, idx, isDark);

          return (
            <div key={shift.id} className="swaniki-card" style={{ padding: '1.5rem', position: 'relative', borderLeft: `4px solid ${color}`, background: `linear-gradient(90deg, ${withAlpha(color, isDark ? 0.1 : 0.06)}, var(--bg-surface) 120px)` }}>
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

                  <div>
                    <label style={{ fontSize: '0.6875rem', color: 'var(--text-caption)', fontWeight: 700 }}>SHIFT COLOUR</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(editForm.color_code) ? editForm.color_code : '#047857'}
                        onChange={(e) => setEditForm({ ...editForm, color_code: e.target.value })}
                        style={{ width: 40, height: 34, padding: 2, borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}
                      />
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8125rem', color: 'var(--text-body)' }}>{editForm.color_code}</span>
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
                      {getShiftIcon(shift.name, color)}
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-heading)' }}>
                        {shift.name}
                      </h3>
                    </div>
                    {shift.is_cross_midnight === 1 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.625rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '9999px', color: 'var(--text-heading)', background: withAlpha(color, isDark ? 0.18 : 0.1), border: `1px solid ${withAlpha(color, 0.45)}` }}>
                        <span style={{ width: 6, height: 6, borderRadius: 9999, background: color }} /> Cross-Midnight
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem', marginBottom: '0.5rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: color, alignSelf: 'center', flexShrink: 0 }} />
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
                    <p style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />Assigned Staff: <strong style={{ color: 'var(--text-heading)' }}>
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
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>
                {org ? `${org.name} Roster Staff Assignments` : 'Roster Staff Assignments'}
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
                {canAssign ? 'Rows are color-coded by shift. Click any shift badge to reassign immediately.' : 'The duty shift assigned to each employee, color-coded by schedule.'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={14} style={{ position: 'absolute', left: '0.625rem', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  className="input"
                  placeholder="Filter personnel..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: '1.85rem', width: '180px', fontSize: '0.75rem', height: '2rem' }}
                />
              </div>
              <span className="pill-badge pill-emerald">{employees.length} ACTIVE PERSONNEL</span>
            </div>
          </div>

          {/* Shift Segmented Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', overflowX: 'auto', paddingBottom: '0.2rem' }}>
            <button
              type="button"
              onClick={() => setShiftFilter('ALL')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.6875rem',
                fontWeight: 600,
                padding: '0.28rem 0.65rem',
                borderRadius: '9999px',
                border: '1px solid',
                borderColor: shiftFilter === 'ALL' ? 'var(--brand-primary-ink)' : 'var(--border-color)',
                background: shiftFilter === 'ALL' ? 'var(--brand-primary-light)' : 'var(--bg-surface-subtle)',
                color: shiftFilter === 'ALL' ? 'var(--brand-primary-ink)' : 'var(--text-body)',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              All Staff ({employees.length})
            </button>
            {shifts.map((sh, idx) => {
              const c = shiftColorById[sh.id] || shiftColor(sh, idx, isDark);
              const count = employees.filter(e => e.shift_id === sh.id).length;
              const isSelected = shiftFilter === sh.id;
              return (
                <button
                  key={sh.id}
                  type="button"
                  onClick={() => setShiftFilter(sh.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    padding: '0.28rem 0.65rem',
                    borderRadius: '9999px',
                    border: '1px solid',
                    borderColor: isSelected ? c : withAlpha(c, 0.35),
                    background: isSelected ? withAlpha(c, isDark ? 0.25 : 0.12) : 'var(--bg-surface-subtle)',
                    color: isSelected ? 'var(--text-heading)' : 'var(--text-body)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
                  {sh.name} ({count})
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShiftFilter('UNASSIGNED')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.6875rem',
                fontWeight: 600,
                padding: '0.28rem 0.65rem',
                borderRadius: '9999px',
                border: '1px solid',
                borderColor: shiftFilter === 'UNASSIGNED' ? 'var(--warning-ink)' : 'var(--border-color)',
                background: shiftFilter === 'UNASSIGNED' ? 'rgba(217, 119, 6, 0.1)' : 'var(--bg-surface-subtle)',
                color: shiftFilter === 'UNASSIGNED' ? 'var(--warning-ink)' : 'var(--text-caption)',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Unassigned ({employees.filter(e => !e.shift_id).length})
            </button>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="clean-table">
            <thead>
              <tr>
                <th style={{ width: '28%' }}>Employee Code &amp; Name</th>
                <th style={{ width: '20%' }}>Department</th>
                <th style={{ width: '18%' }}>Designation</th>
                <th style={{ width: '20%' }}>Assigned Roster Shift (Editable)</th>
                <th style={{ width: '14%' }}>Duty Timings</th>
              </tr>
            </thead>
            <tbody>
              {employees
                .filter(emp => {
                  if (shiftFilter === 'UNASSIGNED' && emp.shift_id) return false;
                  if (shiftFilter !== 'ALL' && shiftFilter !== 'UNASSIGNED' && emp.shift_id !== shiftFilter) return false;
                  if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase();
                    const matchName = emp.full_name?.toLowerCase().includes(q);
                    const matchCode = emp.employee_code?.toLowerCase().includes(q);
                    const matchDept = emp.department_name?.toLowerCase().includes(q);
                    if (!matchName && !matchCode && !matchDept) return false;
                  }
                  return true;
                })
                .map(emp => {
                  const isSneha = emp.full_name?.includes('Sneha Goswami');
                  const rowColor = shiftColorById[emp.shift_id];
                  const isRowBusy = busyEmp === emp.id;
                  return (
                    <tr
                      key={emp.id}
                      style={{
                        background: rowColor
                          ? withAlpha(rowColor, isDark ? 0.14 : 0.05)
                          : (isSneha ? 'var(--brand-primary-light)' : undefined),
                        borderLeft: rowColor ? `4px solid ${rowColor}` : '4px solid transparent',
                        transition: 'background 0.2s ease, border-color 0.2s ease'
                      }}
                    >
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
                          <div
                            style={{
                              position: 'relative',
                              display: 'inline-flex',
                              alignItems: 'center',
                              maxWidth: '100%'
                            }}
                          >
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                padding: '0.35rem 0.65rem',
                                borderRadius: '8px',
                                background: rowColor
                                  ? withAlpha(rowColor, isDark ? 0.22 : 0.1)
                                  : 'var(--bg-surface)',
                                border: `1.5px solid ${rowColor ? withAlpha(rowColor, isDark ? 0.5 : 0.35) : 'var(--border-color)'}`,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                minWidth: '155px'
                              }}
                            >
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  background: rowColor || 'var(--text-muted)',
                                  flexShrink: 0,
                                  boxShadow: rowColor ? `0 0 6px ${withAlpha(rowColor, 0.6)}` : 'none'
                                }}
                              />
                              <span
                                style={{
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  color: emp.shift_name ? 'var(--text-heading)' : 'var(--text-muted)',
                                  flex: 1,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis'
                                }}
                              >
                                {emp.shift_name || '— Unassigned —'}
                              </span>
                              {isRowBusy ? (
                                <Loader2 size={13} className="spin" style={{ color: 'var(--brand-primary-ink)' }} />
                              ) : (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--text-muted)', opacity: 0.85 }}>
                                  <Pencil size={11} />
                                  <ChevronDown size={13} />
                                </div>
                              )}
                            </div>
                            <select
                              style={{
                                position: 'absolute',
                                inset: 0,
                                opacity: 0,
                                cursor: 'pointer',
                                width: '100%',
                                height: '100%'
                              }}
                              value={emp.shift_id || ''}
                              disabled={isRowBusy}
                              onChange={ev => changeEmployeeShift(emp.id, ev.target.value || '')}
                              title="Click to assign or change shift"
                            >
                              <option value="">— Unassigned —</option>
                              {shifts.map(sh => (
                                <option key={sh.id} value={sh.id}>
                                  {sh.name} ({sh.start_time?.slice(0, 5)} – {sh.end_time?.slice(0, 5)})
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          emp.shift_name ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.6875rem', fontWeight: 600, padding: '0.2rem 0.55rem', borderRadius: '9999px', color: 'var(--text-heading)', background: withAlpha(rowColor || '#64748b', isDark ? 0.18 : 0.1), border: `1px solid ${withAlpha(rowColor || '#64748b', 0.4)}` }}>
                              <span style={{ width: 7, height: 7, borderRadius: 9999, background: rowColor || 'var(--text-muted)' }} /> {emp.shift_name}
                            </span>
                          ) : '—'
                        )}
                      </td>
                      <td className="mono" style={{ color: 'var(--text-muted)' }}>
                        {(() => { const s = shiftById[emp.shift_id]; return s ? `${s.start_time?.slice(0, 5)} – ${s.end_time?.slice(0, 5)} (${s.duration_hours}h)` : '—'; })()}
                      </td>
                    </tr>
                  );
                })}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No staff records found.
                  </td>
                </tr>
              )}
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
