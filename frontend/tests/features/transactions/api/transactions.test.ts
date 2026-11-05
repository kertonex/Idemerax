import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createTransaction,
  getIbanBankDetails,
  getPendingTransactionRecovery,
  getTransactionHistory,
  getTransactionIdempotencyStatus,
  resumeTransaction,
  type PendingTransactionRecoveryResponse,
  type ResumeTransactionResponse,
  type Transaction,
  type TransactionHistoryResponse,
  type TransactionIdempotencyStatus,
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

  it('sends an authenticated transaction creation request with an idempotency key', async () => {
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

    const result = await createTransaction(
      'test-access-token',
      {
        destination_iban: 'DE89370400440532013000',
        amount: '100.5000',
        reference: null,
      },
      'test-idempotency-key',
    );

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

    expect(new Headers(options?.headers).get('Idempotency-Key')).toBe(
      'test-idempotency-key',
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

  it('sends an authenticated transaction creation request with an email destination and an idempotency key', async () => {
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

    const result = await createTransaction(
      'test-access-token',
      {
        destination_email: 'recipient@example.com',
        amount: '75.2500',
        reference: 'Invoice payment',
      },
      'test-email-idempotency-key',
    );

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

    expect(new Headers(options?.headers).get('Idempotency-Key')).toBe(
      'test-email-idempotency-key',
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

  it('forwards the AbortSignal without changing the idempotency key', async () => {
    const transaction: Transaction = {
      id: 3,
      created_at: '2026-11-05T10:00:00Z',
      source_account_id: 10,
      destination_account_id: 20,
      amount: '25.0000',
      reference: null,
      transaction_type: 'TRANSFER',
      status: 'COMPLETED',
    };

    const controller = new AbortController();

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(transaction), {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    await createTransaction(
      'test-access-token',
      {
        destination_iban: 'DE89370400440532013000',
        amount: '25.0000',
        reference: null,
      },
      'original-idempotency-key',
      controller.signal,
    );

    const [, options] = fetchMock.mock.calls[0];

    expect(options?.signal).toBeDefined();
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.signal?.aborted).toBe(false);
    expect(new Headers(options?.headers).get('Idempotency-Key')).toBe(
      'original-idempotency-key',
    );
  });
});

describe('getTransactionIdempotencyStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends an authenticated status request with the idempotency key', async () => {
    const transaction: Transaction = {
      id: 42,
      created_at: '2026-10-20T10:00:00Z',
      source_account_id: 10,
      destination_account_id: 20,
      amount: '100.0000',
      reference: 'Idempotency recovery test',
      transaction_type: 'TRANSFER',
      status: 'COMPLETED',
      transfer_method: 'iban',
    };

    const response: TransactionIdempotencyStatus = {
      status: 'COMPLETED',
      failure_code: null,
      transaction,
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    const result = await getTransactionIdempotencyStatus(
      'test-access-token',
      'test-idempotency-key',
    );

    expect(result).toEqual(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe(
      'http://localhost:8000/transactions/idempotency/test-idempotency-key',
    );

    expect(options).toMatchObject({
      credentials: 'include',
    });

    expect(new Headers(options?.headers).get('Authorization')).toBe(
      'Bearer test-access-token',
    );

    expect(new Headers(options?.headers).has('Idempotency-Key')).toBe(false);
  });

  it('URL-encodes special characters in the idempotency key', async () => {
    const response: TransactionIdempotencyStatus = {
      status: 'NOT_FOUND',
      failure_code: null,
      transaction: null,
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    const result = await getTransactionIdempotencyStatus(
      'test-access-token',
      'key/with spaces?',
    );

    expect(result).toEqual(response);

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/transactions/idempotency/key%2Fwith%20spaces%3F',
    );
  });

  it('returns the completed transaction when the status is COMPLETED', async () => {
    const transaction: Transaction = {
      id: 99,
      created_at: '2026-10-21T08:30:00Z',
      source_account_id: 10,
      destination_account_id: 30,
      amount: '50.2500',
      reference: 'Recovered transaction',
      transaction_type: 'TRANSFER',
      status: 'COMPLETED',
      transfer_method: 'email',
    };

    const response: TransactionIdempotencyStatus = {
      status: 'COMPLETED',
      failure_code: null,
      transaction,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    await expect(
      getTransactionIdempotencyStatus(
        'test-access-token',
        'completed-idempotency-key',
      ),
    ).resolves.toEqual({
      status: 'COMPLETED',
      failure_code: null,
      transaction,
    });
  });

  it('returns NOT_FOUND with a null transaction when no transaction exists', async () => {
    const response: TransactionIdempotencyStatus = {
      status: 'NOT_FOUND',
      failure_code: null,
      transaction: null,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    await expect(
      getTransactionIdempotencyStatus(
        'test-access-token',
        'missing-idempotency-key',
      ),
    ).resolves.toEqual({
      status: 'NOT_FOUND',
      failure_code: null,
      transaction: null,
    });
  });

  it('propagates API errors when the idempotency status cannot be loaded', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Unauthorized' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    await expect(
      getTransactionIdempotencyStatus(
        'expired-access-token',
        'test-idempotency-key',
      ),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
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

describe('getPendingTransactionRecovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends an authenticated request and returns the pending operation', async () => {
    const response: PendingTransactionRecoveryResponse = {
      operation: {
        idempotency_key: 'pending-transfer-key',
        status: 'PROCESSING',
        created_at: '2026-11-05T10:00:00Z',
        recipient_method: 'iban',
        recipient_iban: 'DE89370400440532013000',
        recipient_email: null,
        amount: '125.5000',
        reference: 'Recovery test',
        failure_code: null,
      },
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    const result = await getPendingTransactionRecovery('test-access-token');

    expect(result).toEqual(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe(
      'http://localhost:8000/transactions/idempotency/pending',
    );
    expect(options).toMatchObject({ credentials: 'include' });
    expect(new Headers(options?.headers).get('Authorization')).toBe(
      'Bearer test-access-token',
    );
    expect(options?.method).toBeUndefined();
    expect(new Headers(options?.headers).has('Idempotency-Key')).toBe(false);
  });

  it('returns a null operation when no pending transfer exists', async () => {
    const response: PendingTransactionRecoveryResponse = { operation: null };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    await expect(
      getPendingTransactionRecovery('test-access-token'),
    ).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('propagates API errors when pending recovery cannot be loaded', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Unauthorized' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    await expect(
      getPendingTransactionRecovery('expired-access-token'),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('resumeTransaction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends an authenticated POST request and returns the recovery result', async () => {
    const response: ResumeTransactionResponse = {
      status: 'PROCESSING',
      failure_code: null,
      transaction: null,
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    const result = await resumeTransaction(
      'test-access-token',
      'pending-transfer-key',
    );

    expect(result).toEqual(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe(
      'http://localhost:8000/transactions/idempotency/pending-transfer-key/resume',
    );
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'include',
    });
    expect(new Headers(options?.headers).get('Authorization')).toBe(
      'Bearer test-access-token',
    );
    expect(new Headers(options?.headers).has('Idempotency-Key')).toBe(false);
    expect(options?.body).toBeUndefined();
  });

  it('URL-encodes special characters in the idempotency key', async () => {
    const response: ResumeTransactionResponse = {
      status: 'COMPLETED',
      failure_code: null,
      transaction: {
        id: 42,
        created_at: '2026-11-05T10:00:00Z',
        source_account_id: 10,
        destination_account_id: 20,
        amount: '100.0000',
        reference: 'Recovered transfer',
        transaction_type: 'TRANSFER',
        status: 'COMPLETED',
      },
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    await expect(
      resumeTransaction('test-access-token', 'key/with spaces?'),
    ).resolves.toEqual(response);

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/transactions/idempotency/key%2Fwith%20spaces%3F/resume',
    );
  });

  it('returns a failed recovery result without changing its failure code', async () => {
    const response: ResumeTransactionResponse = {
      status: 'FAILED',
      failure_code: 'INSUFFICIENT_FUNDS',
      transaction: null,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    await expect(
      resumeTransaction('test-access-token', 'failed-transfer-key'),
    ).resolves.toEqual(response);
  });

  it('propagates API errors when a transfer cannot be resumed', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Unauthorized' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    await expect(
      resumeTransaction('expired-access-token', 'pending-transfer-key'),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
