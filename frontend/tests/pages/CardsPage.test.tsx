import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Account } from '../../src/features/accounts/api/accounts';
import type { ManagedCard } from '../../src/features/cards/api/cards';
import CardsPage from '../../src/pages/CardsPage';

const {
  mockGetMyAccounts,
  mockGetCards,
  mockCreateCard,
  mockUpdateCardStatus,
  mockCloseCard,
  mockAuth,
} = vi.hoisted(() => ({
  mockGetMyAccounts: vi.fn(),
  mockGetCards: vi.fn(),
  mockCreateCard: vi.fn(),
  mockUpdateCardStatus: vi.fn(),
  mockCloseCard: vi.fn(),
  mockAuth: {
    accessToken: 'test-access-token' as string | null,
    currentUser: {
      id: 1,
      email: 'user@example.com',
      role: 'USER',
      is_active: true,
      first_name: 'Alex',
      last_name: 'Morgan',
      profile_complete: true,
    },
  },
}));

vi.mock('../../src/features/accounts/api/accounts', () => ({
  getMyAccounts: mockGetMyAccounts,
}));

vi.mock('../../src/features/cards/api/cards', () => ({
  getCards: mockGetCards,
  createCard: mockCreateCard,
  updateCardStatus: mockUpdateCardStatus,
  closeCard: mockCloseCard,
}));

vi.mock('../../src/features/authentication/context/useAuth', () => ({
  useAuth: () => mockAuth,
}));

const account: Account = {
  id: 7,
  user_id: 1,
  account_number: '1234567890',
  iban: 'DE89370400440532013000',
  bic: 'IDEMDEFFXXX',
  created_at: '2026-10-01T10:00:00Z',
  balance: '100.0000',
};

const card: ManagedCard = {
  id: 3,
  account_id: account.id,
  card_type: 'VIRTUAL_DEBIT',
  last_four: '4821',
  status: 'ACTIVE',
  created_at: '2026-10-16T08:30:00Z',
  closed_at: null,
  account: {
    id: account.id,
    account_number: account.account_number,
    iban: account.iban,
    bic: account.bic,
    balance: account.balance,
  },
};

function renderCardsPage() {
  return render(
    <MemoryRouter>
      <CardsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();

  mockAuth.accessToken = 'test-access-token';
  mockAuth.currentUser = {
    id: 1,
    email: 'user@example.com',
    role: 'USER',
    is_active: true,
    first_name: 'Alex',
    last_name: 'Morgan',
    profile_complete: true,
  };

  mockGetMyAccounts.mockResolvedValue([account]);
  mockGetCards.mockResolvedValue([]);
  mockCreateCard.mockResolvedValue(card);

  mockUpdateCardStatus.mockImplementation(
    async (_token: string, _cardId: number, request: { status: string }) => ({
      ...card,
      status: request.status,
    }),
  );

  mockCloseCard.mockResolvedValue({
    ...card,
    status: 'CLOSED',
    closed_at: '2026-10-17T10:00:00Z',
  });

  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
});

