import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DashboardPage from '../../src/pages/DashboardPage';
import {
  AuthContext,
  type AuthContextValue,
} from '../../src/features/authentication/context/AuthContext';
import { getDashboardOverview } from '../../src/features/dashboard/api/dashboard';

vi.mock('../../src/features/dashboard/api/dashboard', () => ({
  getDashboardOverview: vi.fn(),
}));

const authState: AuthContextValue = {
  accessToken: 'test-access-token',
  currentUser: {
    id: 7,
    email: 'taylor@example.com',
    role: 'USER',
    is_active: true,
    first_name: 'Taylor',
    last_name: 'Morgan',
    profile_complete: true,
  },
  isAuthenticated: true,
  isLoading: false,
  setAccessToken: vi.fn(),
  setCurrentUser: vi.fn(),
  clearAccessToken: vi.fn(),
};

const baseOverview = {
  currency: 'EUR' as const,
  total_balance: '1250.50',
  account_count: 1,
  active_card_count: 2,
  recent_activity_count: 3,
  accounts: [],
  recent_transactions: [],
  pending_recovery: null,
  monthly_cash_flow: {
    period_start: '2026-11-01T00:00:00Z',
    period_end: '2026-12-01T00:00:00Z',
    money_in: '1250.50',
    money_out: '320.00',
    net_movement: '930.50',
    completed_transaction_count: 18,
  },
};

