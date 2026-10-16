import { apiClient } from '../../../shared/api/client';

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

export type Transaction = {
  id: number;
  created_at: string;
  source_account_id: number;
  destination_account_id: number;
  amount: string;
  reference: string | null;
  transaction_type: string;
  status: string;
  transfer_method?: 'iban' | 'email' | null;
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
): Promise<Transaction> {
  return apiClient<Transaction>('/transactions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: transactionData,
  });
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
