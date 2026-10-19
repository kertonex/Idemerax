import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getCurrentUser,
  refreshAccessToken,
  type AuthenticatedUser,
} from '../api/authentication';
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

  const [currentUser, setCurrentUserState] = useState<AuthenticatedUser | null>(
    null,
  );

  const [isLoading, setIsLoading] = useState(true);

  const authOperationRef = useRef(0);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      authOperationRef.current += 1;
    };
  }, []);

  const loadUser = useCallback(
    async (token: string, operation: number): Promise<boolean> => {
      try {
        const user = await getCurrentUser(token);

        if (!isMountedRef.current || operation !== authOperationRef.current) {
          return false;
        }

        setCurrentUserState(user);

        return true;
      } catch {
        if (isMountedRef.current && operation === authOperationRef.current) {
          setCurrentUserState(null);
        }

        return false;
      }
    },
    [],
  );

  useEffect(() => {
    async function restoreAuthentication() {
      const operation = ++authOperationRef.current;

      const storedAccessToken = sessionStorage.getItem(
        ACCESS_TOKEN_STORAGE_KEY,
      );

      if (storedAccessToken) {
        const restored = await loadUser(storedAccessToken, operation);

        if (!isMountedRef.current || operation !== authOperationRef.current) {
          return;
        }

        if (restored) {
          setAccessTokenState(storedAccessToken);
          setIsLoading(false);
          return;
        }
      }

      try {
        const response = await refreshAccessToken();

        if (!isMountedRef.current || operation !== authOperationRef.current) {
          return;
        }

        sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, response.access_token);

        const restored = await loadUser(response.access_token, operation);

        if (!isMountedRef.current || operation !== authOperationRef.current) {
          return;
        }

        if (restored) {
          setAccessTokenState(response.access_token);
        } else {
          sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
          setAccessTokenState(null);
          setCurrentUserState(null);
        }
      } catch {
        if (!isMountedRef.current || operation !== authOperationRef.current) {
          return;
        }

        sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
        setAccessTokenState(null);
        setCurrentUserState(null);
      } finally {
        if (isMountedRef.current && operation === authOperationRef.current) {
          setIsLoading(false);
        }
      }
    }

    void restoreAuthentication();
  }, [loadUser]);

  useEffect(() => {
    async function handleStorage(event: StorageEvent) {
      if (event.key !== AUTH_STORAGE_KEY) {
        return;
      }

      if (event.newValue === 'logout') {
        authOperationRef.current += 1;

        sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
        setAccessTokenState(null);
        setCurrentUserState(null);
        setIsLoading(false);

        return;
      }

      if (event.newValue === 'login') {
        const operation = ++authOperationRef.current;

        setIsLoading(true);

        try {
          const response = await refreshAccessToken();

          if (!isMountedRef.current || operation !== authOperationRef.current) {
            return;
          }

          sessionStorage.setItem(
            ACCESS_TOKEN_STORAGE_KEY,
            response.access_token,
          );

          const restored = await loadUser(response.access_token, operation);

          if (!isMountedRef.current || operation !== authOperationRef.current) {
            return;
          }

          if (restored) {
            setAccessTokenState(response.access_token);
          } else {
            sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
            setAccessTokenState(null);
            setCurrentUserState(null);
          }
        } catch {
          if (!isMountedRef.current || operation !== authOperationRef.current) {
            return;
          }

          sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
          setAccessTokenState(null);
          setCurrentUserState(null);
        } finally {
          if (isMountedRef.current && operation === authOperationRef.current) {
            setIsLoading(false);
          }
        }
      }
    }

    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, [loadUser]);

  const setAccessToken = useCallback(
    (token: string) => {
      const operation = ++authOperationRef.current;

      sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
      setAccessTokenState(token);
      setCurrentUserState(null);
      setIsLoading(true);

      void loadUser(token, operation).finally(() => {
        if (isMountedRef.current && operation === authOperationRef.current) {
          setIsLoading(false);
        }
      });
    },
    [loadUser],
  );

  const setCurrentUser = useCallback((user: AuthenticatedUser) => {
    setCurrentUserState(user);
  }, []);

  const clearAccessToken = useCallback(() => {
    authOperationRef.current += 1;

    sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    setAccessTokenState(null);
    setCurrentUserState(null);
    setIsLoading(false);
  }, []);

  const value = useMemo(
    () => ({
      accessToken,
      currentUser,
      isAuthenticated: accessToken !== null,
      isLoading,
      setAccessToken,
      setCurrentUser,
      clearAccessToken,
    }),
    [
      accessToken,
      currentUser,
      isLoading,
      setAccessToken,
      setCurrentUser,
      clearAccessToken,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
