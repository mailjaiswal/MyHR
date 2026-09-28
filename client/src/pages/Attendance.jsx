import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, CalendarDays, CalendarRange, CalendarClock, Layers, Sun, SlidersHorizontal,
  Fingerprint, Check, Loader2, Download, Clock3, ShieldCheck, X, ThumbsUp, ThumbsDown,
  Info, Plus, Minus, ChevronLeft, ChevronRight, Table2, LayoutGrid, Users, FileText,
  FileSpreadsheet, ArrowUpRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDateRange, getRange } from '../hooks/useDateRange';
import useEscapeClose from '../hooks/useEscapeClose';
import useClampedPopover from '../hooks/useClampedPopover';
import DateRangePicker from '../components/DateRangePicker';
import FilterChipsPopover, { ActiveFilterPills } from '../components/FilterChipsPopover';
import { MonthGrid, WeekCards, YearHeatmap, ST_CLASS } from '../components/AttendanceCalendar';

const STATUS_META = {
  PRESENT: { label: 'Present', cls: 'status-ok' },
  OVERTIME: { label: 'Overtime', cls: 'status-ok' },
  REGULARIZED: { label: 'Regularized', cls: 'status-ok' },
  HALF_DAY: { label: 'Half Day', cls: 'status-warn' },
  ABSENT: { label: 'Absent', cls: 'status-bad' },
  ON_LEAVE: { label: 'On Leave', cls: 'status-muted' }
};

const CORR_META = {
  PENDING: { label: 'Pending', cls: 'status-warn' },
  APPROVED: { label: 'Approved', cls: 'status-ok' },
  REJECTED: { label: 'Rejected', cls: 'status-bad' }
};

const EMPTY_FILTERS = {
  statuses: [], departmentIds: [], designations: [], employeeIds: [], excludeIds: [],
  lateBy: '', otOnly: false, includeInactive: false
};

const VIEW_OPTS = [
  { mode: 'day', label: 'Day', Icon: Sun },
  { mode: 'week', label: 'Week', Icon: CalendarDays },
  { mode: 'month', label: 'Month', Icon: CalendarRange },
  { mode: 'quarter', label: 'Quarter', Icon: Layers },
  { mode: 'year', label: 'Year', Icon: CalendarClock },
  { mode: 'custom', label: 'Custom', Icon: SlidersHorizontal }
];

