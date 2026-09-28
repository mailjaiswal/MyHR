import React, { useState, useMemo } from 'react';
import useEscapeClose from '../hooks/useEscapeClose';
import { shiftColor } from '../utils/shiftColors';
import { X, Printer, ChevronLeft, ChevronRight, FileText, Users, AlertTriangle } from 'lucide-react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function shiftLabelFor(shift) {
  const start = String(shift.start_time || '').slice(0, 5);
  const end = String(shift.end_time || '').slice(0, 5);
  const cross = Number(shift.is_cross_midnight) === 1 || (end && start && end <= start);
  return `${start} – ${end}${cross ? ' (next day)' : ''} · ${shift.duration_hours ?? '—'}h`;
}

/**
 * Publishable roster report: groups CURRENT staff assignments by shift and stamps
 * them for a chosen effective period (defaults to next month). Printing opens a
 * self-contained A4 document in a new window, so no global @media print CSS is
 * required and other print surfaces (payslip, custom report) are untouched.
 */
export default function RosterPrintModal({ shifts = [], employees = [], org = null, onClose }) {
  const today = new Date();
  const [period, setPeriod] = useState({ year: today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear(), month: (today.getMonth() + 1) % 12 });

  const moveMonth = (delta) => {
    setPeriod(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const grouped = useMemo(() => {
    const rows = shifts.map((shift, idx) => ({
      shift,
      order: idx + 1,
      color: shiftColor(shift, idx, false),
      staff: employees.filter(e => e.shift_id === shift.id),
    }));
    const unassigned = employees.filter(e => !e.shift_id || !shifts.some(s => s.id === e.shift_id));
    return { rows, unassigned };
  }, [shifts, employees]);

  const totalAssigned = grouped.rows.reduce((n, r) => n + r.staff.length, 0);
  const periodLabel = `${MONTH_NAMES[period.month]} ${period.year}`;
  const genDateStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const orgName = org?.name || 'Shift Roster';

  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const buildA4Document = () => {
    const sections = grouped.rows.map(({ shift, order, staff, color }) => {
      const body = staff.length
        ? staff.map(emp => `
            <tr>
              <td class="mono">${esc(emp.employee_code)}</td>
              <td class="name">${esc(emp.full_name)}</td>
              <td>${esc(emp.designation) || '—'}</td>
              <td>${esc(emp.department_name) || '—'}</td>
              <td class="mono">${esc(shiftLabelFor(shift))}</td>
            </tr>`).join('')
        : `<tr><td colspan="5" class="empty">No staff assigned to this shift for this period.</td></tr>`;
      return `
        <section class="shift-block">
          <div class="shift-head" style="border-left-color:${color}; background:${color}14;">
            <span class="shift-no" style="background:${color};">${order}</span>
            <span class="shift-name">${esc(shift.name)}</span>
            <span class="shift-time">${esc(shiftLabelFor(shift))}</span>
            <span class="shift-count">${staff.length} staff</span>
          </div>
          <table>
            <thead>
              <tr><th>Code</th><th>Employee Name</th><th>Designation</th><th>Department</th><th>Duty Timings</th></tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </section>`;
    }).join('');

    const unassignedSection = grouped.unassigned.length ? `
      <section class="shift-block warn">
        <div class="shift-head">
          <span class="shift-no">!</span>
          <span class="shift-name">Unassigned Personnel</span>
          <span class="shift-count">${grouped.unassigned.length} staff</span>
        </div>
        <table>
          <thead><tr><th>Code</th><th>Employee Name</th><th>Designation</th><th>Department</th><th>Duty Timings</th></tr></thead>
          <tbody>${grouped.unassigned.map(emp => `
            <tr>
              <td class="mono">${esc(emp.employee_code)}</td>
              <td class="name">${esc(emp.full_name)}</td>
              <td>${esc(emp.designation) || '—'}</td>
              <td>${esc(emp.department_name) || '—'}</td>
              <td class="mono">—</td>
            </tr>`).join('')}</tbody>
        </table>
      </section>` : '';

    return `<!DOCTYPE html>
<html><head><title>Shift Roster — ${esc(orgName)} — ${periodLabel}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; font-size: 10.5px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .doc-head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid #047857; padding-bottom: 8px; margin-bottom: 4px; }
  .doc-head h1 { font-size: 17px; letter-spacing: -0.02em; }
  .doc-head .sub { color: #64748b; font-size: 9.5px; margin-top: 2px; }
  .doc-meta { text-align: right; font-size: 9px; color: #64748b; }
  .doc-meta strong { display: block; font-size: 12.5px; color: #047857; letter-spacing: 0.04em; text-transform: uppercase; }
  .summary { display: flex; gap: 14px; margin: 8px 0 14px; font-size: 9.5px; color: #475569; }
  .summary span b { color: #1e293b; }
  .shift-block { margin-bottom: 14px; page-break-inside: avoid; }
  .shift-head { display: flex; align-items: center; gap: 8px; background: #f1f5f9; border-left: 3px solid #047857; padding: 5px 8px; margin-bottom: 4px; }
  .shift-block.warn .shift-head { border-left-color: #b45309; }
  .shift-no { width: 16px; height: 16px; border-radius: 4px; background: #047857; color: #fff; font-size: 9px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .shift-block.warn .shift-no { background: #b45309; }
  .shift-name { font-weight: 700; font-size: 11.5px; }
  .shift-time { color: #475569; font-size: 9.5px; }
  .shift-count { margin-left: auto; background: #fff; border: 1px solid #cbd5e1; border-radius: 999px; padding: 1px 8px; font-size: 9px; font-weight: 600; color: #334155; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; border-bottom: 1px solid #cbd5e1; padding: 3px 6px; }
  td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; font-size: 10px; }
  tr:nth-child(even) td { background: #f8fafc; }
  td.mono { font-family: 'Consolas', monospace; font-size: 9.5px; white-space: nowrap; }
  td.name { font-weight: 600; }
  td.empty { text-align: center; color: #94a3b8; font-style: italic; padding: 8px; }
  .foot { margin-top: 22px; display: flex; justify-content: space-between; font-size: 9px; color: #64748b; }
  .sig { border-top: 1px solid #94a3b8; padding-top: 4px; width: 150px; text-align: center; }
</style></head>
<body>
  <div class="doc-head">
    <div>
      <h1>${esc(orgName)}</h1>
      <div class="sub">${esc(org?.tagline || '24-Hour Shift Coverage Matrix')}</div>
    </div>
    <div class="doc-meta"><strong>Shift Roster</strong>Effective ${periodLabel}<br/>Generated ${genDateStr}</div>
  </div>
  <div class="summary">
    <span>Shifts: <b>${grouped.rows.length}</b></span>
    <span>Staff assigned: <b>${totalAssigned}</b> of ${employees.length}</span>
    ${grouped.unassigned.length ? `<span>Unassigned: <b>${grouped.unassigned.length}</b></span>` : ''}
  </div>
  ${sections}
  ${unassignedSection}
  <div class="foot">
    <div class="sig">Prepared by (Admin)</div>
    <div class="sig">Approved by (Management)</div>
  </div>
</body></html>`;
  };

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) {
      alert('Please allow pop-ups for this site to print or export the roster.');
      return;
    }
    win.document.write(buildA4Document());
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  useEscapeClose(true, onClose);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-modal)', padding: '1.5rem', overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '52rem', background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
          borderRadius: '1rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
              <FileText size={17} color="var(--brand-primary-ink)" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-heading)' }}>Publish Shift Roster</h3>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Current staff assignments grouped by shift, stamped with an effective period for the team.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}>
            <X size={18} />
          </button>
        </div>

        {/* Period selector */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <span className="eyebrow">Effective period</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
              <button onClick={() => moveMonth(-1)} className="btn-swaniki btn-swaniki-ghost" style={{ padding: '0.3rem 0.5rem' }} title="Previous month">
                <ChevronLeft size={15} />
              </button>
              <strong style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-heading)', minWidth: '11rem', textAlign: 'center', fontFamily: 'var(--font-heading)' }}>
                {periodLabel}
              </strong>
              <button onClick={() => moveMonth(1)} className="btn-swaniki btn-swaniki-ghost" style={{ padding: '0.3rem 0.5rem' }} title="Next month">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <Users size={13} style={{ verticalAlign: '-2px', marginRight: '0.3rem' }} />
            {totalAssigned} of {employees.length} staff assigned · {grouped.rows.length} shifts
          </div>
        </div>

        {/* Preview */}
        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {grouped.rows.map(({ shift, order, staff, color }) => (
            <div key={shift.id} className="swaniki-card" style={{ padding: '1rem 1.25rem', borderLeft: `4px solid ${color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: staff.length ? '0.6rem' : '0.2rem' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-heading)' }}>{order}. {shift.name}</span>
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }} className="mono">{shiftLabelFor(shift)}</span>
                <span style={{ fontSize: '0.625rem', marginLeft: 'auto', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '999px', color: 'var(--text-heading)', background: `${color}1f`, border: `1px solid ${color}66` }}>{staff.length} staff</span>
              </div>
              {staff.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {staff.map(emp => (
                    <span key={emp.id} style={{
                      fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '999px',
                      background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', color: 'var(--text-body)',
                    }}>
                      {emp.full_name}
                      <span style={{ color: 'var(--text-caption)', marginLeft: '0.3rem' }}>{emp.designation}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '0.7rem', color: 'var(--text-caption)', fontStyle: 'italic' }}>
                  No staff assigned to this shift — it will print as a vacancy line.
                </p>
              )}
            </div>
          ))}

          {grouped.unassigned.length > 0 && (
            <div className="swaniki-card" style={{ padding: '1rem 1.25rem', borderLeft: '3px solid var(--brand-amber)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <AlertTriangle size={14} color="var(--warning-ink)" />
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-heading)' }}>Unassigned Personnel</span>
                <span className="pill-badge" style={{ fontSize: '0.625rem', marginLeft: 'auto', background: 'var(--bg-surface-subtle)', color: 'var(--warning-ink)' }}>{grouped.unassigned.length} staff</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {grouped.unassigned.map(emp => (
                  <span key={emp.id} style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'var(--bg-surface-subtle)', border: '1px dashed var(--border-color)', color: 'var(--text-muted)' }}>
                    {emp.full_name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>
            Opens a print-ready A4 report — choose “Save as PDF” in the print dialog to export.
          </span>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button onClick={onClose} className="btn-swaniki btn-swaniki-ghost" style={{ fontSize: '0.75rem', padding: '0.45rem 0.9rem' }}>
              Close
            </button>
            <button onClick={handlePrint} className="btn-swaniki btn-swaniki-primary" style={{ fontSize: '0.75rem', padding: '0.45rem 0.9rem' }} disabled={!grouped.rows.length}>
              <Printer size={14} style={{ marginRight: '0.35rem', verticalAlign: '-2px' }} />
              <span>Print / Save as PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
