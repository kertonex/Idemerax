import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiClient } from '../../../src/shared/api/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getCurrentUser,
  logout,
  recordSessionActivity,
  refreshAccessToken,
} from '../../../src/features/authentication/api/authentication';
import { AuthProvider } from '../../../src/features/authentication/context/AuthProvider';
import { useAuth } from '../../../src/features/authentication/context/useAuth';

vi.mock('../../../src/features/authentication/api/authentication', () => ({
  getCurrentUser: vi.fn(),
  refreshAccessToken: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
  recordSessionActivity: vi.fn().mockResolvedValue(undefined),
}));

const ACCESS_TOKEN_STORAGE_KEY = 'idemerax_access_token';
const AUTH_STORAGE_KEY = 'idemerax_auth';
const LAST_ACTIVITY_STORAGE_KEY = 'idemerax_last_activity';

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
    localStorage.clear();
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
      first_name: 'Test',
      last_name: 'User',
      profile_complete: false,
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

    vi.mocked(getCurrentUser)
      .mockRejectedValueOnce(new Error('Unauthorized'))
      .mockResolvedValueOnce({
        id: 1,
        email: 'user@example.com',
        role: 'USER',
        is_active: true,
        first_name: 'Test',
        last_name: 'User',
        profile_complete: false,
      });

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

    expect(getCurrentUser).toHaveBeenCalledTimes(2);
    expect(getCurrentUser).toHaveBeenNthCalledWith(1, expiredAccessToken);
    expect(getCurrentUser).toHaveBeenNthCalledWith(2, refreshedAccessToken);
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

    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      role: 'USER',
      is_active: true,
      first_name: 'Test',
      last_name: 'User',
      profile_complete: false,
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

    await user.click(screen.getByRole('button', { name: 'Set token' }));

    expect(screen.getByTestId('access-token')).toHaveTextContent(
      'new-access-token',
    );
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    });

    expect(sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe(
      'new-access-token',
    );
  });

  it('updates the provider when an API request automatically refreshes its token', async () => {
    vi.mocked(refreshAccessToken).mockRejectedValue(
      new Error('No refresh session'),
    );
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      role: 'USER',
      is_active: true,
      first_name: 'Test',
      last_name: 'User',
      profile_complete: true,
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
    await user.click(screen.getByRole('button', { name: 'Set token' }));
    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    });

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ detail: 'Invalid credentials.' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: 'automatically-refreshed-token',
            token_type: 'bearer',
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 1 }),
      } as Response);

    await act(async () => {
      await apiClient('/accounts', {
        headers: { Authorization: 'Bearer new-access-token' },
      });
    });

    expect(screen.getByTestId('access-token')).toHaveTextContent(
      'automatically-refreshed-token',
    );
    expect(sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe(
      'automatically-refreshed-token',
    );
  });

  it('clears provider authentication when automatic renewal is rejected', async () => {
    vi.mocked(refreshAccessToken).mockRejectedValue(
      new Error('No refresh session'),
    );
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      role: 'USER',
      is_active: true,
      first_name: 'Test',
      last_name: 'User',
      profile_complete: true,
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
    await user.click(screen.getByRole('button', { name: 'Set token' }));
    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    });

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ detail: 'Invalid credentials.' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ detail: 'Invalid refresh session.' }),
      } as Response);

    await act(async () => {
      await expect(
        apiClient('/accounts', {
          headers: { Authorization: 'Bearer new-access-token' },
        }),
      ).rejects.toMatchObject({ status: 401 });
    });

    expect(screen.getByTestId('access-token')).toHaveTextContent('null');
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
    expect(sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('clears and removes the access token', async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, 'stored-access-token');

    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      role: 'USER',
      is_active: true,
      first_name: 'Test',
      last_name: 'User',
      profile_complete: false,
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
      first_name: 'Test',
      last_name: 'User',
      profile_complete: false,
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

    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      role: 'USER',
      is_active: true,
      first_name: 'Test',
      last_name: 'User',
      profile_complete: false,
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

  it('warns five minutes before logging out after fifteen minutes of inactivity', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-11-14T12:00:00.000Z');
    vi.setSystemTime(now);
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, 'active-access-token');
    localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now.getTime()));

    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      role: 'USER',
      is_active: true,
      first_name: 'Test',
      last_name: 'User',
      profile_complete: true,
    });

    render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(
      screen.getByText('Your session is about to expire'),
    ).toBeInTheDocument();
    expect(screen.getByText('5:00')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });

    expect(logout).toHaveBeenCalledOnce();
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
    expect(sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBeNull();
    vi.useRealTimers();
  });

  it('resets the inactivity deadline when the user chooses to stay signed in', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-11-14T12:00:00.000Z');
    vi.setSystemTime(now);
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, 'active-access-token');
    localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now.getTime()));

    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      role: 'USER',
      is_active: true,
      first_name: 'Test',
      last_name: 'User',
      profile_complete: true,
    });

    render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('synchronizes user activity from another browser tab', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-11-14T12:00:00.000Z');
    vi.setSystemTime(now);
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, 'active-access-token');
    localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now.getTime()));

    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      role: 'USER',
      is_active: true,
      first_name: 'Test',
      last_name: 'User',
      profile_complete: true,
    });

    render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    const activityFromOtherTab = Date.now();
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: LAST_ACTIVITY_STORAGE_KEY,
          newValue: String(activityFromOtherTab),
        }),
      );
    });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('sends a server activity heartbeat while the user is active', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-11-14T12:00:00.000Z');
    vi.setSystemTime(now);
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, 'active-access-token');
    localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now.getTime()));

    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      role: 'USER',
      is_active: true,
      first_name: 'Test',
      last_name: 'User',
      profile_complete: true,
    });

    render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 1000);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    });

    expect(recordSessionActivity).toHaveBeenCalledOnce();
    expect(recordSessionActivity).toHaveBeenCalledWith('active-access-token');
    vi.useRealTimers();
  });
});
