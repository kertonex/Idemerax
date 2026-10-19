import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '../../../../src/shared/api/client';
import {
  closeCard,
  createCard,
  getCards,
  updateCardStatus,
} from '../../../../src/features/cards/api/cards';
import type { ManagedCard } from '../../../../src/features/cards/api/cards';

vi.mock('../../../../src/shared/api/client', () => ({
  apiClient: vi.fn(),
}));

const mockApiClient = vi.mocked(apiClient);

const card: ManagedCard = {
  id: 3,
  account_id: 7,
  card_type: 'VIRTUAL_DEBIT',
  last_four: '4821',
  status: 'ACTIVE',
  created_at: '2026-10-16T08:30:00Z',
  closed_at: null,
  account: {
    id: 7,
    account_number: '1234567890',
    iban: 'DE89370400440532013000',
    bic: 'IDEMDEFFXXX',
    balance: '100.0000',
  },
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('cards API', () => {
  it("retrieves the authenticated user's cards", async () => {
    mockApiClient.mockResolvedValue([card]);

    await expect(getCards('access-token')).resolves.toEqual([card]);

    expect(mockApiClient).toHaveBeenCalledWith('/cards', {
      headers: { Authorization: 'Bearer access-token' },
    });
  });

  it('creates a virtual card for the selected account', async () => {
    mockApiClient.mockResolvedValue(card);

    await expect(
      createCard('access-token', { account_id: 7 }),
    ).resolves.toEqual(card);

    expect(mockApiClient).toHaveBeenCalledWith('/cards', {
      method: 'POST',
      headers: { Authorization: 'Bearer access-token' },
      body: { account_id: 7 },
    });
  });

  it('updates a card status', async () => {
    const inactiveCard: ManagedCard = {
      ...card,
      status: 'INACTIVE',
    };

    mockApiClient.mockResolvedValue(inactiveCard);

    await expect(
      updateCardStatus('access-token', 3, { status: 'INACTIVE' }),
    ).resolves.toEqual(inactiveCard);

    expect(mockApiClient).toHaveBeenCalledWith('/cards/3/status', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer access-token' },
      body: { status: 'INACTIVE' },
    });
  });

  it('permanently closes a card', async () => {
    const closedCard: ManagedCard = {
      ...card,
      status: 'CLOSED',
      closed_at: '2026-10-17T10:00:00Z',
    };

    mockApiClient.mockResolvedValue(closedCard);

    await expect(closeCard('access-token', 3)).resolves.toEqual(closedCard);

    expect(mockApiClient).toHaveBeenCalledWith('/cards/3/close', {
      method: 'POST',
      headers: { Authorization: 'Bearer access-token' },
    });
  });

  it('propagates API errors to the caller', async () => {
    const error = new Error('Unable to connect to API');

    mockApiClient.mockRejectedValue(error);

    await expect(getCards('access-token')).rejects.toBe(error);
  });
});
