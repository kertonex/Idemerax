import { apiClient } from '../../../shared/api/client';

export type Account = {
  id: number;
  user_id: number;
  balance: string;
};

// The access token is passed explicitly because the shared API client
// does not attach authentication credentials automatically.
export function getMyAccount(accessToken: string): Promise<Account> {
  return apiClient<Account>('/accounts/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
