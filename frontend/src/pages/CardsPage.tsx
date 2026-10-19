import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';

import { getMyAccounts, type Account } from '../features/accounts/api/accounts';
import {
  closeCard,
  createCard,
  getCards,
  updateCardStatus,
  type ManagedCard,
} from '../features/cards/api/cards';
import CreateCardDialog from '../features/cards/components/CreateCardDialog';
import VirtualCard from '../features/cards/components/VirtualCard';
import { useAuth } from '../features/authentication/context/useAuth';

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatMoney(value: string): string {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return '—';
  }

  return amount.toLocaleString('en-IE', {
    style: 'currency',
    currency: 'EUR',
  });
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function CardsPage() {
  const { accessToken, currentUser } = useAuth();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<ManagedCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [updatingCardId, setUpdatingCardId] = useState<number | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const loadCardsPage = useCallback(async () => {
    if (!accessToken) {
      setLoadError('You must be signed in to manage cards.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const [myAccounts, myCards] = await Promise.all([
        getMyAccounts(accessToken),
        getCards(accessToken),
      ]);

      setAccounts(myAccounts);
      setCards(myCards);
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Unable to load your cards.'));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadCardsPage();
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [loadCardsPage]);

  async function handleCreateCard(accountId: number): Promise<void> {
    if (!accessToken) {
      setCreateError('You must be signed in to create a card.');
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const newCard = await createCard(accessToken, {
        account_id: accountId,
      });

      setCards((currentCards) => [newCard, ...currentCards]);
      setIsCreateDialogOpen(false);
    } catch (error) {
      setCreateError(getErrorMessage(error, 'Unable to create your card.'));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleCloseCard(card: ManagedCard): Promise<void> {
    if (!accessToken) {
      setStatusError('You must be signed in to close a card.');
      return;
    }

    const confirmed = window.confirm(
      `Close card ending in ${card.last_four}? This is permanent. The card will remain in your history and cannot be reactivated.`,
    );

    if (!confirmed) {
      return;
    }

    setUpdatingCardId(card.id);
    setStatusError(null);

    try {
      const closedCard = await closeCard(accessToken, card.id);

      setCards((currentCards) =>
        currentCards.map((currentCard) =>
          currentCard.id === closedCard.id ? closedCard : currentCard,
        ),
      );
    } catch (error) {
      setStatusError(getErrorMessage(error, 'Unable to close this card.'));
    } finally {
      setUpdatingCardId(null);
    }
  }

  async function handleStatusChange(card: ManagedCard): Promise<void> {
    if (!accessToken) {
      setStatusError('You must be signed in to update a card.');
      return;
    }

    const nextStatus = card.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    setUpdatingCardId(card.id);
    setStatusError(null);

    try {
      const updatedCard = await updateCardStatus(accessToken, card.id, {
        status: nextStatus,
      });

      setCards((currentCards) =>
        currentCards.map((currentCard) =>
          currentCard.id === updatedCard.id ? updatedCard : currentCard,
        ),
      );
    } catch (error) {
      setStatusError(getErrorMessage(error, 'Unable to update this card.'));
    } finally {
      setUpdatingCardId(null);
    }
  }

  const activeCards = cards.filter((card) => card.status === 'ACTIVE').length;

  const inactiveCards = cards.filter(
    (card) => card.status === 'INACTIVE',
  ).length;

  const closedCards = cards.filter((card) => card.status === 'CLOSED').length;

  const now = new Date();

  const utcDayStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  const utcYearStart = Date.UTC(now.getUTCFullYear(), 0, 1);

  const cardsCreatedToday = cards.filter((card) => {
    const createdAt = new Date(card.created_at).getTime();

    return (
      Number.isFinite(createdAt) &&
      createdAt >= utcDayStart &&
      createdAt <= now.getTime()
    );
  }).length;

  const cardsCreatedThisYear = cards.filter((card) => {
    const createdAt = new Date(card.created_at).getTime();

    return (
      Number.isFinite(createdAt) &&
      createdAt >= utcYearStart &&
      createdAt <= now.getTime()
    );
  }).length;

  const cardholderName = [currentUser?.first_name, currentUser?.last_name]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ');

  if (isLoading) {
    return (
      <section className="min-w-0 space-y-6 pb-8 sm:space-y-8" aria-busy="true">
        <PageHeader showCreate={false} />

        <div className="animate-pulse rounded-2xl border border-slate-800 bg-[#071522] p-6 text-sm text-slate-400">
          Loading your cards…
        </div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="min-w-0 space-y-6 pb-8 sm:space-y-8">
        <PageHeader showCreate={false} />

        <div
          role="alert"
          className="rounded-2xl border border-red-400/20 bg-red-400/5 p-5 text-sm text-red-300"
        >
          <p>{loadError}</p>

          <button
            type="button"
            onClick={() => void loadCardsPage()}
            className="mt-4 rounded-lg border border-red-300/30 px-3 py-2 font-medium transition hover:bg-red-300/10"
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="min-w-0 space-y-6 pb-8 sm:space-y-8">
      <PageHeader
        onCreate={() => {
          setCreateError(null);
          setIsCreateDialogOpen(true);
        }}
        showCreate
      />

      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3 sm:gap-4">
        <SummaryCard
          label="Total cards"
          value={String(cards.length)}
          detail="Your virtual demo cards"
        />

        <SummaryCard
          label="Active cards"
          value={String(activeCards)}
          detail="Ready for demo workflows"
        />

        <SummaryCard
          label="Inactive cards"
          value={String(inactiveCards)}
          detail="Currently switched off"
        />

        <SummaryCard
          label="Closed cards"
          value={String(closedCards)}
          detail="Kept in your history"
        />
      </div>

      <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-200">
            Card creation limits
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-400">
            You can create up to 3 cards per UTC calendar day and 20 per UTC
            calendar year. Each financial account can have up to 3 active cards
            at a time. Deactivated and closed cards still count toward the daily
            and yearly creation limits; only active cards count toward the
            per-account limit.
          </p>
        </div>

        <div className="flex min-w-0 flex-wrap gap-2 lg:shrink-0 lg:justify-end">
          <span className="rounded-lg border border-cyan-300/20 px-3 py-2 text-xs font-semibold text-cyan-100">
            Today: {cardsCreatedToday} / 3
          </span>

          <span className="rounded-lg border border-cyan-300/20 px-3 py-2 text-xs font-semibold text-cyan-100">
            This year: {cardsCreatedThisYear} / 20
          </span>

          <span className="rounded-lg border border-cyan-300/20 px-3 py-2 text-xs font-semibold text-cyan-100">
            Active per account: max. 3
          </span>
        </div>
      </div>

      {statusError && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300"
        >
          {statusError}
        </p>
      )}

      {cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-[#071522]/70 px-4 py-10 text-center sm:px-8 sm:py-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/5 text-cyan-200">
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7"
              fill="none"
              aria-hidden="true"
            >
              <rect
                x="2.5"
                y="4.5"
                width="19"
                height="15"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>

          <h2 className="mt-5 text-lg font-semibold text-white">
            No cards yet
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
            Create a virtual Idemerax demo debit card and link it to your
            financial account. Creating a card does not change your account
            balance.
          </p>

          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setIsCreateDialogOpen(true);
            }}
            className="mt-6 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            Create your first card
          </button>
        </div>
      ) : (
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Your cards</h2>

              <p className="mt-1 text-sm text-slate-400">
                Virtual demo cards linked to your financial account.
              </p>
            </div>

            <span className="text-xs text-slate-500">
              {cards.length} {cards.length === 1 ? 'card' : 'cards'}
            </span>
          </div>

          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] items-start justify-items-start gap-4 sm:gap-6">
            {cards.map((card) => {
              const isUpdating = updatingCardId === card.id;
              const isActive = card.status === 'ACTIVE';
              const isClosed = card.status === 'CLOSED';

              const statusLabel = isActive
                ? 'Active'
                : isClosed
                  ? 'Permanently closed'
                  : 'Deactivated';

              const activeCardsOnAccount = cards.filter(
                (item) =>
                  item.account_id === card.account_id &&
                  item.status === 'ACTIVE',
              ).length;

              return (
                <article
                  key={card.id}
                  className="min-w-0 w-full max-w-md rounded-2xl border border-slate-800 bg-[#071522] p-3 sm:p-5 lg:p-6"
                >
                  <VirtualCard card={card} cardholderName={cardholderName} />

                  <div className="mt-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-white">Card details</h3>

                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                          isActive
                            ? 'bg-emerald-400/10 text-emerald-300'
                            : isClosed
                              ? 'bg-rose-400/10 text-rose-200'
                              : 'bg-slate-700/70 text-slate-300'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isActive
                              ? 'bg-emerald-300'
                              : isClosed
                                ? 'bg-rose-300'
                                : 'bg-slate-400'
                          }`}
                        />

                        {statusLabel}
                      </span>
                    </div>

                    <dl className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-x-3 gap-y-4 rounded-xl border border-slate-800 bg-slate-900/40 p-3 sm:gap-x-4 sm:p-4">
                      <Detail label="Card type" value="Virtual debit" />

                      <Detail
                        label="Card number"
                        value={`•••• ${card.last_four}`}
                        mono
                      />

                      <Detail
                        label="Created"
                        value={formatDate(card.created_at)}
                      />

                      <Detail
                        label="Account balance"
                        value={formatMoney(card.account.balance)}
                      />
                    </dl>

                    <div className="rounded-xl border border-slate-800 p-4">
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-cyan-200">
                          <svg
                            viewBox="0 0 24 24"
                            className="h-5 w-5"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M3 9.5 12 4l9 5.5M5 10v8m4-8v8m6-8v8m4-8v8M3 20h18"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white">
                            Linked financial account
                          </p>

                          <p className="mt-1 text-xs text-slate-400">
                            Account ···· {card.account.account_number.slice(-4)}
                          </p>

                          <p className="mt-2 break-all font-mono text-xs text-slate-300">
                            {card.account.iban}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            BIC {card.account.bic}
                          </p>

                          <p
                            className={`mt-2 text-xs font-medium ${
                              activeCardsOnAccount >= 3
                                ? 'text-amber-200'
                                : 'text-emerald-200'
                            }`}
                          >
                            {activeCardsOnAccount} of 3 active cards on this
                            account
                          </p>
                        </div>

                        <Link
                          to="/accounts"
                          className="self-start text-xs font-medium text-cyan-300 transition hover:text-cyan-200 sm:ml-auto sm:shrink-0"
                        >
                          View account
                        </Link>
                      </div>
                    </div>

                    {!isClosed && (
                      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => void handleStatusChange(card)}
                          disabled={isUpdating}
                          className={`w-full rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            isActive
                              ? 'border-rose-400/30 text-rose-200 hover:bg-rose-400/10'
                              : 'border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/10'
                          }`}
                        >
                          {isUpdating
                            ? 'Updating card…'
                            : isActive
                              ? 'Deactivate card'
                              : 'Activate card'}
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleCloseCard(card)}
                          disabled={isUpdating}
                          className="w-full rounded-xl border border-rose-400/30 px-4 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isUpdating
                            ? 'Processing…'
                            : 'Close card permanently'}
                        </button>
                      </div>
                    )}

                    {isClosed && (
                      <p className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-sm text-rose-200">
                        This card is permanently closed and retained for your
                        history. It cannot be reactivated.
                        {card.closed_at
                          ? ` Closed on ${formatDate(card.closed_at)}.`
                          : ''}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-4 text-xs leading-5 text-slate-500">
        Demo only: these virtual cards are not payment instruments. No full card
        number or CVV is stored, and card management does not initiate payments
        or change account balances.
      </div>

      {isCreateDialogOpen && (
        <CreateCardDialog
          accounts={accounts}
          cards={cards}
          isSubmitting={isCreating}
          error={createError}
          onClose={() => setIsCreateDialogOpen(false)}
          onCreate={handleCreateCard}
        />
      )}
    </section>
  );
}

function PageHeader({
  onCreate,
  showCreate,
}: {
  onCreate?: () => void;
  showCreate: boolean;
}) {
  return (
    <header className="flex min-w-0 flex-col justify-between gap-4 sm:gap-5 md:flex-row md:items-end">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          Card management
        </p>

        <h1 className="mt-2 text-[clamp(1.75rem,5vw,2.25rem)] font-semibold tracking-tight text-white">
          Cards
        </h1>

        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
          Create and manage virtual demo debit cards linked to your Idemerax
          account.
        </p>
      </div>

      {showCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 sm:w-auto md:shrink-0"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          Create card
        </button>
      )}
    </header>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-800 bg-[#071522] p-4 sm:p-5">
      <p className="text-sm text-slate-400">{label}</p>

      <p className="mt-3 text-[clamp(1.5rem,5vw,1.875rem)] font-semibold tracking-tight text-white">
        {value}
      </p>

      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>

      <dd
        className={`mt-1 break-words text-sm font-medium text-slate-200 ${
          mono ? 'font-mono tracking-wider' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export default CardsPage;
