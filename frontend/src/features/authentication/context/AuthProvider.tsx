import { useEffect, useMemo, useState } from 'react';

import { getCurrentUser, refreshAccessToken } from '../api/authentication';
import { AuthContext } from './AuthContext';

interface AuthProviderProps {
  children: React.ReactNode;
}

const ACCESS_TOKEN_STORAGE_KEY = 'idemerax_access_token';
const AUTH_STORAGE_KEY = 'idemerax_auth';

export function AuthProvider({ children }: AuthProviderProps) {
  const [accessToken, setAccessTokenState] = useState<string | null>(() =>
    sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY),
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function restoreAuthentication() {
      const storedAccessToken = sessionStorage.getItem(
        ACCESS_TOKEN_STORAGE_KEY,
      );

      if (storedAccessToken) {
        try {
          await getCurrentUser(storedAccessToken);
          setAccessTokenState(storedAccessToken);
          setIsLoading(false);
          return;
        } catch {
          // Try to restore authentication through the refresh session.
        }
      }

      try {
        const response = await refreshAccessToken();

        sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, response.access_token);
        setAccessTokenState(response.access_token);
      } catch {
        sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
        setAccessTokenState(null);
      } finally {
        setIsLoading(false);
      }
    }

    void restoreAuthentication();
  }, []);

  useEffect(() => {
    async function handleStorage(event: StorageEvent) {
      if (event.key !== AUTH_STORAGE_KEY) {
        return;
      }

      if (event.newValue === 'logout') {
        sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
        setAccessTokenState(null);
        setIsLoading(false);
        return;
      }

      if (event.newValue === 'login') {
        setIsLoading(true);

        try {
          const response = await refreshAccessToken();

          sessionStorage.setItem(
            ACCESS_TOKEN_STORAGE_KEY,
            response.access_token,
          );
          setAccessTokenState(response.access_token);
        } catch {
          sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
          setAccessTokenState(null);
        } finally {
          setIsLoading(false);
        }
      }
    }

    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

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
