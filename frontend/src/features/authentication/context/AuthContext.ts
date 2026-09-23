import { createContext } from 'react';

export interface AuthContextValue {
  /** Current access token, or null when unauthenticated. */
  accessToken: string | null;

  /** Whether the user is currently authenticated. */
  isAuthenticated: boolean;

  /** Whether authentication state is being restored. */
  isLoading: boolean;

  /** Set the current access token after successful authentication. */
  setAccessToken: (accessToken: string) => void;

  /** Clear the current access token and authentication state. */
  clearAccessToken: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);
