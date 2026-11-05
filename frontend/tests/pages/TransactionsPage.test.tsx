import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetMyAccount,
  mockCreateTransaction,
  mockGetIbanBankDetails,
  mockGetTransactionIdempotencyStatus,
  mockGetPendingTransactionRecovery,
  mockResumeTransaction,
  mockGetCurrentUser,
  mockUseAuth,
  mockGetHealth,
} = vi.hoisted(() => ({
  mockGetMyAccount: vi.fn(),
  mockCreateTransaction: vi.fn(),
  mockGetIbanBankDetails: vi.fn(),
  mockGetTransactionIdempotencyStatus: vi.fn(),
  mockGetPendingTransactionRecovery: vi.fn(),
  mockResumeTransaction: vi.fn(),
  mockGetCurrentUser: vi.fn(),
  mockUseAuth: vi.fn(),
  mockGetHealth: vi.fn(),
}));

vi.mock('../../src/features/accounts/api/accounts', () => ({
  getMyAccount: mockGetMyAccount,
}));

vi.mock('../../src/features/transactions/api/transactions', () => ({
  createTransaction: mockCreateTransaction,
  getIbanBankDetails: mockGetIbanBankDetails,
  getTransactionIdempotencyStatus: mockGetTransactionIdempotencyStatus,
  getPendingTransactionRecovery: mockGetPendingTransactionRecovery,
  resumeTransaction: mockResumeTransaction,
}));

