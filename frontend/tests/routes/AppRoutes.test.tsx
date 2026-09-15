import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  AuthContext,
  type AuthContextValue,
} from '../../src/features/authentication/context/AuthContext';
import AppRoutes from '../../src/routes/AppRoutes';

vi.mock('../../src/shared/api/health', () => ({
  getHealth: vi.fn().mockResolvedValue({ status: 'ok' }),
}));

/** Render application routes with the provided authentication state. */
function renderRoutes(initialPath: string, authState: AuthContextValue) {
  return render(
    <AuthContext.Provider value={authState}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const unauthenticatedState: AuthContextValue = {
  accessToken: null,
  isAuthenticated: false,
  setAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
};

const authenticatedState: AuthContextValue = {
  accessToken: 'test-access-token',
  isAuthenticated: true,
  setAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
};

describe('AppRoutes authentication protection', () => {
  it('redirects unauthenticated users from protected routes to login', () => {
    renderRoutes('/accounts', unauthenticatedState);

    expect(
      screen.getByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
  });

  it('allows authenticated users to access protected routes', () => {
    renderRoutes('/accounts', authenticatedState);

    expect(
      screen.getByRole('heading', { name: 'Accounts' }),
    ).toBeInTheDocument();
  });

  it('allows unauthenticated users to access the login route', () => {
    renderRoutes('/login', unauthenticatedState);

    expect(
      screen.getByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
  });

  it('redirects authenticated users from login to dashboard', () => {
    renderRoutes('/login', authenticatedState);

    expect(
      screen.getByRole('heading', { name: 'Dashboard' }),
    ).toBeInTheDocument();
  });
});
