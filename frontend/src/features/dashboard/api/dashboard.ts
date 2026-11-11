import { apiClient } from '../../../shared/api/client';

export type DashboardAccount = {
  id: number;
  account_number_suffix: string;
  masked_iban: string;
  balance: string;
};

export type DashboardTransaction = {
  id: number;
  transaction_number: number;
  created_at: string;
  amount: string;
  reference: string | null;
  transaction_type: string;
  status: string;
  transfer_method: 'iban' | 'email' | null;
  direction: 'incoming' | 'outgoing';
  counterparty_name: string | null;
  counterparty_email: string | null;
  counterparty_iban: string | null;
};

export type DashboardRecovery = {
  status: 'PROCESSING';
  created_at: string;
  amount: string;
  reference: string | null;
  recipient_hint: string;
};

export type DashboardMonthlyCashFlow = {
  period_start: string;
  period_end: string;
  money_in: string;
  money_out: string;
  net_movement: string;
  completed_transaction_count: number;
};

export type DashboardOverview = {
  currency: 'EUR';
  total_balance: string;
  account_count: number;
  active_card_count: number;
  recent_activity_count: number;
  accounts: DashboardAccount[];
  recent_transactions: DashboardTransaction[];
  pending_recovery: DashboardRecovery | null;
  monthly_cash_flow: DashboardMonthlyCashFlow;
};

/** Retrieve the authenticated user's aggregated dashboard overview. */
export function getDashboardOverview(
  accessToken: string,
): Promise<DashboardOverview> {
  return apiClient<DashboardOverview>('/dashboard/overview', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
