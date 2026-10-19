import { apiClient } from '../../../shared/api/client';

export type CardStatus = 'ACTIVE' | 'INACTIVE' | 'CLOSED';
export type MutableCardStatus = Extract<CardStatus, 'ACTIVE' | 'INACTIVE'>;
export type CardType = 'VIRTUAL_DEBIT';

export type CardAccountSummary = {
  id: number;
  account_number: string;
  iban: string;
  bic: string;
  balance: string;
};

export type ManagedCard = {
  id: number;
  account_id: number;
  card_type: CardType;
  last_four: string;
  status: CardStatus;
  created_at: string;
  closed_at: string | null;
  account: CardAccountSummary;
};

export type CreateCardRequest = {
  account_id: number;
};

export type UpdateCardStatusRequest = {
  status: MutableCardStatus;
};

/** Retrieve virtual demo cards linked to the authenticated user's accounts. */
export function getCards(accessToken: string): Promise<ManagedCard[]> {
  return apiClient<ManagedCard[]>('/cards', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

/** Create a virtual demo debit card for one of the user's own accounts. */
export function createCard(
  accessToken: string,
  request: CreateCardRequest,
): Promise<ManagedCard> {
  return apiClient<ManagedCard>('/cards', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: request,
  });
}

/** Activate or deactivate a card owned by the authenticated user. */
export function updateCardStatus(
  accessToken: string,
  cardId: number,
  request: UpdateCardStatusRequest,
): Promise<ManagedCard> {
  return apiClient<ManagedCard>(`/cards/${cardId}/status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: request,
  });
}

/** Permanently close a card while retaining its history. */
export function closeCard(
  accessToken: string,
  cardId: number,
): Promise<ManagedCard> {
  return apiClient<ManagedCard>(`/cards/${cardId}/close`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
