import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import userEvent from '@testing-library/user-event';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getIbanBankDetails } from '../../../src/features/transactions/api/transactions';

import TransactionForm from '../../../src/features/transactions/components/TransactionForm';

vi.mock('../../../src/features/transactions/api/transactions', () => ({
  getIbanBankDetails: vi.fn(),
}));

const VALID_IBAN = 'DE89370400440532013000';

function renderTransactionForm(
  overrides: Partial<React.ComponentProps<typeof TransactionForm>> = {},
) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);

  const { accessToken = 'test-access-token', ...remainingOverrides } =
    overrides;

  const props: React.ComponentProps<typeof TransactionForm> = {
    accessToken,
    isSubmitting: false,
    error: null,
    onSubmit,
    availableBalance: '1000.0000',
    isLoadingBalance: false,
    ...remainingOverrides,
  };

  return {
    ...render(<TransactionForm {...props} />),
    onSubmit,
  };
}

describe('TransactionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getIbanBankDetails).mockResolvedValue({
      bank_code: '12345678',
      bank_name: 'Idemerax',
      bic: 'IDEMDEFFXXX',
    });
  });

  it('renders the transfer form', () => {
    renderTransactionForm();

    expect(
      screen.getByRole('heading', { name: 'New transfer' }),
    ).toBeInTheDocument();

    expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();
    expect(screen.getByLabelText('Reference (optional)')).toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: 'Send money' }),
    ).toBeInTheDocument();
  });

  it('displays the available balance', () => {
    renderTransactionForm({
      availableBalance: '1000.0000',
    });

    expect(screen.getByText('Available balance')).toBeInTheDocument();
    expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
  });

  it('displays a placeholder when the available balance is unavailable', () => {
    renderTransactionForm({
      availableBalance: null,
      isLoadingBalance: false,
    });

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('displays a loading skeleton while the balance is loading', () => {
    renderTransactionForm({
      availableBalance: null,
      isLoadingBalance: true,
    });

    expect(
      screen.getByLabelText('Loading available balance'),
    ).toBeInTheDocument();

    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('formats the IBAN while typing', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    const ibanInput = screen.getByLabelText('Recipient IBAN');

    await user.type(ibanInput, VALID_IBAN);

    expect(ibanInput).toHaveValue('DE89 3704 0044 0532 0130 00');
  });

  it('identifies the bank for a valid Idemerax IBAN', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    await user.type(
      screen.getByLabelText('Recipient IBAN'),
      'DE87123456781234567890',
    );

    expect(await screen.findByText('Idemerax')).toBeInTheDocument();
    expect(screen.getByText('IDEMDEFFXXX')).toBeInTheDocument();
    expect(screen.getByText('Bank identified')).toBeInTheDocument();

    expect(getIbanBankDetails).toHaveBeenCalledWith(
      'test-access-token',
      'DE87123456781234567890',
    );
  });

  it('shows the bank identification loading state', async () => {
    const user = userEvent.setup();

    vi.mocked(getIbanBankDetails).mockImplementation(
      () => new Promise(() => {}),
    );

    renderTransactionForm();

    await user.type(
      screen.getByLabelText('Recipient IBAN'),
      'DE87123456781234567890',
    );

    await waitFor(() => {
      expect(screen.queryByText('Bank identified')).not.toBeInTheDocument();
    });

    expect(screen.queryByText('IDEMDEFFXXX')).not.toBeInTheDocument();
  });

  it('shows an error when the IBAN does not belong to Idemerax', async () => {
    const user = userEvent.setup();

    vi.mocked(getIbanBankDetails).mockRejectedValue(
      new Error('The provided IBAN does not belong to Idemerax.'),
    );

    renderTransactionForm();

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);

    expect(
      await screen.findByText('The provided IBAN does not belong to Idemerax.'),
    ).toBeInTheDocument();

    expect(screen.queryByText('Bank identified')).not.toBeInTheDocument();
  });

  it('does not identify a bank when no access token is available', async () => {
    const user = userEvent.setup();

    renderTransactionForm({
      accessToken: null,
    });

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);

    expect(getIbanBankDetails).not.toHaveBeenCalled();
  });

  it('renders the recipient method options', () => {
    renderTransactionForm();

    expect(
      screen.getByRole('group', { name: 'Recipient method' }),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'IBAN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Email' })).toBeInTheDocument();
  });

  it('switches to email recipient method', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    await user.click(screen.getByRole('button', { name: 'Email' }));

    expect(screen.getByLabelText('Recipient email')).toBeInTheDocument();
    expect(screen.queryByLabelText('Recipient IBAN')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Email' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('accepts a valid recipient email', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    await user.click(screen.getByRole('button', { name: 'Email' }));

    await user.type(
      screen.getByLabelText('Recipient email'),
      'recipient@example.com',
    );

    expect(
      screen.getByText(
        'Enter the email address associated with the recipient account.',
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Send money' })).toBeDisabled();

    await user.type(screen.getByLabelText('Amount'), '250');

    expect(screen.getByRole('button', { name: 'Send money' })).toBeEnabled();
  });

  it('rejects an invalid recipient email', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    await user.click(screen.getByRole('button', { name: 'Email' }));

    await user.type(screen.getByLabelText('Recipient email'), 'invalid-email');

    expect(
      screen.getByText('Enter a valid recipient email address.'),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Amount'), '250');

    expect(screen.getByRole('button', { name: 'Send money' })).toBeDisabled();
  });

  it('keeps the submit button disabled until the email recipient and amount are valid', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    await user.click(screen.getByRole('button', { name: 'Email' }));

    const emailInput = screen.getByLabelText('Recipient email');
    const amountInput = screen.getByLabelText('Amount');
    const submitButton = screen.getByRole('button', {
      name: 'Send money',
    });

    expect(submitButton).toBeDisabled();

    await user.type(emailInput, 'invalid-email');
    await user.type(amountInput, '250');

    expect(submitButton).toBeDisabled();

    await user.clear(emailInput);
    await user.type(emailInput, 'recipient@example.com');

    expect(submitButton).toBeEnabled();
  });

  it('submits a normalized email recipient', async () => {
    const user = userEvent.setup();

    const { onSubmit } = renderTransactionForm();

    await user.click(screen.getByRole('button', { name: 'Email' }));

    await user.type(
      screen.getByLabelText('Recipient email'),
      '  Recipient@Example.COM  ',
    );

    await user.type(screen.getByLabelText('Amount'), '250');

    await user.click(screen.getByRole('button', { name: 'Send money' }));

    expect(onSubmit).toHaveBeenCalledOnce();

    expect(onSubmit).toHaveBeenCalledWith(
      'email',
      'recipient@example.com',
      '250',
      null,
    );
  });

  it('accepts a valid German IBAN', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');

    expect(screen.getByRole('button', { name: 'Send money' })).toBeEnabled();
  });

  it('rejects a non-German IBAN', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    await user.type(
      screen.getByLabelText('Recipient IBAN'),
      'GB82WEST12345698765432',
    );

    expect(
      screen.getByText(
        'Only German IBANs starting with DE are currently supported.',
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Send money' })).toBeDisabled();
    expect(getIbanBankDetails).not.toHaveBeenCalled();
  });

  it('rejects an IBAN that is shorter than the required length', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    await user.type(screen.getByLabelText('Recipient IBAN'), 'DE893704004405');

    expect(screen.getByRole('button', { name: 'Send money' })).toBeDisabled();
    expect(getIbanBankDetails).not.toHaveBeenCalled();
  });

  it('rejects an amount with more than two decimal places', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    await user.type(screen.getByLabelText('Amount'), '100.123');

    expect(
      screen.getByText(
        'Please enter an amount with no more than two decimal places.',
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Send money' })).toBeDisabled();
  });

  it('rejects an amount with multiple decimal separators', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    await user.type(screen.getByLabelText('Amount'), '100,50.25');

    expect(
      screen.getByText('Please enter a valid amount.'),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Send money' })).toBeDisabled();
  });

  it('rejects an amount above the transfer limit', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    await user.type(screen.getByLabelText('Amount'), '100000.01');

    expect(
      screen.getByText('Amount exceeds the transfer limit of €100,000.00.'),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Send money' })).toBeDisabled();
  });

  it('keeps the submit button disabled until the form is valid', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    const ibanInput = screen.getByLabelText('Recipient IBAN');
    const amountInput = screen.getByLabelText('Amount');
    const submitButton = screen.getByRole('button', {
      name: 'Send money',
    });

    expect(submitButton).toBeDisabled();

    await user.type(ibanInput, VALID_IBAN);

    expect(submitButton).toBeDisabled();

    await user.type(amountInput, '250');

    expect(submitButton).toBeEnabled();
  });

  it('submits the normalized IBAN, amount, and null reference when empty', async () => {
    const user = userEvent.setup();

    const { onSubmit } = renderTransactionForm();

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250,50');

    await user.click(screen.getByRole('button', { name: 'Send money' }));

    expect(onSubmit).toHaveBeenCalledOnce();

    expect(onSubmit).toHaveBeenCalledWith('iban', VALID_IBAN, '250.50', null);
  });

  it('trims the transaction reference before submitting', async () => {
    const user = userEvent.setup();

    const { onSubmit } = renderTransactionForm();

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.type(screen.getByLabelText('Reference (optional)'), '  Rent  ');

    await user.click(screen.getByRole('button', { name: 'Send money' }));

    expect(onSubmit).toHaveBeenCalledWith('iban', VALID_IBAN, '250', 'Rent');
  });

  it('sanitizes unsupported characters from the amount input', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    const amountInput = screen.getByLabelText('Amount');

    await user.type(amountInput, 'abc250xyz');

    expect(amountInput).toHaveValue('250');
  });

  it('shows the processing state while submitting', () => {
    renderTransactionForm({
      isSubmitting: true,
    });

    expect(
      screen.getByRole('button', {
        name: 'Processing transfer...',
      }),
    ).toBeDisabled();
  });

  it('displays a transaction error', () => {
    renderTransactionForm({
      error: 'Unable to process transaction.',
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to process transaction.',
    );
  });

  it('does not submit an invalid form', async () => {
    const user = userEvent.setup();

    const { onSubmit } = renderTransactionForm();

    await user.type(screen.getByLabelText('Recipient IBAN'), 'DE893704004405');

    await user.type(screen.getByLabelText('Amount'), '250');

    expect(screen.getByRole('button', { name: 'Send money' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit when the form is submitted while invalid', () => {
    const { onSubmit } = renderTransactionForm();

    const form = screen
      .getByRole('button', { name: 'Send money' })
      .closest('form');

    expect(form).not.toBeNull();

    fireEvent.submit(form!);

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
