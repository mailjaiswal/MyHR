import React, { useState, lazy, Suspense, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { OrganizationProvider, useOrganization } from './context/OrganizationContext';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import PasswordChangeModal from './components/PasswordChangeModal';
import OnboardingWizardModal from './components/OnboardingWizardModal';
import Login from './pages/Login';
import useSpotlight from './hooks/useSpotlight';
import GlobalDialog from './components/GlobalDialog';
import { installDialogOverrides } from './utils/dialog';
import { Menu as MenuIcon, Loader2 } from 'lucide-react';

// Native alert() everywhere in the app now renders as a centered themed dialog.
installDialogOverrides();

// Pages are code-split: the initial shell only ships Login + Dashboard +
// sidebar chrome. Everything else streams in on first visit, and below we
// warm the caches during the first idle moment after login so navigation
// after that is instant.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Payroll = lazy(() => import('./pages/Payroll'));
const Employees = lazy(() => import('./pages/Employees'));
const Leaves = lazy(() => import('./pages/Leaves'));
const ShiftRoster = lazy(() => import('./pages/ShiftRoster'));
const Regularization = lazy(() => import('./pages/Regularization'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const Settings = lazy(() => import('./pages/Settings'));
const DemoLab = lazy(() => import('./pages/DemoLab'));
const MasterAdminSettings = lazy(() => import('./pages/MasterAdminSettings'));
const PayslipModal = lazy(() => import('./components/PayslipModal'));
import BrandLogo from './components/BrandLogo';

function PageFallback() {
  return (
    <div className="loading-state">
      <Loader2 size={28} className="spin" />
      <p>Loading…</p>
    </div>
  );
}

function AppContent() {
  const { user, loading, mustChangePassword, authFetch, isMasterAdmin } = useAuth();
  const { org } = useOrganization();
  // Cursor-tracking card ring - a single delegated listener for the whole shell.
  useSpotlight(!loading && !!user);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [demoKey, setDemoKey] = useState('simulator');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Pre-warm every page chunk once the shell is up, using the browser's idle
  // time. Low priority, parallel, never blocks interaction — by the time the
  // user clicks a sidebar item the module is already in memory.
  useEffect(() => {
    if (!user || loading) return;
    const warm = () => {
      const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
      idle(() => {
        import('./pages/Attendance');
        import('./pages/Payroll');
        import('./pages/Employees');
        import('./pages/Leaves');
        import('./pages/ShiftRoster');
        import('./pages/Regularization');
        import('./pages/AuditLog');
        import('./pages/Settings');
        if (isMasterAdmin) { import('./pages/DemoLab'); import('./pages/MasterAdminSettings'); }
      });
    };
    const t = setTimeout(warm, 1200);
    return () => clearTimeout(t);
  }, [user, loading, isMasterAdmin]);

  const [isPayslipOpen, setIsPayslipOpen] = useState(false);
  const [payslipData, setPayslipData] = useState(null);
  const [payslipEmployeeId, setPayslipEmployeeId] = useState(null);
  const [settingsNav, setSettingsNav] = useState(null);

  const openPayslip = async (employeeId, monthYear) => {
    try {
      const res = await authFetch(`/api/v1/payroll/payslip/${employeeId}/${monthYear}`);
      const data = await res.json();
      if (data.success) {
        setPayslipData(data);
        setPayslipEmployeeId(employeeId);
        setIsPayslipOpen(true);
      } else {
        alert(data.error || 'Failed to fetch payslip');
      }
    } catch (err) {
      alert(`Error fetching payslip: ${err.message}`);
    }
  };

  // Cross-page navigation: allow pages to jump to another tab, optionally deep-linking a Settings sub-tab.
  const handleNavigate = (tab, sub) => {
    if (tab === 'settings') setSettingsNav({ tab: sub || 'company', n: Date.now() });
    setActiveTab(tab);
  };

  // Loading state
  if (loading) {
    return (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="brand-logo" style={{ width: 48, height: 56, marginBottom: '1rem', background: 'transparent', boxShadow: 'none' }}>
            <BrandLogo size={42} />
          </div>
          <p style={{ fontWeight: 500, color: 'var(--text-heading)' }}>Loading myHR by Swaniki...</p>
        </div>
      </div>
    );
  }

  // Not authenticated -> show Login
  if (!user) {
    return <Login />;
  }

  const renderPage = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard onNavigate={setActiveTab} />;
      case 'attendance': return <Attendance />;
      case 'payroll': return <Payroll onOpenPayslip={openPayslip} />;
      case 'employees': return <Employees />;
      case 'leaves': return <Leaves />;
      case 'shift_roster': return <div className="page"><ShiftRoster onNavigate={handleNavigate} /></div>;
      case 'regularization': return <Regularization />;
      case 'audit': return <AuditLog />;
      case 'settings': return <Settings initialTab={settingsNav} onNavigate={handleNavigate} />;
      // Platform-owner-only sections: even if the tab is somehow set, non-Super
      // Admins fall back to the Dashboard (the APIs behind them are gated too).
      case 'demo': return isMasterAdmin ? <DemoLab demoKey={demoKey} /> : <Dashboard onNavigate={setActiveTab} />;
      case 'master_admin': return isMasterAdmin ? <MasterAdminSettings /> : <Dashboard onNavigate={setActiveTab} />;
      default: return <Dashboard onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      {isMobileNavOpen && (
        <div className="mobile-overlay" onClick={() => setIsMobileNavOpen(false)} />
      )}

      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        demoKey={demoKey}
        setDemoKey={setDemoKey}
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
      />

      <div className="app-main-col">
        {/* Compact mobile header: the desktop Topbar was removed, so this is the
            phone/tablet entry point for the navigation drawer. */}
        <header className="mobile-topbar">
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setIsMobileNavOpen(true)}
            aria-label="Open menu"
          >
            <MenuIcon size={22} />
          </button>
          <span className="mobile-topbar-title">myHR by Swaniki</span>
        </header>

        <main className="main-content-wrapper" id="main-content">
          <Suspense fallback={<PageFallback />}>
            {renderPage()}
          </Suspense>
        </main>
      </div>

      <MobileNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenNav={() => setIsMobileNavOpen(true)}
      />

      <PayslipModal
        isOpen={isPayslipOpen}
        onClose={() => setIsPayslipOpen(false)}
        payslipData={payslipData}
        employeeId={payslipEmployeeId}
        onViewPayslip={openPayslip}
      />

      {/* Force password change on first login */}
      {mustChangePassword && <PasswordChangeModal forced={true} />}

      {/* Force statutory onboarding & legal hold-harmless sign-off if not accepted */}
      {!mustChangePassword && (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && org && !org.terms_accepted_at && (
        <OnboardingWizardModal isOpen={true} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <OrganizationProvider>
          <AppContent />
          {/* Root-level themed dialog host: available on Login, loading and every page. */}
          <GlobalDialog />
        </OrganizationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
