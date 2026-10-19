import { useState, type FormEvent } from 'react';

import type { Account } from '../../accounts/api/accounts';
import type { ManagedCard } from '../api/cards';

interface CreateCardDialogProps {
  accounts: Account[];
  cards: ManagedCard[];
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (accountId: number) => Promise<void>;
}

function CreateCardDialog({
  accounts,
  cards,
  isSubmitting,
  error,
  onClose,
  onCreate,
}: CreateCardDialogProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    accounts[0]?.id ?? null,
  );

  const activeCardsForSelectedAccount = cards.filter(
    (card) => card.account_id === selectedAccountId && card.status === 'ACTIVE',
  ).length;
  const hasReachedActiveCardLimit = activeCardsForSelectedAccount >= 3;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedAccountId === null) {
      return;
    }
    await onCreate(selectedAccountId);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/80 p-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="create-card-title"
        aria-modal="true"
        className="my-auto max-h-[calc(100dvh-1rem)] w-full min-w-0 max-w-[32rem] overflow-y-auto overscroll-contain rounded-2xl border border-slate-700 bg-[#0a1827] p-[clamp(0.875rem,4vw,1.75rem)] shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
        role="dialog"
      >
        <div className="flex min-w-0 items-start justify-between gap-3 sm:gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
              Card management
            </p>
            <h2
              id="create-card-title"
              className="mt-2 text-[clamp(1.125rem,4vw,1.25rem)] font-semibold text-white"
            >
              Create virtual card
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Your demo debit card will be linked to the selected financial
              account.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close create card dialog"
            className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            disabled={isSubmitting}
            onClick={onClose}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m6 6 12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <fieldset
            className="space-y-3"
            disabled={isSubmitting || accounts.length === 0}
          >
            <legend className="mb-3 text-sm font-medium text-slate-200">
              Select a financial account
            </legend>
            {accounts.map((account) => {
              const activeCardsForAccount = cards.filter(
                (card) =>
                  card.account_id === account.id && card.status === 'ACTIVE',
              ).length;
              const accountLimitReached = activeCardsForAccount >= 3;

              return (
                <label
                  key={account.id}
                  className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3 transition sm:p-4 ${
                    selectedAccountId === account.id
                      ? 'border-cyan-400/60 bg-cyan-400/5'
                      : 'border-slate-700 bg-slate-900/60 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="account"
                    value={account.id}
                    checked={selectedAccountId === account.id}
                    onChange={() => setSelectedAccountId(account.id)}
                    className="mt-1 accent-cyan-400"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 text-sm font-semibold text-white">
                        Idemerax account ···· {account.account_number.slice(-4)}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-emerald-300">
                        {Number(account.balance).toLocaleString('en-IE', {
                          style: 'currency',
                          currency: 'EUR',
                        })}
                      </span>
                    </span>
                    <span className="mt-1 block break-all font-mono text-xs text-slate-400">
                      {account.iban.replace(/(.{4})/g, '$1 ').trim()}
                    </span>
                    <span
                      className={`mt-2 block text-xs ${accountLimitReached ? 'text-amber-200' : 'text-slate-400'}`}
                    >
                      {activeCardsForAccount} of 3 active cards used on this
                      account
                      {accountLimitReached ? ' · Limit reached' : ''}
                    </span>
                  </span>
                </label>
              );
            })}
            {accounts.length === 0 && (
              <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">
                No financial account is available. Create an account before
                ordering a card.
              </p>
            )}
          </fieldset>

          <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-sm font-semibold text-slate-100">
                Card limits
              </p>
              <p className="text-xs text-slate-400">Resets use UTC</p>
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-800/60 px-3 py-2 sm:block sm:space-y-1">
                <dt className="text-slate-400">New cards per day</dt>
                <dd className="shrink-0 font-semibold tabular-nums text-slate-100">
                  3 max.
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-800/60 px-3 py-2 sm:block sm:space-y-1">
                <dt className="text-slate-400">New cards per year</dt>
                <dd className="shrink-0 font-semibold tabular-nums text-slate-100">
                  20 max.
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-800/60 px-3 py-2 sm:block sm:space-y-1">
                <dt className="text-slate-400">Active per account</dt>
                <dd className="shrink-0 font-semibold tabular-nums text-slate-100">
                  3 max.
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Deactivated and closed cards still count toward daily and yearly
              creation limits.
            </p>
          </div>

          <p className="flex items-start gap-2 text-xs leading-5 text-slate-400">
            <svg
              viewBox="0 0 24 24"
              className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M12 11v5m0-8h.01"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span>
              <span className="font-medium text-slate-300">
                Demo card only.
              </span>{' '}
              No real payments, full card number, or CVV.
            </span>
          </p>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-300"
            >
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-11 w-full rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                selectedAccountId === null ||
                hasReachedActiveCardLimit
              }
              className="min-h-11 w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {isSubmitting
                ? 'Creating card…'
                : hasReachedActiveCardLimit
                  ? 'Active card limit reached'
                  : 'Create virtual card'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default CreateCardDialog;
