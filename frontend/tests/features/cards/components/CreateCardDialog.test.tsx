import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CreateCardDialog from '../../../../src/features/cards/components/CreateCardDialog';
import type { Account } from '../../../../src/features/accounts/api/accounts';
import type { ManagedCard } from '../../../../src/features/cards/api/cards';

const accounts: Account[] = [
  {
    id: 7,
    user_id: 1,
    account_number: '1234567890',
    iban: 'DE89370400440532013000',
    bic: 'IDEMDEFFXXX',
    created_at: '2026-10-01T10:00:00Z',
    balance: '100.0000',
  },
  {
    id: 8,
    user_id: 1,
    account_number: '9876543210',
    iban: 'DE12500105170648489890',
    bic: 'IDEMDEFFXXX',
    created_at: '2026-10-02T10:00:00Z',
    balance: '250.5000',
  },
];

const defaultProps = {
  accounts,
  cards: [] as ManagedCard[],
  isSubmitting: false,
  error: null as string | null,
  onClose: vi.fn(),
  onCreate: vi.fn().mockResolvedValue(undefined),
};

function createCard(
  id: number,
  accountId: number,
  status: ManagedCard['status'] = 'ACTIVE',
): ManagedCard {
  const account = accounts.find((item) => item.id === accountId);

  if (!account) {
    throw new Error(`Account ${accountId} does not exist in the test data.`);
  }

  return {
    id,
    account_id: accountId,
    card_type: 'VIRTUAL_DEBIT',
    last_four: String(4000 + id).slice(-4),
    status,
    created_at: '2026-10-16T08:30:00Z',
    closed_at: status === 'CLOSED' ? '2026-10-17T10:00:00Z' : null,
    account: {
      id: account.id,
      account_number: account.account_number,
      iban: account.iban,
      bic: account.bic,
      balance: account.balance,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  defaultProps.onCreate.mockResolvedValue(undefined);
});

describe('CreateCardDialog', () => {
  it('selects the first account by default and displays account details', () => {
    render(<CreateCardDialog {...defaultProps} />);

    expect(
      screen.getByRole('radio', {
        name: /Idemerax account ···· 7890/,
      }),
    ).toBeChecked();

    expect(screen.getByText(/DE89 3704 0044 0532 0130 00/)).toBeInTheDocument();

    expect(screen.getByText(/€100\.00/)).toBeInTheDocument();
    expect(screen.getByText(/€250\.50/)).toBeInTheDocument();
  });

  it('submits the selected account ID', async () => {
    render(<CreateCardDialog {...defaultProps} />);

    fireEvent.click(
      screen.getByRole('radio', {
        name: /Idemerax account ···· 3210/,
      }),
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Create virtual card',
      }),
    );

    await waitFor(() => {
      expect(defaultProps.onCreate).toHaveBeenCalledWith(8);
    });
  });

  it('does not submit when no account is available', () => {
    render(<CreateCardDialog {...defaultProps} accounts={[]} />);

    expect(
      screen.getByText(/No financial account is available/),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('button', {
        name: 'Create virtual card',
      }),
    ).toBeDisabled();

    expect(defaultProps.onCreate).not.toHaveBeenCalled();
  });

  it('does not call onCreate if the form is submitted without a selected account', () => {
    render(<CreateCardDialog {...defaultProps} accounts={[]} />);

    const form = screen.getByRole('dialog').querySelector('form');

    if (!form) {
      throw new Error('Expected the create-card form to exist.');
    }

    fireEvent.submit(form);

    expect(defaultProps.onCreate).not.toHaveBeenCalled();
  });

  it('displays a supplied creation error', () => {
    render(<CreateCardDialog {...defaultProps} error="Card limit reached." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Card limit reached.');
  });

  it('disables form controls and shows progress while submitting', () => {
    render(<CreateCardDialog {...defaultProps} isSubmitting />);

    expect(
      screen.getByRole('button', {
        name: 'Creating card…',
      }),
    ).toBeDisabled();

    expect(
      screen.getByRole('button', {
        name: 'Cancel',
      }),
    ).toBeDisabled();

    expect(
      screen.getByRole('button', {
        name: 'Close create card dialog',
      }),
    ).toBeDisabled();

    expect(
      screen.getByRole('radio', {
        name: /Idemerax account ···· 7890/,
      }),
    ).toBeDisabled();
  });

  it('closes when the close or cancel button is clicked', () => {
    render(<CreateCardDialog {...defaultProps} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Close create card dialog',
      }),
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Cancel',
      }),
    );

    expect(defaultProps.onClose).toHaveBeenCalledTimes(2);
  });

  it('closes when the backdrop is clicked, but not when dialog content is clicked', () => {
    render(<CreateCardDialog {...defaultProps} />);

    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.parentElement;

    if (!backdrop) {
      throw new Error('Expected dialog backdrop to exist.');
    }

    fireEvent.mouseDown(dialog);

    expect(defaultProps.onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(backdrop);

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close from the backdrop while a submission is in progress', () => {
    render(<CreateCardDialog {...defaultProps} isSubmitting />);

    const backdrop = screen.getByRole('dialog').parentElement;

    if (!backdrop) {
      throw new Error('Expected dialog backdrop to exist.');
    }

    fireEvent.mouseDown(backdrop);

    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('disables card creation when the selected account has three active cards', () => {
    const cards = [
      createCard(1, 7, 'ACTIVE'),
      createCard(2, 7, 'ACTIVE'),
      createCard(3, 7, 'ACTIVE'),
    ];

    render(<CreateCardDialog {...defaultProps} cards={cards} />);

    expect(
      screen.getByRole('button', {
        name: 'Active card limit reached',
      }),
    ).toBeDisabled();

    expect(
      screen.getByText(/3 of 3 active cards used on this account/),
    ).toBeInTheDocument();

    expect(screen.getByText(/Limit reached/)).toBeInTheDocument();

    expect(defaultProps.onCreate).not.toHaveBeenCalled();
  });

  it('allows selecting another account when the first account has reached its active-card limit', async () => {
    const cards = [
      createCard(1, 7, 'ACTIVE'),
      createCard(2, 7, 'ACTIVE'),
      createCard(3, 7, 'ACTIVE'),
    ];

    render(<CreateCardDialog {...defaultProps} cards={cards} />);

    expect(
      screen.getByRole('button', {
        name: 'Active card limit reached',
      }),
    ).toBeDisabled();

    fireEvent.click(
      screen.getByRole('radio', {
        name: /Idemerax account ···· 3210/,
      }),
    );

    expect(
      screen.getByRole('button', {
        name: 'Create virtual card',
      }),
    ).toBeEnabled();

    expect(
      screen.getByText(/0 of 3 active cards used on this account/),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Create virtual card',
      }),
    );

    await waitFor(() => {
      expect(defaultProps.onCreate).toHaveBeenCalledWith(8);
    });
  });

  it('does not count inactive or closed cards toward the active-card limit', () => {
    const cards = [
      createCard(1, 7, 'ACTIVE'),
      createCard(2, 7, 'INACTIVE'),
      createCard(3, 7, 'CLOSED'),
    ];

    render(<CreateCardDialog {...defaultProps} cards={cards} />);

    expect(
      screen.getByRole('button', {
        name: 'Create virtual card',
      }),
    ).toBeEnabled();

    expect(
      screen.getByText(/1 of 3 active cards used on this account/),
    ).toBeInTheDocument();
  });

  it('keeps the selected account unchanged when a different account is not selected', () => {
    render(<CreateCardDialog {...defaultProps} />);

    expect(
      screen.getByRole('radio', {
        name: /Idemerax account ···· 7890/,
      }),
    ).toBeChecked();

    expect(
      screen.getByRole('radio', {
        name: /Idemerax account ···· 3210/,
      }),
    ).not.toBeChecked();

    expect(
      screen.getByRole('button', {
        name: 'Create virtual card',
      }),
    ).toBeEnabled();
  });
});
