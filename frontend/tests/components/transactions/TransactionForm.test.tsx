import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import TransactionForm from '../../../src/features/transactions/components/TransactionForm';

const VALID_IBAN = 'DE89370400440532013000';

function renderTransactionForm(
  overrides: Partial<React.ComponentProps<typeof TransactionForm>> = {},
) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);

  const props: React.ComponentProps<typeof TransactionForm> = {
    isSubmitting: false,
    error: null,
    onSubmit,
    availableBalance: '1000.0000',
    isLoadingBalance: false,
    ...overrides,
  };

  return {
    ...render(<TransactionForm {...props} />),
    onSubmit,
  };
}

describe('TransactionForm', () => {
  it('renders the transfer form', () => {
    renderTransactionForm();

    expect(
      screen.getByRole('heading', { name: 'New transfer' }),
    ).toBeInTheDocument();

    expect(screen.getByLabelText('Recipient IBAN')).toBeInTheDocument();

    expect(screen.getByLabelText('Amount')).toBeInTheDocument();

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

  it('accepts a valid German IBAN', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    const ibanInput = screen.getByLabelText('Recipient IBAN');
    const amountInput = screen.getByLabelText('Amount');

    await user.type(ibanInput, VALID_IBAN);
    await user.type(amountInput, '250');

    expect(screen.getByRole('button', { name: 'Send money' })).toBeEnabled();
  });

  it('rejects a non-German IBAN', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    const ibanInput = screen.getByLabelText('Recipient IBAN');

    await user.type(ibanInput, 'GB82WEST12345698765432');

    expect(
      screen.getByText(
        'Only German IBANs starting with DE are currently supported.',
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Send money' })).toBeDisabled();
  });

  it('rejects an IBAN that is shorter than the required length', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    const ibanInput = screen.getByLabelText('Recipient IBAN');

    await user.type(ibanInput, 'DE893704004405');

    expect(screen.getByRole('button', { name: 'Send money' })).toBeDisabled();
  });

  it('rejects an amount with more than two decimal places', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    const amountInput = screen.getByLabelText('Amount');

    await user.type(amountInput, '100.123');

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

    const amountInput = screen.getByLabelText('Amount');

    await user.type(amountInput, '100,50.25');

    expect(
      screen.getByText('Please enter a valid amount.'),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Send money' })).toBeDisabled();
  });

  it('rejects an amount above the transfer limit', async () => {
    const user = userEvent.setup();

    renderTransactionForm();

    const amountInput = screen.getByLabelText('Amount');

    await user.type(amountInput, '100000.01');

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

  it('submits the normalized IBAN and amount', async () => {
    const user = userEvent.setup();

    const { onSubmit } = renderTransactionForm();

    await user.type(screen.getByLabelText('Recipient IBAN'), VALID_IBAN);

    await user.type(screen.getByLabelText('Amount'), '250,50');

    await user.click(screen.getByRole('button', { name: 'Send money' }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith(VALID_IBAN, '250.50');
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
