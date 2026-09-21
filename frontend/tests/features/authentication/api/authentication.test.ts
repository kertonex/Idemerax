import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getCurrentUser,
  login,
  logout,
  refreshAccessToken,
  register,
} from '../../../../src/features/authentication/api/authentication';

describe('authentication api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });

  it('sends login credentials to the authentication endpoint', async () => {
    const credentials = {
      email: 'test@example.com',
      password: 'SecurePassword123!',
    };

    await login(credentials);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    );
  });

  it('sends registration credentials to the authentication endpoint', async () => {
    const credentials = {
      email: 'test@example.com',
      password: 'SecurePassword123!',
    };

    await register(credentials);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    );
  });

  it('sends the access token when requesting the current user', async () => {
    const accessToken = 'test-access-token';

    await getCurrentUser(accessToken);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/auth/me',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const headers = options?.headers as Headers;

    expect(headers.get('Authorization')).toBe(`Bearer ${accessToken}`);
  });

  it('refreshes the access token using the refresh session', async () => {
    await refreshAccessToken();

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/auth/refresh',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('logs out using the authentication endpoint', async () => {
    await logout();

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/auth/logout',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });
});
