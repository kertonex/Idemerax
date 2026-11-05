import { apiClient } from '../../../shared/api/client';

// A transfer request must not leave the UI waiting for the generic 20s API
// timeout when the connection is black-holed. Timeout means outcome unknown;
// the idempotency key is retained and the page reconciles status safely.
const TRANSFER_REQUEST_TIMEOUT_MS = 8_000;

export type TransactionCreateRequest = {
  destination_iban?: string;
  destination_email?: string;
  amount: string;
  reference?: string | null;
};

export type IbanBankDetails = {
  bank_code: string;
  bank_name: string;
  bic: string;
};

export type TransferMethod = 'iban' | 'email';

export type Transaction = {
  id: number;
  created_at: string;
  source_account_id: number;
  destination_account_id: number;
  amount: string;
  reference: string | null;
  transaction_type: string;
  status: string;
  transfer_method?: TransferMethod | null;
};

export type TransactionDirection = 'incoming' | 'outgoing';

export type TransactionHistoryItem = Transaction & {
  direction: TransactionDirection;
  counterparty_name?: string | null;
  counterparty_email?: string | null;
  counterparty_iban?: string | null;
};

export type TransactionHistoryResponse = {
  items: TransactionHistoryItem[];
  total: number;
  limit: number;
  offset: number;
};

export type TransactionIdempotencyStatus = {
  status: 'NOT_FOUND' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  failure_code: string | null;
  transaction: Transaction | null;
};

export type PendingTransactionRecovery = {
  idempotency_key: string;
  status: 'PROCESSING';
  created_at: string;
  recipient_method: TransferMethod;
  recipient_iban: string | null;
  recipient_email: string | null;
  amount: string;
  reference: string | null;
  failure_code: string | null;
};

export type PendingTransactionRecoveryResponse = {
  operation: PendingTransactionRecovery | null;
};

export type ResumeTransactionResponse = {
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  failure_code: string | null;
  transaction: Transaction | null;
};

export function getIbanBankDetails(
  accessToken: string,
  iban: string,
): Promise<IbanBankDetails> {
  return apiClient<IbanBankDetails>(
    `/transactions/bank-details?iban=${encodeURIComponent(iban)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
}

export function createTransaction(
  accessToken: string,
  transactionData: TransactionCreateRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<Transaction> {
  return apiClient<Transaction>('/transactions', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: transactionData,
    timeoutMs: TRANSFER_REQUEST_TIMEOUT_MS,
  });
}

export function getTransactionIdempotencyStatus(
  accessToken: string,
  idempotencyKey: string,
): Promise<TransactionIdempotencyStatus> {
  return apiClient<TransactionIdempotencyStatus>(
    `/transactions/idempotency/${encodeURIComponent(idempotencyKey)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
}

export function getPendingTransactionRecovery(
  accessToken: string,
): Promise<PendingTransactionRecoveryResponse> {
  return apiClient<PendingTransactionRecoveryResponse>(
    '/transactions/idempotency/pending',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
}

export function resumeTransaction(
  accessToken: string,
  idempotencyKey: string,
): Promise<ResumeTransactionResponse> {
  return apiClient<ResumeTransactionResponse>(
    `/transactions/idempotency/${encodeURIComponent(idempotencyKey)}/resume`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
}

export function getTransactionHistory(
  accessToken: string,
  limit = 10,
  offset = 0,
): Promise<TransactionHistoryResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  return apiClient<TransactionHistoryResponse>(
    `/transactions?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
}