/* ---------- date helpers ---------- */
function pad(n) { return String(n).padStart(2, '0'); }
function fmtStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseStr(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); }
function addDaysStr(s, n) { const d = parseStr(s); d.setDate(d.getDate() + n); return fmtStr(d); }
function addMonthsStr(s, n) {
  const d = parseStr(s); const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return fmtStr(d);
}
function diffDays(a, b) { return Math.round((parseStr(b) - parseStr(a)) / 86400000); }
function monthSpan(s) {
  const d = parseStr(s);
  return [fmtStr(new Date(d.getFullYear(), d.getMonth(), 1)), fmtStr(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
}
function quarterSpan(s) {
  const d = parseStr(s); const q = Math.floor(d.getMonth() / 3);
  return [fmtStr(new Date(d.getFullYear(), q * 3, 1)), fmtStr(new Date(d.getFullYear(), q * 3 + 3, 0))];
}
function weekSpan(s) {
  const d = parseStr(s); const dow = d.getDay() || 7;
  const mon = new Date(d); mon.setDate(d.getDate() - dow + 1);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return [fmtStr(mon), fmtStr(sun)];
}
function labelFor(mode, from, to) {
  const d = parseStr(from);
  switch (mode) {
    case 'day': return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    case 'week': return `Week of ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
    case 'month': return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    case 'quarter': return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
    case 'year': return String(d.getFullYear());
    default: return `${from} → ${to}`;
  }
}
function spanText(mode) {
  if (mode === 'custom') return 'Choose your own start & end dates';
  const r = getRange(mode);
  const wd = (x) => x.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const full = (x) => x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  if (r.from === r.to) return wd(parseStr(r.from));
  const days = diffDays(r.from, r.to) + 1;
  return days <= 7 ? `${wd(parseStr(r.from))} – ${wd(parseStr(r.to))}` : `${full(parseStr(r.from))} – ${full(parseStr(r.to))}`;
}

/* ---------- formatting ---------- */
function fmtTime(t) {
  if (!t) return '—';
  const d = new Date(t);
  if (!isNaN(d)) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
  return String(t).slice(0, 5);
}
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00');
  if (isNaN(dt)) return String(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function aggregateRows(rows) {
  let present = 0, half = 0, absent = 0, hours = 0, late = 0, early = 0, ot = 0;
  rows.forEach(r => {
    const s = r.status;
    if (s === 'PRESENT' || s === 'OVERTIME' || s === 'REGULARIZED') present++;
    else if (s === 'HALF_DAY') half++;
    else if (s === 'ABSENT') absent++;
    hours += Number(r.total_hours || 0);
    ot += Number(r.overtime_hours || 0);
    late += Number(r.late_minutes || 0);
    early += Number(r.early_minutes || 0);
  });
  return { present, half, absent, hours, late, early, ot };
}
function earlyOf(r) { return r?.early_minutes == null ? null : Number(r.early_minutes); }

/* ---------- choose-view gate ---------- */
function ViewGate({ onPick }) {
  return (
    <section className="section-card anim-fade-in" style={{ marginTop: '1.25rem' }}>
      <div style={{ padding: '2rem 2rem 2.25rem' }}>
        <span className="eyebrow">Attendance</span>
        <h2 style={{ margin: '0.4rem 0 0.25rem' }}>Choose a view</h2>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', maxWidth: '46rem', margin: 0 }}>
          Pick the span you want to look at. We'll remember your choice for the next visit.
        </p>
        <div className="view-gate-grid" style={{ marginTop: '1.75rem' }}>
          {VIEW_OPTS.map((o, i) => (
            <button
              key={o.mode}
              className="bezel-card view-tile anim-fade-up"
              style={{ animationDelay: `${i * 80}ms` }}
              onClick={() => onPick(o.mode)}
            >
              <div className="bezel-inner">
                <span className="icon-orb" style={{ background: 'var(--brand-primary-light)', color: 'var(--brand-primary-ink)' }}>
                  <o.Icon size={15} />
                </span>
                <span className="view-tile-label">{o.label}</span>
                <span className="view-tile-sub">{spanText(o.mode)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- team-wide day cards (Day + Calendar display) ---------- */
function DayTeamCards({ records, onSelect, onDrill }) {
  if (records.length === 0) {
    return <div className="empty-state" style={{ padding: '2rem' }}><p>No attendance for this day.</p></div>;
  }
  return (
    <div className="view-gate-grid" style={{ padding: '1rem' }}>
      {records.map((r, i) => {
        const st = STATUS_META[r.status] || STATUS_META.ABSENT;
        const early = earlyOf(r);
        return (
          <div
            key={r.id}
            className="bezel-card view-tile anim-fade-up"
            style={{ animationDelay: `${Math.min(i * 40, 480)}ms` }}
            onClick={() => onSelect(r)}
          >
            <div className={`bezel-inner ${ST_CLASS[r.status] || ''}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <span className="avatar-sq">{(r.full_name || '?')[0]}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-heading)', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.full_name}</div>
                  <div className="mono" style={{ fontSize: '0.625rem', color: 'var(--text-caption)' }}>{r.employee_code}{r.shift_name ? ` · ${r.shift_name}` : ''}</div>
                </div>
                <span className={`status-pill ${st.cls}`}>{st.label}</span>
              </div>
              <span className="cal-time" style={{ fontSize: '0.75rem' }}>{fmtTime(r.first_in_time)} → {fmtTime(r.last_out_time)}</span>
              <span className="cal-metric" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <b>{Number(r.total_hours || 0).toFixed(1)}h</b>
                {Number(r.overtime_hours || 0) > 0 && <span>OT {Number(r.overtime_hours).toFixed(1)}h</span>}
                {Number(r.late_minutes || 0) > 0 && <span style={{ color: 'var(--warning-ink)' }}>+{r.late_minutes}m late</span>}
                {early != null && early > 0 && <span style={{ color: 'var(--danger-ink)' }}>-{early}m early</span>}
              </span>
              <button
                className="island-btn anim-fade-in"
                style={{ alignSelf: 'flex-start', marginTop: 'auto', padding: '0.3rem 0.7rem', fontSize: '0.6875rem' }}
                onClick={(e) => { e.stopPropagation(); onDrill(r); }}
              >
                <CalendarDays size={12} /> Week view
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- employee rail ---------- */
function EmployeeRail({ people, selectedId, query, setQuery, onSelect }) {
  const railRef = useRef(null);
  // The rail turns into a horizontal strip on small screens, so keep the picked
  // employee in view (nearest-only: it never scrolls the page itself).
  useEffect(() => {
    const el = railRef.current?.querySelector('.emp-rail-item.is-active');
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedId, people]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 0 }}>
      <span className="eyebrow"><Users size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />Choose an employee</span>
      <div className="search-box">
        <Search size={14} className="search-icon" />
        <input className="input" placeholder="Search rail…" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <div className="emp-rail" ref={railRef}>
        {people.map((p, i) => {
          const on = String(p.employee_id) === String(selectedId);
          return (
            <button
              key={p.employee_id}
              className={`emp-rail-item ${on ? 'is-active' : ''}`}
              style={{ animationDelay: `${Math.min(i * 25, 350)}ms` }}
              onClick={() => onSelect(p.employee_id)}
            >
              <span className="avatar-sq" style={{ width: 28, height: 28, fontSize: '0.75rem' }}>{(p.full_name || '?')[0]}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.full_name}</span>
                <span className="mono" style={{ fontSize: '0.625rem', color: 'var(--text-caption)' }}>{p.employee_code}</span>
              </span>
              <span style={{ display: 'flex', gap: '0.2rem' }}>
                <span className="status-pill status-ok" title="Present days">{p.present_days}P</span>
                {Number(p.absent_days) > 0 && <span className="status-pill status-bad" title="Absent days">{p.absent_days}A</span>}
              </span>
            </button>
          );
        })}
        {people.length === 0 && <div className="empty-state" style={{ padding: '1rem' }}><p>No employees in this range.</p></div>}
      </div>
    </div>
  );
}

