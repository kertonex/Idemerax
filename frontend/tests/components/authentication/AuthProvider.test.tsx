import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getCurrentUser,
  refreshAccessToken,
} from '../../../src/features/authentication/api/authentication';
import { AuthProvider } from '../../../src/features/authentication/context/AuthProvider';
import { useAuth } from '../../../src/features/authentication/context/useAuth';

vi.mock('../../../src/features/authentication/api/authentication', () => ({
  getCurrentUser: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

const ACCESS_TOKEN_STORAGE_KEY = 'idemerax_access_token';

function AuthState() {
  const { accessToken, isAuthenticated, isLoading } = useAuth();

  return (
    <>
      <span data-testid="access-token">{accessToken ?? 'null'}</span>
      <span data-testid="is-authenticated">{String(isAuthenticated)}</span>
      <span data-testid="is-loading">{String(isLoading)}</span>
    </>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('starts unauthenticated when no access token is stored', async () => {
    vi.mocked(refreshAccessToken).mockRejectedValue(
      new Error('No refresh session'),
    );

    render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('access-token')).toHaveTextContent('null');
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(refreshAccessToken).toHaveBeenCalledOnce();
  });

  it('restores authentication from a valid stored access token', async () => {
    const accessToken = 'stored-access-token';

    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);

    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      role: 'USER',
      is_active: true,
    });

    render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>,
    );

    expect(screen.getByTestId('is-loading')).toHaveTextContent('true');
    expect(screen.getByTestId('access-token')).toHaveTextContent(accessToken);
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    });

    expect(getCurrentUser).toHaveBeenCalledOnce();
    expect(getCurrentUser).toHaveBeenCalledWith(accessToken);
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe(accessToken);
  });

  it('refreshes authentication when the stored access token is invalid', async () => {
    const expiredAccessToken = 'expired-access-token';
    const refreshedAccessToken = 'refreshed-access-token';

    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, expiredAccessToken);

    vi.mocked(getCurrentUser).mockRejectedValue(new Error('Unauthorized'));

    vi.mocked(refreshAccessToken).mockResolvedValue({
      access_token: refreshedAccessToken,
      token_type: 'bearer',
    });

    render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>,
    );

    expect(screen.getByTestId('is-loading')).toHaveTextContent('true');

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('access-token')).toHaveTextContent(
      refreshedAccessToken,
    );
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');

    expect(getCurrentUser).toHaveBeenCalledOnce();
    expect(getCurrentUser).toHaveBeenCalledWith(expiredAccessToken);
    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe(
      refreshedAccessToken,
    );
  });

  it('clears authentication when the stored access token and refresh session are invalid', async () => {
    const accessToken = 'invalid-access-token';

    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);

    vi.mocked(getCurrentUser).mockRejectedValue(new Error('Unauthorized'));
    vi.mocked(refreshAccessToken).mockRejectedValue(
      new Error('Invalid refresh session'),
    );

    render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>,
    );

    expect(screen.getByTestId('is-loading')).toHaveTextContent('true');

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('access-token')).toHaveTextContent('null');
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
    expect(sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBeNull();

    expect(getCurrentUser).toHaveBeenCalledWith(accessToken);
    expect(refreshAccessToken).toHaveBeenCalledOnce();
  });

  it('keeps authentication loading while restoring a stored access token', () => {
    const accessToken = 'stored-access-token';

    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);

    vi.mocked(getCurrentUser).mockImplementation(() => new Promise(() => {}));

    render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>,
    );

    expect(screen.getByTestId('is-loading')).toHaveTextContent('true');
    expect(screen.getByTestId('access-token')).toHaveTextContent(accessToken);
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
    expect(getCurrentUser).toHaveBeenCalledWith(accessToken);
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });
});