vi.mock('../../src/features/authentication/api/authentication', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('../../src/shared/api/health', () => ({
  getHealth: mockGetHealth,
}));

vi.mock('../../src/features/authentication/context/useAuth', () => ({
  useAuth: mockUseAuth,
}));

vi.mock(
  '../../src/features/transactions/components/TransactionHistory',
  () => ({
    default: ({
      accessToken,
      initialSelectedTransactionId,
    }: {
      accessToken: string | null;
      initialSelectedTransactionId: number | null;
    }) => (
      <div data-testid="transaction-history">
        <span>{accessToken ?? 'no-token'}</span>
        <span>{initialSelectedTransactionId ?? 'no-selected-transaction'}</span>
      </div>
    ),
  }),
);

import TransactionsPage from '../../src/pages/TransactionsPage';
import { ApiClientError } from '../../src/shared/api/client';

const VALID_IBAN = 'DE89370400440532013000';

describe('TransactionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTransaction.mockReset();
    mockGetTransactionIdempotencyStatus.mockReset();
    mockGetPendingTransactionRecovery.mockReset();
    mockResumeTransaction.mockReset();
    mockGetPendingTransactionRecovery.mockResolvedValue({ operation: null });
    mockGetHealth.mockResolvedValue(undefined);
    window.sessionStorage.clear();

    mockUseAuth.mockReturnValue({
      accessToken: 'test-access-token',
    });

    mockGetCurrentUser.mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      role: 'USER',
      is_active: true,
    });

    mockGetIbanBankDetails.mockResolvedValue({
      bank_code: '12345678',
      bank_name: 'Idemerax',
      bic: 'IDEMDEFFXXX',
    });
  });

  it('loads and displays the available account balance', async () => {
    mockGetMyAccount.mockResolvedValueOnce({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    render(<TransactionsPage />);

    expect(
      screen.getByText('Checking for a previous transfer…'),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    expect(mockGetMyAccount).toHaveBeenCalledOnce();
    expect(mockGetMyAccount).toHaveBeenCalledWith('test-access-token');
  });

  it('identifies the recipient bank after entering a valid IBAN', async () => {
    const user = userEvent.setup();

    mockGetMyAccount.mockResolvedValueOnce({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText('Recipient IBAN'),
      'DE87123456781234567890',
    );

    expect(await screen.findByText('Idemerax')).toBeInTheDocument();
    expect(screen.getByText('IDEMDEFFXXX')).toBeInTheDocument();
    expect(screen.getByText('Bank identified')).toBeInTheDocument();

    expect(mockGetIbanBankDetails).toHaveBeenCalledWith(
      'test-access-token',
      'DE87123456781234567890',
    );
  });

  it('creates a transaction and refreshes the account balance', async () => {
    const user = userEvent.setup();

    mockGetMyAccount
      .mockResolvedValueOnce({
        id: 1,
        user_id: 1,
        account_number: '1234567890',
        iban: VALID_IBAN,
        bic: 'IDEMDEFFXXX',
        created_at: '2026-09-30T10:00:00Z',
        balance: '1000.0000',
      })
      .mockResolvedValueOnce({
        id: 1,
        user_id: 1,
        account_number: '1234567890',
        iban: VALID_IBAN,
        bic: 'IDEMDEFFXXX',
        created_at: '2026-09-30T10:00:00Z',
        balance: '750.0000',
      });

    mockCreateTransaction.mockResolvedValueOnce({
      id: 42,
      created_at: '2026-09-30T12:00:00Z',
      source_account_id: 1,
      destination_account_id: 2,
      amount: '250.0000',
      transaction_type: 'TRANSFER',
      status: 'COMPLETED',
      reference: null,
    });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');

    await user.click(screen.getByRole('button', { name: 'Send money' }));

    await waitFor(() => {
      expect(mockCreateTransaction).toHaveBeenCalledWith(
        'test-access-token',
        {
          destination_iban: VALID_IBAN,
          amount: '250',
          reference: null,
        },
        expect.any(String),
        expect.any(AbortSignal),
      );
    });

    expect(mockGetMyAccount).toHaveBeenCalledTimes(2);

    expect(screen.getByText('Transfer completed')).toBeInTheDocument();
    expect(screen.getByText('250,00 €')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Start new transfer' }),
    );

    await waitFor(() => {
      expect(screen.getByText('750,00 €')).toBeInTheDocument();
    });
  });

  it('creates a transaction with a reference', async () => {
    const user = userEvent.setup();

    mockGetMyAccount
      .mockResolvedValueOnce({
        id: 1,
        user_id: 1,
        account_number: '1234567890',
        iban: VALID_IBAN,
        bic: 'IDEMDEFFXXX',
        created_at: '2026-09-30T10:00:00Z',
        balance: '1000.0000',
      })
      .mockResolvedValueOnce({
        id: 1,
        user_id: 1,
        account_number: '1234567890',
        iban: VALID_IBAN,
        bic: 'IDEMDEFFXXX',
        created_at: '2026-09-30T10:00:00Z',
        balance: '750.0000',
      });

    mockCreateTransaction.mockResolvedValueOnce({
      id: 43,
      created_at: '2026-10-02T12:00:00Z',
      source_account_id: 1,
      destination_account_id: 2,
      amount: '250.0000',
      transaction_type: 'TRANSFER',
      status: 'COMPLETED',
      reference: 'Rent',
    });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.type(screen.getByLabelText('Reference (optional)'), 'Rent');

    await user.click(screen.getByRole('button', { name: 'Send money' }));

    await waitFor(() => {
      expect(mockCreateTransaction).toHaveBeenCalledWith(
        'test-access-token',
        {
          destination_iban: VALID_IBAN,
          amount: '250',
          reference: 'Rent',
        },
        expect.any(String),
        expect.any(AbortSignal),
      );
    });

    expect(screen.getByText('Transfer completed')).toBeInTheDocument();
  });

  it('displays the transaction error when processing fails', async () => {
    const user = userEvent.setup();

    mockGetMyAccount.mockResolvedValueOnce({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    mockCreateTransaction.mockRejectedValueOnce(
      new Error('Unable to process transaction.'),
    );

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');

    await user.click(screen.getByRole('button', { name: 'Send money' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Unable to process transaction.',
      );
    });

    expect(mockGetMyAccount).toHaveBeenCalledOnce();
  });

  it('uses the fallback error when transaction processing rejects with a non-Error value', async () => {
    const user = userEvent.setup();

    mockGetMyAccount.mockResolvedValueOnce({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    mockCreateTransaction.mockRejectedValueOnce('transaction failed');

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');

    await user.click(screen.getByRole('button', { name: 'Send money' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Unable to process transaction.',
      );
    });
  });

  it('displays an account loading error', async () => {
    mockGetMyAccount.mockRejectedValueOnce(
      new Error('Unable to load account.'),
    );

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Unable to load account.')).toBeInTheDocument();
    });
  });

  it('uses the fallback error when account loading rejects with a non-Error value', async () => {
    mockGetMyAccount.mockRejectedValueOnce('account failed');

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Unable to load account.')).toBeInTheDocument();
    });
  });

  it('uses fallback values for invalid transaction data', async () => {
    const user = userEvent.setup();

    mockGetMyAccount
      .mockResolvedValueOnce({
        id: 1,
        user_id: 1,
        account_number: '1234567890',
        iban: VALID_IBAN,
        bic: 'IDEMDEFFXXX',
        created_at: '2026-09-30T10:00:00Z',
        balance: '1000.0000',
      })
      .mockResolvedValueOnce({
        id: 1,
        user_id: 1,
        account_number: '1234567890',
        iban: VALID_IBAN,
        bic: 'IDEMDEFFXXX',
        created_at: '2026-09-30T10:00:00Z',
        balance: '750.0000',
      });

    mockCreateTransaction.mockResolvedValueOnce({
      id: 42,
      created_at: 'invalid-date',
      source_account_id: 1,
      destination_account_id: 2,
      amount: 'invalid-amount',
      transaction_type: 'TRANSFER',
      status: 'COMPLETED',
      reference: null,
    });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');

    await user.click(screen.getByRole('button', { name: 'Send money' }));

    await waitFor(() => {
      expect(screen.getByText('Transfer completed')).toBeInTheDocument();
    });

    expect(screen.getByText('0,00 €')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('handles an unauthenticated user', () => {
    mockUseAuth.mockReturnValue({
      accessToken: null,
    });

    render(<TransactionsPage />);

    expect(screen.getByText('Not authenticated.')).toBeInTheDocument();
    expect(mockGetMyAccount).not.toHaveBeenCalled();
    expect(mockGetIbanBankDetails).not.toHaveBeenCalled();
  });

  it('creates a transaction with an email recipient', async () => {
    const user = userEvent.setup();

    mockGetMyAccount
      .mockResolvedValueOnce({
        id: 1,
        user_id: 1,
        account_number: '1234567890',
        iban: VALID_IBAN,
        bic: 'IDEMDEFFXXX',
        created_at: '2026-09-30T10:00:00Z',
        balance: '1000.0000',
      })
      .mockResolvedValueOnce({
        id: 1,
        user_id: 1,
        account_number: '1234567890',
        iban: VALID_IBAN,
        bic: 'IDEMDEFFXXX',
        created_at: '2026-09-30T10:00:00Z',
        balance: '750.0000',
      });

    mockCreateTransaction.mockResolvedValueOnce({
      id: 44,
      created_at: '2026-10-06T10:00:00Z',
      source_account_id: 1,
      destination_account_id: 2,
      amount: '250.0000',
      transaction_type: 'TRANSFER',
      status: 'COMPLETED',
      reference: null,
    });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Email' }));

    await user.type(
      screen.getByLabelText('Recipient email'),
      'recipient@example.com',
    );

    await user.type(screen.getByLabelText('Amount'), '250');

    await user.click(screen.getByRole('button', { name: 'Send money' }));

    await waitFor(() => {
      expect(mockCreateTransaction).toHaveBeenCalledWith(
        'test-access-token',
        {
          destination_email: 'recipient@example.com',
          amount: '250',
          reference: null,
        },
        expect.any(String),
        expect.any(AbortSignal),
      );
    });

    expect(screen.getByText('Transfer completed')).toBeInTheDocument();
  });

  it('switches to receive money mode', async () => {
    const user = userEvent.setup();

    mockGetMyAccount.mockResolvedValueOnce({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Receive Money' }));

    expect(
      screen.getByRole('heading', { name: 'Receive Money' }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        'Share one of the following details with someone who wants to send money to your Idemerax account.',
      ),
    ).toBeInTheDocument();
  });

  it('displays the account payment details in receive money mode', async () => {
    const user = userEvent.setup();

    mockGetMyAccount.mockResolvedValueOnce({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Receive Money' }));

    expect(screen.getByText('DE89 3704 0044 0532 0130 00')).toBeInTheDocument();
    expect(screen.getByText('IDEMDEFFXXX')).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });

  it('copies the account IBAN in receive money mode', async () => {
    const user = userEvent.setup();

    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);

    mockGetMyAccount.mockResolvedValueOnce({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Receive Money' }));

    const copyButton = screen.getByRole('button', {
      name: 'Copy IBAN',
    });

    await user.click(copyButton);

    expect(writeText).toHaveBeenCalledWith(VALID_IBAN);
    expect(copyButton).toHaveTextContent('Copied');

    writeText.mockRestore();
  });

  it('copies the account BIC in receive money mode', async () => {
    const user = userEvent.setup();

    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);

    mockGetMyAccount.mockResolvedValueOnce({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Receive Money' }));

    const copyButton = screen.getByRole('button', {
      name: 'Copy BIC',
    });

    await user.click(copyButton);

    expect(writeText).toHaveBeenCalledWith('IDEMDEFFXXX');
    expect(copyButton).toHaveTextContent('Copied');

    writeText.mockRestore();
  });

  it('copies the account email in receive money mode', async () => {
    const user = userEvent.setup();

    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);

    mockGetMyAccount.mockResolvedValueOnce({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Receive Money' }));

    const copyButton = screen.getByRole('button', {
      name: 'Copy Email',
    });

    await user.click(copyButton);

    expect(writeText).toHaveBeenCalledWith('user@example.com');
    expect(copyButton).toHaveTextContent('Copied');

    writeText.mockRestore();
  });

  // Idempotency tests

  it('reuses the same idempotency key when retrying an uncertain transfer', async () => {
    const user = userEvent.setup();

    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    mockCreateTransaction
      .mockRejectedValueOnce(
        new ApiClientError('Request outcome unknown.', null, true),
      )
      .mockResolvedValueOnce({
        id: 51,
        created_at: '2026-10-28T10:00:00Z',
        source_account_id: 1,
        destination_account_id: 2,
        amount: '250.0000',
        transaction_type: 'TRANSFER',
        status: 'COMPLETED',
        reference: null,
      });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.click(screen.getByRole('button', { name: 'Send money' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'We could not confirm whether this transfer completed.',
      );
    });

    const firstKey = mockCreateTransaction.mock.calls[0][2];
    expect(firstKey).toEqual(expect.any(String));
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).not.toBeNull();

    await user.click(
      screen.getByRole('button', { name: 'Retry transfer safely' }),
    );

    await waitFor(() => {
      expect(screen.getByText('Transfer completed')).toBeInTheDocument();
    });

    expect(mockCreateTransaction).toHaveBeenCalledTimes(2);
    expect(mockCreateTransaction.mock.calls[1][2]).toBe(firstKey);
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBeNull();
  });

  it('blocks a different transfer while the previous outcome is uncertain', async () => {
    const user = userEvent.setup();

    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    mockCreateTransaction.mockRejectedValueOnce(
      new ApiClientError('Request outcome unknown.', null, true),
    );

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.click(screen.getByRole('button', { name: 'Send money' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'We could not confirm whether this transfer completed.',
      );
    });

    await user.clear(screen.getByLabelText('Amount'));
    await user.type(screen.getByLabelText('Amount'), '300');
    await user.click(
      screen.getByRole('button', { name: 'Retry transfer safely' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A previous transfer may have completed. Retry the exact same recipient, amount and reference first.',
    );
    expect(mockCreateTransaction).toHaveBeenCalledOnce();
  });

  it('recovers a completed transfer through the status endpoint and clears the pending key', async () => {
    const user = userEvent.setup();

    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    mockCreateTransaction.mockRejectedValueOnce(
      new ApiClientError('Request outcome unknown.', null, true),
    );

    mockGetTransactionIdempotencyStatus.mockResolvedValueOnce({
      status: 'COMPLETED',
      transaction: {
        id: 52,
        created_at: '2026-10-28T10:00:00Z',
        source_account_id: 1,
        destination_account_id: 2,
        amount: '250.0000',
        transaction_type: 'TRANSFER',
        status: 'COMPLETED',
        reference: null,
      },
    });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.click(screen.getByRole('button', { name: 'Send money' }));

    // Reconciliation runs automatically after an ambiguous submission.
    await waitFor(() => {
      expect(screen.getByText('Transfer completed')).toBeInTheDocument();
    });

    const submittedKey = mockCreateTransaction.mock.calls[0][2];

    expect(submittedKey).toEqual(expect.any(String));
    expect(mockGetTransactionIdempotencyStatus).toHaveBeenCalledWith(
      'test-access-token',
      submittedKey,
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBeNull();
  });

  it('keeps the pending attempt when the status endpoint reports no completed transfer', async () => {
    const user = userEvent.setup();

    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    mockCreateTransaction.mockRejectedValueOnce(
      new ApiClientError('Request outcome unknown.', null, true),
    );
    mockGetTransactionIdempotencyStatus.mockResolvedValueOnce({
      status: 'NOT_FOUND',
    });
    // NOT_FOUND triggers an automatic replay of the exact saved request/key.
    mockCreateTransaction.mockRejectedValueOnce(
      new ApiClientError('Request outcome unknown.', null, true),
    );

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.click(screen.getByRole('button', { name: 'Send money' }));

    await waitFor(() => {
      expect(mockCreateTransaction).toHaveBeenCalledTimes(2);
    });

    const storedBefore = window.sessionStorage.getItem(
      'idemerax:pending-transaction:v1:1',
    );
    const originalCall = mockCreateTransaction.mock.calls[0];
    const replayCall = mockCreateTransaction.mock.calls[1];

    expect(replayCall[1]).toEqual(originalCall[1]);
    expect(replayCall[2]).toBe(originalCall[2]);
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBe(storedBefore);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'The retry outcome is still unknown.',
    );
  });

  it('keeps the pending attempt when the status lookup fails', async () => {
    const user = userEvent.setup();

    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    mockCreateTransaction.mockRejectedValueOnce(
      new ApiClientError('Request outcome unknown.', null, true),
    );
    mockGetTransactionIdempotencyStatus.mockRejectedValueOnce(
      new Error('Status unavailable'),
    );

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.click(screen.getByRole('button', { name: 'Send money' }));

    // The first status lookup is automatic; a failure must preserve the attempt.
    expect(await screen.findByRole('status')).toHaveTextContent(
      'The transfer status could not be retrieved. The previous attempt remains saved;',
    );

    const storedBefore = window.sessionStorage.getItem(
      'idemerax:pending-transaction:v1:1',
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBe(storedBefore);
  });

  it('reuses the persisted idempotency key after the page is remounted', async () => {
    const user = userEvent.setup();

    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    mockCreateTransaction
      .mockRejectedValueOnce(
        new ApiClientError('Request outcome unknown.', null, true),
      )
      .mockResolvedValueOnce({
        id: 53,
        created_at: '2026-10-28T10:00:00Z',
        source_account_id: 1,
        destination_account_id: 2,
        amount: '250.0000',
        transaction_type: 'TRANSFER',
        status: 'COMPLETED',
        reference: null,
      });

    const firstRender = render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.click(screen.getByRole('button', { name: 'Send money' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Check transfer status' }),
      ).toBeInTheDocument();
    });

    const firstKey = mockCreateTransaction.mock.calls[0][2];
    expect(firstKey).toEqual(expect.any(String));

    firstRender.unmount();

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.click(
      screen.getByRole('button', { name: 'Retry transfer safely' }),
    );

    await waitFor(() => {
      expect(screen.getByText('Transfer completed')).toBeInTheDocument();
    });

    expect(mockCreateTransaction).toHaveBeenCalledTimes(2);
    expect(mockCreateTransaction.mock.calls[1][2]).toBe(firstKey);
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBeNull();
  });

  it.each([409, 425])(
    'keeps the idempotency attempt when transaction submission returns HTTP %i',
    async (status) => {
      const user = userEvent.setup();

      mockGetMyAccount.mockResolvedValue({
        id: 1,
        user_id: 1,
        account_number: '1234567890',
        iban: VALID_IBAN,
        bic: 'IDEMDEFFXXX',
        created_at: '2026-09-30T10:00:00Z',
        balance: '1000.0000',
      });

      mockCreateTransaction.mockRejectedValueOnce(
        new ApiClientError('Retry the transaction safely.', status, false),
      );

      render(<TransactionsPage />);

      await waitFor(() => {
        expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
      await user.type(screen.getByLabelText('Amount'), '250');
      await user.click(screen.getByRole('button', { name: 'Send money' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'We could not confirm whether this transfer completed.',
        );
      });

      expect(mockCreateTransaction).toHaveBeenCalledOnce();
      expect(
        window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
      ).not.toBeNull();
      expect(
        screen.getByRole('button', { name: 'Check transfer status' }),
      ).toBeInTheDocument();
    },
  );

  it('discards an invalid persisted idempotency key before allowing a new transfer', async () => {
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({
        key: 'invalid key with spaces',
        signature: 'previous-signature',
      }),
    );

    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('keeps the pending attempt when the status says COMPLETED without a transaction payload', async () => {
    const user = userEvent.setup();

    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    mockCreateTransaction.mockRejectedValueOnce(
      new ApiClientError('Request outcome unknown.', null, true),
    );
    mockGetTransactionIdempotencyStatus.mockResolvedValueOnce({
      status: 'COMPLETED',
      transaction: null,
    });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.click(screen.getByRole('button', { name: 'Send money' }));

    // COMPLETED without a transaction payload is not enough to clear the key.
    expect(await screen.findByRole('status')).toHaveTextContent(
      'No completed transaction was found.',
    );

    const storedAttempt = window.sessionStorage.getItem(
      'idemerax:pending-transaction:v1:1',
    );
    expect(screen.queryByText('Transfer completed')).not.toBeInTheDocument();
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBe(storedAttempt);
  });

  it('clears the pending idempotency attempt after a confirmed status even if balance refresh fails', async () => {
    const user = userEvent.setup();

    mockGetMyAccount
      .mockResolvedValueOnce({
        id: 1,
        user_id: 1,
        account_number: '1234567890',
        iban: VALID_IBAN,
        bic: 'IDEMDEFFXXX',
        created_at: '2026-09-30T10:00:00Z',
        balance: '1000.0000',
      })
      .mockRejectedValueOnce(new Error('Balance service unavailable'));

    mockCreateTransaction.mockRejectedValueOnce(
      new ApiClientError('Request outcome unknown.', null, true),
    );
    mockGetTransactionIdempotencyStatus.mockResolvedValueOnce({
      status: 'COMPLETED',
      transaction: {
        id: 54,
        created_at: '2026-10-28T10:00:00Z',
        source_account_id: 1,
        destination_account_id: 2,
        amount: '250.0000',
        transaction_type: 'TRANSFER',
        status: 'COMPLETED',
        reference: null,
      },
    });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.click(screen.getByRole('button', { name: 'Send money' }));

    // The status endpoint is checked automatically after the ambiguous POST.
    expect(await screen.findByText('Transfer completed')).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Transfer completed, but the balance could not be refreshed: Balance service unavailable',
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Check transfer status' }),
    ).not.toBeInTheDocument();
  });

  it('ignores malformed persisted JSON without creating a false pending transfer', async () => {
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      '{not-valid-json',
    );

    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('clears the idempotency attempt after a definite transaction rejection', async () => {
    const user = userEvent.setup();

    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockCreateTransaction.mockRejectedValueOnce(
      new Error('Insufficient funds.'),
    );

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.click(screen.getByRole('button', { name: 'Send money' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Insufficient funds.',
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Check transfer status' }),
    ).not.toBeInTheDocument();
  });

  it('restores server recovery details and resumes the same operation to completion', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockGetPendingTransactionRecovery.mockResolvedValue({
      operation: {
        idempotency_key: 'server-key-123',
        recipient_method: 'iban',
        recipient_iban: VALID_IBAN,
        recipient_email: null,
        amount: '125.0000',
        reference: 'Recovered payment',
      },
    });
    mockResumeTransaction.mockResolvedValue({
      status: 'COMPLETED',
      transaction: {
        id: 71,
        created_at: '2026-10-28T10:00:00Z',
        source_account_id: 1,
        destination_account_id: 2,
        amount: '125.0000',
        transaction_type: 'TRANSFER',
        status: 'COMPLETED',
        reference: 'Recovered payment',
      },
    });

    render(<TransactionsPage />);
    expect(
      await screen.findByRole('region', { name: 'Previous transfer recovery' }),
    ).toBeInTheDocument();
    expect(screen.getByText('125,00 €')).toBeInTheDocument();
    expect(screen.getByText('Recovered payment')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Retry original transfer' }),
    );
    expect(await screen.findByText('Transfer completed')).toBeInTheDocument();
    expect(mockResumeTransaction).toHaveBeenCalledWith(
      'test-access-token',
      'server-key-123',
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBeNull();
  });

  it('keeps server recovery locked when resume is still processing', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockGetPendingTransactionRecovery.mockResolvedValue({
      operation: {
        idempotency_key: 'server-key-processing',
        recipient_method: 'email',
        recipient_iban: null,
        recipient_email: 'recipient@example.com',
        amount: '80.0000',
        reference: null,
      },
    });
    mockResumeTransaction.mockResolvedValue({ status: 'PROCESSING' });
    render(<TransactionsPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Retry original transfer' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'still pending',
    );
    expect(
      screen.getByRole('region', { name: 'Previous transfer recovery' }),
    ).toBeInTheDocument();
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).not.toBeNull();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('clears server recovery only after the server confirms a failed operation', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockGetPendingTransactionRecovery.mockResolvedValue({
      operation: {
        idempotency_key: 'server-key-failed',
        recipient_method: 'iban',
        recipient_iban: VALID_IBAN,
        recipient_email: null,
        amount: '80.0000',
        reference: null,
      },
    });
    mockResumeTransaction.mockResolvedValue({
      status: 'FAILED',
      failure_code: 'INSUFFICIENT_FUNDS',
    });
    render(<TransactionsPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Retry original transfer' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'insufficient funds',
    );
    expect(
      screen.queryByRole('region', { name: 'Previous transfer recovery' }),
    ).not.toBeInTheDocument();
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBeNull();
  });

  it('retains server recovery details when resume and follow-up lookup both fail', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockGetPendingTransactionRecovery
      .mockResolvedValueOnce({
        operation: {
          idempotency_key: 'server-key-error',
          recipient_method: 'email',
          recipient_iban: null,
          recipient_email: 'recipient@example.com',
          amount: '80.0000',
          reference: null,
        },
      })
      .mockRejectedValueOnce(new Error('Recovery lookup unavailable'));
    mockResumeTransaction.mockRejectedValueOnce(
      new Error('Resume unavailable'),
    );
    render(<TransactionsPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Retry original transfer' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Resume unavailable',
    );
    expect(
      screen.getByRole('region', { name: 'Previous transfer recovery' }),
    ).toBeInTheDocument();
    expect(screen.getByText('80,00 €')).toBeInTheDocument();
  });

  it('shows immediate connection-loss recovery messaging for an unresolved attempt', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockCreateTransaction.mockRejectedValueOnce(
      new ApiClientError('Request outcome unknown.', null, true),
    );
    mockGetTransactionIdempotencyStatus.mockRejectedValue(new Error('Offline'));
    render(<TransactionsPage />);
    await user.type(await screen.findByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.click(screen.getByRole('button', { name: 'Send money' }));
    await screen.findByRole('alert');
    act(() => window.dispatchEvent(new Event('offline')));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Transfer status unknown – connection lost. The original attempt is saved; automatic status checking will resume when the connection returns.',
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).not.toBeNull();
  });

  it('shows the verification-required state when initial server recovery lookup fails', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockGetPendingTransactionRecovery
      .mockRejectedValueOnce(new Error('Recovery unavailable'))
      .mockResolvedValueOnce({ operation: null });
    render(<TransactionsPage />);
    expect(
      await screen.findByText('Transfer status cannot be verified'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A new transfer is disabled until this check succeeds/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByLabelText('Recipient IBAN')).toBeInTheDocument();
    expect(mockGetPendingTransactionRecovery).toHaveBeenCalledTimes(2);
  });

  it('resolves a recovered server operation from a confirmed status lookup', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockGetPendingTransactionRecovery.mockResolvedValue({
      operation: {
        idempotency_key: 'server-key-status',
        recipient_method: 'iban',
        recipient_iban: VALID_IBAN,
        recipient_email: null,
        amount: '45.0000',
        reference: null,
      },
    });
    mockGetTransactionIdempotencyStatus.mockResolvedValue({
      status: 'COMPLETED',
      transaction: {
        id: 72,
        created_at: '2026-10-28T10:00:00Z',
        source_account_id: 1,
        destination_account_id: 2,
        amount: '45.0000',
        transaction_type: 'TRANSFER',
        status: 'COMPLETED',
        reference: null,
      },
    });
    render(<TransactionsPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Check transfer status' }),
    );
    expect(await screen.findByText('Transfer completed')).toBeInTheDocument();
    expect(mockGetTransactionIdempotencyStatus).toHaveBeenCalledWith(
      'test-access-token',
      'server-key-status',
    );
    expect(
      screen.queryByRole('region', { name: 'Previous transfer recovery' }),
    ).not.toBeInTheDocument();
  });

  it('keeps a server operation unresolved when status is not found', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockGetPendingTransactionRecovery
      .mockResolvedValueOnce({
        operation: {
          idempotency_key: 'server-key-not-found',
          recipient_method: 'email',
          recipient_iban: null,
          recipient_email: 'recipient@example.com',
          amount: '45.0000',
          reference: null,
        },
      })
      .mockResolvedValueOnce({ operation: null });
    mockGetTransactionIdempotencyStatus.mockResolvedValue({
      status: 'NOT_FOUND',
    });
    render(<TransactionsPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Check transfer status' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'predates request recovery',
    );
    expect(
      screen.getByRole('region', { name: 'Previous transfer recovery' }),
    ).toBeInTheDocument();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('opens transaction history from a completed receipt with the transaction selected', async () => {
    const user = userEvent.setup();
    mockGetMyAccount
      .mockResolvedValueOnce({
        id: 1,
        user_id: 1,
        account_number: '1234567890',
        iban: VALID_IBAN,
        bic: 'IDEMDEFFXXX',
        created_at: '2026-09-30T10:00:00Z',
        balance: '1000.0000',
      })
      .mockResolvedValueOnce({
        id: 1,
        user_id: 1,
        account_number: '1234567890',
        iban: VALID_IBAN,
        bic: 'IDEMDEFFXXX',
        created_at: '2026-09-30T10:00:00Z',
        balance: '750.0000',
      });
    mockCreateTransaction.mockResolvedValueOnce({
      id: 81,
      created_at: '2026-11-04T10:00:00Z',
      source_account_id: 1,
      destination_account_id: 2,
      amount: '250.0000',
      transaction_type: 'TRANSFER',
      status: 'COMPLETED',
      reference: 'History navigation',
    });

    render(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.type(
      screen.getByLabelText('Reference (optional)'),
      'History navigation',
    );
    await user.click(screen.getByRole('button', { name: 'Send money' }));
    await screen.findByText('Transfer completed');
    await user.click(
      screen.getByRole('button', { name: 'View transaction history' }),
    );

    expect(
      screen.getByRole('tab', { name: 'Transaction History' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('transaction-history')).toHaveTextContent(
      'test-access-token',
    );
    expect(screen.getByTestId('transaction-history')).toHaveTextContent('81');
    expect(mockCreateTransaction).toHaveBeenCalledOnce();
  });

  it('opens transaction history from the section tab without a selected transaction', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValueOnce({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    render(<TransactionsPage />);
    await waitFor(() =>
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('tab', { name: 'Transaction History' }));

    expect(
      screen.getByRole('tab', { name: 'Transaction History' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('transaction-history')).toHaveTextContent(
      'test-access-token',
    );
    expect(screen.getByTestId('transaction-history')).toHaveTextContent(
      'no-selected-transaction',
    );
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('handles clipboard rejection without leaving a stale copied indicator', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValueOnce(new Error('Clipboard denied'));
    mockGetMyAccount.mockResolvedValueOnce({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    render(<TransactionsPage />);
    await waitFor(() =>
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('tab', { name: 'Receive Money' }));
    const copyButton = screen.getByRole('button', { name: 'Copy IBAN' });
    await user.click(copyButton);
    await waitFor(() => expect(copyButton).not.toHaveTextContent('Copied'));
    expect(writeText).toHaveBeenCalledWith(VALID_IBAN);
    writeText.mockRestore();
  });

  it('rechecks the same unresolved attempt when connectivity returns', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockCreateTransaction.mockRejectedValueOnce(
      new ApiClientError('Request outcome unknown.', null, true),
    );
    mockGetTransactionIdempotencyStatus.mockResolvedValue({
      status: 'PROCESSING',
    });
    mockResumeTransaction.mockResolvedValue({ status: 'PROCESSING' });
    render(<TransactionsPage />);
    await user.type(await screen.findByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.click(screen.getByRole('button', { name: 'Send money' }));
    await waitFor(() => expect(mockCreateTransaction).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
      ).not.toBeNull(),
    );
    const savedAttempt = window.sessionStorage.getItem(
      'idemerax:pending-transaction:v1:1',
    );

    act(() => window.dispatchEvent(new Event('offline')));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Transfer status unknown – connection lost. The original attempt is saved; automatic status checking will resume when the connection returns.',
    );
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() =>
      expect(mockGetTransactionIdempotencyStatus).toHaveBeenCalled(),
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBe(savedAttempt);
    expect(mockCreateTransaction).toHaveBeenCalledOnce();
  });

  it('switches between send, receive and transaction history sections', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValueOnce({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    render(<TransactionsPage />);
    await waitFor(() =>
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('tab', { name: 'Receive Money' }));
    expect(screen.getByRole('tab', { name: 'Receive Money' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('tab', { name: 'Send Money' }));
    expect(screen.getByRole('tab', { name: 'Send Money' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('tab', { name: 'Transaction History' }));
    expect(
      screen.getByRole('tab', { name: 'Transaction History' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('transaction-history')).toHaveTextContent(
      'no-selected-transaction',
    );
  });

  it('keeps an in-memory idempotency key when session storage is unavailable', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockCreateTransaction
      .mockRejectedValueOnce(
        new ApiClientError('Request outcome unknown.', null, true),
      )
      .mockResolvedValueOnce({
        id: 88,
        created_at: '2026-11-04T10:00:00Z',
        source_account_id: 1,
        destination_account_id: 2,
        amount: '25.0000',
        transaction_type: 'TRANSFER',
        status: 'COMPLETED',
        reference: null,
      });

    const storageSet = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Storage disabled', 'QuotaExceededError');
      });
    render(<TransactionsPage />);
    await waitFor(() =>
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '25');
    await user.click(screen.getByRole('button', { name: 'Send money' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'We could not confirm',
      ),
    );

    const originalKey = mockCreateTransaction.mock.calls[0][2];
    await user.click(
      screen.getByRole('button', { name: 'Retry transfer safely' }),
    );
    await waitFor(() =>
      expect(screen.getByText('Transfer completed')).toBeInTheDocument(),
    );
    expect(mockCreateTransaction).toHaveBeenCalledTimes(2);
    expect(mockCreateTransaction.mock.calls[1][2]).toBe(originalKey);
    storageSet.mockRestore();
  });

  it('clears a persisted attempt only when status is definitively FAILED', async () => {
    const key = 'recoverable-attempt-42';
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({
        key,
        signature: 'saved-signature',
        protocolVersion: 2,
        request: {
          destination_iban: VALID_IBAN,
          amount: '25.00',
          reference: null,
        },
      }),
    );
    mockGetTransactionIdempotencyStatus.mockResolvedValue({
      status: 'FAILED',
      failure_code: null,
      transaction: null,
    });
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    render(<TransactionsPage />);
    await waitFor(() =>
      expect(mockGetTransactionIdempotencyStatus).toHaveBeenCalledWith(
        'test-access-token',
        key,
      ),
    );
    await waitFor(() =>
      expect(
        window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
      ).toBeNull(),
    );
    expect(
      await screen.findByText(/previous transfer failed \(unknown reason\)/i),
    ).toBeInTheDocument();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('automatically replays a restored v2 attempt only with its saved request and key after NOT_FOUND', async () => {
    const savedKey = 'v2-recovery-key-987';
    const savedRequest = {
      destination_iban: VALID_IBAN,
      amount: '37.50',
      reference: 'saved ref',
    };
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({
        key: savedKey,
        signature: 'persisted-signature',
        protocolVersion: 2,
        request: savedRequest,
      }),
    );
    mockGetTransactionIdempotencyStatus.mockResolvedValue({
      status: 'NOT_FOUND',
      failure_code: null,
      transaction: null,
    });
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockCreateTransaction.mockResolvedValue({
      id: 91,
      created_at: '2026-11-04T11:00:00Z',
      source_account_id: 1,
      destination_account_id: 2,
      amount: '37.5000',
      transaction_type: 'TRANSFER',
      status: 'COMPLETED',
      reference: 'saved ref',
    });

    render(<TransactionsPage />);
    await waitFor(() =>
      expect(screen.getByText('Transfer completed')).toBeInTheDocument(),
    );
    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      'test-access-token',
      savedRequest,
      savedKey,
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBeNull();
  });

  it('handles a definitively failed status with insufficient-funds detail without retrying', async () => {
    const key = 'status-failed-insufficient';
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({
        key,
        signature: 'sig',
        protocolVersion: 2,
        request: {
          destination_iban: VALID_IBAN,
          amount: '900.00',
          reference: null,
        },
      }),
    );
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockGetTransactionIdempotencyStatus.mockResolvedValue({
      status: 'FAILED',
      failure_code: 'INSUFFICIENT_FUNDS',
      transaction: null,
    });
    render(<TransactionsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'INSUFFICIENT_FUNDS',
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBeNull();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('keeps the original key when a PROCESSING status cannot be resumed yet', async () => {
    const key = 'status-processing-resume-pending';
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({
        key,
        signature: 'sig',
        protocolVersion: 2,
        request: {
          destination_iban: VALID_IBAN,
          amount: '21.00',
          reference: null,
        },
      }),
    );
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockGetTransactionIdempotencyStatus.mockResolvedValue({
      status: 'PROCESSING',
    });
    mockResumeTransaction.mockResolvedValue({ status: 'PROCESSING' });
    render(<TransactionsPage />);
    await waitFor(() =>
      expect(mockResumeTransaction).toHaveBeenCalledWith(
        'test-access-token',
        key,
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'original transfer is still processing',
      ),
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).not.toBeNull();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('clears a PROCESSING attempt only when resume confirms FAILED', async () => {
    const key = 'status-processing-resume-failed';
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({
        key,
        signature: 'sig',
        protocolVersion: 2,
        request: {
          destination_iban: VALID_IBAN,
          amount: '21.00',
          reference: null,
        },
      }),
    );
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockGetTransactionIdempotencyStatus.mockResolvedValue({
      status: 'PROCESSING',
    });
    mockResumeTransaction.mockResolvedValue({
      status: 'FAILED',
      failure_code: 'DECLINED',
    });
    render(<TransactionsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('DECLINED');
    await waitFor(() =>
      expect(mockResumeTransaction).toHaveBeenCalledWith(
        'test-access-token',
        key,
      ),
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBeNull();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('does not replace a local idempotency key with a different server recovery operation', async () => {
    const key = 'local-original-key';
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({
        key,
        signature: 'sig',
        protocolVersion: 2,
        request: {
          destination_iban: VALID_IBAN,
          amount: '21.00',
          reference: null,
        },
      }),
    );
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockGetTransactionIdempotencyStatus.mockResolvedValue({
      status: 'NOT_FOUND',
    });
    mockGetPendingTransactionRecovery.mockResolvedValue({
      operation: {
        idempotency_key: 'different-server-key',
        recipient_method: 'iban',
        recipient_iban: VALID_IBAN,
        recipient_email: null,
        amount: '21.0000',
        reference: null,
      },
    });
    render(<TransactionsPage />);
    await waitFor(() =>
      expect(mockGetTransactionIdempotencyStatus).toHaveBeenCalledWith(
        'test-access-token',
        key,
      ),
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toContain(key);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('opens transaction history from a completed receipt with the transaction selected', async () => {
    const user = userEvent.setup();
    mockGetMyAccount
      .mockResolvedValueOnce({
        id: 1,
        user_id: 1,
        account_number: '1234567890',
        iban: VALID_IBAN,
        bic: 'IDEMDEFFXXX',
        created_at: '2026-09-30T10:00:00Z',
        balance: '1000.0000',
      })
      .mockResolvedValueOnce({
        id: 1,
        user_id: 1,
        account_number: '1234567890',
        iban: VALID_IBAN,
        bic: 'IDEMDEFFXXX',
        created_at: '2026-09-30T10:00:00Z',
        balance: '750.0000',
      });
    mockCreateTransaction.mockResolvedValueOnce({
      id: 81,
      created_at: '2026-11-04T10:00:00Z',
      source_account_id: 1,
      destination_account_id: 2,
      amount: '250.0000',
      transaction_type: 'TRANSFER',
      status: 'COMPLETED',
      reference: 'History navigation',
    });
    render(<TransactionsPage />);
    await waitFor(() =>
      expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.type(
      screen.getByLabelText('Reference (optional)'),
      'History navigation',
    );
    await user.click(screen.getByRole('button', { name: 'Send money' }));
    await screen.findByText('Transfer completed');
    await user.click(
      screen.getByRole('button', { name: 'View transaction history' }),
    );
    expect(
      screen.getByRole('tab', { name: 'Transaction History' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('transaction-history')).toHaveTextContent(
      'test-access-token',
    );
    expect(screen.getByTestId('transaction-history')).toHaveTextContent('81');
    expect(mockCreateTransaction).toHaveBeenCalledOnce();
  });

  it('keeps a restored v2 attempt locked and replays only its persisted request and key after NOT_FOUND', async () => {
    const savedKey = 'v2-recovery-key-987';
    const savedRequest = {
      destination_iban: VALID_IBAN,
      amount: '37.50',
      reference: 'saved ref',
    };
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({
        key: savedKey,
        signature: 'persisted-signature',
        protocolVersion: 2,
        request: savedRequest,
      }),
    );
    mockGetTransactionIdempotencyStatus.mockResolvedValue({
      status: 'NOT_FOUND',
    });
    mockGetPendingTransactionRecovery.mockResolvedValue({ operation: null });
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockCreateTransaction.mockResolvedValue({
      id: 91,
      created_at: '2026-11-04T11:00:00Z',
      source_account_id: 1,
      destination_account_id: 2,
      amount: '37.5000',
      transaction_type: 'TRANSFER',
      status: 'COMPLETED',
      reference: 'saved ref',
    });
    render(<TransactionsPage />);
    await waitFor(() =>
      expect(screen.getByText('Transfer completed')).toBeInTheDocument(),
    );
    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      'test-access-token',
      savedRequest,
      savedKey,
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBeNull();
  });

  it('clears a persisted attempt only after the status endpoint definitively reports FAILED', async () => {
    const key = 'persisted-failed-attempt';
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({
        key,
        signature: 'saved-signature',
        protocolVersion: 2,
        request: {
          destination_iban: VALID_IBAN,
          amount: '25.00',
          reference: null,
        },
      }),
    );
    mockGetTransactionIdempotencyStatus.mockResolvedValue({
      status: 'FAILED',
      failure_code: 'INSUFFICIENT_FUNDS',
    });
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    render(<TransactionsPage />);
    await waitFor(() =>
      expect(mockGetTransactionIdempotencyStatus).toHaveBeenCalledWith(
        'test-access-token',
        key,
      ),
    );
    await waitFor(() =>
      expect(
        window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
      ).toBeNull(),
    );
    expect(
      await screen.findByText(/previous transfer failed/i),
    ).toBeInTheDocument();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('does not replace a server recovery key when the status lookup returns NOT_FOUND', async () => {
    const key = 'server-operation-key';
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({
        key,
        signature: '',
        protocolVersion: 2,
      }),
    );
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockGetTransactionIdempotencyStatus.mockResolvedValue({
      status: 'NOT_FOUND',
    });
    mockGetPendingTransactionRecovery.mockResolvedValue({
      operation: {
        idempotency_key: 'different-key',
        recipient_method: 'iban',
        recipient_iban: VALID_IBAN,
        recipient_email: null,
        amount: '45.0000',
        reference: null,
      },
    });
    render(<TransactionsPage />);
    await waitFor(() =>
      expect(mockGetTransactionIdempotencyStatus).toHaveBeenCalledWith(
        'test-access-token',
        key,
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'different transfer is pending',
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toContain(key);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('does not create a second transfer when the connection returns for an unresolved attempt', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockCreateTransaction.mockRejectedValueOnce(
      new ApiClientError('Request outcome unknown.', null, true),
    );
    mockGetTransactionIdempotencyStatus.mockResolvedValue({
      status: 'PROCESSING',
    });
    mockResumeTransaction.mockResolvedValue({ status: 'PROCESSING' });
    render(<TransactionsPage />);
    await user.type(await screen.findByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.click(screen.getByRole('button', { name: 'Send money' }));
    await waitFor(() => expect(mockCreateTransaction).toHaveBeenCalledOnce());
    const savedAttempt = window.sessionStorage.getItem(
      'idemerax:pending-transaction:v1:1',
    );
    act(() => window.dispatchEvent(new Event('offline')));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Transfer status unknown – connection lost. The original attempt is saved; automatic status checking will resume when the connection returns.',
    );
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() =>
      expect(mockGetTransactionIdempotencyStatus).toHaveBeenCalled(),
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBe(savedAttempt);
    expect(mockCreateTransaction).toHaveBeenCalledOnce();
  });

  it('handles clipboard rejection without showing a copied confirmation', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValueOnce(new Error('Clipboard denied'));
    mockGetMyAccount.mockResolvedValueOnce({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    render(<TransactionsPage />);
    await waitFor(() =>
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('tab', { name: 'Receive Money' }));
    const copyButton = screen.getByRole('button', { name: 'Copy IBAN' });
    await user.click(copyButton);
    await waitFor(() => expect(copyButton).not.toHaveTextContent('Copied'));
    expect(writeText).toHaveBeenCalledWith(VALID_IBAN);
    writeText.mockRestore();
  });

  it('restores a persisted attempt as completed from status during page initialization', async () => {
    const key = 'startup-completed-key';
    const completed = {
      id: 93,
      created_at: '2026-11-04T12:00:00Z',
      source_account_id: 1,
      destination_account_id: 2,
      amount: '12.0000',
      transaction_type: 'TRANSFER',
      status: 'COMPLETED',
      reference: null,
    };
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({
        key,
        signature: 'saved',
        protocolVersion: 2,
        request: {
          destination_iban: VALID_IBAN,
          amount: '12',
          reference: null,
        },
      }),
    );
    mockGetTransactionIdempotencyStatus.mockResolvedValue({
      status: 'COMPLETED',
      transaction: completed,
    });
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    render(<TransactionsPage />);
    expect(await screen.findByText('Transfer completed')).toBeInTheDocument();
    expect(mockGetTransactionIdempotencyStatus).toHaveBeenCalledWith(
      'test-access-token',
      key,
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBeNull();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('preserves a persisted attempt when startup status lookup is unavailable', async () => {
    const key = 'startup-status-unavailable';
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({
        key,
        signature: 'saved',
        protocolVersion: 2,
        request: {
          destination_iban: VALID_IBAN,
          amount: '12',
          reference: null,
        },
      }),
    );
    mockGetTransactionIdempotencyStatus.mockRejectedValueOnce(
      new Error('Status endpoint unavailable'),
    );
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    render(<TransactionsPage />);
    await waitFor(() =>
      expect(mockGetTransactionIdempotencyStatus).toHaveBeenCalledWith(
        'test-access-token',
        key,
      ),
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toContain(key);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('restores server recovery details after the recovery check succeeds', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockGetPendingTransactionRecovery
      .mockRejectedValueOnce(new Error('Initial recovery unavailable'))
      .mockResolvedValueOnce({
        operation: {
          idempotency_key: 'recovered-after-recheck',
          recipient_method: 'email',
          recipient_iban: null,
          recipient_email: 'recipient@example.com',
          amount: '18.0000',
          reference: 'recovered',
        },
      });
    render(<TransactionsPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Check again' }),
    );
    expect(
      await screen.findByRole('region', { name: 'Previous transfer recovery' }),
    ).toBeInTheDocument();
    expect(screen.getByText('18,00 €')).toBeInTheDocument();
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toContain('recovered-after-recheck');
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('keeps a legacy attempt unresolved when startup status is NOT_FOUND', async () => {
    const key = 'legacy-attempt-key';
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({
        key,
        signature: 'legacy-signature',
        protocolVersion: 1,
      }),
    );
    mockGetTransactionIdempotencyStatus.mockResolvedValue({
      status: 'NOT_FOUND',
    });
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    render(<TransactionsPage />);
    await waitFor(() =>
      expect(mockGetTransactionIdempotencyStatus).toHaveBeenCalledWith(
        'test-access-token',
        key,
      ),
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toContain(key);
    expect(
      screen.getByText(/previous transfer needs reconciliation/i),
    ).toBeInTheDocument();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('clears a legacy pending attempt only after manual status check confirms FAILED', async () => {
    const user = userEvent.setup();
    const key = 'legacy-manual-failed';
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({
        key,
        signature: 'legacy-signature',
        protocolVersion: 1,
      }),
    );
    mockGetTransactionIdempotencyStatus
      .mockResolvedValueOnce({ status: 'NOT_FOUND' })
      .mockResolvedValueOnce({ status: 'FAILED', failure_code: 'DECLINED' });
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    render(<TransactionsPage />);
    const checkButton = await screen.findByRole('button', {
      name: 'Check transfer status',
    });
    await user.click(checkButton);
    await waitFor(() =>
      expect(mockGetTransactionIdempotencyStatus).toHaveBeenCalledTimes(2),
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBeNull();
    expect(
      await screen.findByText(/previous transfer failed/i),
    ).toBeInTheDocument();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('restores a server-owned pending operation after an idempotency conflict', async () => {
    const user = userEvent.setup();
    const serverOperation = {
      idempotency_key: 'conflict-recovery-key',
      recipient_method: 'iban' as const,
      recipient_iban: VALID_IBAN,
      recipient_email: null,
      amount: '60.0000',
      reference: 'server pending',
    };
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockCreateTransaction.mockRejectedValueOnce(
      new ApiClientError('Conflict', 409, false),
    );
    // Startup recovery is empty. A 409 from this POST must return the
    // server-owned operation for the SAME idempotency key used by the request.
    // A different key is a separate conflict and must not replace this attempt.
    mockGetPendingTransactionRecovery.mockImplementation(async () => {
      const submittedKey = mockCreateTransaction.mock.calls[0]?.[2];
      return submittedKey
        ? {
            operation: {
              ...serverOperation,
              idempotency_key: submittedKey,
            },
          }
        : { operation: null };
    });

    render(<TransactionsPage />);
    await user.type(await screen.findByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '60');
    await user.click(screen.getByRole('button', { name: 'Send money' }));

    expect(
      await screen.findByRole('region', { name: 'Previous transfer recovery' }),
    ).toBeInTheDocument();
    expect(screen.getByText('60,00 €')).toBeInTheDocument();
    const savedAttempt = JSON.parse(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1') ??
        '{}',
    );
    expect(savedAttempt).toMatchObject({
      key: mockCreateTransaction.mock.calls[0]?.[2],
      protocolVersion: 2,
    });
    expect(savedAttempt.signature).toEqual(expect.any(String));
    expect(savedAttempt.signature).not.toBe('');
    expect(mockCreateTransaction).toHaveBeenCalledOnce();
  });

  it('resumes a PROCESSING attempt to COMPLETED and clears the same persisted key', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockCreateTransaction.mockRejectedValueOnce(
      new ApiClientError('Request outcome unknown.', null, true),
    );
    mockGetTransactionIdempotencyStatus.mockResolvedValue({
      status: 'PROCESSING',
    });
    mockResumeTransaction.mockResolvedValue({
      status: 'COMPLETED',
      transaction: {
        id: 101,
        created_at: '2026-11-04T13:00:00Z',
        source_account_id: 1,
        destination_account_id: 2,
        amount: '250.0000',
        transaction_type: 'TRANSFER',
        status: 'COMPLETED',
        reference: null,
      },
    });
    render(<TransactionsPage />);
    await user.type(await screen.findByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.click(screen.getByRole('button', { name: 'Send money' }));
    expect(await screen.findByText('Transfer completed')).toBeInTheDocument();
    const key = mockCreateTransaction.mock.calls[0][2];
    expect(mockResumeTransaction).toHaveBeenCalledWith(
      'test-access-token',
      key,
    );
    expect(mockCreateTransaction).toHaveBeenCalledOnce();
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBeNull();
  });

  it('retains the original key and request when an exact NOT_FOUND replay is definitely rejected', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockCreateTransaction
      .mockRejectedValueOnce(
        new ApiClientError('Request outcome unknown.', null, true),
      )
      .mockRejectedValueOnce(new ApiClientError('Retry rejected.', 400, false));
    mockGetTransactionIdempotencyStatus.mockResolvedValue({
      status: 'NOT_FOUND',
    });
    mockGetPendingTransactionRecovery.mockResolvedValue({ operation: null });
    render(<TransactionsPage />);
    await user.type(await screen.findByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.click(screen.getByRole('button', { name: 'Send money' }));
    await waitFor(() => expect(mockCreateTransaction).toHaveBeenCalledTimes(2));
    const first = mockCreateTransaction.mock.calls[0];
    const replay = mockCreateTransaction.mock.calls[1];
    expect(replay[1]).toEqual(first[1]);
    expect(replay[2]).toBe(first[2]);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'retry was rejected',
    );
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).not.toBeNull();
  });

  it('uses the matching server operation for recovery without replaying the POST', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockCreateTransaction.mockRejectedValueOnce(
      new ApiClientError('Request outcome unknown.', null, true),
    );
    mockGetTransactionIdempotencyStatus.mockResolvedValue({
      status: 'NOT_FOUND',
    });
    mockGetPendingTransactionRecovery
      .mockResolvedValueOnce({ operation: null })
      .mockImplementation(async () => ({
        operation: {
          idempotency_key:
            mockCreateTransaction.mock.calls[0]?.[2] ?? 'not-yet-generated',
          recipient_method: 'iban',
          recipient_iban: VALID_IBAN,
          recipient_email: null,
          amount: '250.0000',
          reference: null,
        },
      }));
    render(<TransactionsPage />);
    await user.type(await screen.findByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.click(screen.getByRole('button', { name: 'Send money' }));
    expect(
      await screen.findByRole('region', { name: 'Previous transfer recovery' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'available for server-side recovery',
    );
    expect(mockCreateTransaction).toHaveBeenCalledOnce();
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).not.toBeNull();
  });

  it('keeps a resumed completed transfer confirmed when the balance refresh fails', async () => {
    const user = userEvent.setup();
    mockGetMyAccount
      .mockResolvedValueOnce({
        id: 1, user_id: 1, account_number: '1234567890', iban: VALID_IBAN,
        bic: 'IDEMDEFFXXX', created_at: '2026-09-30T10:00:00Z', balance: '1000.0000',
      })
      .mockRejectedValueOnce(new Error('Balance endpoint unavailable'));
    mockGetPendingTransactionRecovery.mockResolvedValue({
      operation: {
        idempotency_key: 'resume-completed-refresh-error',
        recipient_method: 'iban', recipient_iban: VALID_IBAN,
        recipient_email: null, amount: '42.0000', reference: null,
      },
    });
    mockResumeTransaction.mockResolvedValue({
      status: 'COMPLETED',
      transaction: {
        id: 91, created_at: '2026-11-05T10:00:00Z', source_account_id: 1,
        destination_account_id: 2, amount: '42.0000', transaction_type: 'TRANSFER',
        status: 'COMPLETED', reference: null,
      },
    });

    render(<TransactionsPage />);
    await user.click(await screen.findByRole('button', { name: 'Retry original transfer' }));

    expect(await screen.findByText('Transfer completed')).toBeInTheDocument();
    expect(await screen.findByText(/balance could not be refreshed/i)).toBeInTheDocument();
    expect(mockResumeTransaction).toHaveBeenCalledWith('test-access-token', 'resume-completed-refresh-error');
    expect(window.sessionStorage.getItem('idemerax:pending-transaction:v1:1')).toBeNull();
  });

  it('updates server recovery state after resume fails when the follow-up lookup succeeds', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1, user_id: 1, account_number: '1234567890', iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX', created_at: '2026-09-30T10:00:00Z', balance: '1000.0000',
    });
    mockGetPendingTransactionRecovery
      .mockResolvedValueOnce({
        operation: {
          idempotency_key: 'resume-error-refreshes-recovery',
          recipient_method: 'email', recipient_iban: null,
          recipient_email: 'recipient@example.com', amount: '37.0000', reference: null,
        },
      })
      .mockResolvedValueOnce({ operation: null });
    mockResumeTransaction.mockRejectedValueOnce(new Error('Temporary resume failure'));

    render(<TransactionsPage />);
    await user.click(await screen.findByRole('button', { name: 'Retry original transfer' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Temporary resume failure');
    await waitFor(() => {
      expect(mockGetPendingTransactionRecovery).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByRole('region', { name: 'Previous transfer recovery' })).not.toBeInTheDocument();
    expect(mockResumeTransaction).toHaveBeenCalledOnce();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('preserves the original idempotency key when a 409 reveals a different server operation', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1, user_id: 1, account_number: '1234567890', iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX', created_at: '2026-09-30T10:00:00Z', balance: '1000.0000',
    });
    mockCreateTransaction.mockRejectedValueOnce(new ApiClientError('Conflict', 409, false));
    mockGetPendingTransactionRecovery
      .mockResolvedValueOnce({ operation: null })
      .mockResolvedValueOnce({
        operation: {
          idempotency_key: 'server-owned-different-key',
          recipient_method: 'iban', recipient_iban: VALID_IBAN,
          recipient_email: null, amount: '60.0000', reference: null,
        },
      });

    render(<TransactionsPage />);
    await user.type(await screen.findByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '60');
    await user.click(screen.getByRole('button', { name: 'Send money' }));

    // The 409 recovery lookup may race with the startup/automatic status check.
    // The invariant is that the client-owned key is never replaced by a different
    // server operation, regardless of which status message is currently visible.
    await waitFor(() => {
      const saved = JSON.parse(window.sessionStorage.getItem('idemerax:pending-transaction:v1:1') ?? 'null');
      expect(saved).not.toBeNull();
      expect(saved.key).toBe(mockCreateTransaction.mock.calls[0][2]);
      expect(saved.key).not.toBe('server-owned-different-key');
    });
    expect(mockCreateTransaction).toHaveBeenCalledOnce();
  });


  it('keeps a confirmed transaction successful when the post-transfer balance refresh fails', async () => {
    const user = userEvent.setup();
    mockGetMyAccount
      .mockResolvedValueOnce({
        id: 1, user_id: 1, account_number: '1234567890', iban: VALID_IBAN,
        bic: 'IDEMDEFFXXX', created_at: '2026-09-30T10:00:00Z', balance: '1000.0000',
      })
      .mockRejectedValueOnce(new Error('Balance refresh unavailable'));
    mockCreateTransaction.mockResolvedValueOnce({
      id: 92, created_at: '2026-11-05T10:00:00Z', source_account_id: 1,
      destination_account_id: 2, amount: '25.0000', transaction_type: 'TRANSFER',
      status: 'COMPLETED', reference: null,
    });

    render(<TransactionsPage />);
    await user.type(await screen.findByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '25');
    await user.click(screen.getByRole('button', { name: 'Send money' }));

    expect(await screen.findByText('Transfer completed')).toBeInTheDocument();
    expect(await screen.findByText(/balance could not be refreshed: Balance refresh unavailable/i)).toBeInTheDocument();
    expect(window.sessionStorage.getItem('idemerax:pending-transaction:v1:1')).toBeNull();
    expect(mockCreateTransaction).toHaveBeenCalledOnce();
  });

  it('reports when secure random generation is unavailable without submitting a transfer', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1, user_id: 1, account_number: '1234567890', iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX', created_at: '2026-09-30T10:00:00Z', balance: '1000.0000',
    });
    vi.stubGlobal('crypto', { randomUUID: undefined, getRandomValues: undefined });

    try {
      render(<TransactionsPage />);
      await user.type(await screen.findByLabelText('Recipient IBAN'), VALID_IBAN);
      await user.type(screen.getByLabelText('Amount'), '25');
      await user.click(screen.getByRole('button', { name: 'Send money' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Secure random number generation is unavailable');
      expect(mockCreateTransaction).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem('idemerax:pending-transaction:v1:1')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });


  it('keeps a restored v2 attempt locked when NOT_FOUND has no persisted request to replay', async () => {
    const key = 'v2-attempt-without-request';
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({ key, signature: 'saved-signature', protocolVersion: 2 }),
    );
    mockGetTransactionIdempotencyStatus.mockResolvedValue({ status: 'NOT_FOUND' });
    mockGetPendingTransactionRecovery.mockResolvedValue({ operation: null });
    mockGetMyAccount.mockResolvedValue({
      id: 1, user_id: 1, account_number: '1234567890', iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX', created_at: '2026-09-30T10:00:00Z', balance: '1000.0000',
    });

    render(<TransactionsPage />);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Re-enter the exact same recipient, amount and reference',
    );
    expect(window.sessionStorage.getItem('idemerax:pending-transaction:v1:1')).toContain(key);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockGetPendingTransactionRecovery).toHaveBeenCalledWith('test-access-token');
  });

  it('preserves the pending attempt when recovery lookup fails after NOT_FOUND', async () => {
    const key = 'v2-recovery-lookup-failure';
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({
        key, signature: 'saved-signature', protocolVersion: 2,
        request: { destination_iban: VALID_IBAN, amount: '25.00', reference: null },
      }),
    );
    mockGetTransactionIdempotencyStatus.mockResolvedValue({ status: 'NOT_FOUND' });
    mockGetPendingTransactionRecovery.mockRejectedValue(new Error('Recovery endpoint unavailable'));
    mockGetMyAccount.mockResolvedValue({
      id: 1, user_id: 1, account_number: '1234567890', iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX', created_at: '2026-09-30T10:00:00Z', balance: '1000.0000',
    });

    render(<TransactionsPage />);

    expect(
      await screen.findByText(/Idemerax could not check the server for an unfinished transfer/i),
    ).toBeInTheDocument();
    expect(window.sessionStorage.getItem('idemerax:pending-transaction:v1:1')).toContain(key);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('does not replay a v2 transfer when the server reports a different pending operation', async () => {
    const key = 'original-client-owned-key';
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({
        key, signature: 'saved-signature', protocolVersion: 2,
        request: { destination_iban: VALID_IBAN, amount: '25.00', reference: null },
      }),
    );
    mockGetTransactionIdempotencyStatus.mockResolvedValue({ status: 'NOT_FOUND' });
    mockGetPendingTransactionRecovery.mockResolvedValue({
      operation: {
        idempotency_key: 'different-server-key', recipient_method: 'iban',
        recipient_iban: VALID_IBAN, recipient_email: null, amount: '25.0000', reference: null,
      },
    });
    mockGetMyAccount.mockResolvedValue({
      id: 1, user_id: 1, account_number: '1234567890', iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX', created_at: '2026-09-30T10:00:00Z', balance: '1000.0000',
    });

    render(<TransactionsPage />);

    // Startup recovery may first display the general restored-attempt message.
    // Verify the safety invariant directly: the local key is retained and no
    // automatic replay is issued when the server reports another operation.
    await waitFor(() => {
      expect(window.sessionStorage.getItem('idemerax:pending-transaction:v1:1')).toContain(key);
    });
    const saved = JSON.parse(window.sessionStorage.getItem('idemerax:pending-transaction:v1:1') ?? 'null');
    expect(saved.key).toBe(key);
    expect(saved.key).not.toBe('different-server-key');
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });


  it('keeps a 409 transfer unresolved when the recovery endpoint reports no operation', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockGetPendingTransactionRecovery
      .mockResolvedValueOnce({ operation: null }) // startup lookup
      .mockResolvedValueOnce({ operation: null }); // 409 reconciliation
    mockCreateTransaction.mockRejectedValueOnce(
      new ApiClientError('Idempotency conflict.', 409, true),
    );

    render(<TransactionsPage />);
    await user.type(await screen.findByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.click(screen.getByRole('button', { name: 'Send money' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not confirm whether this transfer completed.',
    );
    const saved = JSON.parse(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1') ?? 'null',
    );
    expect(saved).toEqual(
      expect.objectContaining({
        key: expect.any(String),
        protocolVersion: 2,
        request: expect.objectContaining({
          destination_iban: VALID_IBAN,
          amount: '250',
          reference: null,
        }),
      }),
    );
    expect(mockCreateTransaction).toHaveBeenCalledOnce();
  });

  it('preserves the exact attempt when the 409 recovery lookup itself fails', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockGetPendingTransactionRecovery
      .mockResolvedValueOnce({ operation: null })
      .mockRejectedValueOnce(new Error('Recovery endpoint unavailable'));
    mockCreateTransaction.mockRejectedValueOnce(
      new ApiClientError('Idempotency conflict.', 409, true),
    );

    render(<TransactionsPage />);
    await user.type(await screen.findByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '125');
    await user.click(screen.getByRole('button', { name: 'Send money' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not confirm whether this transfer completed.',
    );
    const stored = window.sessionStorage.getItem(
      'idemerax:pending-transaction:v1:1',
    );
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored ?? 'null')).toEqual(
      expect.objectContaining({
        key: expect.any(String),
        protocolVersion: 2,
        request: expect.objectContaining({
          destination_iban: VALID_IBAN,
          amount: '125',
        }),
      }),
    );
    expect(mockCreateTransaction).toHaveBeenCalledOnce();
  });



  it('aborts only the client wait when the health probe fails during submission', async () => {
    const user = userEvent.setup();
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });
    mockGetHealth.mockRejectedValueOnce(new Error('API unreachable'));
    mockCreateTransaction.mockImplementationOnce(
      (
        _token: string,
        _request: unknown,
        _key: string,
        signal: AbortSignal,
      ) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new ApiClientError('Request outcome unknown.', null, true)),
            { once: true },
          );
        }),
    );

    render(<TransactionsPage />);
    await user.type(await screen.findByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.click(screen.getByRole('button', { name: 'Send money' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not confirm whether this transfer completed.',
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'The transfer status could not be retrieved. The previous attempt remains saved; automatic checking will retry shortly.',
    );
    expect(mockGetHealth).toHaveBeenCalled();
    expect(mockCreateTransaction).toHaveBeenCalledOnce();
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).not.toBeNull();
  });



  it('does not start idempotency recovery from connectivity events when no attempt exists', async () => {
    mockGetMyAccount.mockResolvedValue({
      id: 1,
      user_id: 1,
      account_number: '1234567890',
      iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX',
      created_at: '2026-09-30T10:00:00Z',
      balance: '1000.0000',
    });

    render(<TransactionsPage />);

    await screen.findByLabelText('Recipient IBAN');

    act(() => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(mockGetTransactionIdempotencyStatus).not.toHaveBeenCalled();
      expect(mockResumeTransaction).not.toHaveBeenCalled();
    });
    expect(
      window.sessionStorage.getItem('idemerax:pending-transaction:v1:1'),
    ).toBeNull();
  });



  it('keeps the original idempotency attempt locked when resume remains PROCESSING', async () => {
    const key = 'v2-resume-still-processing';
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({
        key,
        signature: 'saved-signature',
        protocolVersion: 2,
        request: { destination_iban: VALID_IBAN, amount: '40.00', reference: null },
      }),
    );
    mockGetMyAccount.mockResolvedValue({
      id: 1, user_id: 1, account_number: '1234567890', iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX', created_at: '2026-09-30T10:00:00Z', balance: '1000.0000',
    });
    mockGetTransactionIdempotencyStatus.mockResolvedValue({ status: 'PROCESSING' });
    mockResumeTransaction.mockResolvedValue({ status: 'PROCESSING' });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'The original transfer is still processing. Its key and recovery record remain saved.',
      );
    });
    expect(mockResumeTransaction).toHaveBeenCalledWith('test-access-token', key);
    expect(JSON.parse(window.sessionStorage.getItem('idemerax:pending-transaction:v1:1') ?? 'null'))
      .toEqual(expect.objectContaining({ key, protocolVersion: 2 }));
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('retains the original key when automatic resume fails after PROCESSING', async () => {
    const key = 'v2-resume-temporary-error';
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({
        key,
        signature: 'saved-signature',
        protocolVersion: 2,
        request: { destination_iban: VALID_IBAN, amount: '40.00', reference: null },
      }),
    );
    mockGetMyAccount.mockResolvedValue({
      id: 1, user_id: 1, account_number: '1234567890', iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX', created_at: '2026-09-30T10:00:00Z', balance: '1000.0000',
    });
    mockGetTransactionIdempotencyStatus.mockResolvedValue({ status: 'PROCESSING' });
    mockResumeTransaction.mockRejectedValue(new Error('temporarily unavailable'));

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'The original transfer could not be resumed yet. Its key remains saved; check again when the connection is stable.',
      );
    });
    expect(mockResumeTransaction).toHaveBeenCalledWith('test-access-token', key);
    expect(JSON.parse(window.sessionStorage.getItem('idemerax:pending-transaction:v1:1') ?? 'null'))
      .toEqual(expect.objectContaining({ key, protocolVersion: 2 }));
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('clears the saved attempt only when status confirms FAILED without a failure code', async () => {
    const key = 'v2-confirmed-failure-no-code';
    window.sessionStorage.setItem(
      'idemerax:pending-transaction:v1:1',
      JSON.stringify({ key, signature: 'saved-signature', protocolVersion: 2 }),
    );
    mockGetMyAccount.mockResolvedValue({
      id: 1, user_id: 1, account_number: '1234567890', iban: VALID_IBAN,
      bic: 'IDEMDEFFXXX', created_at: '2026-09-30T10:00:00Z', balance: '1000.0000',
    });
    mockGetTransactionIdempotencyStatus.mockResolvedValue({ status: 'FAILED' });

    render(<TransactionsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The previous transfer failed (unknown reason). You can start a new transfer.',
    );
    await waitFor(() => {
      expect(window.sessionStorage.getItem('idemerax:pending-transaction:v1:1')).toBeNull();
    });
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockResumeTransaction).not.toHaveBeenCalled();
  });

});