/* ---------- muster table (Table display) ---------- */
function MusterTable({ records, busy, canManage, showEarly, onRegularize, onAdjust, onOpen, onDrill }) {
  const [expanded, setExpanded] = useState(() => new Set());

  const groups = useMemo(() => {
    const out = [];
    const idx = {};
    records.forEach(r => {
      const key = r.employee_id || r.employee_code;
      if (!(key in idx)) { idx[key] = { key, emp: r, rows: [] }; out.push(idx[key]); }
      idx[key].rows.push(r);
    });
    return out;
  }, [records]);

  const toggle = (key) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const colCount = showEarly ? 12 : 11;

  return (
    <>
      {groups.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', padding: '0.625rem 1rem 0' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(new Set(groups.map(g => g.key)))}>
            <Plus size={13} /> Expand all
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(new Set())}>
            <Minus size={13} /> Collapse all
          </button>
        </div>
      )}
      <div className="table-wrap">
        <table className="swaniki-table">
          <thead>
            <tr>
              <th>Date</th><th>Employee</th><th>Department</th><th>Shift</th><th>First in</th><th>Last out</th>
              <th>Late</th>{showEarly && <th>Early-out</th>}<th>Hours</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => {
              const isOpen = expanded.has(g.key);
              const agg = aggregateRows(g.rows);
              return (
                <React.Fragment key={g.key}>
                  <tr onClick={() => toggle(g.key)} style={{ cursor: 'pointer', background: 'var(--bg-surface-subtle)' }}>
                    <td className="mono" style={{ whiteSpace: 'nowrap', color: 'var(--text-heading)', fontWeight: 600 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        {isOpen ? <Minus size={15} style={{ color: 'var(--brand-primary-ink)' }} /> : <Plus size={15} style={{ color: 'var(--brand-primary-ink)' }} />}
                        {g.rows.length} {g.rows.length === 1 ? 'day' : 'days'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <span className="avatar-sq">{(g.emp.full_name || '?')[0]}</span>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{g.emp.full_name}</div>
                          <div className="mono" style={{ fontSize: '0.6563rem', color: 'var(--text-caption)' }}>{g.emp.employee_code}</div>
                        </div>
                      </div>
                    </td>
                    <td>{g.emp.department_name}</td>
                    <td>{g.emp.shift_name}</td>
                    <td className="mono" style={{ color: 'var(--text-caption)' }}>{'—'}</td>
                    <td className="mono" style={{ color: 'var(--text-caption)' }}>{'—'}</td>
                    <td className="mono">{agg.late > 0 ? `${agg.late}m` : '—'}</td>
                    {showEarly && <td className="mono">{agg.early > 0 ? `${agg.early}m` : '—'}</td>}
                    <td className="mono" style={{ fontWeight: 600 }}>{agg.hours.toFixed(1)}h</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <span className="status-pill status-ok" title="Present days">{agg.present}P</span>
                        {agg.half > 0 && <span className="status-pill status-warn" title="Half days">{agg.half}H</span>}
                        {agg.absent > 0 && <span className="status-pill status-bad" title="Absent days">{agg.absent}A</span>}
                      </div>
                    </td>
                    <td>
                      <button
                        className="island-btn"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.6875rem' }}
                        title="Open this employee's week calendar"
                        onClick={(e) => { e.stopPropagation(); onDrill(g.rows[0]); }}
                      >
                        <LayoutGrid size={12} /> Calendar
                      </button>
                    </td>
                  </tr>
                  {isOpen && g.rows.map(r => {
                    const st = STATUS_META[r.status] || STATUS_META.ABSENT;
                    const canFix = r.status === 'ABSENT' || r.status === 'HALF_DAY';
                    const early = earlyOf(r);
                    return (
                      <tr key={r.id}>
                        <td className="mono" style={{ whiteSpace: 'nowrap', paddingLeft: '1.875rem' }}>{fmtDate(r.duty_date)}</td>
                        <td>
                          <div onClick={() => onOpen(r)} title="View detailed attendance" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', color: 'var(--text-caption)', fontSize: '0.75rem' }}>
                            <Info size={12} style={{ opacity: 0.5 }} /><span className="mono">{r.employee_code}</span>
                          </div>
                        </td>
                        <td>{r.department_name}</td>
                        <td>{r.shift_name}</td>
                        <td className="mono">{fmtTime(r.first_in_time)}</td>
                        <td className="mono">{fmtTime(r.last_out_time)}</td>
                        <td className="mono">{Number(r.late_minutes || 0) > 0 ? `${r.late_minutes}m` : '—'}</td>
                        {showEarly && <td className="mono">{early ? `${early}m` : '—'}</td>}
                        <td className="mono">{Number(r.total_hours || 0).toFixed(1)}h</td>
                        <td><span className={`status-pill ${st.cls}`}>{st.label}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                            {canFix && (
                              <button className="btn btn-ghost btn-sm" disabled={busy === r.id} onClick={() => onRegularize(r.id)}>
                                {busy === r.id ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Regularize
                              </button>
                            )}
                            {canManage && (
                              <button className="btn btn-ghost btn-sm" onClick={() => onAdjust(r)} title="Override logged hours">
                                <Clock3 size={13} /> Adjust
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
            {records.length === 0 && (
              <tr><td colSpan={colCount}><div className="empty-state"><p>No records for the selected filters.</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------- export menu ---------- */
function ExportMenu({ canExport, busy, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const clampStyle = useClampedPopover(ref, open, 'right');
  useEscapeClose(open, () => setOpen(false));
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const t = setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDoc); };
  }, []);

  if (!canExport) return null;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="island-btn" onClick={() => setOpen(o => !o)} disabled={!!busy}>
        <span className="icon-orb">{busy ? <Loader2 size={13} className="spin" /> : <Download size={13} />}</span>
        Export
        <ArrowUpRight size={12} style={{ transform: 'rotate(90deg)', opacity: 0.5 }} />
      </button>
      {open && (
        <div className="crp-popover bezel-card anim-fade-in" style={{ position: 'absolute', top: 'calc(100% + 0.5rem)', right: 0, zIndex: 'var(--z-popover)', width: '15rem', ...clampStyle }}>
          <div className="bezel-inner" style={{ padding: '0.5rem' }}>
            <span className="eyebrow" style={{ display: 'block', padding: '0.25rem 0.5rem' }}>Current filters · all rows</span>
            {[
              { fmt: 'csv', Icon: FileText, label: 'CSV file' },
              { fmt: 'xlsx', Icon: FileSpreadsheet, label: 'Excel workbook' }
            ].map(o => (
              <button key={o.fmt} className="emp-rail-item" style={{ animationDelay: 0 }} onClick={() => { setOpen(false); onPick(o.fmt); }}>
                <span className="icon-orb"><o.Icon size={13} /></span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-heading)' }}>{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Attendance() {
  const { authFetch, hasPerm, user, loading: authLoading } = useAuth();
  // `user` hydrates asynchronously, so the remembered choices can only be read
  // once the real id is known (see the [uid] effect) — otherwise the gate would
  // flash for returning users and defaults would overwrite saved filters.
  const uid = user?.id ?? null;

  const { dateRange, setDateRange, setMode, setCustom, from, to } = useDateRange('month');
  const canManage = hasPerm('ATTENDANCE_EDIT');
  const canExport = hasPerm('EXPORTS');
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role);

  const api = useCallback((path, opts = {}) => authFetch(path, opts).then(r => r.json()).then(d => (d.success ? d : { success: false, error: d.error })), [authFetch]);
  const read = (key, fallback) => { if (!key) return fallback; try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch (e) { return fallback; } };
  const write = (key, val) => { if (!key) return; try { localStorage.setItem(key, val); } catch (e) { /* ignore */ } };
  const remove = (key) => { if (!key) return; try { localStorage.removeItem(key); } catch (e) { /* ignore */ } };
  const prefKey = (name) => (uid == null ? null : `myhr.att.${name}.${uid}`);

  /* --- remembered choices (hydrated per user) --- */
  const [viewChosen, setViewChosen] = useState('');
  const [stylePref, setStylePref] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [prefsFor, setPrefsFor] = useState(null);
  const [railQuery, setRailQuery] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [animDir, setAnimDir] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (uid == null) return;
    const savedView = read(prefKey('view'), '');
    let savedFilters = EMPTY_FILTERS;
    try { savedFilters = { ...EMPTY_FILTERS, ...JSON.parse(read(prefKey('filters'), '{}')) }; } catch (e) { /* keep defaults */ }
    setViewChosen(savedView);
    setStylePref(read(prefKey('style'), ''));
    setFilters(savedFilters);
    // Bootstrap the span in the same commit, so the first fetch already uses it.
    if (savedView === 'custom') {
      setDateRange(prev => ({ mode: 'custom', from: prev.from, to: prev.to, label: `${prev.from} → ${prev.to}` }));
    } else if (savedView) {
      setMode(savedView);
    }
    setPrefsFor(uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const prefsReady = uid != null && prefsFor === uid;
  useEffect(() => {
    if (!prefsReady) return;
    write(prefKey('filters'), JSON.stringify(filters));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, prefsReady, uid]);

  const resolvedStyle = stylePref || (dateRange.mode === 'day' ? 'table' : 'calendar');
  const spanDays = diffDays(from, to) + 1;
  const layout = resolvedStyle === 'table' ? 'table'
    : dateRange.mode === 'day' ? 'teamDay'
      : spanDays <= 7 ? 'week'
        : spanDays <= 31 ? 'month' : 'heat';
  const needsEmployee = layout === 'week' || layout === 'month' || layout === 'heat';

  /* --- data --- */
  const [departments, setDepartments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState([]);
  const [orgEmployees, setOrgEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [corrections, setCorrections] = useState([]);
  const [message, setMessage] = useState(null);
  const [adjustFor, setAdjustFor] = useState(null);
  const [adjHours, setAdjHours] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjSaving, setAdjSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [dayPopup, setDayPopup] = useState(null);
  const [exportBusy, setExportBusy] = useState(null);

  useEscapeClose(!!detail, () => setDetail(null));
  useEscapeClose(!!dayPopup && !detail, () => setDayPopup(null));
  useEscapeClose(!!adjustFor && !detail && !dayPopup, () => setAdjustFor(null));

  const buildQs = useCallback((extra = {}) => {
    const qs = new URLSearchParams({ from, to });
    if (shiftId) qs.set('shiftId', shiftId);
    if (search.trim()) qs.set('search', search.trim());
    if (filters.statuses.length) qs.set('status', filters.statuses.join(','));
    if (filters.departmentIds.length) qs.set('departmentId', filters.departmentIds.join(','));
    if (filters.designations.length) qs.set('designation', filters.designations.join(','));
    if (filters.employeeIds.length) qs.set('employeeIds', filters.employeeIds.join(','));
    if (filters.excludeIds.length) qs.set('excludeEmployeeIds', filters.excludeIds.join(','));
    if (filters.lateBy) qs.set('lateBy', filters.lateBy);
    if (filters.otOnly) qs.set('otOnly', '1');
    if (filters.includeInactive) qs.set('includeInactive', '1');
    Object.entries(extra).forEach(([k, v]) => v && qs.set(k, v));
    return qs.toString();
  }, [from, to, shiftId, search, filters]);

  const loadRecords = useCallback(() => {
    if (!viewChosen) return;
    if (needsEmployee && !selectedEmpId) { setRecords([]); return; }
    setLoading(true);
    const qs = buildQs(needsEmployee ? { employeeId: selectedEmpId } : {});
    api(`/api/v1/attendance/records?${qs}`)
      .then(d => { if (d.success) setRecords(d.records); })
      .finally(() => setLoading(false));
  }, [viewChosen, needsEmployee, selectedEmpId, buildQs, api]);

  const loadSummary = useCallback(() => {
    if (!viewChosen) return;
    api(`/api/v1/attendance/summary/monthly?from=${from}&to=${to}`).then(d => d.success && setSummary(d.summary));
  }, [viewChosen, from, to, api]);

  const loadCorrections = useCallback(() => {
    if (!canManage) return;
    api('/api/v1/attendance/corrections').then(d => d.success && setCorrections(d.corrections));
  }, [canManage, api]);

  useEffect(() => { api('/api/v1/organization/departments').then(d => d.success && setDepartments(d.departments)); }, []);
  useEffect(() => { api('/api/v1/organization/shifts').then(d => d.success && setShifts(d.shifts)); }, []);
  useEffect(() => {
    if (!viewChosen || !hasPerm('EMPLOYEES_VIEW')) return;
    api(`/api/v1/organization/employees?status=${filters.includeInactive && isAdmin ? 'ALL' : 'ACTIVE'}`)
      .then(d => d.success && setOrgEmployees(d.employees || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewChosen, filters.includeInactive]);
  useEffect(loadRecords, [loadRecords]);
  useEffect(loadSummary, [loadSummary]);
  useEffect(loadCorrections, [loadCorrections]);

  /* --- rail (people in range, honouring employee/dept/designation filters) --- */
  const deptNameOf = useCallback((id) => departments.find(d => String(d.id) === String(id))?.name, [departments]);
  const allPeople = useMemo(() => {
    const byId = new Map();
    (summary || []).forEach(s => {
      byId.set(String(s.employee_id), {
        employee_id: s.employee_id, full_name: s.full_name, employee_code: s.employee_code,
        designation: s.designation, department_name: s.department_name,
        present_days: Number(s.present_days || 0), half_days: Number(s.half_days || 0),
        absent_days: Number(s.absent_days || 0), archived: false
      });
    });
    if (filters.includeInactive) {
      orgEmployees.forEach(e => {
        if (byId.has(String(e.id))) return;
        byId.set(String(e.id), {
          employee_id: e.id, full_name: e.full_name, employee_code: e.employee_code,
          designation: e.designation, department_name: e.department_name,
          present_days: 0, half_days: 0, absent_days: 0, archived: e.status !== 'ACTIVE'
        });
      });
    }
    return [...byId.values()];
  }, [summary, orgEmployees, filters.includeInactive]);

  const railPeople = useMemo(() => {
    const q = railQuery.trim().toLowerCase();
    const deptNames = filters.departmentIds.map(deptNameOf);
    let list = allPeople;
    if (filters.employeeIds.length) list = list.filter(p => filters.employeeIds.includes(String(p.employee_id)));
    if (filters.excludeIds.length) list = list.filter(p => !filters.excludeIds.includes(String(p.employee_id)));
    if (deptNames.length) list = list.filter(p => deptNames.includes(p.department_name));
    if (filters.designations.length) list = list.filter(p => filters.designations.includes(p.designation));
    if (q) list = list.filter(p => `${p.full_name} ${p.employee_code}`.toLowerCase().includes(q));
    return list;
  }, [allPeople, railQuery, filters, deptNameOf]);

  useEffect(() => {
    if (!needsEmployee) return;
    if (railPeople.length === 0) { if (selectedEmpId) setSelectedEmpId(''); return; }
    if (!railPeople.some(p => String(p.employee_id) === String(selectedEmpId))) setSelectedEmpId(railPeople[0].employee_id);
  }, [needsEmployee, railPeople, selectedEmpId]);

  const selectedPerson = useMemo(() => railPeople.find(p => String(p.employee_id) === String(selectedEmpId)) || null, [railPeople, selectedEmpId]);
  const designations = useMemo(() => [...new Set(allPeople.map(p => p.designation).filter(Boolean))].sort(), [allPeople]);
  const filterEmployees = useMemo(() => allPeople.map(p => ({
    id: String(p.employee_id), full_name: p.full_name, employee_code: p.employee_code,
    biometric_user_id: orgEmployees.find(e => String(e.id) === String(p.employee_id))?.biometric_user_id || ''
  })), [allPeople, orgEmployees]);
  const showEarly = useMemo(() => records.some(r => r.early_minutes != null), [records]);

  /* --- actions --- */
  const flash = (msg) => { setMessage(msg); setTimeout(() => setMessage(null), 3500); };

  const chooseView = (mode) => {
    write(prefKey('view'), mode);
    setViewChosen(mode);
    if (mode === 'custom') {
      setDateRange(prev => ({ mode: 'custom', from: prev.from, to: prev.to, label: `${prev.from} → ${prev.to}` }));
    } else {
      setMode(mode);
    }
  };
  const onSetMode = (mode) => { chooseView(mode); };
  const setStyle = (s) => { setStylePref(s); write(prefKey('style'), s); };
  const resetView = () => {
    remove(prefKey('view'));
    setViewChosen('');
    setRecords([]);
  };

  const shift = (dir) => {
    const mode = dateRange.mode;
    let nf = from, nt = to;
    if (mode === 'day') { nf = nt = addDaysStr(from, dir); }
    else if (mode === 'week') { [nf, nt] = weekSpan(addDaysStr(from, 7 * dir)); }
    else if (mode === 'month') { [nf, nt] = monthSpan(addMonthsStr(from, dir)); }
    else if (mode === 'quarter') { [nf, nt] = quarterSpan(addMonthsStr(from, 3 * dir)); }
    else if (mode === 'year') {
      const y = parseStr(from).getFullYear() + dir;
      nf = `${y}-01-01`; nt = `${y}-12-31`;
    } else {
      const step = (diffDays(from, to) + 1) * dir;
      nf = addDaysStr(from, step); nt = addDaysStr(to, step);
    }
    setAnimDir(dir > 0 ? 'next' : 'prev');
    setDateRange({ mode, from: nf, to: nt, label: labelFor(mode, nf, nt) });
  };

  const drillToWeek = (r) => {
    if (!r) return;
    const ds = String(r.duty_date).slice(0, 10);
    const [nf, nt] = weekSpan(ds);
    setSelectedEmpId(r.employee_id);
    setStyle('calendar');
    setAnimDir('next');
    setDateRange({ mode: 'custom', from: nf, to: nt, label: labelFor('week', nf, nt) });
    setDayPopup(null);
  };

  const openDay = (r) => setDayPopup(r);
  const openDetail = (rec) => {
    const rows = records.filter(r => r.employee_id === rec.employee_id).sort((a, b) => (a.duty_date < b.duty_date ? 1 : -1));
    setDetail({ emp: rec, rows });
    setDayPopup(null);
  };

  const regularize = async (id) => {
    setBusy(id);
    try {
      const d = await api('/api/v1/attendance/regularize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendanceId: id, action: 'APPROVE', notes: 'Regularized by HR' })
      });
      if (d.success) { loadRecords(); loadSummary(); flash('Regularized successfully'); }
      else alert(d.error || 'Failed to regularize');
    } catch (err) { alert(err.message); }
    finally { setBusy(null); }
  };

  const openAdjust = (rec) => {
    setDayPopup(null);
    setAdjustFor(rec);
    setAdjHours(String(Number(rec.total_hours || 0).toFixed(1)));
    setAdjReason('');
  };

  const submitAdjust = async () => {
    const hours = Number(adjHours);
    if (!(hours > 0) || hours > 24) { alert('Hours must be between 0 and 24'); return; }
    setAdjSaving(true);
    try {
      const d = await api('/api/v1/attendance/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendance_id: adjustFor.id, requested_hours: hours, reason: adjReason || 'Incorrectly logged entry', submitted_by: user?.full_name || 'Manager/HR' })
      });
      if (d.success) { flash('Correction request sent for admin approval'); setAdjustFor(null); loadCorrections(); loadRecords(); }
      else alert(d.error || 'Failed to submit');
    } catch (err) { alert(err.message); }
    finally { setAdjSaving(false); }
  };

  const decideCorrection = async (id, action) => {
    setBusy(id);
    try {
      const d = await api(`/api/v1/attendance/corrections/${id}/decide`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, decided_by: user?.full_name || 'HR Admin' })
      });
      if (d.success) { flash(d.message || 'Done'); loadCorrections(); loadRecords(); }
      else alert(d.error || 'Failed');
    } catch (err) { alert(err.message); }
    finally { setBusy(null); }
  };

  const doExport = async (format) => {
    setExportBusy(format);
    try {
      const res = await authFetch(`/api/v1/attendance/export?${buildQs()}&format=${format}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Export failed');
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Attendance_${from}_to_${to}.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
      flash(`Export ready (${format.toUpperCase()})`);
    } catch (err) {
      alert(err.message);
    } finally {
      setExportBusy(null);
    }
  };

  const pendingCorrs = corrections.filter(c => c.status === 'PENDING');
  const animClass = animDir === 'next' ? 'anim-slide-next' : animDir === 'prev' ? 'anim-slide-prev' : 'anim-fade-in';

  /* ---------- render ---------- */
  return (
    <div className="page">
      {message && <div className="demo-banner" style={{ borderColor: 'rgba(16,185,129,.4)', background: 'var(--brand-primary-light)', color: 'var(--brand-primary-ink)' }}>{message}</div>}

      <div className="page-head">
        <div className="page-title-wrap">
          <h1>Attendance</h1>
          <span className="page-desc">Daily muster, per-employee calendar and manual hours corrections.</span>
        </div>
        <div className="page-actions">
          {viewChosen && <ExportMenu canExport={canExport} busy={exportBusy} onPick={doExport} />}
          {viewChosen && (
            <button className="island-btn" onClick={resetView} title="Show the choose-view gate again">
              <span className="icon-orb"><Layers size={13} /></span>Change view
            </button>
          )}
        </div>
      </div>

      {authLoading || (!prefsReady && !viewChosen) ? (
        <div className="loading-state"><Loader2 size={24} className="spin" /><p>Preparing your attendance view…</p></div>
      ) : !viewChosen ? (
        <ViewGate onPick={chooseView} />
      ) : (
        <>
          <div className="segment-toolbar" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <DateRangePicker dateRange={dateRange} setMode={onSetMode} setCustom={setCustom} />

            <div className="island-seg" role="group" aria-label="Display style">
              <button className={resolvedStyle === 'table' ? 'is-active' : ''} onClick={() => setStyle('table')}>
                <Table2 size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Table
              </button>
              <button className={resolvedStyle === 'calendar' ? 'is-active' : ''} onClick={() => setStyle('calendar')}>
                <LayoutGrid size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Calendar
              </button>
            </div>

            <div className="field" style={{ width: 160 }}>
              <select className="input" value={shiftId} onChange={e => setShiftId(e.target.value)}>
                <option value="">All shifts</option>
                {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="search-box">
              <Search size={15} className="search-icon" />
              <input className="input" placeholder="Search employee…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <FilterChipsPopover
                departments={departments}
                designations={designations}
                employees={filterEmployees}
                canViewInactive={isAdmin}
                value={filters}
                onChange={setFilters}
              />
            </div>
          </div>

          <ActiveFilterPills departments={departments} value={filters} onChange={setFilters}>
            {(filters.employeeIds.length > 0 || filters.excludeIds.length > 0) && (
              <button className="filter-pill" style={{ border: '1px dashed var(--border-color)' }} onClick={() => setFilters(f => ({ ...f, employeeIds: [], excludeIds: [] }))}>
                reset people
              </button>
            )}
          </ActiveFilterPills>

          {canManage && corrections.length > 0 && (
            <section className="section-card">
              <div className="section-head">
                <span className="section-title"><ShieldCheck size={16} /> Hours corrections · admin approval</span>
                {pendingCorrs.length > 0 ? <span className="status-pill status-warn">{pendingCorrs.length} pending</span> : <span className="status-pill status-ok">No pending</span>}
              </div>
              <div className="table-wrap">
                <table className="swaniki-table">
                  <thead><tr><th>Employee</th><th>Date</th><th>Logged</th><th>Requested</th><th>Reason</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {corrections.map(c => {
                      const st = CORR_META[c.status] || CORR_META.PENDING;
                      return (
                        <tr key={c.id}>
                          <td>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{c.full_name}</div>
                              <div className="mono" style={{ fontSize: '0.6563rem', color: 'var(--text-caption)' }}>{c.employee_code}</div>
                            </div>
                          </td>
                          <td className="mono">{new Date(c.duty_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                          <td className="mono">{Number(c.logged_hours || c.original_hours || 0).toFixed(1)}h → <b style={{ color: 'var(--brand-primary-ink)' }}>{Number(c.requested_hours).toFixed(1)}h</b></td>
                          <td className="mono">{c.shift_name}</td>
                          <td className="td-wrap" style={{ maxWidth: 220 }}>{c.reason || '—'}</td>
                          <td><span className={`status-pill ${st.cls}`}>{st.label}</span></td>
                          <td>
                            {c.status === 'PENDING' && (
                              <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                                <button className="btn btn-ghost btn-sm" disabled={busy === c.id} onClick={() => decideCorrection(c.id, 'APPROVE')}>
                                  {busy === c.id ? <Loader2 size={13} className="spin" /> : <ThumbsUp size={13} />} Approve
                                </button>
                                <button className="btn btn-rose btn-sm" disabled={busy === c.id} onClick={() => decideCorrection(c.id, 'REJECT')}>
                                  <ThumbsDown size={13} /> Reject
                                </button>
                              </div>
                            )}
                            {c.status !== 'PENDING' && <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{c.decided_by || ''}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="section-card">
            <div className="section-head">
              <span className="section-title">
                <Fingerprint size={16} />
                {layout === 'table' ? `Muster · ${dateRange.label}`
                  : layout === 'teamDay' ? `Team · ${dateRange.label}`
                    : `${selectedPerson ? selectedPerson.full_name : 'Employee'} · ${dateRange.label}`}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{loading ? '…' : `${records.length} records`}</span>
                <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous period"><ChevronLeft size={16} /></button>
                <button className="icon-btn" onClick={() => shift(1)} aria-label="Next period"><ChevronRight size={16} /></button>
              </div>
            </div>

            {loading ? (
              <div className="loading-state"><Loader2 size={24} className="spin" /><p>Loading records…</p></div>
            ) : layout === 'table' ? (
              <MusterTable
                records={records}
                busy={busy}
                canManage={canManage}
                showEarly={showEarly}
                onRegularize={regularize}
                onAdjust={openAdjust}
                onOpen={openDetail}
                onDrill={drillToWeek}
              />
            ) : layout === 'teamDay' ? (
              <DayTeamCards records={records} onSelect={openDay} onDrill={drillToWeek} />
            ) : (
              <div className={`att-workspace ${animClass}`} key={`${from}-${to}-${selectedEmpId}`}>
                <div className="att-rail-col">
                  <EmployeeRail
                    people={railPeople}
                    selectedId={selectedEmpId}
                    query={railQuery}
                    setQuery={setRailQuery}
                    onSelect={setSelectedEmpId}
                  />
                </div>
                <div className="att-pane">
                  {!selectedPerson && railPeople.length === 0 ? (
                    <div className="empty-state" style={{ padding: '2rem' }}><p>No employee matches these filters.</p></div>
                  ) : layout === 'week' ? (
                    <WeekCards records={records} from={from} to={to} onSelect={openDay} />
                  ) : layout === 'month' ? (
                    <MonthGrid records={records} from={from} to={to} onSelect={openDay} />
                  ) : (
                    <YearHeatmap records={records} from={from} to={to} onSelect={drillToWeek} />
                  )}
                </div>
              </div>
            )}
          </section>

          {layout === 'table' && (
            <section className="section-card">
              <div className="section-head">
                <span className="section-title"><CalendarDays size={16} /> Summary · {dateRange.label}</span>
              </div>
              <div className="table-wrap">
                <table className="swaniki-table">
                  <thead>
                    <tr><th>Employee</th><th>Department</th><th>Present</th><th>Half day</th><th>Absent</th><th>Logged hours</th><th>Overtime</th></tr>
                  </thead>
                  <tbody>
                    {summary.map(s => (
                      <tr key={s.employee_id}>
                        <td>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{s.full_name}</div>
                            <div className="mono" style={{ fontSize: '0.6563rem', color: 'var(--text-caption)' }}>{s.employee_code}</div>
                          </div>
                        </td>
                        <td>{s.department_name}</td>
                        <td><span className="status-pill status-ok">{s.present_days}</span></td>
                        <td>{s.half_days}</td>
                        <td><span className="status-pill status-bad">{s.absent_days}</span></td>
                        <td className="mono">{s.total_logged_hours}h</td>
                        <td className="mono">{s.total_overtime_hours}h</td>
                      </tr>
                    ))}
                    {summary.length === 0 && <tr><td colSpan={7}><div className="empty-state"><p>No summary for {dateRange.label} yet. Run attendance ingests or pick another range.</p></div></td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {dayPopup && (() => {
        const r = dayPopup;
        const st = STATUS_META[r.status] || STATUS_META.ABSENT;
        const canFix = r.status === 'ABSENT' || r.status === 'HALF_DAY';
        const early = earlyOf(r);
        const chips = [
          ['First in', fmtTime(r.first_in_time)], ['Last out', fmtTime(r.last_out_time)],
          ['Regular', `${Number(r.regular_hours || 0).toFixed(1)}h`], ['Overtime', `${Number(r.overtime_hours || 0).toFixed(1)}h`],
          ['Late', Number(r.late_minutes || 0) > 0 ? `${r.late_minutes}m` : '—'],
          ['Early-out', early == null ? null : (early > 0 ? `${early}m` : '—')],
          ['Total', `${Number(r.total_hours || 0).toFixed(1)}h`]
        ].filter(c => c[1] != null);
        return (
          <div className="modal-overlay" onClick={() => setDayPopup(null)}>
            <div className="modal-card" style={{ width: '100%', maxWidth: '30rem' }} onClick={e => e.stopPropagation()}>
              <div className="modal-head">
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <span className="avatar-sq" style={{ width: 40, height: 40, fontSize: '1rem' }}>{(r.full_name || '?')[0]}</span>
                  <div>
                    <span className="eyebrow">{fmtDate(r.duty_date)}{r.shift_name ? ` · ${r.shift_name}` : ''}</span>
                    <h3 style={{ margin: 0 }}>{r.full_name}</h3>
                  </div>
                </div>
                <button className="icon-btn" onClick={() => setDayPopup(null)}><X size={17} /></button>
              </div>
              <div style={{ padding: '1rem 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <span className={`status-pill ${st.cls}`} style={{ alignSelf: 'flex-start' }}>{st.label}</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: '0.5rem' }}>
                  {chips.map(([k, v]) => (
                    <div key={k} style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '0.7rem', padding: '0.5rem 0.6rem' }}>
                      <div className="eyebrow">{k}</div>
                      <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-heading)' }} className="mono">{v}</div>
                    </div>
                  ))}
                </div>
                {r.regularization_notes && <p style={{ fontSize: '0.7188rem', color: 'var(--text-caption)', margin: 0 }}>Note: {r.regularization_notes}</p>}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button className="island-btn" onClick={() => drillToWeek(r)}><CalendarDays size={13} /> Week of this day</button>
                  {canFix && (
                    <button className="island-btn is-active" disabled={busy === r.id} onClick={() => regularize(r.id)}>
                      {busy === r.id ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Regularize
                    </button>
                  )}
                  {canManage && (
                    <button className="island-btn" onClick={() => openAdjust(r)}><Clock3 size={13} /> Adjust hours</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {adjustFor && (
        <div className="modal-overlay" onClick={() => setAdjustFor(null)}>
          <div className="modal-card" style={{ width: '100%', maxWidth: '26rem' }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">{fmtDate(adjustFor.duty_date)}</span>
                <h3 style={{ margin: 0 }}>Override logged hours</h3>
              </div>
              <button className="icon-btn" onClick={() => setAdjustFor(null)}><X size={17} /></button>
            </div>
            <div className="section-body" style={{ padding: '1rem 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <p style={{ fontSize: '0.75rem', margin: 0 }}>{adjustFor.full_name}</p>
              <div className="field">
                <label className="field-label">Current logged hours</label>
                <div className="input" style={{ background: 'var(--bg-surface-subtle)' }}>{Number(adjustFor.total_hours || 0).toFixed(1)}h</div>
              </div>
              <div className="field">
                <label className="field-label">Corrected hours</label>
                <input type="number" step="0.5" min="0" max="24" className="input" value={adjHours} onChange={e => setAdjHours(e.target.value)} placeholder="e.g. 8.0" />
              </div>
              <div className="field">
                <label className="field-label">Reason (why the entry was missed/incorrect)</label>
                <textarea rows={2} className="input" value={adjReason} onChange={e => setAdjReason(e.target.value)} placeholder="e.g. Punch device was offline during entry" />
              </div>
              <p style={{ fontSize: '0.6875rem', color: 'var(--text-caption)' }}>This request goes to the Admin for explicit approval before the hours are changed.</p>
              <button className="btn btn-primary" disabled={adjSaving} onClick={submitAdjust}>
                {adjSaving ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />} Submit for approval
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (() => {
        const rows = detail.rows;
        const emp = detail.emp;
        const present = rows.filter(r => ['PRESENT', 'OVERTIME', 'REGULARIZED'].includes(r.status)).length;
        const half = rows.filter(r => r.status === 'HALF_DAY').length;
        const absent = rows.filter(r => r.status === 'ABSENT').length;
        const totalH = rows.reduce((s, r) => s + Number(r.total_hours || 0), 0);
        const otH = rows.reduce((s, r) => s + Number(r.overtime_hours || 0), 0);
        const lateCount = rows.filter(r => Number(r.late_minutes || 0) > 0).length;
        const chips = [
          ['Present', present, 'var(--brand-primary-ink)'], ['Half day', half, 'var(--warning-ink)'], ['Absent', absent, 'var(--danger-ink)'],
          ['Late', lateCount, 'var(--text-heading)'], ['Hours', `${totalH.toFixed(1)}h`, 'var(--brand-primary-ink)'], ['Overtime', `${otH.toFixed(1)}h`, 'var(--brand-primary-ink)']
        ];
        return (
          <div className="modal-overlay" onClick={() => setDetail(null)}>
            <div className="modal-card" style={{ width: '100%', maxWidth: '45rem', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
              <div className="modal-head" style={{ background: 'var(--bg-surface-subtle)' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <span className="avatar-sq" style={{ width: 44, height: 44, fontSize: '1.1rem' }}>{(emp.full_name || '?')[0]}</span>
                  <div>
                    <h3 style={{ margin: 0, color: 'var(--text-heading)' }}>{emp.full_name}</h3>
                    <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-caption)' }}>{emp.employee_code} · {emp.designation} · {emp.department_name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-caption)', marginTop: '0.15rem' }}>Shift · {emp.shift_name}</div>
                  </div>
                </div>
                <button className="icon-btn" onClick={() => setDetail(null)}><X size={17} /></button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: '0.6rem', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                {chips.map(([k, v, c]) => (
                  <div key={k} style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '0.6rem', padding: '0.55rem 0.7rem' }}>
                    <div className="eyebrow">{k}</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: c }}>{v}</div>
                  </div>
                ))}
              </div>

              <div style={{ padding: '0.5rem 1.5rem 1.5rem', overflowY: 'auto' }}>
                <div className="section-title" style={{ margin: '0.85rem 0 0.5rem', fontSize: '0.8rem' }}>Day-by-day · {rows.length} records</div>
                <div className="table-wrap">
                  <table className="swaniki-table">
                    <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Reg h</th><th>OT h</th><th>Late</th><th>Total</th><th>Status</th></tr></thead>
                    <tbody>
                      {rows.map(r => {
                        const st = STATUS_META[r.status] || STATUS_META.ABSENT;
                        return (
                          <tr key={r.id}>
                            <td className="mono">{fmtDate(r.duty_date)}</td>
                            <td className="mono">{fmtTime(r.first_in_time)}</td>
                            <td className="mono">{fmtTime(r.last_out_time)}</td>
                            <td className="mono">{Number(r.regular_hours || 0).toFixed(1)}</td>
                            <td className="mono">{Number(r.overtime_hours || 0).toFixed(1)}</td>
                            <td className="mono">{Number(r.late_minutes || 0) > 0 ? `${r.late_minutes}m` : '—'}</td>
                            <td className="mono"><b>{Number(r.total_hours || 0).toFixed(1)}h</b></td>
                            <td><span className={`status-pill ${st.cls}`}>{st.label}</span></td>
                          </tr>
                        );
                      })}
                      {rows.length === 0 && <tr><td colSpan={8}><div className="empty-state"><p>No records.</p></div></td></tr>}
                    </tbody>
                  </table>
                </div>
                {rows.some(r => r.regularization_notes) && (
                  <div style={{ marginTop: '0.85rem', fontSize: '0.72rem', color: 'var(--text-caption)' }}>
                    Regularized days: {rows.filter(r => r.regularization_notes).map(r => new Date(r.duty_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })).join(', ')}
                  </div>
                )}
                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDetail(null)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
