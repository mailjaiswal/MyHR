import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import useEscapeClose from '../hooks/useEscapeClose';
import { Loader2, KeyRound, X } from 'lucide-react';

export default function PasswordChangeModal({ forced = false, onClose }) {
  const { authFetch, setMustChangePassword, logout } = useAuth();
  // Escape closes the modal only when a change is not mandatory.
  useEscapeClose(!forced && !!onClose, onClose);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Must contain uppercase, lowercase, and a number');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess('Password changed successfully!');
        setMustChangePassword(false);
        setTimeout(() => {
          if (forced && onClose) onClose();
        }, 1500);
      } else {
        setError(data.error || 'Failed to change password');
      }
    } catch (err) {
      setError('Network error');
    }
    setSubmitting(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '420px' }}>
        <div className="modal-head">
          <span className="section-title"><KeyRound size={16} /> Change Password</span>
          {!forced && onClose && (
            <button className="icon-btn" onClick={onClose}><X size={18} /></button>
          )}
        </div>

        {forced && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--brand-rose)', margin: '0.5rem 0 1rem', fontWeight: 500 }}>
            You must change your password before continuing.
          </p>
        )}

        {error && <div className="login-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
        {success && <div style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>{success}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-field">
            <input
              type="password"
              placeholder="Current password"
              value={oldPassword}
              onChange={e => setOldPassword(e.target.value)}
              required
            />
          </label>
          <label className="login-field">
            <input
              type="password"
              placeholder="New password (min 8 chars)"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
            />
          </label>
          <label className="login-field">
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
            />
          </label>

          <button type="submit" className="btn btn-primary login-btn" disabled={submitting}>
            {submitting ? <Loader2 size={18} className="spin" /> : 'Change Password'}
          </button>
        </form>

        {forced && (
          <button className="btn btn-ghost" style={{ marginTop: '0.75rem', width: '100%' }} onClick={logout}>
            Log out instead
          </button>
        )}
      </div>
    </div>
  );
}
