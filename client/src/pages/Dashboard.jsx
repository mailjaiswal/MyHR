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
  const { user, hasPerm, dataScope, authFetch } = useAuth();
  const { dateRange, setMode, setCustom, from, to } = useDateRange('month');

  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [pending, setPending] = useState(null);
  const [myRecords, setMyRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const qs = `?from=${from}&to=${to}`;

    Promise.all([
      authFetch(`/api/v1/dashboard/summary${qs}`).then(r => r.json()),
      authFetch(`/api/v1/dashboard/trend${qs}`).then(r => r.json()),
      hasPerm('REGULARIZATION_APPROVE') || hasPerm('LEAVES_APPROVE')
        ? authFetch('/api/v1/dashboard/pending-actions').then(r => r.json())
        : Promise.resolve({ success: false }),
      dataScope === 'SELF'
        ? authFetch(`/api/v1/dashboard/my-attendance${qs}`).then(r => r.json())
        : Promise.resolve({ success: false })
    ]).then(([sum, tr, pend, mine]) => {
      if (sum.success) setSummary(sum);
      if (tr.success) setTrend(tr.trend || []);
      if (pend.success) setPending(pend);
      if (mine.success) setMyRecords(mine.records || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [from, to, authFetch, hasPerm, dataScope]);

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
  const pct = s && s.totalStaff > 0 ? Math.round((s.presentCount / s.totalStaff) * 100) : 0;

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
            <StatCard icon={UserCheck} label="Present" value={s.presentCount} tone="ok" hint={`${pct}% of strength`} onClick={() => onNavigate('attendance')} />
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
      {trend.length > 0 && (
        <section className="section-card">
          <div className="section-head">
            <span className="section-title"><TrendingUp size={16} /> Attendance Trend</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>Hours logged &middot; {dateRange.label}</span>
          </div>
          <div className="section-body">
            <div className="bar-chart">
              {trend.map(t => {
                const total = Number(t.present) + Number(t.absent) + Number(t.half_day);
                const presentPct = total > 0 ? Math.round((Number(t.present) / total) * 100) : 0;
                return (
                  <div className="bar-col" key={t.day} title={`${t.label} - ${presentPct}% present - ${Number(t.hours || 0)}h logged`}>
                    <span className={`bar-hours${presentPct < 50 ? ' bar-hours-warn' : ''}`}>{Number(t.hours || 0)}h</span>
                    <span className="bar-track">
                      <span className="bar-fill-ok" style={{ height: `${Math.max(presentPct, 3)}%` }} />
                    </span>
                    <span className="bar-label">{t.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

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
