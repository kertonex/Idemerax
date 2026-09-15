import { useMemo, useState } from 'react';

import { AuthContext } from './AuthContext';

interface AuthProviderProps {
  children: React.ReactNode;
}

/** Provide authentication state to the component tree. */
export function AuthProvider({ children }: AuthProviderProps) {
  const [accessToken, setAccessTokenState] = useState<string | null>(null);

  const value = useMemo(
    () => ({
      accessToken,
      isAuthenticated: accessToken !== null,
      setAccessToken: setAccessTokenState,
      clearAccessToken: () => setAccessTokenState(null),
    }),
    [accessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
