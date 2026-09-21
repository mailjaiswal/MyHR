import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [dataScope, setDataScope] = useState('SELF');
  const [role, setRole] = useState(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);

  // Attempt silent refresh on mount (uses httpOnly cookie)
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setToken(data.token);
            return; // token set, next effect fetches /me
          }
        }
      } catch { /* no cookie, show login */ }
      setLoading(false);
    };
    init();
  }, []);

  // Once token is available, fetch /auth/me
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    const fetchMe = async () => {
      try {
        const res = await fetch('/api/v1/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setUser(data.user);
            setPermissions(data.permissions || []);
            setDataScope(data.role?.dataScope || 'SELF');
            setRole(data.role);
            setMustChangePassword(data.mustChangePassword);
          }
        } else if (res.status === 401) {
          // Token expired, try refresh
          const refreshRes = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
          if (refreshRes.ok) {
            const rd = await refreshRes.json();
            if (rd.token) { setToken(rd.token); return; } // re-trigger this effect
          }
          setToken(null);
          setUser(null);
        }
      } catch {
        setToken(null);
        setUser(null);
      }
      setLoading(false);
    };
    fetchMe();
  }, [token]);

  const login = useCallback(async (email, password) => {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }
    setToken(data.token);
    setMustChangePassword(data.mustChangePassword);
    setLoading(true); // will resolve when /me fetch completes
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    setToken(null);
    setUser(null);
    setPermissions([]);
    setDataScope('SELF');
    setRole(null);
    setMustChangePassword(false);
  }, []);

  const hasPerm = useCallback((key) => {
    return permissions.includes(key);
  }, [permissions]);

  // Helper: attach Authorization header to fetch calls
  const authFetch = useCallback((path, opts = {}) => {
    return fetch(path, {
      ...opts,
      credentials: 'include',
      headers: {
        ...opts.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
  }, [token]);

  return (
    <AuthContext.Provider value={{
      token, user, permissions, dataScope, role,
      mustChangePassword, setMustChangePassword,
      loading, login, logout, hasPerm, authFetch
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
