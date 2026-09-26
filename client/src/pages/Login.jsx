import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, Loader2, Zap, Sparkles } from 'lucide-react';

const DEMO_PASSWORD = 'Welcome@123';
// Click-to-fill demo login so visitors can explore the app with one click.
const DEMO_ACCOUNTS = [
  { label: 'Administrator', scope: 'All data', email: 'admin@dubeynursinghome.in' },
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fillDemo = (acct) => {
    setEmail(acct.email);
    setPassword(DEMO_PASSWORD);
    setError('');
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-logo">
            <Zap size={22} strokeWidth={2.2} />
          </div>
          <div>
            <span className="brand-name">myHR</span>
            <span className="brand-sub">by Swaniki</span>
          </div>
        </div>

        <h1 className="login-title">Sign In</h1>
        <p className="login-desc">Use your company email to access your workspace.</p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-field">
            <Mail size={16} className="login-field-icon" />
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label className="login-field">
            <Lock size={16} className="login-field-icon" />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </label>

          <button type="submit" className="btn btn-primary login-btn" disabled={submitting}>
            {submitting ? <Loader2 size={18} className="spin" /> : 'Sign In'}
          </button>
        </form>

        <div className="login-demo">
          <div className="login-demo-head">
            <Sparkles size={13} />
            <span>Try a demo account</span>
          </div>
          <div className="login-demo-grid">
            {DEMO_ACCOUNTS.map(a => (
              <button
                key={a.email}
                type="button"
                className="login-demo-chip"
                onClick={() => fillDemo(a)}
                title={`Use ${a.email}`}
              >
                <span className="demo-chip-label">{a.label}</span>
                <span className="demo-chip-scope">{a.scope}</span>
              </button>
            ))}
          </div>
          <p className="login-demo-note">
            Click to fill · password <strong>{DEMO_PASSWORD}</strong> for all demo logins.
          </p>
        </div>

        <p className="login-hint">
          Contact your HR administrator if you need account access.
        </p>
      </div>
    </div>
  );
}
