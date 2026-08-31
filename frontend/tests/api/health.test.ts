import { describe, expect, it, vi } from 'vitest';
import { getHealth } from '../../src/shared/api/health';

vi.mock('../../src/shared/api/client', () => ({
  apiClient: vi.fn(),
}));

describe('getHealth', () => {
  it('calls the health endpoint', async () => {
    const { apiClient } = await import('../../src/shared/api/client');

    vi.mocked(apiClient).mockResolvedValue({ status: 'ok' });

    await expect(getHealth()).resolves.toEqual({ status: 'ok' });
    expect(apiClient).toHaveBeenCalledWith('/health');
  });
});
