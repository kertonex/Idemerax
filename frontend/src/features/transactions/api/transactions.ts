import { apiClient } from '../../../shared/api/client';

export type TransactionCreateRequest = {
  destination_iban: string;
  amount: string;
};

export type Transaction = {
  id: number;
  created_at: string;
  source_account_id: number;
  destination_account_id: number;
  amount: string;
  transaction_type: string;
  status: string;
};

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
