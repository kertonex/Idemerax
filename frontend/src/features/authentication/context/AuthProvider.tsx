import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getCurrentUser,
  logout,
  recordSessionActivity,
  refreshAccessToken,
  type AuthenticatedUser,
} from '../api/authentication';
import { registerAuthSessionCallbacks } from '../../../shared/api/client';
import { AuthContext } from './AuthContext';

interface AuthProviderProps {
  children: React.ReactNode;
}

const ACCESS_TOKEN_STORAGE_KEY = 'idemerax_access_token';
const AUTH_STORAGE_KEY = 'idemerax_auth';
const LAST_ACTIVITY_STORAGE_KEY = 'idemerax_last_activity';
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
const WARNING_BEFORE_LOGOUT_MS = 5 * 60 * 1000;
const SERVER_ACTIVITY_INTERVAL_MS = 60 * 1000;
const ACTIVITY_STORAGE_SYNC_INTERVAL_MS = 1000;

export function AuthProvider({ children }: AuthProviderProps) {
  const [accessToken, setAccessTokenState] = useState<string | null>(() =>
    sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY),
  );

  const [currentUser, setCurrentUserState] = useState<AuthenticatedUser | null>(
    null,
  );

  const [isLoading, setIsLoading] = useState(true);
  const [lastActivityAt, setLastActivityAt] = useState(() => {
    const storedTimestamp = Number(
      localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY),
    );

    return Number.isFinite(storedTimestamp) && storedTimestamp > 0
      ? storedTimestamp
      : Date.now();
  });
  const [warningDeadline, setWarningDeadline] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(
    WARNING_BEFORE_LOGOUT_MS / 1000,
  );

  const authOperationRef = useRef(0);
  const isMountedRef = useRef(false);
  const lastActivityAtRef = useRef(lastActivityAt);
  const lastServerActivityAtRef = useRef(0);
  const lastStorageSyncAtRef = useRef(0);
  const isLoggingOutRef = useRef(false);
  const warningDeadlineRef = useRef<number | null>(null);

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
          setAccessTokenState(
            sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) ??
              storedAccessToken,
          );
          setIsLoading(false);
          return;
        }

        if (!sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)) {
          setAccessTokenState(null);
          setCurrentUserState(null);
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

  const clearAccessToken = useCallback(() => {
    authOperationRef.current += 1;

    sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
    setAccessTokenState(null);
    setCurrentUserState(null);
    setIsLoading(false);
    warningDeadlineRef.current = null;
    setWarningDeadline(null);
    setLastActivityAt(0);
    lastActivityAtRef.current = 0;
    lastServerActivityAtRef.current = 0;
  }, []);

  const endSession = useCallback(() => {
    if (!accessToken || isLoggingOutRef.current) {
      return;
    }

    isLoggingOutRef.current = true;

    // Start server-side revocation while the current credentials are still
    // available to the API client. Do not wait for it before ending the local
    // session: a slow or offline backend must not delay the UI logout.
    const logoutRequest = logout();

    sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
    localStorage.setItem(AUTH_STORAGE_KEY, 'logout');
    clearAccessToken();

    // The backend inactivity deadline remains the security boundary if this
    // best-effort revocation request cannot reach the server.
    void logoutRequest
      .catch(() => undefined)
      .finally(() => {
        isLoggingOutRef.current = false;
      });
  }, [accessToken, clearAccessToken]);

  const recordUserActivity = useCallback(
    (keepSession = false) => {
      if (!accessToken || isLoading || isLoggingOutRef.current) {
        return;
      }

      const now = Date.now();
      const currentDeadline = lastActivityAtRef.current + INACTIVITY_TIMEOUT_MS;

      // Never revive a session after its absolute inactivity deadline, even if
      // the browser has delayed the timer that normally performs the logout.
      if (now >= currentDeadline) {
        endSession();
        return;
      }

      // Once the warning is visible, incidental input must not dismiss it.
      // Only the explicit "Stay signed in" action may extend the session.
      if (warningDeadlineRef.current !== null && !keepSession) {
        return;
      }

      if (
        !keepSession &&
        now - lastActivityAtRef.current < ACTIVITY_STORAGE_SYNC_INTERVAL_MS
      ) {
        return;
      }

      lastActivityAtRef.current = now;
      setLastActivityAt(now);
      warningDeadlineRef.current = null;
      setWarningDeadline(null);

      if (
        now - lastStorageSyncAtRef.current >=
        ACTIVITY_STORAGE_SYNC_INTERVAL_MS
      ) {
        localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
        lastStorageSyncAtRef.current = now;
      }

      if (
        now - lastServerActivityAtRef.current >=
        SERVER_ACTIVITY_INTERVAL_MS
      ) {
        lastServerActivityAtRef.current = now;
        void recordSessionActivity(accessToken).catch(() => {
          // Retry the heartbeat on the next genuine user interaction.
          if (lastServerActivityAtRef.current === now) {
            lastServerActivityAtRef.current = 0;
          }
        });
      }
    },
    [accessToken, isLoading, endSession],
  );

  const checkSessionDeadline = useCallback(() => {
    if (!accessToken || isLoading || isLoggingOutRef.current) {
      return;
    }

    const now = Date.now();
    const deadline = lastActivityAtRef.current + INACTIVITY_TIMEOUT_MS;
    const warningAt = deadline - WARNING_BEFORE_LOGOUT_MS;

    if (now >= deadline) {
      endSession();
      return;
    }

    if (now >= warningAt && warningDeadlineRef.current === null) {
      warningDeadlineRef.current = deadline;
      setWarningDeadline(deadline);
    }
  }, [accessToken, isLoading, endSession]);

  useEffect(() => {
    async function handleStorage(event: StorageEvent) {
      if (event.key === LAST_ACTIVITY_STORAGE_KEY && event.newValue) {
        const timestamp = Number(event.newValue);

        if (
          Number.isFinite(timestamp) &&
          timestamp > lastActivityAtRef.current
        ) {
          lastActivityAtRef.current = timestamp;
          setLastActivityAt(timestamp);
          warningDeadlineRef.current = null;
          setWarningDeadline(null);
        }

        return;
      }

      if (event.key !== AUTH_STORAGE_KEY) {
        return;
      }

      if (event.newValue === 'logout') {
        authOperationRef.current += 1;

        sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
        localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
        setAccessTokenState(null);
        setCurrentUserState(null);
        setIsLoading(false);
        warningDeadlineRef.current = null;
        setWarningDeadline(null);
        setLastActivityAt(0);
        lastActivityAtRef.current = 0;
        lastServerActivityAtRef.current = 0;

        return;
      }

      if (event.newValue === 'login') {
        const operation = ++authOperationRef.current;
        const now = Date.now();

        localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
        lastActivityAtRef.current = now;
        lastServerActivityAtRef.current = now;
        setLastActivityAt(now);
        warningDeadlineRef.current = null;
        setWarningDeadline(null);
        isLoggingOutRef.current = false;
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
      const now = Date.now();

      sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
      localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
      lastActivityAtRef.current = now;
      lastServerActivityAtRef.current = now;
      isLoggingOutRef.current = false;
      setLastActivityAt(now);
      warningDeadlineRef.current = null;
      setWarningDeadline(null);
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

  const handleAccessTokenRefreshed = useCallback((token: string) => {
    if (isMountedRef.current) {
      setAccessTokenState(token);
    }
  }, []);

  const handleSessionExpired = useCallback(() => {
    authOperationRef.current += 1;
    sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
    localStorage.setItem(AUTH_STORAGE_KEY, 'logout');

    if (isMountedRef.current) {
      setAccessTokenState(null);
      setCurrentUserState(null);
      setIsLoading(false);
      warningDeadlineRef.current = null;
      setWarningDeadline(null);
      setLastActivityAt(0);
      lastActivityAtRef.current = 0;
      lastServerActivityAtRef.current = 0;
    }
  }, []);

  useEffect(
    () =>
      registerAuthSessionCallbacks({
        onAccessTokenRefreshed: handleAccessTokenRefreshed,
        onSessionExpired: handleSessionExpired,
      }),
    [handleAccessTokenRefreshed, handleSessionExpired],
  );

  // Restore the idle clock across reloads and browser tabs. A missing timestamp
  // is treated as a new session for compatibility with sessions created before
  // inactivity tracking was introduced.
  useEffect(() => {
    if (!accessToken || isLoading) {
      return;
    }

    const storedTimestamp = Number(
      localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY),
    );
    const now = Date.now();
    const initialTimestamp =
      Number.isFinite(storedTimestamp) && storedTimestamp > 0
        ? storedTimestamp
        : now;

    if (!Number.isFinite(storedTimestamp) || storedTimestamp <= 0) {
      localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
    }

    lastActivityAtRef.current = initialTimestamp;
    if (lastServerActivityAtRef.current === 0) {
      lastServerActivityAtRef.current = initialTimestamp;
    }

    const idleFor = now - initialTimestamp;
    if (idleFor >= INACTIVITY_TIMEOUT_MS) {
      void endSession();
    }
  }, [accessToken, isLoading, endSession]);

  // Monitor meaningful user input. Pointer movement alone is deliberately
  // ignored: hovering or tiny cursor movements should not keep a financial
  // session alive indefinitely.
  useEffect(() => {
    if (!accessToken || isLoading) {
      return;
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkSessionDeadline();
      }
    };

    const handleUserActivity = () => recordUserActivity();

    window.addEventListener('pointerdown', handleUserActivity, {
      passive: true,
    });
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('touchstart', handleUserActivity, {
      passive: true,
    });
    window.addEventListener('wheel', handleUserActivity, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', checkSessionDeadline);
    window.addEventListener('pageshow', checkSessionDeadline);

    // Also check immediately after listeners are installed.
    checkSessionDeadline();

    return () => {
      window.removeEventListener('pointerdown', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      window.removeEventListener('wheel', handleUserActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', checkSessionDeadline);
      window.removeEventListener('pageshow', checkSessionDeadline);
    };
  }, [accessToken, isLoading, recordUserActivity, checkSessionDeadline]);

  // One checker owns both warning and logout transitions. Every check uses the
  // latest absolute deadline, not a stale timeout captured by an old render.
  useEffect(() => {
    if (!accessToken || isLoading || lastActivityAt <= 0) {
      return;
    }

    checkSessionDeadline();
    const interval = window.setInterval(checkSessionDeadline, 250);

    return () => window.clearInterval(interval);
  }, [accessToken, isLoading, lastActivityAt, checkSessionDeadline]);

  useEffect(() => {
    if (warningDeadline === null) {
      return;
    }

    const updateCountdown = () => {
      setRemainingSeconds(
        Math.max(0, Math.ceil((warningDeadline - Date.now()) / 1000)),
      );
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);

    return () => window.clearInterval(interval);
  }, [warningDeadline]);

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

  const remainingMinutes = Math.floor(remainingSeconds / 60);
  const remainingSecondsPart = String(remainingSeconds % 60).padStart(2, '0');

  return (
    <>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>

      {accessToken !== null && warningDeadline !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <section
            aria-labelledby="session-timeout-title"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
            role="alertdialog"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-300">
              <svg
                aria-hidden="true"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
              >
                <path
                  d="M12 8v4m0 4h.01M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3l-7.5-13.1a2 2 0 0 0-3.4 0Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2
              className="text-xl font-semibold text-white"
              id="session-timeout-title"
            >
              Your session is about to expire
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              You have been inactive. For your security, you will be signed out
              in{' '}
              <span className="font-semibold tabular-nums text-amber-300">
                {remainingMinutes}:{remainingSecondsPart}
              </span>
              .
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
                onClick={() => void endSession()}
                type="button"
              >
                Sign out
              </button>
              <button
                className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                onClick={() => recordUserActivity(true)}
                type="button"
              >
                Stay signed in
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
