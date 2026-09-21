// server/services/emailTemplates.js
// Plain, light/dark-safe inline-CSS HTML layout + per-event content builders.
// No external assets so emails render everywhere.

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Generic shell: logo-ish header, title, paragraph lines, optional button link.
function renderEmail({ orgName, title, intro = [], lines = [], note, cta }) {
  const introHtml = intro.map(p => `<p style="margin:0 0 12px;">${p}</p>`).join('');
  const linesHtml = lines.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:4px 0 14px;">${
        lines.map(([k, v]) => `<tr>
          <td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top;">${esc(k)}</td>
          <td style="padding:6px 0;font-size:14px;color:#0f172a;font-weight:600;">${esc(v)}</td>
        </tr>`).join('')
      }</table>`
    : '';
  const ctaHtml = cta && cta.url
    ? `<p style="margin:18px 0 6px;"><a href="${esc(cta.url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:600;">${esc(cta.label || 'Open myHR')}</a></p>`
    : '';
  const noteHtml = note ? `<p style="margin:14px 0 0;color:#64748b;font-size:12px;">${esc(note)}</p>` : '';
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:Segoe UI,Arial,Helvetica,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;">
    <tr><td style="padding:20px 28px 0;">
      <span style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;border-radius:8px;padding:6px 10px;font-size:14px;letter-spacing:.3px;">myHR</span>
      <span style="color:#64748b;font-size:13px;margin-left:8px;">${esc(orgName)}</span>
    </td></tr>
    <tr><td style="padding:18px 28px 24px;">
      <h2 style="margin:0 0 14px;font-size:18px;">${esc(title)}</h2>
      ${introHtml}${linesHtml}${ctaHtml}${noteHtml}
    </td></tr>
    <tr><td style="padding:14px 28px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;">
      Automated notification from myHR by Swaniki · ${esc(orgName)}
    </td></tr>
  </table>
</body></html>`;
}

// Plain-text fallback (also used for the outbox preview column).
function renderText(title, lines = [], intro = []) {
  const body = lines.map(([k, v]) => `${k}: ${v}`).join('\n');
  return [title, ...intro, body].filter(Boolean).join('\n\n');
}

