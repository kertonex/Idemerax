import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Sidebar from '../../../src/components/layout/Sidebar';
import { logout } from '../../../src/features/authentication/api/authentication';
import {
  AuthContext,
  type AuthContextValue,
} from '../../../src/features/authentication/context/AuthContext';

vi.mock('../../../src/features/authentication/api/authentication', () => ({
  logout: vi.fn(),
}));

describe('Sidebar', () => {
  const clearAccessToken = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(logout).mockResolvedValue(undefined);
  });

  function renderSidebar() {
    const authState: AuthContextValue = {
      accessToken: 'test-token',
      currentUser: {
        id: 1,
        email: 'ada@example.com',
        first_name: 'Ada',
        last_name: 'Lovelace',
        profile_complete: true,
        role: 'USER',
        is_active: true,
      },
      isLoading: false,
      isAuthenticated: true,
      setAccessToken: vi.fn(),
      setCurrentUser: vi.fn(),
      clearAccessToken,
    };

    return render(
      <AuthContext.Provider value={authState}>
        <MemoryRouter>
          <Sidebar />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
  }

  it('renders responsive navigation and the authenticated user identity', () => {
    renderSidebar();

    expect(
      screen.getAllByRole('navigation', { name: 'Main navigation' }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Sign out' })).toHaveLength(3);
  });

  it('logs out and clears the access token when signing out', async () => {
    renderSidebar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Sign out' })[0]);

    await waitFor(() => {
      expect(logout).toHaveBeenCalledOnce();
      expect(clearAccessToken).toHaveBeenCalledOnce();
    });
  });
});
