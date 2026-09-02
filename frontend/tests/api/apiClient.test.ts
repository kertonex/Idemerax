import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../src/shared/api/client';

describe('apiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends requests to the configured api url', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1 }),
    });

    const result = await apiClient<{ id: number }>('/accounts');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/accounts',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );

    expect(result).toEqual({ id: 1 });
  });

  it('applies default request headers', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1 }),
    });

    await apiClient('/accounts');

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const headers = options?.headers as Headers;

    expect(headers.get('Accept')).toBe('application/json');
  });

  it('supports request methods and custom headers', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1 }),
    });

    await apiClient('/accounts', {
      method: 'POST',
      headers: {
        'X-Request-Id': 'test-request',
      },
    });

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const headers = options?.headers as Headers;

    expect(options?.method).toBe('POST');
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('X-Request-Id')).toBe('test-request');
  });

  it('serializes request bodies as json', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1 }),
    });

    const requestBody = {
      name: 'Test Account',
    };

    await apiClient('/accounts', {
      method: 'POST',
      body: requestBody,
    });

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const headers = options?.headers as Headers;

    expect(options?.body).toBe(JSON.stringify(requestBody));
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('throws backend error details when the api request fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          detail: 'Invalid request',
        }),
    });

    await expect(apiClient('/accounts')).rejects.toThrow(
      'Invalid request',
    );
  });

  it('throws a connection error when the api is unreachable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      new Error(),
    );

    await expect(apiClient('/accounts')).rejects.toThrow(
      'Unable to connect to API',
    );
  });
});
