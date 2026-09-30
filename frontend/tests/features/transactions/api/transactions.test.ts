import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createTransaction,
  type Transaction,
} from '../../../../src/features/transactions/api/transactions';

describe('createTransaction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends an authenticated transaction creation request', async () => {
    const transaction: Transaction = {
      id: 1,
      created_at: '2026-09-30T10:00:00Z',
      source_account_id: 10,
      destination_account_id: 20,
      amount: '100.5000',
      transaction_type: 'TRANSFER',
      status: 'COMPLETED',
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(transaction), {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    const result = await createTransaction('test-access-token', {
      destination_iban: 'DE89370400440532013000',
      amount: '100.5000',
    });

    expect(result).toEqual(transaction);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe('http://localhost:8000/transactions');
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'include',
    });

    expect(new Headers(options?.headers).get('Authorization')).toBe(
      'Bearer test-access-token',
    );

    expect(new Headers(options?.headers).get('Content-Type')).toBe(
      'application/json',
    );

    expect(options?.body).toBe(
      JSON.stringify({
        destination_iban: 'DE89370400440532013000',
        amount: '100.5000',
      }),
    );
  });
});
