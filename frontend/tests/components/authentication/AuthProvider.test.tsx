import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const AUTH_STORAGE_KEY = 'idemerax_auth';

function AuthState() {
  const {
    accessToken,
    isAuthenticated,
    isLoading,
    setAccessToken,
    clearAccessToken,
  } = useAuth();

  return (
    <>
      <span data-testid="access-token">{accessToken ?? 'null'}</span>
      <span data-testid="is-authenticated">{String(isAuthenticated)}</span>
      <span data-testid="is-loading">{String(isLoading)}</span>

      <button onClick={() => setAccessToken('new-access-token')}>
        Set token
      </button>

      <button onClick={clearAccessToken}>Clear token</button>
    </>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('throws when useAuth is used outside an AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used within an AuthProvider',
    );
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

    expect(screen.getByTestId('is-loading')).toHaveTextContent('true');

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

  it('sets and persists an access token', async () => {
    vi.mocked(refreshAccessToken).mockRejectedValue(
      new Error('No refresh session'),
    );

    const user = userEvent.setup();

    render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    });

    await user.click(screen.getByRole('button', { name: 'Set token' }));

    expect(screen.getByTestId('access-token')).toHaveTextContent(
      'new-access-token',
    );
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    expect(sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe(
      'new-access-token',
    );
  });

  it('clears and removes the access token', async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, 'stored-access-token');

    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      role: 'USER',
      is_active: true,
    });

    const user = userEvent.setup();

    render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    });

    await user.click(screen.getByRole('button', { name: 'Clear token' }));

    expect(screen.getByTestId('access-token')).toHaveTextContent('null');
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    expect(sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('clears authentication when a logout storage event is received', async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, 'stored-access-token');

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

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    });

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: AUTH_STORAGE_KEY,
          newValue: 'logout',
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('access-token')).toHaveTextContent('null');
    });

    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    expect(sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('refreshes authentication when a login storage event is received', async () => {
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

    vi.clearAllMocks();

    vi.mocked(refreshAccessToken).mockResolvedValue({
      access_token: 'refreshed-access-token',
      token_type: 'bearer',
    });

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: AUTH_STORAGE_KEY,
          newValue: 'login',
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('access-token')).toHaveTextContent(
        'refreshed-access-token',
      );
    });

    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe(
      'refreshed-access-token',
    );
  });

  it('clears authentication when a login storage event refresh fails', async () => {
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

    vi.clearAllMocks();

    vi.mocked(refreshAccessToken).mockRejectedValue(
      new Error('Invalid refresh session'),
    );

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: AUTH_STORAGE_KEY,
          newValue: 'login',
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('access-token')).toHaveTextContent('null');
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
    expect(sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBeNull();
    expect(refreshAccessToken).toHaveBeenCalledOnce();
  });

  it('ignores storage events for unrelated keys', async () => {
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

    vi.clearAllMocks();

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'unrelated-key',
          newValue: 'logout',
        }),
      );
    });

    expect(screen.getByTestId('access-token')).toHaveTextContent('null');
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });
});
