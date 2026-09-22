import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useOrganization } from '../context/OrganizationContext';
import { NAV_ITEMS } from '../config/navItems';
import {
  ChevronDown,
  X,
  Zap,
  Sun,
  Moon,
  LogOut,
  KeyRound,
  Menu
} from 'lucide-react';
import PasswordChangeModal from './PasswordChangeModal';
import useEscapeClose from '../hooks/useEscapeClose';

const DEMO_NAV = [
  { key: 'simulator', label: 'Device Simulator', desc: 'Simulate biometric punches' },
  { key: 'gateway', label: 'Hardware Gateway', desc: 'Anubhav partner hub & API key' },
  { key: 'roster', label: '24x7 Roster', desc: 'Cross-midnight shift timeline' },
  { key: 'sources', label: 'Data Sources', desc: 'eSSL / ZKTeco sync & uploads' },
  { key: 'reports', label: 'Custom Reports', desc: 'Muster & statutory export builder' }
];

export default function Sidebar({ activeTab, setActiveTab, demoKey, setDemoKey, isOpen, onClose }) {
  const { isDark, toggleTheme } = useTheme();
  const { org } = useOrganization();
  const { user, role, hasPerm, logout } = useAuth();
  const [demoOpen, setDemoOpen] = useState(false);

  // Escape closes the mobile navigation drawer.
  useEscapeClose(isOpen && typeof onClose === 'function', onClose);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setUserMenuOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const orgName = org?.name || 'Company';

  const go = (tab, key) => {
    setActiveTab(tab);
    if (key) setDemoKey(key);
    if (onClose) onClose();
  };

  const renderItem = (item) => {
    if (!hasPerm(item.perm)) return null;
    return (
      <button
        key={item.key}
        onClick={() => go(item.key)}
        className={`nav-item ${activeTab === item.key ? 'nav-item-active' : ''}`}
      >
        <item.icon size={18} strokeWidth={1.9} />
        <span>{item.label}</span>
      </button>
    );
  };

  return (
    <div className={`sidebar-drawer ${isOpen ? 'drawer-open' : ''}`}>
      {/* Brand + mobile menu toggle */}
      <div className="sidebar-brand">
        <button className="icon-btn topbar-menu-btn" onClick={() => { if (onClose && !isOpen) { /* open */ } }} aria-label="Toggle menu"
          style={{ display: 'none' }} /* shown only on mobile via CSS */
        >
          <Menu size={20} />
        </button>
        <div className="brand-logo">
          <Zap size={18} strokeWidth={2.2} />
        </div>
        <div className="brand-text">
          <span className="brand-name">myHR</span>
          <span className="brand-sub">by Swaniki</span>
        </div>
        <button className="icon-btn sidebar-close-btn" onClick={onClose} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      {/* Org context */}
      <div className="sidebar-org">
        <span className="org-chip">{orgName}</span>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-group-label">Main</div>
        {NAV_ITEMS.map(renderItem)}

        {hasPerm('DEMO_LAB') && (
          <>
            <div className="nav-group-label nav-group-label-toggle" onClick={() => setDemoOpen(v => !v)}>
              <span>Demo Lab</span>
              <ChevronDown size={14} className={demoOpen ? 'chev-rot-180' : ''} />
            </div>
            {demoOpen && (
              <div className="demo-nav-children">
                {DEMO_NAV.map((item) => {
                  const active = activeTab === 'demo' && demoKey === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => go('demo', item.key)}
                      className={`nav-item nav-item-sub ${active ? 'nav-item-active' : ''}`}
                    >
                      <span className="nav-sub-dot" />
                      <span className="nav-sub-label">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user" ref={menuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="sidebar-user-trigger"
            onClick={() => setUserMenuOpen(v => !v)}
            aria-haspopup="true"
            aria-expanded={userMenuOpen}
          >
            <span className="persona-avatar">{(user?.full_name || user?.first_name || 'U')[0]}</span>
            <span className="sidebar-user-meta">
              <span className="sidebar-user-name">{user?.full_name || user?.first_name || 'User'}</span>
              <span className="sidebar-user-desig">{role?.name || user?.designation || ''}</span>
            </span>
          </button>
          <button className="icon-btn sidebar-theme-btn" onClick={toggleTheme} aria-label="Toggle theme">
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* User dropdown */}
          {userMenuOpen && (
            <div className="persona-menu" style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: '0.5rem' }}>
              <button className="persona-option" onClick={() => { setShowPwdModal(true); setUserMenuOpen(false); }}>
                <KeyRound size={15} />
                <span className="persona-option-meta">
                  <span className="persona-option-name">Change Password</span>
                </span>
              </button>
              <button className="persona-option" onClick={logout}>
                <LogOut size={15} />
                <span className="persona-option-meta">
                  <span className="persona-option-name">Logout</span>
                </span>
              </button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 0.25rem 0.25rem' }}>
          <span className="foot-badge">CONCEPT</span>
          <span className="foot-text">myHR v2</span>
        </div>
      </div>

      {showPwdModal && <PasswordChangeModal onClose={() => setShowPwdModal(false)} />}
    </div>
  );
}