function renderDashboard(accessToken: string | null = authState.accessToken) {
  return render(
    <AuthContext.Provider value={{ ...authState, accessToken }}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function makeTransaction(
  overrides: Partial<{
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
  }> = {},
) {
  return {
    id: 41,
    transaction_number: 1041,
    created_at: '2026-11-10T12:30:00Z',
    amount: '125.50',
    reference: 'Invoice 2026-41',
    transaction_type: 'TRANSFER',
    status: 'COMPLETED',
    transfer_method: 'iban' as const,
    direction: 'incoming' as const,
    counterparty_name: 'Alex Johnson',
    counterparty_email: null,
    counterparty_iban: null,
    ...overrides,
  };
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the English financial overview without repeating the header greeting or showing a card preview', async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue(baseOverview);

    renderDashboard();

    expect(
      await screen.findByRole('heading', { name: 'Financial overview' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Here's an overview of your account."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Welcome back, Taylor Morgan' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Active cards')).toBeInTheDocument();
    expect(screen.queryByText('Your Card')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Manage cards/i })).toHaveAttribute(
      'href',
      '/cards',
    );
    expect(screen.queryByText(/^dashboard\./)).not.toBeInTheDocument();
    expect(getDashboardOverview).toHaveBeenCalledWith('test-access-token');
  });

  it('renders monthly cash flow from backend aggregates rather than recent transactions', async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue(baseOverview);

    renderDashboard();

    expect(await screen.findByText('Monthly overview')).toBeInTheDocument();
    expect(screen.getByText('+1,250.50 €')).toBeInTheDocument();
    expect(screen.getByText('−320.00 €')).toBeInTheDocument();
    expect(screen.getByText('+930.50 €')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.queryByText(/^dashboard\./)).not.toBeInTheDocument();
  });

  it('shows a proper empty state when the month has no completed transactions', async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue({
      ...baseOverview,
      monthly_cash_flow: {
        ...baseOverview.monthly_cash_flow,
        money_in: '0.0000',
        money_out: '0.0000',
        net_movement: '0.0000',
        completed_transaction_count: 0,
      },
    });

    renderDashboard();

    expect(
      await screen.findByText('No activity this month'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Completed transactions will appear here.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^dashboard\./)).not.toBeInTheDocument();
  });

  it('renders account rows and formats their balances', async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue({
      ...baseOverview,
      accounts: [
        {
          id: 1,
          account_number_suffix: '4821',
          masked_iban: 'DE89 •••• •••• •••• 3000',
          balance: '2500.75',
        },
      ],
    });

    renderDashboard();

    expect(await screen.findByText('Idemerax ···· 4821')).toBeInTheDocument();
    expect(screen.getByText('DE89 •••• •••• •••• 3000')).toBeInTheDocument();
    expect(screen.getByText('2,500.75 €')).toBeInTheDocument();
  });

  it('renders the account empty state and its navigation link', async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue({
      ...baseOverview,
      accounts: [],
    });

    renderDashboard();

    expect(await screen.findByText('No accounts yet')).toBeInTheDocument();
    expect(
      screen.getByText('Open an account to get started.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Open accounts/i }),
    ).toHaveAttribute('href', '/accounts');
  });

  it('renders recent transactions with IBAN details, references, statuses and incoming amounts', async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue({
      ...baseOverview,
      recent_transactions: [makeTransaction()],
    });

    renderDashboard();

    const transactionLink = await screen.findByRole('link', {
      name: /View details: Alex Johnson, \+125\.50 €/,
    });

    expect(transactionLink).toHaveAttribute(
      'href',
      '/transactions?tab=history&transactionId=41',
    );
    expect(screen.getByText('Incoming transfer')).toBeInTheDocument();
    expect(screen.getByText('Transaction #1041')).toBeInTheDocument();
    expect(screen.getByText('IBAN transfer')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Reference:')).toBeInTheDocument();
    expect(screen.getByText('Invoice 2026-41')).toBeInTheDocument();
  });

  it('renders outgoing email transfers and uses the counterparty email when no name exists', async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue({
      ...baseOverview,
      recent_transactions: [
        makeTransaction({
          id: 42,
          amount: '80.25',
          direction: 'outgoing',
          transfer_method: 'email',
          counterparty_name: ' ',
          counterparty_email: 'sam@example.com',
          reference: null,
        }),
      ],
    });

    renderDashboard();

    expect(
      await screen.findByRole('link', {
        name: /View details: sam@example\.com, −80\.25 €/,
      }),
    ).toHaveAttribute('href', '/transactions?tab=history&transactionId=42');
    expect(screen.getByText('Outgoing transfer')).toBeInTheDocument();
    expect(screen.getByText('Email transfer')).toBeInTheDocument();
    expect(screen.queryByText('Reference:')).not.toBeInTheDocument();
  });

  it('formats a counterparty IBAN and falls back when no counterparty data is available', async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue({
      ...baseOverview,
      recent_transactions: [
        makeTransaction({
          id: 43,
          counterparty_name: null,
          counterparty_email: ' ',
          counterparty_iban: 'DE89 3704 0044 0532 0130 00',
          transfer_method: null,
          status: 'SETTLED_EXTERNALLY',
          reference: '   ',
        }),
        makeTransaction({
          id: 44,
          counterparty_name: null,
          counterparty_email: null,
          counterparty_iban: null,
          amount: 'not-a-number',
          transfer_method: null,
          status: 'UNKNOWN_STATE',
          reference: null,
        }),
      ],
    });

    renderDashboard();

    expect(
      await screen.findByRole('link', {
        name: /View details: DE89 3704 0044 0532 0130 00/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Unknown recipient')).toBeInTheDocument();
    expect(screen.getAllByText('Transfer method unavailable')).toHaveLength(2);
    expect(screen.getByText('SETTLED EXTERNALLY')).toBeInTheDocument();
    expect(screen.getByText('UNKNOWN STATE')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(1);
    expect(screen.queryByText('Reference:')).not.toBeInTheDocument();
  });

  it.each([
    ['FAILED', 'Failed'],
    ['REJECTED', 'Rejected'],
    ['PROCESSING', 'Processing'],
    ['PENDING', 'Pending'],
  ])('renders the %s transaction status', async (status, label) => {
    vi.mocked(getDashboardOverview).mockResolvedValue({
      ...baseOverview,
      recent_transactions: [makeTransaction({ status })],
    });

    renderDashboard();

    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it('renders the cash-flow empty state when aggregate values are invalid', async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue({
      ...baseOverview,
      monthly_cash_flow: {
        ...baseOverview.monthly_cash_flow,
        money_in: 'invalid',
        money_out: '320.00',
        net_movement: '10.00',
        completed_transaction_count: 1,
      },
    });

    renderDashboard();

    expect(
      await screen.findByText('No activity this month'),
    ).toBeInTheDocument();
  });

  it('renders negative and zero net cash flow and handles a zero-total chart', async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue({
      ...baseOverview,
      monthly_cash_flow: {
        ...baseOverview.monthly_cash_flow,
        money_in: '0',
        money_out: '0',
        net_movement: '-15.25',
        completed_transaction_count: 1,
      },
    });

    renderDashboard();

    expect(await screen.findByText('−15.25 €')).toBeInTheDocument();

    vi.mocked(getDashboardOverview).mockResolvedValue({
      ...baseOverview,
      monthly_cash_flow: {
        ...baseOverview.monthly_cash_flow,
        money_in: '0',
        money_out: '0',
        net_movement: '0',
        completed_transaction_count: 1,
      },
    });

    renderDashboard();
    expect((await screen.findAllByText('0.00 €')).length).toBeGreaterThan(0);
  });

  it('renders an em dash for an invalid total and account balance', async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue({
      ...baseOverview,
      total_balance: 'invalid',
      accounts: [
        {
          id: 2,
          account_number_suffix: '9912',
          masked_iban: 'DE12 •••• 9912',
          balance: 'invalid',
        },
      ],
    });

    renderDashboard();

    expect(await screen.findAllByText('—')).toHaveLength(2);
  });

  it('shows the unauthenticated error when no access token is available', async () => {
    renderDashboard(null);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You are not authenticated.',
    );
    expect(getDashboardOverview).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows an API error and retries successfully', async () => {
    vi.mocked(getDashboardOverview)
      .mockRejectedValueOnce(new Error('Dashboard service unavailable'))
      .mockResolvedValueOnce(baseOverview);

    renderDashboard();

    expect(
      await screen.findByText('Dashboard service unavailable'),
    ).toBeInTheDocument();

    screen.getByRole('button', { name: 'Retry' }).click();

    expect(
      await screen.findByRole('heading', { name: 'Financial overview' }),
    ).toBeInTheDocument();
    expect(getDashboardOverview).toHaveBeenCalledTimes(2);
  });

  it('shows the generic error message when the request rejects with a non-Error value', async () => {
    vi.mocked(getDashboardOverview).mockRejectedValue('network failure');

    renderDashboard();

    expect(
      await screen.findByText(
        'Unable to load the dashboard. Please try again.',
      ),
    ).toBeInTheDocument();
  });

  it('keeps the loading skeleton visible while the request is pending', async () => {
    let resolveRequest!: (value: typeof baseOverview) => void;
    vi.mocked(getDashboardOverview).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    renderDashboard();

    expect(
      screen.getByRole('region', { name: 'Loading dashboard' }),
    ).toHaveAttribute('aria-busy', 'true');

    resolveRequest(baseOverview);

    await screen.findByRole('heading', { name: 'Financial overview' });
  });

  it('renders all dashboard navigation destinations', async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue(baseOverview);

    renderDashboard();

    await screen.findByRole('heading', { name: 'Financial overview' });

    expect(screen.getByRole('link', { name: 'View accounts' })).toHaveAttribute(
      'href',
      '/accounts',
    );
    const manageAccountLinks = screen.getAllByRole('link', {
      name: /Manage accounts/i,
    });
    expect(manageAccountLinks).toHaveLength(2);
    manageAccountLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', '/accounts');
    });
    expect(screen.getByRole('link', { name: /View all/i })).toHaveAttribute(
      'href',
      '/transactions?tab=history',
    );
    expect(screen.getByRole('link', { name: /Send money/i })).toHaveAttribute(
      'href',
      '/transactions',
    );
    expect(
      screen.getByRole('link', { name: /View transactions/i }),
    ).toHaveAttribute('href', '/transactions?tab=history');
    expect(screen.getByRole('link', { name: /Manage cards/i })).toHaveAttribute(
      'href',
      '/cards',
    );
    expect(
      screen.getByRole('link', { name: /Notification preferences/i }),
    ).toHaveAttribute('href', '/settings?tab=notifications');
  });

  it('does not render the dashboard when the initial request is cancelled during unmount', async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue(baseOverview);

    const { unmount } = renderDashboard();
    unmount();

    await waitFor(() => {
      expect(getDashboardOverview).not.toHaveBeenCalled();
    });
  });

  it('covers plural account labels and alternative currency formatting', async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue({
      ...baseOverview,
      currency: 'USD',
      account_count: 2,
      total_balance: '1250.5',
      accounts: [
        {
          id: 9,
          account_number_suffix: '8842',
          masked_iban: 'US12 •••• 8842',
          balance: '25.5',
        },
      ],
      recent_transactions: [
        makeTransaction({
          id: 90,
          amount: '12.5',
          direction: 'outgoing',
          transfer_method: null,
        }),
      ],
    } as unknown as typeof baseOverview);

    renderDashboard();

    expect(await screen.findByText(/Across 2 accounts/)).toBeInTheDocument();
    expect(screen.getByText('1,250.50 USD')).toBeInTheDocument();
    expect(screen.getByText('25.50 USD')).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: /View details: Alex Johnson, −12\.50 USD/,
      }),
    ).toBeInTheDocument();
  });

  it('ignores a successful response from an outdated request after the token changes', async () => {
    let resolveFirst!: (value: typeof baseOverview) => void;
    const firstRequest = new Promise<typeof baseOverview>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(getDashboardOverview)
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce({
        ...baseOverview,
        total_balance: '2222.00',
      });

    const view = render(
      <AuthContext.Provider
        value={{ ...authState, accessToken: 'first-token' }}
      >
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    await waitFor(() => {
      expect(getDashboardOverview).toHaveBeenCalledWith('first-token');
    });

    view.rerender(
      <AuthContext.Provider
        value={{ ...authState, accessToken: 'second-token' }}
      >
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(await screen.findByText('2,222.00 €')).toBeInTheDocument();

    resolveFirst({ ...baseOverview, total_balance: '1111.00' });

    await waitFor(() => {
      expect(screen.getByText('2,222.00 €')).toBeInTheDocument();
    });
    expect(screen.queryByText('1,111.00 €')).not.toBeInTheDocument();
  });

  it('ignores a rejection from an outdated request after the token changes', async () => {
    let rejectFirst!: (reason?: unknown) => void;
    const firstRequest = new Promise<typeof baseOverview>(
      (_resolve, reject) => {
        rejectFirst = reject;
      },
    );
    vi.mocked(getDashboardOverview)
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce(baseOverview);

    const view = render(
      <AuthContext.Provider
        value={{ ...authState, accessToken: 'first-token' }}
      >
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    await waitFor(() => {
      expect(getDashboardOverview).toHaveBeenCalledWith('first-token');
    });

    view.rerender(
      <AuthContext.Provider
        value={{ ...authState, accessToken: 'second-token' }}
      >
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Financial overview' }),
    ).toBeInTheDocument();

    rejectFirst(new Error('Stale request failure'));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Financial overview' }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('Stale request failure')).not.toBeInTheDocument();
  });

  it('uses the fallback message when the API resolves without an overview', async () => {
    vi.mocked(getDashboardOverview).mockResolvedValue(
      null as unknown as typeof baseOverview,
    );

    renderDashboard();

    expect(
      await screen.findByText(
        'Unable to load the dashboard. Please try again.',
      ),
    ).toBeInTheDocument();
  });
});
