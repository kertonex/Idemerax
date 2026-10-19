import { apiClient } from '../../../shared/api/client';

export type Account = {
  id: number;
  user_id: number;
  account_number: string;
  iban: string;
  bic: string;
  created_at: string;
  balance: string;
};

export function getMyAccount(accessToken: string): Promise<Account> {
  return apiClient<Account>('/accounts/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

/** Retrieve all financial accounts belonging to the authenticated user. */
export function getMyAccounts(accessToken: string): Promise<Account[]> {
  return apiClient<Account[]>('/accounts', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
