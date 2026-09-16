import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Header from '../../../src/components/layout/Header';
import {
  AuthContext,
  type AuthContextValue,
} from '../../../src/features/authentication/context/AuthContext';

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

  it('clears the access token when signing out', () => {
    const clearAccessToken = vi.fn();

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

    expect(clearAccessToken).toHaveBeenCalledOnce();
  });
});
