import { useEffect, useMemo, useState } from 'react';

import { getCurrentUser } from '../api/authentication';
import { AuthContext } from './AuthContext';

interface AuthProviderProps {
  children: React.ReactNode;
}

const ACCESS_TOKEN_STORAGE_KEY = 'idemerax_access_token';

/** Provide authentication state to the component tree. */
export function AuthProvider({ children }: AuthProviderProps) {
  const [accessToken, setAccessTokenState] = useState<string | null>(() =>
    sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY),
  );
  const [isLoading, setIsLoading] = useState(
    () => sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) !== null,
  );

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    getCurrentUser(accessToken)
      .then(() => {
        setIsLoading(false);
      })
      .catch(() => {
        sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
        setAccessTokenState(null);
        setIsLoading(false);
      });
  }, [accessToken]);

  function setAccessToken(accessToken: string) {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);
    setAccessTokenState(accessToken);
    setIsLoading(false);
  }

  function clearAccessToken() {
    sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    setAccessTokenState(null);
    setIsLoading(false);
  }

  const value = useMemo(
    () => ({
      accessToken,
      isAuthenticated: accessToken !== null,
      isLoading,
      setAccessToken,
      clearAccessToken,
    }),
    [accessToken, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
