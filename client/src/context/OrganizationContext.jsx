import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const OrganizationContext = createContext({ org: null, refreshOrg: () => {} });

export function OrganizationProvider({ children }) {
  const [org, setOrg] = useState(null);

  const refreshOrg = useCallback(() => {
    fetch('/api/v1/organization/info')
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