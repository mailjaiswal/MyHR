import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { OrganizationProvider } from './context/OrganizationContext';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import PayslipModal from './components/PayslipModal';
import PasswordChangeModal from './components/PasswordChangeModal';
import Login from './pages/Login';
import { Menu as MenuIcon } from 'lucide-react';

// Pages
import Dashboard from './pages/Dashboard';
import Attendance from './pages/Attendance';
import Payroll from './pages/Payroll';
import Employees from './pages/Employees';
import Leaves from './pages/Leaves';
import ShiftRoster from './pages/ShiftRoster';
import Regularization from './pages/Regularization';
import AuditLog from './pages/AuditLog';
import Settings from './pages/Settings';
import DemoLab from './pages/DemoLab';

function AppContent() {
  const { user, loading, mustChangePassword, authFetch } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [demoKey, setDemoKey] = useState('simulator');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

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
        <div className="loading-state">
          <div className="brand-logo" style={{ width: 48, height: 48, marginBottom: '1rem' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M13 2L3 14h9l-1 10 10-12h-9l1-10z"/></svg>
          </div>
          <p>Loading myHR...</p>
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
      case 'demo': return <DemoLab demoKey={demoKey} />;
      default: return <Dashboard onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="app-shell">
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
          <span className="mobile-topbar-title">myHR</span>
        </header>

        <main className="main-content-wrapper">
          {renderPage()}
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
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <OrganizationProvider>
          <AppContent />
        </OrganizationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
