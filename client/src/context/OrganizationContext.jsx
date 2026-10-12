import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const OrganizationContext = createContext({ org: null, refreshOrg: () => {} });

export function OrganizationProvider({ children }) {
  const [org, setOrg] = useState(null);

  // Branding/org card is read constantly but changes rarely; cache it in the
  // shared GET cache. refreshOrg (after admin saves) forces a fresh pull and
  // the request itself is a cache-bust so the server never returns stale here.
  const refreshOrg = useCallback(() => {
    fetch('/api/v1/organization/info?_=' + Date.now(), { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.success) setOrg({ ...d.organization, ...d.branding }); })
      .catch(() => {});
  }, []);

  useEffect(() => { refreshOrg(); }, [refreshOrg]);

  return (
    <OrganizationContext.Provider value={{ org, refreshOrg }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrganizationContext);
}