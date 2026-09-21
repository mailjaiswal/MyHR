import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useOrganization } from '../context/OrganizationContext';
import {
  Activity, Cpu, Search, Calendar, Menu, X,
  LayoutDashboard, CalendarCheck, Clock, FileSpreadsheet,
  User, HeartPulse, Syringe, Building2, Users, Flame,
  ArrowRight, Hash, Zap, FileText, ChevronDown, Check, AlertTriangle
} from 'lucide-react';

// ── Pre-populated search index ──────────────────────────────────────────────
const SEARCH_INDEX = [
  // Navigation
  { type: 'nav', label: 'Dashboard Overview',    desc: 'Live KPIs & hospital metrics',        icon: LayoutDashboard, tab: 'dashboard',       color: '#10b981' },
  { type: 'nav', label: '24×7 Shift Roster',     desc: 'Shift schedules & handover timeline', icon: Clock,           tab: 'roster',          color: '#8b5cf6' },
  { type: 'nav', label: 'Biometrics & Attendance',desc: 'Punch records & muster roll',         icon: CalendarCheck,   tab: 'attendance',      color: '#00f2fe' },
  { type: 'nav', label: 'Payroll Hub',            desc: 'Salary processing & payslips',        icon: FileSpreadsheet, tab: 'payroll',         color: '#f59e0b' },
  { type: 'nav', label: 'Hardware Gateway',       desc: 'eSSL / ZKTeco device manager',        icon: Cpu,             tab: 'anubhav',         color: '#ef4444' },
  { type: 'nav', label: 'Staff Portal',           desc: 'Employee self-service view',          icon: User,            tab: 'employee-portal', color: '#3b82f6' },
  { type: 'nav', label: 'My Payslip',            desc: 'View & download your payslips',       icon: FileSpreadsheet, tab: 'payslip',         color: '#10b981' },

  // Staff
  { type: 'staff', label: 'Sneha Goswami',   desc: 'Senior Staff Nurse · ICU Ward · DNH-101',       icon: HeartPulse,  color: '#00f2fe' },
  { type: 'staff', label: 'Dr. Priya Sharma',desc: 'HR & Medical Supt · Administration · DNH-102',  icon: Users,       color: '#10b981' },
  { type: 'staff', label: 'Rajesh Patel',    desc: 'ICU Staff Nurse · ICU Ward · DNH-103',          icon: HeartPulse,  color: '#00f2fe' },
  { type: 'staff', label: 'Anjali Verma',    desc: 'OT Staff Nurse · Operation OT · DNH-104',       icon: Syringe,     color: '#8b5cf6' },
  { type: 'staff', label: 'Vikas Deshmukh', desc: 'OT Technician · Operation OT · DNH-105',         icon: Syringe,     color: '#8b5cf6' },
  { type: 'staff', label: 'Sunita Yadav',   desc: 'General Ward Nurse · Inpatient · DNH-106',       icon: Building2,   color: '#10b981' },
  { type: 'staff', label: 'Manoj Kumar',    desc: 'Ward Boy / Attendant · Emergency · DNH-107',     icon: Activity,    color: '#ef4444' },
  { type: 'staff', label: 'Kavita Chouksey',desc: 'Staff Nurse · Emergency · DNH-108',              icon: Activity,    color: '#ef4444' },
  { type: 'staff', label: 'Pooja Tiwari',   desc: 'Dialysis Nurse · Inpatient · DNH-110',           icon: Building2,   color: '#10b981' },
  { type: 'staff', label: 'Deepak Sahu',    desc: 'Lab Technician · Administration · DNH-111',      icon: Users,       color: '#f59e0b' },

  // Wards
  { type: 'ward', label: 'ICU Ward',             desc: 'Intensive Care Unit · 4 nurses on duty',    icon: HeartPulse,  color: '#00f2fe' },
  { type: 'ward', label: 'Emergency Casualty',   desc: '24×7 Emergency · 3 nurses on duty',         icon: Flame,       color: '#ef4444' },
  { type: 'ward', label: 'Operation Theatre',    desc: 'OT Block · Ready for surgeries',            icon: Syringe,     color: '#8b5cf6' },
  { type: 'ward', label: 'Inpatient Wards',      desc: 'General Wards · 5/6 nurses on duty',        icon: Building2,   color: '#10b981' },

  // Quick actions
  { type: 'action', label: 'Simulate Biometric Punch', desc: 'Test eSSL / ZKTeco hardware punch',   icon: Zap,         color: '#f59e0b', action: 'simulator' },
  { type: 'action', label: 'Create Custom Report',     desc: 'Generate HR & Payroll PDF report',    icon: FileText,    color: '#3b82f6', action: 'report'    },
];

