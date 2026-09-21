// Canonical navigation map, shared by the desktop Sidebar and the mobile
// bottom-nav bar so permissions + ordering stay in one place.
import {
  LayoutDashboard,
  Fingerprint,
  Banknote,
  Users,
  CalendarClock,
  Settings,
  Hourglass,
  ShieldCheck,
  ScrollText
} from 'lucide-react';

// Each item is gated by a permission key (checked via AuthContext.hasPerm).
export const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'DASHBOARD_VIEW' },
  { key: 'attendance', label: 'Attendance', icon: Fingerprint, perm: 'ATTENDANCE_VIEW' },
  { key: 'payroll', label: 'Payroll', icon: Banknote, perm: 'PAYROLL_VIEW' },
  { key: 'employees', label: 'Employees', icon: Users, perm: 'EMPLOYEES_VIEW' },
  { key: 'leaves', label: 'Leaves', icon: CalendarClock, perm: 'LEAVES_VIEW' },
  { key: 'shift_roster', label: 'Shift Roster', icon: Hourglass, perm: 'ROSTER_VIEW' },
  { key: 'regularization', label: 'Regularization', icon: ShieldCheck, perm: 'REGULARIZATION_APPROVE' },
  { key: 'audit', label: 'Audit Log', icon: ScrollText, perm: 'AUDIT_VIEW' },
  { key: 'settings', label: 'Admin Panel', icon: Settings, perm: 'SETTINGS_VIEW' }
];

export default NAV_ITEMS;