// event -> { subject(ctx), title(ctx), intro(ctx), lines(ctx), cta(ctx), note }
// ctx always contains { orgName, appUrl } plus event-specific fields.
const BUILDERS = {
  'leave.requested': {
    subject: (c) => `Leave request from ${c.employeeName} (${c.days} day(s))`,
    title: 'New leave request awaiting your approval',
    intro: (c) => [`${c.employeeName} has submitted a leave request that needs a decision.`],
    lines: (c) => [['Employee', c.employeeName], ['Leave type', c.leaveType], ['From', c.fromDate], ['To', c.toDate], ['Days', c.days], ['Reason', c.reason || '-']],
    cta: (c) => ({ label: 'Review request', url: `${c.appUrl}` })
  },
  'leave.ack': {
    subject: (c) => `Leave request received - ${c.leaveType}`,
    title: 'Your leave request has been submitted',
    intro: (c) => ['We have received your leave request and it is awaiting approval.'],
    lines: (c) => [['Leave type', c.leaveType], ['From', c.fromDate], ['To', c.toDate], ['Days', c.days]]
  },
  'leave.approved': {
    subject: (c) => `Leave approved - ${c.leaveType} (${c.fromDate} to ${c.toDate})`,
    title: 'Your leave request was approved',
    intro: (c) => [`${c.decidedByName ? esc(c.decidedByName) + ' has' : 'The approver has'} approved your leave request.`],
    lines: (c) => [['Leave type', c.leaveType], ['From', c.fromDate], ['To', c.toDate], ['Days', c.days]]
  },
  'leave.rejected': {
    subject: (c) => `Leave rejected - ${c.leaveType}`,
    title: 'Your leave request was rejected',
    intro: (c) => ['Unfortunately your leave request was not approved.'],
    lines: (c) => [['Leave type', c.leaveType], ['From', c.fromDate], ['To', c.toDate], ['Reason given', c.decisionNote || '-']]
  },
  'correction.requested': {
    subject: (c) => `Attendance correction requested by ${c.employeeName} (${c.dutyDate})`,
    title: 'Attendance correction awaiting review',
    intro: (c) => [`${c.employeeName} requested a correction to their attendance for ${c.dutyDate}.`],
    lines: (c) => [['Employee', c.employeeName], ['Duty date', c.dutyDate], ['Logged hours', c.originalHours], ['Requested hours', c.requestedHours], ['Reason', c.reason || '-']],
    cta: (c) => ({ label: 'Review correction', url: c.appUrl })
  },
  'correction.decided': {
    subject: (c) => `Attendance correction ${c.decision} for ${c.dutyDate}`,
    title: `Your attendance correction was ${c.decision.toLowerCase()}`,
    intro: (c) => [`The correction request for duty date ${c.dutyDate} has been ${c.decision.toLowerCase()}.`],
    lines: (c) => [['Decision', c.decision], ['Reviewed by', c.decidedByName || '-'], ['Note', c.note || '-']]
  },
  'attendance.regularized': {
    subject: (c) => `Attendance regularized for ${c.dutyDate}`,
    title: 'Your attendance has been regularized',
    intro: (c) => [`An admin regularized your attendance for ${c.dutyDate}.`],
    lines: (c) => [['Duty date', c.dutyDate], ['Hours', c.hours ?? '-'], ['By', c.actorName || 'Admin']]
  },
  'overtime.logged': {
    subject: (c) => `Overtime logged on ${c.dutyDate} (${c.otHours} hrs)`,
    title: 'Overtime hours recorded',
    intro: (c) => [`Overtime was detected in your attendance for ${c.dutyDate}. It will be included in payroll as per OT policy.`],
    lines: (c) => [['Duty date', c.dutyDate], ['Worked hours', c.totalHours], ['OT hours', c.otHours], ['Status', c.status]]
  },
  'overtime.summary': {
    subject: (c) => `${c.count} overtime record(s) logged today`,
    title: 'Overtime activity summary',
    intro: (c) => [`New overtime records were classified by the attendance engine.`],
    lines: (c) => [['Employees with OT', c.count], ['Total OT hours', c.totalOtHours], ['Source', c.source || '-']],
    cta: (c) => ({ label: 'View attendance', url: c.appUrl })
  },
  'employee.created': {
    subject: (c) => `${c.count} new employee record(s) added to myHR`,
    title: 'New employees added to the system',
    intro: (c) => [`Employee records were created${c.sourceName ? ` via data source "${c.sourceName}"` : ''}.`],
    lines: (c) => [['Count', c.count], ['Names', c.names || '-'], ['Source', c.sourceName || 'System']],
    cta: (c) => ({ label: 'Open Employees', url: c.appUrl })
  },
  'employee.role_changed': {
    subject: (c) => `Your access role was updated`,
    title: 'Your myHR role has changed',
    intro: (c) => [`An administrator updated your role in myHR.`],
    lines: (c) => [['New role', c.roleName], ['Changed by', c.actorName || 'Admin']]
  },
  'employee.manager_changed': {
    subject: (c) => `Your reporting manager was updated`,
    title: 'Your reporting manager has changed',
    intro: (c) => [`An administrator updated your reporting manager.`],
    lines: (c) => [['New manager', c.managerName || '(none)'], ['Changed by', c.actorName || 'Admin']]
  },
  'payroll.completed': {
    subject: (c) => `Payroll processed for ${c.monthLabel}`,
    title: 'Payroll run completed',
    intro: (c) => [`The payroll run for ${c.monthLabel} finished successfully.`],
    lines: (c) => [['Month', c.monthLabel], ['Employees', c.count], ['Gross', c.gross], ['Net payable', c.net]],
    cta: (c) => ({ label: 'Open Payroll', url: c.appUrl })
  },
  'payslip.generated': {
    subject: (c) => `Your payslip for ${c.monthLabel} is ready`,
    title: 'New payslip available',
    intro: (c) => ['Your payslip has been generated and is ready to view in myHR.'],
    lines: (c) => [['Month', c.monthLabel], ['Net payable', c.net]],
    cta: (c) => ({ label: 'View payslip', url: c.appUrl })
  },
  'password.admin_reset': {
    subject: (c) => `Your myHR password was reset by an admin`,
    title: 'Account password reset',
    intro: (c) => [`An administrator reset your myHR password. Use the temporary password shared with you by HR to log in; you will be asked to set a new password.`],
    lines: (c) => [['Reset by', c.actorName || 'Admin'], ['Note', 'Temporary passwords are never sent by email for security.']],
    cta: (c) => ({ label: 'Go to login', url: c.appUrl })
  },
  'auth.lockout': {
    subject: (c) => `Security alert: account locked after failed logins (${c.email})`,
    title: 'Account lockout triggered',
    intro: (c) => [`An account was locked for 30 minutes after repeated failed login attempts.`],
    lines: (c) => [['Account', c.email], ['IP', c.ip || '-'], ['Failed attempts', c.attempts]],
    note: 'If this looks like an attack, reset the password from Admin Panel > Access Management.'
  },
  'test.email': {
    subject: () => 'myHR SMTP test email',
    title: 'SMTP configuration works',
    intro: () => ['This is a test notification from myHR. Your email settings are configured correctly.'],
    lines: []
  }
};

function buildEventEmail(event, ctx) {
  const b = BUILDERS[event];
  if (!b) return null;
  return {
    subject: b.subject(ctx),
    html: renderEmail({ orgName: ctx.orgName, title: b.title(ctx), intro: b.intro(ctx), lines: b.lines(ctx), note: b.note, cta: b.cta ? b.cta(ctx) : null }),
    text: renderText(b.title(ctx), b.lines(ctx), b.intro(ctx).map(s => String(s).replace(/<[^>]+>/g, '')))
  };
}

module.exports = { renderEmail, buildEventEmail, EVENTS: Object.keys(BUILDERS) };
