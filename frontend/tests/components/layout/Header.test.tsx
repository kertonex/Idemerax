import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { logout } from '../../../src/features/authentication/api/authentication';
import Header from '../../../src/components/layout/Header';
import {
  AuthContext,
  type AuthContextValue,
} from '../../../src/features/authentication/context/AuthContext';

vi.mock('../../../src/features/authentication/api/authentication', () => ({
  logout: vi.fn(),
}));

describe('Header', () => {
  it('renders the sign out button', () => {
    const authState: AuthContextValue = {
      accessToken: 'test-token',
      isLoading: false,
      isAuthenticated: true,
      setAccessToken: vi.fn(),
      clearAccessToken: vi.fn(),
    };

    render(
      <AuthContext.Provider value={authState}>
        <Header />
      </AuthContext.Provider>,
    );

    expect(
      screen.getByRole('button', { name: 'Sign out' }),
    ).toBeInTheDocument();
  });

  it('logs out and clears the access token when signing out', async () => {
    const clearAccessToken = vi.fn();

    vi.mocked(logout).mockResolvedValue(undefined);

    const authState: AuthContextValue = {
      accessToken: 'test-access-token',
      isAuthenticated: true,
      isLoading: false,
      setAccessToken: vi.fn(),
      clearAccessToken,
    };

    render(
      <AuthContext.Provider value={authState}>
        <Header />
      </AuthContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(logout).toHaveBeenCalledOnce();
      expect(clearAccessToken).toHaveBeenCalledOnce();
    });
  });
});
