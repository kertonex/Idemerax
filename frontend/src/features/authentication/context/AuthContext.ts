import { createContext } from 'react';

import type { AuthenticatedUser } from '../api/authentication';

export interface AuthContextValue {
  accessToken: string | null;
  currentUser: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAccessToken: (accessToken: string) => void;
  setCurrentUser: (user: AuthenticatedUser) => void;
  clearAccessToken: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);
