import React from 'react';
import { useAuth } from '../context/AuthContext';
import { MoreHorizontal } from 'lucide-react';
import { NAV_ITEMS } from '../config/navItems';

// Phone bottom tab bar: keeps the top-priority sections one tap away so users
// are not constantly reopening the slide-in drawer. Overflow items route back to
// the drawer via `onOpenNav`. Rendered only on small screens (CSS media query).
const PRIMARY_KEYS = ['dashboard', 'attendance', 'payroll', 'leaves'];

export default function MobileNav({ activeTab, setActiveTab, onOpenNav }) {
  const { hasPerm } = useAuth();

  const allowed = NAV_ITEMS.filter((item) => hasPerm(item.perm));
  if (allowed.length === 0) return null;

  const primary = allowed.filter((item) => PRIMARY_KEYS.includes(item.key));
  const overflow = allowed.filter((item) => !PRIMARY_KEYS.includes(item.key));
  const slots = primary.slice(0, 4);

  return (
    <nav className="mobile-bottom-nav" aria-label="Primary">
      {slots.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`mbn-item ${activeTab === item.key ? 'mbn-item-active' : ''}`}
          onClick={() => setActiveTab(item.key)}
        >
          <item.icon size={20} strokeWidth={1.9} />
          <span className="mbn-label">{item.label}</span>
        </button>
      ))}

      {overflow.length > 0 && (
        <button
          type="button"
          className="mbn-item mbn-item-more"
          onClick={onOpenNav}
          aria-label="More sections"
        >
          <MoreHorizontal size={20} strokeWidth={1.9} />
          <span className="mbn-label">More</span>
        </button>
      )}
    </nav>
  );
}
