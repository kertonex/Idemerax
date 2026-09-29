import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AccountCard from '../../../src/features/accounts/components/AccountCard';
import type { Account } from '../../../src/features/accounts/api/accounts';

const account: Account = {
  id: 1,
  user_id: 42,
  account_number: '1234567890',
  iban: 'DE31123456781234567890',
  balance: '1250.5000',
  bic: 'IDEMDEFFXXX',
  created_at: '2026-09-28T14:07:00+00:00',
};

function renderAccountCard(overrides: Partial<Account> = {}) {
  return render(<AccountCard account={{ ...account, ...overrides }} />);
}

describe('AccountCard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('displays the account information', () => {
    renderAccountCard();

    expect(
      screen.getByRole('heading', { name: 'Your Financial Account' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1.250,50 €')).toBeInTheDocument();
    expect(screen.getByText('EUR')).toBeInTheDocument();
    expect(screen.getByText('EUR - Euro')).toBeInTheDocument();
    expect(screen.getAllByText('Active')).toHaveLength(2);
  });

  it('formats and displays the IBAN', () => {
    renderAccountCard();

    expect(screen.getByText('DE31 1234 5678 1234 5678 90')).toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: 'Copy IBAN' }),
    ).toBeInTheDocument();
  });

  it('copies the IBAN and shows the copied state', async () => {
    const user = userEvent.setup();

    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);

    renderAccountCard();

    await user.click(screen.getByRole('button', { name: 'Copy IBAN' }));

    expect(writeText).toHaveBeenCalledWith('DE31123456781234567890');
    expect(
      screen.getByRole('button', { name: 'IBAN copied' }),
    ).toHaveTextContent('Copied');
  });

  it('displays the BIC', () => {
    renderAccountCard();

    expect(screen.getByText('IDEMDEFFXXX')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy BIC' }),
    ).toBeInTheDocument();
  });

  it('copies the BIC and shows the copied state', async () => {
    const user = userEvent.setup();

    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);

    renderAccountCard();

    await user.click(screen.getByRole('button', { name: 'Copy BIC' }));

    expect(writeText).toHaveBeenCalledWith('IDEMDEFFXXX');
    expect(
      screen.getByRole('button', { name: 'BIC copied' }),
    ).toHaveTextContent('Copied');
  });

  it('displays the account creation date', () => {
    renderAccountCard();

    expect(screen.getByText('Created At')).toBeInTheDocument();
    expect(screen.getByText('28.09.2026')).toBeInTheDocument();
  });

  it('displays Unknown for an invalid account creation date', () => {
    renderAccountCard({
      created_at: 'invalid-date',
    });

    expect(screen.getByText('Created At')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('resets the copied state after two seconds', async () => {
    vi.useFakeTimers();

    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    renderAccountCard();

    await act(async () => {
      screen.getByRole('button', { name: 'Copy IBAN' }).click();
      await Promise.resolve();
    });

    expect(
      screen.getByRole('button', { name: 'IBAN copied' }),
    ).toHaveTextContent('Copied');

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('button', { name: 'Copy IBAN' })).toHaveTextContent(
      'Copy',
    );
  });

  it('keeps the copy state unchanged when copying fails', async () => {
    const user = userEvent.setup();

    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValue(new Error('Clipboard unavailable'));

    renderAccountCard();

    await user.click(screen.getByRole('button', { name: 'Copy IBAN' }));

    expect(writeText).toHaveBeenCalledWith('DE31123456781234567890');
    expect(screen.getByRole('button', { name: 'Copy IBAN' })).toHaveTextContent(
      'Copy',
    );
    expect(
      screen.queryByRole('button', { name: 'IBAN copied' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the BIC copy state unchanged when copying fails', async () => {
    const user = userEvent.setup();

    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValue(new Error('Clipboard unavailable'));

    renderAccountCard();

    await user.click(screen.getByRole('button', { name: 'Copy BIC' }));

    expect(writeText).toHaveBeenCalledWith('IDEMDEFFXXX');
    expect(screen.getByRole('button', { name: 'Copy BIC' })).toHaveTextContent(
      'Copy',
    );
    expect(
      screen.queryByRole('button', { name: 'BIC copied' }),
    ).not.toBeInTheDocument();
  });
});