const TYPE_LABEL = { nav: 'Pages', staff: 'Staff', ward: 'Wards', action: 'Quick Actions' };
const TYPE_ORDER = ['nav', 'action', 'staff', 'ward'];

function groupResults(items) {
  const groups = {};
  for (const item of items) {
    if (!groups[item.type]) groups[item.type] = [];
    groups[item.type].push(item);
  }
  return TYPE_ORDER.filter(t => groups[t]).map(t => ({ type: t, items: groups[t] }));
}

// ── Component ────────────────────────────────────────────────────────────────
export default function Navbar({ onOpenSimulator, onToggleMobileNav, isMobileNavOpen, onNavigate, dateRange, onDateRangeChange }) {
  const { org } = useOrganization();
  const { isDark } = useTheme();
  const searchRef = useRef(null);
  const dropdownRef = useRef(null);
  const pickerRef = useRef(null);

  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  // ── Date Range Picker state ─────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState(dateRange || { start: '2026-09', end: '2026-10' });

  // Format 'YYYY-MM' → 'Mon YYYY'
  const fmtMonth = (ym) => {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    return new Date(+y, +m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  };

  const rangeLabel = dateRange
    ? `${fmtMonth(dateRange.start)} – ${fmtMonth(dateRange.end)}`
    : 'Select Range';

  const PRESETS = [
    { label: 'This Month',    start: '2026-09', end: '2026-09' },
    { label: 'Last 3 Months', start: '2026-07', end: '2026-09' },
    { label: 'Last 6 Months', start: '2026-04', end: '2026-09' },
    { label: 'FY 2026-27',    start: '2026-04', end: '2027-03' },
  ];

  const applyRange = () => {
    if (draft.start > draft.end) return; // guard
    onDateRangeChange?.(draft);
    setPickerOpen(false);
  };

  const resetRange = () => {
    const def = { start: '2026-09', end: '2026-10' };
    setDraft(def);
    onDateRangeChange?.(def);
    setPickerOpen(false);
  };

  // Close picker on outside click
  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  // ───────────────────────────────────────────────────────────────────────────

  // Filtered results
  const results = query.trim().length === 0
    ? SEARCH_INDEX.slice(0, 12)  // show top 12 pre-populated when empty
    : SEARCH_INDEX.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.desc.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 16);

  const groups = groupResults(results);
  const flatResults = groups.flatMap(g => g.items);

  // Reset active index on query change
  useEffect(() => { setActiveIdx(0); }, [query]);

  // Global Ctrl+K
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        searchRef.current && !searchRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = useCallback((item) => {
    setIsOpen(false);
    setQuery('');
    searchRef.current?.blur();
    if (item.action === 'simulator' && onOpenSimulator) { onOpenSimulator(); return; }
    if (item.tab && onNavigate) { onNavigate(item.tab); }
  }, [onOpenSimulator, onNavigate]);

  const handleKeyDown = (e) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, flatResults.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter'  && flatResults[activeIdx]) { handleSelect(flatResults[activeIdx]); }
    if (e.key === 'Escape') { setIsOpen(false); searchRef.current?.blur(); }
  };

  return (
    <header style={{
      height: '4.25rem',
      background: 'var(--bg-nav)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--border-color)',
      position: 'sticky',
      top: 0,
      zIndex: 40,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 1.25rem',
      gap: '0.875rem',
      transition: 'all 0.2s ease'
    }}>

      {/* Left: Mobile Hamburger + Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button onClick={onToggleMobileNav} className="mobile-hamburger-btn"
          aria-label="Toggle navigation drawer" title="Toggle Navigation Menu">
          {isMobileNavOpen ? <X size={19} /> : <Menu size={19} />}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '2.5rem', height: '2.5rem', borderRadius: '0.75rem', flexShrink: 0,
            background: isDark ? 'linear-gradient(135deg, #00f2fe, #4facfe)' : 'linear-gradient(135deg, #10b981, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: isDark ? '0 0 16px 0 rgba(0,242,254,0.35)' : '0 4px 14px 0 rgba(16,185,129,0.35)'
          }}>
            <Activity size={20} color={isDark ? '#0a0c10' : '#ffffff'} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.035em', color: 'var(--text-heading)', lineHeight: 1 }}>myHR</span>
              <span style={{
                fontSize: '0.625rem', fontWeight: 800, padding: '0.125rem 0.45rem',
                borderRadius: '9999px', letterSpacing: '0.04em',
                background: isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)',
                color: isDark ? '#0a0c10' : '#ffffff'
              }}>BY SWANIKI</span>
            </div>
            <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              {org ? `${org.name} • ${org.tagline || 'Workforce Management'}` : 'Loading organisation...'}
            </p>
          </div>
        </div>
      </div>

      {/* Center: Smart Search with Command Palette */}
      <div style={{ flex: 1, maxWidth: '460px', position: 'relative' }}>

        {/* Input */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={15} color="var(--text-caption)"
            style={{ position: 'absolute', left: '0.875rem', pointerEvents: 'none', zIndex: 1 }} />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search staff, pages, wards..."
            autoComplete="off"
            style={{
              width: '100%', height: '2.5rem',
              padding: '0 4.5rem 0 2.5rem',
              borderRadius: isOpen ? '0.75rem 0.75rem 0 0' : '0.75rem',
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-color)',
              borderBottom: isOpen ? `1px solid ${isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)'}` : '1px solid var(--border-color)',
              color: 'var(--text-heading)', fontSize: '0.8125rem', outline: 'none',
              transition: 'border-color 0.15s ease, border-radius 0.15s ease, box-shadow 0.15s ease',
              boxShadow: isOpen
                ? isDark ? '0 0 0 2px rgba(0,242,254,0.15)' : '0 0 0 2px rgba(16,185,129,0.15)'
                : 'none'
            }}
          />
          {/* Ctrl+K badge (hide when typing) */}
          {!query && (
            <div style={{ position: 'absolute', right: '0.625rem', display: 'flex', alignItems: 'center', gap: '0.2rem', pointerEvents: 'none' }}>
              {['Ctrl', 'K'].map(k => (
                <kbd key={k} style={{
                  display: 'inline-flex', alignItems: 'center', padding: '0.1rem 0.35rem',
                  borderRadius: '0.3rem', fontSize: '0.6rem', fontWeight: 600,
                  fontFamily: 'inherit', lineHeight: 1.6,
                  background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                  color: 'var(--text-caption)'
                }}>{k}</kbd>
              ))}
            </div>
          )}
          {/* Clear button when query exists */}
          {query && (
            <button onClick={() => { setQuery(''); searchRef.current?.focus(); }}
              style={{
                position: 'absolute', right: '0.625rem', display: 'flex', alignItems: 'center',
                justifyContent: 'center', width: '1.35rem', height: '1.35rem',
                borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: 'var(--text-caption)', color: 'var(--bg-surface)'
              }}>
              <X size={10} />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {isOpen && (
          <div
            ref={dropdownRef}
            style={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              background: 'var(--bg-surface)',
              border: `1px solid ${isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)'}`,
              borderTop: 'none',
              borderRadius: '0 0 0.875rem 0.875rem',
              boxShadow: isDark ? '0 16px 40px rgba(0,0,0,0.8)' : '0 12px 32px rgba(15,23,42,0.12)',
              maxHeight: '420px',
              overflowY: 'auto',
              zIndex: 300
            }}
          >
            {results.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                No results for "<strong>{query}</strong>"
              </div>
            ) : (
              groups.map(group => {
                // track flat index for keyboard highlight
                const groupStartIdx = flatResults.indexOf(group.items[0]);
                return (
                  <div key={group.type}>
                    {/* Group header */}
                    <div style={{
                      padding: '0.5rem 0.875rem 0.25rem',
                      fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.08em',
                      textTransform: 'uppercase', color: 'var(--text-caption)',
                      borderTop: group.type !== groups[0].type ? '1px solid var(--border-subtle)' : 'none',
                      marginTop: group.type !== groups[0].type ? '0.25rem' : 0
                    }}>
                      {TYPE_LABEL[group.type]}
                    </div>
                    {group.items.map((item, localIdx) => {
                      const Icon = item.icon;
                      const flatIdx = groupStartIdx + localIdx;
                      const isActive = flatIdx === activeIdx;
                      return (
                        <div
                          key={item.label}
                          onMouseEnter={() => setActiveIdx(flatIdx)}
                          onMouseDown={e => { e.preventDefault(); handleSelect(item); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                            padding: '0.55rem 0.875rem',
                            cursor: 'pointer',
                            background: isActive
                              ? isDark ? 'rgba(0,242,254,0.08)' : 'var(--bg-surface-subtle)'
                              : 'transparent',
                            borderLeft: isActive
                              ? `2px solid ${isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)'}`
                              : '2px solid transparent',
                            transition: 'background 0.1s ease'
                          }}
                        >
                          {/* Icon bubble */}
                          <div style={{
                            width: '1.875rem', height: '1.875rem', borderRadius: '0.5rem', flexShrink: 0,
                            background: `${item.color}18`,
                            border: `1px solid ${item.color}30`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            <Icon size={13} color={item.color} />
                          </div>
                          {/* Text */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: '0.8125rem', fontWeight: 600,
                              color: 'var(--text-heading)', whiteSpace: 'nowrap',
                              overflow: 'hidden', textOverflow: 'ellipsis'
                            }}>
                              {item.label}
                            </div>
                            <div style={{
                              fontSize: '0.6875rem', color: 'var(--text-caption)',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                            }}>
                              {item.desc}
                            </div>
                          </div>
                          {/* Type pill */}
                          <span style={{
                            fontSize: '0.6rem', fontWeight: 700, padding: '0.1rem 0.4rem',
                            borderRadius: '0.25rem', letterSpacing: '0.04em', flexShrink: 0,
                            background: `${item.color}15`, color: item.color,
                            border: `1px solid ${item.color}25`
                          }}>
                            {item.type === 'nav' ? 'PAGE' : item.type === 'staff' ? 'STAFF' : item.type === 'ward' ? 'WARD' : 'ACTION'}
                          </span>
                          {isActive && <ArrowRight size={13} color="var(--text-caption)" style={{ flexShrink: 0 }} />}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
            {/* Footer hint */}
            <div style={{
              padding: '0.5rem 0.875rem',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', gap: '1rem',
              fontSize: '0.6rem', color: 'var(--text-caption)'
            }}>
              {[['↑↓', 'navigate'], ['↵', 'select'], ['Esc', 'close']].map(([key, label]) => (
                <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <kbd style={{
                    padding: '0.1rem 0.3rem', borderRadius: '0.2rem', fontFamily: 'inherit',
                    background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)',
                    fontSize: '0.6rem', fontWeight: 600
                  }}>{key}</kbd>
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>

        {/* ── Live Attention Ticker: Hospital items requiring attention ── */}
        <div
          className="header-attention-ticker"
          onClick={() => onNavigate && onNavigate('roster')}
          title="Staffing Alert: Wards & Outpatient Understaffed • Click to manage 24×7 Shift Roster"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.8rem',
            borderRadius: '0.625rem',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            userSelect: 'none'
          }}
        >
          <span className="beacon-danger" style={{ flexShrink: 0 }} />
          <AlertTriangle size={13} color="#ef4444" style={{ flexShrink: 0 }} />
          <span style={{
            fontSize: '0.72rem',
            fontWeight: 800,
            color: '#ef4444',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            background: 'rgba(239, 68, 68, 0.18)',
            padding: '0.12rem 0.45rem',
            borderRadius: '0.375rem',
            display: 'inline-flex',
            alignItems: 'center',
            animation: 'attention-badge-pulse 1.8s infinite ease-in-out'
          }}>
            Attention:
          </span>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: '#ef4444',
            letterSpacing: '-0.01em'
          }}>
            Wards & Outpatient Understaffed
          </span>
        </div>

        {/* ── Date Range Picker pill ── */}
        <div ref={pickerRef} style={{ position: 'relative' }}>
          <button
            onClick={() => { setPickerOpen(p => !p); setDraft(dateRange || { start: '2026-09', end: '2026-10' }); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.4rem 0.75rem',
              background: pickerOpen
                ? (isDark ? 'rgba(0,242,254,0.1)' : 'var(--brand-primary-light)')
                : 'var(--bg-surface-subtle)',
              border: `1px solid ${pickerOpen ? (isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)') : 'var(--border-color)'}`,
              borderRadius: '0.625rem', fontSize: '0.75rem', fontWeight: 700,
              color: pickerOpen ? (isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)') : 'var(--text-muted)',
              cursor: 'pointer', transition: 'all 0.15s ease'
            }}
          >
            <Calendar size={13} />
            <span>{rangeLabel}</span>
            <ChevronDown size={12} style={{ transform: pickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          {/* Picker dropdown */}
          {pickerOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 0.5rem)', right: 0,
              width: '280px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '0.875rem',
              boxShadow: isDark ? '0 16px 40px rgba(0,0,0,0.8)' : '0 12px 32px rgba(15,23,42,0.14)',
              padding: '1rem',
              zIndex: 300
            }}>
              {/* Presets */}
              <div style={{ marginBottom: '0.875rem' }}>
                <div style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-caption)', marginBottom: '0.4rem' }}>Quick Select</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                  {PRESETS.map(p => {
                    const isActive = draft.start === p.start && draft.end === p.end;
                    return (
                      <button
                        key={p.label}
                        onClick={() => setDraft({ start: p.start, end: p.end })}
                        style={{
                          padding: '0.3rem 0.625rem', borderRadius: '0.5rem',
                          fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                          border: `1px solid ${isActive ? (isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)') : 'var(--border-color)'}`,
                          background: isActive ? (isDark ? 'rgba(0,242,254,0.12)' : 'var(--brand-primary-light)') : 'var(--bg-surface-subtle)',
                          color: isActive ? (isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)') : 'var(--text-body)',
                          display: 'flex', alignItems: 'center', gap: '0.25rem', transition: 'all 0.15s'
                        }}
                      >
                        {isActive && <Check size={11} />}
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: '1px', background: 'var(--border-subtle)', marginBottom: '0.875rem' }} />

              {/* Manual month selectors */}
              <div style={{ marginBottom: '0.875rem' }}>
                <div style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-caption)', marginBottom: '0.5rem' }}>Custom Range</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {[['start', 'From'], ['end', 'To']].map(([key, lbl]) => (
                    <div key={key}>
                      <label style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem', fontWeight: 600 }}>{lbl}</label>
                      <input
                        type="month"
                        value={draft[key]}
                        min="2024-01"
                        max="2028-12"
                        onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                        style={{
                          width: '100%', padding: '0.4rem 0.5rem',
                          borderRadius: '0.5rem', fontSize: '0.75rem',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-surface-subtle)',
                          color: 'var(--text-heading)', outline: 'none',
                          colorScheme: isDark ? 'dark' : 'light'
                        }}
                      />
                    </div>
                  ))}
                </div>
                {draft.start > draft.end && (
                  <p style={{ fontSize: '0.6875rem', color: 'var(--brand-rose)', marginTop: '0.4rem' }}>
                    ⚠ Start month must be before end month
                  </p>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={applyRange}
                  disabled={draft.start > draft.end}
                  style={{
                    flex: 1, padding: '0.5rem', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 700,
                    border: 'none', cursor: draft.start > draft.end ? 'not-allowed' : 'pointer',
                    background: isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)',
                    color: isDark ? '#0a0c10' : '#fff',
                    opacity: draft.start > draft.end ? 0.5 : 1, transition: 'all 0.15s'
                  }}
                >
                  Apply Filter
                </button>
                <button
                  onClick={resetRange}
                  style={{
                    padding: '0.5rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 600,
                    border: '1px solid var(--border-color)', cursor: 'pointer',
                    background: 'var(--bg-surface-subtle)', color: 'var(--text-muted)'
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
