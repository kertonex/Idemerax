import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getCurrentUser } from '../../../src/features/authentication/api/authentication';
import { AuthProvider } from '../../../src/features/authentication/context/AuthProvider';
import { useAuth } from '../../../src/features/authentication/context/useAuth';

vi.mock('../../../src/features/authentication/api/authentication', () => ({
  getCurrentUser: vi.fn(),
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

  it('starts unauthenticated when no access token is stored', () => {
    render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>,
    );

    expect(screen.getByTestId('access-token')).toHaveTextContent('null');
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    expect(getCurrentUser).not.toHaveBeenCalled();
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
    expect(sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe(accessToken);
  });

  it('clears an invalid stored access token', async () => {
    const accessToken = 'invalid-access-token';

    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);

    vi.mocked(getCurrentUser).mockRejectedValue(new Error('Unauthorized'));

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
  });
});
