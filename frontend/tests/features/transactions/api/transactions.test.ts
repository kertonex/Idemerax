import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createTransaction,
  getIbanBankDetails,
  getTransactionHistory,
  type Transaction,
  type TransactionHistoryResponse,
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
      transfer_method: 'email',
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

describe('getTransactionHistory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends an authenticated request with pagination parameters', async () => {
    const historyResponse: TransactionHistoryResponse = {
      items: [
        {
          id: 11,
          created_at: '2026-10-01T12:30:00Z',
          source_account_id: 10,
          destination_account_id: 20,
          amount: '125.50',
          reference: 'Invoice 2026-001',
          transaction_type: 'TRANSFER',
          status: 'COMPLETED',
          transfer_method: 'iban',
          direction: 'outgoing',
          counterparty_name: 'Test Recipient',
          counterparty_email: 'recipient@example.com',
          counterparty_iban: 'DE89370400440532013000',
        },
      ],
      total: 21,
      limit: 10,
      offset: 10,
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(historyResponse), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    const result = await getTransactionHistory('test-access-token', 10, 10);

    expect(result).toEqual(historyResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe('http://localhost:8000/transactions?limit=10&offset=10');

    expect(options).toMatchObject({
      credentials: 'include',
    });

    expect(new Headers(options?.headers).get('Authorization')).toBe(
      'Bearer test-access-token',
    );
  });

  it('uses the default limit and offset when pagination parameters are omitted', async () => {
    const historyResponse: TransactionHistoryResponse = {
      items: [],
      total: 0,
      limit: 10,
      offset: 0,
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(historyResponse), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    const result = await getTransactionHistory('test-access-token');

    expect(result).toEqual(historyResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe('http://localhost:8000/transactions?limit=10&offset=0');

    expect(options).toMatchObject({
      credentials: 'include',
    });

    expect(new Headers(options?.headers).get('Authorization')).toBe(
      'Bearer test-access-token',
    );
  });

  it('uses custom limit and offset values', async () => {
    const historyResponse: TransactionHistoryResponse = {
      items: [],
      total: 50,
      limit: 5,
      offset: 15,
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(historyResponse), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    const result = await getTransactionHistory('another-access-token', 5, 15);

    expect(result).toEqual(historyResponse);

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe('http://localhost:8000/transactions?limit=5&offset=15');

    expect(new Headers(options?.headers).get('Authorization')).toBe(
      'Bearer another-access-token',
    );
  });

  it('encodes pagination values as URL query parameters', async () => {
    const historyResponse: TransactionHistoryResponse = {
      items: [],
      total: 0,
      limit: 25,
      offset: 50,
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(historyResponse), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    await getTransactionHistory('test-access-token', 25, 50);

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/transactions?limit=25&offset=50',
    );
  });

  it('propagates API errors when history cannot be loaded', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Unauthorized' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    await expect(
      getTransactionHistory('expired-access-token'),
    ).rejects.toThrow();
  });
});
