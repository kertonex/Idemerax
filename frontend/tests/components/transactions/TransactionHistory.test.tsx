import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

import TransactionHistory from '../../../src/features/transactions/components/TransactionHistory';
import type { TransactionHistoryItem } from '../../../src/features/transactions/api/transactions';

const { mockGetTransactionHistory } = vi.hoisted(() => ({
  mockGetTransactionHistory: vi.fn(),
}));

vi.mock('../../../src/features/transactions/api/transactions', () => ({
  getTransactionHistory: mockGetTransactionHistory,
}));

function createTransaction(
  overrides: Partial<TransactionHistoryItem> = {},
): TransactionHistoryItem {
  return {
    id: 1,
    created_at: '2026-10-01T12:30:00Z',
    source_account_id: 10,
    destination_account_id: 20,
    amount: '125.50',
    reference: 'Invoice 2026-001',
    transaction_type: 'TRANSFER',
    status: 'COMPLETED',
    transfer_method: 'email',
    direction: 'outgoing',
    counterparty_name: 'Test Recipient',
    counterparty_email: 'recipient@example.com',
    counterparty_iban: null,
    ...overrides,
  };
}

function createHistoryResponse(
  items: TransactionHistoryItem[] = [],
  total = items.length,
  limit = 10,
  offset = 0,
) {
  return {
    items,
    total,
    limit,
    offset,
  };
}

let historyItems: TransactionHistoryItem[];
let pageResponses: Map<number, ReturnType<typeof createHistoryResponse>>;

function configureHistoryMock(
  items: TransactionHistoryItem[] = [],
  total = items.length,
) {
  historyItems = items;
  pageResponses = new Map();

  mockGetTransactionHistory.mockImplementation(
    async (_accessToken: string, limit: number, offset: number) => {
      if (limit === 100) {
        return createHistoryResponse(historyItems, total, limit, offset);
      }

      const configuredResponse = pageResponses.get(offset);

      if (configuredResponse) {
        return configuredResponse;
      }

      return createHistoryResponse(
        historyItems.slice(offset, offset + limit),
        total,
        limit,
        offset,
      );
    },
  );
}

function configurePage(
  items: TransactionHistoryItem[],
  total: number,
  offset: number,
) {
  pageResponses.set(offset, createHistoryResponse(items, total, 10, offset));
}

async function getTransactionCard(name: string): Promise<HTMLElement> {
  return screen.findByRole('button', {
    name: new RegExp(`View transaction details: ${name}`),
  });
}

