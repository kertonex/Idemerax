import { apiClient } from '../../../shared/api/client';

export type TransactionCreateRequest = {
  destination_iban: string;
  amount: string;
  reference: string | null;
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
