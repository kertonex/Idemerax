import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetMyAccount,
  mockCreateTransaction,
  mockGetIbanBankDetails,
  mockUseAuth,
} = vi.hoisted(() => ({
  mockGetMyAccount: vi.fn(),
  mockCreateTransaction: vi.fn(),
  mockGetIbanBankDetails: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock('../../src/features/accounts/api/accounts', () => ({
  getMyAccount: mockGetMyAccount,
}));

vi.mock('../../src/features/transactions/api/transactions', () => ({
  createTransaction: mockCreateTransaction,
  getIbanBankDetails: mockGetIbanBankDetails,
}));

vi.mock('../../src/features/authentication/context/useAuth', () => ({
  useAuth: mockUseAuth,
}));

import TransactionsPage from '../../src/pages/TransactionsPage';

const VALID_IBAN = 'DE89370400440532013000';

describe('TransactionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAuth.mockReturnValue({
      accessToken: 'test-access-token',
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
      screen.getByLabelText('Loading available balance'),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
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
    });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);

    await user.type(screen.getByLabelText('Amount'), '250');

    await user.click(screen.getByRole('button', { name: 'Send money' }));

    await waitFor(() => {
      expect(mockCreateTransaction).toHaveBeenCalledWith('test-access-token', {
        destination_iban: VALID_IBAN,
        amount: '250',
      });
    });

    expect(mockGetMyAccount).toHaveBeenCalledTimes(2);

    await waitFor(() => {
      expect(screen.getByText('750,00 €')).toBeInTheDocument();
    });

    expect(screen.getByText('Transfer completed')).toBeInTheDocument();

    expect(screen.getByText('250,00 €')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
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
    });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
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
});