describe('TransactionHistory', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    configureHistoryMock();
  });

  it('renders the heading, description and empty state', async () => {
    render(<TransactionHistory accessToken="test-access-token" />);

    expect(
      screen.getByRole('heading', { name: 'Transaction History' }),
    ).toBeInTheDocument();

    expect(
      screen.getByText('Review your incoming and outgoing transactions.'),
    ).toBeInTheDocument();

    expect(await screen.findByText('No transactions yet')).toBeInTheDocument();

    expect(
      screen.getByText(
        /Your incoming and outgoing transactions will appear here/,
      ),
    ).toBeInTheDocument();
  });

  it('loads history using the access token and page parameters', async () => {
    const transactions = [
      createTransaction({
        id: 1,
        reference: 'Invoice 2026-001',
      }),
      createTransaction({
        id: 2,
        reference: 'Customer payment',
        direction: 'incoming',
        counterparty_name: 'Test Sender',
        counterparty_email: 'sender@example.com',
        amount: '250.00',
        status: 'PROCESSING',
        source_account_id: 30,
        destination_account_id: 10,
      }),
    ];

    configureHistoryMock(transactions, 2);

    render(<TransactionHistory accessToken="test-access-token" />);

    expect(await screen.findByText('Test Recipient')).toBeInTheDocument();

    expect(screen.getByText('Test Sender')).toBeInTheDocument();

    expect(screen.getAllByText('Reference:')).toHaveLength(2);
    expect(screen.getByText('Invoice 2026-001')).toBeInTheDocument();
    expect(screen.getByText('Customer payment')).toBeInTheDocument();

    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText('PROCESSING')).toBeInTheDocument();

    expect(screen.getByText('Outgoing transfer')).toBeInTheDocument();
    expect(screen.getByText('Incoming transfer')).toBeInTheDocument();

    expect(mockGetTransactionHistory).toHaveBeenCalledWith(
      'test-access-token',
      10,
      0,
    );

    expect(mockGetTransactionHistory).toHaveBeenCalledWith(
      'test-access-token',
      100,
      0,
    );
  });

  it('uses the counterparty name instead of the email in the preview', async () => {
    configureHistoryMock([createTransaction()]);

    render(<TransactionHistory accessToken="test-access-token" />);

    expect(await screen.findByText('Test Recipient')).toBeInTheDocument();

    expect(screen.queryByText('recipient@example.com')).not.toBeInTheDocument();
  });

  it('uses the email as the counterparty when the name is unavailable', async () => {
    configureHistoryMock([
      createTransaction({
        counterparty_name: null,
        counterparty_email: 'recipient@example.com',
      }),
    ]);

    render(<TransactionHistory accessToken="test-access-token" />);

    expect(
      await screen.findByText('recipient@example.com'),
    ).toBeInTheDocument();
  });

  it('uses the IBAN when the name and email are unavailable', async () => {
    configureHistoryMock([
      createTransaction({
        counterparty_name: null,
        counterparty_email: null,
        counterparty_iban: 'DE89370400440532013000',
      }),
    ]);

    render(<TransactionHistory accessToken="test-access-token" />);

    expect(
      await screen.findByText('DE89 3704 0044 0532 0130 00'),
    ).toBeInTheDocument();
  });

  it('displays the transaction date as a date-group heading', async () => {
    configureHistoryMock([
      createTransaction({
        created_at: '2026-10-01T12:30:00Z',
      }),
    ]);

    render(<TransactionHistory accessToken="test-access-token" />);

    expect(
      await screen.findByRole('heading', {
        name: '1 October 2026',
      }),
    ).toBeInTheDocument();
  });

  it('displays a reference when one is provided', async () => {
    configureHistoryMock([
      createTransaction({
        reference: 'Invoice 2026-001',
      }),
    ]);

    render(<TransactionHistory accessToken="test-access-token" />);

    expect(await screen.findByText('Reference:')).toBeInTheDocument();

    expect(screen.getByText('Invoice 2026-001')).toBeInTheDocument();
  });

  it('trims whitespace from a displayed reference', async () => {
    configureHistoryMock([
      createTransaction({
        reference: '  Invoice 2026-001  ',
      }),
    ]);

    render(<TransactionHistory accessToken="test-access-token" />);

    expect(await screen.findByText('Invoice 2026-001')).toBeInTheDocument();
  });

  it.each([null, '', '   '])(
    'does not display a preview reference when it is empty (%s)',
    async (reference) => {
      configureHistoryMock([createTransaction({ reference })]);

      render(<TransactionHistory accessToken="test-access-token" />);

      await screen.findByText('Test Recipient');

      expect(screen.queryByText('Reference:')).not.toBeInTheDocument();
    },
  );

  it('formats incoming and outgoing amounts with the correct signs', async () => {
    configureHistoryMock(
      [
        createTransaction({
          id: 1,
          amount: '125.50',
          direction: 'outgoing',
        }),
        createTransaction({
          id: 2,
          amount: '250.00',
          direction: 'incoming',
          source_account_id: 30,
          destination_account_id: 10,
        }),
      ],
      2,
    );

    render(<TransactionHistory accessToken="test-access-token" />);

    expect(await screen.findByText('−125,50 €')).toBeInTheDocument();

    expect(screen.getByText('+250,00 €')).toBeInTheDocument();
  });

  it('displays the empty state when there are no transactions', async () => {
    configureHistoryMock([], 0);

    render(<TransactionHistory accessToken="test-access-token" />);

    expect(await screen.findByText('No transactions yet')).toBeInTheDocument();

    expect(
      screen.getByText(
        /Your incoming and outgoing transactions will appear here/,
      ),
    ).toBeInTheDocument();

    expect(screen.queryByText('Reference:')).not.toBeInTheDocument();
  });

  it('displays an error when loading transaction history fails', async () => {
    mockGetTransactionHistory.mockRejectedValueOnce(
      new Error('Failed to load transaction history'),
    );

    render(<TransactionHistory accessToken="test-access-token" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to load transaction history',
    );

    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
  });

  it('displays a fallback error for a non-Error rejection', async () => {
    mockGetTransactionHistory.mockRejectedValueOnce('Unexpected failure');

    render(<TransactionHistory accessToken="test-access-token" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load transaction history.',
    );
  });

  it('retries loading transaction history after an error', async () => {
    mockGetTransactionHistory
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockImplementation(
        async (_accessToken: string, limit: number, offset: number) => {
          const items = [
            createTransaction({
              id: 2,
              reference: 'Recovered transaction',
            }),
          ];

          return createHistoryResponse(items, 1, limit, offset);
        },
      );

    render(<TransactionHistory accessToken="test-access-token" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Temporary failure',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByText('Recovered transaction'),
    ).toBeInTheDocument();

    expect(screen.getByText('Reference:')).toBeInTheDocument();
  });

  it('does not request transaction history without an access token', async () => {
    render(<TransactionHistory accessToken={null} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You must be authenticated to view transaction history.',
    );

    expect(mockGetTransactionHistory).not.toHaveBeenCalled();
  });

  it('reloads transaction history when Refresh is clicked', async () => {
    const original = createTransaction({
      reference: 'Original transaction',
    });

    const updated = createTransaction({
      id: 2,
      reference: 'Updated transaction',
    });

    let refreshCount = 0;

    mockGetTransactionHistory.mockImplementation(
      async (_accessToken: string, limit: number, offset: number) => {
        const item = refreshCount === 0 ? original : updated;

        return createHistoryResponse([item], 1, limit, offset);
      },
    );

    render(<TransactionHistory accessToken="test-access-token" />);

    expect(await screen.findByText('Original transaction')).toBeInTheDocument();

    refreshCount = 1;

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('Updated transaction')).toBeInTheDocument();
  });

  it('opens transaction details when a transaction is clicked', async () => {
    configureHistoryMock([
      createTransaction({
        reference: 'Invoice 2026-001',
        transfer_method: 'iban',
        counterparty_name: 'Test Recipient',
        counterparty_email: null,
        counterparty_iban: 'DE89370400440532013000',
      }),
    ]);

    render(<TransactionHistory accessToken="test-access-token" />);

    fireEvent.click(await getTransactionCard('Test Recipient'));

    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).getByRole('heading', {
        name: 'Transaction Details',
      }),
    ).toBeInTheDocument();

    expect(within(dialog).getByText('Recipient')).toBeInTheDocument();

    expect(within(dialog).getByText('IBAN')).toBeInTheDocument();

    expect(within(dialog).getByText('Transaction number')).toBeInTheDocument();

    expect(within(dialog).getByText('Direction')).toBeInTheDocument();

    expect(within(dialog).getByText('Transfer method')).toBeInTheDocument();

    expect(within(dialog).getByText('Date and time')).toBeInTheDocument();

    expect(within(dialog).getByText('Reference')).toBeInTheDocument();

    expect(within(dialog).getByText('Status')).toBeInTheDocument();

    expect(within(dialog).getByText('#1')).toBeInTheDocument();

    expect(
      within(dialog).getByText('DE89 3704 0044 0532 0130 00'),
    ).toBeInTheDocument();

    expect(
      within(dialog).getByRole('button', {
        name: 'Print / Save as PDF',
      }),
    ).toBeInTheDocument();
  });

  it('loads the next page when Next is clicked', async () => {
    const firstPage = Array.from({ length: 10 }, (_, index) =>
      createTransaction({
        id: index + 1,
        reference: `Reference ${index + 1}`,
      }),
    );

    const secondPage = [
      createTransaction({
        id: 11,
        reference: 'Reference 11',
      }),
    ];

    configureHistoryMock([...firstPage, ...secondPage], 11);
    configurePage(firstPage, 11, 0);
    configurePage(secondPage, 11, 10);

    render(<TransactionHistory accessToken="test-access-token" />);

    expect(await screen.findByText('Reference 1')).toBeInTheDocument();

    expect(
      screen.getByText((_, element) => {
        return (
          element?.tagName.toLowerCase() === 'p' &&
          element.textContent?.replace(/\s+/g, ' ').trim() ===
            'Showing 1–10 of 11'
        );
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Reference 11')).toBeInTheDocument();

    expect(
      screen.getByText((_, element) => {
        return (
          element?.tagName.toLowerCase() === 'p' &&
          element.textContent?.replace(/\s+/g, ' ').trim() ===
            'Showing 11–11 of 11'
        );
      }),
    ).toBeInTheDocument();

    expect(mockGetTransactionHistory).toHaveBeenCalledWith(
      'test-access-token',
      10,
      10,
    );
  });

  it('loads the previous page when Previous is clicked', async () => {
    const firstPage = Array.from({ length: 10 }, (_, index) =>
      createTransaction({
        id: index + 1,
        reference: `Reference ${index + 1}`,
      }),
    );

    const secondPage = [
      createTransaction({
        id: 11,
        reference: 'Reference 11',
      }),
    ];

    configureHistoryMock([...firstPage, ...secondPage], 11);
    configurePage(firstPage, 11, 0);
    configurePage(secondPage, 11, 10);

    render(<TransactionHistory accessToken="test-access-token" />);

    expect(await screen.findByText('Reference 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Reference 11')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));

    await waitFor(() => {
      expect(screen.getByText('Reference 1')).toBeInTheDocument();
    });

    expect(mockGetTransactionHistory).toHaveBeenCalledWith(
      'test-access-token',
      10,
      0,
    );
  });

  it('disables Previous on the first page', async () => {
    configureHistoryMock(
      Array.from({ length: 11 }, (_, index) =>
        createTransaction({
          id: index + 1,
          reference: `Reference ${index + 1}`,
        }),
      ),
      11,
    );

    render(<TransactionHistory accessToken="test-access-token" />);

    await screen.findByText('Reference 1');

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('disables Next on the last page', async () => {
    const transactions = Array.from({ length: 11 }, (_, index) =>
      createTransaction({
        id: index + 1,
        reference: `Reference ${index + 1}`,
      }),
    );

    configureHistoryMock(transactions, 11);
    configurePage(transactions.slice(0, 10), 11, 0);
    configurePage(transactions.slice(10), 11, 10);

    render(<TransactionHistory accessToken="test-access-token" />);

    await screen.findByText('Reference 1');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await screen.findByText('Reference 11');

    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it.each([
    ['FAILED', 'text-red-400'],
    ['REJECTED', 'text-red-400'],
    ['PENDING', 'text-amber-400'],
    ['PROCESSING', 'text-amber-400'],
    ['COMPLETED', 'text-emerald-400'],
    ['CANCELLED', 'text-slate-300'],
  ])(
    'applies the expected status styling for %s',
    async (status, className) => {
      configureHistoryMock([createTransaction({ status })]);

      render(<TransactionHistory accessToken="test-access-token" />);

      expect(await screen.findByText(status)).toHaveClass(className);
    },
  );

  it('handles a transaction without a reference', async () => {
    configureHistoryMock([
      createTransaction({
        id: 5,
        reference: null,
      }),
    ]);

    render(<TransactionHistory accessToken="test-access-token" />);

    fireEvent.click(await getTransactionCard('Test Recipient'));

    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('Not provided')).toBeInTheDocument();

    expect(screen.queryByText('Reference:')).not.toBeInTheDocument();
  });

  it('handles invalid amounts and dates', async () => {
    configureHistoryMock([
      createTransaction({
        amount: 'not-a-number',
        created_at: 'invalid-date',
      }),
    ]);

    render(<TransactionHistory accessToken="test-access-token" />);

    const transactionButton = await screen.findByRole('button', {
      name: /View transaction details: Test Recipient/,
    });

    expect(within(transactionButton).getByText('—')).toBeInTheDocument();

    expect(await screen.findByText('Date unavailable')).toBeInTheDocument();
  });

  it('normalizes underscores in transaction statuses for display', async () => {
    configureHistoryMock([
      createTransaction({
        status: 'AWAITING_CONFIRMATION',
      }),
    ]);

    render(<TransactionHistory accessToken="test-access-token" />);

    expect(
      await screen.findByText('AWAITING CONFIRMATION'),
    ).toBeInTheDocument();
  });

  it('closes the details dialog when Escape is pressed', async () => {
    configureHistoryMock([createTransaction()]);

    render(<TransactionHistory accessToken="test-access-token" />);

    fireEvent.click(await getTransactionCard('Test Recipient'));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('closes the details dialog when Close is clicked', async () => {
    configureHistoryMock([createTransaction()]);

    render(<TransactionHistory accessToken="test-access-token" />);

    fireEvent.click(await getTransactionCard('Test Recipient'));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Close transaction details',
      }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('shows the print or PDF action in transaction details', async () => {
    configureHistoryMock([createTransaction()]);

    render(<TransactionHistory accessToken="test-access-token" />);

    fireEvent.click(await getTransactionCard('Test Recipient'));

    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).getByRole('button', {
        name: 'Print / Save as PDF',
      }),
    ).toBeInTheDocument();
  });
});