describe('CardsPage', () => {
  it('shows the empty state and opens the create-card dialog', async () => {
    renderCardsPage();

    expect(await screen.findByText('No cards yet')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Create your first card' }),
    );

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Select a financial account/i)).toBeInTheDocument();
    expect(screen.getByText(/Idemerax account ···· 7890/i)).toBeInTheDocument();
  });

  it('opens the create-card dialog from the page header', async () => {
    renderCardsPage();

    await screen.findByText('No cards yet');

    fireEvent.click(screen.getByRole('button', { name: 'Create card' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('creates a card and renders its details', async () => {
    renderCardsPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Create your first card' }),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Create virtual card' }),
    );

    expect(await screen.findByText('Card details')).toBeInTheDocument();
    expect(screen.getByText('•••• 4821')).toBeInTheDocument();
    expect(screen.getByText('Linked financial account')).toBeInTheDocument();
    expect(screen.getByText('Not a payment instrument')).toBeInTheDocument();

    expect(mockCreateCard).toHaveBeenCalledWith('test-access-token', {
      account_id: 7,
    });
  });

  it('shows an API error when card creation fails and allows retry', async () => {
    mockCreateCard
      .mockRejectedValueOnce(new Error('Unable to create card'))
      .mockResolvedValueOnce(card);

    renderCardsPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Create your first card' }),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Create virtual card' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to create card',
    );

    fireEvent.click(
      screen.getByRole('button', { name: /create virtual card/i }),
    );

    expect(await screen.findByText('Card details')).toBeInTheDocument();
  });

  it('shows a fallback error when card creation fails with a non-Error value', async () => {
    mockCreateCard.mockRejectedValueOnce('unexpected failure');

    renderCardsPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Create your first card' }),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Create virtual card' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to create your card.',
    );
  });

  it('clears the previous creation error when the dialog is reopened', async () => {
    mockCreateCard.mockRejectedValueOnce(new Error('Creation failed'));

    renderCardsPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Create your first card' }),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Create virtual card' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Creation failed',
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Create card' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the loading state while accounts and cards are being loaded', async () => {
    let resolveAccounts!: (value: Account[]) => void;
    let resolveCards!: (value: ManagedCard[]) => void;

    mockGetMyAccounts.mockReturnValue(
      new Promise<Account[]>((resolve) => {
        resolveAccounts = resolve;
      }),
    );

    mockGetCards.mockReturnValue(
      new Promise<ManagedCard[]>((resolve) => {
        resolveCards = resolve;
      }),
    );

    const { container } = renderCardsPage();

    expect(screen.getByText(/Loading your cards/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cards' })).toBeInTheDocument();

    expect(container.querySelector('section')).toHaveAttribute(
      'aria-busy',
      'true',
    );

    await act(async () => {
      resolveAccounts([account]);
      resolveCards([]);
    });

    expect(await screen.findByText('No cards yet')).toBeInTheDocument();
  });

  it('shows a loading error and allows retry', async () => {
    mockGetCards.mockRejectedValueOnce(new Error('Unable to connect to API'));

    renderCardsPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to connect to API',
    );

    expect(screen.getByRole('heading', { name: 'Cards' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('No cards yet')).toBeInTheDocument();
  });

  it('shows a fallback error message for non-Error load failures', async () => {
    mockGetMyAccounts.mockRejectedValueOnce('unexpected failure');

    renderCardsPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load your cards.',
    );
  });

  it('does not request accounts or cards when no access token is available', async () => {
    mockAuth.accessToken = null;

    renderCardsPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You must be signed in to manage cards.',
    );

    expect(mockGetMyAccounts).not.toHaveBeenCalled();
    expect(mockGetCards).not.toHaveBeenCalled();
  });

  it('shows an authentication error when creating a card without an access token', async () => {
    const { rerender } = renderCardsPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Create your first card' }),
    );

    mockAuth.accessToken = null;

    rerender(
      <MemoryRouter>
        <CardsPage />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Create virtual card' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You must be signed in to create a card.',
    );

    expect(mockCreateCard).not.toHaveBeenCalled();
  });

  it('shows fallback values for invalid card dates and account balances', async () => {
    mockGetCards.mockResolvedValueOnce([
      {
        ...card,
        created_at: 'not-a-valid-date',
        account: {
          ...card.account,
          balance: 'not-a-number',
        },
      },
    ]);

    renderCardsPage();

    expect(await screen.findByText('Date unavailable')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('activates and deactivates cards', async () => {
    mockGetCards.mockResolvedValueOnce([card]);

    renderCardsPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Deactivate card' }),
    );

    await waitFor(() => {
      expect(mockUpdateCardStatus).toHaveBeenCalledWith(
        'test-access-token',
        3,
        { status: 'INACTIVE' },
      );
    });

    expect(
      await screen.findByRole('button', { name: 'Activate card' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Activate card' }));

    await waitFor(() => {
      expect(mockUpdateCardStatus).toHaveBeenLastCalledWith(
        'test-access-token',
        3,
        { status: 'ACTIVE' },
      );
    });
  });

  it('shows status update errors without changing the card', async () => {
    mockGetCards.mockResolvedValueOnce([card]);
    mockUpdateCardStatus.mockRejectedValueOnce(new Error('Card not found.'));

    renderCardsPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Deactivate card' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Card not found.',
    );

    expect(
      screen.getByRole('button', { name: 'Deactivate card' }),
    ).toBeInTheDocument();
  });

  it('shows a fallback error when updating card status fails with a non-Error value', async () => {
    mockGetCards.mockResolvedValueOnce([card]);
    mockUpdateCardStatus.mockRejectedValueOnce('unexpected failure');

    renderCardsPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Deactivate card' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to update this card.',
    );
  });

  it('closes a card permanently after confirmation', async () => {
    mockGetCards.mockResolvedValueOnce([card]);

    renderCardsPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Close card permanently' }),
    );

    await waitFor(() => {
      expect(mockCloseCard).toHaveBeenCalledWith('test-access-token', 3);
    });

    expect(await screen.findByText('Permanently closed')).toBeInTheDocument();
    expect(
      screen.getByText(/This card is permanently closed/i),
    ).toBeInTheDocument();
  });

  it('does not close a card when confirmation is declined', async () => {
    mockGetCards.mockResolvedValueOnce([card]);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );

    renderCardsPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Close card permanently' }),
    );

    expect(window.confirm).toHaveBeenCalled();
    expect(mockCloseCard).not.toHaveBeenCalled();
  });

  it('shows a close-card API error', async () => {
    mockGetCards.mockResolvedValueOnce([card]);
    mockCloseCard.mockRejectedValueOnce(new Error('Unable to close card'));

    renderCardsPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Close card permanently' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to close card',
    );
  });

  it('shows a fallback error when closing a card fails with a non-Error value', async () => {
    mockGetCards.mockResolvedValueOnce([card]);
    mockCloseCard.mockRejectedValueOnce('unexpected failure');

    renderCardsPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Close card permanently' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to close this card.',
    );
  });

  it('shows the closed date when a closed card has a valid closed_at value', async () => {
    mockGetCards.mockResolvedValueOnce([
      {
        ...card,
        status: 'CLOSED',
        closed_at: '2026-10-17T10:00:00Z',
      },
    ]);

    renderCardsPage();

    expect(
      await screen.findByText(/Closed on 17 Oct 2026/i),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole('button', { name: 'Close card permanently' }),
    ).not.toBeInTheDocument();
  });

  it('shows the closed-card message without a date when closed_at is null', async () => {
    mockGetCards.mockResolvedValueOnce([
      {
        ...card,
        status: 'CLOSED',
        closed_at: null,
      },
    ]);

    renderCardsPage();

    expect(
      await screen.findByText(/This card is permanently closed/i),
    ).toBeInTheDocument();

    expect(screen.queryByText(/Closed on/i)).not.toBeInTheDocument();
  });

  it('renders inactive cards with the deactivated status and allows activation', async () => {
    mockGetCards.mockResolvedValueOnce([
      {
        ...card,
        status: 'INACTIVE',
      },
    ]);

    renderCardsPage();

    expect(await screen.findByText('Deactivated')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Activate card' }));

    await waitFor(() => {
      expect(mockUpdateCardStatus).toHaveBeenCalledWith(
        'test-access-token',
        3,
        { status: 'ACTIVE' },
      );
    });
  });

  it('shows an authentication error when closing a card without an access token', async () => {
    mockGetCards.mockResolvedValueOnce([card]);

    const { rerender } = renderCardsPage();

    await screen.findByRole('button', { name: 'Close card permanently' });

    mockAuth.accessToken = null;

    rerender(
      <MemoryRouter>
        <CardsPage />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Close card permanently' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You must be signed in to close a card.',
    );

    expect(mockCloseCard).not.toHaveBeenCalled();
  });

  it('shows an authentication error when changing card status without an access token', async () => {
    mockGetCards.mockResolvedValueOnce([card]);

    const { rerender } = renderCardsPage();

    await screen.findByRole('button', { name: 'Deactivate card' });

    mockAuth.accessToken = null;

    rerender(
      <MemoryRouter>
        <CardsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate card' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You must be signed in to update a card.',
    );

    expect(mockUpdateCardStatus).not.toHaveBeenCalled();
  });

  it('clears the status error after a successful status update', async () => {
    mockGetCards.mockResolvedValueOnce([card]);

    mockUpdateCardStatus
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({
        ...card,
        status: 'INACTIVE',
      });

    renderCardsPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Deactivate card' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Temporary failure',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate card' }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('covers card creation statistics for today, this year, future dates, and invalid dates', async () => {
    const now = new Date();
    const utcDayStart = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const utcYearStart = Date.UTC(now.getUTCFullYear(), 0, 1);
    const future = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const previousYear = new Date(
      Date.UTC(now.getUTCFullYear() - 1, 11, 31, 12),
    ).toISOString();

    mockGetCards.mockResolvedValueOnce([
      { ...card, id: 3, created_at: new Date(utcDayStart).toISOString() },
      { ...card, id: 4, created_at: new Date(utcYearStart).toISOString() },
      { ...card, id: 5, created_at: future },
      { ...card, id: 6, created_at: 'invalid-date' },
      { ...card, id: 7, created_at: previousYear },
    ]);

    renderCardsPage();

    expect(await screen.findByText('5 cards')).toBeInTheDocument();
    expect(screen.getByText('Today: 1 / 3')).toBeInTheDocument();
    expect(screen.getByText('This year: 2 / 20')).toBeInTheDocument();
  });

  it('renders the plural card count when multiple cards exist', async () => {
    mockGetCards.mockResolvedValueOnce([
      { ...card, id: 3, last_four: '4821' },
      { ...card, id: 4, last_four: '7319' },
    ]);

    renderCardsPage();

    expect(await screen.findByText('2 cards')).toBeInTheDocument();
    expect(screen.getByText('•••• 4821')).toBeInTheDocument();
    expect(screen.getByText('•••• 7319')).toBeInTheDocument();
  });

  it('shows the active-card limit when an account has three active cards', async () => {
    mockGetCards.mockResolvedValueOnce([
      { ...card, id: 3, last_four: '4821', status: 'ACTIVE' },
      { ...card, id: 4, last_four: '7319', status: 'ACTIVE' },
      { ...card, id: 5, last_four: '6052', status: 'ACTIVE' },
    ]);

    renderCardsPage();

    expect(await screen.findByText('3 cards')).toBeInTheDocument();
    expect(
      screen.getAllByText('3 of 3 active cards on this account'),
    ).toHaveLength(3);
    expect(screen.getByText('Active per account: max. 3')).toBeInTheDocument();
  });

  it('keeps other cards unchanged when one card is permanently closed', async () => {
    const secondCard: ManagedCard = {
      ...card,
      id: 4,
      last_four: '7319',
      status: 'ACTIVE',
    };

    mockGetCards.mockResolvedValueOnce([card, secondCard]);
    mockCloseCard.mockResolvedValueOnce({
      ...card,
      status: 'CLOSED',
      closed_at: '2026-10-17T10:00:00Z',
    });

    renderCardsPage();

    const closeButtons = await screen.findAllByRole('button', {
      name: 'Close card permanently',
    });
    fireEvent.click(closeButtons[0]);

    expect(await screen.findByText('Permanently closed')).toBeInTheDocument();
    expect(screen.getByText('•••• 7319')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Close card permanently' }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: 'Deactivate card' }),
    ).toHaveLength(1);
    expect(mockCloseCard).toHaveBeenCalledWith('test-access-token', 3);
  });

  it('keeps other cards unchanged when one card status is updated', async () => {
    const secondCard: ManagedCard = {
      ...card,
      id: 4,
      last_four: '7319',
      status: 'ACTIVE',
    };

    mockGetCards.mockResolvedValueOnce([card, secondCard]);
    mockUpdateCardStatus.mockResolvedValueOnce({
      ...card,
      status: 'INACTIVE',
    });

    renderCardsPage();

    const deactivateButtons = await screen.findAllByRole('button', {
      name: 'Deactivate card',
    });
    fireEvent.click(deactivateButtons[0]);

    await waitFor(() => {
      expect(mockUpdateCardStatus).toHaveBeenCalledWith(
        'test-access-token',
        3,
        { status: 'INACTIVE' },
      );
    });

    expect(
      await screen.findByRole('button', { name: 'Activate card' }),
    ).toBeInTheDocument();
    expect(screen.getByText('•••• 7319')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Deactivate card' }),
    ).toHaveLength(1);
  });
});
