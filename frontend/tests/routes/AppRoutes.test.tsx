import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  AuthContext,
  type AuthContextValue,
} from '../../src/features/authentication/context/AuthContext';
import AppRoutes from '../../src/routes/AppRoutes';
import { ThemeProvider } from '../../src/features/settings/context/ThemeProvider';

vi.mock('../../src/shared/api/health', () => ({
  getHealth: vi.fn().mockResolvedValue({ status: 'ok' }),
}));

vi.mock('../../src/features/dashboard/api/dashboard', () => ({
  getDashboardOverview: vi.fn().mockResolvedValue({
    currency: 'EUR',
    total_balance: '1250.50',
    account_count: 1,
    active_card_count: 2,
    recent_activity_count: 3,
    accounts: [],
    recent_transactions: [],
    pending_recovery: null,
    monthly_cash_flow: {
      period_start: '2026-11-01T00:00:00Z',
      period_end: '2026-12-01T00:00:00Z',
      money_in: '1250.50',
      money_out: '320.00',
      net_movement: '930.50',
      completed_transaction_count: 18,
    },
  }),
}));

/** Render application routes with the provided authentication state. */
function renderRoutes(initialPath: string, authState: AuthContextValue) {
  return render(
    <AuthContext.Provider value={authState}>
      <ThemeProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <AppRoutes />
        </MemoryRouter>
      </ThemeProvider>
    </AuthContext.Provider>,
  );
}

const unauthenticatedState: AuthContextValue = {
  accessToken: null,
  currentUser: null,
  isAuthenticated: false,
  isLoading: false,
  setAccessToken: vi.fn(),
  setCurrentUser: vi.fn(),
  clearAccessToken: vi.fn(),
};

const authenticatedState: AuthContextValue = {
  accessToken: 'test-token',
  currentUser: {
    id: 1,
    email: 'user@example.com',
    role: 'USER',
    is_active: true,
    first_name: 'Test',
    last_name: 'User',
    profile_complete: true,
  },
  isAuthenticated: true,
  isLoading: false,
  setAccessToken: vi.fn(),
  setCurrentUser: vi.fn(),
  clearAccessToken: vi.fn(),
};

describe('AppRoutes authentication protection', () => {
  it('redirects unauthenticated users from protected routes to login', () => {
    renderRoutes('/accounts', unauthenticatedState);

    expect(
      screen.getByRole('heading', { name: 'Welcome back' }),
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
      screen.getByRole('heading', { name: 'Welcome back' }),
    ).toBeInTheDocument();
  });

  it('redirects authenticated users with incomplete profiles to profile setup', () => {
    const incompleteProfileState: AuthContextValue = {
      ...authenticatedState,
      currentUser: {
        ...authenticatedState.currentUser!,
        first_name: '',
        last_name: '',
        profile_complete: false,
      },
    };

    renderRoutes('/dashboard', incompleteProfileState);

    expect(
      screen.getByRole('heading', { name: 'settings.setupTitle' }),
    ).toBeInTheDocument();
  });

  it('redirects authenticated users from login to the English dashboard', async () => {
    renderRoutes('/login', authenticatedState);

    expect(
      await screen.findByRole('heading', { name: 'Financial overview' }),
    ).toBeInTheDocument();
  });
});
