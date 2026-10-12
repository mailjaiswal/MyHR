import React, { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '../context/OrganizationContext';
import { useAuth } from '../context/AuthContext';
import { useDateRange } from '../hooks/useDateRange';
import DateRangePicker from '../components/DateRangePicker';
import {
  Users, UserCheck, UserX, Clock3, ArrowUpRight, Activity, Wallet, Loader2, TrendingUp
} from 'lucide-react';

function StatCard({ icon: Icon, label, value, hint, tone = 'default', onClick }) {
  const color = tone === 'ok' ? 'var(--brand-primary)' : tone === 'bad' ? 'var(--brand-rose)' : tone === 'warn' ? '#d97706' : 'var(--text-muted)';
  const cls = `stat-card${onClick ? ' stat-card-clickable' : ''}`;
  const body = (
    <>
      <span className="stat-label"><Icon size={14} style={{ color }} /> {label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </>
  );
  if (!onClick) return <div className={cls}>{body}</div>;
  return <button className={cls} onClick={onClick} style={{ textAlign: 'left' }}>{body}</button>;
}

export default function Dashboard({ onNavigate }) {
  const { org } = useOrganization();
  const { user, hasPerm, dataScope, api } = useAuth();
  const { dateRange, setMode, setCustom, from, to } = useDateRange('last30');

  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [pending, setPending] = useState(null);
  const [myRecords, setMyRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  // Which per-day metric the Attendance Trend bars represent.
  const [trendMetric, setTrendMetric] = useState('present');

  // { cache: true } ⇒ back-navigation to the dashboard paints instantly from
  // the shared GET cache; any write anywhere in the app invalidates it.
  const load = useCallback(() => {
    setLoading(true);
    const qs = `?from=${from}&to=${to}`;

    Promise.all([
      api(`/api/v1/dashboard/summary${qs}`, {}, { cache: true }),
      api(`/api/v1/dashboard/trend${qs}`, {}, { cache: true }),
      hasPerm('REGULARIZATION_APPROVE') || hasPerm('LEAVES_APPROVE')
        ? api('/api/v1/dashboard/pending-actions', {}, { cache: true })
        : Promise.resolve({ success: false }),
      dataScope === 'SELF'
        ? api(`/api/v1/dashboard/my-attendance${qs}`, {}, { cache: true })
        : Promise.resolve({ success: false })
    ]).then(([sum, tr, pend, mine]) => {
      if (sum.success) setSummary(sum);
      if (tr.success) setTrend(tr.trend || []);
      if (pend.success) setPending(pend);
      if (mine.success) setMyRecords(mine.records || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [from, to, api, hasPerm, dataScope]);

  useEffect(load, [load]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (user?.full_name || user?.first_name || 'there').split(' ')[0];

  if (loading) {
    return (
      <div className="loading-state">
        <Loader2 size={28} className="spin" />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  const s = summary?.stats || null;
  // presentCount is a count of attendance RECORDS over the selected range, while
  // totalStaff is a headcount - so "% of strength" is only meaningful for a single
  // day (present <= strength). For a wider range we show a person-days attendance
  // rate instead, which stays correct however long the period is.
  const markedDays = s ? (s.presentCount + s.absentCount + (s.halfDayCount || 0)) : 0;
  const presentHint = s && s.totalStaff > 0
    ? (s.presentCount <= s.totalStaff
        ? `${Math.round((s.presentCount / s.totalStaff) * 100)}% of strength`
        : (markedDays > 0 ? `${Math.round((s.presentCount / markedDays) * 100)}% attendance in range` : 'No attendance marked yet'))
    : '';

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title-wrap">
          <h1>{greeting}, {firstName}.</h1>
          <span className="page-desc">
            {org?.name || 'Company'} &middot; {dateRange.label} &middot; Scope: {dataScope}
          </span>
        </div>
        <div className="page-actions">
          <DateRangePicker dateRange={dateRange} setMode={setMode} setCustom={setCustom} />
        </div>
      </div>

      {/* Stats Grid — adapts by scope */}
      {s && (
        <div className="stat-grid">
          {dataScope !== 'SELF' && (
            <StatCard icon={Users} label="Total staff" value={s.totalStaff} hint="In your scope" onClick={hasPerm('EMPLOYEES_VIEW') ? () => onNavigate('employees') : undefined} />
          )}
          {dataScope !== 'SELF' && (
            <StatCard icon={UserCheck} label="Present" value={s.presentCount} tone="ok" hint={presentHint} onClick={() => onNavigate('attendance')} />
          )}
          {dataScope !== 'SELF' && (
            <StatCard icon={UserX} label="Absent" value={s.absentCount} tone="bad" hint="Not punched in" onClick={() => onNavigate('attendance')} />
          )}
          <StatCard icon={Clock3} label="Late arrivals" value={s.lateCount} tone="warn" hint="Past grace period" onClick={() => onNavigate('attendance')} />
          <StatCard icon={Activity} label="Total hours" value={`${s.totalHours}h`} hint="Logged this period" />
          {hasPerm('PAYROLL_VIEW') && (
            <StatCard icon={Wallet} label="Payroll" value="View" hint="Access payslips" onClick={() => onNavigate('payroll')} />
          )}
        </div>
      )}

      {/* Trend Chart */}
      {trend.length > 0 && (() => {
        // Duration + day-wise aggregates for the visible scope.
        const totalHours = trend.reduce((a, t) => a + Number(t.hours || 0), 0);
        const totalPresent = trend.reduce((a, t) => a + Number(t.present || 0), 0);
        const days = trend.length || 1;
        const avgHours = Math.round((totalHours / days) * 10) / 10;
        const avgPresent = Math.round(totalPresent / days);
        const fmtH = (n) => (Number.isInteger(n) ? n : n.toFixed(1));

        // Field chooser: what each daily bar + its value label represents.
        const perDayAvg = (t) => { const p = Number(t.present || 0); return p > 0 ? Math.round(Number(t.hours || 0) / p * 10) / 10 : 0; };
        const METRICS = {
          present:  { label: 'Employees present', pick: (t) => Number(t.present || 0), unit: '',  tip: (t, v) => `${v} present` },
          hours:    { label: 'Total hours logged', pick: (t) => Number(t.hours || 0),  unit: 'h', tip: (t, v) => `${fmtH(v)}h logged` },
          avgHours: { label: 'Avg hrs / employee', pick: perDayAvg,                   unit: 'h', tip: (t, v) => `${fmtH(v)}h avg / employee` },
        };
        const active = METRICS[trendMetric] || METRICS.present;
        const maxVal = Math.max(...trend.map(active.pick), 1);

        return (
          <section className="section-card">
            <div className="section-head">
              <span className="section-title"><TrendingUp size={16} /> Attendance Trend</span>
              <div className="trend-metrics">
                <span className="trend-metric"><Clock3 size={13} /> Total <strong>{fmtH(totalHours)}h</strong> <em>{dateRange.label}</em></span>
                <span className="trend-metric"><Activity size={13} /> Daily avg <strong>{fmtH(avgHours)}h</strong></span>
                <span className="trend-metric"><UserCheck size={13} /> Avg <strong>{avgPresent}</strong> present/day</span>
              </div>
            </div>
            <div className="trend-chooser" role="tablist" aria-label="Trend metric">
              {Object.entries(METRICS).map(([key, m]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={trendMetric === key}
                  className={`trend-choice${trendMetric === key ? ' is-active' : ''}`}
                  onClick={() => setTrendMetric(key)}
                >{m.label}</button>
              ))}
            </div>
            <div className="section-body">
              <div className={`bar-chart${trend.length > 10 ? ' bar-chart-dense' : ''}`}>
                {trend.map(t => {
                  const val = active.pick(t);
                  const pct = maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;
                  return (
                    <div className="bar-col" key={t.day} title={`${t.label} · ${active.tip(t, val)} · ${Number(t.present||0)} present · ${fmtH(Number(t.hours||0))}h`}>
                      <span className="bar-hours">{fmtH(val)}{active.unit}</span>
                      <span className="bar-track">
                        <span className="bar-fill-ok" style={{ height: `${Math.max(pct, 3)}%` }} />
                      </span>
                      <span className="bar-label">{t.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })()}

      {/* Department breakdown (visible for DEPARTMENT and ALL scopes) */}
      {(dataScope === 'ALL' || dataScope === 'DEPARTMENT') && summary?.deptStats?.length > 0 && (
        <section className="section-card">
          <div className="section-head">
            <span className="section-title"><Users size={16} /> By Department</span>
          </div>
          <div className="section-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {summary.deptStats.map(d => (
              <div key={d.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{d.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{d.present_count} present</span>
                </div>
                <div style={{ height: '0.375rem', borderRadius: '9999px', background: 'var(--bg-surface-subtle)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(d.present_count > 0 ? 20 : 2, 2)}%`, height: '100%', borderRadius: '9999px', background: 'linear-gradient(90deg, #34d399, var(--brand-primary))' }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pending actions (visible for MANAGER+ scopes with approval perms) */}
      {pending && pending.totalPending > 0 && (
        <section className="section-card">
          <div className="section-head">
            <span className="section-title"><Activity size={16} /> Pending Your Approval</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{pending.totalPending} action(s)</span>
          </div>
          <div className="section-body">
            {pending.pendingLeaves.length > 0 && (
              <div style={{ marginBottom: '0.75rem' }}>
                <strong style={{ fontSize: '0.8125rem' }}>Leave Requests:</strong>
                {pending.pendingLeaves.slice(0, 5).map(l => (
                  <div key={l.id} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0.25rem 0' }}>
                    {l.full_name} - {l.leave_type_name} ({l.days}d) - {l.from_date} to {l.to_date}
                  </div>
                ))}
              </div>
            )}
            {pending.pendingCorrections.length > 0 && (
              <div>
                <strong style={{ fontSize: '0.8125rem' }}>Corrections:</strong>
                {pending.pendingCorrections.slice(0, 5).map(c => (
                  <div key={c.id} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0.25rem 0' }}>
                    {c.full_name} - {c.duty_date} - requested {c.requested_hours}h (logged {c.original_hours}h)
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Self view: personal attendance table */}
      {dataScope === 'SELF' && myRecords.length > 0 && (
        <section className="section-card">
          <div className="section-head">
            <span className="section-title"><Clock3 size={16} /> My Attendance</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{dateRange.label}</span>
          </div>
          <div className="table-wrap">
            <table className="swaniki-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>First In</th>
                  <th>Last Out</th>
                  <th>Hours</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {myRecords.slice(0, 20).map(r => (
                  <tr key={r.duty_date}>
                    <td>{r.duty_date}</td>
                    <td className="mono">{r.first_in_time ? new Date(r.first_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--'}</td>
                    <td className="mono">{r.last_out_time ? new Date(r.last_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--'}</td>
                    <td className="mono">{Number(r.total_hours || 0).toFixed(1)}h</td>
                    <td><span className={`status-pill ${r.status === 'PRESENT' || r.status === 'OVERTIME' ? 'status-ok' : r.status === 'HALF_DAY' ? 'status-warn' : 'status-bad'}`}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
