import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import VirtualCard from '../../../../src/features/cards/components/VirtualCard';
import type { ManagedCard } from '../../../../src/features/cards/api/cards';

const baseCard: ManagedCard = {
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

describe('VirtualCard', () => {
  it('renders the active card with masked number and cardholder details', () => {
    render(<VirtualCard card={baseCard} cardholderName="Max Mustermann" />);

    expect(screen.getByRole('img', { name: 'Idemerax' })).toBeInTheDocument();
    expect(screen.getByText('Idemerax')).toBeInTheDocument();
    expect(screen.getByText('Virtual debit · Demo')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.getByText('Cardholder')).toBeInTheDocument();
    expect(screen.getByText('Demo only')).toBeInTheDocument();
    expect(screen.getByText('Not a payment instrument')).toBeInTheDocument();

    expect(
      screen.getByLabelText('Card number ending in 4821'),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText('Virtual demo debit card ending in 4821, active'),
    ).toBeInTheDocument();

    expect(screen.getAllByText('••••')).toHaveLength(3);
    expect(screen.getByText('4821')).toBeInTheDocument();

    expect(screen.queryByText('INACTIVE')).not.toBeInTheDocument();
    expect(screen.queryByText('CLOSED')).not.toBeInTheDocument();

    expect(screen.queryByText('1234567890')).not.toBeInTheDocument();
    expect(
      screen.queryByText('DE89370400440532013000'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('IDEMDEFFXXX')).not.toBeInTheDocument();
  });

  it('uses the fallback cardholder name when the name is empty', () => {
    render(<VirtualCard card={baseCard} cardholderName="" />);

    expect(screen.getByText('Idemerax User')).toBeInTheDocument();
  });

  it('renders the inactive card state and its overlay', () => {
    const inactiveCard: ManagedCard = {
      ...baseCard,
      status: 'INACTIVE',
    };

    render(<VirtualCard card={inactiveCard} cardholderName="Max Mustermann" />);

    expect(
      screen.getByLabelText('Virtual demo debit card ending in 4821, inactive'),
    ).toBeInTheDocument();

    expect(screen.getAllByText('INACTIVE')).toHaveLength(2);
    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.queryByText('CLOSED')).not.toBeInTheDocument();
  });

  it('renders the closed card state and its overlay', () => {
    const closedCard: ManagedCard = {
      ...baseCard,
      status: 'CLOSED',
      closed_at: '2026-10-18T12:00:00Z',
    };

    render(<VirtualCard card={closedCard} cardholderName="Max Mustermann" />);

    expect(
      screen.getByLabelText('Virtual demo debit card ending in 4821, closed'),
    ).toBeInTheDocument();

    expect(screen.getAllByText('CLOSED')).toHaveLength(2);
    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.queryByText('INACTIVE')).not.toBeInTheDocument();
  });

  it('applies the active card styling', () => {
    render(<VirtualCard card={baseCard} cardholderName="Max Mustermann" />);

    const card = screen.getByLabelText(
      'Virtual demo debit card ending in 4821, active',
    );

    expect(card).toHaveClass('relative');
    expect(card).toHaveClass('isolate');
    expect(card).toHaveClass('flex');
    expect(card).toHaveClass('w-full');
    expect(card).toHaveClass('min-w-0');
    expect(card).toHaveClass('overflow-hidden');
    expect(card).toHaveClass('rounded-2xl');
    expect(card).toHaveClass('border-emerald-300/40', 'bg-gradient-to-br');
    expect(card).toHaveClass('sm:aspect-[1.586/1]');

    expect(
      card.querySelector('.animate-pulse.bg-emerald-300'),
    ).toBeInTheDocument();
  });

  it('applies inactive styling and does not show the active pulse indicator', () => {
    const inactiveCard: ManagedCard = {
      ...baseCard,
      status: 'INACTIVE',
    };

    render(<VirtualCard card={inactiveCard} cardholderName="Max Mustermann" />);

    const card = screen.getByLabelText(
      'Virtual demo debit card ending in 4821, inactive',
    );

    expect(card).toHaveClass('border-amber-200/40');
    expect(card).toHaveClass('saturate-50');
    expect(
      card.querySelector('.animate-pulse.bg-emerald-300'),
    ).not.toBeInTheDocument();

    expect(card.querySelector('.bg-amber-300')).toBeInTheDocument();
  });

  it('applies closed styling and the closed indicator', () => {
    const closedCard: ManagedCard = {
      ...baseCard,
      status: 'CLOSED',
      closed_at: '2026-10-18T12:00:00Z',
    };

    render(<VirtualCard card={closedCard} cardholderName="Max Mustermann" />);

    const card = screen.getByLabelText(
      'Virtual demo debit card ending in 4821, closed',
    );

    expect(card).toHaveClass('border-rose-300/40');
    expect(card).toHaveClass('grayscale-[0.65]');
    expect(card).toHaveClass('opacity-90');

    expect(card.querySelector('.bg-rose-300')).toBeInTheDocument();
  });

  it('renders the card without exposing full account details', () => {
    render(<VirtualCard card={baseCard} cardholderName="Max Mustermann" />);

    expect(screen.queryByText(baseCard.account.account_number)).toBeNull();
    expect(screen.queryByText(baseCard.account.iban)).toBeNull();
    expect(screen.queryByText(baseCard.account.bic)).toBeNull();

    expect(screen.getByText('Not a payment instrument')).toBeInTheDocument();
  });
});
