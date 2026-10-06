import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createTransaction,
  getIbanBankDetails,
  type Transaction,
} from '../../../../src/features/transactions/api/transactions';

describe('getIbanBankDetails', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends an authenticated IBAN bank identification request', async () => {
    const bankDetails = {
      bank_code: '12345678',
      bank_name: 'Idemerax',
      bic: 'IDEMDEFFXXX',
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(bankDetails), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    const result = await getIbanBankDetails(
      'test-access-token',
      'DE87123456781234567890',
    );

    expect(result).toEqual(bankDetails);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe(
      'http://localhost:8000/transactions/bank-details?iban=DE87123456781234567890',
    );

    expect(options).toMatchObject({
      credentials: 'include',
    });

    expect(new Headers(options?.headers).get('Authorization')).toBe(
      'Bearer test-access-token',
    );
  });
});

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
      reference: null,
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
      reference: null,
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
        reference: null,
      }),
    );
  });

  it('sends an authenticated transaction creation request with an email destination', async () => {
    const transaction: Transaction = {
      id: 2,
      created_at: '2026-10-06T10:00:00Z',
      source_account_id: 10,
      destination_account_id: 20,
      amount: '75.2500',
      reference: 'Invoice payment',
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
      destination_email: 'recipient@example.com',
      amount: '75.2500',
      reference: 'Invoice payment',
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
        destination_email: 'recipient@example.com',
        amount: '75.2500',
        reference: 'Invoice payment',
      }),
    );
  });
});
