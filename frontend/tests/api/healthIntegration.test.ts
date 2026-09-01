import { describe, expect, it } from 'vitest';
import { getHealth } from '../../src/shared/api/health';

describe('health API integration', () => {
  it('communicates with the backend health endpoint', async () => {
    const response = await getHealth();

    expect(response).toHaveProperty('status');
    expect(typeof response.status).toBe('string');
  });
});
